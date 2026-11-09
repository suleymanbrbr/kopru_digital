import { useLocalSearchParams } from 'expo-router';

import { PaketSatEkrani } from '../../ekranlar/PaketSatEkrani';

export default function PaketSat() {
  const { ogrenciId, ad } = useLocalSearchParams<{ ogrenciId: string; ad?: string }>();
  return <PaketSatEkrani ogrenciId={ogrenciId} ad={ad ?? ''} />;
}
