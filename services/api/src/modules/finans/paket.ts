import {
  errorCodes,
  finansHataKodlari,
  finansPaketSatildiV1,
  IptalGirdiSema,
  KurumParamSema,
  KrediPolitikasiKismiSema,
  PaketGuncelleGirdiSema,
  PaketListeSorguSema,
  PaketListeYanitSema,
  PaketOlusturGirdiSema,
  PaketSatisGirdiSema,
  PaketSatisiSema,
  PaketSatisYanitSema,
  PaketSema,
} from '@kopru/contracts';
import { AppError, withTenant, type ServicePlugin, type Tx } from '@kopru/service-kit';
import { and, asc, eq, gt, sql } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { z } from 'zod';

import {
  bakiyeHareketleri,
  bransler,
  krediHareketleri,
  ogrenciFinansProfilleri,
  paketler,
  paketSatislari,
} from '../../db/schema.js';
import { requirePermission } from '../hesap/index.js';
import {
  bakiyeSatiriYaz,
  bakiyeOzeti,
  bakiyeTersiYok,
  havuzKalan,
  krediSatiriYaz,
  krediTersiYok,
} from './defter.js';
import {
  bugunIstanbul,
  denetimYaz,
  gunEkle,
  kilitAl,
  kiraci,
  ogrenciBul,
  olayYaz,
  sonrakiImlec,
  tanimli,
  tekSatir,
  veritabani,
  yetkiAl,
} from './ortak.js';
import { tahsilatKaydet, tahsilatYaniti } from './tahsilat.js';

type PaketSatiri = typeof paketler.$inferSelect;
type SatisSatiri = typeof paketSatislari.$inferSelect;

export const paketYaniti = (p: PaketSatiri): z.infer<typeof PaketSema> => {
  const politika = KrediPolitikasiKismiSema.safeParse(p.kredi_politikasi);
  return {
    id: p.id,
    ad: p.ad,
    kredi_adedi: p.kredi_adedi,
    fiyat_kurus: p.fiyat_kurus,
    kredi_politikasi: politika.success ? politika.data : null,
    gecerlilik_gun: p.gecerlilik_gun,
    grup_turu: p.grup_turu as z.infer<typeof PaketSema>['grup_turu'],
    brans_kodu: p.brans_kodu,
    aktif: p.aktif,
    arsivlendi_at: p.arsivlendi_at?.toISOString() ?? null,
    surum: p.surum,
    created_at: p.created_at.toISOString(),
  };
};

export const satisYaniti = (
  s: SatisSatiri,
  kalanKredi: number,
): z.infer<typeof PaketSatisiSema> => ({
  id: s.id,
  ogrenci_id: s.ogrenci_id,
  paket_id: s.paket_id,
  ad: s.ad,
  toplam_kredi: s.toplam_kredi,
  kalan_kredi: kalanKredi,
  fiyat_kurus: s.fiyat_kurus,
  baslangic_tarihi: s.baslangic_tarihi,
  bitis_tarihi: s.bitis_tarihi,
  durum: s.durum as z.infer<typeof PaketSatisiSema>['durum'],
  satan_id: s.satan_id,
  iptal_at: s.iptal_at?.toISOString() ?? null,
  created_at: s.created_at.toISOString(),
});

async function bransVarOlmali(tx: Tx, kod: string | null | undefined) {
  if (!kod) return;
  const [b] = await tx.select({ kod: bransler.kod }).from(bransler).where(eq(bransler.kod, kod));
  if (!b) throw new AppError(422, errorCodes.validation, 'Geçersiz branş kodu.');
}

const paketBulunamadi = () => new AppError(404, errorCodes.notFound, 'Paket bulunamadı.');
const satisBulunamadi = () => new AppError(404, errorCodes.notFound, 'Paket satışı bulunamadı.');
const paketParam = KurumParamSema.extend({ paket_id: z.uuid() });
const satisParam = KurumParamSema.extend({ satis_id: z.uuid() });

/** `/v1/finans/kurumlar/:kurum_id/paketler|paket-satislari`. */
export const paketYollari: ServicePlugin = (app) => {
  const db = () => veritabani(app);
  const yaz = { preHandler: requirePermission('finans.paket.yaz', { scope: 'kurum' }) };

  // --- Paket sablonlari ----------------------------------------------------------------------

  app.get(
    '/kurumlar/:kurum_id/paketler',
    {
      preHandler: requirePermission('finans.oku', { scope: 'grup' }),
      schema: {
        tags: ['finans'],
        summary: 'Paket sablonlarini listele (varsayilan: yalniz aktif).',
        params: KurumParamSema,
        querystring: PaketListeSorguSema,
        response: { 200: PaketListeYanitSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      const { durum, limit, imlec } = request.query;
      return withTenant(db(), kiraci(y), async (tx) => {
        const kosullar = [eq(paketler.kurum_id, y.kurumId)];
        if (durum !== 'hepsi') kosullar.push(eq(paketler.aktif, durum === 'aktif'));
        if (imlec) kosullar.push(gt(paketler.id, imlec));
        const satirlar = await tx
          .select()
          .from(paketler)
          .where(and(...kosullar))
          .orderBy(asc(paketler.id))
          .limit(limit + 1);
        const sayfa = satirlar.slice(0, limit);
        return {
          paketler: sayfa.map(paketYaniti),
          sonraki_imlec: sonrakiImlec(satirlar, limit, (s) => s.id),
        };
      });
    },
  );

  app.post(
    '/kurumlar/:kurum_id/paketler',
    {
      ...yaz,
      schema: {
        tags: ['finans'],
        summary: 'Paket sablonu olustur (ad, kredi adedi, fiyat kurus, gecerlilik, politika).',
        params: KurumParamSema,
        body: PaketOlusturGirdiSema,
        response: { 201: PaketSema },
      },
    },
    async (request, reply) => {
      const y = yetkiAl(request);
      const b = request.body;
      const satir = await withTenant(db(), kiraci(y), async (tx) => {
        await bransVarOlmali(tx, b.brans_kodu);
        const p = tekSatir(
          await tx
            .insert(paketler)
            .values({
              id: uuidv7(),
              kurum_id: y.kurumId,
              created_by: y.kullaniciId,
              ad: b.ad,
              kredi_adedi: b.kredi_adedi,
              fiyat_kurus: b.fiyat_kurus,
              kredi_politikasi: b.kredi_politikasi ?? null,
              gecerlilik_gun: b.gecerlilik_gun ?? null,
              grup_turu: b.grup_turu ?? null,
              brans_kodu: b.brans_kodu ?? null,
            })
            .returning(),
        );
        await denetimYaz(tx, y, request.ip, {
          eylem: 'finans.paket.olusturuldu',
          hedefTuru: 'paket',
          hedefId: p.id,
          sonra: { kredi_adedi: p.kredi_adedi, fiyat_kurus: p.fiyat_kurus },
        });
        return p;
      });
      return reply.status(201).send(paketYaniti(satir));
    },
  );

  app.patch(
    '/kurumlar/:kurum_id/paketler/:paket_id',
    {
      ...yaz,
      schema: {
        tags: ['finans'],
        summary:
          'Paket sablonunu guncelle. Satilmis paketler satis aninin kopyasini (ad, kredi, fiyat) korur.',
        params: paketParam,
        body: PaketGuncelleGirdiSema,
        response: { 200: PaketSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      const b = request.body;
      const satir = await withTenant(db(), kiraci(y), async (tx) => {
        await bransVarOlmali(tx, b.brans_kodu);
        const [onceki] = await tx
          .select()
          .from(paketler)
          .where(and(eq(paketler.id, request.params.paket_id), eq(paketler.kurum_id, y.kurumId)))
          .for('update');
        if (!onceki) throw paketBulunamadi();
        if (!onceki.aktif) {
          throw new AppError(
            409,
            finansHataKodlari.paketArsivde,
            'Arşivlenmiş paket düzenlenemez.',
          );
        }
        const p = tekSatir(
          await tx.update(paketler).set(tanimli(b)).where(eq(paketler.id, onceki.id)).returning(),
        );
        await denetimYaz(tx, y, request.ip, {
          eylem: 'finans.paket.guncellendi',
          hedefTuru: 'paket',
          hedefId: p.id,
          once: { kredi_adedi: onceki.kredi_adedi, fiyat_kurus: onceki.fiyat_kurus },
          sonra: { kredi_adedi: p.kredi_adedi, fiyat_kurus: p.fiyat_kurus },
        });
        return p;
      });
      return paketYaniti(satir);
    },
  );

  app.post(
    '/kurumlar/:kurum_id/paketler/:paket_id/arsivle',
    {
      ...yaz,
      schema: {
        tags: ['finans'],
        summary:
          'Paket sablonunu arsivle (silinmez; yeni satista gorunmez, eski satislar etkilenmez).',
        params: paketParam,
        response: { 200: PaketSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      const satir = await withTenant(db(), kiraci(y), async (tx) => {
        const [p] = await tx
          .update(paketler)
          .set({ aktif: false, arsivlendi_at: sql`now()` })
          .where(
            and(
              eq(paketler.id, request.params.paket_id),
              eq(paketler.kurum_id, y.kurumId),
              eq(paketler.aktif, true),
            ),
          )
          .returning();
        if (!p) {
          // Yok ya da zaten arsivde: ikincisi idempotent doner.
          const [mevcut] = await tx
            .select()
            .from(paketler)
            .where(and(eq(paketler.id, request.params.paket_id), eq(paketler.kurum_id, y.kurumId)));
          if (!mevcut) throw paketBulunamadi();
          return mevcut;
        }
        await denetimYaz(tx, y, request.ip, {
          eylem: 'finans.paket.arsivlendi',
          hedefTuru: 'paket',
          hedefId: p.id,
        });
        return p;
      });
      return paketYaniti(satir);
    },
  );

  // --- Paket satisi --------------------------------------------------------------------------

  app.post(
    '/kurumlar/:kurum_id/paket-satislari',
    {
      preHandler: requirePermission('finans.tahsilat.yaz', { scope: 'grup' }),
      schema: {
        tags: ['finans'],
        summary:
          'Paket sat. Satis, kredi satin alma, ucret borcu (bakiye) ve varsa tahsilat tek islemde yazilir. `odeme.tur`: tamami | kismi | sonra.',
        params: KurumParamSema,
        body: PaketSatisGirdiSema,
        response: { 201: PaketSatisYanitSema },
      },
    },
    async (request, reply) => {
      const y = yetkiAl(request);
      const b = request.body;
      const sonuc = await withTenant(db(), kiraci(y), async (tx) => {
        await ogrenciBul(tx, y, b.ogrenci_id);
        const [paket] = await tx
          .select()
          .from(paketler)
          .where(and(eq(paketler.id, b.paket_id), eq(paketler.kurum_id, y.kurumId)));
        if (!paket) throw paketBulunamadi();
        if (!paket.aktif) {
          throw new AppError(409, finansHataKodlari.paketArsivde, 'Arşivlenmiş paket satılamaz.');
        }
        const { odeme } = b;
        if (odeme.tur === 'kismi' && odeme.tutar_kurus >= paket.fiyat_kurus) {
          throw new AppError(
            422,
            finansHataKodlari.odemeGecersiz,
            'Kısmi ödeme paket fiyatından az olmalı; tamamı için "tamami" seçin.',
          );
        }
        const baslangic = b.baslangic_tarihi ?? bugunIstanbul();
        const bitis = paket.gecerlilik_gun ? gunEkle(baslangic, paket.gecerlilik_gun) : null;
        const satis = tekSatir(
          await tx
            .insert(paketSatislari)
            .values({
              id: uuidv7(),
              kurum_id: y.kurumId,
              created_by: y.kullaniciId,
              ogrenci_id: b.ogrenci_id,
              paket_id: paket.id,
              ad: paket.ad,
              toplam_kredi: paket.kredi_adedi,
              fiyat_kurus: paket.fiyat_kurus,
              baslangic_tarihi: baslangic,
              bitis_tarihi: bitis,
              satan_id: y.uyelikId,
            })
            .returning(),
        );

        // Profil yoksa model `paket` olur (satis yapilan ogrenci krediyi kullanabilsin); varsa dokunulmaz.
        await tx
          .insert(ogrenciFinansProfilleri)
          .values({
            id: uuidv7(),
            kurum_id: y.kurumId,
            created_by: y.kullaniciId,
            ogrenci_id: b.ogrenci_id,
            model: 'paket',
          })
          .onConflictDoNothing();

        await krediSatiriYaz(tx, {
          kurumId: y.kurumId,
          ogrenciId: b.ogrenci_id,
          paketSatisiId: satis.id,
          tur: 'satin_alma',
          miktar: satis.toplam_kredi,
          aktorKullaniciId: y.kullaniciId,
        });
        if (satis.fiyat_kurus > 0) {
          await bakiyeSatiriYaz(tx, {
            kurumId: y.kurumId,
            ogrenciId: b.ogrenci_id,
            tur: 'paket_satisi',
            tutarKurus: -satis.fiyat_kurus,
            kaynakTuru: 'paket_satisi',
            kaynakId: satis.id,
            aktorKullaniciId: y.kullaniciId,
          });
        }
        let tahsilat = null;
        if (odeme.tur !== 'sonra' && satis.fiyat_kurus > 0) {
          const kayit = await tahsilatKaydet(tx, y, request.correlationId, {
            ogrenci_id: b.ogrenci_id,
            tutar_kurus: odeme.tur === 'tamami' ? satis.fiyat_kurus : odeme.tutar_kurus,
            yontem: odeme.yontem,
            tahsilat_tarihi: bugunIstanbul(),
            ...(odeme.makbuz_no ? { makbuz_no: odeme.makbuz_no } : {}),
            paket_satisi_id: satis.id,
            istek_id: null,
          });
          tahsilat = tahsilatYaniti(kayit.satir);
          await denetimYaz(tx, y, request.ip, {
            eylem: 'finans.tahsilat.alindi',
            hedefTuru: 'tahsilat',
            hedefId: kayit.satir.id,
            sonra: {
              ogrenci_id: kayit.satir.ogrenci_id,
              tutar_kurus: kayit.satir.tutar_kurus,
              yontem: kayit.satir.yontem,
              paket_satisi_id: satis.id,
            },
          });
        }
        await olayYaz(
          tx,
          finansPaketSatildiV1.create({
            kurumId: y.kurumId,
            actor: { tur: 'kullanici', id: y.kullaniciId },
            correlationId: request.correlationId,
            data: {
              paket_satisi_id: satis.id,
              ogrenci_id: satis.ogrenci_id,
              paket_id: satis.paket_id,
              toplam_kredi: satis.toplam_kredi,
              bitis_tarihi: satis.bitis_tarihi,
            },
          }),
        );
        await denetimYaz(tx, y, request.ip, {
          eylem: 'finans.paket.satildi',
          hedefTuru: 'paket_satisi',
          hedefId: satis.id,
          sonra: {
            ogrenci_id: satis.ogrenci_id,
            toplam_kredi: satis.toplam_kredi,
            fiyat_kurus: satis.fiyat_kurus,
            odeme: odeme.tur,
          },
        });
        const ozet = await bakiyeOzeti(tx, y.kurumId, b.ogrenci_id);
        return {
          satis: satisYaniti(satis, await havuzKalan(tx, y.kurumId, satis.id)),
          tahsilat,
          kalan_kredi: ozet.kredi,
          bakiye_kurus: ozet.kurus,
        };
      });
      return reply.status(201).send(sonuc);
    },
  );

  app.post(
    '/kurumlar/:kurum_id/paket-satislari/:satis_id/iptal',
    {
      preHandler: requirePermission('finans.tahsilat.yaz', { scope: 'grup' }),
      schema: {
        tags: ['finans'],
        summary:
          'Paket satisini iptal et (kredi ve ucret borcu ters kayitla geri alinir). Kullanilmis kredi varsa 409 `paket_kullanilmis`. Alinmis tahsilatlar ayri iptal edilir.',
        params: satisParam,
        body: IptalGirdiSema,
        response: { 200: PaketSatisiSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      const { neden } = request.body;
      const satis = await withTenant(db(), kiraci(y), async (tx) => {
        await kilitAl(tx, `finans:paket-satisi:${request.params.satis_id}`);
        const [s] = await tx
          .select()
          .from(paketSatislari)
          .where(
            and(
              eq(paketSatislari.id, request.params.satis_id),
              eq(paketSatislari.kurum_id, y.kurumId),
            ),
          )
          .for('update');
        if (!s) throw satisBulunamadi();
        await ogrenciBul(tx, y, s.ogrenci_id);
        if (s.durum === 'iptal') {
          throw new AppError(
            409,
            finansHataKodlari.paketIptal,
            'Paket satışı zaten iptal edilmiş.',
          );
        }
        if ((await havuzKalan(tx, y.kurumId, s.id)) !== s.toplam_kredi) {
          throw new AppError(
            409,
            finansHataKodlari.paketKullanilmis,
            'Kullanılmış ya da süresi dolmuş paket iptal edilemez.',
          );
        }
        const alis = tekSatir(
          await tx
            .select()
            .from(krediHareketleri)
            .where(
              and(
                eq(krediHareketleri.kurum_id, y.kurumId),
                eq(krediHareketleri.paket_satisi_id, s.id),
                eq(krediHareketleri.tur, 'satin_alma'),
                krediTersiYok,
              ),
            ),
        );
        await krediSatiriYaz(tx, {
          kurumId: y.kurumId,
          ogrenciId: s.ogrenci_id,
          paketSatisiId: s.id,
          tur: 'ters_kayit',
          miktar: -alis.miktar,
          tersCevrilenId: alis.id,
          neden,
          aktorKullaniciId: y.kullaniciId,
        });
        const [borc] = await tx
          .select()
          .from(bakiyeHareketleri)
          .where(
            and(
              eq(bakiyeHareketleri.kurum_id, y.kurumId),
              eq(bakiyeHareketleri.tur, 'paket_satisi'),
              eq(bakiyeHareketleri.kaynak_id, s.id),
              bakiyeTersiYok,
            ),
          );
        if (borc) {
          await bakiyeSatiriYaz(tx, {
            kurumId: y.kurumId,
            ogrenciId: s.ogrenci_id,
            tur: 'ters_kayit',
            tutarKurus: -borc.tutar_kurus,
            kaynakTuru: 'paket_satisi',
            kaynakId: s.id,
            tersCevrilenId: borc.id,
            neden,
            aktorKullaniciId: y.kullaniciId,
          });
        }
        const guncel = tekSatir(
          await tx
            .update(paketSatislari)
            .set({ durum: 'iptal', iptal_at: sql`now()` })
            .where(eq(paketSatislari.id, s.id))
            .returning(),
        );
        await denetimYaz(tx, y, request.ip, {
          eylem: 'finans.paket_satisi.iptal',
          hedefTuru: 'paket_satisi',
          hedefId: s.id,
          once: { durum: s.durum },
          sonra: { durum: 'iptal' },
          neden,
        });
        return satisYaniti(guncel, 0);
      });
      return satis;
    },
  );
  return Promise.resolve();
};
