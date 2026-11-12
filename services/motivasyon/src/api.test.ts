import { MotivasyonOgrenciDurumuSema } from '@kopru/contracts';
import type { Service } from '@kopru/service-kit';
import { uuidv7 } from 'uuidv7';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { T0, dk, olay, ortamKur, type Ortam } from './test/ortam.js';
import {
  dbYok,
  kullaniciTokeni,
  testServisi,
  yeniKimlik,
  yetki,
  type Kimlik,
} from './test/yardimcilar.js';
import { odevTeslimIsle, yoklamaIsle } from './xp-tuketici.js';

describe.skipIf(dbYok())('okuma uclari (kullanici JWT, motivasyon_app)', () => {
  let o: Ortam;
  let servis: Service;
  const kurumId = uuidv7();
  const ogrenci = yeniKimlik('ogrenci', kurumId);
  const baskaOgrenci = yeniKimlik('ogrenci', kurumId);
  const ogretmen = yeniKimlik('ogretmen', kurumId);
  const yonetici = yeniKimlik('yonetici', kurumId);
  const veli = yeniKimlik('veli', kurumId);
  const grup = uuidv7();

  const git = async (k: Kimlik, url: string) =>
    servis.app.inject({ url, headers: yetki(await kullaniciTokeni(k)) });
  const benim = (kurum = kurumId) => `/v1/motivasyon/kurumlar/${kurum}/benim`;
  const ozet = (ogr: string, kurum = kurumId) =>
    `/v1/motivasyon/kurumlar/${kurum}/ogrenciler/${ogr}/ozet`;
  const s = { kurumId, ogrenciId: ogrenci.uyelikId };

  beforeAll(async () => {
    o = ortamKur();
    servis = testServisi({}, { simdi: () => dk(T0, 30) });
    await servis.app.ready();
    await o.isle(kurumId, async (tx) => {
      await yoklamaIsle(
        tx,
        olay.yoklama(s, { at: T0, durum: 'geldi', yoklamaId: uuidv7(), surum: 1 }),
      );
      await odevTeslimIsle(tx, olay.odevTeslim(s, { at: dk(T0, 1) }));
    });
    // ogretmen atama + grup uyesi (baskaOgrenci grupta degil)
    await o.sistem`insert into motivasyon.grup_kopyalari (grup_id, kurum_id, tur, durum, son_olay_at, son_olay_id)
                   values (${grup}, ${kurumId}, 'grup', 'aktif', now(), ${uuidv7()})`;
    await o.sistem`insert into motivasyon.atama_kopyalari (atama_id, kurum_id, grup_id, ogretmen_id, brans_kodu, baslangic_tarihi, son_olay_at, son_olay_id)
                   values (${uuidv7()}, ${kurumId}, ${grup}, ${ogretmen.uyelikId}, 'matematik', '2026-01-01', now(), ${uuidv7()})`;
    await o.sistem`insert into motivasyon.grup_uyesi_kopyalari (grup_id, ogrenci_id, kurum_id, grup_uyesi_id, baslangic_tarihi, son_olay_at, son_olay_id)
                   values (${grup}, ${ogrenci.uyelikId}, ${kurumId}, ${uuidv7()}, '2026-01-01', now(), ${uuidv7()})`;
    await o.sistem`insert into motivasyon.ogrenci_durumlari (id, kurum_id, ogrenci_id)
                   values (${uuidv7()}, ${kurumId}, ${baskaOgrenci.uyelikId})`;
  });
  afterAll(async () => {
    await servis.stop();
    await o.kapat();
  });

  it('kimlik dogrulamasiz 401; baska kurumun yolu 403', async () => {
    expect((await servis.app.inject({ url: benim() })).statusCode).toBe(401);
    const r = await git(ogrenci, benim(uuidv7()));
    expect(r.statusCode).toBe(403);
  });

  it('ogrenci kendi durumunu okur: XP, seviye, tavanlar, beceriler, rozetler, seri, hareketler', async () => {
    const r = await git(ogrenci, benim());
    expect(r.statusCode).toBe(200);
    const d = MotivasyonOgrenciDurumuSema.parse(r.json());
    expect(d).toMatchObject({
      ogrenci_id: ogrenci.uyelikId,
      toplam_xp: 35,
      seviye: 2,
      seviye_baslangic_xp: 20,
      sonraki_seviye_xp: 60,
      sonraki_seviyeye_kalan: 25,
      bu_hafta_xp: 35,
      karakter: null,
      seri: {
        mevcut_seri: 0,
        en_uzun_seri: 0,
        son_aktif_gun: null,
        dondurma_stogu: 0,
        onarim_hakki: 1,
      },
    });
    expect(d.bugun.gun).toBe('2026-11-10');
    expect(d.bugun.xp).toBe(35);
    expect(d.bugun.tavanlar[0]).toEqual({ kod: 'genel', kullanilan: 35, ust_sinir: 300 });
    expect(d.bugun.tavanlar.map((t) => t.kod)).toEqual(['genel', 'kayit', 'odak', 'plan', 'soru']);
    expect(d.beceriler.map((b) => [b.kod, b.puan])).toEqual([
      ['sayisal', 20],
      ['sozel', 15],
      ['fen', 0],
      ['sosyal', 0],
      ['dil', 0],
    ]);
    expect(d.rozetler.kazanilan).toEqual([]);
    // 33 rozet - 4 gizli
    expect(d.rozetler.kilitli).toHaveLength(29);
    const odev = d.rozetler.kilitli.find((r) => r.kod === 'odev_bronz');
    expect(odev).toMatchObject({ ilerleme: 1, esik: 5, kategori: 'emek', kademe: 'bronz' });
    expect(d.son_hareketler.map((h) => h.kural_kodu).sort()).toEqual([
      'odev_teslim',
      'yoklama_geldi',
    ]);
  });

  it('gizli rozet kazanilana kadar gorunmez, kazanilinca kazanilan listesinde gelir', async () => {
    const r1 = MotivasyonOgrenciDurumuSema.parse((await git(ogrenci, benim())).json());
    expect(r1.rozetler.kilitli.some((r) => r.kod === 'yildiz_bronz')).toBe(false);
    expect(r1.rozetler.kilitli.some((r) => r.kod === 'odak_altin')).toBe(false);
    await o.sistem`insert into motivasyon.ogrenci_rozetleri (id, kurum_id, ogrenci_id, rozet_kodu, kaynak_olay_id)
                   values (${uuidv7()}, ${kurumId}, ${ogrenci.uyelikId}, 'yildiz_bronz', ${uuidv7()})`;
    const r2 = MotivasyonOgrenciDurumuSema.parse((await git(ogrenci, benim())).json());
    expect(r2.rozetler.kazanilan.map((r) => r.kod)).toEqual(['yildiz_bronz']);
    expect(r2.rozetler.kilitli.some((r) => r.kod === 'yildiz_bronz')).toBe(false);
  });

  it('karakter ve kusanilan kozmetikler gelir', async () => {
    await o.sistem`insert into motivasyon.ogrenci_karakterleri (id, kurum_id, ogrenci_id, tur_kodu, ad)
                   values (${uuidv7()}, ${kurumId}, ${ogrenci.uyelikId}, 'sedir', 'Mese')`;
    await o.sistem`insert into motivasyon.ogrenci_kozmetikleri (id, kurum_id, ogrenci_id, kozmetik_kodu)
                   values (${uuidv7()}, ${kurumId}, ${ogrenci.uyelikId}, 'sapka_kasket')`;
    await o.sistem`insert into motivasyon.karakter_kusanimlari (ogrenci_id, slot, kurum_id, kozmetik_kodu)
                   values (${ogrenci.uyelikId}, 'sapka', ${kurumId}, 'sapka_kasket')`;
    const d = MotivasyonOgrenciDurumuSema.parse((await git(ogrenci, benim())).json());
    expect(d.karakter).toEqual({
      tur_kodu: 'sedir',
      ad: 'Mese',
      asama: 1,
      sonraki_asama_seviyesi: 5,
      kusanilanlar: [{ slot: 'sapka', kozmetik_kodu: 'sapka_kasket' }],
    });
  });

  it('ogretmen ve veli /benim kullanamaz (yalniz ogrenci)', async () => {
    expect((await git(ogretmen, benim())).statusCode).toBe(403);
    expect((await git(veli, benim())).statusCode).toBe(403);
  });

  it('ozet: ogrenci yalniz kendini, baskasini goremez', async () => {
    expect((await git(ogrenci, ozet(ogrenci.uyelikId))).statusCode).toBe(200);
    const r = await git(ogrenci, ozet(baskaOgrenci.uyelikId));
    expect(r.statusCode).toBe(403);
    expect(r.json<{ error: { code: string } }>().error.code).toBe('izin_yok');
  });

  it('ozet: ogretmen yalniz atandigi gruptaki ogrenciyi gorur', async () => {
    const var_ = await git(ogretmen, ozet(ogrenci.uyelikId));
    expect(var_.statusCode).toBe(200);
    expect(var_.json<{ toplam_xp: number }>().toplam_xp).toBe(35);
    const yok = await git(ogretmen, ozet(baskaOgrenci.uyelikId));
    expect(yok.statusCode).toBe(404);
  });

  it('ozet: yonetici kurumdaki ogrenciyi gorur, bilinmeyen ogrenci 404, veli 403', async () => {
    expect((await git(yonetici, ozet(baskaOgrenci.uyelikId))).statusCode).toBe(200);
    expect((await git(yonetici, ozet(uuidv7()))).statusCode).toBe(404);
    expect((await git(veli, ozet(ogrenci.uyelikId))).statusCode).toBe(403);
  });

  it('modul kapaliysa 403 modul_kapali (benim ve ozet)', async () => {
    await o.sistem`insert into motivasyon.modul_ayari_kopyalari (kurum_id, modul_kodu, kapsam, kapsam_id, acik, son_olay_at, son_olay_id)
                   values (${kurumId}, 'oyunlastirma', 'kurum', ${kurumId}, false, now(), ${uuidv7()})`;
    try {
      for (const [k, url] of [
        [ogrenci, benim()],
        [yonetici, ozet(ogrenci.uyelikId)],
        [ogretmen, ozet(ogrenci.uyelikId)],
      ] as const) {
        const r = await git(k, url);
        expect(r.statusCode).toBe(403);
        expect(r.json<{ error: { code: string } }>().error.code).toBe('modul_kapali');
      }
    } finally {
      await o.sistem`delete from motivasyon.modul_ayari_kopyalari where kurum_id = ${kurumId}`;
    }
    expect((await git(ogrenci, benim())).statusCode).toBe(200);
  });

  it('XP yazmamis ogrenci icin bos durum doner (sifir XP, seviye 1)', async () => {
    const yeni = yeniKimlik('ogrenci', kurumId);
    const d = MotivasyonOgrenciDurumuSema.parse((await git(yeni, benim())).json());
    expect(d).toMatchObject({
      toplam_xp: 0,
      seviye: 1,
      seviye_baslangic_xp: 0,
      sonraki_seviye_xp: 20,
      sonraki_seviyeye_kalan: 20,
      bu_hafta_xp: 0,
    });
  });
});
