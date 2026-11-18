import { t } from '@kopru/i18n';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, RefreshControl, View } from 'react-native';

import type { BildirimKategori, BildirimKutuOgesi } from '../../api/bildirimTipleri';
import { baglantiRotasi, KUTU_ROTASI, yukuAyristir } from '../../bildirim/baglanti';
import { zamanGoster } from '../../lib/zaman';
import { useTema } from '../../tema/TemaSaglayici';
import { Dugme } from '../../ui/Dugme';
import { BosDurum, HataDurumu, Yukleniyor } from '../../ui/Durumlar';
import { Ikon } from '../../ui/Ikon';
import { Metin } from '../../ui/Metin';
import { useAktif, useServisler } from '../../uygulama/baglam';
import {
  useBildirimIslemleri,
  useBildirimKutusu,
  useOkunmamisSayisi,
} from '../../uygulama/bildirim';
import { hataMesaji } from '../../uygulama/hatalar';
import { CevrimdisiSerit } from '../CevrimdisiSerit';

type IkonAdi = Parameters<typeof Ikon>[0]['ad'];

const KATEGORI_IKONU: Record<BildirimKategori, IkonAdi> = {
  ders: 'calendar-outline',
  yoklama: 'checkmark-done-outline',
  odev: 'document-text-outline',
  soru: 'chatbubbles-outline',
  kayit: 'play-circle-outline',
  duyuru: 'megaphone-outline',
  finans: 'wallet-outline',
  oyunlastirma: 'sparkles-outline',
  abonelik: 'card-outline',
  sistem: 'shield-checkmark-outline',
};

function Satir({
  oge,
  onAc,
  onArsivle,
}: {
  oge: BildirimKutuOgesi;
  onAc: () => void;
  onArsivle: () => void;
}) {
  const { renkler } = useTema();
  const okunmamis = oge.okundu_at === null;
  const durum = okunmamis ? t('mobil.bildirim.okunmamis') : t('mobil.bildirim.okundu');
  return (
    <View
      testID={`bildirim-${oge.id}`}
      className={`mx-4 mb-3 overflow-hidden rounded-buyuk border ${
        okunmamis ? 'border-birincil bg-yuzeyIkincil' : 'border-kenar bg-yuzey'
      }`}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${durum}. ${oge.baslik}. ${oge.govde}. ${zamanGoster(oge.created_at)}`}
        onPress={onAc}
        className="min-h-dokunma flex-row items-start gap-3 p-4 active:opacity-80"
      >
        <View className="pt-1">
          <Ikon
            ad={KATEGORI_IKONU[oge.kategori]}
            boyut={24}
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
                testID="bildirim-okunmamis-nokta"
                className="h-3 w-3 rounded-tam bg-birincil"
                accessibilityElementsHidden
              />
            ) : null}
          </View>
          <Metin varyant="ikincil">{oge.govde}</Metin>
          <Metin varyant="kucuk">{zamanGoster(oge.created_at)}</Metin>
        </View>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('mobil.bildirim.arsivleEtiketi', { baslik: oge.baslik })}
        onPress={onArsivle}
        className="min-h-dokunma flex-row items-center justify-end gap-1 border-t border-kenar px-4 active:opacity-70"
      >
        <Ikon ad="archive-outline" boyut={18} renk={renkler.metinIkincil} />
        <Metin varyant="kucuk">{t('mobil.bildirim.arsivle')}</Metin>
      </Pressable>
    </View>
  );
}

/**
 * Bildirim kutusu: imecli liste (20'ser), cek-yenile, okunmamis vurgusu, "Tumunu okundu say",
 * arsivle dugmesi, bos/hata durumu. Ogeye dokununca derin baglantinin hedefi acilir ve oge okundu
 * olur; hedefi olmayan (ornegin duyuru) oge yalnizca okundu isaretlenir. Cevrimdisiyken kalici
 * sorgu onbelleginden son liste gosterilir.
 */
export function BildirimKutusu() {
  const router = useRouter();
  const { bildirim, agGozlemcisi } = useServisler();
  const aktif = useAktif();
  const sorgu = useBildirimKutusu();
  const sayac = useOkunmamisSayisi(true);
  const { okundu, tumunuOku, arsivle } = useBildirimIslemleri();
  const [yenileniyor, setYenileniyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);

  const ogeler = sorgu.data?.pages.flatMap((s) => s.ogeler) ?? [];
  const okunmamisSayisi = sayac.data ?? ogeler.filter((o) => o.okundu_at === null).length;
  const eskiVeri = sorgu.isError && ogeler.length > 0;

  function ac(oge: BildirimKutuOgesi) {
    if (!aktif) return;
    const rota = baglantiRotasi(oge.derin_baglanti, {
      rol: aktif.uyelik.rol,
      moduller: aktif.moduller,
    });
    if (rota === KUTU_ROTASI) {
      if (oge.okundu_at === null) okundu.mutate(oge.id);
      return;
    }
    bildirim.ogeyeDokunuldu(
      yukuAyristir(
        { derin_baglanti: oge.derin_baglanti, bildirim_id: oge.id },
        { baslik: oge.baslik, govde: oge.govde },
      ),
    );
  }

  return (
    <View className="flex-1 bg-arkaPlan">
      <CevrimdisiSerit />
      <FlatList
        data={ogeler}
        keyExtractor={(o) => o.id}
        contentContainerClassName="grow pt-4 pb-8"
        refreshControl={
          <RefreshControl
            refreshing={yenileniyor}
            onRefresh={() => {
              setYenileniyor(true);
              void sorgu.refetch().finally(() => {
                setYenileniyor(false);
              });
            }}
          />
        }
        onEndReachedThreshold={0.4}
        onEndReached={() => {
          if (sorgu.hasNextPage && !sorgu.isFetchingNextPage) void sorgu.fetchNextPage();
        }}
        ListHeaderComponent={
          <View className="gap-3 px-4 pb-3">
            <View className="flex-row flex-wrap gap-2">
              <View className="min-w-0 flex-1">
                <Dugme
                  varyant="ikincil"
                  etiket={t('mobil.bildirim.tumunuOku')}
                  disabled={okunmamisSayisi === 0}
                  yukleniyor={tumunuOku.isPending}
                  onPress={() => {
                    setHata(null);
                    tumunuOku.mutate(undefined, {
                      onError: () => {
                        setHata(t('mobil.bildirim.islemHatasi'));
                      },
                    });
                  }}
                />
              </View>
              <Dugme
                varyant="hayalet"
                etiket={t('mobil.bildirim.tercihler')}
                onPress={() => {
                  router.push('/bildirim-tercihleri');
                }}
              />
            </View>
            {eskiVeri || (!agGozlemcisi.cevrimiciMi() && ogeler.length > 0) ? (
              <Metin varyant="kucuk" accessibilityLiveRegion="polite" testID="bildirim-onbellek">
                {t('mobil.bildirim.onbellek')}
              </Metin>
            ) : null}
            {hata ? (
              <Metin varyant="ikincil" className="text-hata" accessibilityLiveRegion="polite">
                {hata}
              </Metin>
            ) : null}
          </View>
        }
        renderItem={({ item }) => (
          <Satir
            oge={item}
            onAc={() => {
              ac(item);
            }}
            onArsivle={() => {
              setHata(null);
              arsivle.mutate(item.id, {
                onError: () => {
                  setHata(t('mobil.bildirim.islemHatasi'));
                },
              });
            }}
          />
        )}
        ListEmptyComponent={
          sorgu.isPending ? (
            <Yukleniyor />
          ) : sorgu.isError ? (
            <HataDurumu
              mesaj={hataMesaji(sorgu.error)}
              tekrar={() => {
                void sorgu.refetch();
              }}
            />
          ) : (
            <BosDurum
              ikon="checkmark-circle-outline"
              baslik={t('mobil.bildirim.bos')}
              mesaj={t('mobil.bildirim.bosAciklama')}
            />
          )
        }
        ListFooterComponent={
          sorgu.isFetchingNextPage ? (
            <Yukleniyor />
          ) : sorgu.hasNextPage ? (
            <View className="px-4">
              <Dugme
                varyant="hayalet"
                etiket={t('mobil.bildirim.dahaFazla')}
                onPress={() => {
                  void sorgu.fetchNextPage();
                }}
              />
            </View>
          ) : undefined
        }
      />
    </View>
  );
}
