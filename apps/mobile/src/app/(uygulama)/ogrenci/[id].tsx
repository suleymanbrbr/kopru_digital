import { useLocalSearchParams } from 'expo-router';

import { OgrenciKartiEkrani } from '../../../ekranlar/OgrenciKartiEkrani';

export default function OgrenciKartiRotasi() {
  const { id, ad } = useLocalSearchParams<{ id: string; ad?: string }>();
  return <OgrenciKartiEkrani ogrenciId={id} ad={ad ?? ''} />;
}
