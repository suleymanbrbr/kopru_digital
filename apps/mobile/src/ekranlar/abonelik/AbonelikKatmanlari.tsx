import { t } from '@kopru/i18n';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { durumOzetle, seritTuru } from '../../abonelik/durum';
import { kurumSecenekleri } from '../../oturum/kurumSecimi';
import { Dugme } from '../../ui/Dugme';
import { Ekran } from '../../ui/Ekran';
import { Ikon } from '../../ui/Ikon';
import { Metin } from '../../ui/Metin';
import { useAbonelikOzeti, usePlatformMesaji, useSahipMi, useSimdi } from '../../uygulama/abonelik';
import { useOturum, useServisler } from '../../uygulama/baglam';

/**
 * Ekran ustundeki abonelik seridi: yazma kilitliyse (402 abonelik_gerekli) salt okunur uyarisi
 * (tum roller), sahibe ayrica deneme bitisine <= 3 gun kala hatirlatma. Sahibe dokununca
 * abonelik ekrani acilir. Veri gorunmeye devam eder.
 */
export function AbonelikSeridi() {
  const router = useRouter();
  const { abonelikUyari } = useServisler();
  const saltOkunurIsareti = abonelikUyari.depo.kullan((d) => d.saltOkunur);
  const sahip = useSahipMi();
  const ozet = useAbonelikOzeti().data;
  const simdi = useSimdi();

  // Sunucu yazma kilidinin kalktigini bildirirse yerel isaret de kalkar.
  useEffect(() => {
    if (ozet && !ozet.yazmaKilitli) abonelikUyari.saltOkunurTemizle();
  }, [ozet, abonelikUyari]);

  const tur = seritTuru(ozet, saltOkunurIsareti, Platform.OS, simdi);
  if (!tur) return null;
  const gun = ozet ? (durumOzetle(ozet, Platform.OS, simdi).kalanGun ?? 0) : 0;
  const metin =
    tur === 'salt_okunur'
      ? sahip
        ? t('mobil.abonelik.serit.saltOkunurSahip')
        : t('mobil.abonelik.serit.saltOkunur')
      : gun <= 0
        ? t('mobil.abonelik.serit.denemeBugun')
        : t('mobil.abonelik.serit.denemeBitiyor', { n: gun });
  const icerik = (
    <>
      <Ikon ad={tur === 'salt_okunur' ? 'lock-closed-outline' : 'time-outline'} boyut={18} />
      <Metin varyant="ikincil" className="flex-1">
        {metin}
      </Metin>
      {sahip ? <Ikon ad="chevron-forward" boyut={16} /> : null}
    </>
  );
  const sinif = `min-h-dokunma flex-row items-center gap-2 border-y px-4 py-2 bg-yuzeyIkincil ${
    tur === 'salt_okunur' ? 'border-uyari' : 'border-kenar'
  }`;
  return sahip ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${metin} ${t('mobil.abonelik.serit.ac')}`}
      testID="abonelik-serit"
      onPress={() => {
        router.push('/abonelik');
      }}
      className={sinif}
    >
      {icerik}
    </Pressable>
  ) : (
    <View accessibilityRole="alert" testID="abonelik-serit" className={sinif}>
      {icerik}
    </View>
  );
}

/** Uygulama geneli (giris oncesi dahil) kapatilabilir platform mesaji afisi. */
export function PlatformMesajiAfisi() {
  const { mesaj, kapat } = usePlatformMesaji();
  const ins = useSafeAreaInsets();
  if (!mesaj) return null;
  const kritik = mesaj.onem === 'kritik';
  return (
    <View
      pointerEvents="box-none"
      className="absolute left-0 right-0 top-0 px-3"
      style={{ paddingTop: ins.top + 4, zIndex: 90 }}
    >
      <View
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
        testID="platform-mesaji"
        className={`flex-row items-start gap-3 rounded-buyuk border bg-yuzey p-3 ${
          kritik ? 'border-hata' : mesaj.onem === 'uyari' ? 'border-uyari' : 'border-kenar'
        }`}
        style={{
          shadowColor: '#000',
          shadowOpacity: 0.2,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 2 },
          elevation: 6,
        }}
      >
        <Ikon ad={kritik ? 'alert-circle' : 'information-circle-outline'} boyut={22} />
        <View
          className="flex-1"
          accessible
          accessibilityLabel={`${t(`mobil.platformMesaji.onem.${mesaj.onem}`)}: ${mesaj.baslik}. ${mesaj.metin}`}
        >
          <Metin varyant="etiket">{mesaj.baslik}</Metin>
          <Metin varyant="ikincil">{mesaj.metin}</Metin>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('mobil.platformMesaji.kapat')}
          testID="platform-mesaji-kapat"
          onPress={kapat}
          hitSlop={8}
          className="min-h-dokunma min-w-dokunma items-center justify-center"
        >
          <Ikon ad="close" boyut={20} />
        </Pressable>
      </View>
    </View>
  );
}

/** "Planini yukselt" sayfasi (402 plan_limiti): sahibe abonelik ekrani, diger rollere bilgilendirme. */
export function PlanLimitiSayfasi() {
  const router = useRouter();
  const { abonelikUyari } = useServisler();
  const limit = abonelikUyari.depo.kullan((d) => d.limit);
  const sahip = useSahipMi();
  const ad = t(
    `mobil.abonelik.limit.ad.${
      limit?.limit &&
      [
        'max_ogrenci',
        'max_ogretmen',
        'max_sube',
        'sms_aylik',
        'medya_kota_bayt',
        'soru_aylik_ogrenci',
      ].includes(limit.limit)
        ? (limit.limit as 'max_ogrenci')
        : 'bilinmeyen'
    }`,
  );
  const kapat = () => {
    abonelikUyari.limitKapat();
    router.back();
  };
  return (
    <Ekran kenarlar={['left', 'right', 'bottom']}>
      <View className="items-center gap-3 py-6" testID="plan-limiti">
        <Ikon ad="trending-up-outline" boyut={36} />
        <Metin varyant="baslik" accessibilityRole="header" className="text-center">
          {t('mobil.abonelik.limit.baslik')}
        </Metin>
        <Metin className="text-center" testID="plan-limiti-aciklama">
          {typeof limit?.mevcut === 'number' && typeof limit.ustSinir === 'number'
            ? t('mobil.abonelik.limit.aciklama', {
                limit: ad,
                mevcut: limit.mevcut,
                ust: limit.ustSinir,
              })
            : t('mobil.abonelik.limit.aciklamaKisa')}
        </Metin>
        {!sahip ? (
          <Metin varyant="ikincil" className="text-center">
            {t('mobil.abonelik.limit.digerAciklama')}
          </Metin>
        ) : null}
      </View>
      {sahip ? (
        <Dugme
          etiket={t('mobil.abonelik.limit.sahipDugme')}
          onPress={() => {
            abonelikUyari.limitKapat();
            router.replace('/abonelik');
          }}
        />
      ) : null}
      <Dugme varyant="ikincil" etiket={t('mobil.abonelik.limit.tamam')} onPress={kapat} />
    </Ekran>
  );
}

/** 403 kurum_askida: tum ekranin ustunde askı ekrani (veri silinmedi). */
export function AskiEkrani() {
  const { abonelikUyari, oturum, queryClient } = useServisler();
  const durum = useOturum();
  const cokKurum = durum.asama === 'giris' && kurumSecenekleri(durum.uyelikler).length > 1;
  return (
    <View className="absolute inset-0 bg-arkaPlan" style={{ zIndex: 200 }} testID="aski-ekrani">
      <Ekran kaydir={false} className="items-center justify-center">
        <Ikon ad="pause-circle-outline" boyut={44} />
        <Metin varyant="baslik" accessibilityRole="header" className="text-center">
          {t('mobil.abonelik.aski.baslik')}
        </Metin>
        <Metin className="text-center">{t('mobil.abonelik.aski.aciklama')}</Metin>
        <Dugme
          etiket={t('mobil.abonelik.aski.tekrarDene')}
          onPress={() => {
            abonelikUyari.askiTemizle();
            void queryClient.invalidateQueries();
          }}
        />
        {cokKurum ? (
          <Dugme
            varyant="ikincil"
            etiket={t('mobil.abonelik.aski.kurumDegistir')}
            onPress={() => {
              abonelikUyari.askiTemizle();
              oturum.kurumDegistir();
            }}
          />
        ) : null}
        <Dugme
          varyant="hayalet"
          etiket={t('mobil.profil.cikis')}
          onPress={() => {
            abonelikUyari.askiTemizle();
            void oturum.cikis();
          }}
        />
      </Ekran>
    </View>
  );
}

/**
 * (uygulama) duzenine takilir: askı ekranini ve plan limiti sayfasinin otomatik acilisini yonetir.
 * Limit sayfasi her yeni 402 plan_limiti olayinda (anahtar degisince) acilir.
 */
export function AbonelikKatmani() {
  const router = useRouter();
  const { abonelikUyari } = useServisler();
  const askida = abonelikUyari.depo.kullan((d) => d.askida);
  const limitAnahtari = abonelikUyari.depo.kullan((d) => d.limit?.anahtar ?? 0);
  useEffect(() => {
    if (limitAnahtari > 0) router.push('/plan-limiti');
  }, [limitAnahtari, router]);
  return askida ? <AskiEkrani /> : null;
}
