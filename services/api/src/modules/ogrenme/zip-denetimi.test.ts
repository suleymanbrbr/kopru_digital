import { deflateRawSync } from 'node:zlib';

import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';

import { zipiDenetle } from './zip-denetimi.js';

/** Tek dosyalik, merkezi dizini dogru (durust) en kucuk zip. */
function tekDosyaliZip(ad: string, icerik: Buffer): Buffer {
  const sikistirilmis = deflateRawSync(icerik);
  const adBayt = Buffer.from(ad, 'utf8');
  const yerel = Buffer.alloc(30);
  yerel.writeUInt32LE(0x04034b50, 0);
  yerel.writeUInt16LE(20, 4);
  yerel.writeUInt16LE(8, 8);
  yerel.writeUInt32LE(sikistirilmis.length, 18);
  yerel.writeUInt32LE(icerik.length, 22);
  yerel.writeUInt16LE(adBayt.length, 26);
  const merkezi = Buffer.alloc(46);
  merkezi.writeUInt32LE(0x02014b50, 0);
  merkezi.writeUInt16LE(20, 4);
  merkezi.writeUInt16LE(20, 6);
  merkezi.writeUInt16LE(8, 10);
  merkezi.writeUInt32LE(sikistirilmis.length, 20);
  merkezi.writeUInt32LE(icerik.length, 24);
  merkezi.writeUInt16LE(adBayt.length, 28);
  const veriKismi = Buffer.concat([yerel, adBayt, sikistirilmis]);
  const dizin = Buffer.concat([merkezi, adBayt]);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(dizin.length, 12);
  eocd.writeUInt32LE(veriKismi.length, 16);
  return Buffer.concat([veriKismi, dizin, eocd]);
}

const SINIR = { acilmisBayt: 20 * 1024 * 1024, dosyaSayisi: 200 };

describe('zipiDenetle', () => {
  it('gercek bir .xlsx gecer', async () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet('Deneme').addRow(['ogrenci_id', 'turkce_dogru']);
    const veri = Buffer.from(await wb.xlsx.writeBuffer());
    const sonuc = zipiDenetle(veri, SINIR);
    expect(sonuc.ok).toBe(true);
  });

  it('kucuk ama acilinca dev olan arsiv (zip bombasi) acilmadan reddedilir', () => {
    const bomba = tekDosyaliZip('xl/worksheets/sheet1.xml', Buffer.alloc(50 * 1024 * 1024, 0x41));
    expect(bomba.length).toBeLessThan(2 * 1024 * 1024);
    expect(zipiDenetle(bomba, SINIR)).toEqual({ ok: false, neden: 'cok_buyuk' });
  });

  it('zip olmayan, cok dosyali ve bozuk girdiler', () => {
    expect(zipiDenetle(Buffer.from('merhaba dunya, bu bir zip degil'), SINIR)).toEqual({
      ok: false,
      neden: 'zip_degil',
    });
    const kucuk = tekDosyaliZip('a.txt', Buffer.from('x'));
    expect(zipiDenetle(kucuk, { ...SINIR, dosyaSayisi: 0 })).toEqual({
      ok: false,
      neden: 'cok_dosya',
    });
    const bozuk = Buffer.from(kucuk);
    // merkezi dizin imzasini boz
    bozuk.writeUInt32LE(0, bozuk.length - 22 - 46 - 5);
    expect(zipiDenetle(bozuk, SINIR)).toEqual({ ok: false, neden: 'bozuk' });
  });
});
