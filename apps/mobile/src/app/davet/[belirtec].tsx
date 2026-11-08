import { Redirect, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';

import { Yukleniyor } from '../../ui/Durumlar';
import { useServisler } from '../../uygulama/baglam';

/**
 * Davet derin baglantisi: `kopru://davet/<belirtec>`. Oturum durumundan bagimsiz erisilebilir
 * (korumali gruplarin disinda). Belirteci guvenli depoya yazar ve hemen kok yonlendirmeye doner;
 * kabul, giris + KVKK tamamlaninca `DavetYoneticisi` tarafindan yapilir. Belirteç yola, log'a
 * ya da gezinti durumuna birakilmaz.
 */
export default function DavetRotasi() {
  const { belirtec } = useLocalSearchParams<{ belirtec?: string }>();
  const { davet } = useServisler();
  const [bitti, setBitti] = useState(false);
  const basladi = useRef(false);

  useEffect(() => {
    if (basladi.current) return;
    basladi.current = true;
    void davet.kaydet(typeof belirtec === 'string' ? belirtec : undefined).finally(() => {
      setBitti(true);
    });
  }, [belirtec, davet]);

  return bitti ? <Redirect href="/" /> : <Yukleniyor />;
}
