'use client';

import { GirisAkisi } from '@/components/giris/giris-akisi';
import { Koruma } from '@/oturum/koruma';

export function GirisIstemci({ denemeIpucu }: { denemeIpucu: boolean }) {
  return <Koruma ekran="giris">{() => <GirisAkisi denemeIpucu={denemeIpucu} />}</Koruma>;
}
