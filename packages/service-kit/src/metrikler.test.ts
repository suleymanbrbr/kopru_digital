import {
  AggregationTemporality,
  InMemoryMetricExporter,
  MeterProvider,
  PeriodicExportingMetricReader,
} from '@opentelemetry/sdk-metrics';
import { describe, expect, it } from 'vitest';

import { IZINLI_ETIKETLER, Metrikler } from './metrikler.js';

function kur(simdi = () => 1_700_000_000_000) {
  const exporter = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE);
  const reader = new PeriodicExportingMetricReader({ exporter, exportIntervalMillis: 3_600_000 });
  const provider = new MeterProvider({ readers: [reader] });
  const m = new Metrikler(provider.getMeter('test'), simdi);
  const topla = async () => {
    exporter.reset();
    await reader.forceFlush();
    return exporter
      .getMetrics()
      .flatMap((r) => r.scopeMetrics)
      .flatMap((s) => s.metrics);
  };
  return { m, topla, kapat: () => provider.shutdown() };
}

describe('metrikler', () => {
  it('etiketler izinli kumededir; kurum/kisi/UUID/e-posta/telefon icermez', async () => {
    const { m, topla, kapat } = kur();
    m.httpIstek('get', '/v1/dersler/:id', 200, 0.02);
    m.httpIstek('post', undefined, 503, 0.5);
    m.tuketici('medya.baglama', 'basarili');
    m.dlq('medya.baglama', 'gecersiz_yuk');
    m.isCalisti('gonderim-isle', true, 0.1);
    m.iptalKontrolAtlandi();
    m.bildirimGonderim('basarisiz', 2);
    m.abonelikAlarm('cift_kanal');
    m.outboxDurumuGuncelle({ bekleyen: 3, enEskiYasSn: 12 });
    m.dbHavuzuIzle('uygulama', {
      stats: { connections: 2, leased: 1, waiting: 0 },
      options: { max: 10 },
    });
    const metrikler = await topla();
    const adlar = metrikler.map((x) => x.descriptor.name);
    for (const beklenen of [
      'kopru_http_istek_suresi',
      'kopru_http_5xx',
      'kopru_tuketici_islenen',
      'kopru_tuketici_dlq',
      'kopru_is_calisma',
      'kopru_is_son_basarili_zaman',
      'kopru_outbox_bekleyen',
      'kopru_outbox_en_eski_yas',
      'kopru_db_havuz_baglanti',
      'kopru_db_havuz_azami',
    ]) {
      expect(adlar).toContain(beklenen);
    }
    const yasak = /[0-9a-f]{8}-[0-9a-f]{4}-|@|\+?\d{10,}/i;
    for (const metrik of metrikler) {
      for (const nokta of metrik.dataPoints) {
        for (const [anahtar, deger] of Object.entries(nokta.attributes)) {
          expect(IZINLI_ETIKETLER.has(anahtar), `${metrik.descriptor.name}.${anahtar}`).toBe(true);
          expect(String(deger)).not.toMatch(yasak);
        }
      }
    }
    for (const yasakAnahtar of ['kurum_id', 'kurumId', 'kullanici_id', 'istek_id', 'url']) {
      expect(IZINLI_ETIKETLER.has(yasakAnahtar)).toBe(false);
    }
    const rotalar = metrikler
      .find((x) => x.descriptor.name === 'kopru_http_5xx')
      ?.dataPoints.map((n) => n.attributes.rota);
    expect(rotalar).toEqual(['bilinmeyen']);
    await kapat();
  });

  it('isiOlc basari/hata sayar, hatayi yeniden firlatir, son basarili zamani tutar', async () => {
    const { m, topla, kapat } = kur(() => 5_000_000);
    await m.isiOlc('is-a', () => Promise.resolve(1));
    await expect(m.isiOlc('is-b', () => Promise.reject(new Error('x')))).rejects.toThrow('x');
    const metrikler = await topla();
    const calisma = metrikler.find((x) => x.descriptor.name === 'kopru_is_calisma');
    const sonuclar = calisma?.dataPoints.map(
      (n) => `${String(n.attributes.is)}:${String(n.attributes.sonuc)}`,
    );
    expect(sonuclar?.sort()).toEqual(['is-a:basarili', 'is-b:hata']);
    const son = metrikler.find((x) => x.descriptor.name === 'kopru_is_son_basarili_zaman');
    expect(son?.dataPoints).toHaveLength(1);
    expect(son?.dataPoints[0]?.value).toBe(5000);
    expect(son?.dataPoints[0]?.attributes.is).toBe('is-a');
    await kapat();
  });
});
