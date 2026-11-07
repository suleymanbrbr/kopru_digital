# 0007. Para ve defterler: kuruş, append-only defter, ters kayıt

## Durum

Kabul edildi (2026-11-07).

## Bağlam

Platform üç tür sayısal hesap tutar: öğrenci ders kredisi (paket), öğrenci parasal bakiyesi (ders ücreti, tahsilat) ve abonelik ödemeleri. Yoklama değiştiğinde kredi geri verilir. Hatalı tahsilat iptal edilir. Bu işlemler geriye dönük denetlenebilir olmalıdır. "Bakiye yanlış" şikayetinde nedeni satır satır göstermek gerekir.

## Karar

### Para

1. Tutarlar **tam sayı kuruş** olarak `bigint` sütunda saklanır. Sütun adı `_kurus` ile biter. Kayan nokta (`float`, `numeric` ile ondalık TL) kullanılmaz.
2. Para birimi Faz 1'de yalnızca TRY'dir. Defter satırlarında `para_birimi text NOT NULL DEFAULT 'TRY' CHECK (para_birimi = 'TRY')` bulunur. Çoklu para birimine geçiş bu CHECK'in kaldırılması ve tutar karşılaştırmalarının güncellenmesidir.
3. API ve olaylar tutarı kuruş tamsayısı olarak taşır (`tutar_kurus: 125000`). JSON'da `number` güvenli aralıkta kalır (2^53 kuruş, yaklaşık 90 trilyon TL). İstemci yalnızca gösterimde TL'ye çevirir (`Intl.NumberFormat('tr-TR', {style:'currency', currency:'TRY'})`).
4. KDV hesabı: `kdv_kurus = round(matrah_kurus * oran / 100)` (yarım yukarı), `toplam = matrah + kdv`. Yuvarlama yalnızca fatura satırı düzeyinde yapılır. Tutar bölme (taksit) kalanı son parçaya eklenir, toplam asla değişmez.
5. Kredi (ders hakkı) ayrı birimdir: `int` adet, para değildir. Aynı defter kuralları geçerlidir.

### Defterler (append-only)

Defter tabloları: `finans.kredi_hareketleri`, `finans.bakiye_hareketleri`, `motivasyon.xp_hareketleri`, `hesap.rizalar`, `hesap.denetim_kayitlari`, `ders.yoklama_gecmisi`. Kurallar:

1. Satır eklenir, değiştirilmez ve silinmez. `{servis}_app` rolünden `UPDATE` ve `DELETE` yetkisi alınır. Ek olarak her defterde `BEFORE UPDATE OR DELETE` tetikleyicisi `RAISE EXCEPTION 'defter_degistirilemez'` fırlatır (sahip rolü için de geçerli).
2. Her satır işaretli (signed) bir miktar taşır. Kredi: `+` ekler, `-` düşer. Bakiye (öğrenci hesabı bakış açısı): **negatif = öğrenci borçlu**, ücret `-`, tahsilat `+`. Bakiye = `SUM(tutar_kurus)`.
3. Düzeltme **ters kayıtla** yapılır: Yeni bir satır, tutarı özgün satırın tersi olarak eklenir ve `ters_cevrilen_id` ile özgün satıra işaret eder. `ters_cevrilen_id` üzerinde kısmi `UNIQUE` indeks vardır: bir satır en çok bir kez ters çevrilir. Ters kaydın kendisi tekrar ters çevrilemez (`tur='ters_kayit'` olan satır için uygulama reddeder). Yeniden uygulamak gerekiyorsa yeni bir özgün satır eklenir.
4. Her satır, kaynağını bağlar (`kaynak_turu`, `kaynak_id`; yoklama kaynaklı satırlarda `yoklama_id`, `yoklama_surumu`). Aynı kaynaktan çift satır oluşmasını tekilleştirme indeksi engeller (ör. `(yoklama_id, yoklama_surumu)` kısmi UNIQUE).
5. Satır eklerken `created_by` (kullanıcı) ve `neden` (serbest metin, düzeltmelerde zorunlu) yazılır.
6. Bakiye okuma hızlı olsun diye özet tabloları (`finans.kredi_bakiyeleri`, `finans.ogrenci_bakiyeleri`) aynı işlemde artırımla güncellenir (`SET bakiye = bakiye + :delta`). Özet türetilmiş veridir. Gece işi, özet ile `SUM(defter)` farkını denetler ve uyuşmazlıkta alarm üretir. Doğruluk kaynağı her zaman defterdir.
7. Defter yazımı ve onu doğuran iş olayı (ör. yoklama) **aynı veritabanı işleminde** yapılır ([0001](0001-pragmatik-mikroservis.md)). Defter satırı için olay (`finans.*`) aynı işlemde outbox'a yazılır.
8. Ödeme sağlayıcı olayları (webhook) ham haliyle saklanır (`abonelik.abonelik_olaylari`) ve tekilleştirilir. Bunlar da düzeltilmez, durum alanı hariç.

### Yoklama değişikliği örneği

`yoklama.surum = 1`, durum `geldi`: kredi satırı `dusum`, `miktar=-1`, `yoklama_surumu=1`. Durum `izinli`ye değişir (`surum=2`): önce `iade` (ters kayıt, `+1`, `ters_cevrilen_id=dusum.id`), sonra `izinli` kredi düşürmediği için yeni `dusum` eklenmez. Durum tekrar `geldi` olursa (`surum=3`) yeni `dusum` (`yoklama_surumu=3`) eklenir. Kredi bakiyesi her adımda satırların toplamıdır.

## Sonuçlar

Olumlu:

- Her bakiye, satır satır açıklanabilir ve denetlenebilir.
- Yuvarlama hatası yok. Karşılaştırma ve toplama tam sayıdır.
- Eşzamanlı yazma güvenli: artırım atomiktir, tekilleştirme indeksleri çift işlemi engeller.

Olumsuz:

- Düzeltme için iki satır gerekir; raporlarda "net" görünüm için ters kayıtları dikkate almak gerekir (`v_kredi_hareketleri_net`).
- Özet tablolar türetilmiş veridir, ayrıca bakım ister.
- Defter tabloları sürekli büyür. 2 yıldan eski satırlar aylık bölümlere (partition) ayrılır, silinmez.
- Hukuki silme talepleri (KVKK) defter satırlarında kimliksizleştirme ile karşılanır: `kullanici` bağlantıları anonim kimliğe döner, tutarlar korunur. Bu işlem tetikleyici istisnası olarak yalnızca `anonimlestir` yordamında (`SECURITY DEFINER`) yapılır.

## Değerlendirilen alternatifler

**`numeric(12,2)` TL.** Okunaklı, ama JSON/JS tarafında yuvarlama hatasına açık ve bölme davranışı belirsiz. Reddedildi.

**Değiştirilebilir bakiye sütunu (tek kaynak).** Hızlı ve basit, ama geçmiş yok, yarış durumunda kayıp güncelleme. Reddedildi.

**Tam olay kaynaklı finans.** Defter zaten yeterli denetim sağlar; olay deposu ek sorgu karmaşıklığı getirir. Reddedildi.

**Değiştirerek düzeltme (UPDATE) ve denetim tablosu.** Denetim tablosu atlanabilir/yanlış doldurulabilir. Ters kayıt, düzeltmenin kendisini kalıcı kılar. Reddedildi.
