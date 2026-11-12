import { createDb, type Database } from '@kopru/service-kit';
import { sql } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { gunHesapla, ogrenciKilitle, type IsBaglami } from './ortak.js';
import { seriGeceIsi, seriRiskIsi } from './seri-isleri.js';
import { seriDegerlendir } from './seri.js';
import { olay, ortamKur, yeniSenaryo, type Ortam, type Senaryo } from './test/ortam.js';
import { dbYok, testDb } from './test/yardimcilar.js';
import { aktiviteArtir } from './xp-cekirdek.js';
import { planGoreviIsle } from './xp-tuketici.js';

/** Gun n: n=1 -> 2026-11-10 (Sali). Istanbul +03:00 (gun 04:00'te doner). */
const TABAN = Date.UTC(2026, 10, 9);
const g = (n: number) => new Date(TABAN + n * 86_400_000).toISOString().slice(0, 10);
/** Istanbul yerel saati. */
const ist = (n: number, saat: string) => new Date(`${g(n)}T${saat}:00+03:00`);

describe.skipIf(dbYok())('seri (gercek PostgreSQL, zaman enjekte)', () => {
  let o: Ortam;
  let db: Database;
  let db2: Database;

  beforeAll(() => {
    o = ortamKur();
    const urls = testDb();
    if (!urls) return;
    db = createDb({ url: urls.sistemUrl, max: 3 });
    db2 = createDb({ url: urls.sistemUrl, max: 3 });
  });
  afterAll(async () => {
    await db.close();
    await db2.close();
    await o.kapat();
  });

  // --- yardimcilar -------------------------------------------------------------------------
  const kurumKopyasi = (kurumId: string, tz: string, durum = 'aktif') =>
    o.sistem`insert into motivasyon.kurum_kopyalari (kurum_id, tur, durum, saat_dilimi, son_olay_at, son_olay_id)
             values (${kurumId}, 'kurum', ${durum}, ${tz}, now(), ${uuidv7()})`;

  /** Plan gorevi tamamlar (olay yolu). */
  const calis = (s: Senaryo, at: Date, adet = 1) =>
    o.isle(s.kurumId, async (tx) => {
      for (let i = 0; i < adet; i++) {
        await planGoreviIsle(tx, olay.plan(s, { at, gorevId: uuidv7(), durum: 'tamam' }));
      }
    });

  const gece = (s: Senaryo, simdi: Date) => seriGeceIsi({ db }, simdi, { kurumId: s.kurumId });
  const risk = (s: Senaryo, simdi: Date) => seriRiskIsi({ db }, simdi, { kurumId: s.kurumId });

  const seri = async (s: Senaryo) =>
    (
      await o.sistem<
        {
          mevcut: number;
          en_uzun: number;
          stok: number;
          hak: number;
          bozulan_seri: number | null;
          bozulan_gun: string | null;
          bitis: string | null;
          son_aktif: string | null;
          hafta: string | null;
          ay: string | null;
        }[]
      >`select mevcut_seri as mevcut, en_uzun_seri as en_uzun, dondurma_stogu::int as stok,
               onarim_hakki::int as hak, bozulan_seri, bozulan_gun::text as bozulan_gun,
               to_char(onarim_bitis_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as bitis,
               son_aktif_gun::text as son_aktif, dondurma_son_hafta::text as hafta, onarim_son_ay::text as ay
          from motivasyon.seriler where ogrenci_id = ${s.ogrenciId}`
    )[0];

  const gunler = async (s: Senaryo) => {
    const r = await o.sistem<{ gun: string; durum: string }[]>`
      select gun::text as gun, durum from motivasyon.seri_gunleri
       where ogrenci_id = ${s.ogrenciId} order by gun`;
    return Object.fromEntries(r.map((x) => [x.gun, x.durum]));
  };

  const sayac = async (s: Senaryo, kod: string) =>
    (
      await o.sistem<{ deger: number }[]>`
        select deger::int as deger from motivasyon.ogrenci_sayaclari
         where ogrenci_id = ${s.ogrenciId} and sayac_kodu = ${kod}`
    )[0]?.deger ?? 0;

  const olaylar = async (s: Senaryo, tur: 'bozuldu' | 'kilometre_tasi' | 'risk') =>
    (
      await o.sistem<{ data: Record<string, unknown> }[]>`
        select payload->'data' as data from ortak.outbox
         where kurum_id = ${s.kurumId} and subject = ${`evt.motivasyon.seri.${tur}.v1`}
           and payload->'data'->>'ogrenci_id' = ${s.ogrenciId} order by id`
    ).map((r) => r.data);

  const stokAyarla = (s: Senaryo, stok: number) =>
    o.sistem`update motivasyon.seriler set dondurma_stogu = ${stok} where ogrenci_id = ${s.ogrenciId}`;

  const grupKur = async (s: Senaryo, uyeler: string[], bas = g(1), bit: string | null = null) => {
    const grup = uuidv7();
    await o.sistem`insert into motivasyon.grup_kopyalari (grup_id, kurum_id, tur, durum, son_olay_at, son_olay_id)
                   values (${grup}, ${s.kurumId}, 'grup', 'aktif', now(), ${uuidv7()})`;
    for (const u of uyeler) {
      await o.sistem`insert into motivasyon.grup_uyesi_kopyalari (grup_id, ogrenci_id, kurum_id, grup_uyesi_id, baslangic_tarihi, bitis_tarihi, son_olay_at, son_olay_id)
                     values (${grup}, ${u}, ${s.kurumId}, ${uuidv7()}, ${bas}::date, ${bit}::date, now(), ${uuidv7()})`;
    }
    return grup;
  };
  const duraklat = (s: Senaryo, grup: string, bas: string, bit: string, iptal = false) =>
    o.sistem`insert into motivasyon.seri_duraklatmalari (id, kurum_id, grup_id, veren_ogretmen_id, baslangic_gun, bitis_gun, iptal_at)
             values (${uuidv7()}, ${s.kurumId}, ${grup}, ${uuidv7()}, ${bas}::date, ${bit}::date, ${iptal ? new Date() : null})`;

  // --- aktif gun ---------------------------------------------------------------------------
  it('ardisik gunler: seri 3, en uzun 3, rozet sayaclari; ayni gun ikinci gorev bir sey degistirmez; kilometre tasi 3 bir kez', async () => {
    const s = yeniSenaryo();
    await calis(s, ist(1, '12:00'));
    await calis(s, ist(1, '15:00')); // ayni gun
    expect(await gunler(s)).toEqual({ [g(1)]: 'aktif' });
    expect(await sayac(s, 'toplam_aktif_gun')).toBe(1);
    await calis(s, ist(2, '09:00'));
    await calis(s, ist(3, '23:00'));
    expect(await seri(s)).toMatchObject({
      mevcut: 3,
      en_uzun: 3,
      son_aktif: g(3),
      stok: 0,
      hak: 1,
    });
    expect(await sayac(s, 'toplam_aktif_gun')).toBe(3);
    expect(await sayac(s, 'en_uzun_seri')).toBe(3);
    expect(await olaylar(s, 'kilometre_tasi')).toEqual([{ ogrenci_id: s.ogrenciId, seri: 3 }]);
    // kosul 3'te acilan kozmetik: sapka_kasket
    const [k] = await o.sistem<{ n: number }[]>`
      select count(*)::int n from motivasyon.ogrenci_kozmetikleri where ogrenci_id = ${s.ogrenciId} and kozmetik_kodu = 'sapka_kasket'`;
    expect(k?.n).toBe(1);
  });

  it('gun siniri 04:00: 03:59 onceki gune, 04:01 yeni gune yazilir', async () => {
    const s = yeniSenaryo();
    await calis(s, ist(2, '03:59'));
    await calis(s, ist(3, '04:01'));
    expect(await gunler(s)).toEqual({ [g(1)]: 'aktif', [g(3)]: 'aktif' });
  });

  it("farkli saat dilimli kurum: ayni anlik Tokyo'da baska gune dusebilir", async () => {
    const tokyo = yeniSenaryo();
    const istanbul = yeniSenaryo();
    await kurumKopyasi(tokyo.kurumId, 'Asia/Tokyo');
    const an = new Date(`${g(1)}T20:30:00Z`); // Istanbul 23:30 (g1), Tokyo 05:30 (g2)
    await calis(tokyo, an);
    await calis(istanbul, an);
    expect(await gunler(tokyo)).toEqual({ [g(2)]: 'aktif' });
    expect(await gunler(istanbul)).toEqual({ [g(1)]: 'aktif' });
  });

  it('esikler: 20 dk odak aktif, 19:59 degil (odak paketi seriDegerlendir cagirir)', async () => {
    const s = yeniSenaryo();
    const baglam = async (at: Date): Promise<IsBaglami> => {
      const { gun, hafta } = await o.isle(s.kurumId, (tx) =>
        gunHesapla(tx, 'Europe/Istanbul', at.toISOString()),
      );
      return {
        kurumId: s.kurumId,
        ogrenciId: s.ogrenciId,
        olayId: uuidv7(),
        olusmaAt: at.toISOString(),
        saatDilimi: 'Europe/Istanbul',
        gun,
        hafta,
      };
    };
    const at = ist(1, '14:00');
    const b = await baglam(at);
    await o.isle(s.kurumId, async (tx) => {
      await tx.execute(sql`
        insert into motivasyon.ogrenci_durumlari (id, kurum_id, ogrenci_id) values (${uuidv7()}, ${s.kurumId}, ${s.ogrenciId})
        on conflict do nothing`);
      await ogrenciKilitle(tx, s.ogrenciId);
      await aktiviteArtir(tx, b, b.gun, 'odak_sn', 1199);
      await seriDegerlendir(tx, b);
    });
    expect(await gunler(s)).toEqual({});
    await o.isle(s.kurumId, async (tx) => {
      await aktiviteArtir(tx, b, b.gun, 'odak_sn', 1);
      await seriDegerlendir(tx, b);
    });
    expect(await gunler(s)).toEqual({ [g(1)]: 'aktif' });
    expect(await seri(s)).toMatchObject({ mevcut: 1 });
  });

  // --- gece isi: dondurma, kacirma ---------------------------------------------------------
  it('dondurma otomatik kullanilir: seri korunur ama artmaz; stok -1', async () => {
    const s = yeniSenaryo();
    await calis(s, ist(1, '12:00'));
    await calis(s, ist(2, '12:00'));
    await stokAyarla(s, 1);
    await gece(s, ist(4, '04:10')); // g3 degerlendirilir
    expect(await gunler(s)).toEqual({ [g(1)]: 'aktif', [g(2)]: 'aktif', [g(3)]: 'dondurma' });
    expect(await seri(s)).toMatchObject({ mevcut: 2, stok: 0, bozulan_gun: null });
    expect(await olaylar(s, 'bozuldu')).toEqual([]);
    await calis(s, ist(4, '12:00'));
    expect(await seri(s)).toMatchObject({ mevcut: 3 }); // g1, g2, g4 (dondurma sayilmaz, kirmaz)
  });

  it('gece isi 04:10 oncesinde bir sey yapmaz; kacirma -> bozulma olayi tek kez, pencere sonu g5 04:00', async () => {
    const s = yeniSenaryo();
    await calis(s, ist(1, '12:00'));
    await calis(s, ist(2, '12:00'));
    await gece(s, ist(4, '04:09')); // g3 henuz degerlendirilmez
    expect(await gunler(s)).toEqual({ [g(1)]: 'aktif', [g(2)]: 'aktif' });
    await gece(s, ist(4, '04:10'));
    expect(await gunler(s)).toMatchObject({ [g(3)]: 'kacirildi' });
    expect(await seri(s)).toMatchObject({
      mevcut: 0,
      en_uzun: 2,
      bozulan_seri: 2,
      bozulan_gun: g(3),
      bitis: `${g(5)}T01:00:00Z`,
    });
    expect(await olaylar(s, 'bozuldu')).toEqual([
      { ogrenci_id: s.ogrenciId, onceki_seri: 2, onarilabilir: true, onarim_son_gun: g(4) },
    ]);
    // tekrar ve sonraki gunler: ikinci olay yok, seri 0 iken kayit/olay uretilmez
    await gece(s, ist(4, '04:10'));
    await gece(s, ist(6, '10:00'));
    expect(await olaylar(s, 'bozuldu')).toHaveLength(1);
    expect(await gunler(s)).toEqual({ [g(1)]: 'aktif', [g(2)]: 'aktif', [g(3)]: 'kacirildi' });
    expect(await seri(s)).toMatchObject({ bozulan_seri: 2, bozulan_gun: g(3) });
  });

  it('farkli saat dilimli kurumda gece isi kurum saatine gore: Tokyo 04:10 = Istanbul 22:10', async () => {
    const s = yeniSenaryo();
    await kurumKopyasi(s.kurumId, 'Asia/Tokyo');
    // Tokyo gun g1 (UTC+9): 12:00 Tokyo = 03:00Z
    await calis(s, new Date(`${g(1)}T03:00:00Z`));
    await calis(s, new Date(`${g(2)}T03:00:00Z`));
    // Tokyo g4 04:10 = g3 19:10Z: g3 degerlendirilir. Bir dakika oncesinde (19:09Z) henuz degerlendirilmez.
    await gece(s, new Date(`${g(3)}T19:09:00Z`));
    expect(await gunler(s)).toEqual({ [g(1)]: 'aktif', [g(2)]: 'aktif' });
    await gece(s, new Date(`${g(3)}T19:10:00Z`));
    expect(await gunler(s)).toMatchObject({ [g(3)]: 'kacirildi' });
    // Ayni anda Istanbul'da (22:10) bir Istanbul kurumunun g3'u henuz bitmemistir.
    const ist2 = yeniSenaryo();
    await calis(ist2, ist(1, '12:00'));
    await calis(ist2, ist(2, '12:00'));
    await gece(ist2, new Date(`${g(3)}T19:10:00Z`));
    expect(await gunler(ist2)).toEqual({ [g(1)]: 'aktif', [g(2)]: 'aktif' });
  });

  it('haftalik dondurma tahakkuku: Pazartesi +1, en cok 2, tekrar calistirma etkisiz', async () => {
    const s = yeniSenaryo();
    await calis(s, ist(1, '12:00')); // Sali 10 Kasim
    expect((await seri(s))?.hafta).toBe(g(0)); // Pazartesi 9 Kasim
    await gece(s, ist(7, '04:10')); // Pazartesi 16 Kasim 04:10
    expect(await seri(s)).toMatchObject({ stok: 1, hafta: g(7) });
    await gece(s, ist(7, '04:10'));
    await gece(s, ist(7, '20:00'));
    expect((await seri(s))?.stok).toBe(1);
    await gece(s, ist(14, '04:10'));
    expect((await seri(s))?.stok).toBe(2);
    await gece(s, ist(21, '04:10'));
    expect((await seri(s))?.stok).toBe(2); // en cok 2
  });

  it("onarim hakki ayin ilk gununde 1'e doner", async () => {
    const s = yeniSenaryo();
    await calis(s, ist(1, '12:00'));
    await o.sistem`update motivasyon.seriler set onarim_hakki = 0 where ogrenci_id = ${s.ogrenciId}`;
    await gece(s, ist(21, '04:10')); // 30 Kasim
    expect(await seri(s)).toMatchObject({ hak: 0, ay: '2026-11-01' });
    await gece(s, ist(22, '04:10')); // 1 Aralik
    expect(await seri(s)).toMatchObject({ hak: 1, ay: '2026-12-01' });
  });

  // --- onarim ------------------------------------------------------------------------------
  const bozukSeri = async (): Promise<Senaryo> => {
    const s = yeniSenaryo();
    await calis(s, ist(1, '12:00'));
    await calis(s, ist(2, '12:00'));
    await gece(s, ist(4, '04:10')); // g3 kacirildi
    return s;
  };

  it('onarim: kacirilan gunu izleyen gunde 2 kat hedef -> gun onarim, hak 0, seri geri gelir', async () => {
    const s = await bozukSeri();
    await calis(s, ist(4, '12:00'), 1);
    expect(await gunler(s)).toMatchObject({ [g(3)]: 'kacirildi', [g(4)]: 'aktif' });
    expect(await seri(s)).toMatchObject({ mevcut: 1, hak: 1 });
    await calis(s, ist(4, '18:00'), 1); // gun toplami 2 = 2 x esik
    expect(await gunler(s)).toEqual({
      [g(1)]: 'aktif',
      [g(2)]: 'aktif',
      [g(3)]: 'onarim',
      [g(4)]: 'aktif',
    });
    expect(await seri(s)).toMatchObject({
      mevcut: 4,
      en_uzun: 4,
      hak: 0,
      bozulan_seri: null,
      bozulan_gun: null,
      bitis: null,
    });
    expect(await sayac(s, 'toplam_aktif_gun')).toBe(3); // onarim gunu aktif gun sayilmaz
  });

  it("onarim pencere disinda olmaz (g5'te 2 kat hedef); ayda bir (ikinci bozulmada onarilabilir=false)", async () => {
    const s = await bozukSeri();
    await calis(s, ist(5, '12:00'), 2);
    expect(await gunler(s)).toMatchObject({ [g(3)]: 'kacirildi', [g(5)]: 'aktif' });
    expect(await seri(s)).toMatchObject({ mevcut: 1, hak: 1, bozulan_gun: g(3) });

    const t = await bozukSeri();
    await calis(t, ist(4, '12:00'), 2);
    expect((await seri(t))?.hak).toBe(0);
    // g5 kacirilir (seri 4 -> 0): hak yok, onarilabilir false
    await gece(t, ist(6, '04:10'));
    expect(await gunler(t)).toMatchObject({ [g(5)]: 'kacirildi' });
    const e = await olaylar(t, 'bozuldu');
    expect(e.at(-1)).toMatchObject({ onceki_seri: 4, onarilabilir: false, onarim_son_gun: null });
    await calis(t, ist(6, '12:00'), 2);
    expect(await gunler(t)).toMatchObject({ [g(5)]: 'kacirildi' });
    expect(await seri(t)).toMatchObject({ mevcut: 1, hak: 0 });
  });

  it('cevrimdisi gec gelen 2 kat hedef pencere gunune gore onarir (gece isi aradan gecmis olsa da)', async () => {
    const s = await bozukSeri();
    await gece(s, ist(6, '04:10')); // g4, g5 gecti (seri 0: kayit yok)
    await calis(s, ist(4, '20:00'), 2); // cihaz cevrimdisiydi, simdi eslendi
    expect(await gunler(s)).toMatchObject({ [g(3)]: 'onarim', [g(4)]: 'aktif' });
    expect(await seri(s)).toMatchObject({ mevcut: 4, hak: 0 });
  });

  it('gece isi kesinti sonrasi: ertesi gun 2 kat hedef zaten varsa dogrudan onarim (bozulma olayi yok)', async () => {
    const s = yeniSenaryo();
    await calis(s, ist(1, '12:00'));
    await calis(s, ist(2, '12:00'));
    await calis(s, ist(4, '12:00'), 2); // g3 bos, g4 iki kat; gece isi g3'u degerlendirmedi
    await gece(s, ist(5, '04:10'));
    expect(await gunler(s)).toMatchObject({ [g(3)]: 'onarim', [g(4)]: 'aktif' });
    expect(await olaylar(s, 'bozuldu')).toEqual([]);
    expect(await seri(s)).toMatchObject({ mevcut: 4, hak: 0 });
  });

  // --- duraklatma --------------------------------------------------------------------------
  it('ogretmen duraklatmasi: seri bozulmaz, dondurma harcanmaz; uye olmayan ve iptal edilen etkilenmez', async () => {
    const uye = yeniSenaryo();
    const diger = { kurumId: uye.kurumId, ogrenciId: uuidv7() };
    const iptalli = { kurumId: uye.kurumId, ogrenciId: uuidv7() };
    for (const s of [uye, diger, iptalli]) {
      await calis(s, ist(1, '12:00'));
      await calis(s, ist(2, '12:00'));
    }
    await stokAyarla(uye, 1);
    const grup = await grupKur(uye, [uye.ogrenciId]);
    await duraklat(uye, grup, g(3), g(3));
    const grup2 = await grupKur(uye, [iptalli.ogrenciId]);
    await duraklat(uye, grup2, g(3), g(3), true);
    await seriGeceIsi({ db }, ist(4, '04:10'), { kurumId: uye.kurumId });
    expect(await gunler(uye)).toMatchObject({ [g(3)]: 'duraklatma' });
    expect(await seri(uye)).toMatchObject({ mevcut: 2, stok: 1 });
    expect(await olaylar(uye, 'bozuldu')).toEqual([]);
    expect(await gunler(diger)).toMatchObject({ [g(3)]: 'kacirildi' });
    expect(await gunler(iptalli)).toMatchObject({ [g(3)]: 'kacirildi' });
    // duraklatma sonrasi calisinca zincir surer
    await calis(uye, ist(4, '12:00'));
    expect(await seri(uye)).toMatchObject({ mevcut: 3 });
  });

  it('modul kapaliyken kacirilan gun seriyi bozmaz (duraklatma olarak kaydedilir)', async () => {
    const s = yeniSenaryo();
    await calis(s, ist(1, '12:00'));
    await o.sistem`insert into motivasyon.modul_ayari_kopyalari (kurum_id, modul_kodu, kapsam, kapsam_id, acik, son_olay_at, son_olay_id)
                   values (${s.kurumId}, 'oyunlastirma', 'kurum', ${s.kurumId}, false, now(), ${uuidv7()})`;
    await gece(s, ist(3, '04:10'));
    expect(await gunler(s)).toEqual({ [g(1)]: 'aktif', [g(2)]: 'duraklatma' });
    expect(await seri(s)).toMatchObject({ mevcut: 1 });
    expect(await olaylar(s, 'bozuldu')).toEqual([]);
  });

  // --- gec olay, kesinti, es zamanlilik ----------------------------------------------------
  it('cevrimdisi gec gelen olay gecmis gunu aktif yapar, seri yeniden turetilir, ikinci bozulma olayi yok', async () => {
    const s = yeniSenaryo();
    await calis(s, ist(1, '12:00'));
    await calis(s, ist(3, '12:00'));
    await gece(s, ist(4, '04:10')); // g2 kacirildi (seri 1)
    expect(await gunler(s)).toMatchObject({ [g(2)]: 'kacirildi' });
    expect(await seri(s)).toMatchObject({ mevcut: 1, bozulan_gun: g(2) });
    await calis(s, ist(2, '21:00')); // gec eslenen g2 calismasi
    expect(await gunler(s)).toEqual({ [g(1)]: 'aktif', [g(2)]: 'aktif', [g(3)]: 'aktif' });
    expect(await seri(s)).toMatchObject({ mevcut: 3, en_uzun: 3, bozulan_gun: null, bitis: null });
    expect(await olaylar(s, 'bozuldu')).toHaveLength(1);
    expect(await sayac(s, 'toplam_aktif_gun')).toBe(3);
  });

  it('dondurma gunu sonradan aktif olamaz (sema kurali: yalniz kacirildi yukselir)', async () => {
    const s = yeniSenaryo();
    await calis(s, ist(1, '12:00'));
    await stokAyarla(s, 1);
    await gece(s, ist(3, '04:10'));
    expect(await gunler(s)).toMatchObject({ [g(2)]: 'dondurma' });
    await calis(s, ist(2, '20:00'));
    expect(await gunler(s)).toMatchObject({ [g(2)]: 'dondurma' });
  });

  it('cok gunluk kesinti: atlanan gunler sirayla (dondurma, kacirma, kayit yok); bozulma olayi tek', async () => {
    const s = yeniSenaryo();
    await calis(s, ist(1, '12:00'));
    await calis(s, ist(2, '12:00'));
    await stokAyarla(s, 1);
    await gece(s, ist(6, '04:10')); // g3, g4, g5 bekliyor
    expect(await gunler(s)).toEqual({
      [g(1)]: 'aktif',
      [g(2)]: 'aktif',
      [g(3)]: 'dondurma',
      [g(4)]: 'kacirildi',
    });
    expect(await seri(s)).toMatchObject({ mevcut: 0, stok: 0, bozulan_seri: 2, bozulan_gun: g(4) });
    expect(await olaylar(s, 'bozuldu')).toHaveLength(1);
  });

  it('iki worker ayni anda gece isini calistirir: tek sonuc, tek olay', async () => {
    const kurumId = uuidv7();
    const ogrenciler = Array.from({ length: 6 }, () => ({ kurumId, ogrenciId: uuidv7() }));
    for (const s of ogrenciler) {
      await calis(s, ist(1, '12:00'));
      await calis(s, ist(2, '12:00'));
    }
    const [a, b] = await Promise.all([
      seriGeceIsi({ db }, ist(4, '04:10'), { kurumId }),
      seriGeceIsi({ db: db2 }, ist(4, '04:10'), { kurumId }),
    ]);
    expect(a.ogrenci).toBe(6);
    expect(b.ogrenci).toBe(6);
    for (const s of ogrenciler) {
      expect(await gunler(s)).toMatchObject({ [g(3)]: 'kacirildi' });
      expect(await olaylar(s, 'bozuldu')).toHaveLength(1);
      expect(await seri(s)).toMatchObject({ mevcut: 0, bozulan_seri: 2 });
    }
    // dondurma tahakkuku da cift islenmez
    const [c, d] = await Promise.all([
      seriGeceIsi({ db }, ist(7, '04:10'), { kurumId }),
      seriGeceIsi({ db: db2 }, ist(7, '04:10'), { kurumId }),
    ]);
    expect(c.ogrenci + d.ogrenci).toBeGreaterThan(0);
    for (const s of ogrenciler) expect((await seri(s))?.stok).toBe(1);
  });

  it('etkin olmayan ogrenci (uyelik kopyasi ayrildi) gece isinde islenmez', async () => {
    const s = yeniSenaryo();
    await calis(s, ist(1, '12:00'));
    await calis(s, ist(2, '12:00'));
    await o.sistem`insert into motivasyon.uyelik_kopyalari (uyelik_id, kurum_id, kullanici_id, rol, durum, son_olay_at, son_olay_id)
                   values (${s.ogrenciId}, ${s.kurumId}, ${uuidv7()}, 'ogrenci', 'ayrildi', now(), ${uuidv7()})`;
    expect((await gece(s, ist(4, '04:10'))).ogrenci).toBe(0);
    expect(await gunler(s)).toEqual({ [g(1)]: 'aktif', [g(2)]: 'aktif' });
  });

  it('esige ulasmis ama satiri yazilmamis gun (odak yolu) gece isinde aktif yazilir', async () => {
    const s = yeniSenaryo();
    await calis(s, ist(1, '12:00'));
    await o.sistem`insert into motivasyon.ogrenci_gunluk_aktivite (ogrenci_id, gun, kurum_id, odak_sn)
                   values (${s.ogrenciId}, ${g(2)}::date, ${s.kurumId}, 1500)`;
    await gece(s, ist(4, '04:10'));
    expect(await gunler(s)).toMatchObject({ [g(2)]: 'aktif', [g(3)]: 'kacirildi' });
    expect(await seri(s)).toMatchObject({ mevcut: 0, en_uzun: 2, bozulan_seri: 2 });
  });

  // --- kilometre tasi ----------------------------------------------------------------------
  it("kilometre tasi yalniz ilk ulasilista: bozulup yeniden 3 olunca tekrar yok, 7'de yeni olay", async () => {
    const s = yeniSenaryo();
    for (const n of [1, 2, 3]) await calis(s, ist(n, '12:00'));
    expect(await olaylar(s, 'kilometre_tasi')).toHaveLength(1);
    await gece(s, ist(5, '04:10')); // g4 kacirildi
    for (const n of [5, 6, 7]) await calis(s, ist(n, '12:00'));
    expect(await seri(s)).toMatchObject({ mevcut: 3, en_uzun: 3 });
    expect(await olaylar(s, 'kilometre_tasi')).toEqual([{ ogrenci_id: s.ogrenciId, seri: 3 }]);
    for (const n of [8, 9, 10, 11]) await calis(s, ist(n, '12:00'));
    expect(await seri(s)).toMatchObject({ mevcut: 7, en_uzun: 7 });
    expect((await olaylar(s, 'kilometre_tasi')).map((x) => x.seri)).toEqual([3, 7]);
    // seri_bronz rozeti (en_uzun_seri 7) kazanildi
    const [r] = await o.sistem<{ n: number }[]>`
      select count(*)::int n from motivasyon.ogrenci_rozetleri where ogrenci_id = ${s.ogrenciId} and rozet_kodu = 'seri_bronz'`;
    expect(r?.n).toBe(1);
  });

  // --- risk --------------------------------------------------------------------------------
  const ucGunSeri = async (): Promise<Senaryo> => {
    const s = yeniSenaryo();
    for (const n of [1, 2, 3]) await calis(s, ist(n, '12:00'));
    return s;
  };

  it("risk: 20:00'den sonra, bugun aktif olmayan seri>=3 ogrenciye gunde bir kez; yük gun_bitis_at = ertesi gun 04:00", async () => {
    const s = await ucGunSeri();
    expect(await risk(s, ist(4, '19:59'))).toBe(0);
    expect(await risk(s, ist(4, '20:00'))).toBe(1);
    expect(await olaylar(s, 'risk')).toEqual([
      {
        ogrenci_id: s.ogrenciId,
        mevcut_seri: 3,
        gun_bitis_at: `${g(5)}T01:00:00.000Z`,
        dondurma_stogu: 0,
      },
    ]);
    expect(await risk(s, ist(4, '20:05'))).toBe(0);
    expect(await risk(s, ist(4, '23:30'))).toBe(0);
    expect(await olaylar(s, 'risk')).toHaveLength(1);
  });

  it('risk: bugun aktifse, seri 3 altindaysa, duraklatmadaysa, modul kapaliysa yok', async () => {
    const aktif = await ucGunSeri();
    await calis(aktif, ist(4, '18:00'));
    expect(await risk(aktif, ist(4, '21:00'))).toBe(0);

    const kisa = yeniSenaryo();
    await calis(kisa, ist(2, '12:00'));
    await calis(kisa, ist(3, '12:00'));
    expect(await risk(kisa, ist(4, '21:00'))).toBe(0);

    const dur = await ucGunSeri();
    await duraklat(dur, await grupKur(dur, [dur.ogrenciId]), g(4), g(6));
    expect(await risk(dur, ist(4, '21:00'))).toBe(0);

    const kapali = await ucGunSeri();
    await o.sistem`insert into motivasyon.modul_ayari_kopyalari (kurum_id, modul_kodu, kapsam, kapsam_id, acik, son_olay_at, son_olay_id)
                   values (${kapali.kurumId}, 'oyunlastirma', 'kurum', ${kapali.kurumId}, false, now(), ${uuidv7()})`;
    expect(await risk(kapali, ist(4, '21:00'))).toBe(0);
  });

  it('risk saati ayarlanabilir (seri.risk_saati) ve ertesi gun yeniden uretilebilir', async () => {
    const s = await ucGunSeri();
    await o.sistem`insert into motivasyon.motivasyon_ayarlari (anahtar, deger, aciklama)
                   values ('seri.risk_saati', '22', 'test') on conflict (anahtar) do update set deger = '22'`;
    try {
      expect(await risk(s, ist(4, '21:30'))).toBe(0);
      expect(await risk(s, ist(4, '22:00'))).toBe(1);
    } finally {
      await o.sistem`delete from motivasyon.motivasyon_ayarlari where anahtar = 'seri.risk_saati'`;
    }
    // ertesi gun (g5) seri hala >= 3 ise (gece isi calismadiysa) yeni gunun olayi gelir
    expect(await risk(s, ist(5, '20:00'))).toBe(1);
    expect(await olaylar(s, 'risk')).toHaveLength(2);
  });
});
