import { useLocalSearchParams } from 'expo-router';

import { DuyuruYaz } from '../../ekranlar/duyuru/DuyuruYaz';

export default function DuyuruYazRotasi() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  return <DuyuruYaz {...(id ? { id } : {})} />;
}
