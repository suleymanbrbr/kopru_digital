import { t } from '@kopru/i18n';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Linking, Pressable, View } from 'react-native';

import type { Ders } from '../api/operasyonTipleri';
import { bugunTarihi, gunBasligi, gunKisa, gunNumarasi, saatAraligi, tarihEkle } from '../lib/saat';
import { Dugme } from '../ui/Dugme';
import { BosDurum, HataDurumu, Yukleniyor } from '../ui/Durumlar';
import { Ikon } from '../ui/Ikon';
import { Kart } from '../ui/Kart';
import { Metin } from '../ui/Metin';
import { hataMesaji } from '../uygulama/hatalar';
import {
  dersAdi,
  useGruplar,
  useGunDersleri,
  useModulAcik,
  useSaatDilimi,
} from '../uygulama/operasyon';
import { CevrimdisiSerit } from './CevrimdisiSerit';
import { DersIslemleri } from './DersIslemleri';

/** http(s) bagi mi (baska semalar acilmaz). */
export function guvenliBaglantiMi(url: string | null): url is string {
  return !!url && /^https?:\/\//i.test(url.trim());
}

/** Bir dersin tek satiri; ogrenci/ogretmen ekranlari ortak kullanir. */
export function DersSatiri({
  ders,
  ad,
  tz,
  onUzunBas,
  baglantiGoster = true,
}: {
  ders: Ders;
  ad: string;
  tz: string;
  onUzunBas?: () => void;
  baglantiGoster?: boolean;
}) {
  const iptal = ders.durum === 'iptal';
  const saat = saatAraligi(ders.baslangic, ders.bitis, tz);
  const durumMetni = iptal
    ? t('mobil.ders.iptalEdildi')
    : ders.durum === 'tamamlandi'
      ? t('mobil.ders.tamamlandi')
      : null;
  const etiket = [
    `${ad}, ${saat}`,
    durumMetni,
    ders.seriId ? t('mobil.ders.haftalik') : null,
    onUzunBas ? t('mobil.ders.uzunBas') : null,
  ]
    .filter(Boolean)
    .join('. ');

  return (
    <View
      className="gap-2 rounded-buyuk border border-kenar bg-yuzey p-4"
      testID={`ders-${ders.id}`}
    >
      <Pressable
        accessible
        accessibilityLabel={etiket}
        accessibilityActions={
          onUzunBas ? [{ name: 'activate', label: t('mobil.ders.islemler') }] : undefined
        }
        onAccessibilityAction={
          onUzunBas
            ? () => {
                onUzunBas();
              }
            : undefined
        }
        onLongPress={onUzunBas}
        delayLongPress={350}
        className="min-h-dokunma gap-1 active:opacity-80"
      >
        <View className="flex-row items-center justify-between gap-2">
          <Metin varyant="altBaslik" className={iptal ? 'line-through' : ''}>
            {saat}
          </Metin>
          {durumMetni ? (
            <View className="flex-row items-center gap-1">
              <Ikon ad={iptal ? 'close-circle-outline' : 'checkmark-circle-outline'} boyut={16} />
              <Metin varyant="kucuk">{durumMetni}</Metin>
            </View>
          ) : null}
        </View>
        <Metin className={iptal ? 'line-through' : ''}>{ad}</Metin>
        <View className="flex-row flex-wrap items-center gap-x-3">
          {ders.seriId ? (
            <View className="flex-row items-center gap-1">
              <Ikon ad="repeat" boyut={14} />
              <Metin varyant="kucuk">{t('mobil.ders.haftalik')}</Metin>
            </View>
          ) : null}
          {ders.katilimciSayisi > 1 ? (
            <Metin varyant="kucuk">
              {t('mobil.ders.ogrenciSayisi', { n: ders.katilimciSayisi })}
            </Metin>
          ) : null}
          {ders.yer ? (
            <Metin varyant="kucuk">{t('mobil.ders.yer', { yer: ders.yer })}</Metin>
          ) : null}
        </View>
      </Pressable>
      {baglantiGoster && !iptal && guvenliBaglantiMi(ders.onlineBaglanti) ? (
        <Dugme
          className="self-start"
          varyant="ikincil"
          etiket={t('mobil.ders.baglanti')}
          onPress={() => {
            void Linking.openURL(ders.onlineBaglanti?.trim() ?? '').catch(() => undefined);
          }}
        />
      ) : null}
    </View>
  );
}

const SERIT_GUN = 7;

/**
 * `dersler` sekmesi (ogretmen/yonetici/sahip): gun seridiyle gunluk liste, uzun basinca tasi/iptal,
 * "+" ile yeni ders. Saatler kurumun saat diliminde gosterilir.
 */
export function DerslerEkrani() {
  const router = useRouter();
  const qc = useQueryClient();
  const { tz, hazir } = useSaatDilimi();
  const bugun = bugunTarihi(tz);
  const [secili, setSecili] = useState<string | null>(null);
  const [seritBasi, setSeritBasi] = useState<string | null>(null);
  const [islem, setIslem] = useState<Ders | null>(null);
  const [bildirim, setBildirim] = useState<string | null>(null);
  const yoklamaAcik = useModulAcik('yoklama');

  const gun = secili ?? bugun;
  const bas = seritBasi ?? tarihEkle(gun, -1);
  const sorgu = useGunDersleri(gun);
  const gruplar = useGruplar();

  useEffect(() => {
    if (!bildirim) return;
    const z = setTimeout(() => {
      setBildirim(null);
    }, 5000);
    return () => {
      clearTimeout(z);
    };
  }, [bildirim]);

  const gunler = useMemo(
    () => Array.from({ length: SERIT_GUN }, (_, i) => tarihEkle(bas, i)),
    [bas],
  );
  const liste = sorgu.data ?? [];
  const grupTuru = islem ? gruplar.data?.find((g) => g.id === islem.grupId)?.tur : undefined;

  return (
    <>
      <CevrimdisiSerit />
      <View className="flex-1 gap-3 bg-arkaPlan px-4 pt-14">
        <View className="flex-row items-center justify-between gap-2">
          <Metin varyant="baslik" accessibilityRole="header">
            {t('mobil.sekmeler.dersler')}
          </Metin>
          <Dugme
            etiket={t('mobil.ders.ekle')}
            onPress={() => {
              router.push({ pathname: '/ders-ekle', params: { tarih: gun } });
            }}
          />
        </View>

        <View accessibilityLabel={t('mobil.ders.gunSeridi')} className="gap-2">
          <View className="flex-row items-center gap-1">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('mobil.ders.gunSec', {
                tarih: gunBasligi(tarihEkle(bas, -SERIT_GUN)),
              })}
              className="min-h-dokunma min-w-dokunma items-center justify-center"
              onPress={() => {
                setSeritBasi(tarihEkle(bas, -SERIT_GUN));
              }}
            >
              <Ikon ad="chevron-back" />
            </Pressable>
            <View className="flex-1 flex-row justify-between">
              {gunler.map((g) => {
                const sec = g === gun;
                return (
                  <Pressable
                    key={g}
                    accessibilityRole="button"
                    accessibilityLabel={t('mobil.ders.gunSec', { tarih: gunBasligi(g) })}
                    accessibilityState={{ selected: sec }}
                    onPress={() => {
                      setSecili(g);
                    }}
                    className={`min-h-dokunma items-center justify-center rounded-orta px-2 py-1 ${
                      sec ? 'bg-birincil' : g === bugun ? 'border border-birincil' : ''
                    }`}
                  >
                    <Metin varyant="kucuk" className={sec ? 'text-birincilUzeri' : ''}>
                      {gunKisa(g)}
                    </Metin>
                    <Metin varyant="etiket" className={sec ? 'text-birincilUzeri' : ''}>
                      {gunNumarasi(g)}
                    </Metin>
                  </Pressable>
                );
              })}
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('mobil.ders.gunSec', {
                tarih: gunBasligi(tarihEkle(bas, SERIT_GUN)),
              })}
              className="min-h-dokunma min-w-dokunma items-center justify-center"
              onPress={() => {
                setSeritBasi(tarihEkle(bas, SERIT_GUN));
              }}
            >
              <Ikon ad="chevron-forward" />
            </Pressable>
          </View>
          <View className="flex-row items-center justify-between">
            <Metin varyant="etiket" accessibilityRole="header">
              {gunBasligi(gun)}
            </Metin>
            {gun !== bugun ? (
              <Dugme
                varyant="hayalet"
                etiket={t('mobil.ders.bugunButon')}
                onPress={() => {
                  setSecili(null);
                  setSeritBasi(null);
                }}
              />
            ) : null}
          </View>
        </View>

        {bildirim ? (
          <Kart accessibilityLiveRegion="polite" testID="ders-bildirim">
            <Metin varyant="etiket">{bildirim}</Metin>
          </Kart>
        ) : null}

        {!hazir || sorgu.isPending ? <Yukleniyor /> : null}
        {sorgu.isError && !sorgu.data ? (
          <HataDurumu mesaj={hataMesaji(sorgu.error)} tekrar={() => void sorgu.refetch()} />
        ) : null}
        {sorgu.data ? (
          <FlatList
            data={liste}
            keyExtractor={(d) => d.id}
            contentContainerClassName="gap-3 pb-8 grow"
            refreshing={sorgu.isRefetching}
            onRefresh={() => {
              void qc.invalidateQueries({ queryKey: ['dersler'] });
            }}
            ListEmptyComponent={<BosDurum ikon="calendar-outline" mesaj={t('mobil.ders.bos')} />}
            renderItem={({ item }) => (
              <DersSatiri
                ders={item}
                ad={dersAdi(item, gruplar.data)}
                tz={tz}
                onUzunBas={
                  item.durum === 'planli'
                    ? () => {
                        setIslem(item);
                      }
                    : undefined
                }
              />
            )}
          />
        ) : null}
      </View>
      {islem ? (
        <DersIslemleri
          ders={islem}
          ad={dersAdi(islem, gruplar.data)}
          tz={tz}
          {...(grupTuru ? { grupTuru } : {})}
          yoklamaAcik={yoklamaAcik}
          kapat={(mesaj) => {
            setIslem(null);
            if (mesaj) setBildirim(mesaj);
          }}
        />
      ) : null}
    </>
  );
}
