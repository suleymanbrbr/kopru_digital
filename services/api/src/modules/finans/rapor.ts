import { AySorguSema, AylikOzetSema, errorCodes, KurumParamSema } from '@kopru/contracts';
import { AppError, withTenant, type ServicePlugin, type Tx } from '@kopru/service-kit';
import { and, asc, eq, inArray, sql, type SQL } from 'drizzle-orm';
import ExcelJS from 'exceljs';
import type { z } from 'zod';

import {
  krediBakiyeleri,
  ogrenciBakiyeleri,
  ogrenciFinansProfilleri,
  tahsilatlar,
  uyelikler,
} from '../../db/schema.js';
import { requirePermission, type YetkiBaglami } from '../hesap/index.js';
import { ayAraligi, denetimYaz, kiraci, ogrenciKapsami, yetkiAl } from './ortak.js';

const XLSX_TURU = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const YONTEM_ADLARI: Record<string, string> = {
  nakit: 'Nakit',
  havale: 'Havale/EFT',
  kart: 'Kart',
  diger: 'Diğer',
};
const MODEL_ADLARI: Record<string, string> = { paket: 'Paket', ders_basi: 'Ders başı', yok: 'Yok' };

/** Kuruş -> TL yalnızca dışa aktarımda yapılır: tam sayı bölme, kayan nokta toplamı yok. */
export const kurusTl = (kurus: number): number => Number((kurus / 100).toFixed(2));

/** Excel formül enjeksiyonu: `=`, `+`, `-`, `@` ile başlayan metni kaçırır. */
export const hucreMetni = (s: string | null | undefined): string => {
  const v = s ?? '';
  return /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
};

/** Kapsamdaki tahsilatlar icin kosul listesi (ay araligi + ogrenci kapsami). */
function tahsilatKosullari(tx: Tx, y: YetkiBaglami, ay: string): (SQL | undefined)[] {
  const { baslangic, sonraki } = ayAraligi(ay);
  const kapsam = ogrenciKapsami(tx, y);
  return [
    eq(tahsilatlar.kurum_id, y.kurumId),
    sql`${tahsilatlar.tahsilat_tarihi} >= ${baslangic}::date and ${tahsilatlar.tahsilat_tarihi} < ${sonraki}::date`,
    kapsam
      ? inArray(
          tahsilatlar.ogrenci_id,
          tx.select({ id: uyelikler.id }).from(uyelikler).where(kapsam),
        )
      : undefined,
  ];
}

/** Aylik gelir ozeti: gecerli (iptal edilmemis) tahsilat toplami ve yonteme gore kirilim. */
export async function aylikOzet(
  tx: Tx,
  y: YetkiBaglami,
  ay: string,
): Promise<z.infer<typeof AylikOzetSema>> {
  const satirlar = await tx
    .select({
      yontem: tahsilatlar.yontem,
      toplam: sql<number>`coalesce(sum(${tahsilatlar.tutar_kurus}), 0)`.mapWith(Number),
      adet: sql<number>`count(*)`.mapWith(Number),
    })
    .from(tahsilatlar)
    .where(and(...tahsilatKosullari(tx, y, ay), eq(tahsilatlar.durum, 'gecerli')))
    .groupBy(tahsilatlar.yontem)
    .orderBy(asc(tahsilatlar.yontem));
  return {
    ay,
    toplam_kurus: satirlar.reduce((t, s) => t + s.toplam, 0),
    tahsilat_sayisi: satirlar.reduce((t, s) => t + s.adet, 0),
    yonteme_gore: satirlar.map((s) => ({
      yontem: s.yontem as 'nakit' | 'havale' | 'kart' | 'diger',
      toplam_kurus: s.toplam,
      adet: s.adet,
    })),
    kapsam: y.kapsam,
  };
}

/** Aylik tahsilatlar ve guncel ogrenci bakiyeleri: iki sayfali gercek .xlsx. */
export async function excelUret(tx: Tx, y: YetkiBaglami, ay: string): Promise<Buffer> {
  const tahsilatSatirlari = await tx
    .select({
      tarih: tahsilatlar.tahsilat_tarihi,
      ogrenci: uyelikler.gorunen_ad,
      tutar: tahsilatlar.tutar_kurus,
      yontem: tahsilatlar.yontem,
      makbuz: tahsilatlar.makbuz_no,
      durum: tahsilatlar.durum,
      aciklama: tahsilatlar.aciklama,
    })
    .from(tahsilatlar)
    .leftJoin(
      uyelikler,
      and(eq(uyelikler.kurum_id, tahsilatlar.kurum_id), eq(uyelikler.id, tahsilatlar.ogrenci_id)),
    )
    .where(and(...tahsilatKosullari(tx, y, ay)))
    .orderBy(asc(tahsilatlar.tahsilat_tarihi), asc(tahsilatlar.id));

  const ogrenciKosullari: (SQL | undefined)[] = [
    eq(uyelikler.kurum_id, y.kurumId),
    eq(uyelikler.rol, 'ogrenci'),
    eq(uyelikler.durum, 'aktif'),
    ogrenciKapsami(tx, y),
  ];
  const ogrenciSatirlari = await tx
    .select({
      ad: uyelikler.gorunen_ad,
      model: sql<string>`coalesce(${ogrenciFinansProfilleri.model}, 'yok')`,
      kalan: sql<number>`coalesce(${krediBakiyeleri.bakiye}, 0)`.mapWith(Number),
      bakiye: sql<number>`coalesce(${ogrenciBakiyeleri.bakiye_kurus}, 0)`.mapWith(Number),
      odeyenAd: ogrenciFinansProfilleri.odeyen_ad,
      odeyenTelefon: ogrenciFinansProfilleri.odeyen_telefon,
    })
    .from(uyelikler)
    .leftJoin(
      ogrenciFinansProfilleri,
      and(
        eq(ogrenciFinansProfilleri.kurum_id, uyelikler.kurum_id),
        eq(ogrenciFinansProfilleri.ogrenci_id, uyelikler.id),
      ),
    )
    .leftJoin(
      krediBakiyeleri,
      and(
        eq(krediBakiyeleri.kurum_id, uyelikler.kurum_id),
        eq(krediBakiyeleri.ogrenci_id, uyelikler.id),
      ),
    )
    .leftJoin(
      ogrenciBakiyeleri,
      and(
        eq(ogrenciBakiyeleri.kurum_id, uyelikler.kurum_id),
        eq(ogrenciBakiyeleri.ogrenci_id, uyelikler.id),
      ),
    )
    .where(and(...ogrenciKosullari))
    .orderBy(sql`${uyelikler.gorunen_ad} collate "tr-TR-x-icu"`, asc(uyelikler.id));

  const kitap = new ExcelJS.Workbook();
  kitap.creator = 'Köprü';
  const TL = '#,##0.00 "₺"';

  const t = kitap.addWorksheet(`Tahsilatlar ${ay}`);
  t.columns = [
    { header: 'Tarih', key: 'tarih', width: 14 },
    { header: 'Öğrenci', key: 'ogrenci', width: 30 },
    { header: 'Tutar (₺)', key: 'tutar', width: 16, style: { numFmt: TL } },
    { header: 'Yöntem', key: 'yontem', width: 14 },
    { header: 'Makbuz No', key: 'makbuz', width: 16 },
    { header: 'Durum', key: 'durum', width: 12 },
    { header: 'Açıklama', key: 'aciklama', width: 40 },
  ];
  for (const s of tahsilatSatirlari) {
    t.addRow({
      tarih: s.tarih,
      ogrenci: hucreMetni(s.ogrenci),
      tutar: kurusTl(s.tutar),
      yontem: YONTEM_ADLARI[s.yontem] ?? s.yontem,
      makbuz: hucreMetni(s.makbuz),
      durum: s.durum === 'iptal' ? 'İptal' : 'Geçerli',
      aciklama: hucreMetni(s.aciklama),
    });
  }
  t.getRow(1).font = { bold: true };

  const b = kitap.addWorksheet('Öğrenci bakiyeleri');
  b.columns = [
    { header: 'Öğrenci', key: 'ad', width: 30 },
    { header: 'Model', key: 'model', width: 12 },
    { header: 'Kalan ders', key: 'kalan', width: 12 },
    { header: 'Bakiye (₺) — eksi: borçlu', key: 'bakiye', width: 24, style: { numFmt: TL } },
    { header: 'Ödeyen adı', key: 'odeyenAd', width: 26 },
    { header: 'Ödeyen telefonu', key: 'odeyenTelefon', width: 18 },
  ];
  for (const s of ogrenciSatirlari) {
    b.addRow({
      ad: hucreMetni(s.ad),
      model: MODEL_ADLARI[s.model] ?? s.model,
      kalan: s.kalan,
      bakiye: kurusTl(s.bakiye),
      odeyenAd: hucreMetni(s.odeyenAd),
      odeyenTelefon: hucreMetni(s.odeyenTelefon),
    });
  }
  b.getRow(1).font = { bold: true };

  return Buffer.from(await kitap.xlsx.writeBuffer());
}

/** `/v1/finans/kurumlar/:kurum_id/ozet/aylik` ve `/disa-aktar`. */
export const raporYollari: ServicePlugin = (app) => {
  const db = () => {
    if (!app.db) throw new AppError(503, errorCodes.unavailable, 'Veritabanı kullanılamıyor.');
    return app.db;
  };
  const oku = { preHandler: requirePermission('finans.oku', { scope: 'grup' }) };

  app.get(
    '/kurumlar/:kurum_id/ozet/aylik',
    {
      ...oku,
      schema: {
        tags: ['finans'],
        summary:
          'Aylik gelir ozeti: gecerli tahsilat toplami ve yonteme gore kirilim (iptaller haric). Ay Europe/Istanbul takvim ayidir; kapsam rolun izin kapsamina gore daralir.',
        params: KurumParamSema,
        querystring: AySorguSema,
        response: { 200: AylikOzetSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      return withTenant(db(), kiraci(y), (tx) => aylikOzet(tx, y, request.query.ay));
    },
  );

  app.get(
    '/kurumlar/:kurum_id/disa-aktar',
    {
      ...oku,
      schema: {
        tags: ['finans'],
        summary:
          "Aylik tahsilatlari ve ogrenci bakiyelerini gercek .xlsx olarak indir. Kurus TL'ye yalniz burada cevrilir. Yalniz `finans.oku` ve kurum/grup kapsami; indirme denetim kaydina duser.",
        params: KurumParamSema,
        querystring: AySorguSema,
      },
    },
    async (request, reply) => {
      const y = yetkiAl(request);
      const { ay } = request.query;
      const tampon = await withTenant(db(), kiraci(y), async (tx) => {
        const buf = await excelUret(tx, y, ay);
        await denetimYaz(tx, y, request.ip, {
          eylem: 'finans.disa_aktar',
          hedefTuru: 'kurum',
          hedefId: y.kurumId,
          sonra: { ay, kapsam: y.kapsam },
        });
        return buf;
      });
      return reply
        .header('content-type', XLSX_TURU)
        .header('content-disposition', `attachment; filename="finans-${ay}.xlsx"`)
        .header('cache-control', 'no-store')
        .send(tampon);
    },
  );
  return Promise.resolve();
};
