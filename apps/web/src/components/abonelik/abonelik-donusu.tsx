'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';

import { odemeSonucuCoz } from '@/lib/abonelik/bicim';
import { donusKurumu, saklananKurum } from '@/lib/abonelik/donus';
import { EkranYukleniyor } from '@/oturum/koruma';
import { useOturum } from '@/oturum/saglayici';

export function AbonelikDonusu() {
  const { durum } = useOturum();
  const yonlendirici = useRouter();
  const sonuc = odemeSonucuCoz(useSearchParams().get('odeme'));
  const oturum = durum.tur === 'hazir' ? durum.oturum : null;

  useEffect(() => {
    if (!oturum) return;
    const saklanan = saklananKurum();
    const kurumId = donusKurumu(oturum.uyelikler, oturum.aktifUyelikId, saklanan);
    yonlendirici.replace(
      kurumId ? `/${kurumId}/abonelik${sonuc ? `?odeme=${sonuc}` : ''}` : '/kurum-sec',
    );
  }, [oturum, sonuc, yonlendirici]);

  return <EkranYukleniyor />;
}
