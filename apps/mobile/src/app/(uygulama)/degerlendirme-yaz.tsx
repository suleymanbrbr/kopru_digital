import { useLocalSearchParams } from 'expo-router';

import { DegerlendirmeFormu } from '../../ekranlar/degerlendirme/DegerlendirmeFormu';

/** `duzelt` verilirse kendi degerlendirmesini duzenler (7 gun icinde); yoksa yenisini yazar. */
export default function DegerlendirmeYazRotasi() {
  const { ogrenciId, ad, duzelt } = useLocalSearchParams<{
    ogrenciId: string;
    ad?: string;
    duzelt?: string;
  }>();
  return <DegerlendirmeFormu ogrenciId={ogrenciId} ad={ad ?? ''} {...(duzelt ? { duzelt } : {})} />;
}
