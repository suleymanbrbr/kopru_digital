import type {
  BildirimAyarlari,
  BildirimCihazKayit,
  BildirimKategori,
  BildirimKutuOgesi,
  BildirimKanal,
} from '@kopru/contracts';

/**
 * Bildirim servisi adaptor tipleri. Okuma modelleri sozlesmeyle (`@kopru/contracts`, snake_case)
 * aynidir. Kutu, tercih ve ayar uclari etkin kuruma baglidir; cihaz uclari kullanici duzeyindedir.
 */
export type { BildirimAyarlari, BildirimCihazKayit, BildirimKategori, BildirimKutuOgesi };
/** Kategori x kanal hucresi (sozlesme `BildirimTercihSema`). `kilitli`: degistirilemez. */
export interface BildirimTercihi {
  kategori: BildirimKategori;
  kanal: BildirimKanal;
  acik: boolean;
  kilitli: boolean;
}

export interface BildirimKutuSayfasi {
  ogeler: BildirimKutuOgesi[];
  sonrakiImlec: string | null;
}

export interface BildirimKutuSorgusu {
  imlec?: string;
  limit?: number;
  okunmamis?: boolean;
}

export interface BildirimTercihGuncellemesi {
  kategori: BildirimKategori;
  kanal: 'push';
  acik: boolean;
}

export interface BildirimAdapter {
  /** Her acilista ve belirtec degisince (kullanici duzeyi; kurum secimi gerekmez). */
  cihazKaydet: (k: BildirimCihazKayit) => Promise<void>;
  /** Cikista; kayit yoksa da basarili. */
  cihazSil: (cihazKimligi: string) => Promise<void>;

  kutu: (s?: BildirimKutuSorgusu) => Promise<BildirimKutuSayfasi>;
  okunmamisSayisi: () => Promise<number>;
  okundu: (id: string) => Promise<void>;
  tumunuOku: () => Promise<number>;
  arsivle: (id: string) => Promise<void>;

  tercihler: () => Promise<BildirimTercihi[]>;
  tercihGuncelle: (g: BildirimTercihGuncellemesi[]) => Promise<BildirimTercihi[]>;
  ayarlar: () => Promise<BildirimAyarlari>;
  ayarGuncelle: (g: Partial<BildirimAyarlari>) => Promise<BildirimAyarlari>;
}
