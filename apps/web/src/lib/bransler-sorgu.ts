import { BransListeYanitSema } from '@kopru/contracts';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { siraliBransler } from './bransler';
import { hesapIstek } from './hesap-istek';
import { yenidenDene } from './sayfali-sorgu';

/**
 * Aktif branslar: `GET /v1/hesap/bransler`. Yanit gelene kadar (ve hata olursa) yedek kod listesi
 * gosterilir; secenekler hic bos kalmaz. Liste kurumdan bagimsizdir, uzun sure onbellekte durur.
 */
export function useBransler(): { kod: string; ad: string }[] {
  const q = useQuery({
    queryKey: ['hesap', 'bransler'],
    staleTime: 60 * 60_000,
    retry: yenidenDene,
    queryFn: () => hesapIstek('bransler', { sema: BransListeYanitSema }),
  });
  const kaynak = q.data?.bransler;
  return useMemo(() => siraliBransler(kaynak), [kaynak]);
}
