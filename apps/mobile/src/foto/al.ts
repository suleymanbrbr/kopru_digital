import * as ImagePicker from 'expo-image-picker';

export interface AlinanFoto {
  uri: string;
  genislik: number;
  yukseklik: number;
}

export type AlmaSonucu =
  | { durum: 'tamam'; fotograflar: AlinanFoto[] }
  | { durum: 'iptal' }
  /** Kamera izni reddedildi (galeri secicisi izin istemez). */
  | { durum: 'izin' }
  /** Cihazda kamera yok (simulator) ya da acilamadi. */
  | { durum: 'yok' };

const cevir = (a: ImagePicker.ImagePickerAsset): AlinanFoto => ({
  uri: a.uri,
  genislik: a.width,
  yukseklik: a.height,
});

/** Sistem kamerasiyla tek fotograf ceker (tam cozunurluk; kirpma/kuculme `fotoHazirla`da). */
export async function kameradanAl(): Promise<AlmaSonucu> {
  try {
    const izin = await ImagePicker.requestCameraPermissionsAsync();
    if (!izin.granted) return { durum: 'izin' };
    const s = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 1,
      exif: false,
    });
    return s.canceled ? { durum: 'iptal' } : { durum: 'tamam', fotograflar: s.assets.map(cevir) };
  } catch {
    return { durum: 'yok' };
  }
}

/** Galeriden en cok `sinir` fotograf secer (iOS PHPicker: izin penceresi gerekmez). */
export async function galeridenAl(sinir: number): Promise<AlmaSonucu> {
  try {
    const s = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: sinir > 1,
      selectionLimit: Math.max(1, sinir),
      quality: 1,
      exif: false,
    });
    return s.canceled ? { durum: 'iptal' } : { durum: 'tamam', fotograflar: s.assets.map(cevir) };
  } catch {
    return { durum: 'yok' };
  }
}
