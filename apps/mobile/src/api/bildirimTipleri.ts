import type {
  BildirimAyarlari,
  BildirimCihazKayit,
  BildirimKategori,
  BildirimKutuOgesi,
  BildirimKanal,
  Duyuru,
  DuyuruAliciOgesi,
  DuyuruAliciRol,
  DuyuruDetay,
  DuyuruDurum,
  DuyuruGuncelle,
  DuyuruOlustur,
} from '@kopru/contracts';

/**
 * Bildirim servisi adaptor tipleri. Okuma modelleri sozlesmeyle (`@kopru/contracts`, snake_case)
 * aynidir. Kutu, tercih ve ayar uclari etkin kuruma baglidir; cihaz uclari kullanici duzeyindedir.
 */
export type { BildirimAyarlari, BildirimCihazKayit, BildirimKategori, BildirimKutuOgesi };
export type {
  Duyuru,
  DuyuruAliciOgesi,
  DuyuruAliciRol,
  DuyuruDetay,
  DuyuruDurum,
  DuyuruGuncelle,
  DuyuruOlustur,
};
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

export interface DuyuruAliciSayfasi {
  ogeler: DuyuruAliciOgesi[];
  toplam: number;
}

export interface DuyuruYonetimSayfasi {
  ogeler: Duyuru[];
  toplam: number;
}

export interface DuyuruSorgusu {
  limit?: number;
  offset?: number;
  okunmamis?: boolean;
}

export interface DuyuruYonetimSorgusu {
  durum?: DuyuruDurum;
  limit?: number;
  offset?: number;
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

  /** Duyurularim (alici): sabitler uste, yayin zamanina gore yeniden eskiye. */
  duyurularim: (s?: DuyuruSorgusu) => Promise<DuyuruAliciSayfasi>;
  /** Tekil duyuru; yazar/yonetici icin `yonetim` blogu dolar. */
  duyuru: (id: string) => Promise<DuyuruDetay>;
  /** Ilk okumada sayaci artirir; tekrar okumada zararsiz. */
  duyuruOkundu: (id: string) => Promise<void>;
  /** Ogretmen: kendi duyurulari; yonetici/sahip: kurumun tumu (alici ve okunan sayisiyla). */
  duyuruYonetim: (s?: DuyuruYonetimSorgusu) => Promise<DuyuruYonetimSayfasi>;
  duyuruTaslak: (g: DuyuruOlustur) => Promise<Duyuru>;
  duyuruGuncelle: (id: string, g: DuyuruGuncelle) => Promise<Duyuru>;
  duyuruYayinla: (id: string) => Promise<Duyuru>;
  duyuruArsivle: (id: string) => Promise<Duyuru>;
  duyuruSil: (id: string) => Promise<void>;
}
