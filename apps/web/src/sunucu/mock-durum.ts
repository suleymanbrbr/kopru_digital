/**
 * E2E durum yalitimi (yalniz mock modu): `mock_durum` cerezi bir durum anahtari tasir. Durumlu mock'lar
 * (motivasyon, gunluk soru, degerlendirme/kocluk) deposunu `<anahtar>|<kurum>` ile tutar; boylece anahtarli
 * bir test kendi durumunu gorur, baska spec'lerin eylemleri onu etkilemez (ve tersi). Cerez yoksa ya da
 * gecersizse anahtar bos: varsayilan (ortak) durum. Cerez yalniz `vekil.ts` icinde, mock modunda okunur.
 *
 * Mock'lar istek basina senkron calisir: `vekil.ts` mock'u cagirmadan once anahtari ayarlar, mock'lar
 * `mockDurumAnahtari()` ile okur. Abonelik `mock_senaryo` cerezi bundan bagimsizdir.
 */
export const MOCK_DURUM_CEREZI = 'mock_durum';

const ANAHTAR = /^[a-z0-9]{1,32}$/;

/** Cerez degerini dogrular; gecersizse `undefined` (varsayilan durum). */
export const mockDurumAnahtariOku = (cerez: string | undefined): string | undefined =>
  cerez !== undefined && ANAHTAR.test(cerez) ? cerez : undefined;

let gecerli = '';

/** Bu istek icin durum anahtarini ayarlar; verilmezse varsayilan (ortak) durum. */
export function mockDurumAnahtariAyarla(anahtar: string | undefined): void {
  gecerli = anahtar ?? '';
}

/** Gecerli istegin durum anahtari (varsayilan durumda bos metin). */
export const mockDurumAnahtari = (): string => gecerli;

/** Depo anahtari: `<durum anahtari>|<kurum>`. */
export const mockDurumDepoAnahtari = (kurumId: string): string => `${gecerli}|${kurumId}`;
