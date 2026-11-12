import { t, type MessageKey } from '@kopru/i18n';

import type { SoruDurumu, SoruKotasi } from '../api/soruTipleri';
import { kisaZaman, yerelSaat } from '../lib/saat';

/** Tahmini cevap suresi: "yaklasik 2 saat" gibi (dakika/saat kabalastirilir). */
export function tahminMetni(sureSn: number): string {
  const dk = Math.max(1, Math.round(sureSn / 60));
  if (dk < 60) return t('mobil.soru.ogrenci.sureDakika', { n: dk });
  const saat = Math.floor(dk / 60);
  const kalan = dk % 60;
  // 5 dakikanin altindaki artik gosterilmez.
  if (kalan < 5) return t('mobil.soru.ogrenci.sureSaat', { n: saat });
  return t('mobil.soru.ogrenci.sureSaatDakika', { s: saat, d: Math.round(kalan / 5) * 5 });
}

export interface KotaGorunumu {
  /** Bu cihazda bekleyen (gonderilmemis) sorular dusulmus kalan hak; null: sinirsiz. */
  kalan: number | null;
  dolu: boolean;
  /** Kisa durum satiri ("Bugun 2 soru hakkin kaldi" ya da "Bugunku soru hakkin doldu."). */
  mesaj: string;
  /** Dolunca: sifirlanma zamani aciklamasi; aksi halde null. */
  sifirlanma: string | null;
}

/**
 * Kota gorunumu. `bekleyen`: henuz sunucuya ulasmamis (yukleniyor/gonderiliyor) soru gonderimleri;
 * onlar da hakki kullanacagi icin kalandan dusulur (kullanici ust uste gondermesin). Sifirlanma
 * metni kurum saatiyle verilir (api: kurumun yerel gununun bitisi).
 */
export function kotaGorunumu(
  kota: SoruKotasi,
  bekleyen: number,
  tz: string,
  simdi: number = Date.now(),
): KotaGorunumu {
  if (kota.gunlukKalan === null) {
    return {
      kalan: null,
      dolu: false,
      mesaj: t('mobil.soru.kota.kalanSinirsiz'),
      sifirlanma: null,
    };
  }
  const kalan = Math.max(0, kota.gunlukKalan - bekleyen);
  if (kalan > 0) {
    return {
      kalan,
      dolu: false,
      mesaj: t('mobil.soru.kota.kalan', { n: kalan }),
      sifirlanma: null,
    };
  }
  return {
    kalan: 0,
    dolu: true,
    mesaj: t('mobil.soru.kota.doldu'),
    sifirlanma: sifirlanmaMetni(kota.gunlukSifirlanma, tz, simdi),
  };
}

/** Bugun/yarin ise "yarin saat 00:00 civari", degilse tarihli. */
export function sifirlanmaMetni(iso: string, tz: string, simdi: number = Date.now()): string {
  const fark = Date.parse(iso) - simdi;
  if (fark <= 0) return t('mobil.soru.kota.sifirlanmaGun', { zaman: kisaZaman(iso, tz) });
  if (fark <= 36 * 3_600_000) {
    return t('mobil.soru.kota.sifirlanma', { saat: yerelSaat(iso, tz) });
  }
  return t('mobil.soru.kota.sifirlanmaGun', { zaman: kisaZaman(iso, tz) });
}

export function durumAdi(d: SoruDurumu): string {
  return t(`mobil.soru.durum.${d}` as MessageKey);
}

const HATA_KODLARI = new Set([
  'kota_asildi',
  'dosya_islenemedi',
  'mime_desteklenmiyor',
  'dosya_cok_buyuk',
  'dosya_yok',
  'dosya_turu_yetkisi_yok',
  'takip_limiti_asildi',
  'soru_durumu_gecersiz',
  'masa_ustlenildi',
  'cevap_bos',
  'ses_cok_uzun',
]);

/** Gonderim/yukleme hata kodunu Turkce mesaja cevirir (bilinmeyen: genel). */
export function gonderimHataMesaji(kod: string | undefined): string {
  if (kod && HATA_KODLARI.has(kod)) return t(`mobil.soru.hata.${kod}` as MessageKey);
  return t('mobil.soru.hata.genel');
}

/** Durum rozetinin ikonu (renk tek sinyal degildir: ikon + metin). */
export function durumIkonu(
  d: SoruDurumu,
): 'time-outline' | 'chatbubble-ellipses' | 'help-circle' | 'checkmark-circle' | 'lock-closed' {
  switch (d) {
    case 'acik':
      return 'time-outline';
    case 'cevaplandi':
      return 'chatbubble-ellipses';
    case 'takip_bekliyor':
      return 'help-circle';
    case 'cozuldu':
      return 'checkmark-circle';
    default:
      return 'lock-closed';
  }
}
