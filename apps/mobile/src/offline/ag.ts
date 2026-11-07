import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { onlineManager } from '@tanstack/react-query';

import type { AgGozlemcisi } from './kuyruk';

const cevrimiciMi = (s: NetInfoState) => s.isConnected !== false && s.isInternetReachable !== false;

let son = true;

/** NetInfo tabanli ag gozlemcisi; ayni zamanda TanStack Query onlineManager'i besler. */
export function netInfoGozlemcisi(): AgGozlemcisi {
  return {
    cevrimiciMi: () => son,
    abone: (dinleyici) =>
      NetInfo.addEventListener((s) => {
        const yeni = cevrimiciMi(s);
        if (yeni !== son) {
          son = yeni;
          dinleyici(yeni);
        }
      }),
  };
}

export function queryOnlineYonetiminiBagla(): () => void {
  onlineManager.setEventListener((ayarla) =>
    NetInfo.addEventListener((s) => {
      ayarla(cevrimiciMi(s));
    }),
  );
  return () => {};
}
