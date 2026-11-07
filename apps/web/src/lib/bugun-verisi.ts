import { useQuery } from '@tanstack/react-query';

import type { KarakterAsamasi, KarakterTuru } from '@/components/karakter';

/**
 * Bugun ekraninin veri katmani. Ders, soru ve gorev uc noktalari `api`/`motivasyon`
 * servislerinde henuz yok; sorgu bos listeyle doner. Uc noktalar gelince yalnizca `queryFn`
 * `@kopru/api-client` cagrisina cevrilir; ekranlar degismez.
 */
export interface OgretmenBugun {
  dersler: { id: string; baslik: string; saat: string }[];
  sorular: { id: string; baslik: string }[];
}

export interface OgrenciBugun {
  gorevler: { id: string; baslik: string }[];
  karakter: { tur: KarakterTuru; asama: KarakterAsamasi };
}

export function useOgretmenBugun(kurumId: string) {
  return useQuery<OgretmenBugun>({
    queryKey: ['bugun', 'ogretmen', kurumId],
    queryFn: () => Promise.resolve({ dersler: [], sorular: [] }),
  });
}

export function useOgrenciBugun(kurumId: string) {
  return useQuery<OgrenciBugun>({
    queryKey: ['bugun', 'ogrenci', kurumId],
    queryFn: () => Promise.resolve({ gorevler: [], karakter: { tur: 'kivilcim', asama: 1 } }),
  });
}
