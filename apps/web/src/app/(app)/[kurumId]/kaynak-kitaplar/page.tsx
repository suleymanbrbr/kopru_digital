import { KaynakKitaplarEkrani } from '@/components/gunluk-soru/kitap-ekranlari';
import { BolumKapisi } from '@/components/kabuk/bolum-yer-tutucu';

export default function KaynakKitaplarSayfasi() {
  return (
    <BolumKapisi bolum="kaynak-kitaplar">
      <KaynakKitaplarEkrani />
    </BolumKapisi>
  );
}
