# Mimari karar kayıtları (ADR)

Biçim: Michael Nygard. Her kayıt `Başlık`, `Durum`, `Bağlam`, `Karar`, `Sonuçlar`, `Değerlendirilen alternatifler` bölümlerini içerir. Kabul edilmiş bir kararı değiştirmek için yeni ADR yazılır, eskinin durumu `Yerine geçti: NNNN` yapılır. Kayıtlar silinmez.

| No | Başlık | Durum |
| --- | --- | --- |
| [0001](0001-pragmatik-mikroservis.md) | Pragmatik mikroservis: 4 servis ve sınırları | Kabul edildi |
| [0002](0002-olay-sozlesmesi-outbox-idempotent-tuketici.md) | Olay sözleşmesi, outbox ve idempotent tüketiciler | Kabul edildi |
| [0003](0003-kiraci-izolasyonu-rls.md) | Kiracı izolasyonu: kurum_id, RLS ve withTenant işlemi | Kabul edildi |
| [0004](0004-kimlik-dogrulama-ve-yetkilendirme.md) | Kimlik doğrulama ve yetkilendirme | Kabul edildi |
| [0005](0005-dagitim-docker-kamal.md) | Dağıtım: Docker, Kamal ve Türkiye'de barındırma | Kabul edildi |
| [0006](0006-adlandirma-ve-dil-kurallari.md) | Adlandırma ve dil kuralları | Kabul edildi |
| [0007](0007-para-ve-defterler.md) | Para ve defterler: kuruş, append-only defter, ters kayıt | Kabul edildi |

Şema dokümanları: [../schema/README.md](../schema/README.md).

## Yeni ADR açmak

1. Sonraki numarayı kullan (`0008-...md`). Dosya adı ASCII, `kebab-case` ([0006](0006-adlandirma-ve-dil-kurallari.md)).
2. Yukarıdaki altı bölümü doldur. Alternatifleri gerekçesiyle yaz.
3. Bu tabloya satır ekle.
