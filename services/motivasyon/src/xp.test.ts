import { uuidv7 } from 'uuidv7';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { T0, dk, olay, ortamKur, sn, yeniSenaryo, type Ortam, type Senaryo } from './test/ortam.js';
import { dbYok } from './test/yardimcilar.js';
import {
  denemeIsle,
  geriBildirimIsle,
  kayitIzlendiIsle,
  odevIncelendiIsle,
  odevTeslimIsle,
  planGoreviIsle,
  soruCozulduIsle,
  soruSorildiIsle,
  yoklamaIsle,
} from './xp-tuketici.js';

/** XP kurallari, tavanlar, ters kayit, gun siniri, modul durumu, seviye ve rozet (gercek PostgreSQL). */
describe.skipIf(dbYok())('XP tuketicisi (gercek PostgreSQL, motivasyon_app)', () => {
  let o: Ortam;

  beforeAll(() => {
    o = ortamKur();
  });
  afterAll(async () => {
    await o.kapat();
  });

  const durum = async (s: Senaryo) =>
    (
      await o.sistem<
        { toplam_xp: number; seviye: number; bu_hafta_xp: number; pasif: number }[]
      >`select toplam_xp::int, seviye, bu_hafta_xp, pasif_olay_sayisi as pasif
          from motivasyon.ogrenci_durumlari where kurum_id = ${s.kurumId} and ogrenci_id = ${s.ogrenciId}`
    )[0];
  const hareketler = (s: Senaryo, kural?: string) =>
    o.sistem<{ xp: number; kural_kodu: string; kismi: boolean; gun: string }[]>`
      select xp, kural_kodu, kismi, gun::text from motivasyon.xp_hareketleri
       where kurum_id = ${s.kurumId} and ogrenci_id = ${s.ogrenciId}
         and (${kural ?? null}::text is null or kural_kodu = ${kural ?? null})
       order by created_at, id`;
  const cikanOlaylar = async (s: Senaryo, tur: string) =>
    (
      await o.sistem<{ payload: { data: Record<string, unknown> } }[]>`
        select payload from ortak.outbox where kurum_id = ${s.kurumId} and subject = ${`evt.${tur}.v1`}
         order by created_at, id`
    ).map((r) => r.payload.data);
  const sayac = async (s: Senaryo, kod: string) =>
    (
      await o.sistem<{ deger: number }[]>`
        select deger::int from motivasyon.ogrenci_sayaclari
         where ogrenci_id = ${s.ogrenciId} and sayac_kodu = ${kod}`
    )[0]?.deger ?? 0;
  const aktivite = async (s: Senaryo) =>
    await o.sistem<{ gun: string; plan: number; odev: number; anladim: number }[]>`
        select gun::text, plan_gorevi_sayisi plan, odev_teslim_sayisi odev, soru_anladim_sayisi anladim
          from motivasyon.ogrenci_gunluk_aktivite where ogrenci_id = ${s.ogrenciId} order by gun`;
  const tavan = async (s: Senaryo, grup: string) =>
    (
      await o.sistem<{ toplam: number }[]>`
        select toplam from motivasyon.xp_gunluk_toplamlari
         where ogrenci_id = ${s.ogrenciId} and tavan_grubu = ${grup}`
    )[0]?.toplam ?? 0;

  describe('yoklama', () => {
    it('geldi 20 XP verir, seviye 2 olur ve seviye.atladi yayimlanir; ayni olay iki kez tek XP', async () => {
      const s = yeniSenaryo();
      const yoklamaId = uuidv7();
      const e = olay.yoklama(s, { at: T0, durum: 'geldi', yoklamaId, surum: 1 });
      await o.isle(s.kurumId, (tx) => yoklamaIsle(tx, e));
      await o.isle(s.kurumId, (tx) => yoklamaIsle(tx, e));
      expect(await durum(s)).toMatchObject({ toplam_xp: 20, seviye: 2, bu_hafta_xp: 20 });
      expect(await hareketler(s)).toHaveLength(1);
      expect(await cikanOlaylar(s, 'motivasyon.seviye.atladi')).toEqual([
        { ogrenci_id: s.ogrenciId, eski_seviye: 1, yeni_seviye: 2, toplam_xp: 20 },
      ]);
      expect(await sayac(s, 'toplam_yoklama')).toBe(1);
    });

    it('gec de 20 XP; gelmedi XP vermez; geldi -> gec XP etkisizdir', async () => {
      const s = yeniSenaryo();
      const a = uuidv7();
      await o.isle(s.kurumId, (tx) =>
        yoklamaIsle(tx, olay.yoklama(s, { at: T0, durum: 'gelmedi', yoklamaId: a, surum: 1 })),
      );
      expect(await hareketler(s)).toHaveLength(0);
      await o.isle(s.kurumId, (tx) =>
        yoklamaIsle(tx, olay.yoklama(s, { at: dk(T0, 1), durum: 'gec', yoklamaId: a, surum: 2 })),
      );
      expect((await hareketler(s)).map((h) => h.xp)).toEqual([20]);
      await o.isle(s.kurumId, (tx) =>
        yoklamaIsle(tx, olay.yoklama(s, { at: dk(T0, 2), durum: 'geldi', yoklamaId: a, surum: 3 })),
      );
      expect((await hareketler(s)).map((h) => h.xp)).toEqual([20]);
      expect(await sayac(s, 'toplam_yoklama')).toBe(1);
    });

    it('geldi -> izinli ters kayit, izinli -> geldi yeniden kazanim; seviye dusmez ve olay tekrarlanmaz', async () => {
      const s = yeniSenaryo();
      const a = uuidv7();
      const yaz = (durumu: 'geldi' | 'izinli', surum: number, dakika: number) =>
        o.isle(s.kurumId, (tx) =>
          yoklamaIsle(
            tx,
            olay.yoklama(s, { at: dk(T0, dakika), durum: durumu, yoklamaId: a, surum }),
          ),
        );
      await yaz('geldi', 1, 0);
      expect(await durum(s)).toMatchObject({ toplam_xp: 20, seviye: 2 });
      await yaz('izinli', 2, 1);
      expect(await durum(s)).toMatchObject({ toplam_xp: 0, seviye: 2, bu_hafta_xp: 0 });
      expect(await tavan(s, 'genel')).toBe(0);
      expect(await sayac(s, 'toplam_yoklama')).toBe(0);
      await yaz('geldi', 3, 2);
      expect(await durum(s)).toMatchObject({ toplam_xp: 20, seviye: 2 });
      expect((await hareketler(s)).map((h) => h.xp)).toEqual([20, -20, 20]);
      // seviye 2 icin tek olay: ters kayittan sonra yeniden kazanimda seviye atlama yok
      expect(await cikanOlaylar(s, 'motivasyon.seviye.atladi')).toHaveLength(1);
      // eski olay (surum 2) yok sayilir
      await yaz('izinli', 2, 3);
      expect(await durum(s)).toMatchObject({ toplam_xp: 20 });
      expect((await hareketler(s)).map((h) => h.xp)).toEqual([20, -20, 20]);
    });

    it('ters kayit orijinal gunun tavanindan dusurur; defter degistirilemez', async () => {
      const s = yeniSenaryo();
      const a = uuidv7();
      await o.isle(s.kurumId, (tx) =>
        yoklamaIsle(tx, olay.yoklama(s, { at: T0, durum: 'geldi', yoklamaId: a, surum: 1 })),
      );
      expect(await tavan(s, 'genel')).toBe(20);
      // ertesi gun izinliye cevrildi: orijinal gun (10 Kasim) sayaci duser, XP defterine negatif satir
      await o.isle(s.kurumId, (tx) =>
        yoklamaIsle(
          tx,
          olay.yoklama(s, { at: dk(T0, 24 * 60), durum: 'izinli', yoklamaId: a, surum: 2 }),
        ),
      );
      expect(await tavan(s, 'genel')).toBe(0);
      const h = await hareketler(s);
      expect(h.map((x) => [x.xp, x.gun])).toEqual([
        [20, '2026-11-10'],
        [-20, '2026-11-10'],
      ]);
      await expect(
        o.owner`update motivasyon.xp_hareketleri set xp = 1 where ogrenci_id = ${s.ogrenciId}`,
      ).rejects.toThrow(/defter_degistirilemez/);
      await expect(
        o.owner`delete from motivasyon.xp_hareketleri where ogrenci_id = ${s.ogrenciId}`,
      ).rejects.toThrow(/defter_degistirilemez/);
    });

    it('brans becerisini besler, ters kayit azaltir', async () => {
      const s = yeniSenaryo();
      const a = uuidv7();
      const beceri = async () =>
        (
          await o.sistem<{ puan: number }[]>`
            select puan from motivasyon.beceri_puanlari
             where ogrenci_id = ${s.ogrenciId} and beceri_kodu = 'sayisal'`
        )[0]?.puan;
      await o.isle(s.kurumId, (tx) =>
        yoklamaIsle(tx, olay.yoklama(s, { at: T0, durum: 'geldi', yoklamaId: a, surum: 1 })),
      );
      expect(await beceri()).toBe(20);
      await o.isle(s.kurumId, (tx) =>
        yoklamaIsle(
          tx,
          olay.yoklama(s, { at: dk(T0, 1), durum: 'izinli', yoklamaId: a, surum: 2 }),
        ),
      );
      expect(await beceri()).toBe(0);
    });
  });

  describe('odev', () => {
    it('teslim 15, gec teslim 7 (yarisi asagi yuvarlanir), yeniden teslim XP vermez, onay 10', async () => {
      const s = yeniSenaryo();
      const zamanli = uuidv7();
      const gec = uuidv7();
      await o.isle(s.kurumId, (tx) =>
        odevTeslimIsle(tx, olay.odevTeslim(s, { at: T0, odevId: zamanli })),
      );
      await o.isle(s.kurumId, (tx) =>
        odevTeslimIsle(tx, olay.odevTeslim(s, { at: dk(T0, 1), odevId: gec, gec: true })),
      );
      expect((await hareketler(s, 'odev_teslim')).map((h) => h.xp)).toEqual([15, 7]);
      // ayni odevi yeniden teslim (bayrakli ve bayraksiz) XP/sayac vermez
      await o.isle(s.kurumId, (tx) =>
        odevTeslimIsle(tx, olay.odevTeslim(s, { at: dk(T0, 2), odevId: zamanli, yeniden: true })),
      );
      await o.isle(s.kurumId, (tx) =>
        odevTeslimIsle(tx, olay.odevTeslim(s, { at: dk(T0, 3), odevId: zamanli })),
      );
      expect(await hareketler(s, 'odev_teslim')).toHaveLength(2);
      expect(await sayac(s, 'toplam_odev_teslim')).toBe(2);
      expect((await aktivite(s))[0]?.odev).toBe(2);
      // onay: yalniz tamam, ayni odev ikinci kez XP vermez
      await o.isle(s.kurumId, (tx) =>
        odevIncelendiIsle(
          tx,
          olay.odevIncelendi(s, { at: dk(T0, 5), odevId: zamanli, sonuc: 'eksik' }),
        ),
      );
      expect(await hareketler(s, 'odev_onay')).toHaveLength(0);
      await o.isle(s.kurumId, (tx) =>
        odevIncelendiIsle(tx, olay.odevIncelendi(s, { at: dk(T0, 6), odevId: zamanli })),
      );
      await o.isle(s.kurumId, (tx) =>
        odevIncelendiIsle(tx, olay.odevIncelendi(s, { at: dk(T0, 7), odevId: zamanli })),
      );
      expect((await hareketler(s, 'odev_onay')).map((h) => h.xp)).toEqual([10]);
    });

    it('rozet: 5 odevde odev_bronz tek kez kazanilir, olay tek, kozmetik acilir', async () => {
      const s = yeniSenaryo();
      for (let i = 0; i < 7; i++) {
        await o.isle(s.kurumId, (tx) =>
          odevTeslimIsle(tx, olay.odevTeslim(s, { at: dk(T0, i), soru: 40 })),
        );
      }
      const rozetler = await o.sistem<{ rozet_kodu: string }[]>`
        select rozet_kodu from motivasyon.ogrenci_rozetleri where ogrenci_id = ${s.ogrenciId} order by rozet_kodu`;
      // 7 odev (5 esigi), 280 cozulen soru (100 esigi)
      expect(rozetler.map((r) => r.rozet_kodu)).toEqual(['odev_bronz', 'soru_cozum_bronz']);
      const olaylar = await cikanOlaylar(s, 'motivasyon.rozet.kazanildi');
      expect(olaylar.map((e) => e.rozet_kodu).sort()).toEqual(['odev_bronz', 'soru_cozum_bronz']);
      const koz = await o.sistem<{ kozmetik_kodu: string }[]>`
        select kozmetik_kodu from motivasyon.ogrenci_kozmetikleri where ogrenci_id = ${s.ogrenciId}`;
      expect(koz.map((k) => k.kozmetik_kodu)).toContain('aksesuar_kitap');
    });
  });

  describe('plan gorevi, odak ve supheli orunti', () => {
    it('5 XP, ayni gorev tekrar XP vermez; tamamdan cikinca aktivite sayaci azalir', async () => {
      const s = yeniSenaryo();
      const g = uuidv7();
      await o.isle(s.kurumId, (tx) =>
        planGoreviIsle(tx, olay.plan(s, { at: T0, gorevId: g, durum: 'tamam' })),
      );
      expect((await aktivite(s))[0]?.plan).toBe(1);
      await o.isle(s.kurumId, (tx) =>
        planGoreviIsle(tx, olay.plan(s, { at: dk(T0, 1), gorevId: g, durum: 'bekliyor' })),
      );
      expect((await aktivite(s))[0]?.plan).toBe(0);
      await o.isle(s.kurumId, (tx) =>
        planGoreviIsle(tx, olay.plan(s, { at: dk(T0, 2), gorevId: g, durum: 'tamam' })),
      );
      expect((await aktivite(s))[0]?.plan).toBe(1);
      expect((await hareketler(s)).map((h) => h.xp)).toEqual([5]);
      // eski olay (zamani geride) yok sayilir
      await o.isle(s.kurumId, (tx) =>
        planGoreviIsle(tx, olay.plan(s, { at: T0, gorevId: g, durum: 'bekliyor' })),
      );
      expect((await aktivite(s))[0]?.plan).toBe(1);
    });

    it('plan tavani 40: dokuzuncu gorev XP vermez; kismi yok (5 x 8)', async () => {
      const s = yeniSenaryo();
      for (let i = 0; i < 9; i++) {
        await o.isle(s.kurumId, (tx) =>
          planGoreviIsle(
            tx,
            olay.plan(s, { at: dk(T0, i * 2), gorevId: uuidv7(), durum: 'tamam' }),
          ),
        );
      }
      expect((await hareketler(s)).map((h) => h.xp)).toEqual([5, 5, 5, 5, 5, 5, 5, 5]);
      expect(await tavan(s, 'plan')).toBe(40);
      expect((await aktivite(s))[0]?.plan).toBe(9);
    });

    it('supheli orunti: pencerede esigi asan tamamlamalar XP almaz (esik ayardan)', async () => {
      const s = yeniSenaryo();
      await o.owner`update motivasyon.motivasyon_ayarlari set deger = '3' where anahtar = 'supheli.plan_gorevi_esik'`;
      try {
        for (let i = 0; i < 5; i++) {
          await o.isle(s.kurumId, (tx) =>
            planGoreviIsle(
              tx,
              olay.plan(s, { at: sn(T0, i * 5), gorevId: uuidv7(), durum: 'tamam' }),
            ),
          );
        }
        // 3 gorev XP aldi; 4. ve 5. 60 sn icinde esigi asti
        expect((await hareketler(s)).map((h) => h.xp)).toEqual([5, 5, 5]);
        // pencere disinda (5 dk sonra) yeniden XP alir
        await o.isle(s.kurumId, (tx) =>
          planGoreviIsle(tx, olay.plan(s, { at: dk(T0, 10), gorevId: uuidv7(), durum: 'tamam' })),
        );
        expect((await hareketler(s)).map((h) => h.xp)).toEqual([5, 5, 5, 5]);
      } finally {
        await o.owner`update motivasyon.motivasyon_ayarlari set deger = '10' where anahtar = 'supheli.plan_gorevi_esik'`;
      }
    });
  });

  describe('soru, geri bildirim, kayit', () => {
    it('soru tavani 20 ve kismi kazanim', async () => {
      const s = yeniSenaryo();
      for (let i = 0; i < 6; i++) {
        await o.isle(s.kurumId, (tx) => soruSorildiIsle(tx, olay.soruSorildi(s, dk(T0, i))));
      }
      expect(await tavan(s, 'soru')).toBe(18); // 6 x 3
      await o.isle(s.kurumId, (tx) => soruCozulduIsle(tx, olay.soruCozuldu(s, dk(T0, 10))));
      const h = await hareketler(s, 'soru_anladim');
      expect(h).toMatchObject([{ xp: 2, kismi: true }]); // 20 - 18
      await o.isle(s.kurumId, (tx) => soruCozulduIsle(tx, olay.soruCozuldu(s, dk(T0, 11))));
      expect(await hareketler(s, 'soru_anladim')).toHaveLength(1); // tavan doldu
      expect(await tavan(s, 'soru')).toBe(20);
      expect(await sayac(s, 'toplam_soru')).toBe(6);
      expect(await sayac(s, 'toplam_anladim')).toBe(2);
      expect((await aktivite(s))[0]?.anladim).toBe(2);
    });

    it('ayni soru yeniden cozulunce ikinci odul ve sayac yok', async () => {
      const s = yeniSenaryo();
      const q = uuidv7();
      await o.isle(s.kurumId, (tx) => soruCozulduIsle(tx, olay.soruCozuldu(s, T0, q)));
      await o.isle(s.kurumId, (tx) => soruCozulduIsle(tx, olay.soruCozuldu(s, dk(T0, 5), q)));
      expect(await hareketler(s, 'soru_anladim')).toHaveLength(1);
      expect(await sayac(s, 'toplam_anladim')).toBe(1);
    });

    it('geri bildirim 2 XP; kayit izleme 5 XP (tavan 15, ayni kaynak bir kez)', async () => {
      const s = yeniSenaryo();
      await o.isle(s.kurumId, (tx) => geriBildirimIsle(tx, olay.geriBildirim(s, T0)));
      expect((await hareketler(s, 'geri_bildirim')).map((h) => h.xp)).toEqual([2]);
      const k = uuidv7();
      await o.isle(s.kurumId, (tx) => kayitIzlendiIsle(tx, olay.kayitIzlendi(s, T0, k)));
      await o.isle(s.kurumId, (tx) => kayitIzlendiIsle(tx, olay.kayitIzlendi(s, dk(T0, 1), k)));
      for (let i = 0; i < 4; i++) {
        await o.isle(s.kurumId, (tx) => kayitIzlendiIsle(tx, olay.kayitIzlendi(s, dk(T0, 2 + i))));
      }
      // 5 farkli kaynak: 5+5+5 = 15 tavan; ucuncuden sonrasi yok
      expect((await hareketler(s, 'kayit_izledi')).map((h) => h.xp)).toEqual([5, 5, 5]);
      expect(await sayac(s, 'toplam_kayit_izleme')).toBe(5);
    });
  });

  describe('deneme ve net artisi', () => {
    it('ilk deneme 10 XP (artis 0); sonra artis x 5; deneme basina en cok 50', async () => {
      const s = yeniSenaryo();
      await o.isle(s.kurumId, (tx) =>
        denemeIsle(tx, olay.deneme(s, { at: T0, net: 50, tarih: '2026-10-01' })),
      );
      expect((await hareketler(s)).map((h) => [h.kural_kodu, h.xp])).toEqual([
        ['deneme_girisi', 10],
      ]);
      // onceki ortalama 50, yeni 56.5 -> artis 6.5 -> floor(32.5) = 32
      await o.isle(s.kurumId, (tx) =>
        denemeIsle(tx, olay.deneme(s, { at: dk(T0, 1), net: 56.5, tarih: '2026-10-15' })),
      );
      expect((await hareketler(s, 'deneme_net_artisi')).map((h) => h.xp)).toEqual([32]);
      // onceki 3: 50, 56.5 -> ortalama 53.25; 110 -> artis 56.75 -> 283 -> sinir 50
      await o.isle(s.kurumId, (tx) =>
        denemeIsle(tx, olay.deneme(s, { at: dk(T0, 2), net: 110, tarih: '2026-11-01' })),
      );
      expect((await hareketler(s, 'deneme_net_artisi')).map((h) => h.xp)).toEqual([32, 50]);
      // dusus: artis 0, yalniz giris XP'si
      await o.isle(s.kurumId, (tx) =>
        denemeIsle(tx, olay.deneme(s, { at: dk(T0, 3), net: 10, tarih: '2026-11-05' })),
      );
      expect(await hareketler(s, 'deneme_net_artisi')).toHaveLength(2);
      expect(await hareketler(s, 'deneme_girisi')).toHaveLength(4);
      expect(await sayac(s, 'toplam_deneme')).toBe(4);
      expect(await sayac(s, 'net_artisi_deneme')).toBe(2);
      expect(await sayac(s, 'toplam_net_artisi')).toBe(6 + 56);
    });

    it('farkli sinav turu ayri gecmistir; ayni deneme iki kez XP vermez', async () => {
      const s = yeniSenaryo();
      const id = uuidv7();
      await o.isle(s.kurumId, (tx) =>
        denemeIsle(tx, olay.deneme(s, { at: T0, net: 40, tarih: '2026-10-01', kural: 'tyt' })),
      );
      await o.isle(s.kurumId, (tx) =>
        denemeIsle(
          tx,
          olay.deneme(s, {
            at: dk(T0, 1),
            net: 60,
            tarih: '2026-10-10',
            kural: 'ayt',
            denemeId: id,
          }),
        ),
      );
      await o.isle(s.kurumId, (tx) =>
        denemeIsle(
          tx,
          olay.deneme(s, {
            at: dk(T0, 2),
            net: 60,
            tarih: '2026-10-10',
            kural: 'ayt',
            denemeId: id,
          }),
        ),
      );
      expect(await hareketler(s, 'deneme_net_artisi')).toHaveLength(0);
      expect(await hareketler(s, 'deneme_girisi')).toHaveLength(2);
    });
  });

  describe('gunluk genel tavan', () => {
    it('300 XP genel tavan: kismi kazanim sonra 0', async () => {
      const s = yeniSenaryo();
      for (let i = 0; i < 14; i++) {
        await o.isle(s.kurumId, (tx) =>
          yoklamaIsle(
            tx,
            olay.yoklama(s, { at: dk(T0, i), durum: 'geldi', yoklamaId: uuidv7(), surum: 1 }),
          ),
        );
      }
      expect(await tavan(s, 'genel')).toBe(280);
      const odev = uuidv7();
      await o.isle(s.kurumId, (tx) =>
        odevTeslimIsle(tx, olay.odevTeslim(s, { at: dk(T0, 20), odevId: odev })),
      );
      await o.isle(s.kurumId, (tx) =>
        odevIncelendiIsle(tx, olay.odevIncelendi(s, { at: dk(T0, 21), odevId: odev })),
      );
      const son = (await hareketler(s)).slice(-2);
      expect(son).toMatchObject([
        { kural_kodu: 'odev_teslim', xp: 15, kismi: false },
        { kural_kodu: 'odev_onay', xp: 5, kismi: true }, // 295 + 10 -> 300
      ]);
      await o.isle(s.kurumId, (tx) => geriBildirimIsle(tx, olay.geriBildirim(s, dk(T0, 30))));
      expect(await hareketler(s)).toHaveLength(16);
      expect((await durum(s))?.toplam_xp).toBe(300);
      // ertesi gun yeniden kazanilir
      await o.isle(s.kurumId, (tx) => geriBildirimIsle(tx, olay.geriBildirim(s, dk(T0, 24 * 60))));
      expect((await durum(s))?.toplam_xp).toBe(302);
    });

    it('tavan ayardan degisir (genel 30): 20 + 15 -> 10 kismi', async () => {
      const s = yeniSenaryo();
      await o.owner`update motivasyon.xp_tavanlari set gunluk_ust_sinir = 30 where kod = 'genel'`;
      try {
        await o.isle(s.kurumId, (tx) =>
          yoklamaIsle(
            tx,
            olay.yoklama(s, { at: T0, durum: 'geldi', yoklamaId: uuidv7(), surum: 1 }),
          ),
        );
        await o.isle(s.kurumId, (tx) => odevTeslimIsle(tx, olay.odevTeslim(s, { at: dk(T0, 1) })));
        expect(await hareketler(s)).toMatchObject([{ xp: 20 }, { xp: 10, kismi: true }]);
      } finally {
        await o.owner`update motivasyon.xp_tavanlari set gunluk_ust_sinir = 300 where kod = 'genel'`;
      }
    });

    it('eszamanli olaylarda tavan asilmaz (ogrenci kilidi)', async () => {
      const s = yeniSenaryo();
      await Promise.all(
        Array.from({ length: 20 }, (_, i) =>
          o.isle(s.kurumId, (tx) =>
            yoklamaIsle(
              tx,
              olay.yoklama(s, { at: dk(T0, i), durum: 'geldi', yoklamaId: uuidv7(), surum: 1 }),
            ),
          ),
        ),
      );
      expect((await durum(s))?.toplam_xp).toBe(300);
      expect(await tavan(s, 'genel')).toBe(300);
    });
  });

  describe('gun siniri (04:00) ve saat dilimi', () => {
    const kurumKopyasi = (kurumId: string, tz: string) =>
      o.sistem`insert into motivasyon.kurum_kopyalari (kurum_id, tur, durum, saat_dilimi, son_olay_at, son_olay_id)
               values (${kurumId}, 'kurum', 'aktif', ${tz}, now(), ${uuidv7()})`;
    const gunu = async (s: Senaryo) => (await hareketler(s)).map((h) => h.gun);
    const yoklamaAt = (s: Senaryo, at: string) =>
      o.isle(s.kurumId, (tx) =>
        yoklamaIsle(
          tx,
          olay.yoklama(s, { at: new Date(at), durum: 'geldi', yoklamaId: uuidv7(), surum: 1 }),
        ),
      );

    it('varsayilan Europe/Istanbul: 03:59 onceki gun, 04:01 ayni gun', async () => {
      const s = yeniSenaryo();
      await yoklamaAt(s, '2026-11-12T00:59:00Z'); // 03:59 +03
      await yoklamaAt(s, '2026-11-12T01:01:00Z'); // 04:01 +03
      expect(await gunu(s)).toEqual(['2026-11-11', '2026-11-12']);
    });

    it('farkli saat dilimi (America/New_York, UTC-5): 03:59 ve 04:01 yerel', async () => {
      const s = yeniSenaryo();
      await kurumKopyasi(s.kurumId, 'America/New_York');
      await yoklamaAt(s, '2026-11-12T08:59:00Z'); // 03:59 EST
      await yoklamaAt(s, '2026-11-12T09:01:00Z'); // 04:01 EST
      expect(await gunu(s)).toEqual(['2026-11-11', '2026-11-12']);
    });

    it('farkli saat dilimi (Asia/Tokyo, UTC+9)', async () => {
      const s = yeniSenaryo();
      await kurumKopyasi(s.kurumId, 'Asia/Tokyo');
      await yoklamaAt(s, '2026-11-11T18:59:00Z'); // 03:59 JST 12 Kasim
      await yoklamaAt(s, '2026-11-11T19:01:00Z'); // 04:01 JST
      expect(await gunu(s)).toEqual(['2026-11-11', '2026-11-12']);
    });

    it('gece yarisindan sonra calisan ogrenci ayni gunun tavanina yazar', async () => {
      const s = yeniSenaryo();
      await yoklamaAt(s, '2026-11-11T20:00:00Z'); // 23:00 Istanbul 11 Kasim
      await yoklamaAt(s, '2026-11-11T23:30:00Z'); // 02:30 Istanbul 12 Kasim -> hala 11 Kasim gunu
      expect(await gunu(s)).toEqual(['2026-11-11', '2026-11-11']);
      expect(await tavan(s, 'genel')).toBe(40);
    });

    it('hafta: Pazartesi 03:59 onceki haftanin, 04:01 yeni haftanin bu_hafta_xp sayacina yazilir', async () => {
      const s = yeniSenaryo();
      await yoklamaAt(s, '2026-11-09T00:59:00Z'); // Pzt 03:59 -> onceki hafta (Pazar gunu)
      expect((await durum(s))?.bu_hafta_xp).toBe(20);
      await yoklamaAt(s, '2026-11-09T01:01:00Z'); // Pzt 04:01 -> yeni hafta: sifirlanip 20
      expect((await durum(s))?.bu_hafta_xp).toBe(20);
      await yoklamaAt(s, '2026-11-10T09:00:00Z');
      expect((await durum(s))?.bu_hafta_xp).toBe(40);
      expect((await durum(s))?.toplam_xp).toBe(60);
      // gecikmis (eski hafta) olay yeni haftanin sayacina eklenmez
      await yoklamaAt(s, '2026-11-05T09:00:00Z');
      expect((await durum(s))?.bu_hafta_xp).toBe(40);
      expect((await durum(s))?.toplam_xp).toBe(80);
    });
  });

  describe('modul kapali, kurum askida, ogrenci etkin degil', () => {
    const ayar = (
      s: Senaryo,
      kapsam: 'kurum' | 'kademe' | 'grup',
      kapsamId: string,
      acik = false,
    ) =>
      o.sistem`insert into motivasyon.modul_ayari_kopyalari (kurum_id, modul_kodu, kapsam, kapsam_id, acik, son_olay_at, son_olay_id)
               values (${s.kurumId}, 'oyunlastirma', ${kapsam}, ${kapsamId}, ${acik}, now(), ${uuidv7()})`;
    const yaz = (s: Senaryo, grupId?: string) =>
      o.isle(s.kurumId, (tx) =>
        yoklamaIsle(
          tx,
          olay.yoklama(s, {
            at: T0,
            durum: 'geldi',
            yoklamaId: uuidv7(),
            surum: 1,
            ...(grupId ? { grupId } : {}),
          }),
        ),
      );

    it('kurum duzeyinde kapali: olay islenir, XP yazilmaz, pasif_olay_sayisi artar', async () => {
      const s = yeniSenaryo();
      await ayar(s, 'kurum', s.kurumId);
      await yaz(s);
      await yaz(s);
      expect(await durum(s)).toMatchObject({ toplam_xp: 0, pasif: 2 });
      expect(await hareketler(s)).toHaveLength(0);
      expect(await sayac(s, 'toplam_yoklama')).toBe(0);
    });

    it('grup duzeyinde kapali: yalniz o grubun yoklamasi pasif', async () => {
      const s = yeniSenaryo();
      const kapaliGrup = uuidv7();
      const acikGrup = uuidv7();
      await ayar(s, 'grup', kapaliGrup);
      await yaz(s, kapaliGrup);
      await yaz(s, acikGrup);
      expect(await durum(s)).toMatchObject({ toplam_xp: 20, pasif: 1 });
    });

    it('kademe duzeyinde kapali: ogrencinin kademesi kapaliysa pasif; kurum acik kademe kapali grup kapali', async () => {
      const s = yeniSenaryo();
      const kademe = uuidv7();
      await o.sistem`insert into motivasyon.uyelik_kopyalari (uyelik_id, kurum_id, kullanici_id, rol, durum, kademe_id, son_olay_at, son_olay_id)
                     values (${s.ogrenciId}, ${s.kurumId}, ${uuidv7()}, 'ogrenci', 'aktif', ${kademe}, now(), ${uuidv7()})`;
      await ayar(s, 'kademe', kademe);
      await yaz(s);
      expect(await durum(s)).toMatchObject({ toplam_xp: 0, pasif: 1 });

      const s2 = yeniSenaryo();
      const grup = uuidv7();
      const kademe2 = uuidv7();
      await o.sistem`insert into motivasyon.grup_kopyalari (grup_id, kurum_id, kademe_id, tur, durum, son_olay_at, son_olay_id)
                     values (${grup}, ${s2.kurumId}, ${kademe2}, 'grup', 'aktif', now(), ${uuidv7()})`;
      await ayar(s2, 'kademe', kademe2);
      await yaz(s2, grup);
      expect(await durum(s2)).toMatchObject({ toplam_xp: 0, pasif: 1 });
    });

    it('gruplu ogrenci: tum etkin gruplar kapaliysa pasif, biri aciksa aktif (grup baglamsiz olay)', async () => {
      const s = yeniSenaryo();
      const g1 = uuidv7();
      const g2 = uuidv7();
      for (const g of [g1, g2]) {
        await o.sistem`insert into motivasyon.grup_kopyalari (grup_id, kurum_id, tur, durum, son_olay_at, son_olay_id)
                       values (${g}, ${s.kurumId}, 'grup', 'aktif', now(), ${uuidv7()})`;
        await o.sistem`insert into motivasyon.grup_uyesi_kopyalari (grup_id, ogrenci_id, kurum_id, grup_uyesi_id, baslangic_tarihi, son_olay_at, son_olay_id)
                       values (${g}, ${s.ogrenciId}, ${s.kurumId}, ${uuidv7()}, '2026-01-01', now(), ${uuidv7()})`;
      }
      await ayar(s, 'grup', g1);
      await o.isle(s.kurumId, (tx) => geriBildirimIsle(tx, olay.geriBildirim(s, T0)));
      expect((await durum(s))?.toplam_xp).toBe(2); // g2 acik
      await ayar(s, 'grup', g2);
      await o.isle(s.kurumId, (tx) => geriBildirimIsle(tx, olay.geriBildirim(s, dk(T0, 1))));
      expect(await durum(s)).toMatchObject({ toplam_xp: 2, pasif: 1 });
    });

    it('kurum askida: XP yok, pasif sayilir', async () => {
      const s = yeniSenaryo();
      await o.sistem`insert into motivasyon.kurum_kopyalari (kurum_id, tur, durum, saat_dilimi, son_olay_at, son_olay_id)
                     values (${s.kurumId}, 'kurum', 'askida', 'Europe/Istanbul', now(), ${uuidv7()})`;
      await yaz(s);
      expect(await durum(s)).toMatchObject({ toplam_xp: 0, pasif: 1 });
    });

    it('ogrenci etkin degil (ayrildi) ya da ogrenci olmayan uyelik: olay tamamen yok sayilir', async () => {
      const s = yeniSenaryo();
      await o.sistem`insert into motivasyon.uyelik_kopyalari (uyelik_id, kurum_id, kullanici_id, rol, durum, son_olay_at, son_olay_id)
                     values (${s.ogrenciId}, ${s.kurumId}, ${uuidv7()}, 'ogrenci', 'ayrildi', now(), ${uuidv7()})`;
      await yaz(s);
      expect(await durum(s)).toBeUndefined();
    });

    it('modul sonradan acilirsa gecmis XP geriye donuk verilmez', async () => {
      const s = yeniSenaryo();
      await ayar(s, 'kurum', s.kurumId);
      await yaz(s);
      await o.sistem`update motivasyon.modul_ayari_kopyalari set acik = true where kurum_id = ${s.kurumId}`;
      expect((await durum(s))?.toplam_xp).toBe(0);
      await yaz(s);
      expect((await durum(s))?.toplam_xp).toBe(20);
    });

    it('deneme gecmisi modul kapaliyken de tutulur (acilinca net artisi dogru)', async () => {
      const s = yeniSenaryo();
      await ayar(s, 'kurum', s.kurumId);
      await o.isle(s.kurumId, (tx) =>
        denemeIsle(tx, olay.deneme(s, { at: T0, net: 40, tarih: '2026-10-01' })),
      );
      expect(await hareketler(s)).toHaveLength(0);
      await o.sistem`update motivasyon.modul_ayari_kopyalari set acik = true where kurum_id = ${s.kurumId}`;
      await o.isle(s.kurumId, (tx) =>
        denemeIsle(tx, olay.deneme(s, { at: dk(T0, 1), net: 50, tarih: '2026-10-10' })),
      );
      expect((await hareketler(s, 'deneme_net_artisi')).map((h) => h.xp)).toEqual([50]); // artis 10 -> 50
    });
  });

  describe('seviye ve karakter', () => {
    it('seviye atlama olayi yalniz yeni seviyede; birden cok seviye tek olay', async () => {
      const s = yeniSenaryo();
      // 60 XP -> seviye 3 (20, 60)
      for (let i = 0; i < 3; i++) {
        await o.isle(s.kurumId, (tx) =>
          yoklamaIsle(
            tx,
            olay.yoklama(s, { at: dk(T0, i), durum: 'geldi', yoklamaId: uuidv7(), surum: 1 }),
          ),
        );
      }
      expect((await durum(s))?.seviye).toBe(3);
      const e = await cikanOlaylar(s, 'motivasyon.seviye.atladi');
      expect(e.map((x) => [x.eski_seviye, x.yeni_seviye])).toEqual([
        [1, 2],
        [2, 3],
      ]);
      // ayni seviyede kalan kazanim olay uretmez
      await o.isle(s.kurumId, (tx) => geriBildirimIsle(tx, olay.geriBildirim(s, dk(T0, 10))));
      expect(await cikanOlaylar(s, 'motivasyon.seviye.atladi')).toHaveLength(2);
    });

    it('karakter varsa asama yukselince karakter.evrildi; ters kayittan sonra asama geri donmez', async () => {
      const s = yeniSenaryo();
      await o.isle(s.kurumId, (tx) => geriBildirimIsle(tx, olay.geriBildirim(s, T0)));
      await o.sistem`insert into motivasyon.ogrenci_karakterleri (id, kurum_id, ogrenci_id, tur_kodu, ad)
                     values (${uuidv7()}, ${s.kurumId}, ${s.ogrenciId}, 'kivilcim', 'Alev')`;
      // seviye 5 icin 380 XP gerekir: 20 yoklama (tavan 300/gun) iki gune yayilir
      const yoklamalar: string[] = [];
      for (let gun = 0; gun < 2; gun++) {
        for (let i = 0; i < 10; i++) {
          const id = uuidv7();
          yoklamalar.push(id);
          await o.isle(s.kurumId, (tx) =>
            yoklamaIsle(
              tx,
              olay.yoklama(s, {
                at: dk(T0, gun * 24 * 60 + i),
                durum: 'geldi',
                yoklamaId: id,
                surum: 1,
              }),
            ),
          );
        }
      }
      expect((await durum(s))?.seviye).toBe(5); // 2 + 400 = 402 >= 380
      const evrim = await cikanOlaylar(s, 'motivasyon.karakter.evrildi');
      expect(evrim).toEqual([
        { ogrenci_id: s.ogrenciId, tur_kodu: 'kivilcim', eski_asama: 1, yeni_asama: 2 },
      ]);
      // tum yoklamalar izinliye: toplam XP duser, seviye ve asama dusmez
      for (const id of yoklamalar) {
        await o.isle(s.kurumId, (tx) =>
          yoklamaIsle(
            tx,
            olay.yoklama(s, { at: dk(T0, 3 * 24 * 60), durum: 'izinli', yoklamaId: id, surum: 2 }),
          ),
        );
      }
      expect(await durum(s)).toMatchObject({ toplam_xp: 2, seviye: 5 });
      const [k] = await o.sistem<{ asama: number }[]>`
        select asama from motivasyon.ogrenci_karakterleri where ogrenci_id = ${s.ogrenciId}`;
      expect(k?.asama).toBe(2);
      expect(await cikanOlaylar(s, 'motivasyon.karakter.evrildi')).toHaveLength(1);
    });

    it('seviye kozmetigi acilir (seviye 5 -> arka_plan_orman)', async () => {
      const s = yeniSenaryo();
      await o.sistem`insert into motivasyon.ogrenci_durumlari (id, kurum_id, ogrenci_id, toplam_xp, seviye)
                     values (${uuidv7()}, ${s.kurumId}, ${s.ogrenciId}, 370, 4)`;
      await o.isle(s.kurumId, (tx) => odevTeslimIsle(tx, olay.odevTeslim(s, { at: T0 })));
      expect((await durum(s))?.seviye).toBe(5);
      const k = await o.sistem<{ kozmetik_kodu: string }[]>`
        select kozmetik_kodu from motivasyon.ogrenci_kozmetikleri where ogrenci_id = ${s.ogrenciId}`;
      expect(k.map((x) => x.kozmetik_kodu)).toEqual(['arka_plan_orman']);
    });
  });
});
