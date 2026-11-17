import { useLocalSearchParams } from 'expo-router';

import { GrupMotivasyonEkrani } from '../../ekranlar/motivasyon/GrupMotivasyonEkrani';

export default function GrupMotivasyon() {
  const { grupId, ad } = useLocalSearchParams<{ grupId: string; ad?: string }>();
  return <GrupMotivasyonEkrani grupId={grupId} grupAd={ad ?? ''} />;
}
