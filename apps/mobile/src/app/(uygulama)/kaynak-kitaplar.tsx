import { useLocalSearchParams } from 'expo-router';

import { KaynakKitaplarEkrani } from '../../ekranlar/gunluk/KaynakKitaplarEkrani';

export default function KaynakKitaplarRotasi() {
  const { ogrenciId, ad } = useLocalSearchParams<{ ogrenciId?: string; ad?: string }>();
  return <KaynakKitaplarEkrani {...(ogrenciId ? { ogrenciId } : {})} {...(ad ? { ad } : {})} />;
}
