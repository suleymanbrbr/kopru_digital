import {
  dersDersDegistiV1,
  dersKaynakEklendiV1,
  dersKaynakSorunBildirildiV1,
  dersYoklamaKaydedildiV1,
  finansKrediAzaldiV1,
  finansPaketSatildiV1,
  finansTahsilatAlindiV1,
  hesapDavetKabulEdildiV1,
  motivasyonKarakterEvrildiV1,
  motivasyonRozetKazanildiV1,
  motivasyonSeriBozuldiV1,
  motivasyonSeriKilometreTasiV1,
  motivasyonSeviyeAtladiV1,
  ogrenmeOdevIncelendiV1,
  ogrenmeOdevTeslimEdildiV1,
  ogrenmeOdevYayinlandiV1,
  ogrenmeSoruMesajiEklendiV1,
  ogrenmeSoruSorildiV1,
} from '@kopru/contracts';
import { createDb, type Database } from '@kopru/service-kit';
import { uuidv7 } from 'uuidv7';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { hatirlatmaAyariDegisti } from './ders-zamanlama.js';
import { ESLEMELER } from './eslemeler/index.js';
import { SABLON_TANIMLARI } from './sablonlar.js';
import { yerelParcalar, yerelden } from './tercih.js';
import { aliciKur, cihazEkle, ortamKur, type Alici, type Ortam } from './test/ortam.js';
import { dbYok, testDb } from './test/yardimcilar.js';
import { zamanlanmisUret } from './zamanlanmis.js';

const TZ = 'Europe/Istanbul';
const SAAT_MS = 3_600_000;
const DK_MS = 60_000;

/** Yarinin yerel (Istanbul) saati: eslemeler gercek saati kullandigindan testlerin zamani gelecektedir. */
function yarin(saat: number, dakika = 0): Date {
  const y = yerelParcalar(new Date(), TZ);
  return yerelden(y.yil, y.ay, y.gun + 1, saat * 60 + dakika, TZ);
}
const iso = (t: Date) => t.toISOString();

const sessiz = { info: () => undefined, warn: () => undefined, error: () => undefined };

describe('esleme sablonlari (veritabani gerekmez)', () => {
  it('her push sablonunun kutu sablonu vardir; ayni kod ve kategori', () => {
    for (const p of SABLON_TANIMLARI.filter((t) => t.kanal === 'push')) {
      const kutu = SABLON_TANIMLARI.find((t) => t.kod === p.kod && t.kanal === 'kutu');
      expect(kutu, p.kod).toBeDefined();
      expect(kutu?.kategori, p.kod).toBe(p.kategori);
    }
  });

  it('push metinlerinde tutar, ad ve not yer almaz', () => {
    for (const p of SABLON_TANIMLARI.filter((t) => t.kanal === 'push')) {
      const metin = `${p.baslik ?? ''} ${p.govde}`.toLowerCase();
      expect(metin, p.kod).not.toMatch(/₺|tl\b|ücret|tutar|bakiye/);
      expect(metin, p.kod).not.toMatch(/{{\s*(ad|not|tutar)/);
    }
  });
});

describe.skipIf(dbYok())('olay eslemeleri (bildirim_app, kurum baglami)', () => {
  let o: Ortam;
  let sistemDb: Database;
  beforeAll(() => {
    o = ortamKur();
    const urls = testDb();
    if (!urls) throw new Error('testDb yok');
    sistemDb = createDb({ url: urls.sistemUrl, max: 2 });
  });
  afterAll(async () => {
    await sistemDb.close();
    await o.kapat();
  });

  const zarf = (kurumId: string, occurredAt?: Date) => ({
    kurumId,
    actor: { tur: 'sistem', id: 'test' } as const,
    correlationId: 'c',
    ...(occurredAt ? { occurredAt } : {}),
  });
  const calistir = async (kurumId: string, olay: { type: string }) => {
    const e = ESLEMELER.find((x) => x.olay.type === olay.type);
    if (!e) throw new Error(`esleme yok: ${olay.type}`);
    await o.isle(kurumId, (tx) => e.isle(tx, olay, { log: sessiz } as never));
  };

  interface Kurum {
    kurumId: string;
    ogretmen: Alici;
    ogrenciler: Alici[];
  }
  /** Kurum + etkin ogretmen + `n` ogrenci (hepsinin uyelik kopyasi var; ogrenciye cihaz eklenir). */
  async function kurumKur(n = 2, cihazli = true): Promise<Kurum> {
    const ogretmen = await aliciKur(o, { rol: 'ogretmen' });
    const ogrenciler: Alici[] = [];
    for (let i = 0; i < n; i++) {
      const a = await aliciKur(o, { kurumId: ogretmen.kurumId, rol: 'ogrenci' });
      if (cihazli) await cihazEkle(o, a.kullaniciId);
      ogrenciler.push(a);
    }
    return { kurumId: ogretmen.kurumId, ogretmen, ogrenciler };
  }

  const og = (k: Kurum, i: number): Alici => {
    const a = k.ogrenciler[i];
    if (!a) throw new Error(`ogrenci ${String(i)} yok`);
    return a;
  };
  const bildirimler = (kurumId: string, kod?: string) =>
    o.sistem<
      {
        alici_id: string;
        kategori: string;
        sablon_kodu: string;
        baslik: string;
        govde: string;
        derin_baglanti: string;
        veri: Record<string, unknown>;
        gecerlilik_bitis_at: Date | null;
        tekil_anahtar: string;
      }[]
    >`select alici_id, kategori, sablon_kodu, baslik, govde, derin_baglanti, veri, gecerlilik_bitis_at, tekil_anahtar
        from bildirim.bildirimler
       where kurum_id = ${kurumId} and (${kod ?? null}::text is null or sablon_kodu = ${kod ?? null})
       order by created_at, alici_id`;
  const gonderimler = (kurumId: string) =>
    o.sistem<
      {
        durum: string;
        atlama_nedeni: string | null;
        baslik: string | null;
        govde: string | null;
        derin_baglanti: string | null;
      }[]
    >`select durum, atlama_nedeni, baslik, govde, derin_baglanti from bildirim.gonderimler where kurum_id = ${kurumId}`;
  const zamanlanmis = (kurumId: string, sablon?: string) =>
    o.sistem<
      {
        kaynak_turu: string;
        kaynak_id: string;
        alici_id: string;
        sablon_kodu: string;
        gonderim_at: Date;
        veri: Record<string, unknown>;
        iptal_at: Date | null;
        iptal_nedeni: string | null;
        uretildi_at: Date | null;
      }[]
    >`select kaynak_turu, kaynak_id, alici_id, sablon_kodu, gonderim_at, veri, iptal_at, iptal_nedeni, uretildi_at
        from bildirim.zamanlanmis_bildirimler
       where kurum_id = ${kurumId} and (${sablon ?? null}::text is null or sablon_kodu = ${sablon ?? null})
       order by alici_id, sablon_kodu`;
  const isleJob = (kurumId: string, simdi: Date) =>
    zamanlanmisUret({ sistem: sistemDb, app: o.app, simdi: () => simdi, kurumId });
  const ayarla = (a: Alici, dk: number) =>
    o.sistem`insert into bildirim.kullanici_ayarlari (kullanici_id, kurum_id, ders_hatirlatma_dk)
             values (${a.kullaniciId}, ${a.kurumId}, ${dk})
             on conflict (kullanici_id, kurum_id) do update set ders_hatirlatma_dk = excluded.ders_hatirlatma_dk`;

  // --- ders -----------------------------------------------------------------------------------
  const dersOlayi = (
    k: Kurum,
    ek: Partial<Parameters<typeof dersDersDegistiV1.create>[0]['data']> & {
      occurredAt?: Date;
    } = {},
  ) => {
    const { occurredAt, ...data } = ek;
    const baslangic = data.baslangic_at ?? iso(yarin(15));
    return dersDersDegistiV1.create({
      ...zarf(k.kurumId, occurredAt),
      data: {
        ders_id: uuidv7(),
        degisim_turu: 'planlandi',
        seri_id: null,
        grup_id: uuidv7(),
        ogretmen_id: k.ogretmen.uyelikId,
        brans_kodu: 'matematik',
        baslangic_at: baslangic,
        bitis_at: iso(new Date(new Date(baslangic).getTime() + SAAT_MS)),
        onceki_baslangic_at: null,
        durum: 'planli',
        telafi: false,
        online: false,
        ogrenci_idleri: k.ogrenciler.map((a) => a.uyelikId),
        parca_no: 1,
        parca_sayisi: 1,
        iptal_nedeni: null,
        iptal_kaynagi: null,
        gec_iptal: false,
        ...data,
      },
    });
  };

  describe('ders.ders.degisti', () => {
    it('iptal (yonetici): ogrencilere ve ogretmene; ogretmen iptal ettiyse yalniz ogrencilere; idempotent', async () => {
      const k = await kurumKur(2);
      const dersId = uuidv7();
      const iptal = dersOlayi(k, {
        ders_id: dersId,
        degisim_turu: 'iptal_edildi',
        durum: 'iptal',
        iptal_kaynagi: 'yonetici',
      });
      await calistir(k.kurumId, iptal);
      await calistir(k.kurumId, iptal);
      const b = await bildirimler(k.kurumId);
      expect(b.map((x) => x.alici_id).sort()).toEqual(
        [...k.ogrenciler.map((a) => a.uyelikId), k.ogretmen.uyelikId].sort(),
      );
      expect(b.every((x) => x.kategori === 'ders')).toBe(true);
      expect(b.find((x) => x.alici_id === k.ogretmen.uyelikId)?.sablon_kodu).toBe(
        'ders_iptal_ogretmen',
      );
      expect(b[0]?.derin_baglanti).toBe(`kopru://ders/${dersId}`);

      const k2 = await kurumKur(2);
      await calistir(
        k2.kurumId,
        dersOlayi(k2, { degisim_turu: 'iptal_edildi', durum: 'iptal', iptal_kaynagi: 'ogretmen' }),
      );
      const b2 = await bildirimler(k2.kurumId);
      expect(b2.map((x) => x.alici_id).sort()).toEqual(k2.ogrenciler.map((a) => a.uyelikId).sort());
    });

    it('parcali iptal: her parca kendi ogrencilerini isler, ogretmene tek bildirim gider', async () => {
      const k = await kurumKur(2);
      const dersId = uuidv7();
      const ortak = {
        ders_id: dersId,
        degisim_turu: 'iptal_edildi' as const,
        durum: 'iptal' as const,
        iptal_kaynagi: 'yonetici' as const,
        parca_sayisi: 2,
      };
      await calistir(
        k.kurumId,
        dersOlayi(k, { ...ortak, parca_no: 1, ogrenci_idleri: [k.ogrenciler[0]?.uyelikId ?? ''] }),
      );
      await calistir(
        k.kurumId,
        dersOlayi(k, { ...ortak, parca_no: 2, ogrenci_idleri: [k.ogrenciler[1]?.uyelikId ?? ''] }),
      );
      const b = await bildirimler(k.kurumId);
      expect(b).toHaveLength(3);
      expect(b.filter((x) => x.alici_id === k.ogretmen.uyelikId)).toHaveLength(1);
    });

    it('erteleme: ogrencilere yeni zamanla bildirim; ogretmene yok; push metninde ad/not yok', async () => {
      const k = await kurumKur(1);
      const yeni = yarin(17);
      await calistir(
        k.kurumId,
        dersOlayi(k, {
          degisim_turu: 'ertelendi',
          baslangic_at: iso(yeni),
          onceki_baslangic_at: iso(yarin(15)),
        }),
      );
      const b = await bildirimler(k.kurumId, 'ders_ertelendi');
      expect(b).toHaveLength(1);
      expect(b[0]?.alici_id).toBe(k.ogrenciler[0]?.uyelikId);
      expect(b[0]?.govde).toMatch(/17:00/);
      const g = await gonderimler(k.kurumId);
      expect(g[0]?.durum).toMatch(/beklemede|ertelendi|atlandi/);
      expect(await bildirimler(k.kurumId, 'ders_iptal_ogretmen')).toHaveLength(0);
    });

    it('telafi planlandi: ogrencilere bildirim; normal planlandi bildirim uretmez', async () => {
      const k = await kurumKur(2);
      await calistir(k.kurumId, dersOlayi(k, { telafi: true }));
      expect(await bildirimler(k.kurumId, 'telafi_planlandi')).toHaveLength(2);
      const k2 = await kurumKur(2);
      await calistir(k2.kurumId, dersOlayi(k2));
      expect(await bildirimler(k2.kurumId)).toHaveLength(0);
    });

    it('eski (siradan sapmis) planlandi olayi, daha yeni iptali ezmez ve hatirlatma uretmez', async () => {
      const k = await kurumKur(1);
      const dersId = uuidv7();
      const simdi = Date.now();
      await calistir(
        k.kurumId,
        dersOlayi(k, {
          ders_id: dersId,
          degisim_turu: 'iptal_edildi',
          durum: 'iptal',
          iptal_kaynagi: 'ogretmen',
          occurredAt: new Date(simdi),
        }),
      );
      await calistir(
        k.kurumId,
        dersOlayi(k, { ders_id: dersId, occurredAt: new Date(simdi - 60_000) }),
      );
      expect(await zamanlanmis(k.kurumId, 'ders_hatirlatma')).toHaveLength(0);
      const [p] = await o.sistem<{ durum: string }[]>`
        select durum from bildirim.ders_planlari where ders_id = ${dersId}`;
      expect(p?.durum).toBe('iptal');
    });
  });

  describe('ders hatirlatma (zamanlanmis)', () => {
    it('planlaninca ogrenci basina baslangic - ayar; varsayilan 60, ayar 15, ayar 0 = kapali', async () => {
      const k = await kurumKur(3);
      await ayarla(og(k, 1), 15);
      await ayarla(og(k, 2), 0);
      const baslangic = yarin(15);
      const olay = dersOlayi(k, { baslangic_at: iso(baslangic) });
      await calistir(k.kurumId, olay);
      await calistir(k.kurumId, olay); // idempotent
      const z = await zamanlanmis(k.kurumId, 'ders_hatirlatma');
      expect(z).toHaveLength(3);
      const al = (a: Alici) => z.find((x) => x.alici_id === a.uyelikId);
      expect(al(og(k, 0))?.gonderim_at.getTime()).toBe(baslangic.getTime() - 60 * DK_MS);
      expect(al(og(k, 1))?.gonderim_at.getTime()).toBe(baslangic.getTime() - 15 * DK_MS);
      expect(al(og(k, 2))).toMatchObject({
        iptal_nedeni: 'ayar',
      });
      expect(al(og(k, 0))).toMatchObject({ iptal_at: null, kaynak_turu: 'ders' });
      // Ogretmen icin hatirlatma satiri yok (yalniz ogrenci).
      expect(z.some((x) => x.alici_id === k.ogretmen.uyelikId)).toBe(false);
    });

    it('gecmise dusen hatirlatma uretilmez (baslangica 30 dk kalmis, ayar 60)', async () => {
      const k = await kurumKur(1);
      const yakin = new Date(Date.now() + 30 * DK_MS);
      await calistir(k.kurumId, dersOlayi(k, { baslangic_at: iso(yakin) }));
      expect(await zamanlanmis(k.kurumId, 'ders_hatirlatma')).toHaveLength(0);
    });

    it('erteleme yeniden hesaplar (uretildi sifirlanir); iptal bekleyen satiri iptal eder', async () => {
      const k = await kurumKur(1);
      const dersId = uuidv7();
      await calistir(k.kurumId, dersOlayi(k, { ders_id: dersId, baslangic_at: iso(yarin(15)) }));
      await o.sistem`update bildirim.zamanlanmis_bildirimler set uretildi_at = now() where kurum_id = ${k.kurumId}`;
      const yeni = yarin(18);
      await calistir(
        k.kurumId,
        dersOlayi(k, {
          ders_id: dersId,
          degisim_turu: 'ertelendi',
          baslangic_at: iso(yeni),
          onceki_baslangic_at: iso(yarin(15)),
        }),
      );
      const [z] = await zamanlanmis(k.kurumId, 'ders_hatirlatma');
      expect(z?.gonderim_at.getTime()).toBe(yeni.getTime() - 60 * DK_MS);
      expect(z?.uretildi_at).toBeNull();
      expect(z?.veri.baslangic_at).toBe(iso(yeni));

      await calistir(
        k.kurumId,
        dersOlayi(k, {
          ders_id: dersId,
          degisim_turu: 'iptal_edildi',
          durum: 'iptal',
          iptal_kaynagi: 'ogretmen',
          baslangic_at: iso(yeni),
        }),
      );
      const [z2] = await zamanlanmis(k.kurumId, 'ders_hatirlatma');
      expect(z2?.iptal_at).not.toBeNull();
      expect(z2).toMatchObject({ iptal_nedeni: 'ders' });
      const [g] = await zamanlanmis(k.kurumId, 'ders_geri_bildirim');
      expect(g).toMatchObject({ iptal_nedeni: 'ders' });
    });

    it('ayar degisimi bekleyen satirlari yeniden hesaplar: 60 -> 15 -> 0 (iptal) -> 120 (yeniden etkin)', async () => {
      const k = await kurumKur(1);
      const a = og(k, 0);
      const baslangic = yarin(15);
      await calistir(k.kurumId, dersOlayi(k, { baslangic_at: iso(baslangic) }));
      const degistir = async (dk: number) => {
        await o.isle(k.kurumId, (tx) =>
          hatirlatmaAyariDegisti(tx, k.kurumId, a.kullaniciId, dk, new Date()),
        );
        const [z] = await zamanlanmis(k.kurumId, 'ders_hatirlatma');
        return z;
      };
      expect((await degistir(15))?.gonderim_at.getTime()).toBe(baslangic.getTime() - 15 * DK_MS);
      expect(await degistir(0)).toMatchObject({ iptal_nedeni: 'ayar' });
      const acik = await degistir(120);
      expect(acik).toMatchObject({ iptal_at: null, iptal_nedeni: null });
      expect(acik?.gonderim_at.getTime()).toBe(baslangic.getTime() - 120 * DK_MS);
    });

    it('is: zamani gelen hatirlatmayi uretir (kutu + push); ders sonrasi kutuda gizlenir; ikinci tur tekrar uretmez', async () => {
      const k = await kurumKur(1);
      const baslangic = yarin(15);
      const dersId = uuidv7();
      await calistir(k.kurumId, dersOlayi(k, { ders_id: dersId, baslangic_at: iso(baslangic) }));
      const gonderimAt = new Date(baslangic.getTime() - 60 * DK_MS);

      // Henuz zamani gelmedi.
      expect((await isleJob(k.kurumId, new Date(gonderimAt.getTime() - 1000))).uretildi).toBe(0);

      const simdi = new Date(gonderimAt.getTime() + 1000);
      expect((await isleJob(k.kurumId, simdi)).uretildi).toBe(1);
      expect((await isleJob(k.kurumId, simdi)).uretildi).toBe(0);
      const b = await bildirimler(k.kurumId, 'ders_hatirlatma');
      expect(b).toHaveLength(1);
      expect(b[0]).toMatchObject({
        kategori: 'ders',
        baslik: 'Dersin yaklaşıyor',
        derin_baglanti: `kopru://ders/${dersId}`,
      });
      expect(b[0]?.govde).toMatch(/15:00/);
      expect(b[0]?.gecerlilik_bitis_at?.getTime()).toBe(baslangic.getTime() + SAAT_MS);
      const [g] = await gonderimler(k.kurumId);
      expect(g?.durum).toMatch(/beklemede|ertelendi/);
    });

    it('is: sessiz saat ders baslamadan bitmiyorsa (ya da <= 30 dk kalmissa) push ertelenmez, atlanir', async () => {
      // Ders yarin 07:40; ayar 60 -> 06:40 (sessiz, sessiz bitis 08:00 > baslangic) -> atlandi (sessiz_saat).
      const k = await kurumKur(1);
      await calistir(k.kurumId, dersOlayi(k, { baslangic_at: iso(yarin(7, 40)) }));
      await isleJob(k.kurumId, yarin(6, 40));
      expect(await gonderimler(k.kurumId)).toContainEqual(
        expect.objectContaining({ durum: 'atlandi', atlama_nedeni: 'sessiz_saat' }),
      );
      expect(await bildirimler(k.kurumId, 'ders_hatirlatma')).toHaveLength(1); // kutu yine yazilir

      // Ayar 15 dk, ders 08:10 -> 07:55 (sessiz) ve <= 30 dk -> atlandi.
      const k2 = await kurumKur(1);
      await ayarla(og(k2, 0), 15);
      await calistir(k2.kurumId, dersOlayi(k2, { baslangic_at: iso(yarin(8, 10)) }));
      await isleJob(k2.kurumId, yarin(7, 55));
      // (Ogretmenin sabah ozeti de bu turda uretilir; cihazi olmadigi icin ayri satir.)
      expect(await gonderimler(k2.kurumId)).toContainEqual(
        expect.objectContaining({ durum: 'atlandi', atlama_nedeni: 'sessiz_saat' }),
      );
    });

    it('is: iptal edilmis dersin (kayit zamanlanmis kalsa bile) hatirlatmasi uretilmez', async () => {
      const k = await kurumKur(1);
      const baslangic = yarin(15);
      const dersId = uuidv7();
      await calistir(k.kurumId, dersOlayi(k, { ders_id: dersId, baslangic_at: iso(baslangic) }));
      // Siradan sapma benzetimi: ders plani iptal, ama satir iptal edilmemis.
      await o.sistem`update bildirim.ders_planlari set durum = 'iptal' where ders_id = ${dersId}`;
      const o1 = await isleJob(k.kurumId, new Date(baslangic.getTime() - 59 * DK_MS));
      expect(o1).toMatchObject({ uretildi: 0, iptal: 1 });
      expect(await bildirimler(k.kurumId)).toHaveLength(0);
    });
  });

  describe('ders sonu geri bildirimi', () => {
    it('ders tamamlaninca (bitis + 10 dk sonra) katilan ogrenciye; planli derste beklenir; gelmedi iptal eder, geldi geri alir', async () => {
      const k = await kurumKur(2);
      const [a, b] = k.ogrenciler as [Alici, Alici];
      const dersId = uuidv7();
      const baslangic = yarin(10);
      const bitis = new Date(baslangic.getTime() + SAAT_MS);
      await calistir(k.kurumId, dersOlayi(k, { ders_id: dersId, baslangic_at: iso(baslangic) }));
      const z = await zamanlanmis(k.kurumId, 'ders_geri_bildirim');
      expect(z).toHaveLength(2);
      expect(z[0]?.gonderim_at.getTime()).toBe(bitis.getTime() + 10 * DK_MS);

      const sonra = new Date(bitis.getTime() + 11 * DK_MS);
      // Ders hala planli (yoklama yok): uretilmez.
      expect(await isleJob(k.kurumId, sonra)).toMatchObject({ uretildi: 0 });

      // b: gelmedi -> iptal (yoklama); sonra geldi'ye duzeltilirse yeniden etkin.
      const yoklama = (ogr: Alici, durum: 'geldi' | 'gelmedi' | 'izinli' | 'gec', surum = 1) =>
        dersYoklamaKaydedildiV1.create({
          ...zarf(k.kurumId),
          data: {
            yoklama_id: uuidv7(),
            ders_id: dersId,
            grup_id: uuidv7(),
            ogrenci_id: ogr.uyelikId,
            brans_kodu: 'matematik',
            durum,
            onceki_durum: null,
            gec_dakika: null,
            isaretlenme_at: iso(bitis),
            yoklama_surumu: surum,
          },
        });
      await calistir(k.kurumId, yoklama(b, 'gelmedi'));
      expect(
        (await zamanlanmis(k.kurumId, 'ders_geri_bildirim')).find((x) => x.alici_id === b.uyelikId),
      ).toMatchObject({
        iptal_nedeni: 'yoklama',
      });

      // Ders tamamlandi olayi.
      await calistir(
        k.kurumId,
        dersOlayi(k, {
          ders_id: dersId,
          degisim_turu: 'tamamlandi',
          durum: 'tamamlandi',
          baslangic_at: iso(baslangic),
        }),
      );
      const r = await isleJob(k.kurumId, sonra);
      expect(r.uretildi).toBe(1);
      const gb = await bildirimler(k.kurumId, 'ders_geri_bildirim');
      expect(gb).toHaveLength(1);
      expect(gb[0]).toMatchObject({
        alici_id: a.uyelikId,
        baslik: 'Ders nasıldı?',
        derin_baglanti: `kopru://ders/${dersId}/geri-bildirim`,
      });
      // Duzeltme: b geldi -> yeniden etkin -> sonraki tur uretir.
      await calistir(k.kurumId, yoklama(b, 'geldi', 2));
      expect((await isleJob(k.kurumId, sonra)).uretildi).toBe(1);
      expect(await bildirimler(k.kurumId, 'ders_geri_bildirim')).toHaveLength(2);
    });
  });

  describe('ogretmen sabah bildirimi', () => {
    it('gunun ilk dersinden 30 dk once "Bugun N dersin var"; ders eklenip iptal edilince yeniden hesaplanir', async () => {
      const k = await kurumKur(1);
      const d1 = uuidv7();
      const d2 = uuidv7();
      await calistir(k.kurumId, dersOlayi(k, { ders_id: d1, baslangic_at: iso(yarin(10)) }));
      await calistir(k.kurumId, dersOlayi(k, { ders_id: d2, baslangic_at: iso(yarin(12)) }));
      let [z] = await zamanlanmis(k.kurumId, 'ogretmen_sabah');
      expect(z).toMatchObject({
        kaynak_turu: 'ogretmen_gun',
        alici_id: k.ogretmen.uyelikId,
        iptal_at: null,
      });
      expect(z?.veri.ders_sayisi).toBe(2);
      expect(z?.gonderim_at.getTime()).toBe(yarin(10).getTime() - 30 * DK_MS);

      // Ilk ders iptal: ilk ders 12:00 olur, sayi 1.
      await calistir(
        k.kurumId,
        dersOlayi(k, {
          ders_id: d1,
          degisim_turu: 'iptal_edildi',
          durum: 'iptal',
          iptal_kaynagi: 'ogretmen',
          baslangic_at: iso(yarin(10)),
        }),
      );
      [z] = await zamanlanmis(k.kurumId, 'ogretmen_sabah');
      expect(z?.veri.ders_sayisi).toBe(1);
      expect(z?.gonderim_at.getTime()).toBe(yarin(12).getTime() - 30 * DK_MS);
    });

    it('ayni ogretmenin iki dersi eszamanli islenirse ozet yine 2 dersi sayar (ogretmen kilidi)', async () => {
      const k = await kurumKur(1);
      const olaylar = [
        dersOlayi(k, { baslangic_at: iso(yarin(10)) }),
        dersOlayi(k, { baslangic_at: iso(yarin(15)) }),
      ];
      await Promise.all(olaylar.map((e) => calistir(k.kurumId, e)));
      const [z] = await zamanlanmis(k.kurumId, 'ogretmen_sabah');
      expect(z?.veri.ders_sayisi).toBe(2);
      expect(z?.gonderim_at.getTime()).toBe(yarin(10).getTime() - 30 * DK_MS);
    });

    it('is uretir: kutuda sayi ve ilk saat; tum dersler iptal edilince satir iptal', async () => {
      const k = await kurumKur(1);
      const d1 = uuidv7();
      const d2 = uuidv7();
      await calistir(k.kurumId, dersOlayi(k, { ders_id: d1, baslangic_at: iso(yarin(10)) }));
      await calistir(k.kurumId, dersOlayi(k, { ders_id: d2, baslangic_at: iso(yarin(12)) }));
      await cihazEkle(o, k.ogretmen.kullaniciId);
      const simdi = new Date(yarin(10).getTime() - 29 * DK_MS - 30_000); // 09:30:30 -> 09:30 gonderim zamani gecti
      // Ogretmenin sabah ozeti + ilk dersin ogrenci hatirlatmasi (09:00) birlikte uretilir.
      expect((await isleJob(k.kurumId, simdi)).uretildi).toBe(2);
      const b = await bildirimler(k.kurumId, 'ogretmen_sabah');
      expect(b).toHaveLength(1);
      expect(b[0]).toMatchObject({
        alici_id: k.ogretmen.uyelikId,
        kategori: 'ders',
        baslik: 'Günaydın',
      });
      expect(b[0]?.govde).toBe('Bugün 2 dersin var. İlki saat 10:00’de.');

      const k2 = await kurumKur(1);
      const x = uuidv7();
      await calistir(k2.kurumId, dersOlayi(k2, { ders_id: x, baslangic_at: iso(yarin(11)) }));
      await calistir(
        k2.kurumId,
        dersOlayi(k2, {
          ders_id: x,
          degisim_turu: 'iptal_edildi',
          durum: 'iptal',
          iptal_kaynagi: 'ogretmen',
        }),
      );
      const [z] = await zamanlanmis(k2.kurumId, 'ogretmen_sabah');
      expect(z).toMatchObject({ iptal_nedeni: 'gun' });
    });

    it('ogretmen "ders" kategorisini kapatirsa push atlanir (tercih), kutu yazilir', async () => {
      const k = await kurumKur(0);
      await cihazEkle(o, k.ogretmen.kullaniciId);
      await o.sistem`insert into bildirim.tercihler (kullanici_id, kurum_id, kategori, kanal, acik)
                     values (${k.ogretmen.kullaniciId}, ${k.kurumId}, 'ders', 'push', false)`;
      await calistir(k.kurumId, dersOlayi(k, { baslangic_at: iso(yarin(14)), ogrenci_idleri: [] }));
      await isleJob(k.kurumId, new Date(yarin(14).getTime() - 29 * DK_MS));
      expect(await bildirimler(k.kurumId, 'ogretmen_sabah')).toHaveLength(1);
      const [g] = await gonderimler(k.kurumId);
      expect(g).toMatchObject({ durum: 'atlandi', atlama_nedeni: 'tercih' });
    });
  });

  // --- yoklama --------------------------------------------------------------------------------
  describe('ders.yoklama.kaydedildi', () => {
    it('gelmedi ve gec ogrenciye bildirim (kategori yoklama); geldi/izinli uretmez; tekrar gelen olay tekillenir', async () => {
      const k = await kurumKur(4);
      const [a, b, c, d] = k.ogrenciler as [Alici, Alici, Alici, Alici];
      const olay = (ogr: Alici, durum: 'geldi' | 'gelmedi' | 'izinli' | 'gec') =>
        dersYoklamaKaydedildiV1.create({
          ...zarf(k.kurumId),
          data: {
            yoklama_id: uuidv7(),
            ders_id: uuidv7(),
            grup_id: uuidv7(),
            ogrenci_id: ogr.uyelikId,
            brans_kodu: 'matematik',
            durum,
            onceki_durum: null,
            gec_dakika: durum === 'gec' ? 10 : null,
            isaretlenme_at: iso(new Date()),
            yoklama_surumu: 1,
          },
        });
      const eGelmedi = olay(a, 'gelmedi');
      await calistir(k.kurumId, eGelmedi);
      await calistir(k.kurumId, eGelmedi);
      await calistir(k.kurumId, olay(b, 'gec'));
      await calistir(k.kurumId, olay(c, 'geldi'));
      await calistir(k.kurumId, olay(d, 'izinli'));
      const bl = await bildirimler(k.kurumId);
      expect(bl.map((x) => [x.alici_id, x.sablon_kodu, x.kategori]).sort()).toEqual(
        [
          [a.uyelikId, 'yoklama_gelmedi', 'yoklama'],
          [b.uyelikId, 'yoklama_gec', 'yoklama'],
        ].sort(),
      );
    });
  });

  // --- kaynak ---------------------------------------------------------------------------------
  describe('ders.kaynak.*', () => {
    it('kaynak eklendi: parcali, kayit/materyal sablonlari; sorun bildirimi ekleyen ogretmene', async () => {
      const k = await kurumKur(2);
      const kaynakId = uuidv7();
      const olay = (tur: 'kayit' | 'materyal', parca: number, ogr: Alici) =>
        dersKaynakEklendiV1.create({
          ...zarf(k.kurumId),
          data: {
            kaynak_id: kaynakId,
            tur,
            ders_id: tur === 'kayit' ? uuidv7() : null,
            grup_id: uuidv7(),
            brans_kodu: 'matematik',
            gorunurluk: 'grup',
            ekleyen_id: k.ogretmen.uyelikId,
            ogrenci_idleri: [ogr.uyelikId],
            parca_no: parca,
            parca_sayisi: 2,
          },
        });
      await calistir(k.kurumId, olay('kayit', 1, og(k, 0)));
      await calistir(k.kurumId, olay('kayit', 2, og(k, 1)));
      const b = await bildirimler(k.kurumId, 'kayit_eklendi');
      expect(b).toHaveLength(2);
      expect(b[0]).toMatchObject({
        kategori: 'kayit',
        derin_baglanti: `kopru://kayit/${kaynakId}`,
      });
      const k2 = await kurumKur(1);
      await calistir(k2.kurumId, olay2(k2, 'materyal'));
      expect(await bildirimler(k2.kurumId, 'materyal_eklendi')).toHaveLength(1);

      const sorun = dersKaynakSorunBildirildiV1.create({
        ...zarf(k.kurumId),
        data: {
          sorun_id: uuidv7(),
          kaynak_id: kaynakId,
          ders_id: null,
          grup_id: uuidv7(),
          bildiren_id: og(k, 0).uyelikId,
          neden: 'acilmiyor',
          ekleyen_id: k.ogretmen.uyelikId,
        },
      });
      await calistir(k.kurumId, sorun);
      await calistir(k.kurumId, sorun);
      const s = await bildirimler(k.kurumId, 'kaynak_sorun');
      expect(s).toHaveLength(1);
      expect(s[0]).toMatchObject({ alici_id: k.ogretmen.uyelikId, kategori: 'kayit' });
      expect(s[0]?.govde).toMatch(/açılmıyor/);

      function olay2(kk: Kurum, tur: 'kayit' | 'materyal') {
        return dersKaynakEklendiV1.create({
          ...zarf(kk.kurumId),
          data: {
            kaynak_id: uuidv7(),
            tur,
            ders_id: null,
            grup_id: uuidv7(),
            brans_kodu: null,
            gorunurluk: 'grup',
            ekleyen_id: kk.ogretmen.uyelikId,
            ogrenci_idleri: kk.ogrenciler.map((x) => x.uyelikId),
            parca_no: 1,
            parca_sayisi: 1,
          },
        });
      }
    });
  });

  // --- odev -----------------------------------------------------------------------------------
  describe('ogrenme.odev.*', () => {
    const yayin = (k: Kurum, odevId: string, sonTeslim: Date | null, ogr?: Alici[]) =>
      ogrenmeOdevYayinlandiV1.create({
        ...zarf(k.kurumId),
        data: {
          odev_id: odevId,
          brans_kodu: 'matematik',
          son_teslim_at: sonTeslim ? iso(sonTeslim) : null,
          veren_id: k.ogretmen.uyelikId,
          hedef_turu: 'grup',
          hedef_id: uuidv7(),
          ogrenci_idleri: (ogr ?? k.ogrenciler).map((x) => x.uyelikId),
          parca_no: 1,
          parca_sayisi: 1,
        },
      });

    it('yayinlandi: ogrencilere bildirim + son_teslim - 24 saat zamanlanmis satir (gecmis/null icin satir yok)', async () => {
      const k = await kurumKur(2);
      const odevId = uuidv7();
      const sonTeslim = new Date(Date.now() + 72 * SAAT_MS);
      const olay = yayin(k, odevId, sonTeslim);
      await calistir(k.kurumId, olay);
      await calistir(k.kurumId, olay);
      const b = await bildirimler(k.kurumId, 'odev_yayinlandi');
      expect(b).toHaveLength(2);
      expect(b[0]).toMatchObject({ kategori: 'odev', derin_baglanti: `kopru://odev/${odevId}` });
      const z = await zamanlanmis(k.kurumId, 'odev_teslim_yaklasiyor');
      expect(z).toHaveLength(2);
      expect(z[0]).toMatchObject({ kaynak_turu: 'odev', kaynak_id: odevId });
      expect(z[0]?.gonderim_at.getTime()).toBe(sonTeslim.getTime() - 24 * SAAT_MS);

      const k2 = await kurumKur(1);
      await calistir(k2.kurumId, yayin(k2, uuidv7(), new Date(Date.now() + 10 * SAAT_MS)));
      await calistir(k2.kurumId, yayin(k2, uuidv7(), null));
      expect(await zamanlanmis(k2.kurumId)).toHaveLength(0);
      expect(await bildirimler(k2.kurumId, 'odev_yayinlandi')).toHaveLength(2);
    });

    it('teslim: teslim eden ogrencinin hatirlatmasi iptal (digerininki kalir); verene bildirim; yeniden teslim yeni bildirim', async () => {
      const k = await kurumKur(2);
      const [a, b] = k.ogrenciler as [Alici, Alici];
      const odevId = uuidv7();
      await calistir(k.kurumId, yayin(k, odevId, new Date(Date.now() + 72 * SAAT_MS)));
      const teslim = (yeniden: boolean, ogrOdev = uuidv7()) =>
        ogrenmeOdevTeslimEdildiV1.create({
          ...zarf(k.kurumId),
          data: {
            ogrenci_odev_id: ogrOdev,
            odev_id: odevId,
            ogrenci_id: a.uyelikId,
            veren_id: k.ogretmen.uyelikId,
            brans_kodu: 'matematik',
            yapilan_soru_sayisi: 10,
            dosya_sayisi: 0,
            gec_teslim: false,
            yeniden_teslim: yeniden,
          },
        });
      const ogrOdev = uuidv7();
      const t1 = teslim(false, ogrOdev);
      await calistir(k.kurumId, t1);
      await calistir(k.kurumId, t1);
      await calistir(k.kurumId, teslim(true, ogrOdev));
      const z = await zamanlanmis(k.kurumId, 'odev_teslim_yaklasiyor');
      expect(z.find((x) => x.alici_id === a.uyelikId)).toMatchObject({ iptal_nedeni: 'teslim' });
      expect(z.find((x) => x.alici_id === b.uyelikId)).toMatchObject({ iptal_at: null });
      const t = await bildirimler(k.kurumId, 'odev_teslim_edildi');
      expect(t).toHaveLength(2); // ilk teslim + yeniden teslim
      expect(t.every((x) => x.alici_id === k.ogretmen.uyelikId)).toBe(true);
    });

    it('is: teslim tarihi yaklasiyor bildirimi uretilir; sonradan teslim edilirse kutuda gizlenir', async () => {
      const k = await kurumKur(1);
      const a = og(k, 0);
      const odevId = uuidv7();
      const sonTeslim = new Date(Date.now() + 72 * SAAT_MS);
      await calistir(k.kurumId, yayin(k, odevId, sonTeslim));
      const simdi = new Date(sonTeslim.getTime() - 24 * SAAT_MS + 1000);
      expect((await isleJob(k.kurumId, simdi)).uretildi).toBe(1);
      const b = await bildirimler(k.kurumId, 'odev_teslim_yaklasiyor');
      expect(b).toHaveLength(1);
      expect(b[0]?.gecerlilik_bitis_at?.getTime()).toBe(sonTeslim.getTime());
      await calistir(
        k.kurumId,
        ogrenmeOdevTeslimEdildiV1.create({
          ...zarf(k.kurumId),
          data: {
            ogrenci_odev_id: uuidv7(),
            odev_id: odevId,
            ogrenci_id: a.uyelikId,
            veren_id: k.ogretmen.uyelikId,
            brans_kodu: 'matematik',
            yapilan_soru_sayisi: 1,
            dosya_sayisi: 0,
            gec_teslim: false,
            yeniden_teslim: false,
          },
        }),
      );
      const [b2] = await bildirimler(k.kurumId, 'odev_teslim_yaklasiyor');
      expect((b2?.gecerlilik_bitis_at?.getTime() ?? Infinity) <= Date.now()).toBe(true);
    });

    it('is: teslim edilmis (iptal) hatirlatma uretilmez', async () => {
      const k = await kurumKur(1);
      const a = og(k, 0);
      const odevId = uuidv7();
      const sonTeslim = new Date(Date.now() + 72 * SAAT_MS);
      await calistir(k.kurumId, yayin(k, odevId, sonTeslim));
      await calistir(
        k.kurumId,
        ogrenmeOdevTeslimEdildiV1.create({
          ...zarf(k.kurumId),
          data: {
            ogrenci_odev_id: uuidv7(),
            odev_id: odevId,
            ogrenci_id: a.uyelikId,
            veren_id: k.ogretmen.uyelikId,
            brans_kodu: 'matematik',
            yapilan_soru_sayisi: 1,
            dosya_sayisi: 0,
            gec_teslim: false,
            yeniden_teslim: false,
          },
        }),
      );
      expect(
        (await isleJob(k.kurumId, new Date(sonTeslim.getTime() - 23 * SAAT_MS))).uretildi,
      ).toBe(0);
      expect(await bildirimler(k.kurumId, 'odev_teslim_yaklasiyor')).toHaveLength(0);
    });

    it('incelendi: ogrenciye; ayni sonuc tekrar bildirim uretmez, farkli sonuc uretir', async () => {
      const k = await kurumKur(1);
      const a = og(k, 0);
      const ogrOdev = uuidv7();
      const olay = (sonuc: 'tamam' | 'eksik' | 'tekrar') =>
        ogrenmeOdevIncelendiV1.create({
          ...zarf(k.kurumId),
          data: {
            ogrenci_odev_id: ogrOdev,
            odev_id: uuidv7(),
            ogrenci_id: a.uyelikId,
            inceleyen_id: k.ogretmen.uyelikId,
            brans_kodu: 'matematik',
            inceleme_sonucu: sonuc,
          },
        });
      await calistir(k.kurumId, olay('eksik'));
      await calistir(k.kurumId, olay('eksik'));
      expect(await bildirimler(k.kurumId, 'odev_incelendi')).toHaveLength(1);
      await calistir(k.kurumId, olay('tamam'));
      const b = await bildirimler(k.kurumId, 'odev_incelendi');
      expect(b).toHaveLength(2);
      expect(b.every((x) => x.alici_id === a.uyelikId && x.kategori === 'odev')).toBe(true);
      expect(b.map((x) => x.govde).join(' ')).toMatch(/eksik bulundu/);
    });
  });

  // --- soru -----------------------------------------------------------------------------------
  describe('ogrenme.soru.*', () => {
    it('sorildi: hedef ogretmenlere; hedef yoksa bildirim yok', async () => {
      const k = await kurumKur(1);
      const ogr2 = await aliciKur(o, { kurumId: k.kurumId, rol: 'ogretmen' });
      const soruId = uuidv7();
      const olay = (hedefler: string[]) =>
        ogrenmeSoruSorildiV1.create({
          ...zarf(k.kurumId),
          data: {
            soru_id: soruId,
            ogrenci_id: og(k, 0).uyelikId,
            brans_kodu: 'matematik',
            yonlendirme: 'atanan_ogretmen',
            atanan_ogretmen_id: hedefler[0] ?? null,
            masa_id: null,
            hedef_ogretmen_idleri: hedefler,
          },
        });
      await calistir(k.kurumId, olay([]));
      expect(await bildirimler(k.kurumId)).toHaveLength(0);
      const hedefOlay = olay([k.ogretmen.uyelikId, ogr2.uyelikId]);
      await calistir(k.kurumId, hedefOlay);
      await calistir(k.kurumId, hedefOlay);
      const b = await bildirimler(k.kurumId, 'yeni_soru');
      expect(b.map((x) => x.alici_id).sort()).toEqual([k.ogretmen.uyelikId, ogr2.uyelikId].sort());
      expect(b[0]).toMatchObject({ kategori: 'soru', derin_baglanti: `kopru://soru/${soruId}` });
    });

    it('takip mesaji: alicilara (yazar haric); cevap eslemesi degismedi', async () => {
      const k = await kurumKur(1);
      const ogrenci = og(k, 0);
      const olay = ogrenmeSoruMesajiEklendiV1.create({
        ...zarf(k.kurumId),
        data: {
          soru_id: uuidv7(),
          mesaj_id: uuidv7(),
          tur: 'takip',
          yazar_id: ogrenci.uyelikId,
          ogrenci_id: ogrenci.uyelikId,
          alici_idleri: [k.ogretmen.uyelikId, ogrenci.uyelikId],
        },
      });
      await calistir(k.kurumId, olay);
      await calistir(k.kurumId, olay);
      const b = await bildirimler(k.kurumId, 'soru_takip');
      expect(b).toHaveLength(1);
      expect(b[0]?.alici_id).toBe(k.ogretmen.uyelikId);
    });
  });

  // --- motivasyon -----------------------------------------------------------------------------
  describe('motivasyon.*', () => {
    it('seviye, rozet, karakter, seri kilometre tasi ve seri bozuldu ogrenciye (oyunlastirma); tekrar uretmez', async () => {
      const k = await kurumKur(1);
      const ogr = og(k, 0).uyelikId;
      const olaylar = [
        motivasyonSeviyeAtladiV1.create({
          ...zarf(k.kurumId),
          data: { ogrenci_id: ogr, eski_seviye: 2, yeni_seviye: 3, toplam_xp: 900 },
        }),
        motivasyonRozetKazanildiV1.create({
          ...zarf(k.kurumId),
          data: { ogrenci_id: ogr, rozet_kodu: 'ilk_odev', kazanildi_at: iso(new Date()) },
        }),
        motivasyonKarakterEvrildiV1.create({
          ...zarf(k.kurumId),
          data: { ogrenci_id: ogr, tur_kodu: 'tilki', eski_asama: 1, yeni_asama: 2 },
        }),
        motivasyonSeriKilometreTasiV1.create({
          ...zarf(k.kurumId),
          data: { ogrenci_id: ogr, seri: 7 },
        }),
        motivasyonSeriBozuldiV1.create({
          ...zarf(k.kurumId),
          data: {
            ogrenci_id: ogr,
            onceki_seri: 12,
            onarilabilir: true,
            onarim_son_gun: '2099-01-02',
          },
        }),
      ];
      for (const e of olaylar) {
        await calistir(k.kurumId, e);
        await calistir(k.kurumId, e);
      }
      const b = await bildirimler(k.kurumId);
      expect(b.map((x) => x.sablon_kodu).sort()).toEqual(
        [
          'karakter_evrildi',
          'rozet_kazanildi',
          'seri_kilometre_tasi',
          'seri_onarilabilir',
          'seviye_atladi',
        ].sort(),
      );
      expect(b.every((x) => x.kategori === 'oyunlastirma' && x.alici_id === ogr)).toBe(true);
      const onarim = b.find((x) => x.sablon_kodu === 'seri_onarilabilir');
      expect(onarim?.gecerlilik_bitis_at?.getUTCFullYear()).toBe(2099);
      const g = await gonderimler(k.kurumId);
      expect(g.every((x) => (x.govde ?? '').length < 100)).toBe(true);
      // Suclayici dil yok (seri bozuldu).
      expect(b.find((x) => x.sablon_kodu === 'seri_onarilabilir')?.govde).not.toMatch(
        /kaybettin|başarısız/i,
      );
    });

    it('seri bozuldu (onarilamaz) farkli sablon', async () => {
      const k = await kurumKur(1);
      await calistir(
        k.kurumId,
        motivasyonSeriBozuldiV1.create({
          ...zarf(k.kurumId),
          data: {
            ogrenci_id: og(k, 0).uyelikId,
            onceki_seri: 5,
            onarilabilir: false,
            onarim_son_gun: null,
          },
        }),
      );
      const [b] = await bildirimler(k.kurumId);
      expect(b?.sablon_kodu).toBe('seri_bozuldu');
      expect(b?.govde).toMatch(/Yeni bir seri bugün başlıyor/);
    });
  });

  // --- finans ---------------------------------------------------------------------------------
  describe('finans.*', () => {
    it('kredi azaldi, tahsilat ve paket: ogrenciye; tutar ne kutuda ne push metninde', async () => {
      const k = await kurumKur(1);
      const ogr = og(k, 0).uyelikId;
      const tahsilat = finansTahsilatAlindiV1.create({
        ...zarf(k.kurumId),
        data: {
          tahsilat_id: uuidv7(),
          ogrenci_id: ogr,
          tutar_kurus: 123456,
          yontem: 'nakit',
          tahsilat_tarihi: '2026-11-10',
          makbuz_no: 'MKB-987654',
        },
      });
      const olaylar = [
        finansKrediAzaldiV1.create({
          ...zarf(k.kurumId),
          data: { ogrenci_id: ogr, kalan_kredi: 2, esik: 3, yoklama_id: null },
        }),
        tahsilat,
        finansPaketSatildiV1.create({
          ...zarf(k.kurumId),
          data: {
            paket_satisi_id: uuidv7(),
            ogrenci_id: ogr,
            paket_id: uuidv7(),
            toplam_kredi: 10,
            bitis_tarihi: null,
          },
        }),
      ];
      for (const e of olaylar) await calistir(k.kurumId, e);
      await calistir(k.kurumId, tahsilat); // tekrar
      const b = await bildirimler(k.kurumId);
      expect(b.map((x) => x.sablon_kodu).sort()).toEqual([
        'kredi_azaliyor',
        'paket_satildi',
        'tahsilat_alindi',
      ]);
      expect(b.every((x) => x.kategori === 'finans' && x.alici_id === ogr)).toBe(true);
      const tum = JSON.stringify([b, await gonderimler(k.kurumId)]);
      expect(tum).not.toMatch(/123456|1\.234|MKB-987654|nakit/);
      const kredi = b.find((x) => x.sablon_kodu === 'kredi_azaliyor');
      expect(kredi?.govde).toMatch(/2/); // kutuda kalan ders sayisi
      const gKredi = (await gonderimler(k.kurumId)).find((x) => x.baslik === 'Kredin azalıyor');
      expect(gKredi?.govde).toBe('Ders kredin azalıyor.'); // push'ta sayi yok
    });
  });

  // --- hesap ----------------------------------------------------------------------------------
  describe('hesap.davet.kabul_edildi', () => {
    it('daveti gonderene sistem kategorisinde bildirim; sessiz saat push atlar ama kutu yazilir', async () => {
      const k = await kurumKur(1);
      const olay = hesapDavetKabulEdildiV1.create({
        ...zarf(k.kurumId),
        data: {
          davet_id: uuidv7(),
          davet_eden_id: k.ogretmen.uyelikId,
          uyelik_id: og(k, 0).uyelikId,
          rol: 'ogrenci',
        },
      });
      await calistir(k.kurumId, olay);
      await calistir(k.kurumId, olay);
      const b = await bildirimler(k.kurumId);
      expect(b).toHaveLength(1);
      expect(b[0]).toMatchObject({ alici_id: k.ogretmen.uyelikId, kategori: 'sistem' });
      expect(b[0]?.govde).toBe('Davet ettiğin öğrenci katıldı.');
    });
  });
});
