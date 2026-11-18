import { z } from 'zod';

import type { PushMesaji, PushSaglayici, PushSonucu } from './saglayici.js';

/** Expo Push API (https://docs.expo.dev/push-notifications/sending-notifications/). */
export const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
/** Expo istek basina en cok 100 mesaj kabul eder. */
export const EXPO_PAKET_BOYUTU = 100;

const biletSema = z.object({
  status: z.enum(['ok', 'error']),
  id: z.string().optional(),
  message: z.string().optional(),
  details: z.looseObject({ error: z.string().optional() }).optional(),
});
const yanitSema = z.object({ data: z.array(biletSema) });

export interface ExpoSecenekleri {
  url?: string;
  /** Expo "enhanced security" erisim belirteci (istege bagli). */
  erisimBelirteci?: string;
  zamanAsimiMs?: number;
  paketBoyutu?: number;
  /** Testler icin. */
  fetch?: typeof fetch;
}

const GECICI_BILET_HATALARI = new Set(['MessageRateExceeded']);

function biletiCoz(bilet: z.infer<typeof biletSema>): PushSonucu {
  if (bilet.status === 'ok') {
    return bilet.id ? { tur: 'gonderildi', mesajId: bilet.id } : { tur: 'gonderildi' };
  }
  const kod = bilet.details?.error ?? 'expo_hata';
  if (kod === 'DeviceNotRegistered') return { tur: 'kalici', kod, cihazGecersiz: true };
  if (GECICI_BILET_HATALARI.has(kod)) return { tur: 'gecici', kod };
  return { tur: 'kalici', kod, cihazGecersiz: false };
}

function govde(m: PushMesaji) {
  return {
    to: m.belirtec,
    title: m.title,
    body: m.body,
    data: m.data,
    sound: 'default',
    priority: 'high',
    ...(m.badge === undefined ? {} : { badge: m.badge }),
  };
}

/**
 * Expo saglayicisi: 100'luk paketler halinde `POST /--/api/v2/push/send`. Bilet hatalari mesaj basina
 * (`DeviceNotRegistered` kalici + cihaz gecersiz), HTTP/ag hatalari tum paket icin gecici sayilir.
 */
export function expoSaglayici(secenek: ExpoSecenekleri = {}): PushSaglayici {
  const url = secenek.url ?? EXPO_PUSH_URL;
  const zamanAsimi = secenek.zamanAsimiMs ?? 10_000;
  const paketBoyutu = Math.min(secenek.paketBoyutu ?? EXPO_PAKET_BOYUTU, EXPO_PAKET_BOYUTU);
  const getir = secenek.fetch ?? fetch;

  async function paketGonder(paket: readonly PushMesaji[]): Promise<PushSonucu[]> {
    const hepsi = (s: PushSonucu): PushSonucu[] => paket.map(() => s);
    let yanit: Response;
    try {
      yanit = await getir(url, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          ...(secenek.erisimBelirteci
            ? { authorization: `Bearer ${secenek.erisimBelirteci}` }
            : {}),
        },
        body: JSON.stringify(paket.map(govde)),
        signal: AbortSignal.timeout(zamanAsimi),
      });
    } catch (err) {
      const zamanAsimiMi = err instanceof Error && err.name === 'TimeoutError';
      return hepsi({ tur: 'gecici', kod: zamanAsimiMi ? 'zaman_asimi' : 'ag_hatasi' });
    }
    if (!yanit.ok) return hepsi({ tur: 'gecici', kod: `http_${String(yanit.status)}` });
    let cozulen: z.infer<typeof yanitSema>;
    try {
      cozulen = yanitSema.parse(await yanit.json());
    } catch {
      return hepsi({ tur: 'gecici', kod: 'yanit_gecersiz' });
    }
    if (cozulen.data.length !== paket.length) return hepsi({ tur: 'gecici', kod: 'yanit_uyumsuz' });
    return cozulen.data.map(biletiCoz);
  }

  return {
    ad: 'expo',
    async gonder(mesajlar) {
      const sonuclar: PushSonucu[] = [];
      for (let i = 0; i < mesajlar.length; i += paketBoyutu) {
        sonuclar.push(...(await paketGonder(mesajlar.slice(i, i + paketBoyutu))));
      }
      return sonuclar;
    },
  };
}
