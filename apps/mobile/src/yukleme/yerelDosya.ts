import * as Crypto from 'expo-crypto';
import * as FileSystem from 'expo-file-system/legacy';

import type { YerelDosyaBilgisi } from '../api/medyaTipleri';
import { ApiHata } from '../api/tipler';

const ALFABE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Standart base64 -> bayt (Hermes `atob`a bagimli degildir; testlenir). */
export function base64ToBytes(b64: string): Uint8Array {
  const temiz = b64.replace(/[^A-Za-z0-9+/]/g, '');
  const cikti = new Uint8Array(Math.floor((temiz.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < temiz.length; i += 4) {
    const a = ALFABE.indexOf(temiz.charAt(i));
    const b = ALFABE.indexOf(temiz.charAt(i + 1));
    const c = i + 2 < temiz.length ? ALFABE.indexOf(temiz.charAt(i + 2)) : -1;
    const d = i + 3 < temiz.length ? ALFABE.indexOf(temiz.charAt(i + 3)) : -1;
    cikti[o++] = (a << 2) | (b >> 4);
    if (c >= 0) cikti[o++] = ((b & 15) << 4) | (c >> 2);
    if (d >= 0) cikti[o++] = ((c & 3) << 6) | d;
  }
  return cikti.subarray(0, o);
}

function onaltilik(tampon: ArrayBuffer): string {
  return Array.from(new Uint8Array(tampon), (x) => x.toString(16).padStart(2, '0')).join('');
}

/** Yerel dosyanin boyutu ve SHA-256 ozeti (medya servisi sunucuda dogrular). */
export async function yerelBilgiOku(uri: string): Promise<YerelDosyaBilgisi> {
  const bilgi = await FileSystem.getInfoAsync(uri);
  if (!bilgi.exists) throw new ApiHata('bulunamadi', 'Yerel dosya yok.');
  const b64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
  const bayt = base64ToBytes(b64);
  const ozet = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, bayt as BufferSource);
  return { boyutBayt: bayt.length, sha256: onaltilik(ozet) };
}

/**
 * Presigned PUT. Varsayilan oturum turu `BACKGROUND`tur: iOS'ta yukleme uygulama arka plandayken de
 * (ve sunucu/baglanti kesikken yeniden deneyerek) surer; Promise uygulama oldurulurse kaybolur, bu
 * yuzden yukleme kuyrugu acilista `tamam` ile dosyanin vardigini sorgular.
 */
export async function presignedPutYukle(
  url: string,
  basliklar: Record<string, string>,
  yerelUri: string,
): Promise<void> {
  let sonuc: FileSystem.FileSystemUploadResult;
  try {
    sonuc = await FileSystem.uploadAsync(url, yerelUri, {
      httpMethod: 'PUT',
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
      headers: basliklar,
      sessionType: FileSystem.FileSystemSessionType.BACKGROUND,
    });
  } catch (e) {
    throw new ApiHata('ag', e instanceof Error ? e.message : undefined);
  }
  if (sonuc.status >= 200 && sonuc.status < 300) return;
  // 403 (suresi dolmus adres / imza) yeni izinle yeniden denenir; 5xx gecici.
  throw new ApiHata(sonuc.status >= 500 ? 'sunucu' : 'dogrulama', `PUT ${String(sonuc.status)}`, {
    durum: sonuc.status,
    ayrinti: sonuc.status === 403 ? 'yukleme_adresi_gecersiz' : 'yukleme_reddedildi',
    yenidenDenenebilir: true,
  });
}

const KOK = `${FileSystem.documentDirectory ?? ''}soru-yukleme/`;

/** Gecici (onbellek) dosyayi uygulama belgeleri altina tasir: isletim sistemi onbellegi temizleyemez. */
export async function kaliciYap(uri: string, ad: string): Promise<string> {
  if (!KOK) return uri;
  await FileSystem.makeDirectoryAsync(KOK, { intermediates: true }).catch(() => undefined);
  const hedef = `${KOK}${ad}`;
  await FileSystem.copyAsync({ from: uri, to: hedef });
  return hedef;
}

export async function yerelSil(uri: string): Promise<void> {
  await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined);
}
