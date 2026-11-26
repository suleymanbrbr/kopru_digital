import { useLocalSearchParams } from 'expo-router';

import { KonuAnaliziEkrani } from '../../ekranlar/gunluk/KonuAnaliziEkrani';

/** `ogrenciId` yoksa ogrencinin kendi analizi (oneri yok); varsa personelin ogrenci analizi. */
export default function KonuAnaliziRotasi() {
  const { ogrenciId, ad } = useLocalSearchParams<{ ogrenciId?: string; ad?: string }>();
  return (
    <KonuAnaliziEkrani {...(ogrenciId ? { ogrenciId } : {})} {...(ad ? { ogrenciAd: ad } : {})} />
  );
}
