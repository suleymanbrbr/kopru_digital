import { t } from '@kopru/i18n';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, Share, View } from 'react-native';

import type { FinansOgrenciSatiri } from '../api/operasyonTipleri';
import type { GrupKatilimIstegi, SinifBekleyenleri } from '../api/tipler';
import { trSirala } from '../finans/kurallar';
import { katilimKarariSecenekleri, sinifBekleyenleriAnahtari } from '../hesap/katilimIstekleri';
import { kodGoster } from '../hesap/sinifKodu';
import { tarihGoster } from '../lib/zaman';
import { Dugme } from '../ui/Dugme';
import { BosDurum, HataDurumu, Yukleniyor } from '../ui/Durumlar';
import { Ikon } from '../ui/Ikon';
import { Kart } from '../ui/Kart';
import { Metin } from '../ui/Metin';
import { MetinGirdisi } from '../ui/MetinGirdisi';
import { KalanDersRozeti } from '../ui/Rozet';
import { useAktif, useServisler } from '../uygulama/baglam';
import { hataMesaji } from '../uygulama/hatalar';
import { useFinansOgrenciler, useModulAcik } from '../uygulama/operasyon';
import { CevrimdisiSerit } from './CevrimdisiSerit';
import { bakiyeMetni } from './OgrenciKartiEkrani';

function KodBolumu({
  grupId,
  grupAd,
  uyelikId,
}: {
  grupId: string;
  grupAd: string;
  uyelikId: string;
}) {
  const { adaptorler } = useServisler();
  const qc = useQueryClient();
  const anahtar = ['katilim-kodu', uyelikId, grupId] as const;
  const kod = useQuery({
    queryKey: anahtar,
    queryFn: () => adaptorler.hesap.katilimKodu(grupId),
    staleTime: 60_000,
  });
  const yenile = useMutation({
    networkMode: 'always',
    mutationFn: () => adaptorler.hesap.katilimKoduYenile(grupId),
    onSuccess: (k) => {
      qc.setQueryData(anahtar, k);
    },
  });

  function yenileOnay() {
    Alert.alert(t('mobil.ogrenciler.kodYenileOnay'), t('mobil.ogrenciler.kodYenileOnayMesaj'), [
      { text: t('ortak.iptal'), style: 'cancel' },
      {
        text: t('mobil.ogrenciler.kodYenile'),
        style: 'destructive',
        onPress: () => {
          yenile.mutate();
        },
      },
    ]);
  }

  function paylas(k: string) {
    // Sistem paylasim menusu; kod kisisel veri degildir ama metne ogrenci adi konmaz.
    void Share.share({ message: t('mobil.ogrenciler.kodPaylasMesaj', { grup: grupAd, kod: k }) });
  }

  const veri = kod.data;
  return (
    <View className="gap-2">
      <Metin varyant="etiket">{t('mobil.ogrenciler.kodBaslik')}</Metin>
      {kod.isPending ? <Yukleniyor /> : null}
      {kod.isError ? (
        <HataDurumu
          mesaj={hataMesaji(kod.error)}
          tekrar={() => {
            void kod.refetch();
          }}
        />
      ) : null}
      {veri === null ? (
        <>
          <Metin varyant="ikincil">{t('mobil.ogrenciler.kodYok')}</Metin>
          <Dugme
            varyant="ikincil"
            etiket={t('mobil.ogrenciler.kodOlustur')}
            yukleniyor={yenile.isPending}
            onPress={() => {
              yenile.mutate();
            }}
          />
        </>
      ) : null}
      {veri ? (
        <>
          <View
            accessible
            accessibilityLabel={t('mobil.ogrenciler.kodEtiketi', {
              kod: veri.kod.split('').join(' '),
            })}
            className="items-center rounded-orta bg-yuzeyIkincil py-3"
          >
            <Metin varyant="baslik" className="tracking-widest">
              {kodGoster(veri.kod)}
            </Metin>
          </View>
          <Metin varyant="kucuk">
            {veri.maxKullanim === null
              ? t('mobil.ogrenciler.kodKullanimSinirsiz', { kullanim: veri.kullanimSayisi })
              : t('mobil.ogrenciler.kodKullanim', {
                  kullanim: veri.kullanimSayisi,
                  max: veri.maxKullanim,
                })}
            {veri.bitis
              ? ` · ${t('mobil.ogrenciler.kodBitis', { tarih: tarihGoster(veri.bitis) })}`
              : ''}
          </Metin>
          <View className="flex-row gap-2">
            <Dugme
              className="flex-1"
              etiket={t('mobil.ogrenciler.kodPaylas')}
              onPress={() => {
                paylas(veri.kod);
              }}
            />
            <Dugme
              className="flex-1"
              varyant="ikincil"
              etiket={t('mobil.ogrenciler.kodYenile')}
              yukleniyor={yenile.isPending}
              onPress={yenileOnay}
            />
          </View>
        </>
      ) : null}
      {yenile.isError ? (
        <Metin varyant="ikincil" className="text-hata" accessibilityLiveRegion="polite">
          {hataMesaji(yenile.error)}
        </Metin>
      ) : null}
    </View>
  );
}

function IstekSatiri({
  istek,
  mesgul,
  onayla,
  reddet,
}: {
  istek: GrupKatilimIstegi;
  mesgul: boolean;
  onayla: () => void;
  reddet: () => void;
}) {
  const ad = istek.gorunenAd || t('mobil.ogrenciler.adsiz');
  return (
    <View className="gap-2 border-t border-kenar pt-3">
      <Metin varyant="govde" accessibilityRole="header">
        {ad}
      </Metin>
      <View className="flex-row gap-2">
        <Dugme
          className="flex-1"
          varyant="ikincil"
          etiket={t('mobil.ogrenciler.reddet')}
          accessibilityLabel={t('mobil.ogrenciler.reddetEtiketi', { ad })}
          disabled={mesgul}
          onPress={reddet}
        />
        <Dugme
          className="flex-1"
          etiket={t('mobil.ogrenciler.onayla')}
          accessibilityLabel={t('mobil.ogrenciler.onaylaEtiketi', { ad })}
          disabled={mesgul}
          onPress={onayla}
        />
      </View>
    </View>
  );
}

function SinifKarti({ veri, uyelikId }: { veri: SinifBekleyenleri; uyelikId: string }) {
  const { adaptorler } = useServisler();
  const qc = useQueryClient();
  const anahtar = sinifBekleyenleriAnahtari(uyelikId);
  const karar = useMutation(katilimKarariSecenekleri(qc, adaptorler.hesap, anahtar));
  const { grup, istekler } = veri;

  function reddetOnay(i: GrupKatilimIstegi) {
    const ad = i.gorunenAd || t('mobil.ogrenciler.adsiz');
    Alert.alert(t('mobil.ogrenciler.reddetOnay'), t('mobil.ogrenciler.reddetOnayMesaj', { ad }), [
      { text: t('ortak.iptal'), style: 'cancel' },
      {
        text: t('mobil.ogrenciler.reddet'),
        style: 'destructive',
        onPress: () => {
          karar.mutate({ grupId: grup.id, istekId: i.id, karar: 'reddet' });
        },
      },
    ]);
  }

  return (
    <Kart className="gap-4">
      <View className="gap-1" accessible accessibilityRole="header">
        <Metin varyant="altBaslik">{grup.ad}</Metin>
        <Metin varyant="ikincil">{t('mobil.ogrenciler.uyeSayisi', { n: grup.uyeSayisi })}</Metin>
      </View>

      <KodBolumu grupId={grup.id} grupAd={grup.ad} uyelikId={uyelikId} />

      <View className="gap-3">
        <Metin varyant="etiket">
          {t('mobil.ogrenciler.katilimBaslik')}
          {istekler.length > 0
            ? ` (${t('mobil.ogrenciler.bekleyenSayisi', { n: istekler.length })})`
            : ''}
        </Metin>
        {istekler.length === 0 ? (
          <Metin varyant="ikincil">{t('mobil.ogrenciler.istekYok')}</Metin>
        ) : null}
        {istekler.map((i) => (
          <IstekSatiri
            key={i.id}
            istek={i}
            mesgul={false}
            onayla={() => {
              karar.mutate({ grupId: grup.id, istekId: i.id, karar: 'onayla' });
            }}
            reddet={() => {
              reddetOnay(i);
            }}
          />
        ))}
        {karar.isError ? (
          <Metin varyant="ikincil" className="text-hata" accessibilityLiveRegion="polite">
            {hataMesaji(karar.error)}
          </Metin>
        ) : null}
      </View>
    </Kart>
  );
}

function OgrenciSatiri({ o, esik }: { o: FinansOgrenciSatiri; esik: number }) {
  const router = useRouter();
  const ad = o.ad || t('mobil.ogrenciler.adsiz');
  const kalan = o.model === 'paket' ? t('mobil.finans.kalanDersSayi', { n: o.kalanKredi }) : '';
  const bakiye = o.borclu ? bakiyeMetni(o.bakiyeKurus) : '';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[ad, kalan, bakiye].filter(Boolean).join(', ')}
      onPress={() => {
        router.push({ pathname: '/ogrenci/[id]', params: { id: o.ogrenciId, ad } });
      }}
      className="min-h-dokunma gap-1 rounded-buyuk border border-kenar bg-yuzey p-4 active:opacity-80"
      testID={`ogrenci-${o.ogrenciId}`}
    >
      <View className="flex-row items-center justify-between gap-2">
        <Metin varyant="altBaslik" className="flex-1">
          {ad}
        </Metin>
        <Ikon ad="chevron-forward" boyut={18} />
      </View>
      {o.model === 'paket' ? <KalanDersRozeti kalan={o.kalanKredi} esik={esik} /> : null}
      {o.borclu ? (
        <Metin varyant="kucuk" className="text-hata">
          {bakiyeMetni(o.bakiyeKurus)}
        </Metin>
      ) : null}
    </Pressable>
  );
}

/**
 * `ogrenciler` sekmesi (ogretmen/sahip/yonetici): finans modulu aciksa kalan ders rozetli ogrenci
 * listesi (Turkce siralama, arama) ve ogrenci karti; ayrica sinif gruplari, sinif kodu (goster,
 * paylas, yenile) ve gruba gore bekleyen katilim istekleri (onayla/reddet; iyimser guncelleme).
 */
export function OgrencilerEkrani() {
  const { adaptorler } = useServisler();
  const aktif = useAktif();
  const uyelikId = aktif?.uyelik.uyelikId;
  const finansAcik = useModulAcik('finans');
  const ogrenciler = useFinansOgrenciler();
  const [arama, setArama] = useState('');
  const liste = useQuery({
    queryKey: sinifBekleyenleriAnahtari(uyelikId),
    queryFn: () => adaptorler.hesap.sinifBekleyenleri(),
    enabled: !!uyelikId,
    staleTime: 0,
    // Bildirim henuz yok: yeni istekler icin hafif yoklama (yalnizca ekran acikken).
    refetchInterval: 30_000,
  });

  const gorunen = useMemo(() => {
    const q = arama.trim().toLocaleLowerCase('tr');
    const tum = ogrenciler.data?.ogrenciler ?? [];
    return trSirala(
      q ? tum.filter((o) => o.ad.toLocaleLowerCase('tr').includes(q)) : tum,
      (o) => o.ad,
    );
  }, [ogrenciler.data, arama]);

  const baslik = (
    <View className="gap-4">
      <Metin varyant="baslik" accessibilityRole="header">
        {t('mobil.ogrenciler.baslik')}
      </Metin>
      {finansAcik ? (
        <View className="gap-3">
          <MetinGirdisi
            etiket={t('mobil.finans.ara')}
            value={arama}
            onChangeText={setArama}
            autoCorrect={false}
            returnKeyType="search"
          />
          {ogrenciler.isPending ? <Yukleniyor /> : null}
          {ogrenciler.isError && !ogrenciler.data ? (
            <HataDurumu
              mesaj={hataMesaji(ogrenciler.error)}
              tekrar={() => {
                void ogrenciler.refetch();
              }}
            />
          ) : null}
          {ogrenciler.data && gorunen.length === 0 ? (
            <BosDurum ikon="sparkles" mesaj={t('mobil.finans.listeBos')} />
          ) : null}
        </View>
      ) : null}
    </View>
  );

  const altBilgi = (
    <View className="gap-4 pt-4">
      <Metin varyant="altBaslik" accessibilityRole="header">
        {t('mobil.ogrenciler.siniflarBaslik')}
      </Metin>
      {liste.isPending ? <Yukleniyor /> : null}
      {liste.isError ? (
        <HataDurumu
          mesaj={hataMesaji(liste.error)}
          tekrar={() => {
            void liste.refetch();
          }}
        />
      ) : null}
      {liste.data?.length === 0 ? (
        <BosDurum ikon="sparkles" mesaj={t('mobil.ogrenciler.sinifYok')} />
      ) : null}
      {uyelikId
        ? liste.data?.map((v) => <SinifKarti key={v.grup.id} veri={v} uyelikId={uyelikId} />)
        : null}
      {liste.data ? (
        <Dugme
          varyant="hayalet"
          etiket={t('mobil.sinifKodu.yenile')}
          yukleniyor={liste.isFetching}
          onPress={() => {
            void liste.refetch();
          }}
        />
      ) : null}
    </View>
  );

  return (
    <>
      <CevrimdisiSerit />
      <View className="flex-1 bg-arkaPlan pt-14">
        <FlatList
          data={finansAcik ? gorunen : []}
          keyExtractor={(o) => o.ogrenciId}
          keyboardShouldPersistTaps="handled"
          contentContainerClassName="gap-3 p-4"
          ListHeaderComponent={baslik}
          ListFooterComponent={altBilgi}
          renderItem={({ item }) => (
            <OgrenciSatiri o={item} esik={ogrenciler.data?.dusukKrediEsigi ?? 2} />
          )}
        />
      </View>
    </>
  );
}
