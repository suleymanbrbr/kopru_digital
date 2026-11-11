import { useLocalSearchParams } from 'expo-router';

import { OdevOzetEkrani } from '../../../ekranlar/OdevOzetEkrani';

export default function OdevOzetRotasi() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <OdevOzetEkrani odevId={id} />;
}
