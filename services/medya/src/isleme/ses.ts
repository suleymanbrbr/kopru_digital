import { parseBuffer } from 'music-metadata';

/**
 * Ses suresini (saniye, en yakin tam sayiya yuvarlanmis) cikarir. Sure bulunamazsa `null` (cagiran dosyayi
 * `bozuk_dosya` sayar: suresi dogrulanamayan ses 180 sn sinirini asabilir). Cozumlenemeyen icerik firlatir.
 *
 * Siralama: (1) `music-metadata` (baslikta sure ya da bit hizi); (2) basliksiz akislar icin dosyanin tamamini
 * tarama: Chrome `MediaRecorder` WebM/Opus (baslikta sure yok, bilinmeyen boyutlu Segment/Cluster) blok
 * zamanlarindan, Ogg/Opus son sayfanin granule konumundan.
 */
export async function sesSuresiSn(govde: Buffer, mime: string): Promise<number | null> {
  const meta = await parseBuffer(
    new Uint8Array(govde),
    { mimeType: mime, size: govde.length },
    { duration: true },
  );
  let sure = meta.format.duration;
  if ((sure === undefined || !Number.isFinite(sure)) && meta.format.bitrate) {
    sure = (govde.length * 8) / meta.format.bitrate;
  }
  if (sure === undefined || !Number.isFinite(sure)) {
    sure = webmSuresi(govde) ?? oggOpusSuresi(govde) ?? undefined;
  }
  if (sure === undefined || !Number.isFinite(sure) || sure < 0) return null;
  return Math.round(sure);
}

// --- WebM (Matroska/EBML) ---------------------------------------------------------------------

const EBML_BASLIK = 0x1a45dfa3;
/** Icine girilen (duz taranan) ana ogeler. Digerleri boyutuna gore atlanir. */
const GIRILEN = new Set([
  0x18538067 /* Segment */, 0x1549a966 /* Info */, 0x1f43b675 /* Cluster */, 0xa0 /* BlockGroup */,
]);
const ID = {
  zamanOlcegi: 0x2ad7b1,
  kumeZamani: 0xe7,
  basitBlok: 0xa3,
  blok: 0xa1,
  blokSuresi: 0x9b,
} as const;

function idOku(b: Buffer, p: number): { id: number; uzunluk: number } | null {
  const ilk = b[p];
  if (ilk === undefined || ilk === 0) return null;
  const uzunluk = Math.clz32(ilk) - 23; // 1..4
  if (uzunluk > 4 || p + uzunluk > b.length) return null;
  let id = 0;
  for (let i = 0; i < uzunluk; i++) id = id * 256 + (b[p + i] ?? 0);
  return { id, uzunluk };
}

/** `boyut: null` = bilinmeyen boyut (tum veri bitleri 1). */
function boyutOku(b: Buffer, p: number): { boyut: number | null; uzunluk: number } | null {
  const ilk = b[p];
  if (ilk === undefined || ilk === 0) return null;
  const uzunluk = Math.clz32(ilk) - 23; // 1..8
  if (uzunluk > 8 || p + uzunluk > b.length) return null;
  let deger = ilk & (0xff >> uzunluk);
  let hepsiBir = deger === 0xff >> uzunluk;
  for (let i = 1; i < uzunluk; i++) {
    const bayt = b[p + i] ?? 0;
    if (bayt !== 0xff) hepsiBir = false;
    deger = deger * 256 + bayt;
  }
  return { boyut: hepsiBir ? null : deger, uzunluk };
}

function tamSayiOku(b: Buffer, p: number, n: number): number {
  let d = 0;
  for (let i = 0; i < n; i++) d = d * 256 + (b[p + i] ?? 0);
  return d;
}

/** Opus TOC baytindan paket suresi (ms). */
function opusPaketMs(toc: number, sonraki: number): number {
  const config = toc >> 3;
  const c = toc & 3;
  let kare: number;
  if (config < 12) kare = [10, 20, 40, 60][config % 4] ?? 20;
  else if (config < 16) kare = config % 2 === 0 ? 10 : 20;
  else kare = [2.5, 5, 10, 20][config % 4] ?? 20;
  const kareSayisi = c === 0 ? 1 : c === 3 ? Math.max(1, sonraki & 0x3f) : 2;
  return kare * kareSayisi;
}

/**
 * WebM/Opus suresi: son blogun mutlak zamani + suresi. Basliktaki `Duration`a guvenilmez (Chrome yazmaz);
 * tum Cluster'lar taranir. Blok yoksa ya da bicim WebM degilse `null`.
 */
export function webmSuresi(b: Buffer): number | null {
  const ilk = idOku(b, 0);
  if (ilk?.id !== EBML_BASLIK) return null;
  let olcek = 1_000_000; // ns / zaman birimi (Matroska varsayilani: 1 ms)
  let kume = 0;
  let enGecMs = -1;
  let p = 0;
  let guvenlik = 0;
  while (p < b.length && guvenlik++ < 5_000_000) {
    const id = idOku(b, p);
    if (!id) break;
    const bo = boyutOku(b, p + id.uzunluk);
    if (!bo) break;
    const veri = p + id.uzunluk + bo.uzunluk;
    if (GIRILEN.has(id.id)) {
      p = veri; // icine gir (bilinmeyen boyut dahil)
      continue;
    }
    if (bo.boyut === null) break; // boyutsuz, bilinmeyen oge: guvenle atlanamaz
    const son = veri + bo.boyut;
    if (son > b.length) {
      // Kesik son oge (yarim yazilmis blok): taranan kismi say.
      break;
    }
    if (id.id === ID.zamanOlcegi) olcek = tamSayiOku(b, veri, bo.boyut);
    else if (id.id === ID.kumeZamani) kume = tamSayiOku(b, veri, bo.boyut);
    else if (id.id === ID.basitBlok || id.id === ID.blok) {
      const iz = boyutOku(b, veri); // iz numarasi (vint)
      if (iz) {
        const rel = veri + iz.uzunluk;
        const goreli = ((((b[rel] ?? 0) << 8) | (b[rel + 1] ?? 0)) << 16) >> 16; // isaretli int16
        const bayrak = b[rel + 2] ?? 0;
        const birimMs = olcek / 1_000_000;
        const baslangicMs = (kume + goreli) * birimMs;
        let sureMs = 20;
        if ((bayrak & 0x06) === 0 && rel + 3 < son)
          sureMs = opusPaketMs(b[rel + 3] ?? 0, b[rel + 4] ?? 0);
        enGecMs = Math.max(enGecMs, baslangicMs + sureMs);
      }
    }
    p = son;
  }
  if (enGecMs < 0) return null;
  return enGecMs / 1000;
}

// --- Ogg/Opus ---------------------------------------------------------------------------------

/** Ogg/Opus suresi: son sayfanin granule konumu (48 kHz) - on atlama. Baska kodek ya da bozuksa `null`. */
export function oggOpusSuresi(b: Buffer): number | null {
  if (b.subarray(0, 4).toString('latin1') !== 'OggS') return null;
  const bas = b.indexOf('OpusHead');
  if (bas < 0 || bas > 200) return null;
  const onAtlama = b.readUInt16LE(bas + 10);
  const son = b.lastIndexOf('OggS');
  if (son < 0 || son + 14 > b.length) return null;
  const granule = b.readBigInt64LE(son + 6);
  if (granule < 0n) return null;
  const ornek = Number(granule) - onAtlama;
  return ornek > 0 ? ornek / 48000 : null;
}
