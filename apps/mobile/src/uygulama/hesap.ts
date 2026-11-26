import { useQuery } from '@tanstack/react-query';

import { useOturum, useServisler } from './baglam';

/** Hesap silme durumu sorgu anahtari (kullanici kapsamli; yazimlar bunu gecersiz kilar). */
export function silmeAnahtari(kullaniciId: string | undefined) {
  return ['hesap-silme', kullaniciId] as const;
}

/**
 * Hesap silme durumu: bekleyen talep, engeller, dogrulama yontemleri. Bugun ekraninin bilgi seridi
 * ve Hesabim ekrani paylasir. Hata sessizdir (serit gorunmez).
 */
export function useSilmeDurumu() {
  const { adaptorler } = useServisler();
  const durum = useOturum();
  const kullaniciId = durum.asama === 'giris' ? durum.kullanici.id : undefined;
  return useQuery({
    queryKey: silmeAnahtari(kullaniciId),
    queryFn: () => adaptorler.hesap.silmeDurumu(),
    enabled: !!kullaniciId,
    staleTime: 60_000,
    retry: false,
  });
}
