import { GruplarEkrani } from '@/components/hesap/gruplar/gruplar-ekrani';
import { BolumKapisi } from '@/components/kabuk/bolum-yer-tutucu';

export default function GruplarSayfasi() {
  return (
    <BolumKapisi bolum="gruplar">
      <GruplarEkrani />
    </BolumKapisi>
  );
}
