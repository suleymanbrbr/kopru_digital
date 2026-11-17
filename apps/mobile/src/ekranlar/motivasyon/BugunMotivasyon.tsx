import { t } from '@kopru/i18n';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';

import { enYakinHedef, hedefIlerlemeMetni, seriBasligi } from '../../motivasyon/seriMetni';
import { Dugme } from '../../ui/Dugme';
import { HataDurumu, Yukleniyor } from '../../ui/Durumlar';
import { Ikon } from '../../ui/Ikon';
import { Kart } from '../../ui/Kart';
import { Metin } from '../../ui/Metin';
import { useAktif } from '../../uygulama/baglam';
import { hataMesaji } from '../../uygulama/hatalar';
import { useBenim, useOdakDurumu, useSeri } from '../../uygulama/motivasyon';
import { KarakterSahnesi, SeviyeCubugu } from './KarakterSahnesi';

/** Karakter secimi bu oturumda bir kez kendiliginden acilir; sonra "Sonra" ile gecilebilir. */
const secimAcildi = new Set<string>();

/**
 * Ogrenci "Bugun" ustu: karakter (ruh haline gore), seri alevi, gunun hedef cubugu ("2/3 plan
 * gorevi"; hedeflerden biri yeter), bugunku XP ve buyuk "Odaklan" dugmesi. Karakter yoksa secime
 * yonlendirir.
 */
export function BugunMotivasyon() {
  const router = useRouter();
  const uyelikId = useAktif()?.uyelik.uyelikId ?? '';
  const benim = useBenim();
  const seri = useSeri();
  const odak = useOdakDurumu();
  const d = benim.data;
  const karaktersiz = !!d && d.karakter === null;

  useEffect(() => {
    if (!karaktersiz || secimAcildi.has(uyelikId)) return;
    secimAcildi.add(uyelikId);
    router.push('/karakter-sec');
  }, [karaktersiz, uyelikId, router]);

  const yakin = seri.data ? enYakinHedef(seri.data.hedefler) : null;
  const tamam = seri.data?.bugun_aktif ?? false;
  const mevcutSeri = seri.data?.mevcut_seri ?? d?.seri.mevcut_seri ?? 0;

  return (
    <View className="gap-3" testID="bugun-motivasyon">
      {benim.isPending ? <Yukleniyor /> : null}
      {benim.isError && !d ? (
        <HataDurumu mesaj={hataMesaji(benim.error)} tekrar={() => void benim.refetch()} />
      ) : null}
      {d ? (
        <Kart className="items-center gap-3">
          {d.karakter ? (
            <KarakterSahnesi durum={d} boyut={168} odakta={odak.faz === 'calisiyor'} />
          ) : (
            <View className="items-center gap-2" testID="karakter-sec-karti">
              <Metin varyant="altBaslik" className="text-center">
                {t('mobil.motivasyon.karaktersiz.baslik')}
              </Metin>
              <Metin varyant="ikincil" className="text-center">
                {t('mobil.motivasyon.karaktersiz.aciklama')}
              </Metin>
              <Dugme
                etiket={t('mobil.motivasyon.karaktersiz.sec')}
                onPress={() => {
                  router.push('/karakter-sec');
                }}
                testID="karakter-sec-dugme"
              />
            </View>
          )}
          <View
            className="flex-row items-center gap-2 self-center rounded-tam bg-yuzeyIkincil px-4 py-2"
            accessible
            accessibilityLabel={`${t('mobil.bugun.ogrenci.seri')}: ${seriBasligi(mevcutSeri)}`}
            testID="bugun-seri"
          >
            <Ikon ad="flame" renk={mevcutSeri > 0 ? '#FF8A3D' : undefined} />
            <Metin varyant="etiket">{seriBasligi(mevcutSeri)}</Metin>
          </View>
          {yakin ? (
            <View
              className="gap-1 self-stretch"
              accessible
              accessibilityRole="progressbar"
              accessibilityLabel={`${t('mobil.motivasyon.bugun.hedef')}: ${hedefIlerlemeMetni(yakin.hedef)}`}
              accessibilityValue={{ min: 0, max: 100, now: Math.round(yakin.oran * 100) }}
              testID="bugun-hedef"
            >
              <View className="flex-row items-center justify-between gap-2">
                <Metin varyant="etiket">
                  {tamam
                    ? t('mobil.motivasyon.bugun.hedefTamam')
                    : t('mobil.motivasyon.bugun.hedef')}
                </Metin>
                <Metin varyant="etiket">{hedefIlerlemeMetni(yakin.hedef)}</Metin>
              </View>
              <View className="h-3 overflow-hidden rounded-tam bg-yuzeyIkincil">
                <View
                  className="h-3 rounded-tam bg-birincil"
                  style={{ width: `${Math.round(yakin.oran * 100)}%` }}
                />
              </View>
            </View>
          ) : null}
          <View className="flex-row items-center gap-2 self-stretch" testID="bugun-xp">
            <Ikon ad="flash" boyut={18} />
            <Metin varyant="etiket" className="flex-1">
              {t('mobil.motivasyon.bugun.xp', { xp: d.bugun.xp })}
            </Metin>
          </View>
          {d.karakter ? <SeviyeCubugu durum={d} /> : null}
        </Kart>
      ) : null}
      <Dugme
        etiket={t('mobil.bugun.ogrenci.odaklan')}
        varyant="birincil"
        buyuk
        onPress={() => {
          router.push('/odaklan');
        }}
        testID="bugun-odaklan"
      />
    </View>
  );
}
