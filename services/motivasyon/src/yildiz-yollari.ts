import {
  YildizAldiklariYanitiSema,
  YildizOgrenciParamSema,
  YildizVerIstegiSema,
  YildizVerYanitiSema,
  YildizVerdiklerimYanitiSema,
  errorCodes,
  izinVarMi,
  motivasyonKurumParamSema,
} from '@kopru/contracts';
import { AppError, withTenant, type ServicePlugin } from '@kopru/service-kit';
import { sql } from 'drizzle-orm';

import { kimlikAl, modulKontrol, ogretmenGrubundaMi, zamanBilgisi } from './odak-ortak.js';
import { aldiklari, verdiklerim, yildizVer } from './yildiz.js';

export interface YildizYolSecenekleri {
  simdi: () => Date;
}

const verebilir = (rol: string) => rol === 'ogretmen' || rol === 'yonetici' || rol === 'sahip';

/**
 * Haftanin yildizi uclari. Yazma izni sozlukte yoktur: `ogretmen` (atandigi grup) ve `sahip`/`yonetici`
 * (kurum) verebilir; ogrenci ve veli veremez (403 izin_yok).
 */
export function yildizYollari({ simdi }: YildizYolSecenekleri): ServicePlugin {
  return (app) => {
    const { db } = app;
    if (!db) return Promise.resolve();
    const taban = '/v1/motivasyon/kurumlar/:kurum_id/haftanin-yildizlari';

    app.post(
      taban,
      {
        schema: {
          tags: ['motivasyon'],
          summary:
            'Haftanin yildizi ver (ogretmen: atandigi gruptaki ogrenci; yonetici/sahip: kurumdaki grup uyesi). 50 XP (tavandan muaf) + rozet sayaci. Ogrenci haftada bir (409 haftanin_yildizi_verilmis); ogretmen haftada en cok ayar siniri (409 haftalik_limit_asildi). Kapsam disi ogrenci 404.',
          params: motivasyonKurumParamSema,
          body: YildizVerIstegiSema,
          response: { 201: YildizVerYanitiSema },
        },
      },
      async (request, reply) => {
        const k = kimlikAl(request, request.params.kurum_id);
        if (!verebilir(k.rol)) {
          throw new AppError(
            403,
            errorCodes.izinYok,
            'Haftanın yıldızını yalnızca öğretmenler ve yöneticiler seçebilir.',
          );
        }
        const s = await withTenant(
          db,
          { kurumId: k.kurumId, kullaniciId: k.kullaniciId, roller: [k.rol] },
          (tx) => yildizVer(tx, k, request.body, simdi()),
        );
        return reply.code(201).send(s);
      },
    );

    app.get(
      `${taban}/verdiklerim`,
      {
        schema: {
          tags: ['motivasyon'],
          summary:
            'Bu haftaki verdigim yildizlar ve kalan hak (ogretmen: limit/kalan; yonetici/sahip: sinirsiz, limit ve kalan null).',
          params: motivasyonKurumParamSema,
          response: { 200: YildizVerdiklerimYanitiSema },
        },
      },
      async (request) => {
        const k = kimlikAl(request, request.params.kurum_id);
        if (!verebilir(k.rol)) {
          throw new AppError(
            403,
            errorCodes.izinYok,
            'Bu uç yalnızca öğretmenler ve yöneticiler içindir.',
          );
        }
        return withTenant(
          db,
          { kurumId: k.kurumId, kullaniciId: k.kullaniciId, roller: [k.rol] },
          (tx) => verdiklerim(tx, k, simdi()),
        );
      },
    );

    app.get(
      '/v1/motivasyon/kurumlar/:kurum_id/ogrenciler/:ogrenci_id/haftanin-yildizlari',
      {
        schema: {
          tags: ['motivasyon'],
          summary:
            'Ogrencinin aldigi haftanin yildizlari (ogrenci kendi, ogretmen atandigi gruptaki, yonetici/sahip kurumdaki). Kapsam disi 404.',
          params: YildizOgrenciParamSema,
          response: { 200: YildizAldiklariYanitiSema },
        },
      },
      async (request) => {
        const { ogrenci_id: ogrenciId } = request.params;
        const k = kimlikAl(request, request.params.kurum_id);
        const kendi = k.rol === 'ogrenci' && k.uyelikId === ogrenciId;
        const kurumKapsami = izinVarMi(k.rol, 'oyunlastirma.oku', 'kurum');
        const grupKapsami = izinVarMi(k.rol, 'oyunlastirma.oku', 'grup');
        if (!kendi && !grupKapsami) {
          throw new AppError(
            403,
            errorCodes.izinYok,
            'Bu öğrencinin yıldızlarını görme yetkiniz yok.',
          );
        }
        return withTenant(
          db,
          { kurumId: k.kurumId, kullaniciId: k.kullaniciId, roller: [k.rol] },
          async (tx) => {
            const z = await zamanBilgisi(tx, k.kurumId, simdi());
            const yok = () => new AppError(404, errorCodes.notFound, 'Öğrenci bulunamadı.');
            if (!kendi && !kurumKapsami) {
              const kapsamda = await ogretmenGrubundaMi(tx, {
                kurumId: k.kurumId,
                ogretmenId: k.uyelikId,
                ogrenciId,
                gun: z.gun,
              });
              if (!kapsamda) throw yok();
            } else if (!kendi) {
              const [var_] = await tx.execute(sql`
                select 1 from motivasyon.uyelik_kopyalari where uyelik_id = ${ogrenciId} and rol = 'ogrenci'
                union all
                select 1 from motivasyon.ogrenci_durumlari where ogrenci_id = ${ogrenciId}
                limit 1`);
              if (!var_) throw yok();
            }
            await modulKontrol(tx, k.kurumId, ogrenciId, z.gun);
            return { yildizlar: await aldiklari(tx, k.kurumId, ogrenciId) };
          },
        );
      },
    );

    return Promise.resolve();
  };
}
