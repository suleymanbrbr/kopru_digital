'use client';

import type { SoruEkSema } from '@kopru/contracts';
import { t } from '@kopru/i18n';
import { ImageOff, RotateCw } from 'lucide-react';
import { useState } from 'react';
import type { z } from 'zod';

import { Dugme } from '@/components/ui/button';
import { Pencere } from '@/components/ui/pencere';
import { sureBicimle } from '@/lib/soru/ses';

type Adres = z.infer<typeof SoruEkSema>['adres'];

/** Adres alinamadiysa (medya yanit vermedi, adres suresi doldu) kullaniciya sessiz bos kutu degil, yenileme sunulur. */
export function GorselYuklenemedi({ yenile }: { yenile?: (() => void) | undefined }) {
  return (
    <div
      role="status"
      className="flex flex-col items-center justify-center gap-2 rounded-orta border border-dashed border-kenar bg-yuzey-ikincil p-4 text-center text-sm text-metin-ikincil"
    >
      <ImageOff className="size-6" aria-hidden />
      <p>{t('soruSor.ek.yuklenemedi')}</p>
      {yenile ? (
        <Dugme type="button" gorunum="ikincil" boyut="sm" onClick={yenile}>
          <RotateCw aria-hidden />
          {t('soruSor.ek.yenile')}
        </Dugme>
      ) : null}
    </div>
  );
}

/**
 * Soru fotografi/cizim: kucuk onizleme, dokununca buyuk pencere. Adres `crossOrigin` ile yuklenir ki ayni
 * adres daha sonra cizim tuvalinde de (CORS onbellegi uyusmazligi olmadan) kullanilabilsin; sunucu CORS
 * basligi vermezse bir kez `crossOrigin`siz denenir.
 */
export function SoruGorseli({
  adres,
  alt,
  yenile,
  etiket,
}: {
  adres: Adres;
  alt: string;
  yenile?: (() => void) | undefined;
  etiket?: string | undefined;
}) {
  const [cors, setCors] = useState(true);
  const [hata, setHata] = useState(false);
  const [buyuk, setBuyuk] = useState(false);
  if (!adres || hata) {
    return (
      <GorselYuklenemedi
        yenile={() => {
          setHata(false);
          setCors(true);
          yenile?.();
        }}
      />
    );
  }
  const kucuk = adres.orta_url ?? adres.asil_url;
  return (
    <figure className="flex flex-col gap-1">
      <button
        type="button"
        onClick={() => {
          setBuyuk(true);
        }}
        aria-label={t('soruSor.ek.buyut', { ad: alt })}
        className="overflow-hidden rounded-orta border border-kenar bg-yuzey-ikincil"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- presigned adres, Image optimizasyonu uygulanamaz */}
        <img
          src={kucuk}
          alt={alt}
          loading="lazy"
          {...(cors ? { crossOrigin: 'anonymous' as const } : {})}
          onError={() => {
            if (cors) setCors(false);
            else setHata(true);
          }}
          className="max-h-72 w-full object-contain"
        />
      </button>
      {etiket ? <figcaption className="text-xs text-metin-ikincil">{etiket}</figcaption> : null}
      <Pencere acik={buyuk} degisti={setBuyuk} baslik={alt} genis>
        {/* eslint-disable-next-line @next/next/no-img-element -- presigned adres */}
        <img
          src={adres.asil_url}
          alt={alt}
          {...(cors ? { crossOrigin: 'anonymous' as const } : {})}
          className="mx-auto max-h-[75dvh] max-w-full object-contain"
        />
      </Pencere>
    </figure>
  );
}

/** Ses cevabi: yerlesik oynatici (klavye ve ekran okuyucu destegi tarayicidan). */
export function SesOynatici({
  adres,
  sureSn,
  yenile,
}: {
  adres: Adres;
  sureSn: number | null;
  yenile?: (() => void) | undefined;
}) {
  const [hata, setHata] = useState(false);
  if (!adres || hata) return <GorselYuklenemedi yenile={yenile} />;
  return (
    <div className="flex flex-col gap-1">
      <audio
        controls
        preload="metadata"
        src={adres.asil_url}
        aria-label={t('soruSor.ek.sesAdi')}
        onError={() => {
          setHata(true);
        }}
        className="w-full"
      />
      {sureSn ? (
        <span className="text-xs text-metin-ikincil">
          {t('soruSor.ek.sure', { sure: sureBicimle(sureSn) })}
        </span>
      ) : null}
    </div>
  );
}

export function EkGosterimi({
  ek,
  sira,
  yenile,
}: {
  ek: z.infer<typeof SoruEkSema>;
  sira: number;
  yenile?: (() => void) | undefined;
}) {
  if (ek.tur === 'ses') return <SesOynatici adres={ek.adres} sureSn={ek.sure_sn} yenile={yenile} />;
  const cizimli = ek.tur === 'cizimli_fotograf';
  return (
    <SoruGorseli
      adres={ek.adres}
      alt={cizimli ? t('soruSor.ek.cizimliAlt', { sira }) : t('soruSor.ek.fotografAlt', { sira })}
      etiket={cizimli ? t('soruSor.ek.cizimli') : undefined}
      yenile={yenile}
    />
  );
}
