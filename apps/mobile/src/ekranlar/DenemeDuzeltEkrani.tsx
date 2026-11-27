import { t } from '@kopru/i18n';

import { BosDurum, HataDurumu, Yukleniyor } from '../ui/Durumlar';
import { Ekran } from '../ui/Ekran';
import { hataMesaji } from '../uygulama/hatalar';
import { useDenemelerim } from '../uygulama/ogrenme';
import { DenemeGirisFormu } from './DenemeGirisFormu';

/**
 * Ogrencinin reddedilen (ya da onay bekleyen) kendi sonucunu duzeltmesi. Deneme `denemelerim`
 * listesinden bulunur; onaylanmis ya da baskasinin sonucu form acmaz.
 */
export function DenemeDuzeltEkrani({ denemeId }: { denemeId: string }) {
  const sorgu = useDenemelerim();
  if (sorgu.isPending) {
    return (
      <Ekran kenarlar={['left', 'right', 'bottom']}>
        <Yukleniyor />
      </Ekran>
    );
  }
  if (sorgu.isError && !sorgu.data) {
    return (
      <Ekran kenarlar={['left', 'right', 'bottom']}>
        <HataDurumu mesaj={hataMesaji(sorgu.error)} tekrar={() => void sorgu.refetch()} />
      </Ekran>
    );
  }
  const deneme = sorgu.data.find((d) => d.id === denemeId);
  if (!deneme || deneme.onayDurumu === 'onaylandi' || deneme.kaynak !== 'ogrenci') {
    return (
      <Ekran kenarlar={['left', 'right', 'bottom']}>
        <BosDurum ikon="sparkles" mesaj={t('mobil.ogrenme.deneme.duzeltBulunamadi')} />
      </Ekran>
    );
  }
  // `key` yok: kayit sonrasi liste tazelenince form yeniden kurulup "onaya gonderildi" ekranini kaybetmesin.
  return <DenemeGirisFormu duzelt={deneme} />;
}
