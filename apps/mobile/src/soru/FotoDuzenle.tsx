import { t } from '@kopru/i18n';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  TUM_ALAN,
  dondurulmusBoyut,
  koseyiTasi,
  sigdir,
  type Boyut,
  type KirpmaAlani,
  type Kose,
} from '../foto/geometri';
import { fotoHazirla, type HazirFoto } from '../foto/hazirla';
import { Ikon } from '../ui/Ikon';
import { Metin } from '../ui/Metin';

const KOSELER: { kose: Kose; anahtar: 'ustSol' | 'ustSag' | 'altSol' | 'altSag' }[] = [
  { kose: 'ust-sol', anahtar: 'ustSol' },
  { kose: 'ust-sag', anahtar: 'ustSag' },
  { kose: 'alt-sol', anahtar: 'altSol' },
  { kose: 'alt-sag', anahtar: 'altSag' },
];
const TUTAMAC = 44;

function Tutamac({
  kose,
  etiket,
  x,
  y,
  alan,
  boyut,
  degistir,
}: {
  kose: Kose;
  etiket: string;
  x: number;
  y: number;
  alan: KirpmaAlani;
  boyut: { genislik: number; yukseklik: number; sol: number; ust: number };
  degistir: (a: KirpmaAlani) => void;
}) {
  // Surukleme baslangici: dokunus noktasi (sayfa) ve kosenin o andaki konumu (px).
  const bas = useRef({ px: 0, py: 0, kx: 0, ky: 0 });
  return (
    <View
      onStartShouldSetResponder={() => true}
      onResponderTerminationRequest={() => false}
      onResponderGrant={(e) => {
        const sag = kose.endsWith('sag');
        const alt = kose.startsWith('alt');
        bas.current = {
          px: e.nativeEvent.pageX,
          py: e.nativeEvent.pageY,
          kx: (sag ? alan.x + alan.g : alan.x) * boyut.genislik,
          ky: (alt ? alan.y + alan.y2 : alan.y) * boyut.yukseklik,
        };
      }}
      onResponderMove={(e) => {
        const b = bas.current;
        degistir(
          koseyiTasi(
            alan,
            kose,
            (b.kx + e.nativeEvent.pageX - b.px) / boyut.genislik,
            (b.ky + e.nativeEvent.pageY - b.py) / boyut.yukseklik,
          ),
        );
      }}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={etiket}
      testID={`kirp-${kose}`}
      style={{
        position: 'absolute',
        left: x - TUTAMAC / 2,
        top: y - TUTAMAC / 2,
        width: TUTAMAC,
        height: TUTAMAC,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <View className="h-6 w-6 rounded-tam border-2 border-white bg-birincil" />
    </View>
  );
}

/**
 * Kirp ve dondur (tam ekran). Dondurme asil fotograftan yapilir (nesil kaybi yok); onizleme kucuk
 * surumdur. "Tamam": dondur + kirp + 2000 px + JPEG (250-400 KB hedefi). Otomatik kenar
 * algilama yok (bkz. rapor): kullanici kosegi surukleyerek kirpar.
 */
export function FotoDuzenle({
  uri,
  boyut,
  onTamam,
  onVazgec,
}: {
  uri: string;
  boyut: Boyut;
  onTamam: (f: HazirFoto) => void;
  onVazgec: () => void;
}) {
  const ins = useSafeAreaInsets();
  const [derece, setDerece] = useState(0);
  const [alan, setAlan] = useState<KirpmaAlani>(TUM_ALAN);
  const [kap, setKap] = useState<Boyut>({ genislik: 0, yukseklik: 0 });
  const [onizleme, setOnizleme] = useState<string>(uri);
  const [mesgul, setMesgul] = useState(false);
  const [hata, setHata] = useState(false);

  const donmusBoyut = dondurulmusBoyut(boyut, derece);

  useEffect(() => {
    let iptal = false;
    async function yap() {
      if (derece === 0) {
        setOnizleme(uri);
        return;
      }
      const ctx = ImageManipulator.manipulate(uri).rotate(derece).resize({ width: 1200 });
      const r = await (
        await ctx.renderAsync()
      ).saveAsync({ format: SaveFormat.JPEG, compress: 0.8 });
      if (!iptal) setOnizleme(r.uri);
    }
    void yap();
    return () => {
      iptal = true;
    };
  }, [derece, uri]);

  const yerlesim = kap.genislik > 0 ? sigdir(donmusBoyut, kap) : null;

  function olc(e: LayoutChangeEvent) {
    setKap({ genislik: e.nativeEvent.layout.width, yukseklik: e.nativeEvent.layout.height });
  }

  async function tamam() {
    setMesgul(true);
    setHata(false);
    try {
      onTamam(await fotoHazirla(uri, boyut, { dondur: derece, kirp: alan }));
    } catch {
      setHata(true);
      setMesgul(false);
    }
  }

  const sol = yerlesim ? yerlesim.sol + alan.x * yerlesim.genislik : 0;
  const ust = yerlesim ? yerlesim.ust + alan.y * yerlesim.yukseklik : 0;
  const gen = yerlesim ? alan.g * yerlesim.genislik : 0;
  const yuk = yerlesim ? alan.y2 * yerlesim.yukseklik : 0;

  return (
    <Modal visible animationType="slide" onRequestClose={onVazgec} statusBarTranslucent>
      <View className="flex-1 bg-black" style={{ paddingTop: ins.top, paddingBottom: ins.bottom }}>
        <View className="flex-row items-center justify-between px-4 py-2">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('mobil.soru.kirp.vazgec')}
            onPress={onVazgec}
            className="min-h-dokunma justify-center"
          >
            <Metin className="text-white">{t('mobil.soru.kirp.vazgec')}</Metin>
          </Pressable>
          <Metin varyant="altBaslik" accessibilityRole="header" className="text-white">
            {t('mobil.soru.kirp.baslik')}
          </Metin>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('mobil.soru.kirp.tamam')}
            accessibilityState={{ disabled: mesgul, busy: mesgul }}
            disabled={mesgul}
            onPress={() => void tamam()}
            className="min-h-dokunma justify-center"
            testID="kirp-tamam"
          >
            {mesgul ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Metin varyant="etiket" className="text-white">
                {t('mobil.soru.kirp.tamam')}
              </Metin>
            )}
          </Pressable>
        </View>

        <View className="flex-1" onLayout={olc}>
          {yerlesim ? (
            <>
              <Image
                source={{ uri: onizleme }}
                style={{
                  position: 'absolute',
                  left: yerlesim.sol,
                  top: yerlesim.ust,
                  width: yerlesim.genislik,
                  height: yerlesim.yukseklik,
                }}
                resizeMode="stretch"
                accessibilityLabel={t('mobil.soru.ogrenci.fotografEtiketi', { n: 1 })}
              />
              {/* Kirpma disini karart */}
              <View
                style={{
                  position: 'absolute',
                  left: yerlesim.sol,
                  top: yerlesim.ust,
                  width: yerlesim.genislik,
                  height: alan.y * yerlesim.yukseklik,
                  backgroundColor: 'rgba(0,0,0,0.55)',
                }}
              />
              <View
                style={{
                  position: 'absolute',
                  left: yerlesim.sol,
                  top: ust + yuk,
                  width: yerlesim.genislik,
                  height: Math.max(0, yerlesim.ust + yerlesim.yukseklik - ust - yuk),
                  backgroundColor: 'rgba(0,0,0,0.55)',
                }}
              />
              <View
                style={{
                  position: 'absolute',
                  left: yerlesim.sol,
                  top: ust,
                  width: alan.x * yerlesim.genislik,
                  height: yuk,
                  backgroundColor: 'rgba(0,0,0,0.55)',
                }}
              />
              <View
                style={{
                  position: 'absolute',
                  left: sol + gen,
                  top: ust,
                  width: Math.max(0, yerlesim.sol + yerlesim.genislik - sol - gen),
                  height: yuk,
                  backgroundColor: 'rgba(0,0,0,0.55)',
                }}
              />
              <View
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  left: sol,
                  top: ust,
                  width: gen,
                  height: yuk,
                  borderWidth: 2,
                  borderColor: '#FFFFFF',
                }}
              />
              {KOSELER.map(({ kose, anahtar }) => (
                <Tutamac
                  key={kose}
                  kose={kose}
                  etiket={t('mobil.soru.kirp.kose', { kose: t(`mobil.soru.kirp.${anahtar}`) })}
                  x={kose.endsWith('sag') ? sol + gen : sol}
                  y={kose.startsWith('alt') ? ust + yuk : ust}
                  alan={alan}
                  boyut={yerlesim}
                  degistir={setAlan}
                />
              ))}
            </>
          ) : null}
        </View>

        <View className="items-center gap-2 px-4 pb-3 pt-2">
          {hata ? (
            <Metin varyant="ikincil" className="text-white" accessibilityRole="alert">
              {t('mobil.soru.ogrenci.fotografHazirlanamadi')}
            </Metin>
          ) : (
            <Metin varyant="kucuk" className="text-white">
              {t('mobil.soru.kirp.ipucu')}
            </Metin>
          )}
          <View className="flex-row gap-3">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('mobil.soru.kirp.dondur')}
              onPress={() => {
                setDerece((d) => (d + 90) % 360);
                setAlan(TUM_ALAN);
              }}
              className="min-h-dokunma flex-row items-center gap-2 rounded-buyuk border border-white px-5"
              testID="kirp-dondur"
            >
              <Ikon ad="refresh" renk="#FFFFFF" />
              <Metin varyant="etiket" className="text-white">
                {t('mobil.soru.kirp.dondur')}
              </Metin>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('mobil.soru.kirp.sifirla')}
              onPress={() => {
                setDerece(0);
                setAlan(TUM_ALAN);
              }}
              className="min-h-dokunma flex-row items-center gap-2 rounded-buyuk border border-white px-5"
            >
              <Ikon ad="scan" renk="#FFFFFF" />
              <Metin varyant="etiket" className="text-white">
                {t('mobil.soru.kirp.sifirla')}
              </Metin>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
