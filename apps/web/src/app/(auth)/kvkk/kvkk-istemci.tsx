'use client';

import { useRouter } from 'next/navigation';

import { RizaEkrani } from '@/components/giris/riza-ekrani';
import { Koruma } from '@/oturum/koruma';

export function KvkkIstemci() {
  const router = useRouter();
  return (
    <Koruma ekran="kvkk">
      {() => (
        <RizaEkrani
          sonra={() => {
            router.replace('/kurum-sec');
          }}
        />
      )}
    </Koruma>
  );
}
