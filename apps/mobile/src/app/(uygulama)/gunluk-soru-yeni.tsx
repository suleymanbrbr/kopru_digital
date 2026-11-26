import { useLocalSearchParams } from 'expo-router';

import { GunlukSoruFormu } from '../../ekranlar/gunluk/GunlukSoruFormu';

export default function GunlukSoruYeni() {
  const p = useLocalSearchParams<{
    planGorevId?: string;
    bransKodu?: string;
    konuId?: string;
    hedef?: string;
    duzelt?: string;
  }>();
  return (
    <GunlukSoruFormu
      {...(p.planGorevId ? { planGorevId: p.planGorevId } : {})}
      {...(p.bransKodu ? { bransKodu: p.bransKodu } : {})}
      {...(p.konuId ? { konuId: p.konuId } : {})}
      {...(p.hedef ? { hedef: p.hedef } : {})}
      {...(p.duzelt ? { duzelt: p.duzelt } : {})}
    />
  );
}
