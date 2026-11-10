import { t } from '@kopru/i18n';
import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';

import type { BekleyenTeslim } from '../api/ogrenmeTipleri';
import { kisaZaman } from '../lib/saat';
import { netBicimle } from '../ogrenme/net';
import { Dugme } from '../ui/Dugme';
import { BosDurum, HataDurumu, Yukleniyor } from '../ui/Durumlar';
import { Ikon } from '../ui/Ikon';
import { Kart } from '../ui/Kart';
import { Metin } from '../ui/Metin';
import { hataMesaji } from '../uygulama/hatalar';
import { useBekleyenTeslimler, useDenemeler } from '../uygulama/ogrenme';
import { useModulAcik, useSaatDilimi } from '../uygulama/operasyon';
import { useDenemeKarari } from './DenemeOnayKuyrugu';

/** Kartta en cok gosterilen satir sayisi (kalani ekranda "tumunu gor" ile acilir). */
const ONIZLEME = 5;

function BekleyenTeslimler() {
  const router = useRouter();
  const { tz } = useSaatDilimi();
  const sorgu = useBekleyenTeslimler();
  const liste = sorgu.data ?? [];
  const ac = (b: BekleyenTeslim) => {
    router.push({ pathname: '/odev/[id]', params: { id: b.odevId } });
  };
  return (
    <Kart className="gap-2" testID="inceleme-bekleyenler">
      <Metin varyant="altBaslik" accessibilityRole="header">
        {t('mobil.ogrenme.odev.incelemeBekleyen')}
        {liste.length > 0 ? ` (${String(liste.length)})` : ''}
      </Metin>
      {sorgu.isPending ? <Yukleniyor /> : null}
      {sorgu.isError && !sorgu.data ? (
        <HataDurumu mesaj={hataMesaji(sorgu.error)} tekrar={() => void sorgu.refetch()} />
      ) : null}
      {sorgu.data && liste.length === 0 ? (
        <BosDurum
          ikon="checkmark-circle-outline"
          mesaj={t('mobil.ogrenme.odev.incelemeBos')}
        />
      ) : null}
      {liste.slice(0, ONIZLEME).map((b) => (
        <Pressable
          key={b.ogrenciOdevId}
          accessibilityRole="button"
          accessibilityLabel={t('mobil.ogrenme.odev.bekleyenSatirEtiketi', {
            ad: b.ad ?? t('mobil.ogrenciler.adsiz'),
            odev: b.odevBaslik,
          })}
          testID={`bekleyen-${b.ogrenciOdevId}`}
          onPress={() => {
            ac(b);
          }}
          className="min-h-dokunma flex-row items-center gap-2 border-t border-kenar py-2 active:opacity-80"
        >
          <View className="flex-1">
            <Metin varyant="etiket">{b.ad ?? t('mobil.ogrenciler.adsiz')}</Metin>
            <Metin varyant="kucuk">
              {b.odevBaslik}
              {b.teslimAt ? ` · ${kisaZaman(b.teslimAt, tz)}` : ''}
              {b.gecTeslim ? ` · ${t('mobil.ogrenme.odev.gecTeslim')}` : ''}
            </Metin>
          </View>
          <Ikon ad="chevron-forward" boyut={18} />
        </Pressable>
      ))}
      {liste.length > ONIZLEME ? (
        <Metin varyant="kucuk" className="text-center">
          {t('mobil.ogrenme.odev.dahaFazla', { n: liste.length - ONIZLEME })}
        </Metin>
      ) : null}
    </Kart>
  );
}

function OnayBekleyenDenemeler() {
  const router = useRouter();
  const sorgu = useDenemeler({ onay: 'bekliyor' });
  const karar = useDenemeKarari(() => undefined);
  const liste = sorgu.data ?? [];
  return (
    <Kart className="gap-2" testID="onay-bekleyen-denemeler">
      <Metin varyant="altBaslik" accessibilityRole="header">
        {t('mobil.ogrenme.deneme.onayBekleyen')}
        {liste.length > 0 ? ` (${String(liste.length)})` : ''}
      </Metin>
      {sorgu.isPending ? <Yukleniyor /> : null}
      {sorgu.isError && !sorgu.data ? (
        <HataDurumu mesaj={hataMesaji(sorgu.error)} tekrar={() => void sorgu.refetch()} />
      ) : null}
      {sorgu.data && liste.length === 0 ? (
        <BosDurum ikon="checkmark-circle-outline" mesaj={t('mobil.ogrenme.deneme.onayBos')} />
      ) : null}
      {liste.slice(0, ONIZLEME).map((d) => (
        <View key={d.id} className="gap-2 border-t border-kenar pt-2" testID={`bugun-onay-${d.id}`}>
          <View
            accessible
            accessibilityLabel={t('mobil.ogrenme.deneme.onaySatirEtiketi', {
              ad: d.ogrenciAd ?? t('mobil.ogrenciler.adsiz'),
              deneme: d.ad,
              net: netBicimle(d.toplamNet),
            })}
          >
            <Metin varyant="etiket">{d.ogrenciAd ?? t('mobil.ogrenciler.adsiz')}</Metin>
            <Metin varyant="kucuk">
              {d.ad} · {t('mobil.ogrenme.deneme.netDeger', { net: netBicimle(d.toplamNet) })}
            </Metin>
          </View>
          <Dugme
            etiket={`${t('mobil.ogrenme.deneme.onayla')}: ${d.ogrenciAd ?? d.ad}`}
            onPress={() => {
              karar.mutate({ id: d.id });
            }}
          />
        </View>
      ))}
      {liste.length > 0 ? (
        <Dugme
          varyant="hayalet"
          etiket={t('mobil.ogrenme.deneme.onayKuyruguAc')}
          onPress={() => {
            router.push('/deneme-onay');
          }}
        />
      ) : null}
    </Kart>
  );
}

/**
 * Ogretmen "Bugun" ekraninin odev ve deneme kartlari: inceleme bekleyen teslimler, onay bekleyen
 * denemeler ve "Odev ver" hizli eylemi. Her kart kendi modulu kapaliysa hic cizilmez.
 */
export function OgretmenOgrenmeKartlari() {
  const router = useRouter();
  const odev = useModulAcik('odev');
  const deneme = useModulAcik('deneme');
  if (!odev && !deneme) return null;
  return (
    <>
      {odev ? (
        <>
          <Dugme
            etiket={t('mobil.ogrenme.odev.odevVer')}
            onPress={() => {
              router.push('/odev-ver');
            }}
          />
          <BekleyenTeslimler />
        </>
      ) : null}
      {deneme ? <OnayBekleyenDenemeler /> : null}
    </>
  );
}
