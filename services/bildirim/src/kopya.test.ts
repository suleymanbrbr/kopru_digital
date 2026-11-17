import {
  hesapAtamaDegistiV1,
  hesapGrupDegistiV1,
  hesapGrupUyesiDegistiV1,
  hesapKademeDegistiV1,
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
  kademeDegisti,
  kurumDegisti,
  modulAyariDegisti,
  uyelikDegisti,
} from './kopya.js';
import { T0, dk, ortamKur, type Ortam } from './test/ortam.js';
import { dbYok } from './test/yardimcilar.js';

describe.skipIf(dbYok())('hesap kopyalari (bildirim.kopya isleyicileri)', () => {
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
    const yaz = (at: Date, durum: 'aktif' | 'askida', ad = 'Kurum', id?: string) =>
      o.isle(kurumId, (tx) =>
        kurumDegisti(
          tx,
          hesapKurumDegistiV1.create({
            ...zarf(kurumId, at, id),
            data: {
              kurum_id: kurumId,
              ad,
              tur: 'kurum',
              saat_dilimi: 'Europe/Istanbul',
              durum,
            },
          }),
        ),
      );
    const oku = async () =>
      (
        await o.sistem<{ durum: string; ad: string }[]>`
          select durum, ad from bildirim.kurum_kopyalari where kurum_id = ${kurumId}`
      )[0];
    await yaz(dk(T0, 5), 'askida', 'Yeni Ad');
    expect(await oku()).toEqual({ durum: 'askida', ad: 'Yeni Ad' });
    await yaz(T0, 'aktif', 'Eski Ad'); // daha eski olay
    expect(await oku()).toEqual({ durum: 'askida', ad: 'Yeni Ad' });
    await yaz(dk(T0, 60), 'askida', 'Yeni Ad'); // yeniden yayim
    expect(await oku()).toEqual({ durum: 'askida', ad: 'Yeni Ad' });
    await yaz(dk(T0, 61), 'aktif', 'Yeni Ad');
    expect(await oku()).toEqual({ durum: 'aktif', ad: 'Yeni Ad' });
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
      select durum from bildirim.kurum_kopyalari where kurum_id = ${kurumId}`;
    expect(k?.durum).toBe('askida');
  });

  it('kurum: zarf kurumuyla yuk uyusmazsa kalici hata', async () => {
    const kurumId = uuidv7();
    await expect(
      o.isle(kurumId, (tx) =>
        kurumDegisti(
          tx,
          hesapKurumDegistiV1.create({
            ...zarf(kurumId, T0),
            data: {
              kurum_id: uuidv7(),
              ad: 'K',
              tur: 'kurum',
              saat_dilimi: 'Europe/Istanbul',
              durum: 'aktif',
            },
          }),
        ),
      ),
    ).rejects.toThrow(/uyuşmuyor/);
  });

  it('kurum: gecersiz saat dilimi kalici hata', async () => {
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
    ).rejects.toThrow(/saat dilimi/);
  });

  it('uyelik: upsert ve sira korumasi (iletisim bilgisi kopyalanmaz)', async () => {
    const kurumId = uuidv7();
    const uyelikId = uuidv7();
    const kullaniciId = uuidv7();
    const yaz = (at: Date, rol: 'ogrenci' | 'ogretmen', durum: 'aktif' | 'ayrildi') =>
      o.isle(kurumId, (tx) =>
        uyelikDegisti(
          tx,
          hesapUyelikDegistiV1.create({
            ...zarf(kurumId, at),
            data: {
              uyelik_id: uyelikId,
              kullanici_id: kullaniciId,
              rol,
              durum,
              sube_id: null,
              kademe_id: null,
            },
          }),
        ),
      );
    const oku = async () =>
      (
        await o.sistem<{ rol: string; durum: string; kullanici_id: string }[]>`
          select rol, durum, kullanici_id from bildirim.uyelik_kopyalari where uyelik_id = ${uyelikId}`
      )[0];
    await yaz(dk(T0, 1), 'ogrenci', 'aktif');
    expect(await oku()).toEqual({ rol: 'ogrenci', durum: 'aktif', kullanici_id: kullaniciId });
    await yaz(dk(T0, 3), 'ogrenci', 'ayrildi');
    await yaz(dk(T0, 2), 'ogretmen', 'aktif'); // gec gelen eski olay
    expect(await oku()).toEqual({ rol: 'ogrenci', durum: 'ayrildi', kullanici_id: kullaniciId });
    const kolonlar = await o.sistem<{ column_name: string }[]>`
      select column_name from information_schema.columns
       where table_schema = 'bildirim' and table_name = 'uyelik_kopyalari'`;
    expect(kolonlar.map((c) => c.column_name)).not.toEqual(expect.arrayContaining(['telefon']));
  });

  it('kademe, grup, grup uyesi ve atama kopyalari yazilir ve eski olaya ezilmez', async () => {
    const kurumId = uuidv7();
    const kademeId = uuidv7();
    const grupId = uuidv7();
    const ogrenciId = uuidv7();
    const atamaId = uuidv7();
    await o.isle(kurumId, async (tx) => {
      await kademeDegisti(
        tx,
        hesapKademeDegistiV1.create({
          ...zarf(kurumId, dk(T0, 2)),
          data: { kademe_id: kademeId, ad: '8. sınıf', seviye: 8, arsivlendi: false },
        }),
      );
      await kademeDegisti(
        tx,
        hesapKademeDegistiV1.create({
          ...zarf(kurumId, T0),
          data: { kademe_id: kademeId, ad: 'eski', seviye: 8, arsivlendi: true },
        }),
      );
      await grupDegisti(
        tx,
        hesapGrupDegistiV1.create({
          ...zarf(kurumId, T0),
          data: {
            grup_id: grupId,
            tur: 'grup',
            ad: '8-A',
            kademe_id: kademeId,
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
            ogrenci_id: ogrenciId,
            baslangic_tarihi: '2026-09-01',
            bitis_tarihi: null,
          },
        }),
      );
      await atamaDegisti(
        tx,
        hesapAtamaDegistiV1.create({
          ...zarf(kurumId, T0),
          data: {
            atama_id: atamaId,
            grup_id: grupId,
            ogretmen_id: uuidv7(),
            brans_kodu: 'matematik',
            baslangic_tarihi: '2026-09-01',
            bitis_tarihi: null,
            ana_ogretmen: true,
          },
        }),
      );
    });
    const [k] = await o.sistem<{ ad: string; arsivlendi: boolean }[]>`
      select ad, arsivlendi from bildirim.kademe_kopyalari where kademe_id = ${kademeId}`;
    expect(k).toEqual({ ad: '8. sınıf', arsivlendi: false });
    const [g] = await o.sistem<{ ad: string; kademe_id: string }[]>`
      select ad, kademe_id from bildirim.grup_kopyalari where grup_id = ${grupId}`;
    expect(g).toEqual({ ad: '8-A', kademe_id: kademeId });
    expect(
      (
        await o.sistem<{ n: number }[]>`
          select count(*)::int n from bildirim.grup_uyesi_kopyalari where grup_id = ${grupId} and ogrenci_id = ${ogrenciId}`
      )[0]?.n,
    ).toBe(1);
    expect(
      (
        await o.sistem<{ n: number }[]>`
          select count(*)::int n from bildirim.atama_kopyalari where atama_id = ${atamaId}`
      )[0]?.n,
    ).toBe(1);
  });

  it('modul ayari: yaz, mirasa donuste (acik null) sil, eski olay silmez', async () => {
    const kurumId = uuidv7();
    const kapsamId = uuidv7();
    const yaz = (at: Date, acik: boolean | null) =>
      o.isle(kurumId, (tx) =>
        modulAyariDegisti(
          tx,
          hesapModulAyariDegistiV1.create({
            ...zarf(kurumId, at),
            data: {
              modul_ayari_id: uuidv7(),
              modul_kodu: 'duyuru',
              kapsam: 'grup',
              kapsam_id: kapsamId,
              acik,
            },
          }),
        ),
      );
    const say = async () =>
      (
        await o.sistem<{ n: number; acik: boolean | null }[]>`
          select count(*)::int n, bool_and(acik) acik from bildirim.modul_ayari_kopyalari
           where kurum_id = ${kurumId} and kapsam_id = ${kapsamId}`
      )[0];
    await yaz(dk(T0, 5), false);
    expect(await say()).toEqual({ n: 1, acik: false });
    await yaz(T0, null); // eski miras olayi silmez
    expect(await say()).toEqual({ n: 1, acik: false });
    await yaz(dk(T0, 6), null);
    expect((await say())?.n).toBe(0);
  });
});
