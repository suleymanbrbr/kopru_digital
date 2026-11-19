// Grafana pano JSON'larini uretir (kod olarak pano): `node infra/gozlem/uret-panolar.mjs`
// Cikti: infra/gozlem/panolar/*.json (commit edilir; elle duzenlemeyin, bu dosyayi degistirip yeniden uretin).
// Veri kaynagi `ds` degiskenidir (Prometheus); yerelde otel-lgtm, uretimde Prometheus.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const cikti = resolve(dirname(fileURLToPath(import.meta.url)), 'panolar');
mkdirSync(cikti, { recursive: true });

const DS = { type: 'prometheus', uid: '${ds}' };
const SERVIS = 'service_name=~"$servis"';

let sayac = 0;
function panel({
  baslik,
  ifadeler,
  birim = 'short',
  tur = 'timeseries',
  x,
  y,
  w = 12,
  h = 8,
  aciklama,
  esikler,
}) {
  sayac += 1;
  const hedefler = ifadeler.map((e, i) => ({
    refId: String.fromCharCode(65 + i),
    datasource: DS,
    expr: typeof e === 'string' ? e : e.ifade,
    legendFormat: typeof e === 'string' ? '' : e.ad,
    range: true,
  }));
  const p = {
    id: sayac,
    type: tur,
    title: baslik,
    description: aciklama ?? '',
    datasource: DS,
    gridPos: { x, y, w, h },
    targets: hedefler,
    fieldConfig: {
      defaults: {
        unit: birim,
        ...(esikler
          ? {
              thresholds: {
                mode: 'absolute',
                steps: [{ color: 'green', value: null }, ...esikler],
              },
              custom: { thresholdsStyle: { mode: 'line' } },
            }
          : {}),
      },
      overrides: [],
    },
    options:
      tur === 'stat'
        ? { reduceOptions: { calcs: ['lastNotNull'] }, colorMode: 'value' }
        : { legend: { displayMode: 'table', placement: 'bottom', calcs: ['lastNotNull', 'max'] } },
  };
  return p;
}

function pano({ uid, baslik, aciklama, paneller, ekDegiskenler = [] }) {
  return {
    uid,
    title: baslik,
    description: aciklama,
    tags: ['kopru', 'isletim'],
    timezone: 'Europe/Istanbul',
    schemaVersion: 39,
    version: 1,
    refresh: '30s',
    time: { from: 'now-1h', to: 'now' },
    templating: {
      list: [
        { name: 'ds', type: 'datasource', query: 'prometheus', current: {}, label: 'Veri kaynağı' },
        {
          name: 'servis',
          type: 'query',
          label: 'Servis',
          datasource: DS,
          query: {
            query: 'label_values(kopru_http_istek_suresi_seconds_count, service_name)',
            refId: 'servis',
          },
          definition: 'label_values(service_name)',
          includeAll: true,
          allValue: '.+',
          multi: true,
          current: { text: 'All', value: '$__all' },
          refresh: 2,
        },
        ...ekDegiskenler,
      ],
    },
    panels: paneller,
  };
}

function yaz(ad, nesne) {
  writeFileSync(resolve(cikti, ad), `${JSON.stringify(nesne, null, 2)}\n`);
  console.log('yazildi:', ad);
}

const HIST = 'kopru_http_istek_suresi_seconds';

// --- 1. Servis genel (RED) ----------------------------------------------------------------------------------------
sayac = 0;
yaz(
  'servis-genel.json',
  pano({
    uid: 'kopru-servis-genel',
    baslik: 'Köprü / Servis genel (RED)',
    aciklama:
      'İstek hızı, hata oranı ve gecikme. Rota şablonuyla gruplanır; kurum/kişi etiketi yoktur. Alarmlar: KopruP95Gecikme*, Kopru5xxOrani*.',
    paneller: [
      panel({
        baslik: 'İstek hızı (istek/sn)',
        x: 0,
        y: 0,
        ifadeler: [
          {
            ad: '{{service_name}}',
            ifade: `sum by (service_name) (rate(${HIST}_count{${SERVIS}}[5m]))`,
          },
        ],
        birim: 'reqps',
      }),
      panel({
        baslik: '5xx oranı',
        x: 12,
        y: 0,
        birim: 'percentunit',
        aciklama: 'Uyarı %2, kritik %10 (5 dk).',
        esikler: [
          { color: 'orange', value: 0.02 },
          { color: 'red', value: 0.1 },
        ],
        ifadeler: [
          {
            ad: '{{service_name}}',
            ifade: `sum by (service_name) (rate(kopru_http_5xx_total{${SERVIS}}[5m])) / sum by (service_name) (rate(${HIST}_count{${SERVIS}}[5m]))`,
          },
        ],
      }),
      panel({
        baslik: 'Gecikme p50 / p95 / p99',
        x: 0,
        y: 8,
        birim: 's',
        aciklama: 'p95 uyarı 1 sn, kritik 3 sn.',
        esikler: [
          { color: 'orange', value: 1 },
          { color: 'red', value: 3 },
        ],
        ifadeler: [
          {
            ad: 'p50 {{service_name}}',
            ifade: `histogram_quantile(0.5, sum by (service_name, le) (rate(${HIST}_bucket{${SERVIS}}[5m])))`,
          },
          {
            ad: 'p95 {{service_name}}',
            ifade: `histogram_quantile(0.95, sum by (service_name, le) (rate(${HIST}_bucket{${SERVIS}}[5m])))`,
          },
          {
            ad: 'p99 {{service_name}}',
            ifade: `histogram_quantile(0.99, sum by (service_name, le) (rate(${HIST}_bucket{${SERVIS}}[5m])))`,
          },
        ],
      }),
      panel({
        baslik: 'Durum sınıfına göre istek hızı',
        x: 12,
        y: 8,
        birim: 'reqps',
        ifadeler: [
          {
            ad: '{{service_name}} {{durum_sinifi}}',
            ifade: `sum by (service_name, durum_sinifi) (rate(${HIST}_count{${SERVIS}}[5m]))`,
          },
        ],
      }),
      panel({
        baslik: 'En yavaş rotalar (p95)',
        x: 0,
        y: 16,
        birim: 's',
        ifadeler: [
          {
            ad: '{{yontem}} {{rota}}',
            ifade: `topk(10, histogram_quantile(0.95, sum by (yontem, rota, le) (rate(${HIST}_bucket{${SERVIS}}[5m]))))`,
          },
        ],
      }),
      panel({
        baslik: '5xx veren rotalar',
        x: 12,
        y: 16,
        birim: 'reqps',
        ifadeler: [
          {
            ad: '{{yontem}} {{rota}}',
            ifade: `topk(10, sum by (yontem, rota) (rate(kopru_http_5xx_total{${SERVIS}}[5m])))`,
          },
        ],
      }),
      panel({
        baslik: 'İptal listesi kontrolü atlandı (fail-open)',
        x: 0,
        y: 24,
        w: 12,
        ifadeler: [
          {
            ad: '{{service_name}}',
            ifade: `sum by (service_name) (increase(kopru_iptal_kontrol_atlandi_total{${SERVIS}}[5m]))`,
          },
        ],
        aciklama:
          'ADR 0008. Sıfırdan farklı her değer güvenlik uyarısıdır (KopruIptalKontrolAtlandi).',
      }),
      panel({
        baslik: 'Push gönderim sonucu',
        x: 12,
        y: 24,
        w: 12,
        ifadeler: [
          {
            ad: '{{sonuc}}',
            ifade: 'sum by (sonuc) (increase(kopru_bildirim_gonderim_total[15m]))',
          },
        ],
        aciklama: 'Başarısız oranı %10 üstü: KopruBildirimGonderimHatasi.',
      }),
    ],
  }),
);

// --- 2. Outbox ve DLQ ---------------------------------------------------------------------------------------------
sayac = 0;
yaz(
  'outbox-dlq.json',
  pano({
    uid: 'kopru-outbox-dlq',
    baslik: 'Köprü / Outbox ve olay tüketicileri',
    aciklama:
      'Outbox gecikmesi, tüketici işlenen/hata ve DLQ sayaçları (ADR 0002). Alarmlar: KopruOutbox*, KopruDlq*.',
    paneller: [
      panel({
        baslik: 'Outbox en eski bekleyen yaş',
        x: 0,
        y: 0,
        w: 8,
        birim: 's',
        esikler: [
          { color: 'orange', value: 120 },
          { color: 'red', value: 600 },
        ],
        ifadeler: [
          {
            ad: '{{service_name}}',
            ifade: `max by (service_name) (kopru_outbox_en_eski_yas_seconds{${SERVIS}})`,
          },
        ],
        aciklama: 'Uyarı 2 dk, kritik 10 dk.',
      }),
      panel({
        baslik: 'Outbox bekleyen sayısı',
        x: 8,
        y: 0,
        w: 8,
        esikler: [{ color: 'orange', value: 1000 }],
        ifadeler: [
          {
            ad: '{{service_name}}',
            ifade: `max by (service_name) (kopru_outbox_bekleyen{${SERVIS}})`,
          },
        ],
      }),
      panel({
        baslik: 'DLQ (son 15 dk)',
        x: 16,
        y: 0,
        w: 8,
        tur: 'stat',
        esikler: [
          { color: 'orange', value: 1 },
          { color: 'red', value: 10 },
        ],
        ifadeler: [{ ad: 'DLQ', ifade: `sum(increase(kopru_tuketici_dlq_total{${SERVIS}}[15m]))` }],
      }),
      panel({
        baslik: 'Tüketici işlenen (mesaj/sn, sonuca göre)',
        x: 0,
        y: 8,
        ifadeler: [
          {
            ad: '{{service_name}} {{tuketici}} {{sonuc}}',
            ifade: `sum by (service_name, tuketici, sonuc) (rate(kopru_tuketici_islenen_total{${SERVIS}}[5m]))`,
          },
        ],
        birim: 'ops',
      }),
      panel({
        baslik: 'Tüketici hata oranı (15 dk)',
        x: 12,
        y: 8,
        birim: 'percentunit',
        esikler: [{ color: 'orange', value: 0.2 }],
        ifadeler: [
          {
            ad: '{{service_name}} {{tuketici}}',
            ifade: `sum by (service_name, tuketici) (increase(kopru_tuketici_islenen_total{${SERVIS},sonuc="hata"}[15m])) / sum by (service_name, tuketici) (increase(kopru_tuketici_islenen_total{${SERVIS}}[15m]))`,
          },
        ],
      }),
      panel({
        baslik: 'DLQ’ya düşen olaylar (neden)',
        x: 0,
        y: 16,
        ifadeler: [
          {
            ad: '{{service_name}} {{tuketici}} {{neden}}',
            ifade: `sum by (service_name, tuketici, neden) (increase(kopru_tuketici_dlq_total{${SERVIS}}[15m]))`,
          },
        ],
      }),
      panel({
        baslik: 'Ödeme/abonelik alarmları (son 1 sa)',
        x: 12,
        y: 16,
        ifadeler: [
          { ad: '{{tur}}', ifade: 'sum by (tur) (increase(kopru_abonelik_alarm_total[1h]))' },
        ],
        aciklama: 'olay_isleme/webhook_isleme/cift_kanal: kritik; fatura*: uyarı.',
      }),
    ],
  }),
);

// --- 3. Worker işleri ---------------------------------------------------------------------------------------------
sayac = 0;
yaz(
  'worker-isleri.json',
  pano({
    uid: 'kopru-worker-isleri',
    baslik: 'Köprü / Worker işleri',
    aciklama:
      'Zamanlayıcı işlerinin başarı/hata sayısı, süresi ve son başarılı çalışmadan geçen süre. Alarmlar: KopruIsBasarisiz, KopruIsGecikti*.',
    paneller: [
      panel({
        baslik: 'İş çalışmaları (sonuca göre, 30 dk)',
        x: 0,
        y: 0,
        ifadeler: [
          {
            ad: '{{service_name}} {{is}} {{sonuc}}',
            ifade: `sum by (service_name, is, sonuc) (increase(kopru_is_calisma_total{${SERVIS}}[30m]))`,
          },
        ],
      }),
      panel({
        baslik: 'Son başarılı çalışmadan geçen süre',
        x: 12,
        y: 0,
        birim: 's',
        ifadeler: [
          {
            ad: '{{service_name}} {{is}}',
            ifade: `time() - kopru_is_son_basarili_zaman_seconds{${SERVIS}}`,
          },
        ],
        aciklama:
          'Eşikler işe göredir (15 dk / 3 sa / 30 sa); ayrıntı infra/gozlem/alarmlar/alarmlar.yaml.',
      }),
      panel({
        baslik: 'İş süresi p95',
        x: 0,
        y: 8,
        birim: 's',
        ifadeler: [
          {
            ad: '{{service_name}} {{is}}',
            ifade: `histogram_quantile(0.95, sum by (service_name, is, le) (rate(kopru_is_sure_seconds_bucket{${SERVIS}}[30m])))`,
          },
        ],
      }),
      panel({
        baslik: 'Başarısız çalışma oranı',
        x: 12,
        y: 8,
        birim: 'percentunit',
        ifadeler: [
          {
            ad: '{{service_name}} {{is}}',
            ifade: `sum by (service_name, is) (increase(kopru_is_calisma_total{${SERVIS},sonuc="hata"}[30m])) / sum by (service_name, is) (increase(kopru_is_calisma_total{${SERVIS}}[30m]))`,
          },
        ],
      }),
    ],
  }),
);

// --- 4. Veritabanı ------------------------------------------------------------------------------------------------
sayac = 0;
yaz(
  'veritabani.json',
  pano({
    uid: 'kopru-veritabani',
    baslik: 'Köprü / Veritabanı bağlantı havuzu',
    aciklama:
      'Uygulama tarafı havuz kullanımı (postgres.js). Sunucu tarafı (disk, WAL, yedek yaşı) için node_exporter/postgres_exporter panoları kullanılır.',
    paneller: [
      panel({
        baslik: 'Havuz kullanımı (kullanımda / azami)',
        x: 0,
        y: 0,
        birim: 'percentunit',
        esikler: [{ color: 'orange', value: 0.9 }],
        ifadeler: [
          {
            ad: '{{service_name}} {{havuz}}',
            ifade: `kopru_db_havuz_kullanimda{${SERVIS}} / kopru_db_havuz_azami{${SERVIS}}`,
          },
        ],
      }),
      panel({
        baslik: 'Bağlantı sorgusu bekleyen',
        x: 12,
        y: 0,
        esikler: [{ color: 'orange', value: 1 }],
        ifadeler: [
          { ad: '{{service_name}} {{havuz}}', ifade: `kopru_db_havuz_bekleyen{${SERVIS}}` },
        ],
      }),
      panel({
        baslik: 'Açık bağlantı',
        x: 0,
        y: 8,
        ifadeler: [
          { ad: '{{service_name}} {{havuz}}', ifade: `kopru_db_havuz_baglanti{${SERVIS}}` },
        ],
      }),
      panel({
        baslik: 'Son başarılı tam yedekten bu yana (sunucu metriği)',
        x: 12,
        y: 8,
        birim: 's',
        esikler: [{ color: 'red', value: 93600 }],
        ifadeler: [
          {
            ad: 'tam yedek yaşı',
            ifade: 'time() - max(kopru_pgbackrest_son_basarili_yedek_zaman{tur="tam"})',
          },
        ],
        aciklama: 'yedek.sh textfile metriği; 26 saat eşiği (KopruYedekYasli).',
      }),
    ],
  }),
);
