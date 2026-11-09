import { useLocalSearchParams } from 'expo-router';

import { OdemeAlEkrani } from '../../ekranlar/OdemeAlEkrani';

export default function OdemeAl() {
  const { ogrenciId, ad } = useLocalSearchParams<{ ogrenciId: string; ad?: string }>();
  return <OdemeAlEkrani ogrenciId={ogrenciId} ad={ad ?? ''} />;
}
