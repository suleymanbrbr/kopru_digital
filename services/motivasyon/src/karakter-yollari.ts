import {
  KarakterAdDegistirIstegiSema,
  KarakterSecIstegiSema,
  KarakterTurDegistirIstegiSema,
  KarakterTurleriYanitiSema,
  KarakterYanitiSema,
  KozmetiklerYanitiSema,
  KusanIstegiSema,
  KusanimParamSema,
  motivasyonKurumParamSema,
} from '@kopru/contracts';
import { withTenant, type ServicePlugin } from '@kopru/service-kit';

import {
  adDegistir,
  cikar,
  karakterim,
  karakterSec,
  kozmetikleriListele,
  kusan,
  turDegistir,
  turleriListele,
} from './karakter.js';
import { kimlikAl, modulKontrol, ogrenciZorunlu, zamanBilgisi } from './odak-ortak.js';

export interface KarakterYolSecenekleri {
  simdi: () => Date;
}

/** Yol arkadasi karakter ve kozmetik uclari (yalniz ogrenci, kendi karakteri). */
export function karakterYollari({ simdi }: KarakterYolSecenekleri): ServicePlugin {
  return (app) => {
    const { db } = app;
    if (!db) return Promise.resolve();
    const taban = '/v1/motivasyon/kurumlar/:kurum_id/karakter';
    const ogr = (k: { kurumId: string; kullaniciId: string }) => ({
      kurumId: k.kurumId,
      kullaniciId: k.kullaniciId,
      roller: ['ogrenci' as const],
    });

    app.get(
      `${taban}/turler`,
      {
        schema: {
          tags: ['motivasyon'],
          summary: 'Karakter turleri ve asamalari (tanim tablosundan; asama esikleri seviye).',
          params: motivasyonKurumParamSema,
          response: { 200: KarakterTurleriYanitiSema },
        },
      },
      async (request) => {
        const k = kimlikAl(request, request.params.kurum_id);
        ogrenciZorunlu(k);
        return withTenant(db, ogr(k), async (tx) => {
          const z = await zamanBilgisi(tx, k.kurumId, simdi());
          await modulKontrol(tx, k.kurumId, k.uyelikId, z.gun);
          return { turler: await turleriListele(tx) };
        });
      },
    );

    app.get(
      taban,
      {
        schema: {
          tags: ['motivasyon'],
          summary:
            'Benim karakterim (secilmediyse `karakter: null`): asama, tur degistirme hakki, kusanilanlar.',
          params: motivasyonKurumParamSema,
          response: { 200: KarakterYanitiSema },
        },
      },
      async (request) => {
        const k = kimlikAl(request, request.params.kurum_id);
        ogrenciZorunlu(k);
        const karakter = await withTenant(db, ogr(k), (tx) => karakterim(tx, k, simdi()));
        return { karakter };
      },
    );

    app.post(
      taban,
      {
        schema: {
          tags: ['motivasyon'],
          summary:
            'Karakter sec (tur + ad, ilk kez). Uygunsuz ad 422 karakter_adi_uygunsuz; zaten secilmisse 409 karakter_zaten_secildi. Asama mevcut seviyeden hesaplanir.',
          params: motivasyonKurumParamSema,
          body: KarakterSecIstegiSema,
          response: { 201: KarakterYanitiSema },
        },
      },
      async (request, reply) => {
        const k = kimlikAl(request, request.params.kurum_id);
        ogrenciZorunlu(k);
        const karakter = await withTenant(db, ogr(k), (tx) =>
          karakterSec(tx, k, request.body, simdi()),
        );
        return reply.code(201).send({ karakter });
      },
    );

    app.patch(
      `${taban}/tur`,
      {
        schema: {
          tags: ['motivasyon'],
          summary:
            'Karakter turunu degistir: tek sefer (409 tur_degistirme_hakki_yok); asama ve kusanimlar korunur.',
          params: motivasyonKurumParamSema,
          body: KarakterTurDegistirIstegiSema,
          response: { 200: KarakterYanitiSema },
        },
      },
      async (request) => {
        const k = kimlikAl(request, request.params.kurum_id);
        ogrenciZorunlu(k);
        const karakter = await withTenant(db, ogr(k), (tx) =>
          turDegistir(tx, k, request.body.tur_kodu, simdi()),
        );
        return { karakter };
      },
    );

    app.patch(
      `${taban}/ad`,
      {
        schema: {
          tags: ['motivasyon'],
          summary:
            'Karakter adini degistir (sinirsiz; ayni ad suzgeci: 422 karakter_adi_uygunsuz).',
          params: motivasyonKurumParamSema,
          body: KarakterAdDegistirIstegiSema,
          response: { 200: KarakterYanitiSema },
        },
      },
      async (request) => {
        const k = kimlikAl(request, request.params.kurum_id);
        ogrenciZorunlu(k);
        const karakter = await withTenant(db, ogr(k), (tx) =>
          adDegistir(tx, k, request.body.ad, simdi()),
        );
        return { karakter };
      },
    );

    app.get(
      `${taban}/kozmetikler`,
      {
        schema: {
          tags: ['motivasyon'],
          summary:
            'Tum kozmetikler: sahip olunan/olunmayan, kusanilan, acilma kosulu (rozet / seviye / seri).',
          params: motivasyonKurumParamSema,
          response: { 200: KozmetiklerYanitiSema },
        },
      },
      async (request) => {
        const k = kimlikAl(request, request.params.kurum_id);
        ogrenciZorunlu(k);
        const kozmetikler = await withTenant(db, ogr(k), (tx) =>
          kozmetikleriListele(tx, k, simdi()),
        );
        return { kozmetikler };
      },
    );

    app.put(
      `${taban}/kusanimlar/:slot`,
      {
        schema: {
          tags: ['motivasyon'],
          summary:
            'Slota kozmetik kusan. Sahip olunmayan 422 kozmetik_sahip_degil; slot uyusmazligi 422 kozmetik_slot_uyusmuyor; karakter yoksa 422 karakter_secilmemis.',
          params: KusanimParamSema,
          body: KusanIstegiSema,
          response: { 200: KarakterYanitiSema },
        },
      },
      async (request) => {
        const k = kimlikAl(request, request.params.kurum_id);
        ogrenciZorunlu(k);
        const karakter = await withTenant(db, ogr(k), (tx) =>
          kusan(tx, k, request.params.slot, request.body.kozmetik_kodu, simdi()),
        );
        return { karakter };
      },
    );

    app.delete(
      `${taban}/kusanimlar/:slot`,
      {
        schema: {
          tags: ['motivasyon'],
          summary: 'Slottaki kozmetigi cikar (bos slot icin de basarili).',
          params: KusanimParamSema,
          response: { 200: KarakterYanitiSema },
        },
      },
      async (request) => {
        const k = kimlikAl(request, request.params.kurum_id);
        ogrenciZorunlu(k);
        const karakter = await withTenant(db, ogr(k), (tx) =>
          cikar(tx, k, request.params.slot, simdi()),
        );
        return { karakter };
      },
    );

    return Promise.resolve();
  };
}
