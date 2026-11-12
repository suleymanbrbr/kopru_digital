import type { ImageSourcePropType } from 'react-native';

// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro varlik baglamasi
const DEFTER = require('../../assets/soru/defter.jpg') as number;

/** Mock adaptorun `mock://` adresleri paketle gelen ornek gorsele, gercek adresler uri'ye cevrilir. */
export function gorselKaynagi(url: string): ImageSourcePropType {
  return url.startsWith('mock://') ? DEFTER : { uri: url };
}

/** Skia `useImage` icin: mock ise varlik numarasi, degilse uri metni. */
export function skiaKaynagi(url: string): string | number {
  return url.startsWith('mock://') ? DEFTER : url;
}
