import { fileTypeFromBuffer } from 'file-type';

/**
 * Bildirilen MIME -> bayt imzasindan (magic bytes) cikabilecek MIME'lar. Ayni kapsayici bicim farkli
 * adlarla taninabilir (`.m4a` -> `audio/x-m4a`, MediaRecorder `audio/webm` -> `video/webm`).
 */
const DENK_MIME: Readonly<Record<string, readonly string[]>> = {
  'image/jpeg': ['image/jpeg'],
  'image/png': ['image/png'],
  'image/webp': ['image/webp'],
  'application/pdf': ['application/pdf'],
  'audio/mp4': ['audio/mp4', 'audio/x-m4a', 'audio/m4a', 'video/mp4'],
  'audio/aac': ['audio/aac'],
  'audio/mpeg': ['audio/mpeg'],
  'audio/webm': ['audio/webm', 'video/webm'],
  'audio/ogg': ['audio/ogg', 'audio/opus', 'audio/vorbis', 'video/ogg', 'application/ogg'],
};

export type IcerikSinifi = 'gorsel' | 'ses' | 'pdf';

export function icerikSinifi(mime: string): IcerikSinifi | null {
  if (mime.startsWith('image/')) return 'gorsel';
  if (mime.startsWith('audio/')) return 'ses';
  if (mime === 'application/pdf') return 'pdf';
  return null;
}

/** Bayt imzasindan icerik turunu bulur; taninmazsa (duz metin, rastgele bayt) `undefined`. */
export async function icerikTuruTespit(govde: Buffer): Promise<string | undefined> {
  const sonuc = await fileTypeFromBuffer(govde);
  return sonuc?.mime.split(';')[0]?.trim();
}

export function mimeUyusuyor(bildirilen: string, tespit: string | undefined): boolean {
  if (!tespit) return false;
  const kabul = DENK_MIME[bildirilen];
  return kabul?.includes(tespit) ?? false;
}
