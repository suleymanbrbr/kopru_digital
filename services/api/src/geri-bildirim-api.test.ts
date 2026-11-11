import postgres from 'postgres';
import { uuidv7 } from 'uuidv7';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { dersYardimcilari, type Hata, type Kurulum } from './test/ders-yardimcilar.js';
import { kaynakYardimcilari } from './test/kaynak-yardimcilar.js';
import { bearer, dbYok, testDb, testServisi } from './test/yardimcilar.js';

interface GeriBildirimJson {
  id: string;
  ders_id: string;
  ogrenci_id: string;
  deger: string;
  konu_id: string | null;
  not: string | null;
}

describe.skipIf(dbYok())('ders sonu geri bildirimi API', () => {
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
  const ver = (s: Kurulum, token: string, dersId: string, govde: unknown) =>
    y.app.inject({
      method: 'PUT',
      url: y.api(s.k, `/dersler/${dersId}/geri-bildirim`),
      headers: bearer(token),
      payload: govde as object,
    });

  /** Bir ogrencili kurulum: ogrenci giris yapabilir, ders `bitisOnceDk` dakika once bitti, yoklama `geldi`. */
  async function kurulum(
    bitisOnceDk = 60,
    durum: 'geldi' | 'gelmedi' | 'gec' | 'izinli' = 'geldi',
  ) {
    const s = await y.kur({ ogrenciSayisi: 0 });
    const o = await k.ogrenciEkle(s);
    const ders = await k.bitmisDers(s, [o.uyelikId], bitisOnceDk, { [o.uyelikId]: durum });
    return { s, o, ders };
  }

  describe('verme ve guncelleme', () => {
    it('ilk verisle olusur, olay yalniz bir kez ve kisisel veri/not icermeden outbox a yazilir; ikinci gonderim gunceller', async () => {
      const { s, o, ders } = await kurulum();
      const konu = uuidv7();
      const a = await ver(s, o.token, ders.id, {
        deger: 'kismen',
        konu_id: konu,
        not: 'Turev zor',
      });
      expect(a.statusCode, a.body).toBe(200);
      const aj = a.json<{ geri_bildirim: GeriBildirimJson; yeni: boolean }>();
      expect(aj.yeni).toBe(true);
      expect(aj.geri_bildirim).toMatchObject({
        deger: 'kismen',
        konu_id: konu,
        not: 'Turev zor',
        ogrenci_id: o.uyelikId,
        ders_id: ders.id,
      });

      const b = await ver(s, o.token, ders.id, { deger: 'anladim' });
      expect(b.statusCode, b.body).toBe(200);
      const bj = b.json<{ geri_bildirim: GeriBildirimJson; yeni: boolean }>();
      expect(bj.yeni).toBe(false);
      expect(bj.geri_bildirim.id).toBe(aj.geri_bildirim.id);
      expect(bj.geri_bildirim).toMatchObject({ deger: 'anladim', konu_id: null, not: null });

      const [sayi] = await sistem<{ n: number }[]>`
        select count(*)::int n from ders.geri_bildirimler where ders_id = ${ders.id}`;
      expect(sayi?.n).toBe(1);
      const olaylar = await k.olaylar(s.k.kurumId, 'evt.ders.geri_bildirim.verildi.v1');
      expect(olaylar).toHaveLength(1);
      expect(olaylar[0]?.payload.data).toEqual({
        geri_bildirim_id: aj.geri_bildirim.id,
        ders_id: ders.id,
        ogrenci_id: o.uyelikId,
        brans_kodu: 'matematik',
        deger: 'kismen',
        konu_id: konu,
      });
      expect(JSON.stringify(olaylar[0]?.payload)).not.toContain('Turev zor');

      const kendi = await y.app.inject({
        url: y.api(s.k, `/dersler/${ders.id}/geri-bildirim`),
        headers: bearer(o.token),
      });
      expect(kendi.json<{ geri_bildirim: GeriBildirimJson }>().geri_bildirim.deger).toBe('anladim');
    });

    it('gec gelen ogrenci de verebilir; gelmedi/izinli ogrenci 422 geri_bildirim_yoklama_uygun_degil', async () => {
      const gec = await kurulum(60, 'gec');
      expect((await ver(gec.s, gec.o.token, gec.ders.id, { deger: 'anladim' })).statusCode).toBe(
        200,
      );
      for (const durum of ['gelmedi', 'izinli'] as const) {
        const x = await kurulum(60, durum);
        const res = await ver(x.s, x.o.token, x.ders.id, { deger: 'anladim' });
        expect(res.statusCode).toBe(422);
        expect(hataKodu(res)).toBe('geri_bildirim_yoklama_uygun_degil');
      }
    });

    it('yoklamasi hic alinmamis ogrenci 422; ders bitmemisse 422 geri_bildirim_ders_bitmedi', async () => {
      const s = await y.kur({ ogrenciSayisi: 0 });
      const o = await k.ogrenciEkle(s);
      const ders = await y.dersAc(s); // gelecekte
      const bitmedi = await ver(s, o.token, ders.id, { deger: 'anladim' });
      expect(bitmedi.statusCode).toBe(422);
      expect(hataKodu(bitmedi)).toBe('geri_bildirim_ders_bitmedi');
      await k.dersZamanla(ders.id, 30);
      const yoklamasiz = await ver(s, o.token, ders.id, { deger: 'anladim' });
      expect(yoklamasiz.statusCode).toBe(422);
      expect(hataKodu(yoklamasiz)).toBe('geri_bildirim_yoklama_uygun_degil');
    });

    it('iptal edilmis derse 409 ders_iptal_edildi', async () => {
      const { s, o, ders } = await kurulum();
      await sistem`update ders.dersler set durum = 'iptal', iptal_at = now(), iptal_kaynagi = 'ogretmen' where id = ${ders.id}`;
      const res = await ver(s, o.token, ders.id, { deger: 'anladim' });
      expect(res.statusCode).toBe(409);
      expect(hataKodu(res)).toBe('ders_iptal_edildi');
    });

    it('guncelleme dersin bitisinden sonra 24 saat icinde serbest, sonra 422; ilk veris sureye bagli degil', async () => {
      const { s, o, ders } = await kurulum(23 * 60);
      expect((await ver(s, o.token, ders.id, { deger: 'kismen' })).statusCode).toBe(200);
      expect((await ver(s, o.token, ders.id, { deger: 'anladim' })).statusCode).toBe(200);
      await k.dersZamanla(ders.id, 25 * 60);
      const gec = await ver(s, o.token, ders.id, { deger: 'anlamadim' });
      expect(gec.statusCode).toBe(422);
      expect(hataKodu(gec)).toBe('geri_bildirim_guncelleme_suresi_doldu');

      const eski = await kurulum(3 * 24 * 60);
      const ilk = await ver(eski.s, eski.o.token, eski.ders.id, { deger: 'anladim' });
      expect(ilk.statusCode, ilk.body).toBe(200);
      expect(ilk.json<{ yeni: boolean }>().yeni).toBe(true);
    });

    it('dogrulama: gecersiz deger, 501 karakter not, gecersiz konu_id 400', async () => {
      const { s, o, ders } = await kurulum();
      for (const govde of [
        { deger: 'belki' },
        {},
        { deger: 'anladim', not: 'x'.repeat(501) },
        { deger: 'anladim', konu_id: 'degil' },
      ]) {
        expect((await ver(s, o.token, ders.id, govde)).statusCode).toBe(400);
      }
    });

    it('yalniz ogrenci verir: ogretmen ve sahip 403; baska dersin ogrencisi 404', async () => {
      const { s, o, ders } = await kurulum();
      expect((await ver(s, s.hoca.token, ders.id, { deger: 'anladim' })).statusCode).toBe(403);
      expect((await ver(s, s.k.token, ders.id, { deger: 'anladim' })).statusCode).toBe(403);
      const baska = await y.kur({ ogrenciSayisi: 0 });
      const yabanci = await k.ogrenciEkle(baska);
      const res = await y.app.inject({
        method: 'PUT',
        url: y.api(baska.k, `/dersler/${ders.id}/geri-bildirim`),
        headers: bearer(yabanci.token),
        payload: { deger: 'anladim' },
      });
      expect(res.statusCode).toBe(404);
      // ayni kurumda ama derse katilimci olmayan ogrenci
      const digeri = await k.ogrenciEkle(s);
      const katilimciDegil = await ver(s, digeri.token, ders.id, { deger: 'anladim' });
      expect(katilimciDegil.statusCode).toBe(404);
      expect(o.token).toBeTruthy();
    });
  });

  describe('modul kapali', () => {
    it('kurumda kapaliyken ogrenci ve personel uclari 403 modul_kapali', async () => {
      const { s, o, ders } = await kurulum();
      await k.modulKapat(s, 'geri_bildirim');
      for (const res of [
        await ver(s, o.token, ders.id, { deger: 'anladim' }),
        await y.app.inject({
          url: y.api(s.k, '/geri-bildirim/bekleyen'),
          headers: bearer(o.token),
        }),
        await y.app.inject({
          url: y.api(s.k, `/dersler/${ders.id}/geri-bildirimler`),
          headers: bearer(s.hoca.token),
        }),
      ]) {
        expect(res.statusCode).toBe(403);
        expect(hataKodu(res)).toBe('modul_kapali');
      }
    });

    it('grup duzeyinde kapaliyken verme 403 modul_kapali ve bekleyenlerde gorunmez', async () => {
      const { s, o, ders } = await kurulum();
      const once = await y.app.inject({
        url: y.api(s.k, '/geri-bildirim/bekleyen'),
        headers: bearer(o.token),
      });
      expect(once.json<{ dersler: unknown[] }>().dersler).toHaveLength(1);
      await k.modulKapat(s, 'geri_bildirim', 'grup');
      const res = await ver(s, o.token, ders.id, { deger: 'anladim' });
      expect(res.statusCode).toBe(403);
      expect(hataKodu(res)).toBe('modul_kapali');
      const sonra = await y.app.inject({
        url: y.api(s.k, '/geri-bildirim/bekleyen'),
        headers: bearer(o.token),
      });
      expect(sonra.json<{ dersler: unknown[] }>().dersler).toHaveLength(0);
    });
  });

  describe('bekleyenler', () => {
    it('son 24 saatte biten, gelinmis ve henuz verilmemis dersler; verilince, 24 saati gecince, gelinmeyince ve iptalde cikar', async () => {
      const s = await y.kur({ ogrenciSayisi: 0 });
      const o = await k.ogrenciEkle(s);
      const yeni = await k.bitmisDers(s, [o.uyelikId], 30);
      const verilecek = await k.bitmisDers(s, [o.uyelikId], 120);
      await k.bitmisDers(s, [o.uyelikId], 25 * 60); // 24 saati gecti
      await k.bitmisDers(s, [o.uyelikId], 60, { [o.uyelikId]: 'gelmedi' });
      const iptal = await k.bitmisDers(s, [o.uyelikId], 90);
      await sistem`update ders.dersler set durum = 'iptal', iptal_at = now(), iptal_kaynagi = 'ogretmen' where id = ${iptal.id}`;
      const gelecek = await y.dersAc(s, { tarih: '2099-01-05' });
      expect(gelecek.id).toBeTruthy();

      const liste = async () =>
        (
          await y.app.inject({
            url: y.api(s.k, '/geri-bildirim/bekleyen'),
            headers: bearer(o.token),
          })
        ).json<{ dersler: { ders_id: string; son_verme_at: string; bitis_at: string }[] }>()
          .dersler;
      let bekleyen = await liste();
      expect(bekleyen.map((d) => d.ders_id)).toEqual([yeni.id, verilecek.id]); // en yeni biten once
      expect(
        new Date(bekleyen[0]?.son_verme_at ?? '').getTime() -
          new Date(bekleyen[0]?.bitis_at ?? '').getTime(),
      ).toBe(24 * 3_600_000);

      expect((await ver(s, o.token, verilecek.id, { deger: 'anladim' })).statusCode).toBe(200);
      bekleyen = await liste();
      expect(bekleyen.map((d) => d.ders_id)).toEqual([yeni.id]);
    });

    it('baska ogrencinin dersleri ve personel (ogrenci olmayan) icin 403', async () => {
      const s = await y.kur({ ogrenciSayisi: 0 });
      const o1 = await k.ogrenciEkle(s);
      const o2 = await k.ogrenciEkle(s);
      await k.bitmisDers(s, [o1.uyelikId], 30, { [o1.uyelikId]: 'geldi' });
      const r2 = await y.app.inject({
        url: y.api(s.k, '/geri-bildirim/bekleyen'),
        headers: bearer(o2.token),
      });
      // o2 grubun uyesiydi ama ders onun yoklamasi olmadan (katilimci, yoklama yok) bekleyen sayilmaz
      expect(r2.json<{ dersler: unknown[] }>().dersler).toHaveLength(0);
      const hoca = await y.app.inject({
        url: y.api(s.k, '/geri-bildirim/bekleyen'),
        headers: bearer(s.hoca.token),
      });
      expect(hoca.statusCode).toBe(403);
    });
  });

  describe('personel gorunumleri', () => {
    it('ders karti: ogretmen kendi dersinin geri bildirimlerini ad, deger, konu, not ve sayilarla gorur; baska ogretmen 404', async () => {
      const s = await y.kur({ ogrenciSayisi: 0 });
      const o1 = await k.ogrenciEkle(s);
      const o2 = await k.ogrenciEkle(s);
      const o3 = await k.ogrenciEkle(s);
      const ders = await k.bitmisDers(s, [o1.uyelikId, o2.uyelikId, o3.uyelikId]);
      const konu = uuidv7();
      await ver(s, o1.token, ders.id, { deger: 'anladim' });
      await ver(s, o2.token, ders.id, { deger: 'anlamadim', konu_id: konu, not: 'Limit' });

      const res = await y.app.inject({
        url: y.api(s.k, `/dersler/${ders.id}/geri-bildirimler`),
        headers: bearer(s.hoca.token),
      });
      expect(res.statusCode, res.body).toBe(200);
      const j = res.json<{
        ozet: Record<string, number>;
        katilimci_sayisi: number;
        geri_bildirimler: {
          ogrenci_id: string;
          deger: string;
          konu_id: string | null;
          not: string | null;
        }[];
      }>();
      expect(j.ozet).toEqual({ anladim: 1, kismen: 0, anlamadim: 1, toplam: 2 });
      expect(j.katilimci_sayisi).toBe(3);
      expect(j.geri_bildirimler.find((g) => g.ogrenci_id === o2.uyelikId)).toMatchObject({
        deger: 'anlamadim',
        konu_id: konu,
        not: 'Limit',
      });

      const baskaHoca = await y.davetliUye(s.k, 'ogretmen'); // atamasi yok
      const yok = await y.app.inject({
        url: y.api(s.k, `/dersler/${ders.id}/geri-bildirimler`),
        headers: bearer(baskaHoca.token),
      });
      expect(yok.statusCode).toBe(404);
      const ogrenci = await y.app.inject({
        url: y.api(s.k, `/dersler/${ders.id}/geri-bildirimler`),
        headers: bearer(o1.token),
      });
      expect(ogrenci.statusCode).toBe(403);
    });

    it('ogrenci profili: son geri bildirimler yeniden eskiye, imlecli; ogretmen yalniz kendi kapsamindakini gorur', async () => {
      const s = await y.kur({ ogrenciSayisi: 0 });
      const o = await k.ogrenciEkle(s);
      const idler: string[] = [];
      for (let i = 0; i < 3; i++) {
        const d = await k.bitmisDers(s, [o.uyelikId], 60 + i);
        idler.push(d.id);
        expect((await ver(s, o.token, d.id, { deger: 'kismen' })).statusCode).toBe(200);
      }
      const url = (q = '') => y.api(s.k, `/ogrenciler/${o.uyelikId}/geri-bildirimler${q}`);
      const sayfa1 = await y.app.inject({ url: url('?limit=2'), headers: bearer(s.hoca.token) });
      expect(sayfa1.statusCode, sayfa1.body).toBe(200);
      const j1 = sayfa1.json<{
        geri_bildirimler: { ders_id: string }[];
        sonraki_imlec: string | null;
      }>();
      expect(j1.geri_bildirimler.map((g) => g.ders_id)).toEqual([idler[2], idler[1]]);
      expect(j1.sonraki_imlec).not.toBeNull();
      const sayfa2 = await y.app.inject({
        url: url(`?limit=2&imlec=${j1.sonraki_imlec ?? ''}`),
        headers: bearer(s.hoca.token),
      });
      const j2 = sayfa2.json<{
        geri_bildirimler: { ders_id: string }[];
        sonraki_imlec: string | null;
      }>();
      expect(j2.geri_bildirimler.map((g) => g.ders_id)).toEqual([idler[0]]);
      expect(j2.sonraki_imlec).toBeNull();

      const baskaHoca = await y.davetliUye(s.k, 'ogretmen');
      const kapsamsiz = await y.app.inject({ url: url(), headers: bearer(baskaHoca.token) });
      expect(kapsamsiz.json<{ geri_bildirimler: unknown[] }>().geri_bildirimler).toHaveLength(0);
      const yok = await y.app.inject({
        url: y.api(s.k, `/ogrenciler/${uuidv7()}/geri-bildirimler`),
        headers: bearer(s.k.token),
      });
      expect(yok.statusCode).toBe(404);
    });

    it('yonetici ozeti: tarih araliginda toplam ve ogretmen/brans kirilimi oranlariyla; ogretmen ve ogrenci 403', async () => {
      const s = await y.kur({ ogrenciSayisi: 0 });
      const [o1, o2, o3, o4] = [
        await k.ogrenciEkle(s),
        await k.ogrenciEkle(s),
        await k.ogrenciEkle(s),
        await k.ogrenciEkle(s),
      ];
      const tum = [o1, o2, o3, o4].map((o) => o.uyelikId);
      const d1 = await k.bitmisDers(s, tum, 60);
      const d2 = await k.bitmisDers(s, tum, 90);
      await ver(s, o1.token, d1.id, { deger: 'anladim' });
      await ver(s, o2.token, d1.id, { deger: 'anladim' });
      await ver(s, o3.token, d1.id, { deger: 'kismen' });
      await ver(s, o4.token, d2.id, { deger: 'anlamadim' });
      const bugun = new Date().toISOString().slice(0, 10);
      const dun = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
      const yarin = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

      const res = await y.app.inject({
        url: y.api(s.k, `/geri-bildirim/ozet?baslangic=${dun}&bitis=${yarin}`),
        headers: bearer(s.k.token),
      });
      expect(res.statusCode, res.body).toBe(200);
      const j = res.json<{
        toplam: {
          anladim: number;
          kismen: number;
          anlamadim: number;
          toplam: number;
          oran: Record<string, number>;
        };
        ogretmenler: { ogretmen_id: string; toplam: number; oran: Record<string, number> }[];
        branslar: { brans_kodu: string; toplam: number }[];
      }>();
      expect(j.toplam).toMatchObject({ anladim: 2, kismen: 1, anlamadim: 1, toplam: 4 });
      expect(j.toplam.oran).toEqual({ anladim: 0.5, kismen: 0.25, anlamadim: 0.25 });
      expect(j.ogretmenler).toHaveLength(1);
      expect(j.ogretmenler[0]?.ogretmen_id).toBe(s.hoca.uyelikId);
      expect(j.branslar).toMatchObject([{ brans_kodu: 'matematik', toplam: 4 }]);

      const bos = await y.app.inject({
        url: y.api(s.k, `/geri-bildirim/ozet?baslangic=2020-01-01&bitis=2020-01-31`),
        headers: bearer(s.k.token),
      });
      expect(
        bos.json<{ toplam: { toplam: number; oran: Record<string, number> } }>().toplam,
      ).toMatchObject({
        toplam: 0,
        oran: { anladim: 0, kismen: 0, anlamadim: 0 },
      });
      for (const token of [s.hoca.token, o1.token]) {
        const yasak = await y.app.inject({
          url: y.api(s.k, `/geri-bildirim/ozet?baslangic=${bugun}&bitis=${bugun}`),
          headers: bearer(token),
        });
        expect(yasak.statusCode).toBe(403);
      }
      const ters = await y.app.inject({
        url: y.api(s.k, `/geri-bildirim/ozet?baslangic=${yarin}&bitis=${dun}`),
        headers: bearer(s.k.token),
      });
      expect(ters.statusCode).toBe(400);
    });

    it('baska kurumun yoneticisi bu kurumun geri bildirimlerini goremez', async () => {
      const { s, ders } = await kurulum();
      const yabanci = await y.kurumluKullanici();
      const res = await y.app.inject({
        url: y.api(s.k, `/dersler/${ders.id}/geri-bildirimler`),
        headers: bearer(yabanci.token),
      });
      expect(res.statusCode).toBe(403); // token baska kurumun: kiraci kapisi
      const kendiKurumunda = await y.app.inject({
        url: y.api(yabanci, `/dersler/${ders.id}/geri-bildirimler`),
        headers: bearer(yabanci.token),
      });
      expect(kendiKurumunda.statusCode).toBe(404);
    });
  });
});
