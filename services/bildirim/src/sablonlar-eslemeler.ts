import type { BildirimKategori } from '@kopru/contracts';

import type { SablonTanimi } from './sablonlar.js';

/**
 * Olay eslemelerinin sablonlari (paket B2). `sablonlar.ts` bunu `SABLON_TANIMLARI`na ekler.
 * Push metni GENELdir: ad, not, ucret/tutar, odev metni yoktur; ayrinti kutuda (sabit listeli degiskenlerle) ve
 * derin baglantidadir (`kopru://...`). `{{tarih_saat}}`/`{{saat}}` kisisel veri degildir.
 */

interface Cift {
  kod: string;
  kategori: BildirimKategori;
  baslik: string;
  /** Kutu govdesi; verilmezse push govdesiyle ayni. */
  kutu?: string;
  push: string;
  derinBaglanti: string;
  /** `true`: push metni yok (yalniz kutu). */
  yalnizKutu?: boolean;
}

function cift(c: Cift): SablonTanimi[] {
  const ortak = {
    kod: c.kod,
    kategori: c.kategori,
    baslik: c.baslik,
    derinBaglanti: c.derinBaglanti,
  };
  const kutu: SablonTanimi = { ...ortak, kanal: 'kutu', govde: c.kutu ?? c.push };
  if (c.yalnizKutu) return [kutu];
  return [kutu, { ...ortak, kanal: 'push', govde: c.push }];
}

export const ESLEME_SABLONLARI: readonly SablonTanimi[] = [
  // --- ders ---
  ...cift({
    kod: 'ders_iptal',
    kategori: 'ders',
    baslik: 'Ders iptal edildi',
    push: 'Dersin iptal edildi: {{tarih_saat}}.',
    derinBaglanti: 'kopru://ders/{{ders_id}}',
  }),
  ...cift({
    kod: 'ders_iptal_ogretmen',
    kategori: 'ders',
    baslik: 'Ders iptal edildi',
    push: 'Bir dersin başkası tarafından iptal edildi: {{tarih_saat}}.',
    derinBaglanti: 'kopru://ders/{{ders_id}}',
  }),
  ...cift({
    kod: 'ders_ertelendi',
    kategori: 'ders',
    baslik: 'Ders ertelendi',
    push: 'Dersin ertelendi. Yeni zamanı: {{tarih_saat}}.',
    derinBaglanti: 'kopru://ders/{{ders_id}}',
  }),
  ...cift({
    kod: 'telafi_planlandi',
    kategori: 'ders',
    baslik: 'Telafi dersi planlandı',
    push: 'Telafi dersin planlandı: {{tarih_saat}}.',
    derinBaglanti: 'kopru://ders/{{ders_id}}',
  }),
  ...cift({
    kod: 'ders_hatirlatma',
    kategori: 'ders',
    baslik: 'Dersin yaklaşıyor',
    push: 'Dersin saat {{saat}}’de başlıyor.',
    derinBaglanti: 'kopru://ders/{{ders_id}}',
  }),
  ...cift({
    kod: 'ders_geri_bildirim',
    kategori: 'ders',
    baslik: 'Ders nasıldı?',
    push: 'Bugünkü ders nasıldı? Tek dokunuşla bildir.',
    derinBaglanti: 'kopru://ders/{{ders_id}}/geri-bildirim',
  }),
  ...cift({
    kod: 'ogretmen_sabah',
    kategori: 'ders',
    baslik: 'Günaydın',
    push: 'Bugün {{ders_sayisi}} dersin var. İlki saat {{ilk_saat}}’de.',
    derinBaglanti: 'kopru://bugun',
  }),
  // --- yoklama ---
  ...cift({
    kod: 'yoklama_gelmedi',
    kategori: 'yoklama',
    baslik: 'Yoklama',
    push: 'Bir derse gelmedi olarak işaretlendin.',
    derinBaglanti: 'kopru://ders/{{ders_id}}',
  }),
  ...cift({
    kod: 'yoklama_gec',
    kategori: 'yoklama',
    baslik: 'Yoklama',
    push: 'Bir derse geç kaldın olarak işaretlendin.',
    derinBaglanti: 'kopru://ders/{{ders_id}}',
  }),
  // --- kayit / materyal ---
  ...cift({
    kod: 'kayit_eklendi',
    kategori: 'kayit',
    baslik: 'Yeni ders kaydı',
    push: 'Yeni bir ders kaydı eklendi.',
    derinBaglanti: 'kopru://kayit/{{kaynak_id}}',
  }),
  ...cift({
    kod: 'materyal_eklendi',
    kategori: 'kayit',
    baslik: 'Yeni materyal',
    push: 'Yeni bir materyal eklendi.',
    derinBaglanti: 'kopru://kayit/{{kaynak_id}}',
  }),
  ...cift({
    kod: 'kaynak_sorun',
    kategori: 'kayit',
    baslik: 'Kayıt sorunu bildirildi',
    kutu: 'Bir öğrenci eklediğin kaydın {{neden_ozeti}} olduğunu bildirdi.',
    push: 'Eklediğin bir kayıt için sorun bildirildi.',
    derinBaglanti: 'kopru://kayit/{{kaynak_id}}',
  }),
  // --- odev ---
  ...cift({
    kod: 'odev_yayinlandi',
    kategori: 'odev',
    baslik: 'Yeni ödev',
    push: 'Yeni bir ödevin var.',
    derinBaglanti: 'kopru://odev/{{odev_id}}',
  }),
  ...cift({
    kod: 'odev_teslim_yaklasiyor',
    kategori: 'odev',
    baslik: 'Teslim tarihi yaklaşıyor',
    push: 'Bir ödevinin teslim tarihi yaklaşıyor.',
    derinBaglanti: 'kopru://odev/{{odev_id}}',
  }),
  ...cift({
    kod: 'odev_teslim_edildi',
    kategori: 'odev',
    baslik: 'Yeni teslim',
    push: 'Bir öğrenci ödevini teslim etti.',
    derinBaglanti: 'kopru://odev/{{odev_id}}',
  }),
  ...cift({
    kod: 'odev_incelendi',
    kategori: 'odev',
    baslik: 'Ödevin incelendi',
    kutu: 'Ödevin incelendi: {{sonuc_ozeti}}.',
    push: 'Ödevin incelendi.',
    derinBaglanti: 'kopru://odev/{{odev_id}}',
  }),
  // --- ogretmen degerlendirmesi ve onerilen kaynak (yalniz kutu, push yok) ---
  ...cift({
    kod: 'degerlendirme_yayimlandi',
    kategori: 'odev',
    baslik: 'Yeni değerlendirme',
    push: 'Öğretmeninden yeni bir değerlendirme.',
    derinBaglanti: 'kopru://degerlendirmelerim',
    yalnizKutu: true,
  }),
  ...cift({
    kod: 'kaynak_onerisi_eklendi',
    kategori: 'odev',
    baslik: 'Yeni kaynak önerisi',
    push: 'Öğretmenin sana yeni bir kaynak önerdi.',
    derinBaglanti: 'kopru://kaynak-onerilerim',
    yalnizKutu: true,
  }),
  // --- soru ---
  ...cift({
    kod: 'yeni_soru',
    kategori: 'soru',
    baslik: 'Yeni soru',
    push: 'Cevap bekleyen yeni bir soru var.',
    derinBaglanti: 'kopru://soru/{{soru_id}}',
  }),
  ...cift({
    kod: 'soru_takip',
    kategori: 'soru',
    baslik: 'Takip sorusu',
    push: 'Bir soruya takip mesajı geldi.',
    derinBaglanti: 'kopru://soru/{{soru_id}}',
  }),
  // --- oyunlastirma ---
  ...cift({
    kod: 'seviye_atladi',
    kategori: 'oyunlastirma',
    baslik: 'Seviye atladın!',
    push: 'Tebrikler, {{yeni_seviye}}. seviyeye ulaştın.',
    derinBaglanti: 'kopru://bugun',
  }),
  ...cift({
    kod: 'rozet_kazanildi',
    kategori: 'oyunlastirma',
    baslik: 'Yeni rozet!',
    push: 'Yeni bir rozet kazandın.',
    derinBaglanti: 'kopru://rozetler',
  }),
  ...cift({
    kod: 'karakter_evrildi',
    kategori: 'oyunlastirma',
    baslik: 'Karakterin evrildi!',
    push: 'Karakterin yeni bir aşamaya geçti.',
    derinBaglanti: 'kopru://bugun',
  }),
  ...cift({
    kod: 'seri_kilometre_tasi',
    kategori: 'oyunlastirma',
    baslik: 'Harika bir seri!',
    push: '{{seri}} günlük serin var. Böyle devam!',
    derinBaglanti: 'kopru://bugun',
  }),
  ...cift({
    kod: 'seri_bozuldu',
    kategori: 'oyunlastirma',
    baslik: 'Yeni seri bugün başlıyor',
    push: '{{onceki_seri}} günlük serin sona erdi. Yeni bir seri bugün başlıyor!',
    derinBaglanti: 'kopru://bugun',
  }),
  ...cift({
    kod: 'seri_onarilabilir',
    kategori: 'oyunlastirma',
    baslik: 'Serini onarabilirsin',
    push: '{{onceki_seri}} günlük serin sona erdi ama onarmak için hâlâ vaktin var.',
    derinBaglanti: 'kopru://bugun',
  }),
  // --- finans (tutar HICBIR yerde yok) ---
  ...cift({
    kod: 'kredi_azaliyor',
    kategori: 'finans',
    baslik: 'Kredin azalıyor',
    kutu: 'Ders kredin azalıyor. Kalan ders sayın: {{kalan_kredi}}.',
    push: 'Ders kredin azalıyor.',
    derinBaglanti: 'kopru://kredi',
  }),
  ...cift({
    kod: 'tahsilat_alindi',
    kategori: 'finans',
    baslik: 'Ödemen alındı',
    push: 'Ödemen kaydedildi. Teşekkürler.',
    derinBaglanti: 'kopru://kredi',
  }),
  ...cift({
    kod: 'paket_satildi',
    kategori: 'finans',
    baslik: 'Yeni ders paketi',
    kutu: 'Hesabına {{toplam_kredi}} derslik yeni bir paket tanımlandı.',
    push: 'Hesabına yeni bir ders paketi tanımlandı.',
    derinBaglanti: 'kopru://kredi',
  }),
  // --- sistem ---
  ...cift({
    kod: 'davet_kabul_edildi',
    kategori: 'sistem',
    baslik: 'Davetin kabul edildi',
    kutu: 'Davet ettiğin {{rol_ozeti}} katıldı.',
    push: 'Gönderdiğin davet kabul edildi.',
    derinBaglanti: 'kopru://kutu',
  }),
  // --- platform duyurusu (yalniz kutu) ---
  ...cift({
    kod: 'mufredat_guncellendi',
    kategori: 'duyuru',
    baslik: 'Müfredat güncellendi',
    push: 'Müfredat güncellendi.',
    kutu: '{{katalog_ad}} müfredatının yeni sürümü ({{surum_no}}) yayınlandı: {{eklenen}} konu eklendi, {{tasinan}} konu taşındı ya da yeniden adlandırıldı, {{birlesen}} konu birleştirildi, {{kaldirilan}} konu kullanımdan kaldırıldı. Mevcut ödev ve planların etkilenmez.',
    derinBaglanti: 'kopru://kutu',
    yalnizKutu: true,
  }),
];
