import {
  hesapAtamaDegistiV1,
  hesapGrupDegistiV1,
  hesapGrupUyesiDegistiV1,
  hesapKademeDegistiV1,
  hesapKurumDegistiV1,
  hesapModulAyariDegistiV1,
  hesapUyelikDegistiV1,
} from '@kopru/contracts';
import { createDb, type Database } from '@kopru/service-kit';
import postgres from 'postgres';
import { uuidv7 } from 'uuidv7';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  hesapOlaylariniYenidenYayimla,
  YENIDEN_YAYIMLA_KORELASYON_ON_EKI,
} from './sistem/olaylari-yeniden-yayimla.js';
import { dersYardimcilari, type Kurulum } from './test/ders-yardimcilar.js';
import { dbYok, testDb, testServisi } from './test/yardimcilar.js';

const TANIMLAR = {
  kurum: [hesapKurumDegistiV1, 'kurum_id'],
  kademe: [hesapKademeDegistiV1, 'kademe_id'],
  uyelik: [hesapUyelikDegistiV1, 'uyelik_id'],
  grup: [hesapGrupDegistiV1, 'grup_id'],
  grup_uyesi: [hesapGrupUyesiDegistiV1, 'grup_uyesi_id'],
  atama: [hesapAtamaDegistiV1, 'atama_id'],
  modul_ayari: [hesapModulAyariDegistiV1, 'modul_ayari_id'],
} as const;
type Tur = keyof typeof TANIMLAR;
const TURLER = Object.keys(TANIMLAR) as Tur[];

interface Satir {
  id: string;
  subject: string;
  payload: {
    id: string;
    type: string;
    actor: { tur: string; id: string };
    correlationId: string;
    kurumId: string;
    data: Record<string, unknown>;
  };
}

describe.skipIf(dbYok())('hesap olaylarini yeniden yayimlama', () => {
  const urls = testDb();
  const t = testServisi({ RATE_LIMIT_MAX: '100000' });
  let sistem: postgres.Sql;
  let sistemDb: Database;
  let y: ReturnType<typeof dersYardimcilari>;
  let a: Kurulum;
  let b: Kurulum;
  /** API'nin kurulum sirasinda urettigi (yeniden yayimlama olmayan) olaylarin son hali: ozne kimligi -> veri. */
  const gercekSon = new Map<string, Record<string, unknown>>();

  const tablo: Record<Tur, string> = {
    kurum: 'hesap.kurumlar',
    kademe: 'hesap.kademeler',
    uyelik: 'hesap.uyelikler',
    grup: 'hesap.gruplar',
    grup_uyesi: 'hesap.grup_uyeleri',
    atama: 'hesap.atamalar',
    modul_ayari: 'hesap.modul_ayarlari',
  };

  async function satirSayilari(kurumId: string): Promise<Record<Tur, number>> {
    const sonuc = {} as Record<Tur, number>;
    for (const tur of TURLER) {
      const kolon = tur === 'kurum' ? 'id' : 'kurum_id';
      const [r] = await sistem.unsafe<{ n: number }[]>(
        `select count(*)::int n from ${tablo[tur]} where ${kolon} = $1`,
        [kurumId],
      );
      sonuc[tur] = r?.n ?? 0;
    }
    return sonuc;
  }

  const yenidenYayimlananlar = (kurumId: string, calistirmaId?: string) =>
    sistem<Satir[]>`
      select id, subject, payload from ortak.outbox
      where kurum_id = ${kurumId}
        and payload->>'correlationId' like ${`${YENIDEN_YAYIMLA_KORELASYON_ON_EKI}${calistirmaId ?? ''}%`}
      order by id`;

  const tumOutbox = async () =>
    // Diger test dosyalari paylasilan veritabanina paralel yazar: yalniz bu testin kurumlari sayilir.
    (
      await sistem<{ n: number }[]>`
        select count(*)::int n from ortak.outbox where kurum_id in (${a.k.kurumId}, ${b.k.kurumId})`
    )[0]?.n ?? 0;
  const denetim = async () =>
    (
      await sistem<{ n: number }[]>`
        select count(*)::int n from hesap.denetim_kayitlari where eylem = 'sistem.olaylari_yeniden_yayimla'`
    )[0]?.n ?? 0;

  const tureGore = (satirlar: Satir[]) => {
    const g = Object.fromEntries(TURLER.map((tur) => [tur, [] as Satir[]])) as Record<Tur, Satir[]>;
    for (const s of satirlar) {
      const tur = TURLER.find((x) => TANIMLAR[x][0].subject === s.subject);
      if (!tur) throw new Error(`beklenmeyen olay: ${s.subject}`);
      g[tur].push(s);
    }
    return g;
  };

  beforeAll(async () => {
    if (!urls) return;
    sistem = postgres(urls.sistemUrl, { max: 3, onnotice: () => undefined });
    sistemDb = createDb({ url: urls.sistemUrl, max: 4 });
    y = dersYardimcilari({ t, sistem });
    a = await y.kur({ ogrenciSayisi: 2 });
    b = await y.kur({ ogrenciSayisi: 1 });

    // API'nin kendi urettigi olaylarin son hali (karsilastirma icin), ekstra veri eklenmeden once.
    for (const kurulum of [a, b]) {
      const satirlar = await sistem<Satir[]>`
        select id, subject, payload from ortak.outbox where kurum_id = ${kurulum.k.kurumId} order by id`;
      for (const s of satirlar) {
        const tur = TURLER.find((x) => TANIMLAR[x][0].subject === s.subject);
        if (!tur) continue;
        gercekSon.set(`${tur}:${String(s.payload.data[TANIMLAR[tur][1]])}`, s.payload.data);
      }
    }

    // Kenar durumlar: arsivlenmis grup, bitmis grup uyeligi, ayrilmis uyelik, arsiv kademe, modul ayarlari.
    for (const s of [a, b]) {
      const kurumId = s.k.kurumId;
      const grup2 = uuidv7();
      await sistem`insert into hesap.gruplar (id, kurum_id, tur, ad, durum, arsivlendi_at)
        values (${grup2}, ${kurumId}, 'sinif', 'Arsiv sinif', 'arsiv', now())`;
      const ogr = s.ogrenciler[0] ?? '';
      await sistem`insert into hesap.grup_uyeleri (id, kurum_id, grup_id, ogrenci_id, baslangic_tarihi, bitis_tarihi)
        values (${uuidv7()}, ${kurumId}, ${grup2}, ${ogr}, current_date - 10, current_date - 3)`;
      const kullanici = uuidv7();
      await sistem`insert into hesap.kullanicilar (id, telefon_e164) values (${kullanici}, ${`+9054${String(Math.floor(Math.random() * 90_000_000 + 10_000_000))}`})`;
      await sistem`insert into hesap.uyelikler (id, kurum_id, kullanici_id, rol, durum, gorunen_ad, ayrildi_at)
        values (${uuidv7()}, ${kurumId}, ${kullanici}, 'ogrenci', 'ayrildi', 'Gizli Ad', now())`;
      await sistem`insert into hesap.kademeler (id, kurum_id, ad, seviye, arsivlendi_at)
        values (${uuidv7()}, ${kurumId}, 'Arsiv kademe', 5, now())`;
      await sistem`insert into hesap.modul_ayarlari (id, kurum_id, modul_kodu, kapsam, kapsam_id, acik)
        values (${uuidv7()}, ${kurumId}, 'oyunlastirma', 'kurum', ${kurumId}, false),
               (${uuidv7()}, ${kurumId}, 'oyunlastirma', 'grup', ${s.grup.id}, true)`;
    }
  });
  afterAll(async () => {
    await sistemDb.close();
    await t.service.stop();
    await sistem.end();
  });

  it('--kuru yalniz sayar: outbox ve denetim kaydi degismez, sayilar tablolarla ayni', async () => {
    const oncekiOutbox = await tumOutbox();
    const oncekiDenetim = await denetim();
    const ozet = await hesapOlaylariniYenidenYayimla(sistemDb, {
      kurumIdleri: [a.k.kurumId, b.k.kurumId],
      kuru: true,
    });
    expect(await tumOutbox()).toBe(oncekiOutbox);
    expect(await denetim()).toBe(oncekiDenetim);
    expect(ozet).toMatchObject({ kuru: true, kurum: 2, hatalar: [] });
    const sa = await satirSayilari(a.k.kurumId);
    const sb = await satirSayilari(b.k.kurumId);
    for (const tur of TURLER) expect(ozet.olaylar[tur]).toBe(sa[tur] + sb[tur]);
    expect(ozet.toplam).toBe(Object.values(ozet.olaylar).reduce((x, n) => x + n, 0));
    // Kurulum anlamli: her turde en az bir satir (kurum basina) var.
    for (const tur of TURLER) expect(sa[tur]).toBeGreaterThanOrEqual(1);
    expect(sa.grup).toBeGreaterThanOrEqual(2);
  });

  it('her tablo satiri icin sozlesme semasina uyan bir olay yazar; --kurum suzgeci yalniz o kurumu kapsar', async () => {
    const onceB = (await yenidenYayimlananlar(b.k.kurumId)).length;
    const ozet = await hesapOlaylariniYenidenYayimla(sistemDb, { kurumIdleri: [a.k.kurumId] });
    expect(ozet).toMatchObject({ kuru: false, kurum: 1, hatalar: [] });
    expect((await yenidenYayimlananlar(b.k.kurumId)).length).toBe(onceB);

    const satirlar = await yenidenYayimlananlar(a.k.kurumId, ozet.calistirmaId);
    const g = tureGore(satirlar);
    const sayilar = await satirSayilari(a.k.kurumId);
    for (const tur of TURLER) {
      expect(g[tur], tur).toHaveLength(sayilar[tur]);
      expect(ozet.olaylar[tur]).toBe(sayilar[tur]);
    }
    for (const s of satirlar) {
      const tur = TURLER.find((x) => TANIMLAR[x][0].subject === s.subject);
      if (!tur) throw new Error('tur yok');
      // Sozlesme semasiyla birebir dogrulama (zarf + yuk).
      expect(() => TANIMLAR[tur][0].parse(s.payload)).not.toThrow();
      expect(s.payload.actor).toEqual({ tur: 'sistem', id: 'olay-yeniden-yayimla' });
      expect(s.payload.kurumId).toBe(a.k.kurumId);
      // Kisisel veri yok.
      const metin = JSON.stringify(s.payload);
      expect(metin).not.toContain('Gizli Ad');
      expect(metin).not.toMatch(/gorunen_ad|telefon|eposta|\+90/);
    }
    // Hepsi tek calistirma kimligi altinda.
    expect(new Set(satirlar.map((s) => s.payload.correlationId)).size).toBe(1);
  });

  it('yuk, mevcut olay uretim kodunun urettigiyle ayni (degismemis satirlar icin)', async () => {
    const ozet = await hesapOlaylariniYenidenYayimla(sistemDb, { kurumIdleri: [a.k.kurumId] });
    const satirlar = await yenidenYayimlananlar(a.k.kurumId, ozet.calistirmaId);
    const g = tureGore(satirlar);
    let karsilastirilan = 0;
    for (const tur of TURLER) {
      for (const s of g[tur]) {
        const gercek = gercekSon.get(`${tur}:${String(s.payload.data[TANIMLAR[tur][1]])}`);
        if (!gercek) continue; // API'nin olay uretmedigi satir (dogrudan SQL ile eklenenler)
        expect(s.payload.data, tur).toEqual(gercek);
        karsilastirilan++;
      }
    }
    // kurum + kademeler + uyelikler + grup + atama icin karsilastirma yapilmis olmali.
    expect(karsilastirilan).toBeGreaterThanOrEqual(5);
    for (const tur of ['kurum', 'kademe', 'uyelik', 'grup', 'atama'] as const) {
      expect(
        g[tur].some((s) => gercekSon.has(`${tur}:${String(s.payload.data[TANIMLAR[tur][1]])}`)),
        tur,
      ).toBe(true);
    }
  });

  it('pasif varliklar durumlariyla yayimlanir: arsiv grup, ayrilmis uyelik, arsiv kademe, bitmis grup uyeligi', async () => {
    const ozet = await hesapOlaylariniYenidenYayimla(sistemDb, { kurumIdleri: [b.k.kurumId] });
    const g = tureGore(await yenidenYayimlananlar(b.k.kurumId, ozet.calistirmaId));
    expect(g.grup.some((s) => s.payload.data.durum === 'arsiv')).toBe(true);
    expect(g.uyelik.some((s) => s.payload.data.durum === 'ayrildi')).toBe(true);
    expect(g.kademe.some((s) => s.payload.data.arsivlendi === true)).toBe(true);
    expect(g.grup_uyesi.some((s) => s.payload.data.bitis_tarihi !== null)).toBe(true);
    expect(g.modul_ayari.map((s) => s.payload.data.acik).sort()).toEqual([false, true]);
  });

  it('ikinci calistirma ayni durumu yeni (daha buyuk) olay kimlikleriyle yazar; parca boyutu sonucu degistirmez', async () => {
    const ilk = await hesapOlaylariniYenidenYayimla(sistemDb, { kurumIdleri: [b.k.kurumId] });
    const ikinci = await hesapOlaylariniYenidenYayimla(sistemDb, {
      kurumIdleri: [b.k.kurumId],
      parca: 1,
    });
    expect(ikinci.olaylar).toEqual(ilk.olaylar);
    const s1 = await yenidenYayimlananlar(b.k.kurumId, ilk.calistirmaId);
    const s2 = await yenidenYayimlananlar(b.k.kurumId, ikinci.calistirmaId);
    expect(s2).toHaveLength(s1.length);
    const veriler = (l: Satir[]) =>
      l.map((s) => JSON.stringify([s.subject, s.payload.data])).sort();
    expect(veriler(s2)).toEqual(veriler(s1));
    // UUIDv7: ikinci calistirmanin tum olaylari birincinin hepsinden sonra gelir.
    const enBuyuk1 =
      s1
        .map((s) => s.id)
        .sort()
        .at(-1) ?? '';
    for (const s of s2) expect(s.id > enBuyuk1).toBe(true);
  });

  it('suzgec yoksa tum kurumlar kapsanir; bilinmeyen kurum hata verir; denetim kaydi yazilir', async () => {
    const kuru = await hesapOlaylariniYenidenYayimla(sistemDb, { kuru: true });
    expect(kuru.kurum).toBeGreaterThanOrEqual(2);
    const sa = await satirSayilari(a.k.kurumId);
    expect(kuru.olaylar.kurum).toBeGreaterThanOrEqual(2);
    expect(kuru.olaylar.grup).toBeGreaterThanOrEqual(sa.grup);
    await expect(
      hesapOlaylariniYenidenYayimla(sistemDb, { kurumIdleri: [uuidv7()], kuru: true }),
    ).rejects.toThrow(/kurum bulunamadı/);
    const [d] = await sistem<{ n: number }[]>`
      select count(*)::int n from hesap.denetim_kayitlari
      where eylem = 'sistem.olaylari_yeniden_yayimla' and kurum_id = ${a.k.kurumId}`;
    expect(d?.n ?? 0).toBeGreaterThan(0);
  });

  it('sistem baglantisi yoksa acik hata verir', async () => {
    await expect(hesapOlaylariniYenidenYayimla(null)).rejects.toThrow(/DATABASE_SISTEM_URL/);
  });
});
