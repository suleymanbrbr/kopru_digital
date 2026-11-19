export type AbonelikDurumKodu =
  'deneme' | 'aktif' | 'odeme_bekliyor' | 'ek_sure' | 'askida' | 'iptal' | 'sona_erdi';

export type AbonelikKaynagi = 'deneme' | 'iyzico' | 'apple' | 'google' | 'kurumsal';

export type AbonelikPeriyodu = 'aylik' | 'yillik';

export interface AbonelikPlani {
  kod: string;
  ad: string;
  kurumTuru: 'bireysel' | 'ekip' | 'kurum';
  /** Yer tutucu liste fiyati (kurus); magaza fiyati magaza saglayicisindan gelir. */
  aylikFiyatKurus: number;
  yillikFiyatKurus: number | null;
  /** `null`: sinirsiz. */
  maxOgrenci: number | null;
  maxOgretmen: number | null;
}

export interface Abonelik {
  durum: AbonelikDurumKodu;
  kaynak: AbonelikKaynagi;
  plan: AbonelikPlani;
  periyot: AbonelikPeriyodu;
  denemeBitis: string | null;
  ekSureBitis: string | null;
  donemBitis: string;
  iptalIstendi: string | null;
  otomatikYenileme: boolean;
}

export interface KullanimSayaci {
  mevcut: number;
  /** `null`: sinirsiz. */
  ustSinir: number | null;
}

export interface AbonelikOzeti {
  /** Etkin abonelik yoksa (ucretsiz katman) null. */
  abonelik: Abonelik | null;
  kullanim: { ogrenci: KullanimSayaci; ogretmen: KullanimSayaci };
  ucretsiz: boolean;
  yazmaKilitli: boolean;
}

export type PlatformMesajiOnemi = 'bilgi' | 'uyari' | 'kritik';

export interface PlatformMesaji {
  id: string;
  baslik: string;
  metin: string;
  onem: PlatformMesajiOnemi;
}

/** Abonelik (yalniz sahip) ve platform mesaji (kimliksiz) uclari. */
export interface AbonelikAdapter {
  ozet: () => Promise<AbonelikOzeti>;
  planlar: () => Promise<AbonelikPlani[]>;
  /** Kimliksiz uc; etkin mesaj yoksa null. */
  platformMesaji: () => Promise<PlatformMesaji | null>;
}
