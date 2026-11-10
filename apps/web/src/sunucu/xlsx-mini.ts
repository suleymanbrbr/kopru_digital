/**
 * Mock modu icin kucuk `.xlsx` yazici/okuyucu (yalniz deneme ve e2e): sikistirmasiz ("stored") ZIP
 * icinde tek sayfa, metinler `inlineStr`. Gercek Excel dosyalari sikistirilmis olabilir; mock yalniz
 * kendi urettigi dosyalari okur. Yeni bagimlilik eklememek icin elle yazildi.
 */

export type Hucre = string | number | null;

const kodlayici = new TextEncoder();
const cozucu = new TextDecoder();

const CRC_TABLO = (() => {
  const tablo: number[] = [];
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    tablo.push(c >>> 0);
  }
  return tablo;
})();

function crc32(bayt: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bayt) c = (CRC_TABLO[(c ^ b) & 0xff] ?? 0) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function kacir(metin: string): string {
  return metin
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function sutunHarfi(i: number): string {
  let s = '';
  let n = i + 1;
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function sayfaXml(satirlar: readonly (readonly Hucre[])[]): string {
  const govde = satirlar
    .map((satir, r) => {
      const hucreler = satir
        .map((h, c) => {
          if (h === null || h === '') return '';
          const ad = `${sutunHarfi(c)}${String(r + 1)}`;
          return typeof h === 'number'
            ? `<c r="${ad}"><v>${String(h)}</v></c>`
            : `<c r="${ad}" t="inlineStr"><is><t>${kacir(h)}</t></is></c>`;
        })
        .join('');
      return `<row r="${String(r + 1)}">${hucreler}</row>`;
    })
    .join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${govde}</sheetData></worksheet>`;
}

function u16(n: number): number[] {
  return [n & 0xff, (n >>> 8) & 0xff];
}
function u32(n: number): number[] {
  return [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];
}

/** Tek sayfali (`Veri`) gecerli bir `.xlsx` uretir; `PK` ile baslar. */
export function xlsxYaz(satirlar: readonly (readonly Hucre[])[]): Uint8Array {
  const dosyalar: [string, string][] = [
    [
      '[Content_Types].xml',
      '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
    ],
    [
      '_rels/.rels',
      '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    ],
    [
      'xl/workbook.xml',
      '<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Veri" sheetId="1" r:id="rId1"/></sheets></workbook>',
    ],
    [
      'xl/_rels/workbook.xml.rels',
      '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    ],
    ['xl/worksheets/sheet1.xml', sayfaXml(satirlar)],
  ];
  const parcalar: number[][] = [];
  const merkez: number[][] = [];
  let konum = 0;
  for (const [ad, icerik] of dosyalar) {
    const adBayt = [...kodlayici.encode(ad)];
    const veri = kodlayici.encode(icerik);
    const crc = crc32(veri);
    const yerel = [
      ...u32(0x04034b50),
      ...u16(20),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u32(crc),
      ...u32(veri.length),
      ...u32(veri.length),
      ...u16(adBayt.length),
      ...u16(0),
      ...adBayt,
    ];
    parcalar.push(yerel, [...veri]);
    merkez.push([
      ...u32(0x02014b50),
      ...u16(20),
      ...u16(20),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u32(crc),
      ...u32(veri.length),
      ...u32(veri.length),
      ...u16(adBayt.length),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u32(0),
      ...u32(konum),
      ...adBayt,
    ]);
    konum += yerel.length + veri.length;
  }
  const merkezBoyut = merkez.reduce((t, p) => t + p.length, 0);
  const son = [
    ...u32(0x06054b50),
    ...u16(0),
    ...u16(0),
    ...u16(dosyalar.length),
    ...u16(dosyalar.length),
    ...u32(merkezBoyut),
    ...u32(konum),
    ...u16(0),
  ];
  return Uint8Array.from([...parcalar.flat(), ...merkez.flat(), ...son]);
}

function xmlCoz(metin: string): string {
  return metin
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&');
}

/** `xlsxYaz` ciktisini (ya da sikistirmasiz baska bir `.xlsx`i) okur; gecersizse `null`. */
export function xlsxOku(bayt: Uint8Array): Hucre[][] | null {
  if (bayt.length < 22 || bayt[0] !== 0x50 || bayt[1] !== 0x4b) return null;
  const gorunum = new DataView(bayt.buffer, bayt.byteOffset, bayt.byteLength);
  let p = 0;
  while (p + 30 <= bayt.length && gorunum.getUint32(p, true) === 0x04034b50) {
    const yontem = gorunum.getUint16(p + 8, true);
    const boyut = gorunum.getUint32(p + 18, true);
    const adBoyut = gorunum.getUint16(p + 26, true);
    const ekBoyut = gorunum.getUint16(p + 28, true);
    const ad = cozucu.decode(bayt.subarray(p + 30, p + 30 + adBoyut));
    const baslangic = p + 30 + adBoyut + ekBoyut;
    if (ad === 'xl/worksheets/sheet1.xml') {
      if (yontem !== 0) return null;
      return sayfayiOku(cozucu.decode(bayt.subarray(baslangic, baslangic + boyut)));
    }
    p = baslangic + boyut;
  }
  return null;
}

function sutunSirasi(ad: string): number {
  let n = 0;
  for (const h of ad.replace(/\d+/g, '')) n = n * 26 + (h.charCodeAt(0) - 64);
  return n - 1;
}

function sayfayiOku(xml: string): Hucre[][] {
  const satirlar: Hucre[][] = [];
  for (const s of xml.matchAll(/<row [^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
    const satir: Hucre[] = [];
    for (const h of (s[2] ?? '').matchAll(/<c r="([A-Z]+\d+)"([^>]*)>([\s\S]*?)<\/c>/g)) {
      const sira = sutunSirasi(h[1] ?? 'A1');
      const govde = h[3] ?? '';
      const metin = /<t[^>]*>([\s\S]*?)<\/t>/.exec(govde)?.[1];
      const deger = /<v>([\s\S]*?)<\/v>/.exec(govde)?.[1];
      const formul = govde.includes('<f');
      let sonuc: Hucre = null;
      if (formul) sonuc = '=formul';
      else if (metin !== undefined) sonuc = xmlCoz(metin);
      else if (deger !== undefined) sonuc = Number(deger);
      while (satir.length < sira) satir.push(null);
      satir[sira] = sonuc;
    }
    satirlar[Number(s[1]) - 1] = satir;
  }
  return Array.from({ length: satirlar.length }, (_, i) => satirlar[i] ?? []);
}
