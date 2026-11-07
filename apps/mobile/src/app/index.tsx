import { Redirect } from 'expo-router';

import { kvkkOnayliMi } from '../oturum/yonetici';
import { useOturum } from '../uygulama/baglam';

/** Durumdan hedefe yonlendirir; korumali gruplar zaten yetkisiz erisimi engeller. */
export default function Baslangic() {
  const o = useOturum();
  if (o.asama !== 'giris') return <Redirect href="/giris" />;
  if (!kvkkOnayliMi(o.kvkk)) return <Redirect href="/kvkk" />;
  if (!o.aktif) return <Redirect href="/kurum-sec" />;
  return <Redirect href="/bugun" />;
}
