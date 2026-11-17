import { t } from '@kopru/i18n';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Modal, Pressable, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { useHareketAzalt } from '../../hooks/useHareketAzalt';
import { Companion } from '../../karakter/Companion';
import type { TurKodu } from '../../karakter/tipler';
import { adimlariPlanla } from '../../motivasyon/adimlar';
import { titresim } from '../../motivasyon/titresim';
import type { XpOlayi } from '../../motivasyon/xpYonetici';
import { Dugme } from '../../ui/Dugme';
import { Metin } from '../../ui/Metin';
import { useServisler } from '../../uygulama/baglam';
import { becerilerNesnesi } from '../../uygulama/motivasyon';

/** Ucan "+N XP" etiketi. "Hareketi azalt" aciksa animasyon yok: etiket sabit durur. */
function UcanEtiket({ xp, azalt }: { xp: number; azalt: boolean }) {
  const y = useSharedValue(0);
  const o = useSharedValue(azalt ? 1 : 0);
  useEffect(() => {
    if (azalt) return;
    y.value = withTiming(-70, { duration: 1700, easing: Easing.out(Easing.cubic) });
    o.value = withSequence(
      withTiming(1, { duration: 250 }),
      withTiming(1, { duration: 900 }),
      withTiming(0, { duration: 500 }),
    );
  }, [azalt, o, y]);
  const stil = useAnimatedStyle(() => ({
    opacity: o.value,
    transform: [{ translateY: y.value }],
  }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[{ position: 'absolute', top: '38%', alignSelf: 'center' }, stil]}
      testID="xp-etiketi"
    >
      <View className="rounded-tam bg-vurgu px-5 py-2">
        <Metin varyant="baslik" className="text-vurguUzeri">
          {t('mobil.motivasyon.xpEtiketi', { xp })}
        </Metin>
      </View>
    </Animated.View>
  );
}

function Kutlama({ baslik, alt, kapat }: { baslik: string; alt?: string; kapat: () => void }) {
  return (
    <View
      pointerEvents="box-none"
      style={{ position: 'absolute', top: '30%', left: 16, right: 16 }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${baslik}. ${alt ?? ''} ${t('mobil.motivasyon.kapat')}`.trim()}
        onPress={kapat}
        className="min-h-dokunma items-center gap-1 rounded-buyuk border border-kenar bg-yuzey p-5"
        testID="kutlama-karti"
      >
        <Metin varyant="baslik" className="text-center">
          {baslik}
        </Metin>
        {alt ? (
          <Metin varyant="ikincil" className="text-center">
            {alt}
          </Metin>
        ) : null}
      </Pressable>
    </View>
  );
}

function EvrimSahnesi({
  olay,
  azalt,
  kapat,
}: {
  olay: XpOlayi;
  azalt: boolean;
  kapat: () => void;
}) {
  const k = olay.durum.karakter;
  const [yeni, setYeni] = useState(azalt);
  const olcek = useSharedValue(1);
  useEffect(() => {
    titresim.guclu();
    if (azalt) {
      titresim.basari();
      return;
    }
    const z = setTimeout(() => {
      setYeni(true);
      titresim.basari();
      olcek.value = withSequence(
        withTiming(1.2, { duration: 220 }),
        withTiming(1, { duration: 380, easing: Easing.out(Easing.back(2)) }),
      );
    }, 1500);
    return () => {
      clearTimeout(z);
    };
  }, [azalt, olcek]);
  const stil = useAnimatedStyle(() => ({ transform: [{ scale: olcek.value }] }));
  if (!k) return null;
  const tur = (
    ['kivilcim', 'dinamo', 'sedir'].includes(k.tur_kodu) ? k.tur_kodu : 'kivilcim'
  ) as TurKodu;
  const asama = yeni ? k.asama : (olay.fark.eskiAsama ?? k.asama);
  return (
    <Modal
      visible
      animationType={azalt ? 'none' : 'fade'}
      onRequestClose={kapat}
      statusBarTranslucent
    >
      <View
        accessibilityViewIsModal
        className="flex-1 items-center justify-center gap-6 bg-arkaPlan p-6"
        testID="evrim-sahnesi"
      >
        <Metin
          varyant="baslik"
          className="text-center"
          accessibilityRole="header"
          accessibilityLiveRegion="polite"
        >
          {yeni
            ? t('mobil.motivasyon.evrim.yeni', { ad: k.ad, asama: k.asama })
            : t('mobil.motivasyon.evrim.basliyor', { ad: k.ad })}
        </Metin>
        <Animated.View style={stil}>
          <Companion
            tur={tur}
            asama={asama}
            seviye={olay.durum.seviye}
            beceriler={becerilerNesnesi(olay.durum)}
            ruhHali={yeni ? 'kutlama' : 'normal'}
            ad={k.ad}
            boyut={260}
          />
        </Animated.View>
        <Metin varyant="ikincil" className="text-center">
          {t('mobil.motivasyon.evrim.alt', { seviye: olay.fark.yeniSeviye })}
        </Metin>
        <Dugme
          varyant="ikincil"
          etiket={t('mobil.motivasyon.evrim.atla')}
          onPress={kapat}
          testID="evrim-atla"
        />
      </View>
    </Modal>
  );
}

/**
 * Merkezi XP geri bildirim katmani (uygulama duzeni icinde bir kez baglanir). `XpYoneticisi`
 * olaylarini sirayla gosterir: ucan "+N XP" + hafif titresim, seviye atlama karti, tam ekran evrim
 * sahnesi (<= 4 sn, atlanabilir), yeni rozet. "Hareketi azalt" aciksa animasyon yoktur (etiket sabit
 * durur, evrim yeni asamayi dogrudan gosterir); titresim yine verilir.
 */
export function XpKatmani() {
  const { xp } = useServisler();
  const azalt = useHareketAzalt();
  const [kuyruk, setKuyruk] = useState<XpOlayi[]>([]);
  const [adimNo, setAdimNo] = useState(0);
  const olay = kuyruk[0];
  const adimlar = olay ? adimlariPlanla(olay.fark) : [];
  const adim = adimlar[adimNo];
  const zamanlayici = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () =>
      xp.abone((o) => {
        // Gosterilecek adimi olmayan olay (ornegin yalniz ters kayit) kuyruga girmez.
        if (adimlariPlanla(o.fark).length > 0) setKuyruk((k) => [...k, o]);
      }),
    [xp],
  );

  const ilerle = () => {
    if (zamanlayici.current) clearTimeout(zamanlayici.current);
    zamanlayici.current = null;
    if (adimNo + 1 < adimlar.length) setAdimNo(adimNo + 1);
    else {
      setAdimNo(0);
      setKuyruk((k) => k.slice(1));
    }
  };

  useEffect(() => {
    if (!olay) return;
    if (!adim) return;
    if (adim.tur === 'xp') {
      titresim.hafif();
      AccessibilityInfo.announceForAccessibility(
        t('mobil.motivasyon.xpEtiketi', { xp: olay.fark.xp }),
      );
    } else if (adim.tur === 'seviye' || adim.tur === 'rozet') {
      titresim.basari();
      AccessibilityInfo.announceForAccessibility(
        adim.tur === 'seviye'
          ? t('mobil.motivasyon.seviyeAtladi', { seviye: olay.fark.yeniSeviye })
          : t('mobil.motivasyon.yeniRozet', { ad: olay.fark.yeniRozetler.join(', ') }),
      );
    }
    zamanlayici.current = setTimeout(ilerle, adim.sureMs);
    return () => {
      if (zamanlayici.current) clearTimeout(zamanlayici.current);
    };
    // `ilerle` her cizimde yeniden olusur; adim degisince zamanlayici yeniden kurulur.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [olay, adimNo]);

  if (!olay || !adim) return null;
  return (
    <View
      pointerEvents="box-none"
      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
    >
      {adim.tur === 'xp' ? (
        <UcanEtiket key={`${String(kuyruk.length)}-x`} xp={olay.fark.xp} azalt={azalt} />
      ) : null}
      {adim.tur === 'seviye' ? (
        <Kutlama
          baslik={t('mobil.motivasyon.seviyeAtladi', { seviye: olay.fark.yeniSeviye })}
          alt={t('mobil.motivasyon.seviyeAtladiAlt')}
          kapat={ilerle}
        />
      ) : null}
      {adim.tur === 'rozet' ? (
        <Kutlama
          baslik={t('mobil.motivasyon.yeniRozet', { ad: olay.fark.yeniRozetler.join(', ') })}
          kapat={ilerle}
        />
      ) : null}
      {adim.tur === 'evrim' ? <EvrimSahnesi olay={olay} azalt={azalt} kapat={ilerle} /> : null}
    </View>
  );
}
