import {
  DENEME_TOPLU_SATIR_SINIRI,
  denemeHataKodlari,
  type DenemeBolumGirdisi,
  type DenemeSatirHatasi,
} from '@kopru/contracts';
import { AppError } from '@kopru/service-kit';
import ExcelJS from 'exceljs';
import { z } from 'zod';

import type { KuralSatiri } from './deneme-deposu.js';

/**
 * Deneme Excel sablonu ve yukleme ayrisitirici (saf: veritabani yok).
 * Sablon: `Veri` sayfasi (baslik + ogrenci satirlari) ve `Bilgi` sayfasi (kural ozeti, aciklama).
 * Basliklar ASCII alan kodlaridir: `ogrenci_id`, `ogrenci_no`, `ad` (yalniz bilgi), her bolum icin
 * `<bolum_kodu>_dogru` ve `<bolum_kodu>_yanlis`. `bos` hesaplanir.
 */

export const XLSX_TURU = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const VERI_SAYFASI = 'Veri';
/** Bos bicimlendirilmis satirlarla sisirilmis dosyalara karsi mutlak ust sinir. */
const SAYFA_SATIR_UST_SINIRI = 5000;
const SAYAC_UST = 1000;

const ayirtEdilemez = z.uuid();

/** `=`, `+`, `-`, `@` ile baslayan metni kacirir (formul enjeksiyonu). */
const hucreMetni = (s: string | null | undefined): string => {
  const v = s ?? '';
  return /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
};

export interface SablonUyesi {
  id: string;
  ogrenci_no: string | null;
  gorunen_ad: string | null;
}

export async function sablonUret(
  kural: KuralSatiri,
  uyeler: readonly SablonUyesi[],
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(VERI_SAYFASI, { views: [{ state: 'frozen', ySplit: 1 }] });
  const basliklar = [
    'ogrenci_id',
    'ogrenci_no',
    'ad',
    ...kural.bolumler.flatMap((b) => [`${b.bolum_kodu}_dogru`, `${b.bolum_kodu}_yanlis`]),
  ];
  ws.addRow(basliklar).font = { bold: true };
  ws.columns = basliklar.map((b, i) => ({ width: i === 0 ? 38 : i < 3 ? 18 : 14 }));
  for (const u of uyeler) ws.addRow([u.id, u.ogrenci_no ?? '', hucreMetni(u.gorunen_ad)]);
  // Puan hucreleri: 0..soru sayisi arasi tam sayi (Excel icinde uyari; sunucu yine dogrular).
  const sonSatir = Math.max(uyeler.length + 1, 31);
  kural.bolumler.forEach((b, i) => {
    for (const sutun of [4 + i * 2, 5 + i * 2]) {
      for (let r = 2; r <= sonSatir; r++) {
        ws.getCell(r, sutun).dataValidation = {
          type: 'whole',
          operator: 'between',
          allowBlank: true,
          formulae: [0, b.soru_sayisi],
          showErrorMessage: true,
          errorTitle: 'Geçersiz değer',
          error: `0 ile ${String(b.soru_sayisi)} arasında tam sayı girin.`,
        };
      }
    }
  });
  const bilgi = wb.addWorksheet('Bilgi');
  bilgi.addRow([`Deneme kuralı: ${kural.ad} (${kural.kod})`]).font = { bold: true };
  bilgi.addRow([`Yanlış katsayısı: ${kural.yanlis_katsayisi}`]);
  bilgi.addRow([]);
  bilgi.addRow(['bölüm kodu', 'bölüm', 'soru sayısı']).font = { bold: true };
  for (const b of kural.bolumler) bilgi.addRow([b.bolum_kodu, b.ad, b.soru_sayisi]);
  bilgi.addRow([]);
  for (const satir of [
    'Her bölüm için doğru ve yanlış sayısını girin; boş sayısı otomatik hesaplanır.',
    'Öğrenci, ogrenci_id sütunuyla eşleşir; ogrenci_id yoksa ogrenci_no kullanılır. ad sütunu yalnız bilgi içindir.',
    'Hiç puan girilmemiş satırlar atlanır. Formül içeren hücreler kabul edilmez.',
    'Deneme adı ve sınav tarihi dosyada değil, yükleme isteğinde verilir.',
  ]) {
    bilgi.addRow([satir]);
  }
  bilgi.getColumn(1).width = 28;
  bilgi.getColumn(2).width = 40;
  return Buffer.from(await wb.xlsx.writeBuffer());
}

// --- Yukleme ---------------------------------------------------------------------------------

export interface ExcelSatiri {
  satir: number;
  ogrenci_id: string | null;
  ogrenci_no: string | null;
  bolumler: DenemeBolumGirdisi[];
}

export interface ExcelSonucu {
  satirlar: ExcelSatiri[];
  /** Ayrisma sirasinda bulunan satir hatalari (bu satirlar `satirlar`da yok). */
  hatalar: DenemeSatirHatasi[];
  atlanan: number;
}

const gecersizDosya = (mesaj: string) => new AppError(422, denemeHataKodlari.excelGecersiz, mesaj);

type Hucre =
  | { tur: 'bos' }
  | { tur: 'sayi'; deger: number }
  | { tur: 'metin'; deger: string }
  | { tur: 'hata'; kod: string; mesaj: string };

const formulMu = (hucre: ExcelJS.Cell): boolean => {
  const v = hucre.value;
  return (
    hucre.type === ExcelJS.ValueType.Formula ||
    (typeof v === 'object' && v !== null && ('formula' in v || 'sharedFormula' in v))
  );
};

function hucreOku(hucre: ExcelJS.Cell): Hucre {
  const v = hucre.value;
  if (v === null || v === undefined) return { tur: 'bos' };
  if (formulMu(hucre)) {
    return { tur: 'hata', kod: 'formul_hucresi', mesaj: 'Formül içeren hücre kabul edilmez.' };
  }
  if (typeof v === 'number') return { tur: 'sayi', deger: v };
  if (typeof v === 'string') {
    const t = v.trim();
    return t === '' ? { tur: 'bos' } : { tur: 'metin', deger: t };
  }
  return { tur: 'hata', kod: 'hucre_gecersiz', mesaj: 'Hücre düz sayı ya da metin olmalı.' };
}

/** Puan hucresi: bos -> `null`; yalniz 0..1000 arasi tam sayi (metin/ondalik/negatif satir hatasi). */
function sayacOku(
  h: Hucre,
  ad: string,
): { deger: number | null; hata?: { kod: string; mesaj: string } } {
  if (h.tur === 'bos') return { deger: null };
  if (h.tur === 'hata') return { deger: null, hata: { kod: h.kod, mesaj: `${ad}: ${h.mesaj}` } };
  if (h.tur === 'metin' || !Number.isInteger(h.deger) || h.deger < 0 || h.deger > SAYAC_UST) {
    return {
      deger: null,
      hata: {
        kod: 'sayi_degil',
        mesaj: `${ad}: 0 ile ${String(SAYAC_UST)} arasında tam sayı olmalı.`,
      },
    };
  }
  return { deger: h.deger };
}

/**
 * `.xlsx` govdesini ayristirir. Dosya bozuksa, `Veri` sayfasi/baslik yoksa ya da satir siniri asilirsa
 * 422 `excel_gecersiz`; satir hatalari (formul, sayi degil, tanimsiz ogrenci kimligi bicimi) listelenir.
 */
export async function excelOku(govde: Buffer, kural: KuralSatiri): Promise<ExcelSonucu> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(govde as unknown as ExcelJS.Buffer);
  } catch {
    throw gecersizDosya('Dosya geçerli bir .xlsx değil.');
  }
  const ws = wb.getWorksheet(VERI_SAYFASI) ?? wb.worksheets[0];
  if (!ws) throw gecersizDosya('Çalışma sayfası bulunamadı.');
  if (ws.rowCount > SAYFA_SATIR_UST_SINIRI) {
    throw gecersizDosya(`Sayfa ${String(SAYFA_SATIR_UST_SINIRI)} satırı aşıyor.`);
  }

  const sutunlar = new Map<string, number>();
  ws.getRow(1).eachCell({ includeEmpty: false }, (hucre, sutun) => {
    const h = hucreOku(hucre);
    if (h.tur === 'metin') sutunlar.set(h.deger.toLowerCase(), sutun);
  });
  const idSutunu = sutunlar.get('ogrenci_id');
  const noSutunu = sutunlar.get('ogrenci_no');
  if (idSutunu === undefined && noSutunu === undefined) {
    throw gecersizDosya('Başlık satırında ogrenci_id ya da ogrenci_no sütunu yok.');
  }
  const bolumSutunlari = kural.bolumler.flatMap((b) => {
    const dogru = sutunlar.get(`${b.bolum_kodu}_dogru`);
    const yanlis = sutunlar.get(`${b.bolum_kodu}_yanlis`);
    return dogru === undefined && yanlis === undefined ? [] : [{ bolum: b, dogru, yanlis }];
  });
  if (bolumSutunlari.length === 0) {
    throw gecersizDosya('Başlık satırında bu kurala ait <bolum_kodu>_dogru/_yanlis sütunu yok.');
  }

  const sonuc: ExcelSonucu = { satirlar: [], hatalar: [], atlanan: 0 };
  for (let r = 2; r <= ws.rowCount; r++) {
    const satir = ws.getRow(r);
    if (!satir.hasValues) continue;
    const hatalar: { kod: string; mesaj: string }[] = [];
    // Formul herhangi bir hucrede (ad dahil) reddedilir.
    const formuller: number[] = [];
    satir.eachCell({ includeEmpty: false }, (hucre, sutun) => {
      if (formulMu(hucre)) formuller.push(sutun);
    });
    if (formuller.length > 0) {
      sonuc.hatalar.push({
        satir: r,
        ogrenci_id: null,
        kod: 'formul_hucresi',
        mesaj: 'Formül içeren hücre kabul edilmez.',
      });
      continue;
    }
    const kimlik =
      idSutunu === undefined ? ({ tur: 'bos' } as const) : hucreOku(satir.getCell(idSutunu));
    const no =
      noSutunu === undefined ? ({ tur: 'bos' } as const) : hucreOku(satir.getCell(noSutunu));
    const ogrenciId = kimlik.tur === 'metin' ? kimlik.deger : null;
    if (
      kimlik.tur === 'sayi' ||
      kimlik.tur === 'hata' ||
      (ogrenciId !== null && !ayirtEdilemez.safeParse(ogrenciId).success)
    ) {
      hatalar.push({
        kod: 'ogrenci_kimligi_gecersiz',
        mesaj: 'ogrenci_id geçerli bir kimlik değil.',
      });
    }
    const ogrenciNo = no.tur === 'metin' ? no.deger : no.tur === 'sayi' ? String(no.deger) : null;
    if (no.tur === 'hata') hatalar.push({ kod: no.kod, mesaj: `ogrenci_no: ${no.mesaj}` });

    const bolumler: DenemeBolumGirdisi[] = [];
    for (const { bolum, dogru, yanlis } of bolumSutunlari) {
      const d = sayacOku(
        dogru === undefined ? { tur: 'bos' } : hucreOku(satir.getCell(dogru)),
        `${bolum.bolum_kodu}_dogru`,
      );
      const y = sayacOku(
        yanlis === undefined ? { tur: 'bos' } : hucreOku(satir.getCell(yanlis)),
        `${bolum.bolum_kodu}_yanlis`,
      );
      if (d.hata) hatalar.push(d.hata);
      if (y.hata) hatalar.push(y.hata);
      if (d.deger === null && y.deger === null) continue;
      bolumler.push({ bolum_kodu: bolum.bolum_kodu, dogru: d.deger ?? 0, yanlis: y.deger ?? 0 });
    }
    if (hatalar.length > 0) {
      for (const h of hatalar) sonuc.hatalar.push({ satir: r, ogrenci_id: null, ...h });
      continue;
    }
    if (ogrenciId === null && ogrenciNo === null) {
      if (bolumler.length > 0) {
        sonuc.hatalar.push({
          satir: r,
          ogrenci_id: null,
          kod: 'ogrenci_kimligi_yok',
          mesaj: 'Satırda ogrenci_id ya da ogrenci_no yok.',
        });
      }
      continue;
    }
    if (bolumler.length === 0) {
      sonuc.atlanan++;
      continue;
    }
    sonuc.satirlar.push({ satir: r, ogrenci_id: ogrenciId, ogrenci_no: ogrenciNo, bolumler });
  }
  if (sonuc.satirlar.length + sonuc.hatalar.length > DENEME_TOPLU_SATIR_SINIRI) {
    throw gecersizDosya(`En fazla ${String(DENEME_TOPLU_SATIR_SINIRI)} satır yüklenebilir.`);
  }
  return sonuc;
}
