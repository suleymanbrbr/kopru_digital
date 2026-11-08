# 0009. Güvenilir proxy ve gerçek istemci IP'si

## Durum

Kabul edildi (2026-11-08). [ADR 0004](0004-kimlik-dogrulama-ve-yetkilendirme.md) (kimlik doğrulama, hız sınırları) ve [ADR 0005](0005-dagitim-docker-kamal.md) (Kamal Proxy, yük dengeleyici) ile ilişkilidir.

## Bağlam

`api` hiçbir proxy'ye güvenmiyordu; `request.ip` her zaman TCP bağlantısının karşı ucuydu. Canlıda iki katman vardır: istemci → yük dengeleyici → `kamal-proxy` → konteyner (mobil) ve tarayıcı → web (Next.js BFF) → `api`. Sonuç: mobil istemcilerin hepsi proxy IP'siyle, web kullanıcılarının hepsi BFF IP'siyle görünür. IP'ye bağlı her şey ortaklaşır: OTP'nin IP başına saatlik 20 sınırı (`otp_istekleri`), `/auth/token` dakikada 60 sınırı, genel `@fastify/rate-limit` ve sınıf kodu sayaçları (hepsi `request.ip`). Birkaç kullanıcı herkesi kilitler. Oturum satırındaki IP (Oturumlarım `ip_maskeli`) de proxy adresi olur.

Ayrıca Better Auth oturum IP'sini kendisi, yalnız `X-Forwarded-For` başlığından okur ve güven kuralı bilmez; istemcinin yazdığı değer oturuma geçebilir.

## Karar

Standart Fastify `trustProxy`, **açık IP/CIDR listesiyle**.

- Yeni ortam değişkeni `TRUST_PROXY` (`@kopru/service-kit` ortak şeması; `API_TRUST_PROXY` öneki de çalışır). Virgülle ayrılmış IP veya CIDR (`10.0.0.0/8, fd00::/8`).
- **Varsayılan boş: hiçbir proxy'ye güvenilmez**, `X-Forwarded-For` yok sayılır (önceki davranış).
- `*`, `true`, `loopback` gibi etiketler ve `/0` öneki **kabul edilmez**; servis açılışta açık hata ile durur. Herkese güvenmek başlığı sahtelenebilir kılar.
- Kural (proxy-addr): bağlantının karşı ucu listede değilse başlık yok sayılır; listedeyse `X-Forwarded-For` sağdan sola gezilir ve **en sağdaki güvenilmeyen adres** istemci sayılır. Sol uca yazılmış sahte değerler (`1.2.3.4, gerçek`) sonucu etkilemez.
- `request.ip` böylece tüm kodda (hız sınırları, OTP sayacı, sınıf kodu, loglar) değişiklik yapmadan doğru olur.
- Better Auth: `webBasliklari` (`ba-yardimci.ts`) Better Auth'a giden başlıklarda `X-Forwarded-For`'u atar ve `request.ip` (tek değer) ile yeniden yazar. Oturum IP'si bu yüzden `request.ip` ile aynı güven kuralından gelir.
- Üretimde değer: **yalnızca özel ağdaki proxy ve web kaynak adresleri** (Kamal Proxy'nin ve web konteynerinin api'ye bağlandığı iç ağ/alt ağ, örn. `10.0.0.0/24`). Genel internet aralığı, yük dengeleyicinin genel adresi veya `0.0.0.0/0` verilmez. Api'ye doğrudan genel erişim olan bir yol kalmamalıdır (yalnız proxy/BFF'e açık), aksi halde listedeki adres kendi trafiğiyle sahtelenemese bile güven boşa gider.
- Web BFF, api'yi çağırırken `X-Forwarded-For`'u kendisi üretir: gelen istekteki istemci IP'sini (BFF'in kendi önündeki proxy zinciri çözüldükten sonra) giden isteğe `X-Forwarded-For: <istemci IP>` olarak koyar (web tarafı ayrı PR). BFF'in kaynak adresi `TRUST_PROXY` listesinde olmalıdır. Proxy sayısı kuralı: zincirdeki her güvenilen sıçrama listede olmalı; bir halka listede değilse o halkanın adresi "istemci" olur.

## Sonuçlar

- Doğru yapılandırmada hız sınırları kullanıcı başına çalışır; mobil ve web ayrı IP'ler görür.
- Yanlış yapılandırma (liste çok geniş) sahteciliğe, çok dar (boş) ortaklaşmaya yol açar; boş varsayılan güvenli taraftır ve eski davranıştır.
- Yapılandırma dağıtım ortamına bağlıdır: Kamal ağı değişirse liste güncellenmelidir. Yerelde boş bırakılır.
- Oturum satırlarına yazılan IP artık `request.ip`'dir; Better Auth'un kendi `X-Forwarded-For` okuması fiilen devre dışıdır.
- Web BFF güncellenene kadar web kullanıcıları hâlâ tek IP görünür (liste doldurulsa bile BFF başlık göndermedikçe değişmez).

## Değerlendirilen alternatifler

**`trustProxy: true`.** Zincirin soluna güvenir; herhangi bir istemci başlığı yazarak IP'sini seçer, hız sınırları ve oturum IP'si anlamsızlaşır. Reddedildi.

**BFF ile api arasında paylaşılan sır + özel başlık** (örn. `X-Kopru-Istemci-Ip`). Yalnız web için çalışır, mobil/Kamal arkasını çözmez, sır yönetimi ve dönüşümü getirir, `request.ip` kullanan kod ve Better Auth yine yanlış kalır. Reddedildi.

**Yalnız BFF için ayrı limit.** Semptomu hafifletir (web ortak kovası büyür) ama IP'ye bağlı korumayı web'de fiilen kapatır; mobilde proxy IP'si sorunu sürer. Reddedildi.
