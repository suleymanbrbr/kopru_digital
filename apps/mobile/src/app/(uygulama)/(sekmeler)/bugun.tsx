import { useAktif } from '../../../uygulama/baglam';

import { OgrenciBugun } from '../../../ekranlar/OgrenciBugun';
import { OgretmenBugun } from '../../../ekranlar/OgretmenBugun';

export default function Bugun() {
  const aktif = useAktif();
  return aktif?.uyelik.rol === 'ogrenci' ? <OgrenciBugun /> : <OgretmenBugun />;
}
