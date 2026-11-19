import {
  KATALOG_KODLARI,
  PlatformAdlandirGirdiSema,
  PlatformAgacYanitSema,
  PlatformBirlestirGirdiSema,
  PlatformFarkYanitSema,
  PlatformKaldirGirdiSema,
  PlatformKatalogListeYanitSema,
  PlatformKatalogParamSema,
  PlatformKonuEkleGirdiSema,
  PlatformKonuParamSema,
  PlatformIslemYanitSema,
  PlatformSurumParamSema,
  PlatformSurumYanitSema,
  PlatformTasiGirdiSema,
  PlatformTaslakAcGirdiSema,
  PlatformYayinlaGirdiSema,
  PlatformYayinYanitSema,
  type DegisiklikTuru,
  type KatalogKodu,
  type KonuSeviye,
} from '@kopru/contracts';
import type { ServicePlugin, Tx } from '@kopru/service-kit';
import { asc, eq, sql } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';

import { mufredatDegisiklikleri, mufredatSurumleri } from '../../db/schema.js';
import { platformMufredatIslemi } from '../../sistem/mufredat-editor.js';
import { platformIslem, platformKapisiKur } from '../hesap/index.js';
import type { KonuSatiri } from './mufredat-deposu.js';
import {
  degisiklikleri,
  farkOzeti,
  konuAdlandir,
  konuBirlestir,
  konuEkle,
  konuKaldir,
  konuTasi,
  surumBul,
  surumKonulari,
  taslakAc,
  taslakYayinla,
  type DegisiklikSatiri,
  type IslemSonucu,
  type SurumSatiri,
} from './mufredat-editor.js';

const ONEK = '/platform/mufredat/kataloglar/:katalog_kodu';

function surumYaniti(s: SurumSatiri, degisiklikSayisi: number) {
  return {
    surum_no: s.surum_no,
    ad: s.ad,
    aciklama: s.aciklama,
    yayinlandi_at: s.yayinlandi_at?.toISOString() ?? null,
    taslak: s.yayinlandi_at === null,
    degisiklik_sayisi: degisiklikSayisi,
  };
}

function konuYaniti(k: KonuSatiri, surumNo: number) {
  return {
    id: k.id,
    ust_id: k.ust_id,
    brans_kodu: k.brans_kodu,
    seviye: k.seviye as KonuSeviye,
    ad: k.ad,
    kazanim_kodu: k.kazanim_kodu,
    sira: k.sira,
    sinif_seviyesi: k.sinif_seviyesi,
    gecerli_surum_baslangic: k.gecerli_surum_baslangic ?? surumNo,
    gecerli_surum_bitis: k.gecerli_surum_bitis,
    yerine_gecen_id: k.yerine_gecen_id,
    yeni: k.gecerli_surum_baslangic === surumNo,
  };
}

function degisiklikYaniti(d: DegisiklikSatiri) {
  return {
    id: d.id,
    created_at: d.created_at.toISOString(),
    tur: d.tur as DegisiklikTuru,
    konu_id: d.konu_id,
    hedef_konu_id: d.hedef_konu_id,
    ad_once: d.ad_once,
    ad_sonra: d.ad_sonra,
    ayrinti: d.ayrinti as Record<string, unknown>,
    not: d.not_metni,
  };
}

const islemYaniti = (s: IslemSonucu) => ({
  degisiklik: degisiklikYaniti(s.degisiklik),
  konu: konuYaniti(s.konu, s.degisiklik.surum_no),
});

/**
 * Platform mufredat editoru (`/platform/mufredat/...`, ADR 0004 "Platform yoneticisi"): taslak surum,
 * konu ekle/adlandir/tasi/birlestir/kaldir, surum farki, yayin. Yazmalar `api_sistem` islemidir ve
 * denetim kaydi uretir (`sistem/mufredat-editor.ts`). Okumalar RLS'li uygulama rolu ile yapilir (global
 * icerik). Yetki: hesap modulunun P1 kapisi (`platformKapisiKur`: IP, 2FA, rota rolu `yonetici`).
 */
export const mufredatPlatformYollari: ServicePlugin = (app) => {
  const { db, sistemDb } = app.kimlik;
  // P1 kapisi (IP izin listesi, `plat` claim'i + DB rolu, oturumda 2FA, rota rolu, denetim): bu plugin'in
  // tum rotalarina `onRequest`te uygulanir; govde dogrulamasindan once calistigindan yetkisize 400 yerine 403 doner.
  platformKapisiKur(app, app.kimlik);
  const aktor = (request: FastifyRequest): string => {
    const p = request.platform;
    if (!p) throw new Error('platform kapısı çalışmadan müfredat işlemi çağrıldı');
    return p.kullaniciId;
  };
  /** Yazma: `api_sistem` islemi + islemle ayni transaction'da denetim satiri (`platform.mufredat.<eylem>`). */
  const islem = <T>(
    request: FastifyRequest,
    ek: {
      eylem: string;
      neden: string;
      hedefId?: string;
      ayrinti?: Record<string, unknown>;
    },
    fn: (tx: Tx) => Promise<T>,
  ): Promise<T> =>
    platformIslem(request, (baglam) => platformMufredatIslemi(sistemDb, baglam, fn), {
      eylem: `platform.mufredat.${ek.eylem}`,
      neden: ek.neden,
      hedefTuru: 'mufredat',
      ...(ek.hedefId ? { hedefId: ek.hedefId } : {}),
      ...(ek.ayrinti ? { ayrinti: ek.ayrinti } : {}),
    });
  const oku = <T>(fn: (tx: Tx) => Promise<T>) => db.orm.transaction(fn);

  async function degisiklikSayilari(tx: Tx, katalog: KatalogKodu): Promise<Map<number, number>> {
    const satirlar = await tx
      .select({
        surum_no: mufredatDegisiklikleri.surum_no,
        n: sql<number>`count(*)::int`,
      })
      .from(mufredatDegisiklikleri)
      .where(eq(mufredatDegisiklikleri.katalog_kodu, katalog))
      .groupBy(mufredatDegisiklikleri.surum_no);
    return new Map(satirlar.map((s) => [s.surum_no, s.n]));
  }

  app.get(
    '/platform/mufredat/kataloglar',
    {
      config: {
        platformEylem: 'platform.mufredat.katalog_listele',
        platformRolu: 'yonetici' as const,
      },
      schema: {
        tags: ['platform'],
        summary: 'Katalog ve sürüm listesi (taslaklar dahil) ile değişiklik sayıları.',
        response: { 200: PlatformKatalogListeYanitSema },
      },
    },
    async () =>
      oku(async (tx) => {
        const surumler = await tx
          .select()
          .from(mufredatSurumleri)
          .orderBy(asc(mufredatSurumleri.katalog_kodu), asc(mufredatSurumleri.surum_no));
        const kataloglar = [];
        for (const kod of KATALOG_KODLARI) {
          const liste = surumler.filter((s) => s.katalog_kodu === kod);
          const sayilar = await degisiklikSayilari(tx, kod);
          const yayinli = liste.filter((s) => s.yayinlandi_at !== null);
          kataloglar.push({
            katalog_kodu: kod,
            surumler: liste.map((s) => surumYaniti(s, sayilar.get(s.surum_no) ?? 0)),
            en_yuksek_yayinlanmis: yayinli.length
              ? Math.max(...yayinli.map((s) => s.surum_no))
              : null,
            taslak_surum_no: liste.find((s) => s.yayinlandi_at === null)?.surum_no ?? null,
          });
        }
        return { kataloglar };
      }),
  );

  app.post(
    `${ONEK}/taslak`,
    {
      config: { platformEylem: 'platform.mufredat.taslak_ac', platformRolu: 'yonetici' as const },
      schema: {
        tags: ['platform'],
        summary:
          'Yeni taslak sürüm aç. Önceki yayınlı sürümün aktif konuları taslakta da geçerlidir (kimlikler sabit); katalogda tek taslak olur.',
        params: PlatformKatalogParamSema,
        body: PlatformTaslakAcGirdiSema,
        response: { 201: PlatformSurumYanitSema },
      },
    },
    async (request, reply) => {
      const { katalog_kodu: katalog } = request.params;
      const g = request.body;
      const surum = await islem(
        request,
        {
          eylem: 'taslak_ac',
          neden: `Taslak sürüm açıldı: ${katalog}`,
          ayrinti: { katalog_kodu: katalog },
        },
        (tx) => taslakAc(tx, katalog, g),
      );
      return reply.code(201).send({ katalog_kodu: katalog, surum: surumYaniti(surum, 0) });
    },
  );

  app.get(
    `${ONEK}/surumler/:surum_no/agac`,
    {
      config: { platformEylem: 'platform.mufredat.agac', platformRolu: 'yonetici' as const },
      schema: {
        tags: ['platform'],
        summary: 'Sürümde geçerli konu ağacı (düz liste; taslakta yeni eklenenler `yeni: true`).',
        params: PlatformSurumParamSema,
        response: { 200: PlatformAgacYanitSema },
      },
    },
    async (request) => {
      const { katalog_kodu: katalog, surum_no: no } = request.params;
      return oku(async (tx) => {
        const surum = await surumBul(tx, katalog, no);
        const sayilar = await degisiklikSayilari(tx, katalog);
        const konular = await surumKonulari(tx, katalog, no);
        return {
          katalog_kodu: katalog,
          surum: surumYaniti(surum, sayilar.get(no) ?? 0),
          konular: konular.map((k) => konuYaniti(k, no)),
        };
      });
    },
  );

  app.get(
    `${ONEK}/surumler/:surum_no/fark`,
    {
      config: { platformEylem: 'platform.mufredat.fark', platformRolu: 'yonetici' as const },
      schema: {
        tags: ['platform'],
        summary:
          'Sürüm farkı: eklenen, yeniden adlandırılan, taşınan, birleşen, kaldırılan konular ve değişiklik notları.',
        params: PlatformSurumParamSema,
        response: { 200: PlatformFarkYanitSema },
      },
    },
    async (request) => {
      const { katalog_kodu: katalog, surum_no: no } = request.params;
      return oku(async (tx) => {
        const surum = await surumBul(tx, katalog, no);
        const liste = await degisiklikleri(tx, katalog, no);
        const grup = (tur: DegisiklikTuru) =>
          liste.filter((d) => d.tur === tur).map(degisiklikYaniti);
        return {
          katalog_kodu: katalog,
          surum: surumYaniti(surum, liste.length),
          ozet: farkOzeti(liste),
          eklenen: grup('ekle'),
          yeniden_adlandirilan: grup('adlandir'),
          tasinan: grup('tasi'),
          birlesen: grup('birlestir'),
          kaldirilan: grup('kaldir'),
        };
      });
    },
  );

  // --- Taslak degisiklik islemleri ---------------------------------------------------------------

  app.post(
    `${ONEK}/taslak/konular`,
    {
      config: { platformEylem: 'platform.mufredat.konu_ekle', platformRolu: 'yonetici' as const },
      schema: {
        tags: ['platform'],
        summary: 'Taslağa konu ekle.',
        params: PlatformKatalogParamSema,
        body: PlatformKonuEkleGirdiSema,
        response: { 201: PlatformIslemYanitSema },
      },
    },
    async (request, reply) => {
      const kullanici = aktor(request);
      const { katalog_kodu: katalog } = request.params;
      const g = request.body;
      const sonuc = await islem(
        request,
        {
          eylem: 'konu_ekle',
          neden: g.not,
          ayrinti: { katalog_kodu: katalog, brans_kodu: g.brans_kodu, seviye: g.seviye },
        },
        (tx) => konuEkle(tx, katalog, kullanici, g),
      );
      return reply.code(201).send(islemYaniti(sonuc));
    },
  );

  app.post(
    `${ONEK}/taslak/konular/:id/adlandir`,
    {
      config: {
        platformEylem: 'platform.mufredat.konu_adlandir',
        platformRolu: 'yonetici' as const,
      },
      schema: {
        tags: ['platform'],
        summary:
          'Konuyu yeniden adlandır. Yayınlı sürümlerin görüntüsü bozulmasın diye yeni kopya açılır, eskisinin `yerine_gecen_id`si bağlanır.',
        params: PlatformKonuParamSema,
        body: PlatformAdlandirGirdiSema,
        response: { 200: PlatformIslemYanitSema },
      },
    },
    async (request) => {
      const kullanici = aktor(request);
      const { katalog_kodu: katalog, id } = request.params;
      const g = request.body;
      const sonuc = await islem(
        request,
        {
          eylem: 'konu_adlandir',
          neden: g.not,
          hedefId: id,
          ayrinti: { katalog_kodu: katalog, konu_id: id },
        },
        (tx) => konuAdlandir(tx, katalog, kullanici, id, g),
      );
      return islemYaniti(sonuc);
    },
  );

  app.post(
    `${ONEK}/taslak/konular/:id/tasi`,
    {
      config: { platformEylem: 'platform.mufredat.konu_tasi', platformRolu: 'yonetici' as const },
      schema: {
        tags: ['platform'],
        summary:
          'Konuyu taşı (üst konu ve/veya sıra). Üst değişirse alt ağacıyla birlikte kopyalanır; yalnız sıra değişimi yerinde yapılır.',
        params: PlatformKonuParamSema,
        body: PlatformTasiGirdiSema,
        response: { 200: PlatformIslemYanitSema },
      },
    },
    async (request) => {
      const kullanici = aktor(request);
      const { katalog_kodu: katalog, id } = request.params;
      const g = request.body;
      const sonuc = await islem(
        request,
        {
          eylem: 'konu_tasi',
          neden: g.not,
          hedefId: id,
          ayrinti: { katalog_kodu: katalog, konu_id: id, yeni_ust_id: g.ust_id },
        },
        (tx) => konuTasi(tx, katalog, kullanici, id, g),
      );
      return islemYaniti(sonuc);
    },
  );

  app.post(
    `${ONEK}/taslak/konular/:id/birlestir`,
    {
      config: {
        platformEylem: 'platform.mufredat.konu_birlestir',
        platformRolu: 'yonetici' as const,
      },
      schema: {
        tags: ['platform'],
        summary:
          'Konuyu (kaynak) hedef konuyla birleştir: alt konular hedefe bağlanır, kaynak kullanımdan kalkar ve `yerine_gecen_id` = hedef olur. Kurum verisi (ödev, plan, deneme, kurum alt konuları) kopmaz.',
        params: PlatformKonuParamSema,
        body: PlatformBirlestirGirdiSema,
        response: { 200: PlatformIslemYanitSema },
      },
    },
    async (request) => {
      const kullanici = aktor(request);
      const { katalog_kodu: katalog, id } = request.params;
      const g = request.body;
      const sonuc = await islem(
        request,
        {
          eylem: 'konu_birlestir',
          neden: g.not,
          hedefId: id,
          ayrinti: { katalog_kodu: katalog, kaynak_id: id, hedef_id: g.hedef_id },
        },
        (tx) => konuBirlestir(tx, katalog, kullanici, id, g),
      );
      return islemYaniti(sonuc);
    },
  );

  app.post(
    `${ONEK}/taslak/konular/:id/kaldir`,
    {
      config: { platformEylem: 'platform.mufredat.konu_kaldir', platformRolu: 'yonetici' as const },
      schema: {
        tags: ['platform'],
        summary:
          'Konuyu ve alt ağacını kullanımdan kaldır (silme yok; geçerlilik bitişi taslak sürümde başlar).',
        params: PlatformKonuParamSema,
        body: PlatformKaldirGirdiSema,
        response: { 200: PlatformIslemYanitSema },
      },
    },
    async (request) => {
      const kullanici = aktor(request);
      const { katalog_kodu: katalog, id } = request.params;
      const g = request.body;
      const sonuc = await islem(
        request,
        {
          eylem: 'konu_kaldir',
          neden: g.not,
          hedefId: id,
          ayrinti: { katalog_kodu: katalog, konu_id: id },
        },
        (tx) => konuKaldir(tx, katalog, kullanici, id, g),
      );
      return islemYaniti(sonuc);
    },
  );

  app.post(
    `${ONEK}/taslak/yayinla`,
    {
      config: { platformEylem: 'platform.mufredat.yayinla', platformRolu: 'yonetici' as const },
      schema: {
        tags: ['platform'],
        summary:
          'Taslağı yayınla: sürüm değişmez olur, kurum alt konuları yeni üst konulara bağlanır, her aktif kuruma `ogrenme.mufredat.yayinlandi.v1` olayı (outbox) yazılır.',
        params: PlatformKatalogParamSema,
        body: PlatformYayinlaGirdiSema,
        response: { 200: PlatformYayinYanitSema },
      },
    },
    async (request) => {
      const kullanici = aktor(request);
      const { katalog_kodu: katalog } = request.params;
      const sonuc = await islem(
        request,
        {
          eylem: 'yayinla',
          neden: request.body.not ?? `Müfredat yayınlandı: ${katalog}`,
          ayrinti: { katalog_kodu: katalog },
        },
        (tx) => taslakYayinla(tx, katalog, kullanici),
      );
      return {
        katalog_kodu: katalog,
        surum: surumYaniti(
          sonuc.surum,
          Object.values(sonuc.ozet).reduce((a, b) => a + b, 0),
        ),
        ozet: sonuc.ozet,
        bildirilen_kurum_sayisi: sonuc.bildirilenKurum,
        yeniden_baglanan_kurum_konusu: sonuc.yenidenBaglanan,
      };
    },
  );

  return Promise.resolve();
};
