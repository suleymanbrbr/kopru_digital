import { t } from '@kopru/i18n';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Ikon } from '../ui/Ikon';
import { Metin } from '../ui/Metin';
import { useServisler } from '../uygulama/baglam';

/** Cevrimdisiyken ya da bekleyen degisiklik varken ekran ustunde bilgi seridi. */
export function CevrimdisiSerit() {
  const { kuyruk, agGozlemcisi } = useServisler();
  const [cevrimici, setCevrimici] = useState(agGozlemcisi.cevrimiciMi());
  const [bekleyen, setBekleyen] = useState(kuyruk.bekleyenler().length);

  useEffect(() => {
    const a = agGozlemcisi.abone(setCevrimici);
    const b = kuyruk.abone(() => {
      setBekleyen(kuyruk.bekleyenler().length);
    });
    return () => {
      a();
      b();
    };
  }, [kuyruk, agGozlemcisi]);

  if (cevrimici && bekleyen === 0) return null;
  const mesaj = cevrimici
    ? t('mobil.durum.bekleyenGonderiliyor')
    : bekleyen > 0
      ? `${t('mobil.durum.cevrimdisi')}. ${t('mobil.profil.bekleyenIstek', { n: bekleyen })}`
      : t('mobil.durum.cevrimdisi');
  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      className="flex-row items-center gap-2 bg-yuzeyIkincil px-4 py-2"
    >
      <Ikon ad={cevrimici ? 'sync' : 'cloud-offline-outline'} boyut={16} />
      <Metin varyant="ikincil" className="flex-1">
        {mesaj}
      </Metin>
    </View>
  );
}
