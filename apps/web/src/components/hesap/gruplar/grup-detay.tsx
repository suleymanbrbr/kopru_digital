'use client';

import { GrupSema } from '@kopru/contracts';
import { t } from '@kopru/i18n';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, SearchX } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';

import { basari, basarisiz, BildirimKutusu, type Bildirim } from '../ortak';
import { GrupAtamalari } from './grup-atamalari';
import { GrupFormu } from './grup-formu';
import { GrupKatilim } from './grup-katilim';
import { GrupUyeleri } from './grup-uyeleri';
import { GrupSatirBilgisi } from './gruplar-ekrani';

import { BosDurum } from '@/components/bos-durum';
import { HataDurumu } from '@/components/hata-durumu';
import { SayfaBasligi } from '@/components/kabuk/sayfa-basligi';
import { Dugme, dugmeStili } from '@/components/ui/button';
import { Iskelet } from '@/components/ui/kart';
import { OnayPenceresi } from '@/components/ui/pencere';
import { useKurum } from '@/kurum/baglam';
import { hataMesaji, UygulamaHatasi } from '@/lib/api';
import { hesapIstek } from '@/lib/hesap-istek';
import { yenidenDene } from '@/lib/sayfali-sorgu';
import { izinli } from '@/lib/yetki';

export function GrupDetay() {
  const { grupId } = useParams<{ grupId: string }>();
  const { uyelik, rol } = useKurum();
  const kurumId = uyelik.kurumId;
  const qc = useQueryClient();
  const yazabilir = izinli(rol, 'grup.yaz');
  const [formAcik, setFormAcik] = useState(false);
  const [arsivOnay, setArsivOnay] = useState(false);
  const [bildirim, setBildirim] = useState<Bildirim>(null);

  const grup = useQuery({
    queryKey: ['hesap', kurumId, 'gruplar', grupId, 'ayrinti'],
    retry: yenidenDene,
    queryFn: () => hesapIstek(`kurumlar/${kurumId}/gruplar/${grupId}`, { sema: GrupSema }),
  });

  const arsivle = useMutation({
    mutationFn: () =>
      hesapIstek(`kurumlar/${kurumId}/gruplar/${grupId}/arsivle`, { yontem: 'POST' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['hesap', kurumId, 'gruplar'] });
      setBildirim(basari(t('hesap.gruplar.arsivlendi', { ad: grup.data?.ad ?? '' })));
    },
    onError: (e) => {
      setBildirim(basarisiz(e));
    },
    onSettled: () => {
      setArsivOnay(false);
    },
  });

  const geri = (
    <Link
      href={`/${kurumId}/gruplar`}
      className={dugmeStili({ gorunum: 'hayalet', boyut: 'sm', className: '-ml-3 mb-3' })}
    >
      <ArrowLeft aria-hidden />
      {t('hesap.gruplar.detay.geri')}
    </Link>
  );

  if (grup.isPending) {
    return (
      <>
        {geri}
        <div role="status" aria-label={t('ortak.yukleniyor')} className="flex flex-col gap-4">
          <Iskelet className="h-10 w-1/2" />
          <Iskelet className="h-40 w-full" />
          <Iskelet className="h-40 w-full" />
        </div>
      </>
    );
  }

  if (grup.isError) {
    const bulunamadi = grup.error instanceof UygulamaHatasi && grup.error.durum === 404;
    return (
      <>
        {geri}
        {bulunamadi ? (
          <BosDurum
            className="py-16"
            ikon={SearchX}
            baslik={t('hesap.gruplar.detay.bulunamadi')}
            aciklama={t('hesap.gruplar.detay.bulunamadiAciklama')}
          />
        ) : (
          <HataDurumu
            baslik={t('hesap.gruplar.detay.yuklenemedi')}
            aciklama={hataMesaji(grup.error)}
            istekNo={grup.error instanceof UygulamaHatasi ? grup.error.istekId : undefined}
            tekrarDene={() => void grup.refetch()}
          />
        )}
      </>
    );
  }

  const g = grup.data;
  return (
    <>
      {geri}
      <SayfaBasligi baslik={g.ad}>
        {yazabilir && g.durum === 'aktif' ? (
          <div className="flex gap-2">
            <Dugme
              gorunum="ikincil"
              onClick={() => {
                setFormAcik(true);
              }}
            >
              {t('hesap.gruplar.duzenle')}
            </Dugme>
            <Dugme
              gorunum="ikincil"
              onClick={() => {
                setArsivOnay(true);
              }}
            >
              {t('hesap.gruplar.arsivle')}
            </Dugme>
          </div>
        ) : null}
      </SayfaBasligi>
      <div className="-mt-4 mb-6">
        <GrupSatirBilgisi grup={g} />
      </div>
      <div className="mb-4 empty:hidden">
        <BildirimKutusu bildirim={bildirim} />
      </div>

      <div className="flex flex-col gap-6">
        <GrupKatilim kurumId={kurumId} grup={g} />
        <GrupUyeleri kurumId={kurumId} grup={g} yazabilir={yazabilir} />
        <GrupAtamalari kurumId={kurumId} grup={g} yazabilir={yazabilir} />
      </div>

      <GrupFormu
        acik={formAcik}
        degisti={setFormAcik}
        kurumId={kurumId}
        grup={g}
        bitti={(metin) => {
          setBildirim(basari(metin));
          void grup.refetch();
        }}
      />
      <OnayPenceresi
        acik={arsivOnay}
        degisti={setArsivOnay}
        baslik={t('hesap.gruplar.arsivOnay.baslik', { ad: g.ad })}
        aciklama={t('hesap.gruplar.arsivOnay.aciklama')}
        onayEtiketi={t('hesap.gruplar.arsivOnay.onay')}
        tehlikeli
        bekliyor={arsivle.isPending}
        onay={() => {
          arsivle.mutate();
        }}
      />
    </>
  );
}
