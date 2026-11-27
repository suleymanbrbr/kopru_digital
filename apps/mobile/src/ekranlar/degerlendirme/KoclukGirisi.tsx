import { t } from '@kopru/i18n';
import { useRouter } from 'expo-router';

import { Dugme } from '../../ui/Dugme';
import { Kart } from '../../ui/Kart';
import { Metin } from '../../ui/Metin';

/** Ogrenci kartinda (personel) "Koclug" bolumu: koclugu acar ya da dogrudan degerlendirme yazdirir. */
export function KoclukGirisi({ ogrenciId, ad }: { ogrenciId: string; ad: string }) {
  const router = useRouter();
  return (
    <Kart className="gap-3" testID="kocluk-girisi">
      <Metin varyant="altBaslik" accessibilityRole="header">
        {t('mobil.kocluk.baslik')}
      </Metin>
      <Metin varyant="ikincil">{t('mobil.kocluk.girisAciklama')}</Metin>
      <Dugme
        etiket={t('kocluk.baslik')}
        testID="kocluk-ac"
        onPress={() => {
          router.push({ pathname: '/kocluk', params: { ogrenciId, ad } });
        }}
      />
      <Dugme
        varyant="ikincil"
        etiket={t('degerlendirme.yaz')}
        testID="kocluk-hizli-yaz"
        onPress={() => {
          router.push({ pathname: '/degerlendirme-yaz', params: { ogrenciId, ad } });
        }}
      />
    </Kart>
  );
}
