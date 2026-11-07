# kopru_digital — Claude için proje kuralları

Türkiye için eğitim operasyon platformu (solo hoca → kurum). Web (Next.js) + tek mobil uygulama (Expo, iOS/Android) + 4 TypeScript servisi. Proje sahibiyle **Türkçe** konuş.

## Önce oku

- Ürün: `docs/urun/plan.md`, `docs/urun/ozellik-sartnamesi.md` (kapsam, akışlar, kalite çıtası — ürün kararları için esas kaynak)
- Durum ve sıradaki işler: `docs/urun/devir-notu.md`
- Mimari kararlar: `docs/adr/` · Veri modeli ve olaylar: `docs/schema/` · Karakter: `docs/karakter/`
- Geliştirme ortamı ve komutlar: `docs/gelistirme.md`

## Mimari (değiştirmeden önce ADR yaz)

- Servisler: `services/api` (çekirdek; `src/modules/{hesap,ders,finans,ogrenme,abonelik}`), `services/motivasyon`, `services/bildirim`, `services/medya`. Her servisin kendi veritabanı ve worker süreci var.
- Servisler birbirinin kodunu veya veritabanını kullanmaz; iletişim NATS JetStream olayları (outbox ile, `packages/contracts` şemalarıyla). api modülleri birbirinin yalnız `index.ts`'ini içe aktarır. ESLint sınır kuralları bunu zorlar; kapatma.
- Kiracı izolasyonu: her kiracı tablosunda `kurum_id` + RLS; DB erişimi `withTenant(...)` içinde. Uygulama rolü RLS'i atlayamaz. Her yeni tablo için izolasyon testi zorunlu.
- Para kuruş cinsinden tam sayı; defterler yalnız ekleme (düzeltme = ters kayıt). Zaman UTC `timestamptz`. Kimlik UUIDv7.
- Kişisel veri (telefon, e-posta, ad) olaylara ve push metinlerine konmaz. Veri Türkiye'de kalır.
- Faz 1'de veli arayüzü yok. Kapsam dışı listesi `docs/urun/plan.md`'de; listede olmayan özellik eklemeden önce sor.

## Adlandırma (ADR 0006)

Alan terimleri Türkçe ASCII (`kurum_id`, `yoklama`, `uyelik`), teknik tanımlayıcılar İngilizce (`createService`). Kullanıcıya görünen metinler Türkçe ve `packages/i18n`'de. Paket kapsamı `@kopru/*`.

## Komutlar

```bash
pnpm install
pnpm run doctor            # Mac ortam kontrolü ("pnpm doctor" pnpm'in kendi komutuyla çakışır)
pnpm infra:up              # PostgreSQL, NATS, MinIO, Mailpit, Grafana (Docker)
pnpm dev                   # tüm servisler ve uygulamalar
pnpm lint && pnpm typecheck && pnpm test && pnpm build
pnpm format                # Prettier
```

Veritabanı testleri `DATABASE_URL` ister (yoksa atlanır). CI'da `postgres:17` servisi var.

## Çalışma biçimi

- **İş bitti demeden önce** `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` geçmeli ve değişikliğin kendisi gerçekten çalıştırılarak denenmeli (servisi ayağa kaldır, isteği at; UI'da ekran görüntüsü al ve bak; mobilde simülatörde aç).
- Küçük, mantıklı commit'ler; Conventional Commits (`feat(api): ...`), açıklama Türkçe. `main`'e doğrudan push yerine dal + birleştirme.
- Bağımlılık sürümleri `pnpm-workspace.yaml` katalogunda sabitlenir; paketler `catalog:` kullanır.
- Kurala aykırı bir şey gerekiyorsa (lint kapatmak, sınır aşmak, şemadan sapmak) önce gerekçeyi yaz ve ilgili dokümanı aynı dalda güncelle.

## Orkestrasyon tercihi (proje sahibinin isteği)

Büyük işlerde ana oturum orkestratör olur: işi bağımsız paketlere böler, her paketi ayrı bir git worktree/dalda çalışan alt ajana verir (alt ajan modeli: **Sonnet**), teslimleri kendisi inceler, kontrolleri yeniden çalıştırır ve `main`'e kendisi birleştirir. Alt ajanlara kapsamlarını (dokunabilecekleri yollar), okuyacakları dokümanları ve kalite çıtasını açıkça yaz.
