'use client';

import { t } from '@kopru/i18n';
import { useQuery } from '@tanstack/react-query';
import { ShieldOff } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useRef, type ReactNode } from 'react';

import Yukleniyor from './loading';

import { BosDurum } from '@/components/bos-durum';
import { HataDurumu } from '@/components/hata-durumu';
import { UygulamaKabugu } from '@/components/kabuk/uygulama-kabugu';
import { dugmeStili } from '@/components/ui/button';
import { KurumKutusu, type KurumBaglami } from '@/kurum/baglam';
import { bffIstek, hataMesaji, UygulamaHatasi } from '@/lib/api';
import { faz1Roller } from '@/lib/navigasyon';
import { vurguUygula } from '@/lib/vurgu';
import { erisimBelirteciAl, useOturum } from '@/oturum/saglayici';
import { kurumBaglamiSema } from '@/oturum/tipler';

export default function KurumDuzeni({ children }: { children: ReactNode }) {
  const { kurumId } = useParams<{ kurumId: string }>();
  const { durum, yenile } = useOturum();
  const oturum = durum.tur === 'hazir' ? durum.oturum : null;
  const denenen = useRef<string | null>(null);

  const uyelikler = oturum?.uyelikler.filter((u) => faz1Roller.includes(u.rol)) ?? [];
  const etkin = uyelikler.find((u) => u.id === oturum?.aktifUyelikId && u.kurumId === kurumId);
  const aday = uyelikler.find((u) => u.kurumId === kurumId);

  // Adres cubugundaki kurum, etkin uyelikten farkliysa belirteci o kuruma cevir.
  useEffect(() => {
    if (etkin || !aday || denenen.current === aday.id) return;
    denenen.current = aday.id;
    yenile({ uyelikId: aday.id }).catch(() => undefined);
  }, [etkin, aday, yenile]);

  useEffect(() => {
    if (!etkin) return;
    return vurguUygula(document.documentElement, etkin.vurguRengi);
  }, [etkin]);

  const baglam = useQuery({
    queryKey: ['kurum-baglami', kurumId, etkin?.id],
    enabled: Boolean(etkin),
    queryFn: () =>
      bffIstek(`/api/oturum/baglam?kurumId=${encodeURIComponent(kurumId)}`, {
        belirtec: erisimBelirteciAl(),
        sema: kurumBaglamiSema,
      }),
  });

  // 401: oturum gecersiz (yenileme de 401 verirse oturum kapanir, girise donulur).
  // 403 `riza_gerekli`: oturum durumu yenilenir, koruma KVKK ekranina yonlendirir.
  const baglamHatasi = baglam.error instanceof UygulamaHatasi ? baglam.error : null;
  const oturumuYenile =
    baglamHatasi?.durum === 401 ||
    (baglamHatasi?.durum === 403 && baglamHatasi.kod === 'riza_gerekli');
  useEffect(() => {
    if (oturumuYenile)
      yenile(oturum?.aktifUyelikId ? { uyelikId: oturum.aktifUyelikId } : {}).catch(
        () => undefined,
      );
  }, [oturumuYenile, yenile, oturum?.aktifUyelikId]);

  const deger = useMemo<KurumBaglami | null>(
    () =>
      etkin && baglam.data && oturum
        ? {
            uyelik: etkin,
            rol: etkin.rol,
            kullaniciAd: oturum.kullanici.ad,
            acikModuller: baglam.data.moduller,
          }
        : null,
    [etkin, baglam.data, oturum],
  );

  if (!oturum) return null;

  if (!aday) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-md items-center">
        <BosDurum
          ikon={ShieldOff}
          baslik={t('kurumSec.erisimYok')}
          aciklama={t('kurumSec.erisimYokAciklama')}
        >
          <Link href="/kurum-sec" className={dugmeStili()}>
            {t('kurumSec.kurumListesi')}
          </Link>
        </BosDurum>
      </div>
    );
  }

  if (baglam.isError) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-md items-center">
        <HataDurumu
          aciklama={hataMesaji(baglam.error)}
          istekNo={baglam.error instanceof UygulamaHatasi ? baglam.error.istekId : undefined}
          tekrarDene={() => void baglam.refetch()}
        />
      </div>
    );
  }

  if (!deger) return <Yukleniyor />;

  return (
    <KurumKutusu value={deger}>
      <UygulamaKabugu>{children}</UygulamaKabugu>
    </KurumKutusu>
  );
}
