import { useLocalSearchParams } from 'expo-router';

import { KayitEkleEkrani } from '../../ekranlar/KayitEkleEkrani';

export default function KayitEkleRotasi() {
  const { dersId, baslik, baslangic } = useLocalSearchParams<{
    dersId: string;
    baslik?: string;
    baslangic?: string;
  }>();
  return <KayitEkleEkrani dersId={dersId} baslik={baslik ?? ''} baslangic={baslangic ?? ''} />;
}
