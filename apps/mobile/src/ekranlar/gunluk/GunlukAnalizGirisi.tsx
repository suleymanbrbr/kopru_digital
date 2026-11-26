import { t } from '@kopru/i18n';
import { useRouter } from 'expo-router';

import { Dugme } from '../../ui/Dugme';
import { Kart } from '../../ui/Kart';
import { Metin } from '../../ui/Metin';

/** Ogrenci kartinda (personel) gunluk soru analizi ve kaynak kitap ilerlemesi girisi. */
export function GunlukAnalizGirisi({ ogrenciId, ad }: { ogrenciId: string; ad: string }) {
  const router = useRouter();
  return (
    <Kart className="gap-3" testID="gunluk-analiz-girisi">
      <Metin varyant="altBaslik" accessibilityRole="header">
        {t('mobil.gunluk.giris.baslik')}
      </Metin>
      <Metin varyant="ikincil">{t('mobil.gunluk.giris.aciklama')}</Metin>
      <Dugme
        etiket={t('mobil.gunluk.giris.konuAnalizi')}
        testID="konu-analizi-ac"
        onPress={() => {
          router.push({ pathname: '/konu-analizi', params: { ogrenciId, ad } });
        }}
      />
      <Dugme
        varyant="ikincil"
        etiket={t('mobil.gunluk.kitap.ilerleme')}
        testID="kitap-ilerleme-ogrenci"
        onPress={() => {
          router.push({ pathname: '/kaynak-kitaplar', params: { ogrenciId, ad } });
        }}
      />
    </Kart>
  );
}
