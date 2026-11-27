import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { dersYardimcilari, type Hata, type Kurulum } from './test/ders-yardimcilar.js';
import { kaynakYardimcilari } from './test/kaynak-yardimcilar.js';
import { dbYok, testDb, testServisi } from './test/yardimcilar.js';

/**
 * Grup duzeyinde modul kapatma yalniz yazmalarda degil okumalarda da gecerlidir (ADR 0004 adim 5):
 * tekil okuma 403 `modul_kapali`, liste okumasi kapali grubun kayitlarini disarida birakir (bos).
 */
describe.skipIf(dbYok())('grup duzeyinde modul kapatma: okumalar', () => {
  const urls = testDb();
  const t = testServisi({ RATE_LIMIT_MAX: '100000' });
  let sistem: postgres.Sql;
  let y: ReturnType<typeof dersYardimcilari>;
  let k: ReturnType<typeof kaynakYardimcilari>;

  beforeAll(() => {
    if (!urls) return;
    sistem = postgres(urls.sistemUrl, { max: 3, onnotice: () => undefined });
    y = dersYardimcilari({ t, sistem });
    k = kaynakYardimcilari(y, sistem);
  });
  afterAll(async () => {
    await t.service.stop();
    await sistem.end();
  });

  const hataKodu = (res: { json: () => unknown }) => (res.json() as Hata).error.code;

  /** Bir ogrenci, bitmis (yoklamasi `geldi`) bir ders; ders listesi aralik sorgusu hazir. */
  async function kurulum(): Promise<{
    s: Kurulum;
    o: Awaited<ReturnType<typeof k.ogrenciEkle>>;
    dersId: string;
  }> {
    const s = await y.kur({ ogrenciSayisi: 0 });
    const o = await k.ogrenciEkle(s);
    const ders = await k.bitmisDers(s, [o.uyelikId], 30);
    return { s, o, dersId: ders.id };
  }

  const aralik = () => {
    const bas = new Date(Date.now() - 2 * 86_400_000).toISOString();
    const bit = new Date(Date.now() + 86_400_000).toISOString();
    return `?baslangic=${encodeURIComponent(bas)}&bitis=${encodeURIComponent(bit)}`;
  };

  it('takvim: tekil ders 403 modul_kapali, ders listesi kapali grubu icermez', async () => {
    const { s, dersId } = await kurulum();
    const once = await y.get(s.k, s.hoca.token, `/dersler${aralik()}`);
    expect(once.json<{ dersler: { id: string }[] }>().dersler.map((d) => d.id)).toContain(dersId);
    expect((await y.get(s.k, s.hoca.token, `/dersler/${dersId}`)).statusCode).toBe(200);

    await k.modulKapat(s, 'takvim', 'grup');
    const tekil = await y.get(s.k, s.hoca.token, `/dersler/${dersId}`);
    expect(tekil.statusCode).toBe(403);
    expect(hataKodu(tekil)).toBe('modul_kapali');
    const sonra = await y.get(s.k, s.hoca.token, `/dersler${aralik()}`);
    expect(sonra.statusCode).toBe(200);
    expect(sonra.json<{ dersler: unknown[] }>().dersler).toHaveLength(0);
  });

  it('yoklama: ders yoklama listesi 403 modul_kapali, "yoklama bekleyen" listesinde gorunmez', async () => {
    const s = await y.kur({ ogrenciSayisi: 0 });
    const o = await k.ogrenciEkle(s);
    const ders = await y.dersAc(s);
    await k.dersZamanla(ders.id, 30); // bitti, yoklama yok -> bekleyen
    const bekleyen = async () =>
      (await y.get(s.k, s.hoca.token, '/yoklama-bekleyen')).json<{ dersler: { id: string }[] }>()
        .dersler;
    expect((await bekleyen()).map((d) => d.id)).toContain(ders.id);
    expect((await y.get(s.k, s.hoca.token, `/dersler/${ders.id}/yoklamalar`)).statusCode).toBe(200);
    expect(o.uyelikId).toBeTruthy();

    await k.modulKapat(s, 'yoklama', 'grup');
    const liste = await y.get(s.k, s.hoca.token, `/dersler/${ders.id}/yoklamalar`);
    expect(liste.statusCode).toBe(403);
    expect(hataKodu(liste)).toBe('modul_kapali');
    expect(await bekleyen()).toHaveLength(0);
  });

  it('geri_bildirim: ogrencinin kendi okumasi ve personelin ders listesi 403; ogrenci profili listesi ve ozet kapali grubu saymaz', async () => {
    const { s, o, dersId } = await kurulum();
    const ver = await y.app.inject({
      method: 'PUT',
      url: y.api(s.k, `/dersler/${dersId}/geri-bildirim`),
      headers: { authorization: `Bearer ${o.token}` },
      payload: { deger: 'anladim' },
    });
    expect(ver.statusCode, ver.body).toBe(200);
    const profil = () => y.get(s.k, s.hoca.token, `/ogrenciler/${o.uyelikId}/geri-bildirimler`);
    const ozet = () => {
      const bas = new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10);
      const bit = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
      return y.get(s.k, s.k.token, `/geri-bildirim/ozet?baslangic=${bas}&bitis=${bit}`);
    };
    expect((await y.get(s.k, o.token, `/dersler/${dersId}/geri-bildirim`)).statusCode).toBe(200);
    expect((await profil()).json<{ geri_bildirimler: unknown[] }>().geri_bildirimler).toHaveLength(
      1,
    );
    expect((await ozet()).json<{ toplam: { toplam: number } }>().toplam.toplam).toBe(1);

    await k.modulKapat(s, 'geri_bildirim', 'grup');
    const kendi = await y.get(s.k, o.token, `/dersler/${dersId}/geri-bildirim`);
    expect(kendi.statusCode).toBe(403);
    expect(hataKodu(kendi)).toBe('modul_kapali');
    const dersListesi = await y.get(s.k, s.hoca.token, `/dersler/${dersId}/geri-bildirimler`);
    expect(dersListesi.statusCode).toBe(403);
    expect(hataKodu(dersListesi)).toBe('modul_kapali');
    expect((await profil()).json<{ geri_bildirimler: unknown[] }>().geri_bildirimler).toHaveLength(
      0,
    );
    expect((await ozet()).json<{ toplam: { toplam: number } }>().toplam.toplam).toBe(0);
  });

  it('kayitlar: personel kaynak listesi bos, tekil kaynak / izlemeler / sorunlar 403 modul_kapali', async () => {
    const { s, dersId } = await kurulum();
    const ekle = await y.post(s.k, s.hoca.token, `/dersler/${dersId}/kaynaklar`, {
      linkler: [{ baslik: 'Kayıt', url: 'https://zoom.us/rec/share/abc' }],
    });
    expect(ekle.statusCode, ekle.body).toBe(201);
    const id = ekle.json<{ kaynaklar: { id: string }[] }>().kaynaklar[0]?.id ?? '';
    const liste = async () =>
      (await y.get(s.k, s.hoca.token, '/kaynaklar')).json<{ kaynaklar: { id: string }[] }>()
        .kaynaklar;
    expect((await liste()).map((x) => x.id)).toContain(id);

    await k.modulKapat(s, 'kayitlar', 'grup');
    expect(await liste()).toHaveLength(0);
    for (const yol of [
      `/kaynaklar/${id}`,
      `/kaynaklar/${id}/izlemeler`,
      `/kaynaklar/${id}/sorunlar`,
    ]) {
      const res = await y.get(s.k, s.hoca.token, yol);
      expect(res.statusCode, yol).toBe(403);
      expect(hataKodu(res)).toBe('modul_kapali');
    }
  });
});
