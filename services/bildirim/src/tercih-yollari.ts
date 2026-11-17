import {
  BildirimAyarlariGuncelleSema,
  BildirimAyarlariSema,
  BildirimTercihGuncelleSema,
  BildirimTercihListesiSema,
  bildirimKurumYolParamSema,
  errorCodes,
} from '@kopru/contracts';
import { AppError, withTenant, type ServicePlugin, type Tx } from '@kopru/service-kit';
import { sql } from 'drizzle-orm';

import { kimlik, type KurumKimligi } from './kimlik.js';
import { ayarlariOku, kilitliMi, tercihMatrisi, tercihleriOku } from './tercih.js';

const hata = (kod: string, mesaj: string, detay?: unknown) => new AppError(400, kod, mesaj, detay);

async function matris(tx: Tx, k: KurumKimligi) {
  return { tercihler: tercihMatrisi(await tercihleriOku(tx, k.kullaniciId, k.kurumId)) };
}

/**
 * Tercih ve ayar uclari (kullanicinin KENDI kurum bazli tercihi). `sistem` kategorisi ve `kutu` kanali
 * kilitlidir: degistirme istegi `400 tercih_kilitli` ile reddedilir.
 */
export function tercihYollari(): ServicePlugin {
  return (app) => {
    const { db } = app;
    if (!db) return Promise.resolve();
    const baglam = (k: KurumKimligi) => ({
      kurumId: k.kurumId,
      kullaniciId: k.kullaniciId,
      roller: [k.rol],
    });

    app.get(
      '/v1/bildirim/kurumlar/:kurum_id/tercihler',
      {
        schema: {
          tags: ['bildirim'],
          summary:
            'Kategori x kanal tercih matrisi (kayit olmayan hucrelerde varsayilan uygulanmis). `sistem` kategorisi ve `kutu` kanali kilitlidir.',
          params: bildirimKurumYolParamSema,
          response: { 200: BildirimTercihListesiSema },
        },
      },
      async (request) => {
        const k = kimlik(request, request.params.kurum_id);
        return withTenant(db, baglam(k), (tx) => matris(tx, k));
      },
    );

    app.put(
      '/v1/bildirim/kurumlar/:kurum_id/tercihler',
      {
        schema: {
          tags: ['bildirim'],
          summary:
            'Verilen hucreleri gunceller (kismi guncelleme); guncel matrisi doner. Kilitli hucre 400 tercih_kilitli.',
          params: bildirimKurumYolParamSema,
          body: BildirimTercihGuncelleSema,
          response: { 200: BildirimTercihListesiSema },
        },
      },
      async (request) => {
        const k = kimlik(request, request.params.kurum_id);
        const kilitli = request.body.tercihler.filter((t) => kilitliMi(t.kategori, t.kanal));
        if (kilitli.length > 0) {
          throw hata(
            'tercih_kilitli',
            'Sistem bildirimleri ve gelen kutusu kapatılamaz.',
            kilitli.map((t) => ({ kategori: t.kategori, kanal: t.kanal })),
          );
        }
        return withTenant(db, baglam(k), async (tx) => {
          for (const t of request.body.tercihler) {
            await tx.execute(sql`
              insert into bildirim.tercihler (kullanici_id, kurum_id, kategori, kanal, acik)
              values (${k.kullaniciId}, ${k.kurumId}, ${t.kategori}, ${t.kanal}, ${t.acik})
              on conflict (kullanici_id, kurum_id, kategori, kanal) do update set acik = excluded.acik`);
          }
          return matris(tx, k);
        });
      },
    );

    app.get(
      '/v1/bildirim/kurumlar/:kurum_id/ayarlar',
      {
        schema: {
          tags: ['bildirim'],
          summary:
            'Sessiz saat, saat dilimi ve ders hatirlatma ayarlari (kayit yoksa varsayilan: 22:00-08:00, Europe/Istanbul, 60 dk).',
          params: bildirimKurumYolParamSema,
          response: { 200: BildirimAyarlariSema },
        },
      },
      async (request) => {
        const k = kimlik(request, request.params.kurum_id);
        return withTenant(db, baglam(k), (tx) => ayarlariOku(tx, k.kullaniciId, k.kurumId));
      },
    );

    app.put(
      '/v1/bildirim/kurumlar/:kurum_id/ayarlar',
      {
        schema: {
          tags: ['bildirim'],
          summary:
            'Ayarlari kismen gunceller; guncel ayarlari doner. `sessiz_gunler: []` sessiz saati kapatir; baslangic ve bitis birlikte verilir ve esit olamaz.',
          params: bildirimKurumYolParamSema,
          body: BildirimAyarlariGuncelleSema,
          response: { 200: BildirimAyarlariSema },
        },
      },
      async (request) => {
        const k = kimlik(request, request.params.kurum_id);
        const b = request.body;
        if (b.sessiz_baslangic !== undefined && b.sessiz_baslangic === b.sessiz_bitis) {
          throw hata(errorCodes.validation, 'Sessiz saat başlangıcı ve bitişi aynı olamaz.');
        }
        return withTenant(db, baglam(k), async (tx) => {
          if (b.saat_dilimi !== undefined) {
            const [gecerli] = await tx.execute<{ n: number }>(sql`
              select count(*)::int as n from pg_timezone_names where name = ${b.saat_dilimi}`);
            if (!gecerli?.n) throw hata(errorCodes.validation, 'Geçersiz saat dilimi.');
          }
          const mevcut = await ayarlariOku(tx, k.kullaniciId, k.kurumId);
          const yeni = {
            sessiz_baslangic: b.sessiz_baslangic ?? mevcut.sessiz_baslangic,
            sessiz_bitis: b.sessiz_bitis ?? mevcut.sessiz_bitis,
            sessiz_gunler: b.sessiz_gunler ?? mevcut.sessiz_gunler,
            saat_dilimi: b.saat_dilimi ?? mevcut.saat_dilimi,
            ders_hatirlatma_dk: b.ders_hatirlatma_dk ?? mevcut.ders_hatirlatma_dk,
          };
          await tx.execute(sql`
            insert into bildirim.kullanici_ayarlari
              (kullanici_id, kurum_id, sessiz_baslangic, sessiz_bitis, sessiz_gunler, saat_dilimi, ders_hatirlatma_dk)
            values (${k.kullaniciId}, ${k.kurumId}, ${yeni.sessiz_baslangic}::time, ${yeni.sessiz_bitis}::time,
                    ${`{${[...new Set(yeni.sessiz_gunler)].join(',')}}`}::smallint[], ${yeni.saat_dilimi},
                    ${yeni.ders_hatirlatma_dk})
            on conflict (kullanici_id, kurum_id) do update
              set sessiz_baslangic = excluded.sessiz_baslangic, sessiz_bitis = excluded.sessiz_bitis,
                  sessiz_gunler = excluded.sessiz_gunler, saat_dilimi = excluded.saat_dilimi,
                  ders_hatirlatma_dk = excluded.ders_hatirlatma_dk`);
          return ayarlariOku(tx, k.kullaniciId, k.kurumId);
        });
      },
    );

    return Promise.resolve();
  };
}
