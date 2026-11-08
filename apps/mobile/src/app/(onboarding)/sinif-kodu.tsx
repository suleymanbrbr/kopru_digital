import { useRouter } from 'expo-router';

import { SinifKoduKatil } from '../../ekranlar/SinifKoduKatil';

/** Uyeliksiz ya da yeni kullanici: kurum secimi oncesi sinif koduyla katilim. */
export default function SinifKodu() {
  const router = useRouter();
  return (
    <SinifKoduKatil
      geri={() => {
        router.back();
      }}
    />
  );
}
