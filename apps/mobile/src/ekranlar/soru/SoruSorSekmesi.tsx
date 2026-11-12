import { t } from '@kopru/i18n';
import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { kotaGorunumu } from '../../soru/bicim';
import { GonderimKartlari } from '../../soru/GonderimKartlari';
import { SoruSatiri } from '../../soru/SoruSatiri';
import { Dugme } from '../../ui/Dugme';
import { BosDurum, HataDurumu, Yukleniyor } from '../../ui/Durumlar';
import { Ekran } from '../../ui/Ekran';
import { Ikon } from '../../ui/Ikon';
import { Kart } from '../../ui/Kart';
import { Metin } from '../../ui/Metin';
import { hataMesaji } from '../../uygulama/hatalar';
import { useSaatDilimi } from '../../uygulama/operasyon';
import { useGonderimler, useSorularim, useSoruKotasi } from '../../uygulama/soru';
import { bekleyenSoruSayisi } from '../../yukleme/gonderim';
import { CevrimdisiSerit } from '../CevrimdisiSerit';

/** Ogrenci "Soru sor" sekmesi: buyuk dugme, kota, surmekte olan gonderimler ve son sorular. */
export function SoruSorSekmesi() {
  const router = useRouter();
  const { tz } = useSaatDilimi();
  const kotaSorgu = useSoruKotasi();
  const gonderimler = useGonderimler();
  const son = useSorularim({});
  const kota = kotaSorgu.data
    ? kotaGorunumu(kotaSorgu.data, bekleyenSoruSayisi(gonderimler), tz)
    : null;
  const sorular = (son.data?.pages.flatMap((p) => p.sorular) ?? []).slice(0, 4);

  return (
    <Ekran ust={<CevrimdisiSerit />} kenarlar={['top', 'left', 'right']}>
      <Metin varyant="baslik" accessibilityRole="header">
        {t('mobil.soruSor.baslik')}
      </Metin>

      <Kart className="gap-3">
        <Metin>{t('mobil.soru.ogrenci.sorAciklama')}</Metin>
        <Dugme
          buyuk
          etiket={t('mobil.soru.ogrenci.sorBuyuk')}
          disabled={kota?.dolu ?? false}
          onPress={() => {
            router.push('/(uygulama)/soru-yeni');
          }}
          testID="soru-sor-dugmesi"
        />
        {kota ? (
          <View
            className="flex-row items-center gap-2"
            accessible
            accessibilityLabel={t('mobil.soru.kota.etiket', {
              mesaj: kota.sifirlanma ? `${kota.mesaj} ${kota.sifirlanma}` : kota.mesaj,
            })}
            testID="soru-kota"
          >
            <Ikon ad={kota.dolu ? 'alert-circle' : 'ticket-outline'} boyut={18} />
            <View className="flex-1">
              <Metin varyant="etiket" className={kota.dolu ? 'text-hata' : ''}>
                {kota.mesaj}
              </Metin>
              {kota.sifirlanma ? <Metin varyant="ikincil">{kota.sifirlanma}</Metin> : null}
            </View>
          </View>
        ) : null}
      </Kart>

      <GonderimKartlari turler={['soru']} />

      <View className="flex-row items-center justify-between">
        <Metin varyant="altBaslik" accessibilityRole="header">
          {t('mobil.soru.ogrenci.sorularim')}
        </Metin>
        <Dugme
          varyant="hayalet"
          etiket={t('mobil.soru.ogrenci.sorularimTumu')}
          onPress={() => {
            router.push('/(uygulama)/sorularim');
          }}
          testID="sorularim-ac"
        />
      </View>
      {son.isPending ? <Yukleniyor /> : null}
      {son.isError && !son.data ? (
        <HataDurumu mesaj={hataMesaji(son.error)} tekrar={() => void son.refetch()} />
      ) : null}
      {son.data && sorular.length === 0 ? (
        <BosDurum ikon="chatbubbles-outline" mesaj={t('mobil.soru.ogrenci.sorularimBos')} />
      ) : null}
      {sorular.map((s) => (
        <SoruSatiri
          key={s.id}
          soru={s}
          tz={tz}
          onPress={() => {
            router.push({ pathname: '/(uygulama)/soru/[id]', params: { id: s.id } });
          }}
        />
      ))}
    </Ekran>
  );
}
