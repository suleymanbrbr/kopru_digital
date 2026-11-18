import { t } from '@kopru/i18n';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, RefreshControl, View } from 'react-native';

import type { Duyuru, DuyuruAliciOgesi } from '../../api/bildirimTipleri';
import { duyuruOnizleme } from '../../duyuru/metin';
import { zamanGoster } from '../../lib/zaman';
import { useTema } from '../../tema/TemaSaglayici';
import { Cip } from '../../ui/Cip';
import { Dugme } from '../../ui/Dugme';
import { BosDurum, HataDurumu, Yukleniyor } from '../../ui/Durumlar';
import { Ikon } from '../../ui/Ikon';
import { Metin } from '../../ui/Metin';
import { useServisler } from '../../uygulama/baglam';
import { useDuyuruYonetim, useDuyuruYazabilir, useDuyurularim } from '../../uygulama/duyuru';
import { hataMesaji } from '../../uygulama/hatalar';
import { grupEtiketi, useGruplar } from '../../uygulama/operasyon';
import { CevrimdisiSerit } from '../CevrimdisiSerit';

/** Alici satiri: sabit simgesi, okunmamis vurgusu (renk + nokta + metin), kisa onizleme. */
export function DuyuruSatiri({ oge, onAc }: { oge: DuyuruAliciOgesi; onAc: () => void }) {
  const { renkler } = useTema();
  const okunmamis = oge.okundu_at === null;
  const durum = okunmamis ? t('mobil.duyuru.okunmamis') : t('mobil.duyuru.okundu');
  return (
    <Pressable
      testID={`duyuru-${oge.id}`}
      accessibilityRole="button"
      accessibilityLabel={[
        durum,
        oge.sabit ? t('mobil.duyuru.sabit') : null,
        oge.baslik,
        duyuruOnizleme(oge.govde, 80),
        zamanGoster(oge.yayin_at),
      ]
        .filter(Boolean)
        .join('. ')}
      onPress={onAc}
      className={`min-h-dokunma flex-row items-start gap-3 rounded-buyuk border p-4 active:opacity-80 ${
        okunmamis ? 'border-birincil bg-yuzeyIkincil' : 'border-kenar bg-yuzey'
      }`}
    >
      <View className="pt-1">
        <Ikon
          ad={oge.sabit ? 'pin' : 'megaphone-outline'}
          boyut={22}
          renk={okunmamis ? renkler.birincil : renkler.metinIkincil}
        />
      </View>
      <View className="flex-1 gap-1">
        <View className="flex-row items-center gap-2">
          <Metin varyant={okunmamis ? 'altBaslik' : 'etiket'} className="flex-1">
            {oge.baslik}
          </Metin>
          {okunmamis ? (
            <View
              testID="duyuru-okunmamis-nokta"
              className="h-3 w-3 rounded-tam bg-birincil"
              accessibilityElementsHidden
            />
          ) : null}
        </View>
        <Metin varyant="ikincil" numberOfLines={2}>
          {duyuruOnizleme(oge.govde)}
        </Metin>
        <View className="flex-row items-center gap-2">
          {oge.sabit ? <Metin varyant="kucuk">{t('mobil.duyuru.sabit')} ·</Metin> : null}
          <Metin varyant="kucuk">{zamanGoster(oge.yayin_at)}</Metin>
        </View>
      </View>
    </Pressable>
  );
}

function hedefMetni(d: Duyuru, grupAdi: (id: string) => string | undefined): string {
  if (d.hedef_turu === 'grup') {
    return t('mobil.duyuru.yonetim.hedef.grup', { ad: grupAdi(d.hedef_id) ?? '—' });
  }
  return t(`mobil.duyuru.yonetim.hedef.${d.hedef_turu}`);
}

/** Yazar satiri: durum, hedef ve "okunan / alici" sayaci. */
function YazarSatiri({
  d,
  grupAdi,
  onAc,
}: {
  d: Duyuru;
  grupAdi: (id: string) => string | undefined;
  onAc: () => void;
}) {
  const durum = t(`mobil.duyuru.yonetim.durum.${d.durum}`);
  const ozet =
    d.durum === 'taslak'
      ? null
      : t('mobil.duyuru.yonetim.okunanOzeti', { okunan: d.okunan_sayisi, alici: d.alici_sayisi });
  return (
    <Pressable
      testID={`duyuru-yazar-${d.id}`}
      accessibilityRole="button"
      accessibilityLabel={[d.baslik, durum, hedefMetni(d, grupAdi), ozet]
        .filter(Boolean)
        .join('. ')}
      onPress={onAc}
      className="min-h-dokunma gap-1 rounded-buyuk border border-kenar bg-yuzey p-4 active:opacity-80"
    >
      <View className="flex-row items-center gap-2">
        <Metin varyant="altBaslik" className="flex-1">
          {d.baslik}
        </Metin>
        <View className="rounded-tam bg-yuzeyIkincil px-3 py-1">
          <Metin varyant="kucuk">{durum}</Metin>
        </View>
      </View>
      <Metin varyant="ikincil">{hedefMetni(d, grupAdi)}</Metin>
      {ozet ? (
        <Metin varyant="etiket" testID={`duyuru-okunan-${d.id}`}>
          {ozet}
        </Metin>
      ) : null}
      {d.durum === 'yayinda' && !d.dagitim_tamam ? (
        <Metin varyant="kucuk">{t('mobil.duyuru.yonetim.dagitiliyor')}</Metin>
      ) : null}
    </Pressable>
  );
}

/**
 * Duyurular: "Gelenler" (sabitler ustte, okunmamis vurgusu, cek-yenile, cevrimdisiyken kalici
 * onbellekten) ve personel icin "Yazdiklarim" (durum + okunan/alici) ile "Yeni duyuru".
 */
export function DuyuruListesi() {
  const router = useRouter();
  const { agGozlemcisi } = useServisler();
  const yazabilir = useDuyuruYazabilir();
  const [sekme, setSekme] = useState<'gelen' | 'yazdiklarim'>('gelen');
  const gelen = useDuyurularim();
  const yazdiklarim = useDuyuruYonetim(sekme === 'yazdiklarim');
  const gruplar = useGruplar();
  const [yenileniyor, setYenileniyor] = useState(false);

  const grupAdi = (id: string) => {
    const g = gruplar.data?.find((x) => x.id === id);
    return g ? grupEtiketi(g) : undefined;
  };
  const yazar = yazabilir && sekme === 'yazdiklarim';
  const sorgu = yazar ? yazdiklarim : gelen;
  const gelenOgeler = gelen.data?.pages.flatMap((s) => s.ogeler) ?? [];
  const yazarOgeler = yazdiklarim.data?.ogeler ?? [];
  const bos = yazar ? yazarOgeler.length === 0 : gelenOgeler.length === 0;
  const eskiVeri = sorgu.isError && !bos;

  function yenile() {
    setYenileniyor(true);
    void sorgu.refetch().finally(() => {
      setYenileniyor(false);
    });
  }

  const baslik = (
    <View className="gap-3 px-4 pb-3">
      {yazabilir ? (
        <>
          <View
            className="flex-row flex-wrap gap-2"
            accessibilityLabel={t('mobil.duyuru.sekmeler')}
          >
            <Cip
              etiket={t('mobil.duyuru.sekmeGelen')}
              secili={sekme === 'gelen'}
              testID="duyuru-sekme-gelen"
              onPress={() => {
                setSekme('gelen');
              }}
            />
            <Cip
              etiket={t('mobil.duyuru.sekmeYazdiklarim')}
              secili={sekme === 'yazdiklarim'}
              testID="duyuru-sekme-yazdiklarim"
              onPress={() => {
                setSekme('yazdiklarim');
              }}
            />
          </View>
          <Dugme
            etiket={t('mobil.duyuru.yeniDuyuru')}
            testID="duyuru-yeni"
            onPress={() => {
              router.push('/duyuru-yaz');
            }}
          />
        </>
      ) : null}
      {eskiVeri || (!agGozlemcisi.cevrimiciMi() && !bos) ? (
        <Metin varyant="kucuk" accessibilityLiveRegion="polite" testID="duyuru-onbellek">
          {t('mobil.duyuru.onbellek')}
        </Metin>
      ) : null}
    </View>
  );

  const bosGorunum = sorgu.isPending ? (
    <Yukleniyor />
  ) : sorgu.isError ? (
    <HataDurumu
      mesaj={hataMesaji(sorgu.error)}
      tekrar={() => {
        void sorgu.refetch();
      }}
    />
  ) : yazar ? (
    <BosDurum
      ikon="chatbubbles-outline"
      baslik={t('mobil.duyuru.yazdiklarimBos')}
      mesaj={t('mobil.duyuru.yazdiklarimBosAciklama')}
    />
  ) : (
    <BosDurum
      ikon="checkmark-circle-outline"
      baslik={t('mobil.duyuru.bos')}
      mesaj={t('mobil.duyuru.bosAciklama')}
    />
  );

  const ac = (id: string) => {
    router.push({ pathname: '/duyuru/[id]', params: { id } });
  };

  return (
    <View className="flex-1 bg-arkaPlan">
      <CevrimdisiSerit />
      {yazar ? (
        <FlatList
          data={yazarOgeler}
          keyExtractor={(d) => d.id}
          contentContainerClassName="grow gap-3 pt-4 pb-8"
          refreshControl={<RefreshControl refreshing={yenileniyor} onRefresh={yenile} />}
          ListHeaderComponent={baslik}
          ListEmptyComponent={bosGorunum}
          renderItem={({ item }) => (
            <View className="px-4">
              <YazarSatiri
                d={item}
                grupAdi={grupAdi}
                onAc={() => {
                  ac(item.id);
                }}
              />
            </View>
          )}
        />
      ) : (
        <FlatList
          data={gelenOgeler}
          keyExtractor={(d) => d.id}
          contentContainerClassName="grow gap-3 pt-4 pb-8"
          refreshControl={<RefreshControl refreshing={yenileniyor} onRefresh={yenile} />}
          onEndReachedThreshold={0.4}
          onEndReached={() => {
            if (gelen.hasNextPage && !gelen.isFetchingNextPage) void gelen.fetchNextPage();
          }}
          ListHeaderComponent={baslik}
          ListEmptyComponent={bosGorunum}
          ListFooterComponent={
            gelen.isFetchingNextPage ? (
              <Yukleniyor />
            ) : gelen.hasNextPage ? (
              <View className="px-4">
                <Dugme
                  varyant="hayalet"
                  etiket={t('mobil.duyuru.dahaFazla')}
                  onPress={() => {
                    void gelen.fetchNextPage();
                  }}
                />
              </View>
            ) : undefined
          }
          renderItem={({ item }) => (
            <View className="px-4">
              <DuyuruSatiri
                oge={item}
                onAc={() => {
                  ac(item.id);
                }}
              />
            </View>
          )}
        />
      )}
    </View>
  );
}
