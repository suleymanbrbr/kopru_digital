'use client';

import type { ReactNode } from 'react';

import { Koruma } from '@/oturum/koruma';

export default function UygulamaDuzeni({ children }: { children: ReactNode }) {
  return <Koruma ekran="uygulama">{() => children}</Koruma>;
}
