import {
  PlatformDenetimListeYanitSema,
  PlatformDenetimSorguSema,
  PlatformMesajiAcikYanitSema,
  PlatformMesajiListeYanitSema,
  PlatformMesajiOlusturGirdiSema,
  PlatformMesajiYonetimSema,
  PlatformSistemSagligiYanitSema,
  errorCodes,
} from '@kopru/contracts';
import { AppError, type ServicePlugin } from '@kopru/service-kit';
import { sql } from 'drizzle-orm';
import { z } from 'zod';

import { platformDenetimListele } from '../../../sistem/platform-denetim.js';
import {
  platformMesajiIptalEt,
  platformMesajiOlustur,
  platformMesajlariListele,
  type MesajSatiri,
} from '../../../sistem/platform-mesaj.js';
import { isoZaman } from '../../../sistem/platform-ortak.js';
import { platformSistemSagligi } from '../../../sistem/platform-saglik.js';
import { denetimAlanlari, platformIslem, sistemDbAl, uuidMi } from './ortak.js';

const tag = ['platform'];

const imlecKodla = (i: { createdAt: string; id: string }) =>
  Buffer.from(JSON.stringify([i.createdAt, i.id])).toString('base64url');

function imlecCoz(deger: string): { createdAt: string; id: string } {
  try {
    const [c, i] = JSON.parse(Buffer.from(deger, 'base64url').toString('utf8')) as unknown[];
    if (
      typeof c === 'string' &&
      typeof i === 'string' &&
      uuidMi(i) &&
      !Number.isNaN(Date.parse(c))
    ) {
      return { createdAt: c, id: i };
    }
  } catch {
    // asagidaki hataya duser
  }
  throw new AppError(400, errorCodes.validation, 'imlec geçersiz.');
}

const mesajYaniti = (m: MesajSatiri) => ({
  id: m.id,
  baslik: m.baslik,
  metin: m.metin,
  onem: m.onem,
  baslangic_at: m.baslangic_at,
  bitis_at: m.bitis_at,
});

/** Denetim listesi, sistem sagligi ve bakim/duyuru mesaji yonetimi (`/platform/*`). */
export const platformDenetimSaglikMesajYollari: ServicePlugin = (app) => {
  const { kimlik } = app;

  app.get(
    '/denetim',
    {
      config: { platformEylem: 'platform.denetim_listele', platformRolu: 'yonetici' },
      schema: {
        tags: tag,
        summary: 'Denetim kayıtları (filtre: kurum, aktör, eylem, tarih; imleçli)',
        description:
          '`eylem` tam ad veya `onek.*` olabilir. Sıralama `created_at, id` azalan; `sonraki_imlec` bir sonraki sayfa içindir.',
        querystring: PlatformDenetimSorguSema,
        response: { 200: PlatformDenetimListeYanitSema },
      },
    },
    async (request) => {
      const { kurum_id, aktor_id, eylem, baslangic, bitis, limit, imlec } = request.query;
      const suzgec = {
        kurumId: kurum_id,
        aktorId: aktor_id,
        eylem,
        baslangic: baslangic ? new Date(baslangic) : undefined,
        bitis: bitis ? new Date(bitis) : undefined,
        limit,
        imlec: imlec ? imlecCoz(imlec) : undefined,
      };
      denetimAlanlari(request, {
        ...(kurum_id ? { kurumId: kurum_id } : {}),
        ayrinti: {
          suzgec: Object.keys(request.query).filter((k) => k !== 'imlec' && k !== 'limit'),
        },
      });
      const sonuc = await platformIslem(request, (baglam) =>
        platformDenetimListele(sistemDbAl(kimlik), baglam, suzgec),
      );
      return {
        kayitlar: sonuc.satirlar.map((s) => ({
          id: s.id,
          created_at: s.created_at,
          eylem: s.eylem,
          kurum_id: s.kurum_id,
          aktor_kullanici_id: s.aktor_kullanici_id,
          taklit_kayit_id: s.taklit_kayit_id,
          hedef_turu: s.hedef_turu,
          hedef_id: s.hedef_id,
          neden: s.neden,
          ip: s.ip,
          ayrinti: s.sonra,
        })),
        sonraki_imlec: sonuc.sonraki ? imlecKodla(sonuc.sonraki) : null,
      };
    },
  );

  app.get(
    '/sistem-sagligi',
    {
      config: { platformEylem: 'platform.sistem_sagligi', platformRolu: 'destek' },
      schema: {
        tags: tag,
        summary: 'Sistem sağlığı: outbox birikimi, kuyruk derinlikleri, son 1 saat 5xx oranı',
        description:
          'Yalnız api servisinin kendi verisi. HTTP sayacı süreç içidir (bu api kopyasının gördüğü istekler). pg-boss henüz kurulu değilse `pgboss_kurulu: false` döner.',
        response: { 200: PlatformSistemSagligiYanitSema },
      },
    },
    async (request) => {
      const s = await platformIslem(request, (baglam) =>
        platformSistemSagligi(sistemDbAl(kimlik), baglam),
      );
      const http = app.hataSayaci.ozet();
      return {
        uretildi_at: new Date().toISOString(),
        outbox: {
          bekleyen: s.outbox.bekleyen,
          en_eski_yas_sn: s.outbox.enEskiYasSn,
          hatali: s.outbox.hatali,
        },
        kuyruklar: {
          pgboss_kurulu: s.kuyruk.pgbossKurulu,
          derinlikler: s.kuyruk.derinlikler,
          basarisiz: s.kuyruk.basarisiz,
        },
        http: {
          kaynak: 'surec_ici' as const,
          pencere_dk: app.hataSayaci.pencereDk,
          istek: http.istek,
          hata_5xx: http.hata5xx,
          oran_5xx: http.oran,
        },
      };
    },
  );

  app.get(
    '/mesajlar',
    {
      config: { platformEylem: 'platform.mesaj_listele', platformRolu: 'destek' },
      schema: {
        tags: tag,
        summary: 'Bakım/duyuru mesajları (son 50)',
        response: { 200: PlatformMesajiListeYanitSema },
      },
    },
    async (request) => {
      const satirlar = await platformIslem(request, (baglam) =>
        platformMesajlariListele(sistemDbAl(kimlik), baglam),
      );
      return {
        mesajlar: satirlar.map((m) => ({
          ...mesajYaniti(m),
          iptal_at: m.iptal_at,
          created_at: m.created_at,
        })),
      };
    },
  );

  app.post(
    '/mesajlar',
    {
      config: { platformEylem: 'platform.mesaj_yayinla', platformRolu: 'yonetici' },
      schema: {
        tags: tag,
        summary: 'Tüm kullanıcılara görünen bakım/duyuru mesajı yayınla',
        description:
          'Mesaj `GET /v1/platform-mesaji` ile kimliksiz okunur. Kişisel veri koymayın; metin denetime girmez (yalnız kimlik ve önem).',
        body: PlatformMesajiOlusturGirdiSema,
        response: { 200: PlatformMesajiYonetimSema },
      },
    },
    async (request) => {
      const g = request.body;
      denetimAlanlari(request, { hedefTuru: 'platform_mesaji', ayrinti: { onem: g.onem } });
      const m = await platformIslem(request, (baglam) =>
        platformMesajiOlustur(sistemDbAl(kimlik), baglam, {
          baslik: g.baslik,
          metin: g.metin,
          onem: g.onem,
          baslangicAt: g.baslangic_at ? new Date(g.baslangic_at) : null,
          bitisAt: new Date(g.bitis_at),
        }),
      );
      return {
        ...mesajYaniti(m),
        iptal_at: m.iptal_at,
        created_at: m.created_at,
      };
    },
  );

  app.post(
    '/mesajlar/:mesaj_id/iptal',
    {
      config: { platformEylem: 'platform.mesaj_iptal', platformRolu: 'yonetici' },
      schema: {
        tags: tag,
        summary: 'Mesajı erkenden kaldır',
        params: z.object({ mesaj_id: z.uuid() }),
        response: { 200: z.object({ mesaj_id: z.uuid(), iptal_edildi: z.literal(true) }) },
      },
    },
    async (request) => {
      const { mesaj_id: id } = request.params;
      const tamam = await platformIslem(request, (baglam) =>
        platformMesajiIptalEt(sistemDbAl(kimlik), baglam, id),
      );
      if (!tamam) {
        throw new AppError(404, errorCodes.notFound, 'Mesaj bulunamadı veya zaten kaldırılmış.');
      }
      return { mesaj_id: id, iptal_edildi: true as const };
    },
  );
  return Promise.resolve();
};

/**
 * Herkese acik (kimliksiz) etkin platform mesaji: `GET /v1/platform-mesaji`. Birden cok etkin mesaj varsa en
 * onemlisi (kritik > uyari > bilgi), sonra en yenisi doner. Kisisel veri icermez; kisa sure onbelleklenir.
 */
export const platformMesajiAcikYol: ServicePlugin = (app) => {
  const { db } = app.kimlik;
  app.get(
    '/v1/platform-mesaji',
    {
      config: { public: true, rizaMuaf: true },
      schema: {
        tags: ['platform'],
        summary: 'Etkin bakım/duyuru mesajı (kimliksiz)',
        response: { 200: PlatformMesajiAcikYanitSema },
      },
    },
    async (_request, reply) => {
      void reply.header('cache-control', 'public, max-age=30');
      const rows = await db.orm.execute<MesajSatiri>(sql`
        select id, baslik, metin, onem, ${isoZaman('baslangic_at')} as baslangic_at, ${isoZaman('bitis_at')} as bitis_at
        from hesap.platform_mesajlari
        where iptal_at is null and baslangic_at <= now() and bitis_at > now()
        order by case onem when 'kritik' then 0 when 'uyari' then 1 else 2 end, baslangic_at desc, id desc
        limit 1`);
      const m = rows[0];
      return { mesaj: m ? mesajYaniti(m) : null };
    },
  );
  return Promise.resolve();
};
