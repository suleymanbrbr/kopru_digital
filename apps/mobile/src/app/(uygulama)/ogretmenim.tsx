import { useLocalSearchParams } from 'expo-router';

import { OgretmenimEkrani } from '../../ekranlar/degerlendirme/OgretmenimEkrani';

/** `bolum`: bildirim derin baglantisi hangi sekmeyi acar (`oneriler` varsayilan). */
export default function OgretmenimRotasi() {
  const { bolum } = useLocalSearchParams<{ bolum?: string }>();
  const b = bolum === 'degerlendirmeler' ? 'degerlendirmeler' : 'oneriler';
  // `key`: ekran aciksa bildirimle baska bolume gecilirken yeniden kurulur.
  return <OgretmenimEkrani key={b} bolum={b} />;
}
