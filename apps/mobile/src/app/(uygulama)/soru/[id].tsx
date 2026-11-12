import { useLocalSearchParams } from 'expo-router';

import { SoruDetayEkrani } from '../../../ekranlar/soru/SoruDetayEkrani';

export default function SoruDetayRotasi() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <SoruDetayEkrani id={id} />;
}
