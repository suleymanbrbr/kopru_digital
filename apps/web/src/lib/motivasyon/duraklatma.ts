import { t } from '@kopru/i18n';

export const DURAKLATMA_AZAMI_GUN = 31;
const GUN_MS = 86_400_000;
const TARIH = /^\d{4}-\d{2}-\d{2}$/;

export type DuraklatmaHatasi = 'eksik' | 'bitis_once' | 'gecmis' | 'uzun';

/** Baslangic ve bitis dahil gun sayisi. */
export function gunSayisi(baslangic: string, bitis: string): number {
  return Math.round((Date.parse(bitis) - Date.parse(baslangic)) / GUN_MS) + 1;
}

/**
 * Duraklatma tarih araligini sunucuyla ayni kurallarla dogrular (ilk hata): ikisi de dolu, bitis
 * baslangictan once degil, gecmis gunle baslamaz, en cok 31 gun (baslangic ve bitis dahil).
 */
export function duraklatmaDogrula(
  baslangic: string,
  bitis: string,
  bugun: string,
): DuraklatmaHatasi | null {
  if (!TARIH.test(baslangic) || !TARIH.test(bitis)) return 'eksik';
  if (bitis < baslangic) return 'bitis_once';
  if (baslangic < bugun) return 'gecmis';
  if (gunSayisi(baslangic, bitis) > DURAKLATMA_AZAMI_GUN) return 'uzun';
  return null;
}

export function duraklatmaHataMetni(h: DuraklatmaHatasi): string {
  return t(`motivasyon.duraklatma.dogrulama.${h}`, { azami: DURAKLATMA_AZAMI_GUN });
}

/** Aralik metni: "12 Kasım - 20 Kasım 2026" yerine kisa "12 - 20 Kasım" (ayni ay) ya da iki tarih. */
export function aralikMetni(baslangic: string, bitis: string): string {
  const bicim = new Intl.DateTimeFormat('tr-TR', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const f = (g: string) => bicim.format(new Date(`${g}T00:00:00Z`));
  return baslangic === bitis ? f(baslangic) : `${f(baslangic)} – ${f(bitis)}`;
}
