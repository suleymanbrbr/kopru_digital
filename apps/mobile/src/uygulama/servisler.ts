import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import Constants from 'expo-constants';

import { adaptorleriOlustur } from '../api';
import type { Adaptorler } from '../api/adaptorler';
import { cevrimiciKorumaliOgrenme } from '../api/cevrimiciOgrenme';
import { cevrimiciKorumaliOperasyon } from '../api/cevrimiciOperasyon';
import { apiHatasiMi } from '../api/tipler';
import { davetYoneticisiOlustur, type DavetYoneticisi } from '../davet/yonetici';
import { guvenliBelirtecDeposu } from '../depo/belirtecDeposu';
import { guvenliDavetDeposu } from '../depo/davetDeposu';
import { kv, webDeposuOlarak, type KvDepo } from '../depo/kv';
import { cevrimiciKorumali } from '../hesap/cevrimici';
import { yeniIstekId } from '../lib/kimlik';
import { netInfoGozlemcisi } from '../offline/ag';
import { OfflineKuyruk, YOKLAMA_KUYRUGU } from '../offline/kuyruk';
import { planIsleyicisiKaydet } from '../offline/plan';
import { yoklamaIsleyicisiKaydet } from '../offline/yoklama';
import { oturumYoneticisiOlustur, type OturumYoneticisi } from '../oturum/yonetici';

const SAAT = 60 * 60 * 1000;
/** Cache sema degisince artirilir; eski kalici cache atilir. */
const CACHE_SURUMU = '1';

export interface Servisler {
  adaptorler: Adaptorler;
  oturum: OturumYoneticisi;
  davet: DavetYoneticisi;
  queryClient: QueryClient;
  persister: ReturnType<typeof createAsyncStoragePersister>;
  cacheBuster: string;
  kuyruk: OfflineKuyruk;
  /** Yerel tercih deposu (ornegin son kullanilan konular). */
  yerelDepo: KvDepo;
  agGozlemcisi: ReturnType<typeof netInfoGozlemcisi>;
}

/** Uygulama omru boyunca tek kez kurulan servisler. */
export function servisleriKur(): Servisler {
  const agGozlemcisi = netInfoGozlemcisi();
  const ham = adaptorleriOlustur(guvenliBelirtecDeposu());
  // Sinif kodu / davet / oturum islemleri kuyruga girmez: cevrimdisiyken acik hata verir.
  const operasyon = cevrimiciKorumaliOperasyon(ham.ders, ham.finans, () =>
    agGozlemcisi.cevrimiciMi(),
  );
  const adaptorler: Adaptorler = {
    ...ham,
    hesap: cevrimiciKorumali(ham.hesap, () => agGozlemcisi.cevrimiciMi()),
    ders: operasyon.ders,
    finans: operasyon.finans,
    ogrenme: cevrimiciKorumaliOgrenme(ham.ogrenme, () => agGozlemcisi.cevrimiciMi()),
  };

  const oturumRef: { current: OturumYoneticisi | null } = { current: null };
  const hataIsle = (e: unknown) => oturumRef.current?.hataIsle(e);
  const davetRef: { current: DavetYoneticisi | null } = { current: null };

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
    // Paylasilan cihazda baska biri giris yapinca onceki kullanicinin daveti kabul edilmesin.
    kullaniciCikisi: () => {
      void davetRef.current?.unut();
    },
  });
  oturumRef.current = oturum;

  const davet = davetYoneticisiOlustur({
    depo: guvenliDavetDeposu(),
    hesap: adaptorler.hesap,
    oturum,
  });
  davetRef.current = davet;

  const kuyruk = new OfflineKuyruk({
    depo: kv(),
    yeniId: yeniIstekId,
    kapsam: () => {
      const d = oturum.depo.al();
      return d.asama === 'giris' ? (d.aktif?.uyelik.uyelikId ?? null) : null;
    },
    cevrimiciMi: () => agGozlemcisi.cevrimiciMi(),
    // Baglanti gelince en gec 1 dakikada eslesme: geri cekilme 1 dakikayi asmaz.
    gecikme: YOKLAMA_KUYRUGU.gecikme,
    enFazlaDeneme: YOKLAMA_KUYRUGU.enFazlaDeneme,
  });
  yoklamaIsleyicisiKaydet(
    kuyruk,
    () => adaptorler.ders,
    () => {
      void queryClient.invalidateQueries({ queryKey: ['yoklama-bekleyen'] });
      void queryClient.invalidateQueries({ queryKey: ['dersler'] });
      void queryClient.invalidateQueries({ queryKey: ['finans'] });
    },
  );

  planIsleyicisiKaydet(
    kuyruk,
    () => adaptorler.ogrenme,
    () => {
      void queryClient.invalidateQueries({ queryKey: ['plan'] });
    },
  );

  return {
    adaptorler,
    oturum,
    davet,
    queryClient,
    persister: createAsyncStoragePersister({
      storage: webDeposuOlarak(kv()),
      key: 'kopru.sorgu-cache',
      throttleTime: 1000,
    }),
    cacheBuster: `${Constants.expoConfig?.version ?? '0'}-${CACHE_SURUMU}`,
    kuyruk,
    yerelDepo: kv(),
    agGozlemcisi,
  };
}
