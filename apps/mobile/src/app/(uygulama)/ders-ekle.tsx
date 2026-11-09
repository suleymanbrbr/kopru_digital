import { useLocalSearchParams } from 'expo-router';

import { DersFormu } from '../../ekranlar/DersFormu';

export default function DersEkle() {
  const { tarih } = useLocalSearchParams<{ tarih?: string }>();
  return <DersFormu {...(tarih ? { tarih } : {})} />;
}
