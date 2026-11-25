# 0010. Kullanıcı düzeyi olaylar ve KVKK hesap silme

## Durum

Kabul edildi (2026-11-19). [ADR 0002](0002-olay-sozlesmesi-outbox-idempotent-tuketici.md) (olay zarfı) ve [ADR 0003](0003-kiraci-izolasyonu-rls.md) (RLS) ile ilişkilidir. Ayrıntı ve veri envanteri: [../schema/kvkk-silme.md](../schema/kvkk-silme.md).

## Bağlam

`hesap.kullanici.degisti.v1` ve `hesap.kullanici.silindi.v1` bir kuruma ait değil, kullanıcıya aittir (bir kullanıcının birden çok kurumda üyeliği olabilir). Olay zarfının `kurumId` alanı zorunludur ve tüketiciler varsayılan olarak bu kurumla RLS bağlamı kurar. Sözleşme bu yüzden bugüne kadar yazılamamış, `motivasyon`, `bildirim`, `medya` KVKK temizliği eksik kalmıştı. App Store kuralı (uygulama içinden hesap silme) ve KVKK m.7/m.11 bunu gerektirir.

## Karar

1. **Zarf sözleşmesi değişmez.** Kullanıcı düzeyi olaylarda `kurumId` = `KULLANICI_DUZEYI_KURUM_ID` (nil UUID, `00000000-0000-0000-0000-000000000000`). Outbox tablosu kiracı tablosu değildir; yayın etkilenmez.
2. **Tüketiciler `kiraci: 'yok'` çalışır** ve kurumlar arası temizlik gerektiğinden servisin sistem rolüyle (`*_sistem`, BYPASSRLS) bağlanır. Sistem rolü yalnız bu ayrı tüketicilerde (`bildirim.kullanici`, `motivasyon.kvkk`, `medya.kvkk`) kullanılır; diğer tüketiciler uygulama rolüyle kalır.
3. **Olay yükünde kişisel veri yok:** `degisti` yalnız kimlik, `dil`, `durum` ve değişen alan *adlarını*; `silindi` kimlik, üyelik kimlikleri ve zamanı taşır. İletişim/ad bilgisi gerekirse tüketici `api` iç ucundan alır (yük taşımaz).
4. **Silme iki aşamalıdır:** talep + 30 gün soğuma (geri alınabilir), sonra worker işi `api` verisini anonimleştirir ve `silindi` olayını outbox ile yayımlar; diğer servisler olayı tüketip kendi verisini temizler (en-az-bir-kez, idempotent).
5. **Dışa aktarma `api` toplar:** her servis `POST /ic/kvkk/veri` (servis JWT'si, `scope=kvkk.veri`) sunar; `api` kullanıcının her kurumu için çağırır. Servisler uygulama rolüyle ve kurum bağlamında (RLS) yanıtlar, sistem rolü gerekmez.

## Sonuçlar

- Mevcut tüketici ve zarf kodu değişmez; yeni olay sözleşmeleri `@kopru/contracts` içindedir.
- `api` HTTP'de diğer servislere bağımlı hale gelir (yalnız dışa aktarmada; ulaşılamayan servis `eksik_servisler` olarak raporlanır, hesap silme bu bağımlılığa sahip değildir).
- Nil `kurumId` ile gelen olay hiçbir kurumun verisini temsil etmez; tüketici yanlışlıkla `olaydan` kiracıyla çalışırsa nil kurum için hiçbir satır görmez (fail-closed).

## Değerlendirilen alternatifler

- **Zarfta `kurumId` isteğe bağlı:** her tüketici ve test etkilenir, geniş refaktör; reddedildi.
- **Üyelik başına olay (kurum başına fan-out):** bir kullanıcının silinmesi N olay ve N kısmi durum olur; `silindi` "tamamlandı" anlamını yitirir; reddedildi.
- **Her servis kendi `GET .../ben/verilerim` ucunu açar, istemci toplar:** istemci (web, mobil) 4 çağrı + kurum başına tekrar yapar, web vekil izin listesi büyür, indirilen dosya bütünleşik olmaz; reddedildi.
