import { useRouter } from 'expo-router';

import { KarakterSecimi } from '../../ekranlar/motivasyon/KarakterSecimi';
import { Ekran } from '../../ui/Ekran';

/** Ilk acilista (karakter yoksa) acilan karakter secimi; "Sonra" ile gecilebilir. */
export default function KarakterSecEkrani() {
  const router = useRouter();
  const geri = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };
  return (
    <Ekran klavye>
      <KarakterSecimi mod="ilk" bitti={geri} vazgec={geri} />
    </Ekran>
  );
}
