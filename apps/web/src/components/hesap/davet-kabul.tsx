'use client';

import { DavetKabulYanitSema } from '@kopru/contracts';
import { t } from '@kopru/i18n';
import { useMutation } from '@tanstack/react-query';
import { CircleCheck, MailX, UserCheck } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { z } from 'zod';

import { BosDurum } from '@/components/bos-durum';
import { Dugme, dugmeStili } from '@/components/ui/button';
import { Kart } from '@/components/ui/kart';
import { Uyari } from '@/components/ui/uyari';
import { hataMesaji, UygulamaHatasi } from '@/lib/api';
import { devamKaydet, devamSil } from '@/lib/devam';
import { hesapIstek } from '@/lib/hesap-istek';
import { EkranYukleniyor, yonlendirmeHedefi } from '@/oturum/koruma';
import { useOturum } from '@/oturum/saglayici';

// Mock kurum kimlikleri UUID degildir; gercek api UUID doner.
const kabulSema = DavetKabulYanitSema.extend({ kurum_id: z.string(), uyelik_id: z.string() });

type Sonuc = 'bekliyor' | 'basarili' | 'gecersiz' | 'zaten-uye';

/**
 * Davet kabul sayfasi (`/davet/<belirtec>`, herkese acik yol). Oturum yoksa girise, KVKK
 * gerekiyorsa KVKK'ya gidilir; donus yolu (belirtec dahil) yalniz bu sekmenin `sessionStorage`inda
 * tutulur. Belirtec URL disinda log'a ya da analitige yazilmaz.
 */
export function DavetKabul({ belirtec }: { belirtec: string }) {
  const { durum, yenile } = useOturum();
  const router = useRouter();
  const [sonuc, setSonuc] = useState<Sonuc>('bekliyor');
  const [hata, setHata] = useState<string | null>(null);
  const yol = `/davet/${belirtec}`;
  const belirtecEksik = belirtec.trim().length < 20;

  const hedef = yonlendirmeHedefi('uygulama', durum);
  useEffect(() => {
    if (belirtecEksik || (hedef !== 'giris' && hedef !== 'kvkk')) return;
    devamKaydet(yol);
    router.replace(`/${hedef}`);
  }, [hedef, yol, router, belirtecEksik]);

  const kabul = useMutation({
    mutationFn: () => hesapIstek('davetler/kabul', { govde: { belirtec }, sema: kabulSema }),
    onSuccess: async (yanit) => {
      devamSil();
      setSonuc('basarili');
      // Yeni uyelikle belirteci yenile ve dogrudan kuruma gir.
      await yenile({ kurumId: yanit.kurum_id }).catch(() => undefined);
      router.replace(`/${yanit.kurum_id}/bugun`);
    },
    onError: (e) => {
      if (e instanceof UygulamaHatasi && e.kod === 'davet_gecersiz') {
        devamSil();
        setSonuc('gecersiz');
      } else if (e instanceof UygulamaHatasi && e.kod === 'zaten_uye') {
        devamSil();
        setSonuc('zaten-uye');
      } else {
        setHata(hataMesaji(e));
      }
    },
  });

  if (belirtecEksik) {
    return (
      <Kapsayici>
        <Gecersiz aciklama={t('hesap.davetKabul.belirtecYok')} />
      </Kapsayici>
    );
  }
  if (durum.tur === 'yukleniyor') return <EkranYukleniyor />;
  if (hedef === 'giris' || hedef === 'kvkk') {
    return (
      <Kapsayici>
        <p role="status" className="text-sm text-metin-ikincil">
          {hedef === 'giris'
            ? t('hesap.davetKabul.yonlendiriliyor')
            : t('hesap.davetKabul.kvkkYonlendiriliyor')}
        </p>
      </Kapsayici>
    );
  }

  if (sonuc === 'gecersiz') {
    return (
      <Kapsayici>
        <Gecersiz aciklama={t('hesap.davetKabul.gecersizAciklama')} />
      </Kapsayici>
    );
  }
  if (sonuc === 'zaten-uye') {
    return (
      <Kapsayici>
        <Kart>
          <BosDurum
            ikon={UserCheck}
            baslik={t('hesap.davetKabul.zatenUyeBaslik')}
            aciklama={t('hesap.davetKabul.zatenUyeAciklama')}
          >
            <Link href="/kurum-sec" className={dugmeStili()}>
              {t('hesap.davetKabul.kurumListesi')}
            </Link>
          </BosDurum>
        </Kart>
      </Kapsayici>
    );
  }
  if (sonuc === 'basarili') {
    return (
      <Kapsayici>
        <Kart>
          <BosDurum
            ikon={CircleCheck}
            baslik={t('hesap.davetKabul.basarili')}
            aciklama={t('hesap.davetKabul.basariliAciklama')}
          />
        </Kart>
      </Kapsayici>
    );
  }

  return (
    <Kapsayici>
      <header className="mb-6">
        <h1 className="text-3xl font-semibold tracking-tight">{t('hesap.davetKabul.baslik')}</h1>
        <p className="mt-2 text-base text-metin-ikincil">{t('hesap.davetKabul.aciklama')}</p>
      </header>
      {hata ? <Uyari className="mb-4">{hata}</Uyari> : null}
      <Dugme
        boyut="lg"
        disabled={kabul.isPending}
        onClick={() => {
          setHata(null);
          kabul.mutate();
        }}
      >
        {kabul.isPending ? t('hesap.davetKabul.kabulEdiliyor') : t('hesap.davetKabul.kabulEt')}
      </Dugme>
    </Kapsayici>
  );
}

function Kapsayici({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col">{children}</div>;
}

function Gecersiz({ aciklama }: { aciklama: string }) {
  return (
    <Kart>
      <BosDurum ikon={MailX} baslik={t('hesap.davetKabul.gecersizBaslik')} aciklama={aciklama}>
        <Link href="/kurum-sec" className={dugmeStili({ gorunum: 'ikincil' })}>
          {t('hesap.davetKabul.kurumListesi')}
        </Link>
      </BosDurum>
    </Kart>
  );
}
