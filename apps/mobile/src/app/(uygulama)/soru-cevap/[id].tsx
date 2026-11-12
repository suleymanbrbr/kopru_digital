import { useLocalSearchParams } from 'expo-router';

import { CevapEkrani } from '../../../ekranlar/soru/CevapEkrani';

export default function SoruCevapRotasi() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <CevapEkrani id={id} />;
}
