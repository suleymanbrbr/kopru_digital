import type { NextRequest, NextResponse } from 'next/server';

import { degerlendirmeMock } from './degerlendirme-mock';
import { gunlukSoruMock } from './gunluk-soru-mock';
import { ogrenmeMock } from './ogrenme-mock';
import { raporMock } from './rapor-mock';
import { soruMock } from './soru-mock';
import {
  servisVekili,
  yolIzinliMi as ortakYolIzinliMi,
  type MockIstek,
  type VekilTanimi,
} from './vekil';

/**
 * `/api/ogrenme/<yol>` -> `api` servisinin `/v1/ogrenme/<yol>` ucu: mufredat, odev, haftalik plan ve
 * deneme ve soru sor. Deneme Excel sablonu indirme ve `.xlsx` yukleme ikili govdeyle gecer (`content-type` ve
 * `content-disposition` korunur).
 */
const K = String.raw`kurumlar\/[^/]+`;
export const OGRENME_IZINLI_YOLLAR: readonly RegExp[] = [
  // Mufredat
  new RegExp(`^${K}\\/(kataloglar|mufredat-atamalari)$`),
  new RegExp(`^${K}\\/konular(\\/|$)`),
  // Odev
  new RegExp(`^${K}\\/(odevler|odev-sablonlari|ogrenci-odevleri)(\\/|$)`),
  new RegExp(`^${K}\\/odevlerim$`),
  // Haftalik plan
  new RegExp(`^${K}\\/(planlar|plan-sablonlari|gorevler)(\\/|$)`),
  new RegExp(`^${K}\\/(planim|gorevlerim)$`),
  new RegExp(`^${K}\\/ogrenciler\\/[^/]+\\/(plan|deneme-gelisim)$`),
  // Deneme
  new RegExp(`^${K}\\/(denemeler|deneme-kurallari)(\\/|$)`),
  new RegExp(`^${K}\\/(denemelerim|deneme-ayarlari)$`),
  new RegExp(`^${K}\\/gruplar\\/[^/]+\\/deneme-ozet$`),
  // Soru sor: ogrenci, ogretmen ve yonetim (tam eslesme)
  new RegExp(`^${K}\\/sorular$`),
  new RegExp(`^${K}\\/sorular\\/[^/]+$`),
  new RegExp(`^${K}\\/sorular\\/[^/]+\\/(anladim|takip|bildir|cevap)$`),
  new RegExp(
    `^${K}\\/(sorularim|soru-kotam|gelen-sorular|gelen-sorular\\/sayi|cevapladigim-sorular|soru-musaitligim|soru-ayarlari|soru-bildirimleri|soru-olcum)$`,
  ),
  new RegExp(`^${K}\\/soru-bildirimleri\\/[^/]+\\/kapat$`),
  new RegExp(`^${K}\\/soru-masalari(\\/[^/]+(\\/uyeler(\\/[^/]+)?)?)?$`),
  new RegExp(`^${K}\\/yonetim\\/sorular$`),
  // Gunluk soru takibi ve konu analizi (ogrenci kendi, personel ogrenci/grup)
  new RegExp(
    `^${K}\\/gunluk-soru\\/(kayitlar|kayitlar\\/[^/]+|son-kullanilanlar|analiz|analiz\\/hucre|sinif-analizi)$`,
  ),
  new RegExp(
    `^${K}\\/ogrenciler\\/[^/]+\\/gunluk-soru\\/(analiz|analiz\\/hucre|haftalik-ozet|gorev-ver)$`,
  ),
  // Kaynak kitaplar (kitap + testler)
  new RegExp(`^${K}\\/kaynak-kitaplar(\\/[^/]+(\\/testler(\\/[^/]+)?)?)?$`),
  // Ogretmen degerlendirmeleri, onerilen kaynaklar ve kocluk gorunumu (personel ogrenci uclari, ogrenci kendi)
  new RegExp(`^${K}\\/ogrenciler\\/[^/]+\\/(degerlendirmeler|kaynak-onerileri|kocluk)$`),
  new RegExp(`^${K}\\/degerlendirmeler\\/[^/]+(\\/geri-cek)?$`),
  new RegExp(`^${K}\\/kaynak-onerileri\\/[^/]+\\/geri-cek$`),
  new RegExp(`^${K}\\/(degerlendirmelerim|kaynak-onerilerim|degerlendirme-hatirlatma)$`),
  // Yonetici paneli (Excel dahil)
  new RegExp(`^${K}\\/rapor\\/(ozet|odev|plan|soru|disa-aktar)$`),
];

export function ogrenmeYoluIzinliMi(parcalar: readonly string[], yontem = 'GET'): boolean {
  return ortakYolIzinliMi(parcalar, OGRENME_IZINLI_YOLLAR, yontem);
}

/** Once "soru sor" mock'u, ilgilenmezse mufredat/odev/plan/deneme mock'u. */
const mock = (istek: MockIstek) =>
  raporMock('ogrenme', istek) ??
  soruMock(istek) ??
  degerlendirmeMock(istek) ??
  gunlukSoruMock(istek) ??
  ogrenmeMock(istek);

const tanim: VekilTanimi = { servis: 'ogrenme', izinli: OGRENME_IZINLI_YOLLAR, mock };

export function ogrenmeVekili(
  request: NextRequest,
  parcalar: readonly string[],
): Promise<NextResponse> {
  return servisVekili(tanim, request, parcalar);
}
