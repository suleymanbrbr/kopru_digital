import type { Duyuru } from '@kopru/contracts';
import { t } from '@kopru/i18n';

/** Duyurunun hedefi icin okunur etiket; grup adi bilinmiyorsa (arsiv/yetki) genel "Grup". */
export function duyuruHedefEtiketi(
  duyuru: Pick<Duyuru, 'hedef_turu' | 'hedef_id'>,
  grupAdlari: ReadonlyMap<string, { etiket: string }>,
): string {
  switch (duyuru.hedef_turu) {
    case 'kurum':
      return t('duyurular.hedefKurum');
    case 'kademe':
      return t('duyurular.hedefKademe');
    case 'grup': {
      const ad = grupAdlari.get(duyuru.hedef_id)?.etiket;
      return ad ? t('duyurular.hedefGrup', { ad }) : t('duyurular.hedefGrupBilinmiyor');
    }
  }
}

/**
 * Yayin onayi metni. `uyeSayisi` yalniz grup hedefinde ve alici yalniz ogrenciyse bilinir (grubun etkin ogrenci
 * sayisi); duyuru yayinlanmadan once servisten alici sayisi alinamadigi icin diger hedeflerde sayi verilmez.
 */
export function yayinOnayMetni(girdi: {
  baslik: string;
  hedef: string;
  roller: readonly string[];
  uyeSayisi: number | null;
}): string {
  const yalnizOgrenci = girdi.roller.includes('ogrenci') && !girdi.roller.includes('ogretmen');
  return girdi.uyeSayisi !== null && yalnizOgrenci
    ? t('duyurular.onay.aciklamaGrupKisi', {
        baslik: girdi.baslik,
        hedef: girdi.hedef,
        n: girdi.uyeSayisi,
      })
    : t('duyurular.onay.aciklama', { baslik: girdi.baslik, hedef: girdi.hedef });
}
