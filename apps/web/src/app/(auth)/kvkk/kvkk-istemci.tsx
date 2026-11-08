'use client';

import { useRouter } from 'next/navigation';

import { RizaEkrani } from '@/components/giris/riza-ekrani';
import { devamOku } from '@/lib/devam';
import { Koruma } from '@/oturum/koruma';

export function KvkkIstemci() {
  const router = useRouter();
  return (
    <Koruma ekran="kvkk">
      {() => (
        <RizaEkrani
          sonra={() => {
            router.replace(devamOku() ?? '/kurum-sec');
          }}
        />
      )}
    </Koruma>
  );
}
