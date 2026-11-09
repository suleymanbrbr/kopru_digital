import { useLocalSearchParams } from 'expo-router';

import { YoklamaEkrani } from '../../../ekranlar/YoklamaEkrani';

export default function YoklamaRotasi() {
  const { dersId, baslik, baslangic } = useLocalSearchParams<{
    dersId: string;
    baslik?: string;
    baslangic?: string;
  }>();
  return <YoklamaEkrani dersId={dersId} baslik={baslik ?? ''} baslangic={baslangic ?? ''} />;
}
