import {
  DENEME_EXCEL_BOYUT_SINIRI,
  DenemeExcelSorguSema,
  DenemeSablonSorguSema,
  DenemeTopluYanitSema,
  denemeHataKodlari,
  errorCodes,
  type DenemeSatirHatasi,
} from '@kopru/contracts';
import { AppError, withTenant, type ServicePlugin, type Tx } from '@kopru/service-kit';
import { and, asc, eq } from 'drizzle-orm';

import { gruplar, uyelikler } from '../../db/schema.js';
import {
  grupEtkinOgrencileri,
  grupKapsami,
  modulAcikMi,
  requirePermission,
  type YetkiBaglami,
} from '../hesap/index.js';
import {
  benzersizlikIhlaliMi,
  denemeDenetimiYaz,
  kuralCoz,
  modulKapaliHatasi,
  ogrenciKosulu,
  sayi,
  topluYaz,
  type TopluSatir,
} from './deneme-deposu.js';
import { XLSX_TURU, excelOku, sablonUret, type SablonUyesi } from './deneme-excel.js';
import { kiraci, kurumParam, olayBaglami, yetkiAl } from './odev-deposu.js';

const XLSX_TURLERI = [XLSX_TURU, 'application/octet-stream'];

/** Grup kapsamda ve `deneme` modulu grupta acik olmali; grubun etkin ogrencileri dondurulur. */
async function grupOgrencileri(tx: Tx, y: YetkiBaglami, grupId: string): Promise<string[]> {
  const [g] = await tx
    .select({ id: gruplar.id })
    .from(gruplar)
    .where(and(eq(gruplar.id, grupId), eq(gruplar.kurum_id, y.kurumId), grupKapsami(tx, y)));
  if (!g) throw new AppError(404, errorCodes.notFound, 'Grup bulunamadı.');
  if (!(await modulAcikMi(tx, y.kurumId, 'deneme', { grupId }))) throw modulKapaliHatasi();
  return grupEtkinOgrencileri(tx, grupId);
}

/** Excel sablonu ve yukleme (`/v1/ogrenme/kurumlar/:kurum_id/denemeler/{sablon.xlsx,excel}`). */
export const denemeExcelYollari: ServicePlugin = (app) => {
  const { db } = app.kimlik;
  const grupYaz = { preHandler: requirePermission('deneme.yaz', { scope: 'grup' }) };

  // Govde ham .xlsx baytlaridir (JSON degil); yalniz bu kapsulde (diger rotalari etkilemez) ve 2 MB sinirli.
  app.addContentTypeParser(
    XLSX_TURLERI,
    { parseAs: 'buffer', bodyLimit: DENEME_EXCEL_BOYUT_SINIRI },
    (_request, body, done) => {
      done(null, body);
    },
  );

  app.get(
    '/kurumlar/:kurum_id/denemeler/sablon.xlsx',
    {
      ...grupYaz,
      schema: {
        tags: ['ogrenme'],
        summary:
          'Excel sablonu (.xlsx): `Veri` sayfasi (ogrenci_id, ogrenci_no, ad + her bolum icin `<bolum_kodu>_dogru/_yanlis`) ve `Bilgi` sayfasi. `grup_id` verilirse grubun etkin ogrencileriyle on dolu gelir. Deneme adi ve tarihi yukleme isteginde verilir.',
        params: kurumParam,
        querystring: DenemeSablonSorguSema,
      },
    },
    async (request, reply) => {
      const y = yetkiAl(request);
      const { kural: kod, grup_id } = request.query;
      const tampon = await withTenant(db, kiraci(y), async (tx) => {
        const kural = await kuralCoz(tx, { kural_kodu: kod });
        const idler = grup_id ? await grupOgrencileri(tx, y, grup_id) : [];
        const uyeler: SablonUyesi[] =
          idler.length === 0
            ? []
            : (
                await tx
                  .select({
                    id: uyelikler.id,
                    ogrenci_no: uyelikler.ogrenci_no,
                    gorunen_ad: uyelikler.gorunen_ad,
                  })
                  .from(uyelikler)
                  .where(and(eq(uyelikler.kurum_id, y.kurumId), ogrenciKosulu(tx, y, uyelikler.id)))
                  .orderBy(asc(uyelikler.gorunen_ad), asc(uyelikler.id))
              ).filter((u) => idler.includes(u.id));
        return sablonUret(kural, uyeler);
      });
      return reply
        .header('content-type', XLSX_TURU)
        .header('content-disposition', `attachment; filename="deneme-${kod}-sablon.xlsx"`)
        .header('cache-control', 'no-store')
        .send(tampon);
    },
  );

  app.post(
    '/kurumlar/:kurum_id/denemeler/excel',
    {
      ...grupYaz,
      bodyLimit: DENEME_EXCEL_BOYUT_SINIRI,
      schema: {
        tags: ['ogrenme'],
        summary:
          'Excel yukleme: govde HAM .xlsx (Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet), en fazla 2 MB ve 500 satir; deneme adi/tarihi/kural sorgu parametresidir. Ogrenci `ogrenci_id`, yoksa `ogrenci_no` ile eslesir (ad yalniz bilgi). Formul hucresi ve sayi olmayan puan satir hatasidir; HEPSI YA DA HIC: hata varsa 422 `toplu_giris_hatali` ve `details.hatalar` (satir = sayfadaki satir numarasi). Puansiz satirlar atlanir. Bozuk/buyuk dosya 422 `excel_gecersiz` / 413.',
        params: kurumParam,
        querystring: DenemeExcelSorguSema,
        response: { 201: DenemeTopluYanitSema },
      },
    },
    async (request, reply) => {
      const y = yetkiAl(request);
      const q = request.query;
      const govde: unknown = request.body;
      if (!Buffer.isBuffer(govde) || govde.length === 0) {
        throw new AppError(422, denemeHataKodlari.excelGecersiz, 'Gövde ham .xlsx dosyası olmalı.');
      }
      // .xlsx bir zip arsividir ("PK" imzasi).
      if (govde[0] !== 0x50 || govde[1] !== 0x4b) {
        throw new AppError(422, denemeHataKodlari.excelGecersiz, 'Dosya geçerli bir .xlsx değil.');
      }
      const baglam = olayBaglami(y, request.correlationId);
      const kural = await withTenant(db, kiraci(y), (tx) => kuralCoz(tx, { kural_kodu: q.kural }));
      const ayrisan = await excelOku(govde, kural);
      try {
        const sonuc = await withTenant(db, kiraci(y), async (tx) => {
          const havuz = q.grup_id ? await grupOgrencileri(tx, y, q.grup_id) : null;
          const adaylar = await tx
            .select({ id: uyelikler.id, ogrenci_no: uyelikler.ogrenci_no })
            .from(uyelikler)
            .where(
              and(
                eq(uyelikler.kurum_id, y.kurumId),
                eq(uyelikler.rol, 'ogrenci'),
                eq(uyelikler.durum, 'aktif'),
                ogrenciKosulu(tx, y, uyelikler.id),
              ),
            );
          const izinli = havuz === null ? adaylar : adaylar.filter((a) => havuz.includes(a.id));
          const kimlikler = new Map(izinli.map((a) => [a.id, a]));
          const numaralar = new Map<string, string[]>();
          for (const a of izinli) {
            if (a.ogrenci_no === null) continue;
            numaralar.set(a.ogrenci_no, [...(numaralar.get(a.ogrenci_no) ?? []), a.id]);
          }
          const hatalar: DenemeSatirHatasi[] = [...ayrisan.hatalar];
          const satirlar: TopluSatir[] = [];
          for (const s of ayrisan.satirlar) {
            const hata = (kod: string, mesaj: string, ogrenciId: string | null = null) =>
              hatalar.push({ satir: s.satir, ogrenci_id: ogrenciId, kod, mesaj });
            let ogrenciId: string | undefined;
            if (s.ogrenci_id !== null) {
              const o = kimlikler.get(s.ogrenci_id);
              if (!o) {
                hata('ogrenci_bulunamadi', 'Öğrenci bulunamadı ya da kapsamınızda değil.');
                continue;
              }
              if (s.ogrenci_no !== null && o.ogrenci_no !== s.ogrenci_no) {
                hata(
                  'ogrenci_eslesmedi',
                  'ogrenci_id ile ogrenci_no aynı öğrenciye ait değil.',
                  o.id,
                );
                continue;
              }
              ogrenciId = o.id;
            } else if (s.ogrenci_no !== null) {
              const adaysa = numaralar.get(s.ogrenci_no) ?? [];
              if (adaysa.length === 0) {
                hata('ogrenci_bulunamadi', 'Bu öğrenci numarası kapsamınızda yok.');
                continue;
              }
              if (adaysa.length > 1) {
                hata(
                  'ogrenci_no_belirsiz',
                  'Bu öğrenci numarası birden fazla öğrenciye ait; ogrenci_id kullanın.',
                );
                continue;
              }
              ogrenciId = adaysa[0];
            }
            if (ogrenciId === undefined) continue;
            satirlar.push({
              satir: s.satir,
              ogrenci_id: ogrenciId,
              bolumler: s.bolumler,
              not_metni: null,
            });
          }
          const yazilan = await topluYaz(
            tx,
            y,
            baglam,
            kural,
            {
              ad: q.ad,
              yayinevi: q.yayinevi ?? null,
              sinav_tarihi: q.sinav_tarihi,
              sure_dk: q.sure_dk ?? null,
            },
            satirlar,
            hatalar,
          );
          await denemeDenetimiYaz(
            tx,
            y,
            request.ip,
            'deneme.excel_yukle',
            'deneme_kurali',
            kural.id,
            null,
            {
              kural_kodu: kural.kod,
              sinav_tarihi: q.sinav_tarihi,
              olusturulan_sayisi: yazilan.length,
              atlanan_satir_sayisi: ayrisan.atlanan,
              kaynak: 'excel',
            },
          );
          return {
            olusturulan_sayisi: yazilan.length,
            atlanan_satir_sayisi: ayrisan.atlanan,
            denemeler: yazilan.map((d) => ({
              deneme_id: d.id,
              ogrenci_id: d.ogrenci_id,
              toplam_net: sayi(d.toplam_net),
            })),
          };
        });
        return await reply.status(201).send(sonuc);
      } catch (err) {
        if (benzersizlikIhlaliMi(err)) {
          throw new AppError(
            409,
            denemeHataKodlari.denemeZatenVar,
            'Bu öğrencilerden biri için aynı deneme zaten girilmiş.',
          );
        }
        throw err;
      }
    },
  );

  return Promise.resolve();
};
