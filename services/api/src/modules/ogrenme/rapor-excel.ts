import {
  RaporSorguSema,
  errorCodes,
  type DersRaporOzetSema,
  type HesapRaporOzetSema,
  type OgrenmeRaporOzetSema,
  type RaporOrani,
} from '@kopru/contracts';
import { AppError, withTenant, type ServicePlugin } from '@kopru/service-kit';
import ExcelJS from 'exceljs';
import { z } from 'zod';

import { dersRaporOzeti } from '../ders/index.js';
import { hesapRaporOzeti, requirePermission, type YetkiBaglami } from '../hesap/index.js';
import { XLSX_TURU } from './deneme-excel.js';
import { ogrenmeRaporOzeti } from './rapor.js';

/**
 * Panel Excel dosyasi: kurum ozeti + grup ve ogretmen kirilim tablolari. Veri uc modulun ayni ozet
 * fonksiyonlarindan gelir (panelle ayni sayilar; hesap iki kez yazilmaz). Finans dosyasinin bicimi:
 * ilk satir kalin baslik, oranlar yuzde bicimli sayi, serbest metin formul enjeksiyonuna karsi kacirilir.
 */

type Hesap = z.infer<typeof HesapRaporOzetSema>;
type Ders = z.infer<typeof DersRaporOzetSema>;
type Ogrenme = z.infer<typeof OgrenmeRaporOzetSema>;

/** Excel formul enjeksiyonu: `=`, `+`, `-`, `@` ile baslayan metni kacirir. */
export const hucreMetni = (s: string | null | undefined): string => {
  const v = s ?? '';
  return /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
};

type Hucre = string | number | null;

/** Oran hucresi: kesir (Excel yuzde bicimi), veri yoksa bos. */
const oranHucresi = (o: RaporOrani | null | undefined): Hucre => o?.oran ?? null;

export interface RaporTablolari {
  ozet: [string, Hucre, string][];
  gruplar: Hucre[][];
  ogretmenler: Hucre[][];
}

const DEGERLENDIRME_BASLIKLARI = [
  'Devam oranı',
  'Anladım oranı',
  'Ödev teslim oranı',
  'Plan tamamlama oranı',
  'Soru sayısı',
  'Ort. ilk cevap (sn)',
  'Medyan ilk cevap (sn)',
];

/** Uc modulun ozetinden Excel tablolarinin satirlarini uretir (test edilebilir, ExcelJS'siz). */
export function raporTablolari(hesap: Hesap, ders: Ders, ogrenme: Ogrenme): RaporTablolari {
  const satir = (
    d: Ders['kurum'] | undefined,
    o: Omit<Ogrenme['kurum'], 'etkin_ogrenci'> | undefined,
  ): Hucre[] => [
    oranHucresi(d?.devam),
    oranHucresi(d?.anladim),
    oranHucresi(o?.odev),
    oranHucresi(o?.plan),
    o?.soru?.soru_sayisi ?? null,
    o?.soru?.ortalama_ilk_cevap_sn ?? null,
    o?.soru?.medyan_ilk_cevap_sn ?? null,
  ];
  const k = ogrenme.kurum;
  const ozet: RaporTablolari['ozet'] = [
    ['Aktif öğrenci', hesap.kurum.aktif_ogrenci, 'Etkin öğrenci üyeliği'],
    ['Etkin öğrenci (son 7 gün)', k.etkin_ogrenci, 'Yoklama, ödev teslimi, plan görevi veya soru'],
    ['Devam oranı', oranHucresi(ders.kurum.devam), 'Geldi + geç / yoklaması alınan katılım'],
    ['Ders sonu anladım oranı', oranHucresi(ders.kurum.anladim), 'Anladım / geri bildirim'],
    ['Ödev teslim oranı', oranHucresi(k.odev), 'Teslim tarihi gelen ödev satırlarında teslim'],
    ['Plan tamamlama oranı', oranHucresi(k.plan), 'Tamamlanan / planlanan görev'],
    ['Soru sayısı', k.soru?.soru_sayisi ?? null, 'Dönemde sorulan'],
    ['Cevaplanan soru', k.soru?.cevaplanan ?? null, 'İlk cevabı verilmiş'],
    ['Ortalama ilk cevap süresi (sn)', k.soru?.ortalama_ilk_cevap_sn ?? null, ''],
    ['Medyan ilk cevap süresi (sn)', k.soru?.medyan_ilk_cevap_sn ?? null, ''],
  ];
  const dersGrup = new Map(ders.gruplar.map((g) => [g.grup_id, g]));
  const ogrGrup = new Map(ogrenme.gruplar.map((g) => [g.grup_id, g]));
  const dersOgr = new Map(ders.ogretmenler.map((o) => [o.ogretmen_id, o]));
  const ogrOgr = new Map(ogrenme.ogretmenler.map((o) => [o.ogretmen_id, o]));
  return {
    ozet,
    gruplar: hesap.gruplar.map((g) => [
      hucreMetni(g.ad),
      g.aktif_ogrenci,
      ogrGrup.get(g.grup_id)?.etkin_ogrenci ?? 0,
      ...satir(dersGrup.get(g.grup_id), ogrGrup.get(g.grup_id)),
    ]),
    ogretmenler: hesap.ogretmenler.map((o) => [
      hucreMetni(o.gorunen_ad),
      o.grup_sayisi,
      o.aktif_ogrenci,
      ...satir(dersOgr.get(o.ogretmen_id), ogrOgr.get(o.ogretmen_id)),
    ]),
  };
}

const YUZDE = '0.0%';

export async function raporExcelUret(hesap: Hesap, ders: Ders, ogrenme: Ogrenme): Promise<Buffer> {
  const tablolar = raporTablolari(hesap, ders, ogrenme);
  const kitap = new ExcelJS.Workbook();
  kitap.creator = 'Köprü';

  const o = kitap.addWorksheet('Kurum özeti');
  o.columns = [
    { header: `Gösterge (${hesap.baslangic} – ${hesap.bitis})`, key: 'ad', width: 38 },
    { header: 'Değer', key: 'deger', width: 14 },
    { header: 'Tanım', key: 'tanim', width: 52 },
  ];
  for (const [ad, deger, tanim] of tablolar.ozet) {
    const s = o.addRow({ ad, deger, tanim });
    // Oran gostergeleri kesirdir (0-1); yuzde bicimi yalniz bu satirlara.
    if (ad.endsWith('oranı')) s.getCell('deger').numFmt = YUZDE;
  }
  o.getRow(1).font = { bold: true };

  const tablo = (
    ad: string,
    ilkSutunlar: string[],
    satirlar: Hucre[][],
    genislikler: number[],
  ): void => {
    const sayfa = kitap.addWorksheet(ad);
    sayfa.columns = [...ilkSutunlar, ...DEGERLENDIRME_BASLIKLARI].map((header, i) => ({
      header,
      key: `s${String(i)}`,
      width: genislikler[i] ?? 16,
    }));
    for (const satir of satirlar) sayfa.addRow(satir);
    sayfa.getRow(1).font = { bold: true };
    for (let i = 0; i < 4; i += 1) {
      sayfa.getColumn(ilkSutunlar.length + 1 + i).numFmt = YUZDE;
    }
  };
  tablo('Gruplar', ['Grup', 'Aktif öğrenci', 'Etkin öğrenci (7 gün)'], tablolar.gruplar, [30]);
  tablo('Öğretmenler', ['Öğretmen', 'Grup sayısı', 'Aktif öğrenci'], tablolar.ogretmenler, [30]);

  return Buffer.from(await kitap.xlsx.writeBuffer());
}

/** `/v1/ogrenme/kurumlar/:kurum_id/rapor/disa-aktar`. */
export const raporExcelYollari: ServicePlugin = (app) => {
  const { db } = app.kimlik;

  app.get(
    '/kurumlar/:kurum_id/rapor/disa-aktar',
    {
      preHandler: requirePermission('rapor.oku', { scope: 'grup' }),
      schema: {
        tags: ['ogrenme'],
        summary:
          'Panel gostergelerini gercek .xlsx olarak indir: kurum ozeti, grup ve ogretmen kirilim sayfalari. Sayilar panelle ayni fonksiyonlardan gelir; kapsam rolun izin kapsamina gore daralir.',
        params: z.object({ kurum_id: z.uuid() }),
        querystring: RaporSorguSema,
      },
    },
    async (request, reply) => {
      const y: YetkiBaglami | null = request.yetki;
      if (!y) throw new AppError(403, errorCodes.izinYok, 'Bu işlem için yetkiniz yok.');
      const { donem } = request.query;
      const tampon = await withTenant(
        db,
        { kurumId: y.kurumId, kullaniciId: y.kullaniciId, roller: [y.rol] },
        async (tx) => {
          const hesap = await hesapRaporOzeti(tx, y, donem);
          const ders = await dersRaporOzeti(tx, y, donem);
          const ogrenme = await ogrenmeRaporOzeti(tx, y, donem);
          return raporExcelUret(hesap, ders, ogrenme);
        },
      );
      return reply
        .header('content-type', XLSX_TURU)
        .header('content-disposition', `attachment; filename="panel-son-${donem}-gun.xlsx"`)
        .header('cache-control', 'no-store')
        .send(tampon);
    },
  );

  return Promise.resolve();
};
