import {
  BetaOzellikKoduSema,
  MODUL_KODLARI,
  ModulKoduSema,
  PlatformBetaAyarlaGirdiSema,
  PlatformBetaAyarlaYanitSema,
  PlatformKurumAramaSorguSema,
  PlatformKurumDetayYanitSema,
  PlatformKurumListeYanitSema,
  PlatformModulAyarlaGirdiSema,
  PlatformModulAyarlaYanitSema,
  RolSema,
  errorCodes,
  type PlatformKurumDetayYanit,
} from '@kopru/contracts';
import { AppError, type ServicePlugin } from '@kopru/service-kit';
import { z } from 'zod';

import {
  platformBetaAyarla,
  platformKurumAra,
  platformKurumDetayi,
  platformModulAyarla,
  type KurumAramasi,
  type SahipSatiri,
} from '../../../sistem/platform-kurum.js';
import { telefonuNormallestir } from '../telefon.js';
import { epostayiMaskele, telefonuMaskele } from './maskele.js';
import { denetimAlanlari, platformIslem, sistemDbAl, uuidMi } from './ortak.js';

const tag = ['platform'];
const kurumParam = z.object({ kurum_id: z.uuid() });

/** Arama metnini turune ayirir: kurum kimligi, e-posta, telefon veya ad. */
export function aramaCoz(q: string | undefined): KurumAramasi {
  const metin = q?.trim();
  if (!metin) return { tur: 'yok' };
  if (uuidMi(metin)) return { tur: 'id', deger: metin.toLowerCase() };
  if (metin.includes('@')) return { tur: 'eposta', deger: metin.toLowerCase() };
  if (/^[+\d][\d\s().-]{6,}$/.test(metin)) {
    const telefon = telefonuNormallestir(metin);
    if (telefon) return { tur: 'telefon', deger: telefon };
  }
  return { tur: 'ad', deger: metin };
}

const sahipOzeti = (s: SahipSatiri) => ({
  kullanici_id: s.kullanici_id,
  telefon_maskeli: telefonuMaskele(s.telefon_e164),
  eposta_maskeli: epostayiMaskele(s.eposta),
});

/** Kurum listesi/arama/detay ve kuruma ozel modul + beta ayarlari. */
export const platformKurumYollari: ServicePlugin = (app) => {
  const { kimlik } = app;

  app.get(
    '/kurumlar',
    {
      config: { platformEylem: 'platform.kurum_ara', platformRolu: 'destek' },
      schema: {
        tags: tag,
        summary: 'Kurum listesi ve arama (ad, kurum kimliği, sahip telefonu/e-postası)',
        description:
          'Sahip iletişim bilgisi yalnız maskeli döner. Telefon ve e-posta aramasında tam değer gerekir (öneklerle arama yoktur).',
        querystring: PlatformKurumAramaSorguSema,
        response: { 200: PlatformKurumListeYanitSema },
      },
    },
    async (request) => {
      const { q, durum, limit, imlec } = request.query;
      if (imlec !== undefined && !uuidMi(imlec)) {
        throw new AppError(400, errorCodes.validation, 'imlec geçersiz.');
      }
      const arama = aramaCoz(q);
      // Arama metni (telefon/e-posta olabilir) denetime GIRMEZ; yalniz turu girer.
      denetimAlanlari(request, {
        ayrinti: { arama_turu: arama.tur, durum_filtresi: durum ?? null },
      });
      const sonuc = await platformIslem(request, (baglam) =>
        platformKurumAra(sistemDbAl(kimlik), baglam, { arama, durum, limit, imlec }),
      );
      return {
        kurumlar: sonuc.kurumlar.map((k) => ({
          id: k.id,
          ad: k.ad,
          tur: k.tur as 'bireysel' | 'ekip' | 'kurum',
          durum: k.durum as 'aktif' | 'askida' | 'kapali',
          created_at: k.created_at,
          sahipler: sonuc.sahipler.filter((s) => s.kurum_id === k.id).map(sahipOzeti),
        })),
        sonraki_imlec: sonuc.sonraki,
      };
    },
  );

  app.get(
    '/kurumlar/:kurum_id',
    {
      config: { platformEylem: 'platform.kurum_detay', platformRolu: 'destek' },
      schema: {
        tags: tag,
        summary: 'Kurum detayı: üye sayıları, durum, modül ayarları, beta özellikleri',
        params: kurumParam,
        response: { 200: PlatformKurumDetayYanitSema },
      },
    },
    async (request): Promise<PlatformKurumDetayYanit> => {
      const { kurum_id: kurumId } = request.params;
      denetimAlanlari(request, { kurumId, hedefTuru: 'kurum', hedefId: kurumId });
      const d = await platformIslem(request, (baglam) =>
        platformKurumDetayi(sistemDbAl(kimlik), baglam, kurumId),
      );
      if (!d.kurum) throw new AppError(404, errorCodes.notFound, 'Kurum bulunamadı.');
      const rollereGore: Record<string, number> = {};
      let aktif = 0;
      let diger = 0;
      for (const u of d.uyeler) {
        if (u.durum === 'aktif') {
          aktif += u.sayi;
          rollereGore[u.rol] = (rollereGore[u.rol] ?? 0) + u.sayi;
        } else {
          diger += u.sayi;
        }
      }
      return {
        id: d.kurum.id,
        ad: d.kurum.ad,
        tur: d.kurum.tur as 'bireysel' | 'ekip' | 'kurum',
        durum: d.kurum.durum as 'aktif' | 'askida' | 'kapali',
        created_at: d.kurum.created_at,
        saat_dilimi: d.kurum.saat_dilimi,
        sahipler: d.sahipler.map(sahipOzeti),
        uye_sayilari: {
          aktif_toplam: aktif,
          rollere_gore: Object.fromEntries(
            RolSema.options.map((r) => [r, rollereGore[r] ?? 0]),
          ) as Record<(typeof RolSema.options)[number], number>,
          diger_durumlar: diger,
        },
        moduller: MODUL_KODLARI.map((kod) => {
          const kurumAyari = d.modulAyarlari.find(
            (a) => a.modul_kodu === kod && a.kapsam === 'kurum',
          );
          return {
            modul_kodu: kod,
            kurum_acik: kurumAyari?.acik ?? true,
            kurum_ayari_var: kurumAyari !== undefined,
            alt_duzey_kapali_sayisi: d.modulAyarlari.filter(
              (a) => a.modul_kodu === kod && a.kapsam !== 'kurum' && !a.acik,
            ).length,
          };
        }),
        beta_ozellikleri: d.beta.map((b) => ({
          ozellik_kodu: b.ozellik_kodu,
          acik: b.acik,
          updated_at: b.updated_at,
        })),
      };
    },
  );

  app.put(
    '/kurumlar/:kurum_id/moduller/:modul_kodu',
    {
      config: { platformEylem: 'platform.modul_ayarla', platformRolu: 'yonetici' },
      schema: {
        tags: tag,
        summary: 'Kuruma özel modül aç/kapat (kurum düzeyi); acik=null varsayılana döner',
        description:
          '`hesap.modul_ayari.degisti.v1` olayı aynı işlemde yayımlanır; diğer servislerin kopyaları güncellenir. Neden denetime yazılır.',
        params: kurumParam.extend({ modul_kodu: ModulKoduSema }),
        body: PlatformModulAyarlaGirdiSema,
        response: { 200: PlatformModulAyarlaYanitSema },
      },
    },
    async (request) => {
      const { kurum_id: kurumId, modul_kodu: modulKodu } = request.params;
      const { acik, neden } = request.body;
      denetimAlanlari(request, {
        kurumId,
        hedefTuru: 'modul_ayari',
        ayrinti: { modul_kodu: modulKodu, acik },
      });
      const s = await platformIslem(
        request,
        (baglam) =>
          platformModulAyarla(sistemDbAl(kimlik), baglam as typeof baglam & { kurumId: string }, {
            modulKodu,
            acik,
            correlationId: request.correlationId,
          }),
        { neden },
      );
      if (!s.bulundu) throw new AppError(404, errorCodes.notFound, 'Kurum bulunamadı.');
      return { modul_kodu: modulKodu, kurum_acik: s.kurumAcik, kurum_ayari_var: s.kurumAyariVar };
    },
  );

  app.put(
    '/kurumlar/:kurum_id/beta/:ozellik_kodu',
    {
      config: { platformEylem: 'platform.beta_ayarla', platformRolu: 'yonetici' },
      schema: {
        tags: tag,
        summary: 'Kuruma özel beta özellik bayrağı aç/kapat; acik=null bayrağı siler',
        params: kurumParam.extend({ ozellik_kodu: BetaOzellikKoduSema }),
        body: PlatformBetaAyarlaGirdiSema,
        response: { 200: PlatformBetaAyarlaYanitSema },
      },
    },
    async (request) => {
      const { kurum_id: kurumId, ozellik_kodu: ozellikKodu } = request.params;
      const { acik, neden } = request.body;
      denetimAlanlari(request, {
        kurumId,
        hedefTuru: 'beta_ozelligi',
        ayrinti: { ozellik_kodu: ozellikKodu, acik },
      });
      const s = await platformIslem(
        request,
        (baglam) =>
          platformBetaAyarla(sistemDbAl(kimlik), baglam as typeof baglam & { kurumId: string }, {
            ozellikKodu,
            acik,
          }),
        { neden },
      );
      if (!s.bulundu) throw new AppError(404, errorCodes.notFound, 'Kurum bulunamadı.');
      return { ozellik_kodu: ozellikKodu, acik: s.acik };
    },
  );
  return Promise.resolve();
};
