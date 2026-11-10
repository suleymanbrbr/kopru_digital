import { useLocalSearchParams } from 'expo-router';

import { DenemeGirisFormu } from '../../ekranlar/DenemeGirisFormu';

export default function DenemeGir() {
  const { ogrenciId, ad } = useLocalSearchParams<{ ogrenciId?: string; ad?: string }>();
  return (
    <DenemeGirisFormu {...(ogrenciId ? { ogrenciId } : {})} {...(ad ? { ogrenciAd: ad } : {})} />
  );
}
