# İşletim el kitabı

Bu belge nöbetçinin "alarm çaldı, şimdi ne yapacağım" sorusunun cevabıdır. Mimari için [ADR 0005](../adr/0005-dagitim-ve-altyapi.md), olaylar için [ADR 0002](../adr/0002-olay-sozlesmesi-outbox-idempotent-tuketici.md), kimlik için [ADR 0004](../adr/0004-kimlik-dogrulama-ve-yetkilendirme.md) ve [ADR 0008](../adr/0008-erisim-belirteci-iptali-sid-listesi.md). Dağıtım adımları için `docs/isletim/dagitim.md` (ayrı paket).

> Barındırma sağlayıcısı henüz seçilmedi. `<...>` ile yazılan her şey yer tutucudur; gerçek adres, hesap ve sırlar bu belgeye yazılmaz (sır yöneticisinde tutulur).

## Gözlem yığını nerede

| Ne                              | Yerel                                                                   | Üretim (yer tutucu)                                        |
| ------------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------- |
| Pano ve alarm arayüzü (Grafana) | <http://localhost:3030> (`pnpm infra:up`, otel-lgtm)                    | `<grafana-adresi>`                                         |
| Metrikler (Prometheus)          | otel-lgtm içinde (OTLP: 4318)                                           | `<prometheus-adresi>`                                      |
| Günlükler (Loki)                | servis çıktısı (stdout, JSON)                                           | `<loki-adresi>`                                            |
| Alarm kuralları                 | `infra/gozlem/alarmlar/alarmlar.yaml`                                   | Prometheus `rule_files`                                    |
| Panolar                         | `infra/gozlem/panolar/*.json` (üreteç: `infra/gozlem/uret-panolar.mjs`) | Grafana provisioning (`infra/gozlem/grafana/panolar.yaml`) |

- Servisler OTLP ile metrik yollar: `OTEL_EXPORTER_OTLP_ENDPOINT` tanımlıysa (varsayılan aralık 15 sn, `OTEL_METRIC_EXPORT_INTERVAL` ile değişir). `service_name` etiketi `api`, `bildirim`, `motivasyon`, `medya` ve worker süreçleri için `<ad>-worker`.
- Panoları yerele yükle: `infra/gozlem/scripts/panolari-yukle.sh`. Alarm kurallarını doğrula: `infra/gozlem/scripts/alarmlari-dogrula.sh` (promtool). Sahte yükle deneme: `node infra/gozlem/scripts/metrik-denemesi.mjs`.
- Ekran görüntüleri: `docs/isletim/ekranlar/pano-*.jpg`.
- Günlük satırları JSON'dur; her istek satırında `korelasyon_id` vardır. Bir şikâyeti izlemek için istemcinin `x-correlation-id` başlığını (yanıtta da döner) günlükte ara. Telefon, e-posta, ad, OTP, belirteç ve parola günlüğe girmez (redaksiyon: `packages/service-kit/src/logger.ts`).

### Metrik sözlüğü (tüm servislerde ortak, `packages/service-kit/src/metrikler.ts`)

| Metrik (Prometheus adı)                                                                    | Etiketler                                               | Anlamı                                                          |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------- | --------------------------------------------------------------- |
| `kopru_http_istek_suresi_seconds_*`                                                        | `yontem`, `rota` (şablon), `durum_sinifi`               | HTTP istek süresi histogramı                                    |
| `kopru_http_5xx_total`                                                                     | `yontem`, `rota`                                        | 5xx sayacı                                                      |
| `kopru_outbox_bekleyen`, `kopru_outbox_en_eski_yas_seconds`                                | -                                                       | Gönderilmemiş outbox satırı ve en eskisinin yaşı (15 sn'de bir) |
| `kopru_tuketici_islenen_total`                                                             | `tuketici`, `sonuc` (basarili/tekrar/yeniden_dene/hata) | Tüketici işlenen mesajlar                                       |
| `kopru_tuketici_dlq_total`                                                                 | `tuketici`, `neden`                                     | DLQ'ya yazılan olaylar                                          |
| `kopru_is_calisma_total`, `kopru_is_sure_seconds_*`, `kopru_is_son_basarili_zaman_seconds` | `is`, `sonuc`                                           | Worker zamanlayıcı işleri                                       |
| `kopru_db_havuz_{baglanti,kullanimda,bekleyen,azami}`                                      | `havuz` (uygulama/sistem)                               | postgres.js havuzu                                              |
| `kopru_iptal_kontrol_atlandi_total`                                                        | -                                                       | İptal listesi kontrolü atlandı (fail-open)                      |
| `kopru_bildirim_gonderim_total`                                                            | `sonuc`                                                 | Push gönderim sonuçları                                         |
| `kopru_abonelik_alarm_total`                                                               | `tur`                                                   | Ödeme/fatura alarm olayları                                     |

Kurum, kişi, istek kimliği, ham URL etiket **olamaz** (kart sayısı + KVKK); test: `metrikler.test.ts`. Platform sistem sağlığı ekranındaki 5xx oranı hâlâ api süreç içi sayaçtır (`HataSayaci`); kalıcı ve çok kopyalı görünüm için Grafana kullanılır.

## Olay müdahale akışı

1. **Karşıla (5 dk).** Alarmı kabul et, olay kanalında "bakıyorum" yaz. Şiddet: _kritik_ = hizmet kesintisi/veri/para/güvenlik riski; _uyarı_ = bozulma, iş saatinde.
2. **Etkiyi belirle.** Servis genel panosu: hangi servis, hangi rota, ne zamandan beri? Etkilenen kurum sayısı için günlükte `kurumId` alanına bak (metriklerde yoktur). Sağlık: `GET /health`, `GET /ready` (hangi bağımlılık `hata`).
3. **Hafiflet önce, kök nedeni sonra.** Son dağıtım şüpheliyse geri al (`docs/isletim/dagitim.md`); bağımlılık (DB/NATS) sorunuysa onu düzelt. Kök neden analizi hizmet döndükten sonra.
4. **İlet.** Kritikte 30 dakikada bir durum notu. Kurumları ilgilendiriyorsa platform panelinden bakım mesajı yayınla (Admin > Bakım mesajları).
5. **Kapat.** Alarm temizlendi + metrikler normal + sorun kaydı. 3 iş günü içinde kısa olay sonrası yazısı (ne oldu, etki, neden, ne yapıyoruz; suçlayıcı değil).
6. **Veri/güvenlik şüphesi varsa** hemen "KVKK veri ihlali" bölümüne geç; saat başlar.

## Alarm bölümleri

Her alarmın `runbook` bağlantısı buradaki başlıklara gider. Eşik gerekçeleri `alarmlar.yaml`'dadır.

### Alarm: KopruP95GecikmeYuksek

(`KopruP95GecikmeYuksek` uyarı >1 sn/10 dk, `KopruP95GecikmeKritik` >3 sn/5 dk)

- **Ne demek.** İstek sürelerinin %95'i eşiği aşıyor; kullanıcı yavaşlık hissediyor.
- **İlk bak.** Servis genel panosu "En yavaş rotalar (p95)"; veritabanı panosu havuz doluluğu; `kopru_db_havuz_bekleyen`.
- **Olası nedenler.** Yavaş sorgu/eksik indeks (yeni dağıtım?), havuz tükenmesi, DB/NATS gecikmesi, tek rota yük altında, sunucu CPU/bellek.
- **Düzelt.** Tek rota ise o rotanın sorgusunu `EXPLAIN` ile incele; son dağıtımı geri al; havuz doluysa `DATABASE_POOL_MAX` yükselt (DB `max_connections` payını kontrol et) ve ölçekle; geçici yükte worker/replica ekle.

### Alarm: Kopru5xxOraniYuksek

(`Kopru5xxOraniYuksek` %2/5 dk, `Kopru5xxOraniKritik` %10/3 dk)

- **Ne demek.** Sunucu hatası oranı yüksek. Hatalar `errorHandler` ile `{kod, mesaj}` döner; ayrıntı günlükte.
- **İlk bak.** "5xx veren rotalar" paneli; günlükte `level:50` satırları (`korelasyon_id` ile izle); `/ready` çıktısı.
- **Olası nedenler.** Bozuk dağıtım, DB/NATS erişilemez, harici bağımlılık (iyzico, RevenueCat, Expo push, S3), migrasyon uyumsuzluğu (expand/contract ihlali).
- **Düzelt.** Dağıtımla başladıysa geri al. DB/NATS ise ilgili bölüme. Tek rota ve dış bağımlılık ise devre dışı bırakma/özellik bayrağı (platform > kurum > beta bayrakları) ve sağlayıcı durum sayfası.

### Alarm: KopruDlqyeOlayDustu

(`KopruDlqyeOlayDustu`, `KopruDlqToplu`, `KopruDlqStreamDolu`, `KopruTuketiciHataOrani`)

- **Ne demek.** Bir tüketici bir olayı 8 denemeye rağmen işleyemedi (ya da kalıcı hata/şema uyuşmazlığı) ve olay `DLQ` stream'ine yazıldı (30 gün saklanır). Veri tutarsızlığı (örn. bildirim gitmedi, XP işlenmedi) olabilir.
- **İlk bak.** Outbox/DLQ panosu "DLQ'ya düşen olaylar (neden)": `tuketici` ve `neden` (`gecersiz_yuk`, `kalici_hata`, `teslim_siniri_asildi`, `bilinmeyen_konu_veya_surum`). Mesajın kendisi ve başlıkları (`Kopru-Hata`, `Kopru-Konu`) için aşağıdaki "DLQ'daki olayı yeniden oynatma" bölümü.
- **Olası nedenler.** `gecersiz_yuk`: yayıncı ile tüketici şema sürümü uyumsuz (kısmi dağıtım?). `teslim_siniri_asildi`: bağımlı veri (üyelik kopyası) hiç gelmedi ya da işleyici hatası. `bilinmeyen_konu_veya_surum`: yeni sürüm olay, tüketici henüz güncel değil.
- **Düzelt.** Nedeni gider (tüketiciyi dağıt, eksik kopyayı "hesap olaylarını yeniden yayımla" ile doldur), sonra olayı yeniden oynat. Tek seferlik/önemsiz olay ise nedenini not edip bırak (30 gün sonra düşer).

### Alarm: KopruOutboxGecikmesi

(`KopruOutboxGecikmesi` 2 dk, `KopruOutboxGecikmesiKritik` 10 dk, `KopruOutboxBirikiyor` 1000 satır)

- **Ne demek.** Outbox'a yazılmış olaylar JetStream'e gidemiyor: olaylar (bildirim, XP, medya kopyası) gecikiyor. İş verisi güvende (olay aynı işlemde yazıldı), yalnız akış durmuş.
- **İlk bak.** Worker süreci çalışıyor mu (`<servis>-worker` metrikleri geliyor mu)? Günlükte `outbox relay turu başarısız` / `outbox yayını başarısız`. NATS sağlığı: `GET http://<nats>:8222/healthz`; `/ready` içinde `nats`.
- **Olası nedenler.** Worker çökmüş/yeniden başlıyor, NATS erişilemez/disk dolu, outbox tablosu migrasyonu eksik, DB kilidi, `api_sistem` bağlantısı yok.
- **Düzelt.** Worker'ı yeniden başlat (`kamal app boot --roles worker`, bkz. dağıtım belgesi). NATS'ı onar (aşağıda). Bekleyen satırlar kendiliğinden akar (relay `msgID` ile çift göndermez). Satırlara bakmak: `select count(*), min(created_at), max(attempts), max(last_error) from <şema>.outbox where sent_at is null;` (api için `ortak.outbox`).

### Alarm: KopruWorkerMetrigiYok

- **Ne demek.** Bir servisin outbox metriği 10 dakikadır gelmiyor: worker süreci yok ya da telemetri kopuk.
- **İlk bak.** Sunucuda `kamal app details --roles worker`; konteyner günlüğü; `OTEL_EXPORTER_OTLP_ENDPOINT` ve toplayıcıya ağ erişimi.
- **Düzelt.** Süreci başlat; toplayıcı sorunuysa gözlem yığınını onar (iş verisi etkilenmez ama alarmlar kördür; en kısa sürede çöz).

### Alarm: KopruIsBasarisiz

(`KopruIsBasarisiz`, `KopruIsGecikti15dk`, `KopruIsGecikti3sa`, `KopruIsGecikti30sa`)

- **Ne demek.** Bir zamanlayıcı işi (örn. `gonderim-isle`, `abonelik-odeme`, `finans-gece`, `ders-saatlik`) tekrar tekrar hata veriyor ya da beklenenden uzun süredir başarılı çalışmadı. Hata işi durdurmaz; sonraki tur yeniden dener.
- **İlk bak.** Worker işleri panosu; günlükte `zamanlanmış iş başarısız` / `*_hatasi` satırı ve `is` alanı.
- **Olası nedenler.** DB bağlantısı, kilit çakışması, bozuk veri satırı (aynı satırda takılıyor), harici sağlayıcı kesintisi, worker durmuş.
- **Düzelt.** Hata mesajına göre; bozuk satırı onar ve işin bir sonraki turu toparlar (işler idempotenttir). `finans-gece`/`ders-saatlik` kaçırıldıysa worker'ı yeniden başlatmak işi açılışta tekrar dener.

### Alarm: KopruIptalKontrolAtlandi

(`KopruIptalKontrolAtlandi` uyarı, `KopruIptalKontrolAtlandiSuruyor` kritik 15 dk)

- **Ne demek (ADR 0008).** Servis NATS KV `iptal` kovasına ulaşamadı ve kontrolü **atladı (fail-open)**: çıkış yapılmış/iptal edilmiş oturumların erişim belirteçleri (en çok 15 dk ömürlü) geçici olarak geçerli sayılıyor. Güvenlik riski; hizmet kesilmediği için "sessiz" bir bozulmadır.
- **İlk bak.** Günlükte `iptal listesine ulaşılamadı: kontrol atlandı` ve `err`. NATS sağlığı ve KV: `nats kv status iptal` (varsa `nats` CLI).
- **Olası nedenler.** NATS düğümü kapalı/yeniden başlıyor, ağ, JetStream disk dolu, kova silinmiş/yeniden yaratılmamış.
- **Düzelt.** NATS'ı onar. Kova yoksa servis yeniden başlatılınca yaratılır. Sorun uzun sürecekse ve hesap ele geçirilmesi şüphesi varsa ilgili kullanıcının oturumlarını `hesap.oturumlar`'dan sil ve gerekirse JWKS anahtarını döndür (sır döndürme bölümü). Süre ve etkilenen servisler olay kaydına yazılır.

### Alarm: KopruBildirimGonderimHatasi

- **Ne demek.** Push gönderimlerinin %10'dan fazlası başarısız (en az 30 gönderim/15 dk). Cihaz jetonu geçersizliği (DeviceNotRegistered) normal bir tabandır; eşik üstü sağlayıcı/anahtar sorunudur.
- **İlk bak.** Servis genel panosu "Push gönderim sonucu"; `bildirim.gonderimler` tablosunda `hata_kodu` dağılımı: `select hata_kodu, count(*) from bildirim.gonderimler where durum='basarisiz' and zamanlanan_at > now() - interval '1 hour' group by 1 order by 2 desc;`.
- **Olası nedenler.** Expo erişim belirteci geçersiz/döndürülmüş (`BILDIRIM_EXPO_ERISIM_BELIRTECI`), Expo/APNs/FCM kesintisi, `BILDIRIM_PUSH_SAGLAYICI=log` kalmış (gönderim "başarılı" görünür ama gitmez — bu alarm çalmaz; üretimde ortam değişkenini kontrol et), ağ çıkışı engelli.
- **Düzelt.** Belirteci/anahtarı yenile (sır döndürme), sağlayıcı durumunu bekle. Geçici hatalar 1/5/30/120 dk geri çekilmeyle 5 denemede yeniden denenir; 12 saatten eski bildirimler `bayat` atlanır.

### Alarm: KopruOdemeOlayIslenemiyor

(`KopruOdemeOlayIslenemiyor` kritik, `KopruWebhookImzaHatasi` uyarı)

- **Ne demek.** Ödeme sağlayıcısından (iyzico, RevenueCat) gelen bir olay deneme sınırını aştı (`abonelik_olay_isleme_alarm`) ya da webhook anında işlenemedi: kullanıcı ödeme yapmış ama abonelik güncellenmemiş olabilir. `webhook_imza`: gelen webhook'un imzası geçersiz (yanlış sır ya da sahte istek).
- **İlk bak.** Günlükte `abonelik_olay_isleme_alarm` (`olayId`, `kaynak`, `tur`, `hata`). Tablo: `select id, kaynak, tur, durum, deneme_sayisi, hata from abonelik.abonelik_olaylari where durum = 'hata' order by created_at desc limit 20;` (tablo adını `services/api/src/db/schema.ts`'te doğrula).
- **Olası nedenler.** Beklenmeyen olay biçimi, eşleşmeyen plan kodu (`IYZICO_PLAN_KODLARI`/mağaza ürün kodları), kanal kapalı (`kanal kapalı`), DB hatası. İmza hatasında: sır yanlış/döndürülmüş (`REVENUECAT_WEBHOOK_SIRRI`, iyzico anahtarları).
- **Düzelt.** Nedeni gider, olayın `durum`/`deneme_sayisi`'nı sıfırlayıp (`durum='alindi', deneme_sayisi=0`) bir sonraki 5 sn'lik tur işlesin; para alındıysa sağlayıcı panelinden ödemeyi doğrula. İmza alarmında sağlayıcı panelindeki gizli anahtarı ve ortam değişkenini eşitle.

### Alarm: KopruOdemeCiftKanal

- **Ne demek.** Kurumun başka kanalda (mağaza/kurumsal) etkin ücretli aboneliği varken ikinci bir kanalda ödeme alındı: abonelik açılmadı, ödeme `yoksayildi (cift_kanal)`; **kullanıcıya iade gerekebilir** (denetim kaydı `sistem.abonelik_cift_kanal`).
- **İlk bak.** Günlük `abonelik_cift_kanal_alarm` (`olayId`, `kaynak`, `kurumId`, `disIslemId`); platform paneli > kurum detayı > abonelik.
- **Düzelt.** Doğru kanalı belirle, gerekirse sağlayıcı panelinden iadeyi başlat (iyzico) ya da kullanıcıdan mağaza aboneliğini iptal etmesini iste. Müşteriyi bilgilendir; olayı kapat.

### Alarm: KopruFaturaHata

- **Ne demek.** e-Arşiv fatura deneme sınırı aşıldı (`durum='hata'`) ya da ödeme alındı ama fatura bilgisi yok: yasal fatura kesilemedi.
- **İlk bak.** Günlük `abonelik_fatura_alarm` / `abonelik_fatura_bilgisi_yok_alarm`; `select id, kurum_id, durum, deneme_sayisi, hata from abonelik.faturalar where durum='hata';` (şema adını doğrula).
- **Düzelt.** Entegratör erişimini/bilgi eksikliğini gider; faturayı `bekliyor` durumuna alıp (`deneme_sayisi=0`) işin yeniden denemesini bekle. Fatura bilgisi eksikse kurum sahibinden iste.

### Alarm: KopruDbHavuzuDoluyor

- **Ne demek.** Uygulama bağlantı havuzunun %90'ından fazlası meşgul ve bekleyen sorgu var.
- **İlk bak.** Veritabanı panosu; DB'de `select state, count(*) from pg_stat_activity where datname = '<db>' group by 1;` ve uzun işlemler: `select pid, now() - xact_start, state, left(query, 80) from pg_stat_activity where xact_start is not null order by 2 desc limit 10;`.
- **Olası nedenler.** Yavaş sorgu, "idle in transaction", yük artışı, havuz küçük.
- **Düzelt.** Takılan işlemi sonlandır (`pg_terminate_backend`), yavaş sorguyu çöz, `DATABASE_POOL_MAX` artır.

### Alarm: KopruDiskDoluyor

(`KopruDiskDoluyor` <%15, `KopruDiskKritik` <%8, `KopruDiskDolacak`, `KopruWalBirikiyor`, `KopruWalArsivHatasi`)

- **Ne demek.** Veritabanı diski doluyor. PostgreSQL disk dolunca yazmayı durdurur (hizmet kesintisi). WAL birikmesi genelde arşivleme (pgBackRest) hatası ya da geride kalmış replika yuvasıdır.
- **İlk bak.** `df -h`; `du -sh /var/lib/postgresql/17/main/pg_wal`; `select * from pg_stat_archiver;` (`failed_count`, `last_failed_wal`); `select slot_name, active, pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn)) from pg_replication_slots;`; `pgbackrest --stanza=kopru check`.
- **Olası nedenler.** Yedek deposuna ulaşılamıyor (ağ/anahtar/depo dolu), etkin olmayan replikasyon yuvası WAL tutuyor, büyük toplu yazma, tablo şişmesi (bloat), günlük dosyaları.
- **Düzelt.** Arşivleme: depoya erişimi/anahtarı düzelt (WAL kendiliğinden gider). Ölü yuva: `select pg_drop_replication_slot('<ad>')` (replikayı yeniden kurmak gerekebilir). Acil yer: eski günlükleri/yedekleri temizle, **`pg_wal` dosyalarını elle silme**. Kalıcı: disk büyüt.

### Alarm: KopruYedekYasli

(`KopruYedekYasli` >26 sa, `KopruYedekMetrigiYok`)

- **Ne demek.** Son başarılı günlük tam yedek 26 saatten eski ya da yedek metriği gelmiyor. Felaket durumunda kayıp artar (RPO).
- **İlk bak.** `pgbackrest --stanza=kopru info`; `/var/log/pgbackrest/`; zamanlayıcı (cron/systemd timer) ve `infra/postgres/pgbackrest/yedek.sh` çıktısı; depo erişimi.
- **Düzelt.** Nedeni gider, `yedek.sh tam` ile elle yedek al. Şifre (`cipher_pass`) ya da S3 anahtarı döndürüldüyse yapılandırmayı güncelle.

## NATS (JetStream) onarım notları

- Başlangıçta tek düğüm (ADR 0005). Sağlık: `:8222/healthz`; veri `-sd` dizininde (dosya depolama).
- Düğüm yeniden başlarsa tüketiciler yeniden bağlanır; outbox'taki yayımlanmamış olaylar kaybolmaz. Stream içindeki olaylar için disk yedeği gerekir (aşağıdaki yedek stratejisi).
- Stream/tüketici kaybı: `EVENTS` ve `DLQ` stream'leri servisler açılırken yeniden yaratılır (`ensureEventStream`/`ensureDlqStream`), durable tüketiciler `startConsumer` ile yeniden yaratılır ve **başlangıçta tüm geçmişi** (`DeliverPolicy.All`) alır; işlenmiş olaylar `processed_events` ile elenir (idempotent). Stream'deki olaylar yoksa ve kopyalar boşsa "hesap olaylarını yeniden yayımla" ile mevcut durum yeniden üretilir.

## DLQ'daki olayı yeniden oynatma

DLQ'ya yalnız _işlenemeyen_ olaylar düşer; önce nedeni gider, sonra yeniden oynat.

1. **Olayı bul.** `dlq.<tüketici>.<konu>` konusunda (stream `DLQ`):
   ```sh
   nats stream view DLQ                       # son mesajlar, başlıklar: Kopru-Tuketici, Kopru-Neden, Kopru-Hata
   nats stream get DLQ --seq <n>              # tek mesaj: gövde = olay zarfı
   ```
2. **Neden `bilinmeyen_konu_veya_surum` / `gecersiz_yuk` ise** tüketiciyi/yayıncıyı uyumlu sürüme getir; zarfı elle düzeltmek gerekmez, orijinal olay aynen yeniden yayınlanır.
3. **Yeniden oynat (olay kimliğiyle).** Orijinal olayı yeniden yayınla; tüketiciler `processed_events` ile zaten işlenmişleri atlar, DLQ'ya düşenler (işlenmemiş) işlenir:
   ```sh
   nats stream get DLQ --seq <n> --raw > olay.json
   nats pub evt.<tur>.<surum> "$(cat olay.json)" --header Nats-Msg-Id:<yeni-benzersiz-kimlik>
   ```
   `Nats-Msg-Id`'yi **yeni** bir değer yap: JetStream yinelenen-pencere (duplicate window) özgün kimliği 2 dk içinde eler. `evt.<tur>.<surum>` konusu DLQ başlığındaki `Kopru-Konu` değeridir. Yeniden yayın tüketici adına göre tüm tüketicilere gider; diğerleri `processed_events` ile atlar.
4. **Toplu/kopya durumları için (hesap verisi).** Tüketicinin `hesap` kopyaları boşsa ya da bozuksa olayları tek tek oynatmak yerine kaynağı yeniden yayımla (`olaylari-yeniden-yayimla` CLI'ı, ADR 0002 "yeniden yayımlama"):
   ```sh
   export API_DATABASE_SISTEM_URL=postgres://api_sistem:<sır>@<db-adresi>:5432/api   # BYPASSRLS rolü
   pnpm --filter @kopru/api olaylari-yeniden-yayimla -- --kapsam hesap --kuru                 # yalnız sayar
   pnpm --filter @kopru/api olaylari-yeniden-yayimla -- --kapsam hesap --kurum <uuid>         # tek kurum
   pnpm --filter @kopru/api olaylari-yeniden-yayimla -- --kapsam hesap                        # tümü
   ```
   Olaylar outbox'a yazılır, api worker'ının relay'i yayımlar (`actor.id = 'olay-yeniden-yayimla'`, `correlationId = 'yeniden-yayimla:<id>'`). Komut tekrar çalıştırılabilir; hata alan kurum raporlanır ve çıkış kodu 1 olur. Şimdilik yalnız `--kapsam hesap` desteklenir.
5. **Doğrula.** DLQ alarmı sönüyor mu, tüketici `basarili` sayacı artıyor mu (Outbox/DLQ panosu), ilgili kayıt oluştu mu.
6. Yeniden oynatma sonrası DLQ kaydı 30 gün sonra kendiliğinden düşer; elle silmek gerekmez.

> Not: `nats` CLI komutlarının bayrakları sürüme göre değişebilir; ilk gerçek olayda `nats stream get --help` ile doğrula ve bu bölümü güncelle.

## Bir kurumu askıya alma ve taklit (platform paneli)

Yalnız platform ekibi (`apps/admin`; IP izin listesi `API_PLATFORM_IP_IZINLI`, `plat` rolü, zorunlu TOTP 2FA). Her işlem `hesap.denetim_kayitlari`na yazılır.

- **Askıya alma.** Admin > Kurumlar > kurum detayı > "Platform askısı" (neden yaz). Kurum kullanıcıları `403 kurum_askida` alır; ödeme/abonelik kaldırılmaz. Geri alma aynı yerden. Hesap askıya almada oturumlar iptal listesine (`iptal`) yazılır; erişim belirteçleri hemen düşer (ADR 0008).
- **Taklit.** Admin > Kurumlar > kurum detayı > "Taklit et" (yalnız destek/yönetici, gerekçe ister). 15 dakika, yenilenemez, **salt okunur** (yazma `403 taklit_salt_okunur`; DB işlemi `READ ONLY`), IP kısıtlı, her istek denetlenir. Müşteri şikâyetini yeniden üretmek için kullan; veri değiştirme gerekiyorsa müşteriden izin al ve yetkili yoldan yap.
- **Abonelik düzeltme** (kurumsal aktivasyon, deneme uzat, ek süre, plan değiştir, iptal, askıya al) aynı sayfadadır.
- Yönetici ekleme (CLI): `pnpm --filter @kopru/api platform:yonetici-ekle -- <telefon|eposta> [--rol destek|yonetici] [--2fa-sifirla]`.

## Veritabanı geri yükleme

Hedefler: **RPO ≤ ~1 dk** (WAL arşivi `archive_timeout=60s`), **RTO**: yeni sunucuda geri yükleme süresi + uygulamaların yönlendirilmesi; kendi deneyimimiz için bkz. tatbikat sonuçları (aşağıda). Yedekler: günlük tam + sürekli WAL arşivi, 14 gün saklama, Türkiye içi **ikinci veri merkezindeki** S3 deposu, istemci tarafı şifreli (`infra/postgres/pgbackrest/`).

**Ne zaman:** veri bozulması/yanlış silme (PITR), birincil sunucu kaybı (replika terfi etmiyorsa), felaket.

1. Olayı ilan et; **yazmayı durdur** (kamal ile `web`/`worker` rollerini durdur ya da bakım mesajı + trafik kesme) ki yeni yazılar kaybolmasın/çakışmasın.
2. Hedef zamanı belirle (yanlış işlemden hemen önce, `Europe/Istanbul` saati ve UTC'yi karıştırma): önce `pgbackrest --stanza=kopru info` ile mevcut yedek ve WAL aralığı.
3. Temiz bir sunucuda (ya da durdurulmuş veri dizini) PostgreSQL 17 ve pgBackRest kur, `/etc/pgbackrest/pgbackrest.conf`'u yer tutucuları doldurarak yerleştir (sırlar sır yöneticisinden). PostgreSQL'i **başlatma**.
4. Geri yükle: `infra/postgres/pgbackrest/geri-yukle.sh son` (en yeniye) ya da `geri-yukle.sh zaman "2026-11-19 14:05:00+03"` (PITR). `target-action=pause` ile açılır; kayıt sayılarını ve kritik tabloları doğrula, sonra `select pg_wal_replay_resume();` ile yükselt.
5. Uygulamaları yeni DB adresine yönlendir (Kamal env), `DATABASE_URL` + `DATABASE_SISTEM_URL`; `/ready` yeşil olmalı. Outbox'ta bekleyenler akar; stream tarafında gerekirse "hesap olaylarını yeniden yayımla".
6. Yeni birincil için replikayı yeniden kur, tam yedek al (`yedek.sh tam`), yedek yaşı alarmının söndüğünü gör.
7. Olay sonrası yazısı: kayıp veri aralığı (RPO gerçekleşen), süre (RTO gerçekleşen).

### Geri yükleme tatbikatı (çeyrekte bir ve büyük PostgreSQL değişikliklerinde)

`infra/scripts/geri-yukleme-tatbikati.sh [mantiksal|fiziksel|hepsi]`: çalışan PostgreSQL'den `pg_dump -Fc` (+ roller) ve `pg_basebackup` ile yedek alır, **ayrı geçici konteynere** geri yükler, tablo satır sayıları (kaynağın yedek öncesi/sonrası arasında), RLS politika sayısı ve rol sayısını doğrular; süreleri yazar; kaynağa dokunmaz, kendi konteyner ve hacmini siler. Çıkış kodu 0 = başarılı. Üretimde aynı doğrulama pgBackRest geri yüklemesiyle (yeni VM'de) yapılır; sonuçlar bu tabloya eklenir.

| Tarih      | Ortam                       | Yöntem                         | Veri                                  | Yedek süresi | Geri yükleme süresi                 | Sonuç                                               |
| ---------- | --------------------------- | ------------------------------ | ------------------------------------- | ------------ | ----------------------------------- | --------------------------------------------------- |
| 2026-11-19 | yerel (Docker, postgres:17) | mantıksal (pg_dump/pg_restore) | 4 veritabanı, api'de 30 tablo, 256 KB | 2 sn         | 2 sn                                | başarılı (30 tablo, 22 RLS politikası, 17 rol eşit) |
| 2026-11-19 | yerel (Docker, postgres:17) | fiziksel (pg_basebackup)       | tüm küme, 311 MB                      | 14 sn        | 19 sn (kopyala + açılış + kurtarma) | başarılı (aynı doğrulamalar)                        |

Yerel sayılar yalnız betiğin çalıştığını gösterir; üretimdeki RTO veri boyutu ve ağa bağlıdır, ilk gerçek tatbikatta ölçülüp buraya yazılmalıdır.

## Yedekleme stratejisi (veri varlıklarına göre)

| Varlık                                       | Yöntem                                                                                                           | Sıklık / saklama                                                                   | Not                                                                                                                                                                                                                                             |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PostgreSQL (4 veritabanı)                    | pgBackRest: günlük tam + sürekli WAL arşivi (PITR)                                                               | Tam günlük 03:30, 14 gün; WAL 14 gün; yedek yaşı alarmı 26 sa                      | İkinci Türkiye veri merkezi, S3, AES-256 (kasada ayrı parola). Haftalık `pgbackrest verify`. Çeyrekte bir geri yükleme tatbikatı                                                                                                                |
| NATS JetStream (`EVENTS`, `DLQ`, KV `iptal`) | Kalıcı kaynak **değildir**: olayların kaynağı servis veritabanlarıdır (outbox + `processed_events`)              | Düğüm diski için günlük anlık görüntü (`nats stream snapshot`/disk snapshot) 7 gün | Kayıpta: servisler stream'i yeniden yaratır, tüketiciler tüm geçmişi alır; eksik kopyalar için "hesap olaylarını yeniden yayımla". KV `iptal` kayıtları 16 dk TTL'lidir, yedeklenmez (kayıp = iptal edilmiş oturum en çok 15 dk açık kalabilir) |
| Nesne depolama (S3, `medya-ozel`)            | Kova sürümleme (versioning) + başka veri merkezindeki kovaya çapraz kopya (`rclone sync`/sağlayıcı replikasyonu) | Sürekli kopya; sürümler 30 gün, silinmiş nesne 30 gün geri alınabilir              | Veritabanındaki dosya kayıtları ile nesneler birlikte tutarlı olmalı: nesne geri yüklemesinde önce nesneleri, sonra DB'yi geri yükle; `medya` servisinin yetim/eksik dosya bakımı farkı raporlar                                                |
| Sırlar / `hesap.jwks`                        | Sır yöneticisi + DB (JWKS anahtarları DB'de, yedekle birlikte gelir)                                             | DB yedeğiyle                                                                       | JWKS özel anahtarı DB'dedir: DB yedekleri **şifreli depoda** ve erişim sınırlı olmalı                                                                                                                                                           |
| Yapılandırma / kod                           | Git deposu, imaj kayıt defteri                                                                                   | Sürekli                                                                            | Sunucu "evcil hayvan" değil; Kamal ile yeniden kurulur                                                                                                                                                                                          |

## Sır döndürme

Genel kural: yeni sırrı üret, **yeni ve eski birlikte geçerliyken** dağıt, doğrula, eskisini iptal et. Sırlar sır yöneticisinde ve Kamal `secrets` üzerinden gelir; Git'e, günlüğe, sohbete yazılmaz. Döndürmeden sonra ilgili alarmların (webhook imza, gönderim hatası, 5xx) sessiz kaldığını izle.

| Sır                                                                                                   | Nasıl döndürülür                                                                                                                                                                                                                                                                                                                                                                                                                                              | Dikkat                                                                                                                                                                                                         |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **JWT imza anahtarları** (Better Auth `jwt`, EdDSA, JWKS `hesap.jwks`)                                | ADR 0004: 90 günde bir yeni anahtar yayımlanır, eskisi 30 gün daha JWKS'te kalır. Acil (sızıntı şüphesi): yeni anahtarı yayımla (api'de Better Auth anahtar döndürme), **eski anahtarı JWKS'ten hemen çıkar** (tüm erişim belirteçleri ve servis JWT'leri geçersiz olur; kullanıcılar yenileme belirteciyle sessizce yeni belirteç alır, servis çağrıları 5 dk içinde yeni anahtara geçer), `JWKS_URL` önbelleği 10 dk (bilinmeyen `kid`'de anında yenilenir) | Servislerin JWKS önbelleğini yenilemesini bekle; 401 artışı normal, 5 dk'da düşmeli. Şüphe varsa tüm oturumları sil                                                                                            |
| **Better Auth gizli anahtarı** (`BETTER_AUTH_SECRET`)                                                 | Yeni değeri ayarla, api'yi yeniden dağıt                                                                                                                                                                                                                                                                                                                                                                                                                      | Çerez/oturum imzaları geçersiz olur: tüm kullanıcılar yeniden giriş yapar (duyur)                                                                                                                              |
| **iyzico** (`IYZICO_API_KEY`, `IYZICO_SECRET_KEY`)                                                    | iyzico panelinde yeni anahtar çifti üret → sır yöneticisine yaz → api ve api-worker'ı dağıt → bir test ödemesi/sorgu → eskisini panelden devre dışı bırak                                                                                                                                                                                                                                                                                                     | Webhook imzası da aynı gizli anahtarı kullanır: geçişte kısa süre `webhook_imza` alarmı beklenebilir, dağıtım bitince söner                                                                                    |
| **RevenueCat** (`REVENUECAT_WEBHOOK_SIRRI`)                                                           | RevenueCat panelinde webhook Authorization değerini yenile → `REVENUECAT_WEBHOOK_SIRRI`'nı eşitle → dağıt                                                                                                                                                                                                                                                                                                                                                     | İki taraf aynı anda eşit olmalı; aradaki olaylar RevenueCat yeniden dener                                                                                                                                      |
| **S3 erişim anahtarı** (`S3_ACCESS_KEY_ID/SECRET`, medya; ayrıca pgBackRest deposu için ayrı anahtar) | Sağlayıcıda ikinci anahtar çifti oluştur → medya ve worker'a dağıt (ve `/etc/pgbackrest` ortamına) → yükleme/indirme dene → eski anahtarı sil                                                                                                                                                                                                                                                                                                                 | `pgbackrest check` ve `yedek.sh tam` ile yedek erişimini doğrula; **`PGBACKREST_REPO1_CIPHER_PASS` döndürülemez** (mevcut yedekler okunamaz olur): yeni parola için yeni stanza/depo ve yeni tam yedek gerekir |
| **Servis→servis ve DB rol parolaları** (`*_app`, `*_sistem`, `*_owner`)                               | Rol parolasını `alter role ... password` ile değiştir, ilgili `DATABASE_*_URL`'yi güncelle, dağıt                                                                                                                                                                                                                                                                                                                                                             | Havuzdaki açık bağlantılar eski parolayla sürer; yeniden dağıtım yeni parolaya geçirir                                                                                                                         |
| **Expo push belirteci** (`BILDIRIM_EXPO_ERISIM_BELIRTECI`)                                            | Expo panelinde yeni belirteç → dağıt → `gonderildi` sayacı                                                                                                                                                                                                                                                                                                                                                                                                    | Eski belirteci hemen iptal etme: doğrulamadan sonra                                                                                                                                                            |
| `KAYNAK_PAROLA_ANAHTARI`                                                                              | **Döndürme veri kaybettirir** (kaynak parolaları bununla şifreli): önce yeniden şifreleme göçü planlanmalı                                                                                                                                                                                                                                                                                                                                                    | ADR yazmadan değiştirme                                                                                                                                                                                        |

## KVKK veri ihlali bildirim adımları (YER TUTUCU: hukuk danışmanıyla doldurulacak)

Kişisel verinin hukuka aykırı biçimde ele geçirildiğini öğrendiğimiz andan itibaren **72 saat** içinde Kişisel Verileri Koruma Kurulu'na bildirim yükümlülüğü başlar (KVKK m.12/5). Aşağıdaki adımlar iskelettir; sorumlu kişiler, formlar ve kalıplar `<...>` ile doldurulacaktır.

1. **Tespit ve saat başlatma.** Şüphe/olay kaydı aç; "öğrenme anı"nı (tarih-saat) yaz. Sorumlu: `<işletim sorumlusu>`. Hemen `<veri sorumlusu temsilcisi>` ve `<hukuk danışmanı>`na haber ver.
2. **Sınırlama.** Erişimi kes (oturumları iptal et, anahtarları döndür, hesapları askıya al, ağ erişimini kapat); delilleri koru (günlükler, disk görüntüsü, denetim kayıtları `hesap.denetim_kayitlari`). Silme/temizleme yapma.
3. **Kapsam analizi.** Hangi veri kategorileri (kimlik, iletişim, öğrenci/eğitim, finans...), hangi kurumlar, kaç kişi, ne zaman. Kurum bazlı (kiracı) ayrım: `kurum_id`. Çocuk (küçük) verisi var mı: ağırlaştırıcı.
4. **Bildirim kararı ve süre.** Kurul'a **72 saat içinde** (gecikirse gerekçe ile). Kurul bildirim formu: `<form bağlantısı/kalıbı>`. Veri sorumlusu rolümüz (kurum veri sorumlusu, biz veri işleyen mi?) sözleşmeye göre: `<rol belirleme notu>`; veri işleyen isek **gecikmeden ilgili kuruma (veri sorumlusuna)** bildir.
5. **İlgili kişilere bildirim.** Mümkün olan en kısa sürede, açık ve sade Türkçe; ne oldu, hangi veri, olası sonuçlar, alınan önlemler, iletişim. Kanal: `<e-posta/uygulama içi/SMS kalıbı>`.
6. **Kayıt.** Her ihlal (bildirilmese bile) ihlal kayıt defterine işlenir: `<kayıt defteri konumu>`.
7. **Düzeltici faaliyet.** Kök neden, kalıcı önlem, ADR/doküman güncellemesi, gerekirse penetrasyon testi. Olay sonrası yazısı.

İlgili sistem ipuçları: kişisel veri olaylara ve push metinlerine girmez; günlükler redakte edilir; denetim kayıtları platform işlemlerini ve `iletisim.oku` çağrılarını tutar; veri Türkiye'de kalır (yedekler dahil).
