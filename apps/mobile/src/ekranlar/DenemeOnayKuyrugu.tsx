import { t } from '@kopru/i18n';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';

import type { Deneme } from '../api/ogrenmeTipleri';
import { Dugme } from '../ui/Dugme';
import { BosDurum, HataDurumu, Yukleniyor } from '../ui/Durumlar';
import { Ekran } from '../ui/Ekran';
import { Kart } from '../ui/Kart';
import { Metin } from '../ui/Metin';
import { MetinGirdisi } from '../ui/MetinGirdisi';
import { useAktif, useServisler } from '../uygulama/baglam';
import { hataMesaji } from '../uygulama/hatalar';
import { useDenemeler } from '../uygulama/ogrenme';
import { CevrimdisiSerit } from './CevrimdisiSerit';
import { BolumNetleri, DenemeBaslik } from './DenemeBilesenleri';

type Liste = Deneme[] | undefined;

/**
 * Onay / red eylemleri. Iyimser: karar verilen deneme "bekleyen" listelerinden hemen kalkar;
 * hata olursa liste geri yuklenir ve neden gosterilir.
 */
export function useDenemeKarari(onHata: (m: string) => void) {
  const qc = useQueryClient();
  const { adaptorler } = useServisler();
  const uyelikId = useAktif()?.uyelik.uyelikId;
  const anahtar = ['deneme', uyelikId, 'liste'] as const;

  return useMutation({
    networkMode: 'always',
    mutationFn: (g: { id: string; red?: string }) =>
      g.red !== undefined
        ? adaptorler.ogrenme.denemeReddet(g.id, g.red)
        : adaptorler.ogrenme.denemeOnayla(g.id),
    onMutate: async (g) => {
      await qc.cancelQueries({ queryKey: anahtar });
      const onceki = qc.getQueriesData<Liste>({ queryKey: anahtar });
      qc.setQueriesData<Liste>({ queryKey: [...anahtar, 'bekliyor'] }, (l) =>
        l?.filter((d) => d.id !== g.id),
      );
      qc.setQueriesData<Liste>({ queryKey: [...anahtar, 'tum'] }, (l) =>
        l?.map((d) =>
          d.id === g.id
            ? g.red !== undefined
              ? { ...d, onayDurumu: 'reddedildi' as const, redNedeni: g.red }
              : { ...d, onayDurumu: 'onaylandi' as const }
            : d,
        ),
      );
      return { onceki };
    },
    onError: (e, _g, baglam) => {
      for (const [k, v] of baglam?.onceki ?? []) qc.setQueryData(k, v);
      onHata(hataMesaji(e));
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['deneme'] });
    },
  });
}

/** Bekleyen bir deneme: bolum netleri, "Onayla" ve "Reddet" (neden ister). */
export function DenemeOnayKarti({ deneme }: { deneme: Deneme }) {
  const [hata, setHata] = useState<string | null>(null);
  const [redAcik, setRedAcik] = useState(false);
  const [neden, setNeden] = useState('');
  const karar = useDenemeKarari(setHata);

  return (
    <Kart className="gap-3" testID={`onay-${deneme.id}`}>
      <DenemeBaslik deneme={deneme} />
      <BolumNetleri deneme={deneme} />
      {hata ? (
        <Metin varyant="ikincil" className="text-hata" accessibilityLiveRegion="polite">
          {hata}
        </Metin>
      ) : null}
      {redAcik ? (
        <View className="gap-2">
          <MetinGirdisi
            etiket={t('mobil.ogrenme.deneme.redNedeni')}
            value={neden}
            onChangeText={setNeden}
            maxLength={500}
            multiline
          />
          <Dugme
            varyant="tehlike"
            etiket={t('mobil.ogrenme.deneme.redGonder')}
            disabled={neden.trim().length === 0}
            yukleniyor={karar.isPending}
            onPress={() => {
              setHata(null);
              karar.mutate({ id: deneme.id, red: neden.trim() });
            }}
          />
        </View>
      ) : (
        <View className="flex-row gap-2">
          <Dugme
            className="flex-1"
            etiket={t('mobil.ogrenme.deneme.onayla')}
            yukleniyor={karar.isPending}
            onPress={() => {
              setHata(null);
              karar.mutate({ id: deneme.id });
            }}
          />
          <Dugme
            className="flex-1"
            varyant="ikincil"
            etiket={t('mobil.ogrenme.deneme.reddet')}
            onPress={() => {
              setRedAcik(true);
            }}
          />
        </View>
      )}
    </Kart>
  );
}

/** Onay kuyrugu: tum onay bekleyen denemeler. */
export function DenemeOnayKuyrugu() {
  const sorgu = useDenemeler({ onay: 'bekliyor' });
  return (
    <Ekran ust={<CevrimdisiSerit />} kenarlar={['left', 'right', 'bottom']}>
      <Metin varyant="baslik" accessibilityRole="header">
        {t('mobil.ogrenme.deneme.onayKuyrugu')}
      </Metin>
      {sorgu.isPending ? <Yukleniyor /> : null}
      {sorgu.isError && !sorgu.data ? (
        <HataDurumu mesaj={hataMesaji(sorgu.error)} tekrar={() => void sorgu.refetch()} />
      ) : null}
      {sorgu.data?.length === 0 ? (
        <BosDurum ikon="checkmark-circle-outline" mesaj={t('mobil.ogrenme.deneme.onayBos')} />
      ) : null}
      {sorgu.data?.map((d) => <DenemeOnayKarti key={d.id} deneme={d} />)}
    </Ekran>
  );
}
