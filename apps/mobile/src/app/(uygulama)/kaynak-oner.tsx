import { useLocalSearchParams } from 'expo-router';

import { KaynakOneriFormu } from '../../ekranlar/degerlendirme/KaynakOneriFormu';

export default function KaynakOnerRotasi() {
  const { ogrenciId, ad } = useLocalSearchParams<{ ogrenciId: string; ad?: string }>();
  return <KaynakOneriFormu ogrenciId={ogrenciId} ad={ad ?? ''} />;
}
