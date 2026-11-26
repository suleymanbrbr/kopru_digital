import * as FileSystem from 'expo-file-system/legacy';
import { Platform, Share } from 'react-native';

import type { VeriDosyasi } from '../api/tipler';

/** Paylas sayfasi icerigi: iOS'ta dosya adresi, Android'de metin. */
export type PaylasimIcerigi = { title: string } & ({ url: string } | { message: string });

export interface DisaAktarBagimliliklari {
  platform?: string;
  /** Dosyayi gecici dizine yazar, uri dondurur. */
  yaz?: (dosyaAdi: string, icerik: string) => Promise<string>;
  sil?: (uri: string) => Promise<void>;
  paylas?: (secenek: PaylasimIcerigi) => Promise<unknown>;
}

async function varsayilanYaz(dosyaAdi: string, icerik: string): Promise<string> {
  const dizin = FileSystem.cacheDirectory;
  if (!dizin) throw new Error('Gecici dizin yok.');
  const uri = `${dizin}${dosyaAdi}`;
  await FileSystem.writeAsStringAsync(uri, icerik, { encoding: FileSystem.EncodingType.UTF8 });
  return uri;
}

async function varsayilanSil(uri: string): Promise<void> {
  await FileSystem.deleteAsync(uri, { idempotent: true });
}

/**
 * Kisisel veri JSON'unu isletim sisteminin paylas sayfasiyla disa verir. iOS: gecici dosya
 * (`.json`) paylasilir, sayfa kapaninca dosya silinir (kisisel veri onbellekte kalmaz). Android'in
 * `Share` modulu dosya yerine yalniz metni paylasir; JSON metin olarak gider.
 */
export async function veriyiPaylas(
  dosya: VeriDosyasi,
  baslik: string,
  bag: DisaAktarBagimliliklari = {},
): Promise<void> {
  const platform = bag.platform ?? Platform.OS;
  const paylas = bag.paylas ?? ((s) => Share.share(s, { dialogTitle: s.title }));
  if (platform !== 'ios') {
    await paylas({ message: dosya.icerik, title: baslik });
    return;
  }
  const uri = await (bag.yaz ?? varsayilanYaz)(dosya.dosyaAdi, dosya.icerik);
  try {
    await paylas({ url: uri, title: baslik });
  } finally {
    await (bag.sil ?? varsayilanSil)(uri).catch(() => undefined);
  }
}
