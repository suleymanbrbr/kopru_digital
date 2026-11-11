import { useLocalSearchParams } from 'expo-router';

import { OdevTeslimEkrani } from '../../../ekranlar/OdevTeslimEkrani';

export default function OdevTeslimRotasi() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <OdevTeslimEkrani ogrenciOdevId={id} />;
}
