import { t, type MessageKey } from '@kopru/i18n';
import { useReducer, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { cizimiDuzlestir } from '../cizim/duzlestir';
import {
  BOS_CIZIM,
  CizimCokBuyukHatasi,
  KALEM_HEX,
  KALEM_RENKLERI,
  cizgiEkle,
  geriAl,
  geriAlinabilir,
  serilestir,
  temizle,
  yinele,
  yinelenebilir,
  type Arac,
  type CizimDurumu,
  type CizimVerisi,
  type Cizgi,
} from '../cizim/model';
import { Tuval } from '../cizim/Tuval';
import { SES_UYARI_KALAN_SN, kalanSn, kayitSuresiSn, sureMetni } from '../ses/sinirlar';
import { useSesKaydi } from '../ses/useSesKaydi';
import { Ikon } from '../ui/Ikon';
import { Metin } from '../ui/Metin';
import { IzinKarti } from './parcalar';

export interface CizimSonucu {
  /** Duzlestirilmis JPEG (yerel). */
  duzUri: string;
  genislik: number;
  yukseklik: number;
  veri: CizimVerisi;
  /** `mini`: ses kaydi (m4a, yerel) ve suresi. */
  sesUri?: string;
  sesSn?: number;
}

export type CizimModu = 'isaret' | 'cizim' | 'mini';

type Eylem = { tur: 'ekle'; c: Cizgi } | { tur: 'geri' } | { tur: 'yinele' } | { tur: 'temizle' };

function indirge(d: CizimDurumu, e: Eylem): CizimDurumu {
  switch (e.tur) {
    case 'ekle':
      return cizgiEkle(d, e.c);
    case 'geri':
      return geriAl(d);
    case 'yinele':
      return yinele(d);
    default:
      return temizle(d);
  }
}

function Arac_({
  etiket,
  secili,
  onPress,
  children,
  testID,
  pasif,
}: {
  etiket: string;
  secili?: boolean;
  onPress: () => void;
  children: React.ReactNode;
  testID?: string;
  pasif?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={etiket}
      accessibilityState={{ selected: !!secili, disabled: !!pasif }}
      disabled={pasif}
      onPress={onPress}
      testID={testID}
      className={`h-11 min-w-11 items-center justify-center rounded-orta border px-2 active:opacity-80 ${
        secili ? 'border-birincil bg-yuzeyIkincil' : 'border-kenar bg-yuzey'
      } ${pasif ? 'opacity-40' : ''}`}
    >
      {children}
    </Pressable>
  );
}

/**
 * Fotograf uzerine cizim (tam ekran). Modlar: `isaret` (ogrenci, yalniz kirmizi kalem + silgi),
 * `cizim` (ogretmen, 3 renk + silgi) ve `mini` (cizim + ayni anda ses kaydi; cizgi noktalari
 * ses baslangicina gore zaman damgali). Geri al/yinele/temizle her modda var.
 */
export function CizimEkrani({
  mod,
  gorsel,
  kaynakUri,
  oran,
  onBitti,
  onVazgec,
}: {
  mod: CizimModu;
  /** Skia'nin gosterecegi gorsel (uri ya da mock varligi). */
  gorsel: string | number;
  /** Duzlestirme icin okunacak dosya/adres. */
  kaynakUri: string;
  oran: number;
  onBitti: (s: CizimSonucu) => void;
  onVazgec: () => void;
}) {
  const ins = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [durum, gonder] = useReducer(indirge, BOS_CIZIM);
  const [arac, setArac] = useState<Arac>('kirmizi');
  const [mesgul, setMesgul] = useState(false);
  const [hata, setHata] = useState<MessageKey | null>(null);
  const ses = useSesKaydi();
  const mini = mod === 'mini';

  // Tuval ekrana sigar: genislik, kalan yukseklige gore de sinirlanir (araclar + ust cubuk ~ 200).
  const uygunYukseklik = height - ins.top - ins.bottom - 230;
  const tuvalGenislik = Math.max(160, Math.min(width - 24, uygunYukseklik / oran));

  const cizebilir = !mini || ses.asama === 'kaydediyor';
  const renkler = mod === 'isaret' ? (['kirmizi'] as const) : KALEM_RENKLERI;

  async function bitti() {
    if (durum.cizgiler.length === 0) {
      setHata('mobil.soru.cizim.cizimYok');
      return;
    }
    setMesgul(true);
    setHata(null);
    try {
      if (ses.asama === 'kaydediyor') await ses.durdur();
      const veri = serilestir(durum.cizgiler, oran, { zamanli: mini });
      const duz = await cizimiDuzlestir(kaynakUri, durum.cizgiler);
      onBitti({
        duzUri: duz.uri,
        genislik: duz.genislik,
        yukseklik: duz.yukseklik,
        veri,
        ...(mini && ses.uri ? { sesUri: ses.uri, sesSn: kayitSuresiSn(ses.gecenSn) } : {}),
      });
    } catch (e) {
      setHata(
        e instanceof CizimCokBuyukHatasi
          ? 'mobil.soru.cizim.cokBuyuk'
          : 'mobil.soru.cizim.hazirlanamadi',
      );
      setMesgul(false);
    }
  }

  const kalan = kalanSn(ses.gecenSn);

  return (
    <Modal visible animationType="slide" onRequestClose={onVazgec} statusBarTranslucent>
      <View
        className="flex-1 bg-arkaPlan"
        style={{ paddingTop: ins.top, paddingBottom: ins.bottom }}
      >
        <View className="flex-row items-center justify-between px-4 py-2">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('mobil.soru.cizim.vazgec')}
            onPress={onVazgec}
            className="min-h-dokunma justify-center"
            testID="cizim-vazgec"
          >
            <Metin>{t('mobil.soru.cizim.vazgec')}</Metin>
          </Pressable>
          <Metin varyant="altBaslik" accessibilityRole="header">
            {mod === 'isaret' ? t('mobil.soru.isaret.baslik') : t('mobil.soru.cizim.baslik')}
          </Metin>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('mobil.soru.cizim.tamam')}
            accessibilityState={{ disabled: mesgul, busy: mesgul }}
            disabled={mesgul}
            onPress={() => void bitti()}
            className="min-h-dokunma justify-center"
            testID="cizim-tamam"
          >
            {mesgul ? (
              <ActivityIndicator />
            ) : (
              <Metin varyant="etiket" className="text-birincil">
                {t('mobil.soru.cizim.tamam')}
              </Metin>
            )}
          </Pressable>
        </View>

        <ScrollView
          scrollEnabled={false}
          contentContainerStyle={{ alignItems: 'center' }}
          keyboardShouldPersistTaps="handled"
        >
          <Tuval
            kaynak={gorsel}
            oran={oran}
            genislik={tuvalGenislik}
            cizgiler={durum.cizgiler}
            {...(cizebilir && !mesgul
              ? {
                  arac,
                  onCizgi: (c: Cizgi) => {
                    gonder({ tur: 'ekle', c });
                  },
                  zaman: mini ? ses.zaman : undefined,
                }
              : {})}
            testID="cizim-tuvali"
          />
        </ScrollView>

        <View className="gap-2 px-3 pb-2 pt-3">
          {mini ? (
            <View className="gap-2">
              {ses.hata === 'izin' ? <IzinKarti tur="mikrofon" /> : null}
              {ses.hata === 'baslamadi' ? (
                <Metin varyant="ikincil" className="text-hata" accessibilityRole="alert">
                  {t('mobil.soru.ses.baslamadi')}
                </Metin>
              ) : null}
              <View className="flex-row items-center gap-3">
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={
                    ses.asama === 'kaydediyor'
                      ? t('mobil.soru.cizim.kayitDurdur')
                      : t('mobil.soru.cizim.kayitBasla')
                  }
                  disabled={ses.asama === 'bitti' || mesgul}
                  onPress={() => {
                    if (ses.asama === 'kaydediyor') void ses.durdur();
                    else void ses.baslat();
                  }}
                  className={`min-h-dokunma flex-row items-center gap-2 rounded-buyuk px-4 ${
                    ses.asama === 'kaydediyor' ? 'bg-hata' : 'bg-birincil'
                  } ${ses.asama === 'bitti' ? 'opacity-40' : ''}`}
                  testID="mini-kayit"
                >
                  <Ikon ad={ses.asama === 'kaydediyor' ? 'stop' : 'mic'} renk="#FFFFFF" />
                  <Metin varyant="etiket" className="text-white">
                    {ses.asama === 'kaydediyor'
                      ? t('mobil.soru.cizim.kayitDurdur')
                      : t('mobil.soru.cizim.kayitBasla')}
                  </Metin>
                </Pressable>
                <View className="flex-1" accessibilityLiveRegion="polite">
                  {ses.asama === 'kaydediyor' ? (
                    <>
                      <Metin varyant="etiket">
                        {t('mobil.soru.cizim.kaydediyor', { sure: sureMetni(ses.gecenSn) })}
                      </Metin>
                      <Metin
                        varyant="kucuk"
                        className={kalan <= SES_UYARI_KALAN_SN ? 'text-hata' : ''}
                      >
                        {kalan <= SES_UYARI_KALAN_SN
                          ? t('mobil.soru.cizim.sinirYaklasti', { sure: sureMetni(kalan) })
                          : t('mobil.soru.cizim.kalan', { sure: sureMetni(kalan) })}
                      </Metin>
                    </>
                  ) : ses.asama === 'bitti' ? (
                    <Metin varyant="etiket">
                      {t('mobil.soru.ses.hazir', { sure: sureMetni(ses.gecenSn) })}
                    </Metin>
                  ) : (
                    <Metin varyant="kucuk">{t('mobil.soru.cizim.miniIpucu')}</Metin>
                  )}
                </View>
              </View>
            </View>
          ) : null}

          <View className="flex-row flex-wrap items-center gap-2" testID="cizim-araclari">
            {renkler.map((r) => (
              <Arac_
                key={r}
                etiket={t(`mobil.soru.cizim.${r}` as MessageKey)}
                secili={arac === r}
                onPress={() => {
                  setArac(r);
                }}
                testID={`arac-${r}`}
              >
                <View
                  style={{ backgroundColor: KALEM_HEX[r], width: 22, height: 22, borderRadius: 11 }}
                />
              </Arac_>
            ))}
            <Arac_
              etiket={t('mobil.soru.cizim.silgi')}
              secili={arac === 'silgi'}
              onPress={() => {
                setArac('silgi');
              }}
              testID="arac-silgi"
            >
              <Ikon ad="backspace-outline" />
            </Arac_>
            <View className="w-2" />
            <Arac_
              etiket={t('mobil.soru.cizim.geriAl')}
              pasif={!geriAlinabilir(durum)}
              onPress={() => {
                gonder({ tur: 'geri' });
              }}
              testID="cizim-geri-al"
            >
              <Ikon ad="arrow-undo" />
            </Arac_>
            <Arac_
              etiket={t('mobil.soru.cizim.yinele')}
              pasif={!yinelenebilir(durum)}
              onPress={() => {
                gonder({ tur: 'yinele' });
              }}
              testID="cizim-yinele"
            >
              <Ikon ad="arrow-redo" />
            </Arac_>
            <Arac_
              etiket={t('mobil.soru.cizim.temizle')}
              pasif={durum.cizgiler.length === 0}
              onPress={() => {
                gonder({ tur: 'temizle' });
              }}
              testID="cizim-temizle"
            >
              <Ikon ad="trash-outline" />
            </Arac_>
          </View>
          {hata ? (
            <Metin varyant="ikincil" className="text-hata" accessibilityRole="alert">
              {t(hata)}
            </Metin>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}
