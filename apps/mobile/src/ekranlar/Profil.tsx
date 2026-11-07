import { t } from '@kopru/i18n';
import { useRouter } from 'expo-router';
import { Alert, Pressable, Switch, View } from 'react-native';

import { kurumGirisiVarMi } from '../nav/yapilandirma';
import { ortam } from '../ortam';
import { tercihler, type TemaTercihi } from '../tema/tercihler';
import { Dugme } from '../ui/Dugme';
import { Ekran } from '../ui/Ekran';
import { Ikon } from '../ui/Ikon';
import { Kart } from '../ui/Kart';
import { Metin } from '../ui/Metin';
import { useAktif, useOturum, useServisler } from '../uygulama/baglam';

import { CevrimdisiSerit } from './CevrimdisiSerit';

const TEMALAR: { deger: TemaTercihi; anahtar: 'mobil.profil.temaSistem' | 'mobil.profil.temaAcik' | 'mobil.profil.temaKoyu' }[] = [
  { deger: 'sistem', anahtar: 'mobil.profil.temaSistem' },
  { deger: 'acik', anahtar: 'mobil.profil.temaAcik' },
  { deger: 'koyu', anahtar: 'mobil.profil.temaKoyu' },
];

function Satir({ etiket, onPress, ikon }: { etiket: string; onPress: () => void; ikon: 'business' | 'swap-horizontal' | 'apps' }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={etiket}
      onPress={onPress}
      className="min-h-dokunma flex-row items-center gap-3 active:opacity-70"
    >
      <Ikon ad={ikon} />
      <Metin className="flex-1">{etiket}</Metin>
      <Ikon ad="chevron-forward" />
    </Pressable>
  );
}

export function Profil() {
  const router = useRouter();
  const { oturum, kuyruk } = useServisler();
  const durum = useOturum();
  const aktif = useAktif();
  const t_ = tercihler.kullan();
  if (durum.asama !== 'giris' || !aktif) return null;
  const rol = aktif.uyelik.rol;

  function cikis() {
    const bekleyen = kuyruk.bekleyenler().length;
    const mesaj = bekleyen > 0 ? t('mobil.profil.bekleyenIstek', { n: bekleyen }) : undefined;
    Alert.alert(t('mobil.profil.cikisOnay'), mesaj, [
      { text: t('ortak.iptal'), style: 'cancel' },
      { text: t('mobil.profil.cikis'), style: 'destructive', onPress: () => void oturum.cikis() },
    ]);
  }

  return (
    <>
      <CevrimdisiSerit />
      <Ekran kenarlar={['top', 'left', 'right']}>
        <Metin varyant="baslik" accessibilityRole="header">
          {t('mobil.profil.baslik')}
        </Metin>
        <Kart className="gap-1">
          <Metin varyant="altBaslik">{durum.kullanici.adSoyad}</Metin>
          <Metin varyant="ikincil">
            {t(`roller.${rol}`)} · {aktif.uyelik.kurumAd}
          </Metin>
        </Kart>

        <Kart className="gap-1">
          {kurumGirisiVarMi(rol) ? (
            <Satir
              ikon="business"
              etiket={t('mobil.profil.kurumYonet')}
              onPress={() => {
                router.push('/kurum');
              }}
            />
          ) : null}
          {durum.uyelikler.length > 1 ? (
            <Satir ikon="swap-horizontal" etiket={t('mobil.profil.kurumDegistir')} onPress={() => oturum.kurumDegistir()} />
          ) : null}
          {ortam.gelistirici ? (
            <Satir
              ikon="apps"
              etiket={`${t('mobil.profil.gelistirici')}: ${t('mobil.profil.bilesenler')}`}
              onPress={() => {
                router.push('/bilesenler');
              }}
            />
          ) : null}
        </Kart>

        <Kart className="gap-3">
          <Metin varyant="altBaslik" accessibilityRole="header">
            {t('mobil.profil.gorunum')}
          </Metin>
          <Metin varyant="ikincil">{t('mobil.profil.tema')}</Metin>
          <View className="flex-row gap-2" accessibilityRole="radiogroup">
            {TEMALAR.map((x) => {
              const secili = t_.tema === x.deger;
              return (
                <Pressable
                  key={x.deger}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: secili }}
                  accessibilityLabel={t(x.anahtar)}
                  onPress={() => {
                    tercihler.ayarla({ tema: x.deger });
                  }}
                  className={`min-h-dokunma flex-1 items-center justify-center rounded-orta border ${
                    secili ? 'border-birincil bg-birincil' : 'border-kenar bg-yuzey'
                  }`}
                >
                  <Metin varyant="etiket" className={secili ? 'text-birincilUzeri' : ''}>
                    {t(x.anahtar)}
                  </Metin>
                </Pressable>
              );
            })}
          </View>
          <View className="min-h-dokunma flex-row items-center gap-3">
            <View className="flex-1">
              <Metin varyant="etiket">{t('mobil.profil.animasyonlar')}</Metin>
              <Metin varyant="kucuk">{t('mobil.profil.animasyonlarAciklama')}</Metin>
            </View>
            <Switch
              accessibilityLabel={t('mobil.profil.animasyonlar')}
              value={t_.animasyonlar}
              onValueChange={(v) => {
                tercihler.ayarla({ animasyonlar: v });
              }}
            />
          </View>
        </Kart>

        <Dugme varyant="ikincil" etiket={t('mobil.profil.cikis')} onPress={cikis} />
      </Ekran>
    </>
  );
}
