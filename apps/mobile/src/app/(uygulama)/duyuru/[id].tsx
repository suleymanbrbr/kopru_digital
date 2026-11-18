import { useLocalSearchParams } from 'expo-router';

import { DuyuruDetay } from '../../../ekranlar/duyuru/DuyuruDetay';

export default function DuyuruDetayRotasi() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <DuyuruDetay id={id} />;
}
