/**
 * `.xlsx` bir zip arsividir. Yukleme sinirinin (2 MB) sikistirilmis boyuta uygulanmasi "zip bombasi"na
 * karsi yetmez: kucuk bir dosya acilinca gigabaytlara cikip sureci bellekten dusurebilir. Bu denetim
 * arsivi ACMADAN merkezi dizindeki acilmis boyutlari toplar ve sinirlar.
 *
 * Sinir: merkezi dizin yalan soyleyebilir. Acici (JSZip) acilan veriyi bildirilen boyutla karsilastirip
 * uyusmazlikta hata verir, yani yalanci bir dizin dosyayi gecerli yapmaz; ama bu kontrol acmadan sonra
 * yapildigi icin buradaki on denetim yalnizca durust bildirilen (tipik) bombayi durdurur.
 */
const EOCD_IMZASI = 0x06054b50;
const MERKEZI_IMZA = 0x02014b50;
const EOCD_EN_KISA = 22;
const YORUM_UST = 0xffff;

export interface ZipSiniri {
  /** Acilmis toplam boyut ust siniri (bayt). */
  acilmisBayt: number;
  /** Arsivdeki en cok dosya sayisi. */
  dosyaSayisi: number;
}

export type ZipDenetimi =
  | { ok: true; acilmisBayt: number; dosyaSayisi: number }
  | { ok: false; neden: 'zip_degil' | 'zip64' | 'cok_buyuk' | 'cok_dosya' | 'bozuk' };

export function zipiDenetle(veri: Buffer, sinir: ZipSiniri): ZipDenetimi {
  const enAlt = Math.max(0, veri.length - EOCD_EN_KISA - YORUM_UST);
  let eocd = -1;
  for (let i = veri.length - EOCD_EN_KISA; i >= enAlt; i--) {
    if (veri.readUInt32LE(i) === EOCD_IMZASI) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return { ok: false, neden: 'zip_degil' };

  const kayitSayisi = veri.readUInt16LE(eocd + 10);
  const dizinBoyutu = veri.readUInt32LE(eocd + 12);
  const dizinBaslangici = veri.readUInt32LE(eocd + 16);
  if (kayitSayisi === 0xffff || dizinBoyutu === 0xffffffff || dizinBaslangici === 0xffffffff) {
    return { ok: false, neden: 'zip64' };
  }
  if (kayitSayisi > sinir.dosyaSayisi) return { ok: false, neden: 'cok_dosya' };
  if (dizinBaslangici + dizinBoyutu > eocd) return { ok: false, neden: 'bozuk' };

  let konum = dizinBaslangici;
  let toplam = 0;
  for (let n = 0; n < kayitSayisi; n++) {
    if (konum + 46 > eocd || veri.readUInt32LE(konum) !== MERKEZI_IMZA) {
      return { ok: false, neden: 'bozuk' };
    }
    const acilmis = veri.readUInt32LE(konum + 24);
    if (acilmis === 0xffffffff) return { ok: false, neden: 'zip64' };
    toplam += acilmis;
    if (toplam > sinir.acilmisBayt) return { ok: false, neden: 'cok_buyuk' };
    const adUzunlugu = veri.readUInt16LE(konum + 28);
    const ekUzunlugu = veri.readUInt16LE(konum + 30);
    const yorumUzunlugu = veri.readUInt16LE(konum + 32);
    konum += 46 + adUzunlugu + ekUzunlugu + yorumUzunlugu;
  }
  return { ok: true, acilmisBayt: toplam, dosyaSayisi: kayitSayisi };
}
