import {
  MotivasyonOgrenciDurumuSema,
  YildizAldiklariYanitiSema,
  YildizVerYanitiSema,
  YildizVerdiklerimYanitiSema,
} from '@kopru/contracts';
import type { Service } from '@kopru/service-kit';
import { uuidv7 } from 'uuidv7';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { T0, ortamKur, type Ortam } from './test/ortam.js';
import {
  dbYok,
  kullaniciTokeni,
  testServisi,
  yeniKimlik,
  yetki,
  type Kimlik,
} from './test/yardimcilar.js';

describe.skipIf(dbYok())('haftanin yildizi (kullanici JWT, motivasyon_app)', () => {
  let o: Ortam;
  let servis: Service;
  let an = T0; // Sali 10 Kasim 2026 12:00 Istanbul; hafta Pazartesi 9 Kasim
  const kurumId = uuidv7();
  const taban = `/v1/motivasyon/kurumlar/${kurumId}`;
  const grup = uuidv7();
  const digerGrup = uuidv7();
  const ogretmen = yeniKimlik('ogretmen', kurumId);
  const digerOgretmen = yeniKimlik('ogretmen', kurumId);
  const yonetici = yeniKimlik('yonetici', kurumId);
  const veli = yeniKimlik('veli', kurumId);

  const uyeEkle = async (g: string, ogr: Kimlik, bitis: string | null = null) => {
    await o.sistem`insert into motivasyon.grup_uyesi_kopyalari (grup_id, ogrenci_id, kurum_id, grup_uyesi_id, baslangic_tarihi, bitis_tarihi, son_olay_at, son_olay_id)
                   values (${g}, ${ogr.uyelikId}, ${kurumId}, ${uuidv7()}, '2026-01-01', ${bitis}, now(), ${uuidv7()})`;
  };
  const yeniOgrenci = async (g: string | null = grup) => {
    const ogr = yeniKimlik('ogrenci', kurumId);
    if (g) await uyeEkle(g, ogr);
    return ogr;
  };
  const istek = async (
    k: Kimlik,
    method: 'GET' | 'POST',
    url: string,
    payload?: Record<string, unknown>,
  ) =>
    servis.app.inject({
      method,
      url: `${taban}${url}`,
      headers: yetki(await kullaniciTokeni(k)),
      ...(payload ? { payload } : {}),
    });
  const ver = (k: Kimlik, ogr: Kimlik, ek: Record<string, unknown> = {}) =>
    istek(k, 'POST', '/haftanin-yildizlari', {
      ogrenci_id: ogr.uyelikId,
      grup_id: grup,
      ...ek,
    });
  const hata = (r: { json: () => unknown }) => (r.json() as { error: { code: string } }).error.code;

  beforeAll(async () => {
    o = ortamKur();
    servis = testServisi({}, { simdi: () => an });
    await servis.app.ready();
    for (const g of [grup, digerGrup]) {
      await o.sistem`insert into motivasyon.grup_kopyalari (grup_id, kurum_id, tur, durum, son_olay_at, son_olay_id)
                     values (${g}, ${kurumId}, 'grup', 'aktif', now(), ${uuidv7()})`;
    }
    const atama = async (g: string, ogt: Kimlik, bitis: string | null = null) =>
      o.sistem`insert into motivasyon.atama_kopyalari (atama_id, kurum_id, grup_id, ogretmen_id, brans_kodu, baslangic_tarihi, bitis_tarihi, son_olay_at, son_olay_id)
               values (${uuidv7()}, ${kurumId}, ${g}, ${ogt.uyelikId}, 'matematik', '2026-01-01', ${bitis}, now(), ${uuidv7()})`;
    await atama(grup, ogretmen);
    await atama(digerGrup, digerOgretmen);
  });
  afterAll(async () => {
    await servis.stop();
    await o.kapat();
  });

  it("ver: 50 XP, tavandan muaf, sayac ve gizli rozet; ogrenci kendi yildizini ve XP'ini gorur", async () => {
    an = T0;
    const ogr = await yeniOgrenci();
    // genel tavan dolu: yildiz yine de 50 XP verir
    await o.sistem`insert into motivasyon.ogrenci_durumlari (id, kurum_id, ogrenci_id) values (${uuidv7()}, ${kurumId}, ${ogr.uyelikId})`;
    await o.sistem`insert into motivasyon.xp_gunluk_toplamlari (ogrenci_id, gun, tavan_grubu, kurum_id, toplam)
                   values (${ogr.uyelikId}, '2026-11-10', 'genel', ${kurumId}, 300)`;
    const r = await ver(ogretmen, ogr, { gerekce: 'Bu hafta çok çalıştı' });
    expect(r.statusCode).toBe(201);
    const y = YildizVerYanitiSema.parse(r.json());
    expect(y.xp).toBe(50);
    expect(y.yeni_rozetler).toEqual(['yildiz_bronz']);
    expect(y.yildiz).toMatchObject({
      ogrenci_id: ogr.uyelikId,
      veren_ogretmen_id: ogretmen.uyelikId,
      grup_id: grup,
      hafta_baslangic: '2026-11-09',
      gerekce: 'Bu hafta çok çalıştı',
    });

    const d = MotivasyonOgrenciDurumuSema.parse((await istek(ogr, 'GET', '/benim')).json());
    expect(d.toplam_xp).toBe(50);
    expect(d.bu_hafta_xp).toBe(50);
    expect(d.rozetler.kazanilan.map((x) => x.kod)).toEqual(['yildiz_bronz']);
    expect(d.son_hareketler[0]).toMatchObject({
      kural_kodu: 'haftanin_yildizi',
      xp: 50,
      kismi: false,
    });
    // genel tavan sayaci degismedi (muaf)
    expect(d.bugun.tavanlar[0]).toEqual({ kod: 'genel', kullanilan: 300, ust_sinir: 300 });
    const [s] = await o.sistem<{ deger: number }[]>`
      select deger::int from motivasyon.ogrenci_sayaclari where ogrenci_id = ${ogr.uyelikId} and sayac_kodu = 'haftanin_yildizi'`;
    expect(s?.deger).toBe(1);

    const al = YildizAldiklariYanitiSema.parse(
      (await istek(ogr, 'GET', `/ogrenciler/${ogr.uyelikId}/haftanin-yildizlari`)).json(),
    );
    expect(al.yildizlar).toHaveLength(1);
    expect(al.yildizlar[0]?.gerekce).toBe('Bu hafta çok çalıştı');
    // ogretmen kapsamdaki ogrencinin yildizlarini gorur, digeri 404
    expect(
      (await istek(ogretmen, 'GET', `/ogrenciler/${ogr.uyelikId}/haftanin-yildizlari`)).statusCode,
    ).toBe(200);
    expect(
      (await istek(digerOgretmen, 'GET', `/ogrenciler/${ogr.uyelikId}/haftanin-yildizlari`))
        .statusCode,
    ).toBe(404);
    expect(
      (await istek(await yeniOgrenci(), 'GET', `/ogrenciler/${ogr.uyelikId}/haftanin-yildizlari`))
        .statusCode,
    ).toBe(403);
  });

  it("ogrenci haftada bir kez (baska ogretmen de veremez); hafta Pazartesi 04:00'te degisir", async () => {
    an = T0;
    const ogr = await yeniOgrenci();
    await uyeEkle(digerGrup, ogr);
    expect((await ver(ogretmen, ogr)).statusCode).toBe(201);
    const r2 = await ver(ogretmen, ogr);
    expect(r2.statusCode).toBe(409);
    expect(hata(r2)).toBe('haftanin_yildizi_verilmis');
    const r3 = await istek(digerOgretmen, 'POST', '/haftanin-yildizlari', {
      ogrenci_id: ogr.uyelikId,
      grup_id: digerGrup,
    });
    expect(r3.statusCode).toBe(409);
    expect((await ver(yonetici, ogr)).statusCode).toBe(409);

    // Pazartesi 16 Kasim 00:30 Istanbul: hala onceki hafta (04:00 kurali)
    an = new Date('2026-11-15T21:30:00.000Z');
    expect(hata(await ver(ogretmen, ogr))).toBe('haftanin_yildizi_verilmis');
    // Pazartesi 04:30: yeni hafta
    an = new Date('2026-11-16T01:30:00.000Z');
    const r4 = await ver(ogretmen, ogr);
    expect(r4.statusCode).toBe(201);
    expect(YildizVerYanitiSema.parse(r4.json()).yildiz.hafta_baslangic).toBe('2026-11-16');
    expect(
      (await istek(ogr, 'GET', `/ogrenciler/${ogr.uyelikId}/haftanin-yildizlari`)).json<{
        yildizlar: unknown[];
      }>().yildizlar,
    ).toHaveLength(2);
  });

  it('ogretmen haftalik limiti: es zamanli 5 istekte en cok 3; verdiklerim ve yeni hafta', async () => {
    an = new Date('2026-12-01T09:00:00.000Z'); // Sali; hafta 30 Kasim
    const ogt = yeniKimlik('ogretmen', kurumId);
    await o.sistem`insert into motivasyon.atama_kopyalari (atama_id, kurum_id, grup_id, ogretmen_id, brans_kodu, baslangic_tarihi, son_olay_at, son_olay_id)
                   values (${uuidv7()}, ${kurumId}, ${grup}, ${ogt.uyelikId}, 'fizik', '2026-01-01', now(), ${uuidv7()})`;
    const ogrenciler = await Promise.all([1, 2, 3, 4, 5].map(() => yeniOgrenci()));
    const sonuclar = await Promise.all(ogrenciler.map((x) => ver(ogt, x)));
    const kodlar = sonuclar.map((r) => r.statusCode).sort();
    expect(kodlar).toEqual([201, 201, 201, 409, 409]);
    for (const r of sonuclar.filter((x) => x.statusCode === 409)) {
      expect(hata(r)).toBe('haftalik_limit_asildi');
    }
    const v = YildizVerdiklerimYanitiSema.parse(
      (await istek(ogt, 'GET', '/haftanin-yildizlari/verdiklerim')).json(),
    );
    expect(v).toMatchObject({ hafta_baslangic: '2026-11-30', limit: 3, verilen: 3, kalan: 0 });
    expect(v.yildizlar).toHaveLength(3);
    // basarisiz isteklerde XP yazilmadi: yalniz 3 ogrenci 50 XP aldi
    const [t] = await o.sistem<{ n: number }[]>`
      select count(*)::int as n from motivasyon.xp_hareketleri
       where kural_kodu = 'haftanin_yildizi' and ogrenci_id = any(${ogrenciler.map((x) => x.uyelikId)}::uuid[])`;
    expect(t?.n).toBe(3);

    // yonetici sinirsiz; limit/kalan null
    const adminYildiz = await Promise.all(ogrenciler.map((x) => ver(yonetici, x)));
    expect(adminYildiz.filter((r) => r.statusCode === 201)).toHaveLength(2);
    const av = YildizVerdiklerimYanitiSema.parse(
      (await istek(yonetici, 'GET', '/haftanin-yildizlari/verdiklerim')).json(),
    );
    expect(av).toMatchObject({ limit: null, kalan: null });

    // yeni hafta: hak yenilenir
    an = new Date('2026-12-08T09:00:00.000Z');
    const yeni = YildizVerdiklerimYanitiSema.parse(
      (await istek(ogt, 'GET', '/haftanin-yildizlari/verdiklerim')).json(),
    );
    expect(yeni).toMatchObject({ hafta_baslangic: '2026-12-07', verilen: 0, kalan: 3 });
    const [birinci] = ogrenciler;
    if (!birinci) throw new Error('ogrenci yok');
    expect((await ver(ogt, birinci)).statusCode).toBe(201);
  });

  it('kapsam: baska grup/atanmamis/bitmis atama 404; ogrenci ve veli 403; yonetici grup disi uye 404', async () => {
    an = T0;
    const grupDisi = await yeniOgrenci(null);
    expect((await ver(ogretmen, grupDisi)).statusCode).toBe(404);
    const digerGrupOgr = await yeniOgrenci(digerGrup);
    expect((await ver(ogretmen, digerGrupOgr)).statusCode).toBe(404); // grup_id grup ama uye degil
    const r = await istek(ogretmen, 'POST', '/haftanin-yildizlari', {
      ogrenci_id: digerGrupOgr.uyelikId,
      grup_id: digerGrup,
    });
    expect(r.statusCode).toBe(404); // ogretmen o gruba atanmamis
    expect((await ver(yonetici, grupDisi)).statusCode).toBe(404);
    expect((await ver(yonetici, await yeniOgrenci())).statusCode).toBe(201);
    expect((await ver(await yeniOgrenci(), await yeniOgrenci())).statusCode).toBe(403);
    expect((await ver(veli, await yeniOgrenci())).statusCode).toBe(403);
    expect((await istek(veli, 'GET', '/haftanin-yildizlari/verdiklerim')).statusCode).toBe(403);

    // bitmis atama
    const eski = yeniKimlik('ogretmen', kurumId);
    await o.sistem`insert into motivasyon.atama_kopyalari (atama_id, kurum_id, grup_id, ogretmen_id, brans_kodu, baslangic_tarihi, bitis_tarihi, son_olay_at, son_olay_id)
                   values (${uuidv7()}, ${kurumId}, ${grup}, ${eski.uyelikId}, 'fizik', '2026-01-01', '2026-11-01', now(), ${uuidv7()})`;
    expect((await ver(eski, await yeniOgrenci())).statusCode).toBe(404);
    // bitmis grup uyeligi
    const ayrilmis = yeniKimlik('ogrenci', kurumId);
    await uyeEkle(grup, ayrilmis, '2026-11-01');
    expect((await ver(ogretmen, ayrilmis)).statusCode).toBe(404);
    // gerekce uzunlugu
    expect(
      (await ver(ogretmen, await yeniOgrenci(), { gerekce: 'x'.repeat(201) })).statusCode,
    ).toBe(400);
  });

  it('modul kapaliysa 403 modul_kapali; yildiz yazilmaz', async () => {
    an = T0;
    const ogr = await yeniOgrenci();
    await o.sistem`insert into motivasyon.modul_ayari_kopyalari (kurum_id, modul_kodu, kapsam, kapsam_id, acik, son_olay_at, son_olay_id)
                   values (${kurumId}, 'oyunlastirma', 'kurum', ${kurumId}, false, now(), ${uuidv7()})`;
    try {
      const r = await ver(ogretmen, ogr);
      expect(r.statusCode).toBe(403);
      expect(hata(r)).toBe('modul_kapali');
      const a = await istek(ogr, 'GET', `/ogrenciler/${ogr.uyelikId}/haftanin-yildizlari`);
      expect(hata(a)).toBe('modul_kapali');
    } finally {
      await o.sistem`delete from motivasyon.modul_ayari_kopyalari where kurum_id = ${kurumId}`;
    }
    const [n] = await o.sistem<{ n: number }[]>`
      select count(*)::int as n from motivasyon.haftanin_yildizlari where ogrenci_id = ${ogr.uyelikId}`;
    expect(n?.n).toBe(0);
    expect((await ver(ogretmen, ogr)).statusCode).toBe(201);
  });

  it('kimlik dogrulamasiz 401; baska kurumun yolu 403', async () => {
    expect(
      (await servis.app.inject({ method: 'GET', url: `${taban}/haftanin-yildizlari/verdiklerim` }))
        .statusCode,
    ).toBe(401);
    const baskaKurum = yeniKimlik('ogretmen');
    const r = await servis.app.inject({
      method: 'GET',
      url: `${taban}/haftanin-yildizlari/verdiklerim`,
      headers: yetki(await kullaniciTokeni(baskaKurum)),
    });
    expect(r.statusCode).toBe(403);
  });
});
