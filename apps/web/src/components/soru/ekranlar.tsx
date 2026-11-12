'use client';

import { SoruMusaitlikSema } from '@kopru/contracts';
import { t } from '@kopru/i18n';
import { useMutation } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';

import { SoruArsivi } from './soru-arsivi';
import { SoruDetayEkrani } from './soru-detay';
import { SoruFormu } from './soru-formu';
import { YonetimAyarlar } from './yonetim-ayarlar';
import { YonetimBildirimler } from './yonetim-bildirimler';
import { YonetimMasalar } from './yonetim-masalar';
import { YonetimOlcum } from './yonetim-olcum';

import { BildirimKutusu, basarisiz, type Bildirim } from '@/components/hesap/ortak';
import { BolumKapisi } from '@/components/kabuk/bolum-yer-tutucu';
import { SayfaBasligi } from '@/components/kabuk/sayfa-basligi';
import { Sekmeler } from '@/components/ogrenme/ortak';
import { useKurum } from '@/kurum/baglam';
import { cn } from '@/lib/cn';
import { ogrenmeIstek } from '@/lib/hesap-istek';
import { useBekleyenSayisi, useMusaitlik, useSoruYenile } from '@/lib/soru/veri';

/** Ogrenci: "Soru sor" (yeni soru) ve "Sorularim" (arsiv). */
export function SoruSorEkrani() {
  return (
    <BolumKapisi bolum="soru-sor">
      <SoruSorIcerigi />
    </BolumKapisi>
  );
}

function SoruSorIcerigi() {
  const { uyelik } = useKurum();
  const params = useSearchParams();
  const [sekme, setSekme] = useState(params.get('sekme') === 'sorularim' ? 'sorularim' : 'yeni');
  return (
    <>
      <SayfaBasligi baslik={t('nav.soruSor')} aciklama={t('soruSor.sayfa.ogrenciAciklama')} />
      <Sekmeler
        deger={sekme}
        degisti={setSekme}
        etiket={t('soruSor.sayfa.sekmeler')}
        sekmeler={[
          {
            anahtar: 'yeni',
            etiket: t('soruSor.sayfa.yeni'),
            icerik: (
              <SoruFormu
                sorularimaGit={() => {
                  setSekme('sorularim');
                }}
              />
            ),
          },
          {
            anahtar: 'sorularim',
            etiket: t('soruSor.sayfa.sorularim'),
            icerik: (
              <SoruArsivi
                kaynak="sorularim"
                hrefKok={`/${uyelik.kurumId}/soru-sor`}
                etiket={t('soruSor.sayfa.sorularim')}
              />
            ),
          },
        ]}
      />
    </>
  );
}

export function OgrenciSoruDetayi({ soruId }: { soruId: string }) {
  const { uyelik } = useKurum();
  return (
    <BolumKapisi bolum="soru-sor">
      <SoruDetayEkrani
        soruId={soruId}
        geriHref={`/${uyelik.kurumId}/soru-sor?sekme=sorularim`}
        geriEtiket={t('soruSor.detay.sorularima')}
      />
    </BolumKapisi>
  );
}

export function PersonelSoruDetayi({ soruId }: { soruId: string }) {
  const { uyelik } = useKurum();
  return (
    <BolumKapisi bolum="sorular">
      <SoruDetayEkrani
        soruId={soruId}
        geriHref={`/${uyelik.kurumId}/sorular`}
        geriEtiket={t('soruSor.detay.sorulara')}
      />
    </BolumKapisi>
  );
}

/** Ogretmen/yonetici: cevap bekleyenler, cevapladiklarim, musaitlik; yonetimde masalar, ayarlar, bildirimler, olcum. */
export function SorularEkrani() {
  return (
    <BolumKapisi bolum="sorular">
      <SorularIcerigi />
    </BolumKapisi>
  );
}

const YONETIM_SEKMELERI = ['tum', 'bildirimler', 'masalar', 'ayarlar', 'olcum'];

function SorularIcerigi() {
  const { uyelik, rol } = useKurum();
  const kurumId = uyelik.kurumId;
  const yonetim = rol === 'sahip' || rol === 'yonetici';
  const params = useSearchParams();
  const ilk = params.get('sekme') ?? 'bekleyen';
  const [sekme, setSekme] = useState(
    ['bekleyen', 'cevapladigim', ...(yonetim ? YONETIM_SEKMELERI : [])].includes(ilk)
      ? ilk
      : 'bekleyen',
  );
  const sayi = useBekleyenSayisi(kurumId, true);
  const kok = `/${kurumId}/sorular`;
  const bekleyen = sayi.data?.bekleyen;

  return (
    <>
      <SayfaBasligi baslik={t('nav.sorular')} aciklama={t('soruSor.sayfa.personelAciklama')}>
        <MusaitlikAnahtari />
      </SayfaBasligi>
      <Sekmeler
        deger={sekme}
        degisti={setSekme}
        etiket={t('soruSor.sayfa.sekmeler')}
        sekmeler={[
          {
            anahtar: 'bekleyen',
            etiket:
              bekleyen === undefined
                ? t('soruSor.sayfa.bekleyen')
                : t('soruSor.sayfa.bekleyenSayili', { n: bekleyen }),
            icerik: (
              <SoruArsivi kaynak="gelen" hrefKok={kok} etiket={t('soruSor.sayfa.bekleyen')} />
            ),
          },
          {
            anahtar: 'cevapladigim',
            etiket: t('soruSor.sayfa.cevapladigim'),
            icerik: (
              <SoruArsivi
                kaynak="cevapladigim"
                hrefKok={kok}
                etiket={t('soruSor.sayfa.cevapladigim')}
              />
            ),
          },
          ...(yonetim
            ? [
                {
                  anahtar: 'tum',
                  etiket: t('soruSor.sayfa.tum'),
                  icerik: (
                    <SoruArsivi kaynak="yonetim" hrefKok={kok} etiket={t('soruSor.sayfa.tum')} />
                  ),
                },
                {
                  anahtar: 'bildirimler',
                  etiket: t('soruSor.sayfa.bildirimler'),
                  icerik: <YonetimBildirimler />,
                },
                {
                  anahtar: 'masalar',
                  etiket: t('soruSor.sayfa.masalar'),
                  icerik: <YonetimMasalar />,
                },
                {
                  anahtar: 'ayarlar',
                  etiket: t('soruSor.sayfa.ayarlar'),
                  icerik: <YonetimAyarlar />,
                },
                { anahtar: 'olcum', etiket: t('soruSor.sayfa.olcum'), icerik: <YonetimOlcum /> },
              ]
            : []),
        ]}
      />
    </>
  );
}

/** "Bugun cevap veremiyorum": ogrencilere tahmini sure yerine "cevap veremiyor" gosterilir; ertesi gun kendiliginden kapanir. */
function MusaitlikAnahtari() {
  const { uyelik } = useKurum();
  const kurumId = uyelik.kurumId;
  const q = useMusaitlik(kurumId);
  const yenile = useSoruYenile(kurumId);
  const [bildirim, setBildirim] = useState<Bildirim>(null);
  const degistir = useMutation({
    mutationFn: (musait: boolean) =>
      ogrenmeIstek(`kurumlar/${kurumId}/soru-musaitligim`, {
        yontem: 'PUT',
        govde: { musait },
        sema: SoruMusaitlikSema,
      }),
    onSuccess: () => {
      setBildirim(null);
      void yenile();
    },
    onError: (h) => {
      setBildirim(basarisiz(h));
    },
  });
  const musaitDegil = q.data ? !q.data.musait : false;
  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex items-center gap-3">
        <span id="musaitlik-etiket" className="text-sm font-medium">
          {t('soruSor.musaitlik.etiket')}
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={musaitDegil}
          aria-labelledby="musaitlik-etiket"
          disabled={!q.data || degistir.isPending}
          onClick={() => {
            degistir.mutate(musaitDegil);
          }}
          className={cn(
            'relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border-2 transition-colors disabled:opacity-50',
            musaitDegil ? 'border-birincil bg-birincil' : 'border-metin-ikincil/60 bg-yuzey',
          )}
        >
          <span
            aria-hidden
            className={cn(
              'size-4 rounded-full transition-transform',
              musaitDegil ? 'translate-x-6 bg-birincil-uzeri' : 'translate-x-1 bg-metin-ikincil',
            )}
          />
        </button>
        <span className="w-12 text-sm text-metin-ikincil" aria-hidden>
          {musaitDegil ? t('soruSor.musaitlik.acik') : t('soruSor.musaitlik.kapali')}
        </span>
      </div>
      {musaitDegil ? (
        <p className="max-w-xs text-right text-xs text-metin-ikincil">
          {t('soruSor.musaitlik.aciklama')}
        </p>
      ) : null}
      <BildirimKutusu bildirim={bildirim} />
    </div>
  );
}
