'use client';

import { KurumListesi } from '@/components/kurum-sec/kurum-listesi';
import { useOturum } from '@/oturum/saglayici';

export function KurumSecIstemci() {
  const { durum } = useOturum();
  // (app) duzeni yalnizca hazir oturumda cocugu cizer.
  return durum.tur === 'hazir' ? <KurumListesi oturum={durum.oturum} /> : null;
}
