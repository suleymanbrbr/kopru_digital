'use client';

import { t } from '@kopru/i18n';
import { useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';

import { KapiHatasi } from '../kimlik/kapi-hatasi';
import { Kabuk } from './kabuk';

import { RolSaglayici, useBen } from '@/lib/oturum';

/**
 * Panelin kapisi: platform kimligi (`GET /platform/ben`) alinir. Rol/IP hatasi acik ekranla, ikinci adim
 * dogrulanmamissa `/dogrulama`ya yonlenir; oturum yoksa genel hata isleyicisi giris ekranina atar.
 */
export function PanelKoruma({ children }: { children: ReactNode }) {
  const router = useRouter();
  const ben = useBen();
  const dogrulandi = ben.data?.ikinci_adim.oturumda_dogrulandi === true;

  useEffect(() => {
    if (ben.data && !dogrulandi) router.replace('/dogrulama');
  }, [ben.data, dogrulandi, router]);

  if (ben.error) {
    return (
      <KapiHatasi
        hata={ben.error}
        onYenile={() => {
          void ben.refetch();
        }}
      />
    );
  }
  if (!ben.data || !dogrulandi) {
    return (
      <p role="status" className="p-8 text-metin-ikincil">
        {t('yonetim.ortak.yukleniyor')}
      </p>
    );
  }
  return (
    <RolSaglayici value={ben.data.platform_rolu}>
      <Kabuk rol={ben.data.platform_rolu}>{children}</Kabuk>
    </RolSaglayici>
  );
}
