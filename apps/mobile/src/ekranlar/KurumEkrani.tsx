import { t } from '@kopru/i18n';

import { MODUL_KODLARI } from '../api/tipler';
import { Ekran } from '../ui/Ekran';
import { Kart } from '../ui/Kart';
import { Metin } from '../ui/Metin';
import { useAktif } from '../uygulama/baglam';

/** Sahip/yonetici icin kurum girisi (iskelet): kurum adi ve acik moduller. */
export function KurumEkrani() {
  const aktif = useAktif();
  if (!aktif) return null;
  const acik = MODUL_KODLARI.filter((m) => aktif.moduller[m] === true);
  return (
    <Ekran kenarlar={['left', 'right', 'bottom']}>
      <Kart className="gap-1">
        <Metin varyant="baslik">{aktif.uyelik.kurumAd}</Metin>
        <Metin varyant="ikincil">{t(`roller.${aktif.uyelik.rol}`)}</Metin>
      </Kart>
      <Kart className="gap-2">
        <Metin varyant="altBaslik" accessibilityRole="header">
          {t('mobil.kurum.moduller')}
        </Metin>
        {acik.length === 0 ? <Metin varyant="ikincil">{t('mobil.kurum.modulYok')}</Metin> : null}
        {acik.map((m) => (
          <Metin key={m}>{t(`mobil.kurum.modul.${m}`)}</Metin>
        ))}
      </Kart>
    </Ekran>
  );
}
