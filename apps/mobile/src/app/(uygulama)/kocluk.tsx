import { useLocalSearchParams } from 'expo-router';

import { KoclukEkrani } from '../../ekranlar/degerlendirme/KoclukEkrani';

export default function KoclukRotasi() {
  const { ogrenciId, ad } = useLocalSearchParams<{ ogrenciId: string; ad?: string }>();
  return <KoclukEkrani ogrenciId={ogrenciId} ad={ad ?? ''} />;
}
