import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';

import { sablonUret } from './deneme-excel.js';

describe('guvenlik: excel formul enjeksiyonu', () => {
  it('deneme sablonunda ogrenci no, ad ve bolum adi = + - @ ile baslarsa kacirilir', async () => {
    const buf = await sablonUret(
      {
        id: 'k',
        ad: '=ad',
        kod: 'kod',
        yanlis_katsayisi: '0.25',
        bolumler: [{ bolum_kodu: 'tyt', ad: '=HYPERLINK("http://x","t")', soru_sayisi: 40 }],
      } as never,
      [
        { id: 'u1', ogrenci_no: '=1+1', gorunen_ad: '@SUM(A1)' },
        { id: 'u2', ogrenci_no: '-2', gorunen_ad: '+3' },
      ],
    );
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as never);
    const veri = wb.getWorksheet('Veri');
    expect(veri?.getCell(2, 2).value).toBe("'=1+1");
    expect(veri?.getCell(2, 3).value).toBe("'@SUM(A1)");
    expect(veri?.getCell(3, 2).value).toBe("'-2");
    expect(veri?.getCell(3, 3).value).toBe("'+3");
    const bilgi = wb.getWorksheet('Bilgi');
    const metinler: string[] = [];
    bilgi?.eachRow((row) => {
      row.eachCell((c) => {
        if (typeof c.value === 'string') metinler.push(c.value);
      });
    });
    expect(metinler).toContain(`'=HYPERLINK("http://x","t")`);
    expect(metinler.some((m) => /^[=+\-@]/.test(m))).toBe(false);
  });
});
