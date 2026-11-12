import {
  hesapAtamaDegistiV1,
  hesapGrupDegistiV1,
  hesapGrupUyesiDegistiV1,
  hesapKurumDegistiV1,
  hesapModulAyariDegistiV1,
  hesapUyelikDegistiV1,
} from '@kopru/contracts';
import { uuidv7 } from 'uuidv7';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  atamaDegisti,
  grupDegisti,
  grupUyesiDegisti,
  kurumDegisti,
  modulAyariDegisti,
  uyelikDegisti,
} from './kopya.js';
import { T0, dk, ortamKur, type Ortam } from './test/ortam.js';
import { dbYok } from './test/yardimcilar.js';

describe.skipIf(dbYok())('hesap kopyalari (motivasyon.kopya isleyicileri)', () => {
  let o: Ortam;
  beforeAll(() => {
    o = ortamKur();
  });
  afterAll(async () => {
    await o.kapat();
  });

  const zarf = (kurumId: string, at: Date, id?: string) => ({
    kurumId,
    actor: { tur: 'sistem', id: 'olay-yeniden-yayimla' } as const,
    correlationId: 'k',
    occurredAt: at,
    ...(id ? { id } : {}),
  });

  it('kurum: upsert, eski olay yok sayilir, ayni durumun yeniden yayimi etkisiz', async () => {
    const kurumId = uuidv7();
    const veri = (durum: 'aktif' | 'askida', tz = 'Europe/Istanbul') => ({
      kurum_id: kurumId,
      ad: 'Kurum',
      tur: 'kurum' as const,
      saat_dilimi: tz,
      durum,
    });
    const yaz = (at: Date, durum: 'aktif' | 'askida', tz?: string, id?: string) =>
      o.isle(kurumId, (tx) =>
        kurumDegisti(
          tx,
          hesapKurumDegistiV1.create({ ...zarf(kurumId, at, id), data: veri(durum, tz) }),
        ),
      );
    const oku = async () =>
      (
        await o.sistem<{ durum: string; saat_dilimi: string }[]>`
          select durum, saat_dilimi from motivasyon.kurum_kopyalari where kurum_id = ${kurumId}`
      )[0];
    await yaz(dk(T0, 5), 'askida', 'Asia/Tokyo');
    expect(await oku()).toEqual({ durum: 'askida', saat_dilimi: 'Asia/Tokyo' });
    await yaz(T0, 'aktif'); // daha eski olay
    expect(await oku()).toEqual({ durum: 'askida', saat_dilimi: 'Asia/Tokyo' });
    // yeniden yayim: ayni durum, yeni kimlik ve yeni zaman -> etkisiz (ayni deger)
    await yaz(dk(T0, 60), 'askida', 'Asia/Tokyo');
    expect(await oku()).toEqual({ durum: 'askida', saat_dilimi: 'Asia/Tokyo' });
    await yaz(dk(T0, 61), 'aktif');
    expect(await oku()).toEqual({ durum: 'aktif', saat_dilimi: 'Europe/Istanbul' });
  });

  it('esit zamanda buyuk olay kimligi kazanir', async () => {
    const kurumId = uuidv7();
    const kucuk = '0190b2f0-7c3a-7a1e-8d5b-000000000001';
    const buyuk = '0190b2f0-7c3a-7a1e-8d5b-000000000002';
    const yaz = (id: string, durum: 'aktif' | 'askida') =>
      o.isle(kurumId, (tx) =>
        kurumDegisti(
          tx,
          hesapKurumDegistiV1.create({
            ...zarf(kurumId, T0, id),
            data: {
              kurum_id: kurumId,
              ad: 'K',
              tur: 'kurum',
              saat_dilimi: 'Europe/Istanbul',
              durum,
            },
          }),
        ),
      );
    await yaz(buyuk, 'askida');
    await yaz(kucuk, 'aktif');
    const [k] = await o.sistem<{ durum: string }[]>`
      select durum from motivasyon.kurum_kopyalari where kurum_id = ${kurumId}`;
    expect(k?.durum).toBe('askida');
  });

  it('gecersiz saat dilimi kalici hatadir', async () => {
    const kurumId = uuidv7();
    await expect(
      o.isle(kurumId, (tx) =>
        kurumDegisti(
          tx,
          hesapKurumDegistiV1.create({
            ...zarf(kurumId, T0),
            data: {
              kurum_id: kurumId,
              ad: 'K',
              tur: 'kurum',
              saat_dilimi: 'Mars/Olympus',
              durum: 'aktif',
            },
          }),
        ),
      ),
    ).rejects.toMatchObject({ name: 'KaliciHata' });
  });

  it('uyelik, grup, grup uyesi, atama kopyalari upsert edilir ve eski olay ezmez', async () => {
    const kurumId = uuidv7();
    const uyelikId = uuidv7();
    const grupId = uuidv7();
    const ogretmenId = uuidv7();
    const kademe = uuidv7();
    await o.isle(kurumId, async (tx) => {
      await uyelikDegisti(
        tx,
        hesapUyelikDegistiV1.create({
          ...zarf(kurumId, dk(T0, 10)),
          data: {
            uyelik_id: uyelikId,
            kullanici_id: uuidv7(),
            rol: 'ogrenci',
            durum: 'aktif',
            sube_id: null,
            kademe_id: kademe,
          },
        }),
      );
      await uyelikDegisti(
        tx,
        hesapUyelikDegistiV1.create({
          ...zarf(kurumId, T0),
          data: {
            uyelik_id: uyelikId,
            kullanici_id: uuidv7(),
            rol: 'ogrenci',
            durum: 'ayrildi',
            sube_id: null,
            kademe_id: null,
          },
        }),
      );
      await grupDegisti(
        tx,
        hesapGrupDegistiV1.create({
          ...zarf(kurumId, T0),
          data: {
            grup_id: grupId,
            tur: 'grup',
            ad: 'G',
            kademe_id: kademe,
            sube_id: null,
            durum: 'aktif',
          },
        }),
      );
      await grupUyesiDegisti(
        tx,
        hesapGrupUyesiDegistiV1.create({
          ...zarf(kurumId, T0),
          data: {
            grup_uyesi_id: uuidv7(),
            grup_id: grupId,
            ogrenci_id: uyelikId,
            baslangic_tarihi: '2026-09-01',
            bitis_tarihi: null,
          },
        }),
      );
      await grupUyesiDegisti(
        tx,
        hesapGrupUyesiDegistiV1.create({
          ...zarf(kurumId, dk(T0, 1)),
          data: {
            grup_uyesi_id: uuidv7(),
            grup_id: grupId,
            ogrenci_id: uyelikId,
            baslangic_tarihi: '2026-09-01',
            bitis_tarihi: '2026-11-01',
          },
        }),
      );
      await atamaDegisti(
        tx,
        hesapAtamaDegistiV1.create({
          ...zarf(kurumId, T0),
          data: {
            atama_id: uuidv7(),
            grup_id: grupId,
            ogretmen_id: ogretmenId,
            brans_kodu: 'matematik',
            baslangic_tarihi: '2026-09-01',
            bitis_tarihi: null,
            ana_ogretmen: true,
          },
        }),
      );
    });
    const [u] = await o.sistem<{ durum: string; kademe_id: string }[]>`
      select durum, kademe_id from motivasyon.uyelik_kopyalari where uyelik_id = ${uyelikId}`;
    expect(u).toEqual({ durum: 'aktif', kademe_id: kademe });
    const [m] = await o.sistem<{ bitis: string }[]>`
      select bitis_tarihi::text as bitis from motivasyon.grup_uyesi_kopyalari where grup_id = ${grupId}`;
    expect(m?.bitis).toBe('2026-11-01');
    const [a] = await o.sistem<{ n: number }[]>`
      select count(*)::int n from motivasyon.atama_kopyalari where ogretmen_id = ${ogretmenId}`;
    expect(a?.n).toBe(1);
  });

  it('modul ayari: upsert, mirasa donus (acik: null) satiri siler, eski null silmez', async () => {
    const kurumId = uuidv7();
    const yaz = (at: Date, acik: boolean | null) =>
      o.isle(kurumId, (tx) =>
        modulAyariDegisti(
          tx,
          hesapModulAyariDegistiV1.create({
            ...zarf(kurumId, at),
            data: {
              modul_ayari_id: uuidv7(),
              modul_kodu: 'oyunlastirma',
              kapsam: 'kurum',
              kapsam_id: kurumId,
              acik,
            },
          }),
        ),
      );
    const say = async () =>
      (
        await o.sistem<{ n: number; acik: boolean | null }[]>`
          select count(*)::int n, bool_and(acik) acik from motivasyon.modul_ayari_kopyalari where kurum_id = ${kurumId}`
      )[0];
    await yaz(dk(T0, 5), false);
    expect(await say()).toEqual({ n: 1, acik: false });
    await yaz(T0, true); // eski: etkisiz
    expect(await say()).toEqual({ n: 1, acik: false });
    await yaz(T0, null); // eski mirasa donus: silmez
    expect(await say()).toEqual({ n: 1, acik: false });
    await yaz(dk(T0, 10), null); // yeni mirasa donus: siler
    expect(await say()).toEqual({ n: 0, acik: null });
  });
});
