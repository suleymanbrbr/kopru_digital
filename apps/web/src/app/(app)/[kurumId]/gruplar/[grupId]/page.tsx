import { GrupDetay } from '@/components/hesap/gruplar/grup-detay';
import { BolumKapisi } from '@/components/kabuk/bolum-yer-tutucu';

export default function GrupDetaySayfasi() {
  return (
    <BolumKapisi bolum="gruplar">
      <GrupDetay />
    </BolumKapisi>
  );
}
