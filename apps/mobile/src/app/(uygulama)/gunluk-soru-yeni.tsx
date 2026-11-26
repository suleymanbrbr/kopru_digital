import { useLocalSearchParams } from 'expo-router';

import { GunlukSoruFormu } from '../../ekranlar/gunluk/GunlukSoruFormu';

export default function GunlukSoruYeni() {
  const p = useLocalSearchParams<{
    planGorevId?: string;
    bransKodu?: string;
    konuId?: string;
    hedef?: string;
    duzelt?: string;
    kaynakKitapId?: string;
    kaynakKitapAd?: string;
    kaynakTestId?: string;
    kaynakTestAd?: string;
    kaynakMetin?: string;
  }>();
  return (
    <GunlukSoruFormu
      {...(p.planGorevId ? { planGorevId: p.planGorevId } : {})}
      {...(p.bransKodu ? { bransKodu: p.bransKodu } : {})}
      {...(p.konuId ? { konuId: p.konuId } : {})}
      {...(p.hedef ? { hedef: p.hedef } : {})}
      {...(p.duzelt ? { duzelt: p.duzelt } : {})}
      {...(p.kaynakKitapId ? { kaynakKitapId: p.kaynakKitapId } : {})}
      {...(p.kaynakKitapAd ? { kaynakKitapAd: p.kaynakKitapAd } : {})}
      {...(p.kaynakTestId ? { kaynakTestId: p.kaynakTestId } : {})}
      {...(p.kaynakTestAd ? { kaynakTestAd: p.kaynakTestAd } : {})}
      {...(p.kaynakMetin ? { kaynakMetin: p.kaynakMetin } : {})}
    />
  );
}
