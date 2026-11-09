import { kurusBicimle, t } from '@kopru/i18n';

import { Rozet } from '@/components/ui/rozet';
import { krediDurumu } from '@/lib/operasyon';

/**
 * Kalan ders rozeti: `esik` ve alti sari, 0 ve alti kirmizi. Renk tek sinyal degildir; her durumun metni
 * vardir. Paket modeli disindaki ogrenci icin model adi (notr) gosterilir.
 */
export function KrediRozeti({
  model,
  kalan,
  esik,
}: {
  model: string;
  kalan: number;
  esik: number;
}) {
  const durum = krediDurumu(model, kalan, esik);
  if (durum === 'yok') {
    return (
      <Rozet ton="notr">
        {model === 'ders_basi'
          ? t('operasyon.finans.model.ders_basi')
          : t('operasyon.finans.modelYok')}
      </Rozet>
    );
  }
  if (durum === 'bitti') return <Rozet ton="hata">{t('operasyon.finans.kalanBitti')}</Rozet>;
  if (durum === 'dusuk') {
    return <Rozet ton="uyari">{t('operasyon.finans.kalanDusuk', { sayi: kalan })}</Rozet>;
  }
  return <Rozet ton="basari">{t('operasyon.finans.kalanSayi', { sayi: kalan })}</Rozet>;
}

/** Bakiye metni: negatif = borclu. Yalniz personel ekranlarinda kullanilir. */
export function bakiyeMetni(kurus: number): string {
  if (kurus < 0) return t('operasyon.finans.borcEtiket', { tutar: kurusBicimle(-kurus) });
  if (kurus > 0) return t('operasyon.finans.alacakEtiket', { tutar: kurusBicimle(kurus) });
  return t('operasyon.finans.kart.bakiyeTemiz');
}
