import { createDb, islenmisOlaylariTemizle, runWorker, startTelemetry } from '@kopru/service-kit';

import { loadServiceEnv, serviceName } from './config.js';
import { geceIsiZamanla } from './modules/finans/index.js';
import { kaynakSuresiniDoldur } from './sistem/ders-kaynak-sure-sonu.js';
import { dersSaatlikIs } from './sistem/ders-seri-uret.js';
import { medyaKopyaTuketiciBaslat } from './sistem/medya-kopya-tuketici.js';
import { soruKotaSayaclariniTemizle, soruOtomatikCoz } from './sistem/soru-isleri.js';

const env = loadServiceEnv();
const telemetry = startTelemetry(`${serviceName}-worker`, env.OTEL_EXPORTER_OTLP_ENDPOINT);

/**
 * Ders saatlik isi (seri uzatma, katilimci esitleme, eski yoklama istegi temizligi, kaynak sure sonu): acilista ve sonra saatte bir denenir. Is idempotenttir ve yapilacak is yoksa hicbir
 * sey yazmaz (bkz. `dersSerileriniUret`); boylece her seri gunde bir kez uzar, worker yeniden basladiysa ya da
 * bir calisma basarisiz olduysa bir saat icinde toparlanir. Zamanlayici (pg-boss) geldiginde bu cagri onun
 * gunluk isine tasinir.
 */
const DERS_SERI_ARALIGI_MS = 60 * 60 * 1000;
const GUNLUK_ARALIK_MS = 24 * 60 * 60 * 1000;

// Ayri surec: isler / olay tuketicileri buraya `setup` ile eklenir.
// Outbox relay satirlari guncelledigi/sildigi icin `api_sistem` baglantisini kullanir (ADR 0003);
// `api_app` outbox'a yalnizca ekleme yapar.
await runWorker({
  name: serviceName,
  env: { ...env, DATABASE_URL: env.DATABASE_SISTEM_URL ?? env.DATABASE_URL },
  outboxTable: 'ortak.outbox',
  // Isler `api_sistem` baglantisiyla (withSistem) calisir; DB yoksa zamanlanmaz.
  setup: async ({ db, log, nats }) => {
    // Medya dosya kopyasi tuketicisi UYGULAMA rolu (`api_app`, RLS'e tabi) ile calisir: worker'in sistem
    // baglantisi BYPASSRLS oldugundan kiraci izolasyonunu atlardi (ADR 0002 uygulama notu).
    const kapatilacaklar: (() => Promise<void>)[] = [];
    if (nats && env.DATABASE_URL) {
      const uygulamaDb = createDb({ url: env.DATABASE_URL, max: 4 });
      const tuketici = await medyaKopyaTuketiciBaslat({ nats, db: uygulamaDb, log });
      kapatilacaklar.push(async () => {
        await tuketici.stop();
        await uygulamaDb.close();
      });
    }
    if (!db) {
      log.info('ders serisi işi devre dışı (veritabanı yok)');
      return async () => {
        for (const kapat of kapatilacaklar) await kapat();
      };
    }
    let calisiyor = false;
    const calistir = async () => {
      if (calisiyor) return;
      calisiyor = true;
      try {
        const ozet = await dersSaatlikIs(db, { log });
        if (ozet.seri.seri > 0 || ozet.seri.hata > 0) log.info(ozet.seri, 'ders serileri uzatıldı');
        if (ozet.katilimci.ders > 0 || ozet.katilimci.hata > 0) {
          log.info(ozet.katilimci, 'ders katılımcıları eşitlendi');
        }
        if (ozet.silinenYoklamaIstegi > 0) {
          log.info({ silinen: ozet.silinenYoklamaIstegi }, 'eski yoklama istekleri silindi');
        }
        // Ders kaydi/materyal son erisim tarihi gecenleri `suresi_doldu` yapar (idempotent, coklu worker guvenli).
        const sure = await kaynakSuresiniDoldur(db, { log });
        if (sure.kaynak > 0 || sure.hata > 0) log.info(sure, 'ders kaynaklarının süresi doldu');
        // 7 gündür cevaplanmış ve takipsiz sorular kendiliğinden çözülür (olayıyla; idempotent).
        const soru = await soruOtomatikCoz(db, { log });
        if (soru.soru > 0 || soru.hata > 0) log.info(soru, 'sorular otomatik çözüldü');
      } catch (err) {
        log.error({ err }, 'ders saatlik işi başarısız');
      } finally {
        calisiyor = false;
      }
    };
    void calistir();
    const zamanlayici = setInterval(() => void calistir(), DERS_SERI_ARALIGI_MS);
    // Gunluk bakim: 400 gunden eski kota sayaclari ve eski `processed_events` satirlari.
    const gunluk = async () => {
      try {
        const sayac = await soruKotaSayaclariniTemizle(db);
        const olay = await islenmisOlaylariTemizle(db);
        if (sayac > 0 || olay > 0) log.info({ sayac, olay }, 'eski kayıtlar temizlendi');
      } catch (err) {
        log.error({ err }, 'günlük temizlik başarısız');
      }
    };
    void gunluk();
    const gunlukZamanlayici = setInterval(() => void gunluk(), GUNLUK_ARALIK_MS);
    const finansIsleriniDurdur = geceIsiZamanla(db, log);
    return async () => {
      clearInterval(zamanlayici);
      clearInterval(gunlukZamanlayici);
      await finansIsleriniDurdur();
      for (const kapat of kapatilacaklar) await kapat();
    };
  },
  onClose: telemetry.shutdown,
});
