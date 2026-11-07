# Veritabanı şema konvansiyonları

Bu doküman tüm servis şemaları için ortak kuralları tanımlar. Servis dokümanları: [api.md](api.md), [motivasyon.md](motivasyon.md), [bildirim.md](bildirim.md), [medya.md](medya.md). Olay kataloğu: [olaylar.md](olaylar.md). Kararlar: [../adr/README.md](../adr/README.md).

## İçindekiler

- Genel kurallar
- Ortak sütun profilleri
- Silme politikası
- Adlandırma
- İndeks kuralları
- RLS politika şablonu
- Roller ve yetkiler
- `ortak` şeması: yardımcı fonksiyonlar
- Outbox ve processed_events
- Sözlük

## Genel kurallar

1. PostgreSQL 17 veya üstü. Uzantılar: `btree_gist`, `citext`, `pgcrypto`, `pg_trgm`.
2. Kimlikler UUIDv7'dir. **Uygulama üretir** (`uuidv7()` kitaplığı), veritabanı `DEFAULT` vermez. Böylece kimlik, işlem öncesinde olaya ve ilişkili satırlara yazılabilir ve zamana göre sıralanır.
3. Zamanlar `timestamptz` (UTC). Yalnızca takvim günü anlamı taşıyan değerler `date`, günün saati `time` olur. Haftalar ve seri günleri `Europe/Istanbul` yerel gününe göredir. Gün hesabı sunucuda yapılır, istemci saatine güvenilmez.
4. Para: `bigint` kuruş, sütun soneki `_kurus` ([ADR 0007](../adr/0007-para-ve-defterler.md)).
5. Enum yerine `text` + `CHECK (kolon IN (...))`. Değerler Türkçe ASCII ([ADR 0006](../adr/0006-adlandirma-ve-dil-kurallari.md)).
6. Serbest metin uzunluk sınırı `CHECK (char_length(kolon) <= N)` ile belirtilir (başlıklar 200, açıklamalar 4000, notlar 2000).
7. `jsonb` yalnızca yapısı Zod şemasıyla doğrulanan, sorgulanmayan ya da nadiren sorgulanan veri için kullanılır. İlişkisel olan veri `jsonb`ye gömülmez.
8. Her migrasyon geriye uyumludur (genişlet-daralt, [ADR 0005](../adr/0005-dagitim-docker-kamal.md)).
9. Şemalar arası FK: `api` veritabanında yalnızca `hesap` çekirdeğine (`kurumlar`, `kullanicilar`, `uyelikler`, `gruplar`, `kademeler`, `subeler`) ve `ortak.bransler`e FK kurulur. Diğer modüllere ve diğer servislere başvurular FK'siz `uuid` sütunudur, uygulama doğrular.
10. Kiracı bütünlüğü: Çocuk tablo başka kiracı tablosuna başvuruyorsa ve ebeveynde `UNIQUE (kurum_id, id)` tanımlıysa FK `(kurum_id, ebeveyn_id)` bileşik olarak kurulur. Bu belgede "bileşik FK" olarak işaretlenir.

## Ortak sütun profilleri

Her tablo bölümünde "Profil" satırı aşağıdaki kodlardan birini verir. Profil sütunları tablo sütun listesine yazılmaz.

| Kod | Sütunlar | Kullanım |
| --- | --- | --- |
| `K` | `id uuid PK`, `kurum_id uuid NOT NULL`, `created_at timestamptz NOT NULL DEFAULT now()`, `updated_at timestamptz NOT NULL DEFAULT now()`, `created_by uuid NULL` | Standart kiracı tablosu. `created_by` = `hesap.kullanicilar.id` (sistem işlerinde NULL). `updated_at` tetikleyiciyle (`ortak.updated_at_ayarla`) güncellenir. |
| `KS` | `K` + `surum bigint NOT NULL DEFAULT 1` | Olay üreten ve iyimser kilit gereken kayıtlar. Her `UPDATE` `surum = surum + 1` yapar (tetikleyici). `surum` olay zarfındaki `ozne_surumu` olur. |
| `D` | `id uuid PK`, `kurum_id uuid NOT NULL`, `created_at`, `created_by` (`updated_at` yok) | Defter ve yalnızca-ekleme tabloları. `UPDATE/DELETE` engellenir. |
| `G` | `id uuid PK`, `created_at`, `updated_at` (`kurum_id` yok) | Kiracısız (global) tablolar. |
| `GS` | `G` + `surum bigint NOT NULL DEFAULT 1` | Kiracısız ve olay üreten tablolar (`kullanicilar`). |

`created_by` yabancı anahtar değildir (kullanıcı silme/anonimleştirme sırasında bağlantı kopmasın diye).

## Silme politikası

| Sınıf | Uygulama | Örnek |
| --- | --- | --- |
| Referans ve iş varlığı | Arşiv: `arsivlendi_at timestamptz NULL`. Satır silinmez, listelerde varsayılan olarak gizlenir. İndeksler `WHERE arsivlendi_at IS NULL` kısmi olabilir. | `gruplar`, `kademeler`, `subeler`, `paketler`, `ogrenme.konular` (kurum konuları) |
| Kullanıcı içeriği | Yumuşak silme: `silindi_at timestamptz NULL`, `silen_id uuid NULL`. 90 gün sonra kalıcı silme işi. | `duyurular` taslakları, `ders_kaynaklari` |
| Defter ve denetim | Silinmez, değiştirilmez. | `kredi_hareketleri`, `bakiye_hareketleri`, `rizalar`, `denetim_kayitlari` |
| Geçici/teknik | Sert silme, saklama süresi sonunda iş ile. | `outbox`, `processed_events`, `yoklama_istekleri`, `bildirimler` |
| Kişisel veri silme talebi (KVKK) | Anonimleştirme: ad/telefon/e-posta temizlenir, `kullanicilar.durum='silindi'`, `anonimlestirildi_at` dolar. İlişkili kayıtlar kimliksiz kalır. `hesap.kullanici.silindi.v1` yayımlanır, diğer servisler kopyaları temizler ve kullanıcı dosyalarını siler. | `kullanicilar` |

Yumuşak silinmiş ve arşivlenmiş satırlar benzersizlik kısıtlarında "etkin" sayılmak istenmiyorsa `UNIQUE` indeksi kısmi (`WHERE arsivlendi_at IS NULL`) tanımlanır. Her tablo bölümünde belirtilir.

## Adlandırma

| Nesne | Kural | Örnek |
| --- | --- | --- |
| Şema | modül adı | `ders` |
| Tablo | çoğul, Türkçe ASCII, `snake_case` | `yoklama_istekleri` |
| Sütun | `snake_case`; zaman `_at`, tarih `_tarihi`, tutar `_kurus`, sayı `_sayisi`, süre `_dk`/`_sn` | `baslangic_at`, `tutar_kurus` |
| Yabancı anahtar sütunu | `{tekil}_id`; rol bazlı üyelik `ogrenci_id`, `ogretmen_id`, `veli_id` (hepsi `hesap.uyelikler.id`) | `grup_id` |
| Kullanıcı (global kimlik) | `kullanici_id` = `hesap.kullanicilar.id` | `kullanici_id` |
| PK | `{tablo}_pkey` (varsayılan) | |
| FK | `{tablo}_{kolon}_fk` | `yoklamalar_ders_id_fk` |
| UNIQUE | `{tablo}_{kolonlar}_uniq` | `yoklamalar_ders_id_ogrenci_id_uniq` |
| CHECK | `{tablo}_{kural}_chk` | `dersler_zaman_chk` |
| İndeks | `{tablo}_{kolonlar}_idx` | `dersler_kurum_id_baslangic_at_idx` |
| Tetikleyici | `{tablo}_{amac}_trg` | `kredi_hareketleri_degismez_trg` |
| Okuma kopyası | `{varlik}_kopyalari`; yalnızca tüketici yazar, kaynak olay belgelenir | `uyelik_kopyalari` |
| Görünüm | `v_` öneki | `v_kredi_hareketleri_net` |

Durum sütunu her yerde `durum` adını taşır. Boolean sütunlar sıfat (`aktif`, `telafi`) ya da `_mi` ile biter, `is_` öneki kullanılmaz.

## İndeks kuralları

1. Kiracı tablolarında **ilk sütun `kurum_id`** olur (`(kurum_id, ...)`), RLS filtresiyle uyum için. İstisna: tek bir `ogrenci_id` gibi çok seçici anahtarla erişilen tablolarda `(ogrenci_id, ...)` kullanılabilir, yine de `kurum_id` filtresi ek olarak uygulanır ve belgede belirtilir.
2. Her FK sütunu bir indeksin öncü sütunu olmalıdır (silme/join maliyeti).
3. Listeleme uç noktaları için `(kurum_id, filtre, sıralama)` bileşik indeks. Sayfalama anahtar tabanlıdır (`id` UUIDv7 zaman sıralıdır): `WHERE id < :imleç ORDER BY id DESC`.
4. Etkin kayıtlar için kısmi indeks tercih edilir: `WHERE arsivlendi_at IS NULL`, `WHERE durum IN (...)`.
5. `UNIQUE` kısıtları iş kurallarını veritabanında zorlar. Bu belgede "tekillik kuralları" olarak listelenir ve idempotency'nin dayanağıdır.
6. Büyük defter ve günlük tabloları (`denetim_kayitlari`, `gonderimler`, `xp_hareketleri`) `created_at` üzerinden aylık bölümlenir (`PARTITION BY RANGE`) ve `pg_partman` ile yönetilir. İlk sürümde tek tablo olarak başlar, bölümleme eşiği 20 milyon satırdır. Bölümlü tablolarda PK `(id, created_at)` olur.
7. Metin arama gereken alanlarda `pg_trgm` GIN indeksi (`ad_arama gin_trgm_ops`).

## RLS politika şablonu

Yardımcı fonksiyonlar (`ortak` şeması, bkz. aşağıda) oturum değişkenlerini okur. Değişken yoksa `NULL` döner ve politika hiçbir satırı göstermez.

Standart kiracı tablosu:

```sql
ALTER TABLE ders.dersler ENABLE ROW LEVEL SECURITY;
ALTER TABLE ders.dersler FORCE ROW LEVEL SECURITY;

CREATE POLICY kiraci_izolasyonu ON ders.dersler
  USING      (kurum_id = ortak.aktif_kurum())
  WITH CHECK (kurum_id = ortak.aktif_kurum());
```

Kullanıcı kapsamlı ek erişim (giriş sonrası kurum seçimi için kullanıcının kendi üyelikleri, rıza kayıtları):

```sql
CREATE POLICY kiraci_izolasyonu ON hesap.uyelikler
  USING      (kurum_id = ortak.aktif_kurum() OR kullanici_id = ortak.aktif_kullanici())
  WITH CHECK (kurum_id = ortak.aktif_kurum());
```

Kiracı kökü (`hesap.kurumlar`, `id` kiracı kimliğidir):

```sql
CREATE POLICY kiraci_izolasyonu ON hesap.kurumlar
  USING (id = ortak.aktif_kurum())
  WITH CHECK (id = ortak.aktif_kurum());
```

Karma global + kiracı satırları (`ogrenme.konular`, `kurum_id IS NULL` global katalog):

```sql
CREATE POLICY okuma ON ogrenme.konular FOR SELECT
  USING (kurum_id IS NULL OR kurum_id = ortak.aktif_kurum());
CREATE POLICY yazma ON ogrenme.konular FOR ALL
  USING (kurum_id = ortak.aktif_kurum())
  WITH CHECK (kurum_id = ortak.aktif_kurum());
```

Defter tablosu (RLS + değişmezlik):

```sql
GRANT SELECT, INSERT ON finans.kredi_hareketleri TO api_app;   -- UPDATE, DELETE verilmez
CREATE TRIGGER kredi_hareketleri_degismez_trg
  BEFORE UPDATE OR DELETE ON finans.kredi_hareketleri
  FOR EACH ROW EXECUTE FUNCTION ortak.defter_degistirilemez();
```

Kiracısız tablolarda (`hesap.kullanicilar` vb.) RLS yoktur. Erişim yalnızca ilgili repository üzerinden verilir. Bu tablolar belgelerde "RLS: hayır" olarak işaretlenir ve gerekçe yazılır.

Kural: `kurum_id` sütunu olan ve "RLS: hayır" yazılmamış her tabloda `ENABLE` ve `FORCE` zorunludur. CI bunu `pg_class` üzerinden denetler.

## Roller ve yetkiler

Bkz. [ADR 0003](../adr/0003-kiraci-izolasyonu-rls.md). Her servis veritabanı için:

```sql
CREATE ROLE api_owner  NOLOGIN;                       -- migrasyonlar bağlanırken LOGIN'li bir kullanıcı bu role üye olur
CREATE ROLE api_app    LOGIN NOSUPERUSER NOBYPASSRLS; -- uygulama
CREATE ROLE api_sistem LOGIN NOSUPERUSER BYPASSRLS;   -- yalnızca withSistem()

ALTER SCHEMA ders OWNER TO api_owner;
GRANT USAGE ON SCHEMA ders TO api_app, api_sistem;
ALTER DEFAULT PRIVILEGES FOR ROLE api_owner IN SCHEMA ders
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO api_app, api_sistem;
ALTER DEFAULT PRIVILEGES FOR ROLE api_owner IN SCHEMA ders
  GRANT USAGE, SELECT ON SEQUENCES TO api_app, api_sistem;
```

Defter tablolarında `UPDATE, DELETE` yetkisi migrasyonda açıkça `REVOKE` edilir. Diğer servisler için `motivasyon_owner`, `motivasyon_app`, `motivasyon_sistem` vb. aynı biçimde.

## `ortak` şeması

Her servis veritabanında bulunur. İçerik:

```sql
CREATE SCHEMA ortak AUTHORIZATION api_owner;

CREATE FUNCTION ortak.aktif_kurum() RETURNS uuid
  LANGUAGE sql STABLE PARALLEL SAFE
  AS $$ SELECT NULLIF(current_setting('app.kurum_id', true), '')::uuid $$;

CREATE FUNCTION ortak.aktif_kullanici() RETURNS uuid
  LANGUAGE sql STABLE PARALLEL SAFE
  AS $$ SELECT NULLIF(current_setting('app.kullanici_id', true), '')::uuid $$;

CREATE FUNCTION ortak.updated_at_ayarla() RETURNS trigger
  LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

CREATE FUNCTION ortak.surum_artir() RETURNS trigger
  LANGUAGE plpgsql AS $$ BEGIN NEW.surum := OLD.surum + 1; RETURN NEW; END $$;

CREATE FUNCTION ortak.defter_degistirilemez() RETURNS trigger
  LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'defter_degistirilemez' USING ERRCODE = 'integrity_constraint_violation'; END $$;
```

`api` veritabanında ayrıca `ortak.bransler` ve `ortak.medya_dosya_kopyalari` bulunur ([api.md](api.md#ortak)).

## Outbox ve processed_events

Her servis veritabanında bulunur ([ADR 0002](../adr/0002-olay-sozlesmesi-outbox-idempotent-tuketici.md)). `ortak.outbox` kiracı tablosu değildir, RLS yoktur. Yazma uygulama kodunda `outbox.ekle(tx, olay)` ile, iş verisiyle aynı işlemde yapılır.

```sql
CREATE TABLE ortak.outbox (
  sira            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id              uuid        NOT NULL UNIQUE,               -- olay kimliği (UUIDv7)
  tur             text        NOT NULL,                      -- 'ders.yoklama.kaydedildi'
  surum           smallint    NOT NULL,                      -- yük şeması sürümü
  kurum_id        uuid        NULL,                          -- kullanıcı düzeyi olaylarda NULL
  ozne_turu       text        NULL,
  ozne_id         uuid        NULL,
  ozne_surumu     bigint      NULL,
  korelasyon_id   uuid        NULL,
  neden_id        uuid        NULL,
  aktor           jsonb       NULL,                          -- {kullanici_id, uyelik_id, rol, taklit}
  veri            jsonb       NOT NULL,
  olusma_zamani   timestamptz NOT NULL DEFAULT now(),
  yayin_zamani    timestamptz NULL,                          -- NULL = bekliyor
  deneme_sayisi   int         NOT NULL DEFAULT 0,
  son_hata        text        NULL,
  CONSTRAINT outbox_tur_chk CHECK (tur ~ '^[a-z_]+(\.[a-z_]+){2}$')
);
CREATE INDEX outbox_bekleyen_idx ON ortak.outbox (sira) WHERE yayin_zamani IS NULL;
CREATE INDEX outbox_yayin_zamani_idx ON ortak.outbox (yayin_zamani) WHERE yayin_zamani IS NOT NULL;

GRANT SELECT, INSERT ON ortak.outbox TO api_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ortak.outbox TO api_sistem;   -- relay ve temizlik işi
```

Relay sorgusu:

```sql
SELECT * FROM ortak.outbox
WHERE yayin_zamani IS NULL
ORDER BY sira
LIMIT 200
FOR UPDATE SKIP LOCKED;
```

Temizlik: `DELETE FROM ortak.outbox WHERE yayin_zamani < now() - interval '7 days'` (günlük iş).

```sql
CREATE TABLE ortak.processed_events (
  tuketici        text        NOT NULL,                      -- '{servis}.{amac}', ör. 'motivasyon.xp'
  olay_id         uuid        NOT NULL,
  islenme_zamani  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tuketici, olay_id)
);
CREATE INDEX processed_events_islenme_idx ON ortak.processed_events (islenme_zamani);

GRANT SELECT, INSERT, DELETE ON ortak.processed_events TO api_app;
```

Temizlik: `islenme_zamani < now() - interval '30 days'` (günlük iş). İşleme akışı ADR 0002'dedir.

## Sözlük

| Terim | Anlam |
| --- | --- |
| kurum | Kiracı. Bireysel öğretmen, koçluk ekibi ya da kurum. `kurumlar.tur`: `bireysel`, `ekip`, `kurum`. |
| sube | Kurumun fiziksel/idari birimi. |
| kademe | Sınıf düzeyi (ör. 8. sınıf, 12. sınıf, mezun). |
| grup | Ders alan öğrenci topluluğu. Türler: `birebir`, `grup`, `sinif`, `etut`. |
| uyelik | Kullanıcının bir kurumdaki rolü. Kiracı verisi kullanıcıya değil üyeliğe bağlanır. |
| brans | Ders branşı (matematik, fizik, ...). `ortak.bransler`. |
| konu | Müfredat konusu. |
| ders | Takvimdeki tek ders oturumu. |
| yoklama | Öğrencinin derse katılım durumu: `geldi`, `gelmedi`, `izinli`, `gec`. |
| kredi | Paketten gelen ders hakkı (adet). |
| bakiye | Öğrencinin parasal hesabı (kuruş). Negatif = borçlu. |
| tahsilat | Öğrenciden alınan ödeme. |
| odev | Öğretmenin verdiği görev. `ogrenci_odevleri` öğrenci başına satırdır. |
| deneme | Deneme sınavı sonucu. |
| soru sor | Öğrencinin fotoğraflı soru gönderip yanıt aldığı akış (`ogrenme.sorular`). |
| XP, seri, rozet | Oyunlaştırma: deneyim puanı, günlük süreklilik, kazanım. |
