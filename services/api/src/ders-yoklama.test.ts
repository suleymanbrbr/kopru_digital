import { createDb, type Database } from '@kopru/service-kit';
import postgres from 'postgres';
import { uuidv7 } from 'uuidv7';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  dersKatilimcilariniEsitleSistem,
  eskiYoklamaIstekleriniSil,
} from './sistem/ders-seri-uret.js';
import {
  dersYardimcilari,
  gunSonra,
  pazartesi,
  type DersJson,
  type Hata,
  type IslemYaniti,
  type Kurulum,
} from './test/ders-yardimcilar.js';
import { bearer, dbYok, testDb, testServisi } from './test/yardimcilar.js';

interface YoklamaJson {
  id: string;
  ogrenci_id: string;
  durum: string;
  gec_dakika: number | null;
  not: string | null;
  not_gorunurluk: string;
  surum: number;
  isaretlenme_at: string;
}
interface KaydetYaniti {
  ders_id: string;
  ders_durumu: string;
  sonuclar: {
    ogrenci_id: string;
    sonuc: string;
    yoklama: YoklamaJson;
    kalan_kredi: number | null;
    uyari: string | null;
  }[];
}
interface ListeYaniti {
  ders: { id: string; durum: string };
  katilimcilar: {
    ogrenci_id: string;
    tur: string;
    gorunen_ad: string | null;
    yoklama: YoklamaJson | null;
  }[];
}

describe.skipIf(dbYok())('yoklama API ve kredi dusumu', () => {
  const urls = testDb();
  const t = testServisi({ RATE_LIMIT_MAX: '100000' });
  let sistem: postgres.Sql;
  let sahipDb: postgres.Sql;
  let appDb: Database;
  let y: ReturnType<typeof dersYardimcilari>;

  beforeAll(() => {
    if (!urls) return;
    sistem = postgres(urls.sistemUrl, { max: 3, onnotice: () => undefined });
    sahipDb = postgres(urls.ownerUrl, { max: 1, onnotice: () => undefined });
    appDb = createDb({ url: urls.appUrl, max: 3 });
    y = dersYardimcilari({ t, sistem });
  });
  afterAll(async () => {
    await t.service.stop();
    await sistem.end();
    await sahipDb.end();
    await appDb.close();
  });

  const hataKodu = (res: { json: () => unknown }) => (res.json() as Hata).error.code;
  const olaylar = (kurumId: string, subject: string) =>
    sistem<{ payload: { data: Record<string, unknown> } }[]>`
      select payload from ortak.outbox where kurum_id = ${kurumId} and subject = ${subject} order by created_at, id`;
  const ogr = (s: Kurulum, i: number): string => {
    const v = s.ogrenciler[i];
    if (v === undefined) throw new Error('kurulumda yeterli ogrenci yok');
    return v;
  };
  const tekOgrenci = async (kurumId: string, ad: string): Promise<string> => {
    const [v] = await y.topluOgrenci(kurumId, 1, ad);
    if (v === undefined) throw new Error('ogrenci olusmadi');
    return v;
  };
  const sn = (ms: number) => new Date(Date.now() + ms).toISOString();

  /** Paketli ogrenciler + gecmiste baslamis ders. */
  async function paketliKurulum(ogrenciSayisi = 3, kredi = 8) {
    const s = await y.kur({ ogrenciSayisi });
    for (const o of s.ogrenciler) await y.paketSat(s, o, kredi);
    const ders = await y.gecmisDers(s);
    return { s, ders };
  }

  const kaydet = async (
    s: Kurulum,
    dersId: string,
    satirlar: unknown[],
    token = s.hoca.token,
    anahtar: string | null = uuidv7(),
  ) => {
    const res = await y.yoklamaPut(s.k, token, dersId, satirlar, anahtar);
    return res;
  };

  describe('kayit ve olaylar', () => {
    it('toplu yoklama: satirlar, gecmis, olay (not yok), denetim, ders tamamlandi, kredi dustu', async () => {
      const { s, ders } = await paketliKurulum(3);
      const [o1, o2, o3] = s.ogrenciler as [string, string, string];
      const res = await kaydet(s, ders.id, [
        y.yoklamaSatiri(o1, 'geldi', {
          not: 'Ozel not: turev eksik',
          not_gorunurluk: 'ogretmene_ozel',
        }),
        y.yoklamaSatiri(o2, 'gec'),
        y.yoklamaSatiri(o3, 'izinli'),
      ]);
      expect(res.statusCode, res.body).toBe(200);
      const j = res.json<KaydetYaniti>();
      expect(j.ders_durumu).toBe('tamamlandi');
      expect(j.sonuclar.map((x) => x.sonuc)).toEqual(['yeni', 'yeni', 'yeni']);
      expect(j.sonuclar[0]?.kalan_kredi).toBe(7);
      expect(j.sonuclar[1]?.kalan_kredi).toBe(7);
      expect(j.sonuclar[2]?.kalan_kredi).toBeNull(); // izinli dusurmez
      expect(j.sonuclar[0]?.yoklama.not).toBe('Ozel not: turev eksik');
      expect(j.sonuclar[0]?.yoklama.surum).toBe(1);
      expect(res.headers['idempotent-replayed']).toBeUndefined();

      expect((await y.dersOku(s, ders.id)).durum).toBe('tamamlandi');
      const gecmis = await sistem<
        { yeni_durum: string; yoklama_surumu: number; istek_id: string }[]
      >`
        select yeni_durum, yoklama_surumu::int, istek_id from ders.yoklama_gecmisi where ders_id = ${ders.id}`;
      expect(gecmis).toHaveLength(3);

      const yok = await olaylar(s.k.kurumId, 'evt.ders.yoklama.kaydedildi.v1');
      expect(yok).toHaveLength(3);
      expect(yok.map((o) => o.payload.data.durum).sort()).toEqual(['gec', 'geldi', 'izinli']);
      expect(JSON.stringify(yok.map((o) => o.payload))).not.toMatch(
        /turev|Ozel not|Ogrenci \d|telefon/,
      );
      const tamam = (await olaylar(s.k.kurumId, 'evt.ders.ders.degisti.v1')).filter(
        (o) => o.payload.data.degisim_turu === 'tamamlandi',
      );
      expect(tamam).toHaveLength(1);

      const denetim = await sistem<{ sonra: Record<string, unknown>; hedef_id: string }[]>`
        select sonra, hedef_id from hesap.denetim_kayitlari
        where kurum_id = ${s.k.kurumId} and eylem = 'ders.yoklama_kaydet'`;
      expect(denetim).toHaveLength(1);
      expect(denetim[0]?.hedef_id).toBe(ders.id);
      expect(denetim[0]?.sonra).toMatchObject({ etkilenen_sayisi: 3, gelen_satir_sayisi: 3 });
      expect(JSON.stringify(denetim[0]?.sonra)).not.toMatch(/turev|Ozel not/);
    });

    it('Idempotency-Key zorunlu UUID; isaretlenme_at en cok 5 dk ileride; gec_dakika kurali', async () => {
      const { s, ders } = await paketliKurulum(1);
      const o = ogr(s, 0);
      const yok = await kaydet(s, ders.id, [y.yoklamaSatiri(o)], s.hoca.token, null);
      expect(yok.statusCode).toBe(400);
      const bozuk = await kaydet(s, ders.id, [y.yoklamaSatiri(o)], s.hoca.token, 'abc');
      expect(bozuk.statusCode).toBe(400);
      const gelecek = await kaydet(s, ders.id, [
        y.yoklamaSatiri(o, 'geldi', { isaretlenme_at: sn(10 * 60_000) }),
      ]);
      expect(gelecek.statusCode).toBe(422);
      const sinirda = await kaydet(s, ders.id, [
        y.yoklamaSatiri(o, 'geldi', { isaretlenme_at: sn(4 * 60_000) }),
      ]);
      expect(sinirda.statusCode).toBe(200);
      const gecDakikasiz = await kaydet(s, ders.id, [
        { ogrenci_id: o, durum: 'gec', isaretlenme_at: sn(0) },
      ]);
      expect(gecDakikasiz.statusCode).toBe(400);
      const gereksiz = await kaydet(s, ders.id, [y.yoklamaSatiri(o, 'geldi', { gec_dakika: 5 })]);
      expect(gereksiz.statusCode).toBe(400);
      const uzunNot = await kaydet(s, ders.id, [
        y.yoklamaSatiri(o, 'geldi', { not: 'x'.repeat(501) }),
      ]);
      expect(uzunNot.statusCode).toBe(400);
      const ikili = await kaydet(s, ders.id, [y.yoklamaSatiri(o), y.yoklamaSatiri(o, 'gelmedi')]);
      expect(ikili.statusCode).toBe(400);
    });
  });

  describe('idempotency ve kredi tek kez', () => {
    it('ayni anahtar + ayni govde: kayitli yanit aynen, Idempotent-Replayed, kredi bir kez', async () => {
      const { s, ders } = await paketliKurulum(1);
      const o = ogr(s, 0);
      const anahtar = uuidv7();
      const govde = [y.yoklamaSatiri(o)];
      const ilk = await kaydet(s, ders.id, govde, s.hoca.token, anahtar);
      const tekrar = await kaydet(s, ders.id, govde, s.hoca.token, anahtar);
      expect(ilk.statusCode).toBe(200);
      expect(tekrar.statusCode).toBe(200);
      expect(tekrar.headers['idempotent-replayed']).toBe('true');
      expect(tekrar.json()).toEqual(ilk.json());
      expect(await y.kalanKredi(o)).toBe(7);
      expect((await y.krediHareketleri(o)).filter((h) => h.tur === 'dusum')).toHaveLength(1);
      expect(await olaylar(s.k.kurumId, 'evt.ders.yoklama.kaydedildi.v1')).toHaveLength(1);
      // ayni anahtar farkli govde: 422
      const farkli = await kaydet(
        s,
        ders.id,
        [y.yoklamaSatiri(o, 'gelmedi')],
        s.hoca.token,
        anahtar,
      );
      expect(farkli.statusCode).toBe(422);
      expect(hataKodu(farkli)).toBe('idempotency_anahtar_cakismasi');
    });

    it('farkli anahtar ayni icerik (yeniden kuyruklanan ayni isaretleme): ayni, surum artmaz, kredi/olay yok', async () => {
      const { s, ders } = await paketliKurulum(1);
      const o = ogr(s, 0);
      const satir = y.yoklamaSatiri(o, 'geldi', { isaretlenme_at: sn(-5000) });
      const a = await kaydet(s, ders.id, [satir]);
      const b = await kaydet(s, ders.id, [satir]);
      const c = await kaydet(s, ders.id, [{ ...satir, isaretlenme_at: sn(-1000) }]); // daha yeni ama ayni icerik
      expect(a.json<KaydetYaniti>().sonuclar[0]?.sonuc).toBe('yeni');
      expect(b.json<KaydetYaniti>().sonuclar[0]?.sonuc).toBe('ayni');
      expect(c.json<KaydetYaniti>().sonuclar[0]?.sonuc).toBe('ayni');
      expect(b.json<KaydetYaniti>().sonuclar[0]?.yoklama.surum).toBe(1);
      expect(await y.kalanKredi(o)).toBe(7);
      expect(await y.krediHareketleri(o)).toHaveLength(2); // satin_alma + dusum
      expect(await olaylar(s.k.kurumId, 'evt.ders.yoklama.kaydedildi.v1')).toHaveLength(1);
      const [g] = await sistem<
        { n: number }[]
      >`select count(*)::int n from ders.yoklama_gecmisi where ders_id = ${ders.id}`;
      expect(g?.n).toBe(1);
    });

    it('paralel 5 istek (ayni anahtar ve farkli anahtar): kredi tek kez duser', async () => {
      const { s, ders } = await paketliKurulum(2);
      const [o1, o2] = s.ogrenciler as [string, string];
      const ayniAnahtar = uuidv7();
      const t0 = sn(-3000);
      const govde1 = [y.yoklamaSatiri(o1, 'geldi', { isaretlenme_at: t0 })];
      const sonuc1 = await Promise.all(
        Array.from({ length: 5 }, () => kaydet(s, ders.id, govde1, s.hoca.token, ayniAnahtar)),
      );
      expect(sonuc1.map((r) => r.statusCode)).toEqual([200, 200, 200, 200, 200]);
      expect(sonuc1.filter((r) => r.headers['idempotent-replayed'] === 'true')).toHaveLength(4);
      expect(await y.kalanKredi(o1)).toBe(7);

      const govde2 = [y.yoklamaSatiri(o2, 'geldi', { isaretlenme_at: t0 })];
      const sonuc2 = await Promise.all(Array.from({ length: 5 }, () => kaydet(s, ders.id, govde2)));
      expect(sonuc2.map((r) => r.statusCode)).toEqual([200, 200, 200, 200, 200]);
      const siniflar = sonuc2.map((r) => r.json<KaydetYaniti>().sonuclar[0]?.sonuc).sort();
      expect(siniflar).toEqual(['ayni', 'ayni', 'ayni', 'ayni', 'yeni']);
      expect(await y.kalanKredi(o2)).toBe(7);
      expect((await y.krediHareketleri(o2)).filter((h) => h.tur === 'dusum')).toHaveLength(1);
    });

    it('ADR 0007: geldi -> izinli -> geldi; defter ve bakiye dogru, gecmis surumleri 1,2,3', async () => {
      const { s, ders } = await paketliKurulum(1);
      const o = ogr(s, 0);
      const adim = (durum: 'geldi' | 'izinli', ms: number) =>
        kaydet(s, ders.id, [y.yoklamaSatiri(o, durum, { isaretlenme_at: sn(ms) })]);
      const r1 = await adim('geldi', -3000);
      expect(r1.json<KaydetYaniti>().sonuclar[0]?.kalan_kredi).toBe(7);
      const r2 = await adim('izinli', -2000);
      expect(r2.json<KaydetYaniti>().sonuclar[0]).toMatchObject({
        sonuc: 'guncellendi',
        kalan_kredi: 8,
      });
      const r3 = await adim('geldi', -1000);
      expect(r3.json<KaydetYaniti>().sonuclar[0]).toMatchObject({
        sonuc: 'guncellendi',
        kalan_kredi: 7,
      });
      expect((await y.krediHareketleri(o)).map((h) => [h.tur, h.miktar])).toEqual([
        ['satin_alma', 8],
        ['dusum', -1],
        ['iade', 1],
        ['dusum', -1],
      ]);
      expect(await y.kalanKredi(o)).toBe(7);
      const gecmis = await sistem<{ onceki_durum: string | null; yeni_durum: string; s: number }[]>`
        select onceki_durum, yeni_durum, yoklama_surumu::int s from ders.yoklama_gecmisi
        where ders_id = ${ders.id} order by yoklama_surumu`;
      expect(gecmis.map((g) => [g.s, g.onceki_durum, g.yeni_durum])).toEqual([
        [1, null, 'geldi'],
        [2, 'geldi', 'izinli'],
        [3, 'izinli', 'geldi'],
      ]);
      const ev = await olaylar(s.k.kurumId, 'evt.ders.yoklama.kaydedildi.v1');
      expect(ev.map((e) => [e.payload.data.onceki_durum, e.payload.data.durum])).toEqual([
        [null, 'geldi'],
        ['geldi', 'izinli'],
        ['izinli', 'geldi'],
      ]);
    });

    it('son yazan kazanir: gec gelen eski isaretleme yeniyi ezmez, kredi etkisi yok', async () => {
      const { s, ders } = await paketliKurulum(1);
      const o = ogr(s, 0);
      const yeni = await kaydet(s, ders.id, [
        y.yoklamaSatiri(o, 'geldi', { isaretlenme_at: sn(-1000) }),
      ]);
      expect(yeni.statusCode).toBe(200);
      const eski = await kaydet(s, ders.id, [
        y.yoklamaSatiri(o, 'izinli', { isaretlenme_at: sn(-60_000) }),
      ]);
      const r = eski.json<KaydetYaniti>().sonuclar[0];
      expect(r?.sonuc).toBe('eski');
      expect(r?.yoklama.durum).toBe('geldi');
      expect(r?.kalan_kredi).toBeNull();
      expect(await y.kalanKredi(o)).toBe(7);
      expect(await olaylar(s.k.kurumId, 'evt.ders.yoklama.kaydedildi.v1')).toHaveLength(1);
    });

    it('geri alma: tek satir hatasinda hicbir yoklama, kredi, olay ve istek kaydi kalmaz', async () => {
      const { s, ders } = await paketliKurulum(3);
      const [o1, o2, o3] = s.ogrenciler as [string, string, string];
      // 1) Katilimci olmayan ogrenci: 422, hicbir sey yazilmaz.
      const yabanci = await tekOgrenci(s.k.kurumId, 'Yabanci');
      const anahtar = uuidv7();
      const red = await kaydet(
        s,
        ders.id,
        [y.yoklamaSatiri(o1), y.yoklamaSatiri(o2), y.yoklamaSatiri(yabanci)],
        s.hoca.token,
        anahtar,
      );
      expect(red.statusCode).toBe(422);
      expect(hataKodu(red)).toBe('ogrenci_katilimci_degil');

      // 2) Yazim sirasinda (ucuncu satirda) veritabani hatasi: onceki satirlar ve kredi geri alinir.
      const ad = `tuzak_${uuidv7().replaceAll('-', '').slice(0, 12)}`;
      await sahipDb.unsafe(`
        create function ders.${ad}() returns trigger language plpgsql as $f$
        begin
          if new.ogrenci_id = '${o3}' then raise exception 'tuzak'; end if;
          return new;
        end $f$;
        create trigger ${ad} before insert on ders.yoklama_gecmisi
          for each row execute function ders.${ad}();`);
      try {
        const patla = await kaydet(
          s,
          ders.id,
          [y.yoklamaSatiri(o1), y.yoklamaSatiri(o2), y.yoklamaSatiri(o3)],
          s.hoca.token,
          anahtar,
        );
        expect(patla.statusCode).toBe(500);
      } finally {
        await sahipDb.unsafe(
          `drop trigger ${ad} on ders.yoklama_gecmisi; drop function ders.${ad}();`,
        );
      }
      const [yk] = await sistem<
        { n: number }[]
      >`select count(*)::int n from ders.yoklamalar where ders_id = ${ders.id}`;
      expect(yk?.n).toBe(0);
      for (const o of [o1, o2, o3]) {
        expect(await y.kalanKredi(o)).toBe(8);
        expect((await y.krediHareketleri(o)).map((h) => h.tur)).toEqual(['satin_alma']);
      }
      expect(await olaylar(s.k.kurumId, 'evt.ders.yoklama.kaydedildi.v1')).toHaveLength(0);
      const [ist] = await sistem<
        { n: number }[]
      >`select count(*)::int n from ders.yoklama_istekleri where kurum_id = ${s.k.kurumId}`;
      expect(ist?.n).toBe(0);
      expect((await y.dersOku(s, ders.id)).durum).toBe('planli');
      // Ayni anahtar hata sonrasi yeniden denenebilir (istek satiri geri alindi).
      const tekrar = await kaydet(s, ders.id, [y.yoklamaSatiri(o1)], s.hoca.token, anahtar);
      expect(tekrar.statusCode).toBe(200);
    });
  });

  describe('engeller ve kilit', () => {
    it('gelecek ders 422 ders_henuz_baslamadi; 5 dk icinde baslayacak ders alinabilir', async () => {
      const s = await y.kur({ ogrenciSayisi: 1 });
      const o = ogr(s, 0);
      const gelecek = await y.dersAc(s);
      const res = await kaydet(s, gelecek.id, [y.yoklamaSatiri(o)]);
      expect(res.statusCode).toBe(422);
      expect(hataKodu(res)).toBe('ders_henuz_baslamadi');
      expect((await y.dersOku(s, gelecek.id)).durum).toBe('planli');

      await sistem`update ders.dersler set baslangic_at = now() + interval '4 minutes', bitis_at = now() + interval '64 minutes' where id = ${gelecek.id}`;
      expect((await kaydet(s, gelecek.id, [y.yoklamaSatiri(o)])).statusCode).toBe(200);
      const [d2] = await sistem<
        { id: string }[]
      >`select id from ders.dersler where id = ${gelecek.id}`;
      expect(d2?.id).toBe(gelecek.id);

      const uzak = await y.dersAc(s, { tarih: pazartesi(3) });
      await sistem`update ders.dersler set baslangic_at = now() + interval '30 minutes', bitis_at = now() + interval '90 minutes' where id = ${uzak.id}`;
      const r2 = await kaydet(s, uzak.id, [y.yoklamaSatiri(o)]);
      expect(r2.statusCode).toBe(422);
    });

    it('iptal edilmis derse yoklama 409', async () => {
      const s = await y.kur({ ogrenciSayisi: 1 });
      const ders = await y.gecmisDers(s);
      const ip = await y.post(s.k, s.hoca.token, `/dersler/${ders.id}/iptal`, {
        iptal_kaynagi: 'ogretmen',
      });
      expect(ip.statusCode, ip.body).toBe(200);
      const res = await kaydet(s, ders.id, [y.yoklamaSatiri(ogr(s, 0))]);
      expect(res.statusCode).toBe(409);
      expect(hataKodu(res)).toBe('ders_iptal_edildi');
    });

    it('kilit: 14 gun sonra ogretmen 403 yoklama_kilitli, sahip duzeltir; kurum ayari uzatir', async () => {
      const s = await y.kur({ ogrenciSayisi: 1 });
      const o = ogr(s, 0);
      const eski = await y.gecmisDers(s, {}, 20);
      const ogretmen = await kaydet(s, eski.id, [y.yoklamaSatiri(o)]);
      expect(ogretmen.statusCode).toBe(403);
      expect(hataKodu(ogretmen)).toBe('yoklama_kilitli');
      const sahip = await kaydet(s, eski.id, [y.yoklamaSatiri(o)], s.k.token);
      expect(sahip.statusCode, sahip.body).toBe(200);
      // sahip yazdi, sonra ogretmen yine duzenleyemez
      const yine = await kaydet(s, eski.id, [y.yoklamaSatiri(o, 'izinli')]);
      expect(yine.statusCode).toBe(403);
      await sistem`update hesap.kurumlar set ayarlar = '{"yoklama_kilit_gun": 30}'::jsonb where id = ${s.k.kurumId}`;
      const uzatildi = await kaydet(s, eski.id, [y.yoklamaSatiri(o, 'izinli')]);
      expect(uzatildi.statusCode, uzatildi.body).toBe(200);
      // 14 gun icinde serbest
      const yakin = await y.gecmisDers(s, { baslangic_saati: '12:00' }, 10);
      await sistem`update hesap.kurumlar set ayarlar = '{}'::jsonb where id = ${s.k.kurumId}`;
      expect((await kaydet(s, yakin.id, [y.yoklamaSatiri(o)])).statusCode).toBe(200);
    });

    it('yoklama modulu kapaliysa uclar modul_kapali; finans kapaliysa yoklama kaydedilir, kredi etkisi yok', async () => {
      const { s, ders } = await paketliKurulum(1);
      const o = ogr(s, 0);
      await sistem`insert into hesap.modul_ayarlari (id, kurum_id, modul_kodu, kapsam, kapsam_id, acik)
        values (${uuidv7()}, ${s.k.kurumId}, 'finans', 'kurum', ${s.k.kurumId}, false)`;
      const res = await kaydet(s, ders.id, [y.yoklamaSatiri(o)]);
      expect(res.statusCode, res.body).toBe(200);
      expect(res.json<KaydetYaniti>().sonuclar[0]).toMatchObject({
        sonuc: 'yeni',
        kalan_kredi: null,
        uyari: null,
      });
      expect(await y.kalanKredi(o)).toBe(8);
      expect((await y.krediHareketleri(o)).map((h) => h.tur)).toEqual(['satin_alma']);

      await sistem`insert into hesap.modul_ayarlari (id, kurum_id, modul_kodu, kapsam, kapsam_id, acik)
        values (${uuidv7()}, ${s.k.kurumId}, 'yoklama', 'kurum', ${s.k.kurumId}, false)`;
      const kapali = await kaydet(s, ders.id, [y.yoklamaSatiri(o, 'izinli')]);
      expect(kapali.statusCode).toBe(403);
      expect(hataKodu(kapali)).toBe('modul_kapali');
      const liste = await y.get(s.k, s.hoca.token, `/dersler/${ders.id}/yoklamalar`);
      expect(liste.statusCode).toBe(403);
      const bekleyen = await y.get(s.k, s.hoca.token, '/yoklama-bekleyen');
      expect(bekleyen.statusCode).toBe(403);
    });
  });

  describe('kapsam ve gorunurluk', () => {
    it('vekil ogretmen atandigi gruptaki dersi alir; atanmamis ogretmen 404; ogrenci yazamaz', async () => {
      const s = await y.kur({ ogrenciSayisi: 2 });
      const o = ogr(s, 0);
      const ders = await y.gecmisDers(s);
      const vekil = await y.davetliUye(s.k, 'ogretmen');
      await y.ata(s.k, s.grup.id, vekil.uyelikId);
      const yabanci = await y.davetliUye(s.k, 'ogretmen');
      const baskaGrup = await y.grupAc(s.k, 'grup', 'Baska');
      await y.ata(s.k, baskaGrup.id, yabanci.uyelikId);
      const ogrenci = await y.davetliUye(s.k, 'ogrenci');

      const baska = await kaydet(s, ders.id, [y.yoklamaSatiri(o)], yabanci.token);
      expect(baska.statusCode).toBe(404);
      const liste404 = await y.get(s.k, yabanci.token, `/dersler/${ders.id}/yoklamalar`);
      expect(liste404.statusCode).toBe(404);
      const yazamaz = await kaydet(s, ders.id, [y.yoklamaSatiri(o)], ogrenci.token);
      expect(yazamaz.statusCode).toBe(403);
      const vekilRes = await kaydet(s, ders.id, [y.yoklamaSatiri(o)], vekil.token);
      expect(vekilRes.statusCode, vekilRes.body).toBe(200);
      const [satir] = await sistem<
        { isaretleyen_id: string }[]
      >`select isaretleyen_id from ders.yoklamalar where ders_id = ${ders.id}`;
      expect(satir?.isaretleyen_id).toBe(vekil.uyelikId);
    });

    it('GET: personel tum katilimcilari (yoklamasizlar dahil); ogrenci yalniz kendini, ogretmene ozel not gelmez', async () => {
      const s = await y.kur({ ogrenciSayisi: 1 });
      const ogrenci = await y.davetliUye(s.k, 'ogrenci');
      const ogrenci2 = await y.davetliUye(s.k, 'ogrenci');
      await y.gruba(s.k, s.grup.id, [ogrenci.uyelikId, ogrenci2.uyelikId]);
      const ders = await y.gecmisDers(s);
      const ilk = ogr(s, 0);
      const res = await kaydet(s, ders.id, [
        y.yoklamaSatiri(ogrenci.uyelikId, 'geldi', {
          not: 'gizli not',
          not_gorunurluk: 'ogretmene_ozel',
        }),
        y.yoklamaSatiri(ogrenci2.uyelikId, 'gec', {
          not: 'gorunur not',
          not_gorunurluk: 'ogrenciye',
        }),
      ]);
      expect(res.statusCode, res.body).toBe(200);

      const personel = (
        await y.get(s.k, s.hoca.token, `/dersler/${ders.id}/yoklamalar`)
      ).json<ListeYaniti>();
      expect(personel.katilimcilar).toHaveLength(3);
      expect(personel.katilimcilar.find((k) => k.ogrenci_id === ilk)?.yoklama).toBeNull();
      expect(personel.katilimcilar.find((k) => k.ogrenci_id === ilk)?.gorunen_ad).toMatch(
        /^Ogrenci/,
      );
      expect(
        personel.katilimcilar.find((k) => k.ogrenci_id === ogrenci.uyelikId)?.yoklama?.not,
      ).toBe('gizli not');

      const o1 = await y.get(s.k, ogrenci.token, `/dersler/${ders.id}/yoklamalar`);
      expect(o1.statusCode).toBe(200);
      const g1 = o1.json<ListeYaniti>();
      expect(g1.katilimcilar.map((k) => k.ogrenci_id)).toEqual([ogrenci.uyelikId]);
      expect(g1.katilimcilar[0]?.yoklama?.not).toBeNull();
      expect(g1.katilimcilar[0]?.yoklama?.durum).toBe('geldi');
      expect(o1.body).not.toMatch(/gizli not/);
      const o2 = (
        await y.get(s.k, ogrenci2.token, `/dersler/${ders.id}/yoklamalar`)
      ).json<ListeYaniti>();
      expect(o2.katilimcilar).toHaveLength(1);
      expect(o2.katilimcilar[0]?.yoklama?.not).toBe('gorunur not');
      expect(o2.katilimcilar[0]?.yoklama?.gec_dakika).toBe(10);
      // olaylarda not yok
      const metin = JSON.stringify(await olaylar(s.k.kurumId, 'evt.ders.yoklama.kaydedildi.v1'));
      expect(metin).not.toMatch(/gizli not|gorunur not/);
    });
  });

  describe('finans etkisi', () => {
    it('ders_basi modeli: tarifeden ucret borclandirilir; duzeltmede ters kayit; tarife yoksa uyari', async () => {
      const s = await y.kur({ ogrenciSayisi: 1 });
      const o = ogr(s, 0);
      const finans = (yol: string) => `/v1/finans/kurumlar/${s.k.kurumId}${yol}`;
      const profil = await y.app.inject({
        method: 'PUT',
        url: finans(`/ogrenciler/${o}/finans-profili`),
        headers: bearer(s.k.token),
        payload: { model: 'ders_basi' },
      });
      expect(profil.statusCode, profil.body).toBe(200);
      const ders = await y.gecmisDers(s);
      const yok = await kaydet(s, ders.id, [
        y.yoklamaSatiri(o, 'geldi', { isaretlenme_at: sn(-3000) }),
      ]);
      expect(yok.json<KaydetYaniti>().sonuclar[0]).toMatchObject({
        sonuc: 'yeni',
        uyari: 'ucret_tarifesi_yok',
      });
      expect(yok.statusCode).toBe(200);

      const tarife = await y.app.inject({
        method: 'POST',
        url: finans('/ucret-tarifeleri'),
        headers: bearer(s.k.token),
        payload: { ucret_kurus: 25_000, gecerlilik_baslangic: '2020-01-01' },
      });
      expect(tarife.statusCode, tarife.body).toBe(201);
      const ders2 = await y.gecmisDers(s, { baslangic_saati: '13:00' });
      const r = await kaydet(s, ders2.id, [
        y.yoklamaSatiri(o, 'geldi', { isaretlenme_at: sn(-2000) }),
      ]);
      expect(r.json<KaydetYaniti>().sonuclar[0]?.uyari).toBeNull();
      const ucretler = () => sistem<{ tur: string; tutar_kurus: string }[]>`
        select tur, tutar_kurus::text from finans.bakiye_hareketleri where ogrenci_id = ${o} order by created_at, id`;
      expect((await ucretler()).map((u) => [u.tur, u.tutar_kurus])).toEqual([
        ['ders_ucreti', '-25000'],
      ]);
      const duzelt = await kaydet(s, ders2.id, [
        y.yoklamaSatiri(o, 'izinli', { isaretlenme_at: sn(-1000) }),
      ]);
      expect(duzelt.statusCode).toBe(200);
      expect((await ucretler()).map((u) => [u.tur, u.tutar_kurus])).toEqual([
        ['ders_ucreti', '-25000'],
        ['ters_kayit', '25000'],
      ]);
      // ders_basi ogrencide kredi hareketi yok
      expect(await y.krediHareketleri(o)).toHaveLength(0);
    });

    it('geç iptal: ogrenci iptali kredi dusurur (politika saati kurumdan), ogretmen iptali etkisiz', async () => {
      const s = await y.kur({ ogrenciSayisi: 1, grupTur: 'birebir' });
      const o = ogr(s, 0);
      await y.paketSat(s, o, 8);
      const yakin = (saat: string) => y.dersAc(s, { tarih: pazartesi(2), baslangic_saati: saat });

      // Ogrenci, 3 saat kala (esik 24): gec iptal -> iptal_dusum
      const d1 = await yakin('10:00');
      await sistem`update ders.dersler set baslangic_at = now() + interval '3 hours', bitis_at = now() + interval '4 hours' where id = ${d1.id}`;
      const i1 = await y.post(s.k, s.hoca.token, `/dersler/${d1.id}/iptal`, {
        iptal_kaynagi: 'ogrenci',
      });
      expect(i1.statusCode, i1.body).toBe(200);
      expect(i1.json<IslemYaniti>().ders.gec_iptal).toBe(true);
      expect((await y.krediHareketleri(o)).map((h) => h.tur)).toEqual([
        'satin_alma',
        'iptal_dusum',
      ]);
      expect(await y.kalanKredi(o)).toBe(7);

      // Ogretmen iptali: etki yok
      const d2 = await yakin('11:00');
      await sistem`update ders.dersler set baslangic_at = now() + interval '3 hours 30 minutes', bitis_at = now() + interval '4 hours 30 minutes' where id = ${d2.id}`;
      const i2 = await y.post(s.k, s.hoca.token, `/dersler/${d2.id}/iptal`, {
        iptal_kaynagi: 'ogretmen',
      });
      expect(i2.statusCode).toBe(200);
      expect(i2.json<IslemYaniti>().ders.gec_iptal).toBe(false);
      expect(await y.kalanKredi(o)).toBe(7);

      // Politika: esik 1 saat -> 3 saat kala artik gec degil
      const pol = await y.app.inject({
        method: 'PUT',
        url: `/v1/finans/kurumlar/${s.k.kurumId}/kredi-politikasi`,
        headers: bearer(s.k.token),
        payload: { gec_iptal_saat: 1 },
      });
      expect(pol.statusCode, pol.body).toBe(200);
      const d3 = await yakin('12:00');
      await sistem`update ders.dersler set baslangic_at = now() + interval '5 hours', bitis_at = now() + interval '6 hours' where id = ${d3.id}`;
      const i3 = await y.post(s.k, s.hoca.token, `/dersler/${d3.id}/iptal`, {
        iptal_kaynagi: 'ogrenci',
      });
      expect(i3.statusCode).toBe(200);
      expect(i3.json<IslemYaniti>().ders.gec_iptal).toBe(false);
      expect(await y.kalanKredi(o)).toBe(7);
      // ... ama 30 dk kala gec
      const d4 = await yakin('14:00');
      await sistem`update ders.dersler set baslangic_at = now() + interval '30 minutes', bitis_at = now() + interval '90 minutes' where id = ${d4.id}`;
      const i4 = await y.post(s.k, s.hoca.token, `/dersler/${d4.id}/iptal`, {
        iptal_kaynagi: 'ogrenci',
      });
      expect(i4.json<IslemYaniti>().ders.gec_iptal).toBe(true);
      expect(await y.kalanKredi(o)).toBe(6);
    });

    it('yoklama sonrasi iptal dusumu ters cevirir (iade); kilit ogretmene, kapsam yalniz_bu', async () => {
      const { s, ders } = await paketliKurulum(2);
      const [o1, o2] = s.ogrenciler as [string, string];
      const r = await kaydet(s, ders.id, [y.yoklamaSatiri(o1), y.yoklamaSatiri(o2, 'gelmedi')]);
      expect(r.statusCode).toBe(200);
      expect(await y.kalanKredi(o1)).toBe(7);
      expect(await y.kalanKredi(o2)).toBe(7);

      const seri = await y.post(s.k, s.hoca.token, `/dersler/${ders.id}/iptal`, {
        iptal_kaynagi: 'ogretmen',
        kapsam: 'bu_ve_sonrakiler',
      });
      expect([422, 409]).toContain(seri.statusCode); // seride degil / kapsam
      const ip = await y.post(s.k, s.hoca.token, `/dersler/${ders.id}/iptal`, {
        iptal_kaynagi: 'ogretmen',
        iptal_nedeni: 'Yanlis ders',
      });
      expect(ip.statusCode, ip.body).toBe(200);
      expect(ip.json<IslemYaniti>().ders.durum).toBe('iptal');
      expect(await y.kalanKredi(o1)).toBe(8);
      expect(await y.kalanKredi(o2)).toBe(8);
      expect((await y.krediHareketleri(o1)).map((h) => h.tur)).toEqual([
        'satin_alma',
        'dusum',
        'iade',
      ]);
      // iptal sonrasi yoklama duzeltme 409
      const sonra = await kaydet(s, ders.id, [y.yoklamaSatiri(o1, 'izinli')]);
      expect(sonra.statusCode).toBe(409);
    });

    it('tamamlanmis dersin iptali: seride kapsam yalniz_bu, kilit ogretmene 403 / sahibe serbest', async () => {
      const s = await y.kur({ ogrenciSayisi: 1 });
      const o = ogr(s, 0);
      await y.paketSat(s, o, 8);
      const seri = await y.seriAc(s, {
        tekrar_kurali: 'FREQ=DAILY',
        baslangic_tarihi: gunSonra(-3),
        adet: 3,
      });
      const [d0, d1] = seri.dersler as [DersJson, DersJson];
      for (const d of [d0, d1]) {
        const r = await kaydet(s, d.id, [y.yoklamaSatiri(o)]);
        expect(r.statusCode, r.body).toBe(200);
      }
      expect(await y.kalanKredi(o)).toBe(6);
      const bu = await y.post(s.k, s.hoca.token, `/dersler/${d1.id}/iptal`, {
        iptal_kaynagi: 'ogretmen',
        kapsam: 'bu_ve_sonrakiler',
      });
      expect(bu.statusCode).toBe(422);
      expect(hataKodu(bu)).toBe('tamamlanmis_ders_yalniz_bu');
      // kilit
      await sistem`update ders.dersler set baslangic_at = baslangic_at - interval '30 days', bitis_at = bitis_at - interval '30 days', cakisma_onayli = true where id = ${d0.id}`;
      const kilitli = await y.post(s.k, s.hoca.token, `/dersler/${d0.id}/iptal`, {
        iptal_kaynagi: 'ogretmen',
      });
      expect(kilitli.statusCode).toBe(403);
      expect(hataKodu(kilitli)).toBe('yoklama_kilitli');
      const sahip = await y.post(s.k, s.k.token, `/dersler/${d0.id}/iptal`, {
        iptal_kaynagi: 'yonetici',
      });
      expect(sahip.statusCode, sahip.body).toBe(200);
      expect(await y.kalanKredi(o)).toBe(7);
      // tasi/bilgi guncelleme tamamlanmis derste planli ile sinirli kalir
      const tasi = await y.post(s.k, s.hoca.token, `/dersler/${d1.id}/tasi`, {
        surum: 99,
        yeni_saat: '18:00',
      });
      expect(tasi.statusCode).toBe(409);
      expect(hataKodu(tasi)).toBe('ders_planli_degil');
    });

    it('katilimci cikarma: yoklamasi olan 409 katilimci_yoklamali, olmayan cikarilir', async () => {
      const { s, ders } = await paketliKurulum(2);
      const [o1, o2] = s.ogrenciler as [string, string];
      expect((await kaydet(s, ders.id, [y.yoklamaSatiri(o1)])).statusCode).toBe(200);
      const red = await y.app.inject({
        method: 'DELETE',
        url: y.api(s.k, `/dersler/${ders.id}/katilimcilar/${o1}`),
        headers: bearer(s.hoca.token),
      });
      expect(red.statusCode).toBe(409);
      expect(hataKodu(red)).toBe('katilimci_yoklamali');
      const ok = await y.app.inject({
        method: 'DELETE',
        url: y.api(s.k, `/dersler/${ders.id}/katilimcilar/${o2}`),
        headers: bearer(s.hoca.token),
      });
      expect(ok.statusCode, ok.body).toBe(200);
    });
  });

  describe('katilimci esitleme', () => {
    const esitleOlaylari = async (kurumId: string) =>
      (await olaylar(kurumId, 'evt.ders.ders.degisti.v1')).filter(
        (o) => o.payload.data.degisim_turu === 'guncellendi',
      );

    it('GET: gruba sonradan katilan eklenir, ayrilan cikarilir, misafir/telafi ve yoklamali kalir; idempotent', async () => {
      const s = await y.kur({ ogrenciSayisi: 2 });
      const [kalan, ayrilan] = s.ogrenciler as [string, string];
      const ders = await y.dersAc(s); // gelecek, planli
      const yeni = await tekOgrenci(s.k.kurumId, 'Yeni');
      const misafir = await tekOgrenci(s.k.kurumId, 'Misafir');
      const add = await y.post(s.k, s.hoca.token, `/dersler/${ders.id}/katilimcilar`, {
        ogrenci_id: misafir,
        tur: 'misafir',
      });
      expect(add.statusCode).toBe(201);

      await y.gruba(s.k, s.grup.id, [yeni]);
      await sistem`update hesap.grup_uyeleri set baslangic_tarihi = current_date - 30, bitis_tarihi = current_date - 1 where grup_id = ${s.grup.id} and ogrenci_id = ${ayrilan}`;

      const once = (await esitleOlaylari(s.k.kurumId)).length;
      const liste = (
        await y.get(s.k, s.hoca.token, `/dersler/${ders.id}/yoklamalar`)
      ).json<ListeYaniti>();
      const idler = liste.katilimcilar.map((k) => k.ogrenci_id).sort();
      expect(idler).toEqual([kalan, yeni, misafir].sort());
      expect(liste.katilimcilar.find((k) => k.ogrenci_id === misafir)?.tur).toBe('misafir');
      expect(liste.katilimcilar.find((k) => k.ogrenci_id === yeni)?.tur).toBe('uye');
      expect((await esitleOlaylari(s.k.kurumId)).length).toBe(once + 1);

      // Idempotent: ikinci cagri degisiklik ve olay uretmez
      await y.get(s.k, s.hoca.token, `/dersler/${ders.id}/yoklamalar`);
      expect((await esitleOlaylari(s.k.kurumId)).length).toBe(once + 1);
    });

    it('PUT: sonradan katilan ogrenci icin yoklama alinabilir; yoklamasi olan ayrilan korunur; gecmis dersler eklenmez', async () => {
      const s = await y.kur({ ogrenciSayisi: 2 });
      const [a, ayrilan] = s.ogrenciler as [string, string];
      const gecmis = await y.gecmisDers(s);
      const yeni = await tekOgrenci(s.k.kurumId, 'Gec Katilan');
      await y.gruba(s.k, s.grup.id, [yeni]); // baslangic_tarihi = bugun > ders gunu
      const eklenmez = await kaydet(s, gecmis.id, [y.yoklamaSatiri(yeni)]);
      expect(eklenmez.statusCode).toBe(422);
      expect(hataKodu(eklenmez)).toBe('ogrenci_katilimci_degil');

      // Planli ders; baslangic_tarihi gecmise cekilirse eklenir
      const gelecek = await y.dersAc(s, { tarih: pazartesi(2) });
      await sistem`update hesap.grup_uyeleri set baslangic_tarihi = current_date - 30 where ogrenci_id = ${yeni}`;
      await sistem`update ders.dersler set baslangic_at = now() + interval '1 minute', bitis_at = now() + interval '61 minutes' where id = ${gelecek.id}`;
      // yoklamasi olan ayrilan korunur (yoklama elle eklenir; planli dersin yoklamali satiri silinmez)
      await sistem`update hesap.grup_uyeleri set baslangic_tarihi = current_date - 30, bitis_tarihi = current_date - 1 where ogrenci_id = ${ayrilan}`;
      await sistem`insert into ders.yoklamalar (id, kurum_id, ders_id, ogrenci_id, durum, isaretleyen_id, isaretlenme_at)
        values (${uuidv7()}, ${s.k.kurumId}, ${gelecek.id}, ${ayrilan}, 'geldi', ${s.hoca.uyelikId}, now())`;
      const res = await kaydet(s, gelecek.id, [y.yoklamaSatiri(yeni), y.yoklamaSatiri(a)]);
      expect(res.statusCode, res.body).toBe(200);
      const liste = (
        await y.get(s.k, s.hoca.token, `/dersler/${gelecek.id}/yoklamalar`)
      ).json<ListeYaniti>();
      expect(liste.katilimcilar.map((k) => k.ogrenci_id)).toContain(ayrilan);
    });

    it('ogrenci: gruba sonradan katildiktan sonra kendi (onceden uretilmis) dersini GET ile gorur', async () => {
      const s = await y.kur({ ogrenciSayisi: 1 });
      const ders = await y.dersAc(s);
      const ogrenci = await y.davetliUye(s.k, 'ogrenci');
      expect((await y.get(s.k, ogrenci.token, `/dersler/${ders.id}/yoklamalar`)).statusCode).toBe(
        404,
      );
      await y.gruba(s.k, s.grup.id, [ogrenci.uyelikId]);
      const res = await y.get(s.k, ogrenci.token, `/dersler/${ders.id}/yoklamalar`);
      expect(res.statusCode, res.body).toBe(200);
      expect(res.json<ListeYaniti>().katilimcilar.map((k) => k.ogrenci_id)).toEqual([
        ogrenci.uyelikId,
      ]);
    });
  });

  describe('yoklama-bekleyen', () => {
    it('baslamis planli, eksik yoklamali, son 14 gun, kapsam suzgecli, azalan sirali ve sayfali', async () => {
      const s = await y.kur({ ogrenciSayisi: 2 });
      const [o1, o2] = s.ogrenciler as [string, string];
      const dun = await y.gecmisDers(s, { baslangic_saati: '10:00' }, 1);
      const evvelsi = await y.gecmisDers(s, { baslangic_saati: '10:00' }, 2);
      const eski = await y.gecmisDers(s, { baslangic_saati: '10:00' }, 20);
      const gelecek = await y.dersAc(s, { tarih: pazartesi(1) });
      const iptal = await y.gecmisDers(s, { baslangic_saati: '15:00' }, 3);
      expect(
        (
          await y.post(s.k, s.hoca.token, `/dersler/${iptal.id}/iptal`, {
            iptal_kaynagi: 'ogretmen',
          })
        ).statusCode,
      ).toBe(200);

      const liste = async (token: string, sorgu = '') =>
        (await y.get(s.k, token, `/yoklama-bekleyen${sorgu}`)).json<{
          dersler: { id: string; yoklamasi_eksik_sayisi: number; katilimci_sayisi: number }[];
          sonraki_imlec: string | null;
        }>();
      const l = await liste(s.hoca.token);
      expect(l.dersler.map((d) => d.id)).toEqual([dun.id, evvelsi.id]);
      expect(l.dersler.map((d) => d.id)).not.toContain(eski.id);
      expect(l.dersler.map((d) => d.id)).not.toContain(gelecek.id);
      expect(l.dersler[0]).toMatchObject({ yoklamasi_eksik_sayisi: 2, katilimci_sayisi: 2 });

      // sayfalama
      const p1 = await liste(s.hoca.token, '?limit=1');
      expect(p1.dersler.map((d) => d.id)).toEqual([dun.id]);
      expect(p1.sonraki_imlec).not.toBeNull();
      const p2 = await liste(s.hoca.token, `?limit=1&imlec=${p1.sonraki_imlec ?? ''}`);
      expect(p2.dersler.map((d) => d.id)).toEqual([evvelsi.id]);
      expect(p2.sonraki_imlec).toBeNull();

      // kismi yoklama (planli kalan ders): yoklama alinan ders tamamlandi olur ve listeden duser
      expect(
        (await kaydet(s, dun.id, [y.yoklamaSatiri(o1), y.yoklamaSatiri(o2, 'gelmedi')])).statusCode,
      ).toBe(200);
      expect((await liste(s.hoca.token)).dersler.map((d) => d.id)).toEqual([evvelsi.id]);

      // kapsam: baska grubun ogretmeni gormez; ogrenci listeyi acamaz
      const yabanci = await y.davetliUye(s.k, 'ogretmen');
      const g2 = await y.grupAc(s.k, 'grup', 'Baska');
      await y.ata(s.k, g2.id, yabanci.uyelikId);
      expect((await liste(yabanci.token)).dersler).toEqual([]);
      const ogrenci = await y.davetliUye(s.k, 'ogrenci');
      expect((await y.get(s.k, ogrenci.token, '/yoklama-bekleyen')).statusCode).toBe(403);
    });
  });

  describe('saatlik is', () => {
    it('gelecek planli derslerin katilimcilarini esitler (sonradan katilan, ayrilan); ikinci calisma is yapmaz', async () => {
      const s = await y.kur({ ogrenciSayisi: 2 });
      const [kalan, ayrilan] = s.ogrenciler as [string, string];
      const d1 = await y.dersAc(s, { tarih: pazartesi(1) });
      const d2 = await y.dersAc(s, { tarih: pazartesi(2) });
      const yeni = await tekOgrenci(s.k.kurumId, 'Yeni');
      await y.gruba(s.k, s.grup.id, [yeni]);
      await sistem`update hesap.grup_uyeleri set baslangic_tarihi = current_date - 30, bitis_tarihi = current_date - 1 where grup_id = ${s.grup.id} and ogrenci_id = ${ayrilan}`;

      const sistemDb = createDb({ url: urls?.sistemUrl ?? '', max: 2 });
      try {
        const ozet = await dersKatilimcilariniEsitleSistem(sistemDb, { kurumId: s.k.kurumId });
        expect(ozet).toMatchObject({ kurum: 1, ders: 2, eklenen: 2, cikarilan: 2, hata: 0 });
        for (const d of [d1, d2]) {
          const idler = (await y.dersOku(s, d.id)).katilimcilar?.map((k) => k.ogrenci_id).sort();
          expect(idler).toEqual([kalan, yeni].sort());
        }
        const olaySayisi = (await olaylar(s.k.kurumId, 'evt.ders.ders.degisti.v1')).length;
        const denetimSayisi = async () => {
          const [r] = await sistem<
            { n: number }[]
          >`select count(*)::int n from hesap.denetim_kayitlari where kurum_id = ${s.k.kurumId} and eylem = 'sistem.ders_katilimci_esitle'`;
          return r?.n ?? 0;
        };
        expect(await denetimSayisi()).toBe(1);
        const ikinci = await dersKatilimcilariniEsitleSistem(sistemDb, { kurumId: s.k.kurumId });
        expect(ikinci).toMatchObject({ kurum: 0, ders: 0, eklenen: 0, cikarilan: 0, hata: 0 });
        expect((await olaylar(s.k.kurumId, 'evt.ders.ders.degisti.v1')).length).toBe(olaySayisi);
        expect(await denetimSayisi()).toBe(1);
      } finally {
        await sistemDb.close();
      }
    });

    it('14 gunden eski yoklama_istekleri silinir, yenisi kalir', async () => {
      const s = await y.kur({ ogrenciSayisi: 1 });
      const ders = await y.dersAc(s);
      const ekle = (
        gun: number,
      ) => sistem`insert into ders.yoklama_istekleri (id, kurum_id, istek_id, ders_id, kullanici_id, govde_sha256, durum_kodu, yanit, created_at)
        values (${uuidv7()}, ${s.k.kurumId}, ${uuidv7()}, ${ders.id}, ${s.k.kullaniciId}, decode('00', 'hex'), 200, '{}'::jsonb, now() - ${gun} * interval '1 day')`;
      await ekle(15);
      await ekle(13);
      const sistemDb = createDb({ url: urls?.sistemUrl ?? '', max: 2 });
      try {
        const silinen = await eskiYoklamaIstekleriniSil(sistemDb);
        expect(silinen).toBeGreaterThanOrEqual(1);
      } finally {
        await sistemDb.close();
      }
      const kalan = await sistem<
        { n: number }[]
      >`select count(*)::int n from ders.yoklama_istekleri where kurum_id = ${s.k.kurumId}`;
      expect(kalan[0]?.n).toBe(1);
    });
  });
});
