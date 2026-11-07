import { useQuery } from '@tanstack/react-query';

import { useAktif, useServisler } from './baglam';

/** Sorgu anahtarlari uyelik kapsamlidir; kurum/rol degisince cache karismaz. */
export function useOgretmenBugun() {
  const { adaptorler } = useServisler();
  const uyelikId = useAktif()?.uyelik.uyelikId;
  return useQuery({
    queryKey: ['bugun', 'ogretmen', uyelikId],
    queryFn: () => adaptorler.veri.ogretmenBugun(),
    enabled: !!uyelikId,
  });
}

export function useOgrenciBugun() {
  const { adaptorler } = useServisler();
  const uyelikId = useAktif()?.uyelik.uyelikId;
  return useQuery({
    queryKey: ['bugun', 'ogrenci', uyelikId],
    queryFn: () => adaptorler.veri.ogrenciBugun(),
    enabled: !!uyelikId,
  });
}
