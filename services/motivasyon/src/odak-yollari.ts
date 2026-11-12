import {
  OdakAcikYanitiSema,
  OdakBaslatIstegiSema,
  OdakBaslatYanitiSema,
  OdakBitirIstegiSema,
  OdakBitirYanitiSema,
  OdakListeSorgusuSema,
  OdakListeYanitiSema,
  OdakParamSema,
  motivasyonKurumParamSema,
} from '@kopru/contracts';
import { withTenant, type ServicePlugin } from '@kopru/service-kit';

import { kimlikAl, ogrenciZorunlu } from './odak-ortak.js';
import { acikOturum, odakBaslat, odakBitir, sonOturumlar } from './odak.js';

export interface OdakYolSecenekleri {
  simdi: () => Date;
}

/** Odak oturumu uclari (yalniz ogrenci, kendi oturumlari). */
export function odakYollari({ simdi }: OdakYolSecenekleri): ServicePlugin {
  return (app) => {
    const { db } = app;
    if (!db) return Promise.resolve();
    const taban = '/v1/motivasyon/kurumlar/:kurum_id/odak-oturumlari';
    const baglam = (k: { kurumId: string; kullaniciId: string }) => ({
      kurumId: k.kurumId,
      kullaniciId: k.kullaniciId,
      roller: ['ogrenci' as const],
    });

    app.post(
      taban,
      {
        schema: {
          tags: ['motivasyon'],
          summary:
            'Odak oturumu baslat (ogrenci). `istemci_id` (UUIDv7) ile idempotent: ayni kimlik ayni oturumu 200 ile doner. Zaten devam eden baska oturum varsa 409 acik_oturum_var (details.oturum). `mod`: 25_5, 50_10, serbest (planlanan_dk 5-180).',
          params: motivasyonKurumParamSema,
          body: OdakBaslatIstegiSema,
          response: { 200: OdakBaslatYanitiSema, 201: OdakBaslatYanitiSema },
        },
      },
      async (request, reply) => {
        const k = kimlikAl(request, request.params.kurum_id);
        ogrenciZorunlu(k);
        const s = await withTenant(db, baglam(k), (tx) => odakBaslat(tx, k, request.body, simdi()));
        return reply.code(s.yeni ? 201 : 200).send(s.oturum);
      },
    );

    app.get(
      `${taban}/acik`,
      {
        schema: {
          tags: ['motivasyon'],
          summary:
            'Devam eden odak oturumu (yoksa `oturum: null`). 6 saati gecen oturum acik sayilmaz.',
          params: motivasyonKurumParamSema,
          response: { 200: OdakAcikYanitiSema },
        },
      },
      async (request) => {
        const k = kimlikAl(request, request.params.kurum_id);
        ogrenciZorunlu(k);
        const oturum = await withTenant(db, baglam(k), (tx) => acikOturum(tx, k, simdi()));
        return { oturum };
      },
    );

    app.get(
      taban,
      {
        schema: {
          tags: ['motivasyon'],
          summary: 'Son odak oturumlari (yeniden eskiye).',
          params: motivasyonKurumParamSema,
          querystring: OdakListeSorgusuSema,
          response: { 200: OdakListeYanitiSema },
        },
      },
      async (request) => {
        const k = kimlikAl(request, request.params.kurum_id);
        ogrenciZorunlu(k);
        const oturumlar = await withTenant(db, baglam(k), (tx) =>
          sonOturumlar(tx, k, request.query.limit, simdi()),
        );
        return { oturumlar };
      },
    );

    app.post(
      `${taban}/:istemci_id/bitir`,
      {
        schema: {
          tags: ['motivasyon'],
          summary:
            'Odak oturumunu bitir (tamam/yarida). Sure sunucuda LEAST(bitis - baslangic, planlanan*60+60, 3 saat); istemcinin `bitis_at` degeri [baslangic, simdi] araligina sikistirilir. XP: dakika basina 1 (odak tavani 120). Ayni oturumu tekrar bitirmek durumu degistirmez, ikinci XP vermez.',
          params: OdakParamSema,
          body: OdakBitirIstegiSema,
          response: { 200: OdakBitirYanitiSema },
        },
      },
      async (request) => {
        const k = kimlikAl(request, request.params.kurum_id);
        ogrenciZorunlu(k);
        return withTenant(db, baglam(k), (tx) =>
          odakBitir(tx, k, request.params.istemci_id, request.body, simdi()),
        );
      },
    );

    return Promise.resolve();
  };
}
