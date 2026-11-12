import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
} from 'expo-audio';
import { useCallback, useEffect, useRef, useState } from 'react';

import { SES_EN_FAZLA_SN, kayitKullanilabilirMi, sinirAsildiMi } from './sinirlar';

export type KayitAsamasi = 'bos' | 'kaydediyor' | 'bitti';
export type KayitHatasi = 'izin' | 'baslamadi' | null;

/** m4a/AAC, mono, 48 kbps: 3 dk ~ 1 MB (medya siniri 5 MB). */
const SES_AYARI = {
  ...RecordingPresets.HIGH_QUALITY,
  sampleRate: 22_050,
  numberOfChannels: 1,
  bitRate: 48_000,
};

export interface SesKaydi {
  asama: KayitAsamasi;
  hata: KayitHatasi;
  /** Gecen sure (sn, ondalikli). */
  gecenSn: number;
  /** Bitmis kaydin yerel adresi. */
  uri: string | null;
  baslat: () => Promise<boolean>;
  durdur: () => Promise<void>;
  /** Bitmis kaydi atar (yeniden kaydetmek icin). */
  sil: () => void;
  /** Kayit basindan beri gecen ms (mini anlatimda cizgi zaman damgasi); kayit yoksa 0. */
  zaman: () => number;
}

/**
 * Mikrofon kaydi (`expo-audio`). Sure `SES_EN_FAZLA_SN`'ye gelince kendiliginden durur. Izin
 * reddedilirse `hata: 'izin'` olur (arayuz ayarlara yonlendirir).
 */
export function useSesKaydi(enFazlaSn = SES_EN_FAZLA_SN): SesKaydi {
  const kaydedici = useAudioRecorder(SES_AYARI);
  const [asama, setAsama] = useState<KayitAsamasi>('bos');
  const [hata, setHata] = useState<KayitHatasi>(null);
  const [gecenSn, setGecenSn] = useState(0);
  const [uri, setUri] = useState<string | null>(null);
  const asamaRef = useRef<KayitAsamasi>('bos');
  const set = (a: KayitAsamasi) => {
    asamaRef.current = a;
    setAsama(a);
  };

  const durdur = useCallback(async () => {
    if (asamaRef.current !== 'kaydediyor') return;
    const sure = kaydedici.currentTime;
    await kaydedici.stop();
    await setAudioModeAsync({ allowsRecording: false });
    setGecenSn(sure);
    if (kayitKullanilabilirMi(sure) && kaydedici.uri) {
      setUri(kaydedici.uri);
      set('bitti');
    } else {
      set('bos');
    }
  }, [kaydedici]);

  useEffect(() => {
    if (asama !== 'kaydediyor') return;
    const id = setInterval(() => {
      const s = kaydedici.currentTime;
      setGecenSn(s);
      if (sinirAsildiMi(s, enFazlaSn)) void durdur();
    }, 200);
    return () => {
      clearInterval(id);
    };
  }, [asama, kaydedici, durdur, enFazlaSn]);

  useEffect(
    () => () => {
      if (asamaRef.current === 'kaydediyor') void kaydedici.stop();
    },
    [kaydedici],
  );

  const baslat = useCallback(async () => {
    setHata(null);
    console.log('[ses] izin isteniyor');
    const izin = await requestRecordingPermissionsAsync();
    console.log('[ses] izin', izin.granted);
    if (!izin.granted) {
      setHata('izin');
      return false;
    }
    try {
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      console.log('[ses] mod tamam');
      await kaydedici.prepareToRecordAsync();
      console.log('[ses] hazir');
      kaydedici.record();
      console.log('[ses] kayit basladi');
      setGecenSn(0);
      setUri(null);
      set('kaydediyor');
      return true;
    } catch (e) {
      console.log('[ses] hata', String(e));
      setHata('baslamadi');
      return false;
    }
  }, [kaydedici]);

  const sil = useCallback(() => {
    setUri(null);
    setGecenSn(0);
    set('bos');
  }, []);

  const zaman = useCallback(
    () => (asamaRef.current === 'kaydediyor' ? Math.round(kaydedici.currentTime * 1000) : 0),
    [kaydedici],
  );

  return { asama, hata, gecenSn, uri, baslat, durdur, sil, zaman };
}
