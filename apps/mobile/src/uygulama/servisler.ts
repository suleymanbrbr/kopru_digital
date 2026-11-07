import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import Constants from 'expo-constants';

import { adaptorleriOlustur } from '../api';
import type { Adaptorler } from '../api/adaptorler';
import { apiHatasiMi } from '../api/tipler';
import { guvenliBelirtecDeposu } from '../depo/belirtecDeposu';
import { kv, webDeposuOlarak } from '../depo/kv';
import { yeniIstekId } from '../lib/kimlik';
import { netInfoGozlemcisi } from '../offline/ag';
import { OfflineKuyruk } from '../offline/kuyruk';
import { oturumYoneticisiOlustur, type OturumYoneticisi } from '../oturum/yonetici';

const SAAT = 60 * 60 * 1000;
/** Cache sema degisince artirilir; eski kalici cache atilir. */
const CACHE_SURUMU = '1';

export interface Servisler {
  adaptorler: Adaptorler;
  oturum: OturumYoneticisi;
  queryClient: QueryClient;
  persister: ReturnType<typeof createAsyncStoragePersister>;
  cacheBuster: string;
  kuyruk: OfflineKuyruk;
  agGozlemcisi: ReturnType<typeof netInfoGozlemcisi>;
}

/** Uygulama omru boyunca tek kez kurulan servisler. */
export function servisleriKur(): Servisler {
  const adaptorler = adaptorleriOlustur(guvenliBelirtecDeposu());

  const oturumRef: { current: OturumYoneticisi | null } = { current: null };
  const hataIsle = (e: unknown) => oturumRef.current?.hataIsle(e);

  const queryClient = new QueryClient({
    queryCache: new QueryCache({ onError: hataIsle }),
    mutationCache: new MutationCache({ onError: hataIsle }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 24 * SAAT, // persister maxAge'den kisa olmamali
        networkMode: 'offlineFirst',
        retry: (sayi, e) => sayi < 2 && (!apiHatasiMi(e) || e.yenidenDenenebilir),
      },
    },
  });

  const oturum = oturumYoneticisiOlustur({
    adaptorler,
    temizle: () => {
      queryClient.clear();
    },
  });
  oturumRef.current = oturum;

  const agGozlemcisi = netInfoGozlemcisi();
  const kuyruk = new OfflineKuyruk({
    depo: kv(),
    yeniId: yeniIstekId,
    kapsam: () => {
      const d = oturum.depo.al();
      return d.asama === 'giris' ? (d.aktif?.uyelik.uyelikId ?? null) : null;
    },
    cevrimiciMi: () => agGozlemcisi.cevrimiciMi(),
  });

  return {
    adaptorler,
    oturum,
    queryClient,
    persister: createAsyncStoragePersister({
      storage: webDeposuOlarak(kv()),
      key: 'kopru.sorgu-cache',
      throttleTime: 1000,
    }),
    cacheBuster: `${Constants.expoConfig?.version ?? '0'}-${CACHE_SURUMU}`,
    kuyruk,
    agGozlemcisi,
  };
}
