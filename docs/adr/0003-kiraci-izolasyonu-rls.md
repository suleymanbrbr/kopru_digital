# 0003. Kiracı izolasyonu: kurum_id, RLS ve withTenant işlemi

## Durum

Kabul edildi (2026-11-07).

## Bağlam

Platform çok kiracılıdır. Kiracı birimi `kurum`dur. Bireysel öğretmen de bir kurum (`tur='bireysel'`) olarak kaydedilir. Bir kullanıcı birden fazla kurumda üye olabilir. Uygulama kodundaki tek bir eksik `WHERE kurum_id = ...` başka kurumun verisini sızdırır. KVKK kapsamında bu sınıf hata kabul edilemez. Veritabanı katmanında ikinci bir savunma gerekir.

## Karar

### Şema kuralı

Her kiracı tablosunda `kurum_id uuid NOT NULL` bulunur ve tabloda satır düzeyi güvenlik (RLS) açıktır. Politika `app.kurum_id` oturum değişkenini kullanır. Şablon ve istisnalar [schema/README.md](../schema/README.md#rls-politika-sablonu) içindedir.

Kiracı dışı tablolar (kullanıcı, oturum, global katalog, plan) `kurum_id` taşımaz ve RLS'e tabi değildir. Bunlar `api.md` içinde "RLS: hayır" olarak işaretlenir. Karma tablolarda (ör. `ogrenme.konular`, global satırlar için `kurum_id IS NULL`) politika bunu açıkça yazar.

Başka tabloya başvuran kiracı FK'leri, mümkün olduğunda `(kurum_id, id)` bileşik anahtarıyla kurulur. Böylece bir kurum satırı başka kurumun satırına bağlanamaz.

### Veritabanı rolleri

Her servis veritabanında üç rol vardır:

| Rol | Ne için | Özellik |
| --- | --- | --- |
| `{servis}_owner` | Migrasyonlar. Tabloların sahibi. | Yalnızca dağıtım hattındaki migrasyon adımı bağlanır. Uygulama bu role bağlanmaz. |
| `{servis}_app` | Uygulama süreçleri (HTTP, tüketici, pg-boss). | `NOSUPERUSER NOBYPASSRLS`, tabloların sahibi değil. Yalnızca `SELECT/INSERT/UPDATE/DELETE`. Defterlerde `UPDATE/DELETE` yok. |
| `{servis}_sistem` | Kiracı bağlamı olmayan platform işleri: abonelik webhook alımı, platform yöneticisi sorguları, `ortak.outbox` relay, gece işleri. | `BYPASSRLS` vardır. Ayrı bağlantı havuzu. Yalnızca `withSistem()` kullanır. |

Tablo sahibi RLS'i atlar. Bu yüzden her kiracı tablosunda `FORCE ROW LEVEL SECURITY` kullanılır ve uygulama sahip rolüyle bağlanmaz. `_app` rolünde `BYPASSRLS` yoktur. CI'da bu üç özellik bir testle doğrulanır (`pg_roles.rolbypassrls`, `pg_class.relforcerowsecurity`).

`_sistem` rolü ile açılan her işlem `denetim_kayitlari`na neden etiketiyle yazılır. Kod tabanında `withSistem` çağrıları lint kuralıyla yalnızca `src/sistem/**` dizininden izinlidir.

### withTenant

Kiracı verisine erişim yalnızca şu sarmalayıcıdan geçer:

```ts
export async function withTenant<T>(
  ctx: { kurumId: string; kullaniciId: string; salt_okunur?: boolean },
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`
      select set_config('app.kurum_id', ${ctx.kurumId}, true),
             set_config('app.kullanici_id', ${ctx.kullaniciId}, true)`);
    if (ctx.salt_okunur) await tx.execute(sql`set transaction read only`);
    return fn(tx);
  });
}
```

Kurallar:

1. `set_config(..., true)` işlem yerelidir (`SET LOCAL`). Bağlantı havuzuna dönen bağlantıda değişken kalmaz. PgBouncer işlem modunda güvenlidir.
2. Değişken ayarlı değilse `ortak.aktif_kurum()` NULL döner. Politika hiçbir satır döndürmez (fail-closed).
3. `kurumId` JWT'den gelir (`kurum_id` claim'i). İstek gövdesinden ya da URL'den asla alınmaz.
4. Taklit (impersonation) oturumunda `salt_okunur=true` zorunludur.
5. Çıplak `db.select()` gibi havuz üzerinden doğrudan sorgu kodda yasaktır. Repository fonksiyonları yalnızca `Tx` parametresi alır. Lint kuralı `db` nesnesinin repository dışında import edilmesini engeller.
6. Giriş öncesi akışlar (OTP, davet kabulü, sınıf kodu çözme) kiracı bağlamı olmadan çalışır. Bu akışlar ya kiracısız tabloları kullanır ya da dar kapsamlı `SECURITY DEFINER` fonksiyonlardan geçer (`hesap.davet_coz(token_hash)`, `hesap.katilim_kodu_coz(kod)`). Fonksiyonlar `_owner` sahipliğindedir, `search_path` sabitlenir ve yalnızca gerekli kimlikleri döner.
7. Kullanıcı düzeyi tablolar (ör. `hesap.uyelikler` giriş sonrası kurum seçimi, `bildirim.cihazlar`) `app.kullanici_id` ile süzen ikinci bir politika kullanır.

### Servisler arası

`motivasyon`, `bildirim` ve `medya` aynı kuralları uygular. Olay tüketicisi, olay zarfındaki `kurum_id` ile `withTenant` açar. Zarfta `kurum_id` null ise (kullanıcı düzeyi olay) tüketici yalnızca kiracısız tabloları günceller.

### Test

- Her kiracı tablosu için otomatik test: A kurumu bağlamıyla yazılan satır B bağlamıyla görünmez ve güncellenemez.
- Bağlam ayarsızken `SELECT count(*)` sıfır döner.
- Şema denetimi: `kurum_id` sütunu olan her tabloda RLS ve FORCE açık olmalıdır, değilse CI kırılır.

## Sonuçlar

Olumlu:

- Eksik `WHERE` filtresi veri sızdırmaz, boş sonuç üretir.
- Kiracı bağlamı tek yerde kurulur ve denetlenebilir.

Olumsuz:

- Her işlem iki ek `set_config` çağrısı yapar (ihmal edilebilir maliyet).
- RLS ifadeleri sorgu planlayıcısını etkileyebilir. Tüm indekslerin başında `kurum_id` bulunur.
- Havuz dışı bağlantı kullanan araçlar (psql, BI) için ayrı salt-okunur rol gerekir ve RLS'e tabidir.
- Kiracılar arası işler (raporlama, platform paneli) `_sistem` rolünü gerektirir. Bu rol dikkatle sınırlanmalıdır.

## Değerlendirilen alternatifler

**Yalnızca uygulama katmanı filtresi.** Tek hata sızıntıya yol açar. Reddedildi.

**Kurum başına şema ya da veritabanı.** Güçlü izolasyon verir, ama yüzlerce küçük kiracıda (bireysel öğretmenler) migrasyon ve bağlantı yönetimi maliyetlidir. Reddedildi.

**`SET` (işlem dışı) ile oturum değişkeni.** Bağlantı havuzunda değişken sonraki isteğe sızar. Reddedildi.

**Uygulama rolüne `BYPASSRLS` verip politikayı atlamak.** RLS'in amacını ortadan kaldırır. Reddedildi.

**Sistem işlerini politikada `app.sistem='on'` bayrağıyla açmak.** Tek bir oturum değişkeni ihlali tüm kiracıları açar. Ayrı rol ve ayrı havuz, bayraktan daha sıkı bir sınır olduğu için seçildi.
