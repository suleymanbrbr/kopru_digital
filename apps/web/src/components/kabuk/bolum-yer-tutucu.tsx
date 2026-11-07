'use client';

import { t } from '@kopru/i18n';
import { Hammer, Lock, PuzzleIcon } from 'lucide-react';
import Link from 'next/link';

import { SayfaBasligi } from './sayfa-basligi';

import { BosDurum } from '@/components/bos-durum';
import { dugmeStili } from '@/components/ui/button';
import { Kart } from '@/components/ui/kart';
import { useKurum } from '@/kurum/baglam';
import { bolumDurumu } from '@/lib/navigasyon';

/** Henuz yazilmamis bolumler icin ortak sayfa; rol ve modul durumuna gore dogru mesaji verir. */
export function BolumYerTutucu({ bolum, notFound }: { bolum: string; notFound: () => never }) {
  const { rol, acikModuller, uyelik } = useKurum();
  const sonuc = bolumDurumu(bolum, { rol, acikModuller });
  if (sonuc.durum === 'yok' || !sonuc.oge) return notFound();

  const baslik = t(sonuc.oge.baslik);
  const bugunDon = (
    <Link href={`/${uyelik.kurumId}/bugun`} className={dugmeStili({ gorunum: 'ikincil' })}>
      {t('yerTutucu.bugunDon')}
    </Link>
  );

  return (
    <>
      <SayfaBasligi baslik={baslik} />
      <Kart>
        {sonuc.durum === 'acik' ? (
          <BosDurum
            className="py-16"
            ikon={Hammer}
            baslik={t('yerTutucu.baslik')}
            aciklama={t('yerTutucu.aciklama', { bolum: baslik })}
          >
            {bugunDon}
          </BosDurum>
        ) : sonuc.durum === 'modul-kapali' ? (
          <BosDurum
            className="py-16"
            ikon={PuzzleIcon}
            baslik={t('yerTutucu.modulKapali')}
            aciklama={t('yerTutucu.modulKapaliAciklama')}
          >
            {bugunDon}
          </BosDurum>
        ) : (
          <BosDurum
            className="py-16"
            ikon={Lock}
            baslik={t('yerTutucu.yetkisiz')}
            aciklama={t('yerTutucu.yetkisizAciklama')}
          >
            {bugunDon}
          </BosDurum>
        )}
      </Kart>
    </>
  );
}
