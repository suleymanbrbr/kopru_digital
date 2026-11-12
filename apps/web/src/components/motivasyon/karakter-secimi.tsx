'use client';

import { KARAKTER_AD_AZAMI, KarakterYanitiSema } from '@kopru/contracts';
import { t } from '@kopru/i18n';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useId, useState, type SyntheticEvent } from 'react';

import { KarakterGorseli, karakterTuru } from './ortak';

import { HataDurumu } from '@/components/hata-durumu';
import { karakterAdi } from '@/components/karakter';
import { Dugme } from '@/components/ui/button';
import { Etiket, Girdi } from '@/components/ui/input';
import { Iskelet } from '@/components/ui/kart';
import { Uyari } from '@/components/ui/uyari';
import { hataMesaji } from '@/lib/api';
import { cn } from '@/lib/cn';
import { motivasyonIstek } from '@/lib/hesap-istek';
import { motivasyonHataMesaji } from '@/lib/motivasyon/hata';
import { motivasyonAnahtari, useKarakterTurleri } from '@/lib/motivasyon/veri';

/** Ilk giriste karakter secimi: 3 tur, asama onizlemesi ve ad. */
export function KarakterSecimi({ kurumId }: { kurumId: string }) {
  const qc = useQueryClient();
  const turler = useKarakterTurleri(kurumId);
  const [secili, setSecili] = useState('kivilcim');
  const [ad, setAd] = useState('');
  const adId = useId();
  const hataId = useId();

  const sec = useMutation({
    mutationFn: () =>
      motivasyonIstek(`kurumlar/${kurumId}/karakter`, {
        yontem: 'POST',
        govde: { tur_kodu: secili, ad: ad.trim() },
        sema: KarakterYanitiSema,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: motivasyonAnahtari(kurumId) }),
  });

  if (turler.isPending) {
    return (
      <div role="status" aria-label={t('ortak.yukleniyor')} className="flex flex-col gap-4">
        <Iskelet className="h-10 w-1/2" />
        <Iskelet className="h-56 w-full" />
      </div>
    );
  }
  if (turler.isError) {
    return (
      <HataDurumu aciklama={hataMesaji(turler.error)} tekrarDene={() => void turler.refetch()} />
    );
  }

  const tur = turler.data.turler.find((x) => x.kod === secili) ?? turler.data.turler[0];
  const bos = ad.trim().length === 0;

  const gonder = (e: SyntheticEvent) => {
    e.preventDefault();
    if (!bos && !sec.isPending) sec.mutate();
  };

  return (
    <form onSubmit={gonder} className="flex flex-col gap-6" noValidate>
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-base font-semibold">{t('motivasyon.secim.turBaslik')}</legend>
        <div className="grid gap-3 sm:grid-cols-3">
          {turler.data.turler.map((x) => {
            const durum = x.kod === secili;
            return (
              <label
                key={x.kod}
                className={cn(
                  'flex cursor-pointer flex-col items-center gap-2 rounded-buyuk border-2 bg-yuzey p-4 text-center transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-birincil',
                  durum
                    ? 'border-birincil bg-birincil-yumusak'
                    : 'border-kenar hover:bg-yuzey-ikincil',
                )}
              >
                <input
                  type="radio"
                  name="karakter-turu"
                  value={x.kod}
                  checked={durum}
                  onChange={() => {
                    setSecili(x.kod);
                  }}
                  className="sr-only"
                />
                <KarakterGorseli turKodu={x.kod} asama={2} boyut={112} />
                <span className="text-base font-semibold">{karakterAdi(karakterTuru(x.kod))}</span>
                <span className="text-sm text-metin-ikincil">
                  {t(`motivasyon.secim.tanim.${karakterTuru(x.kod)}`)}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {tur ? (
        <section
          aria-labelledby="asama-onizleme"
          className="rounded-buyuk border border-kenar bg-yuzey p-4"
        >
          <h2 id="asama-onizleme" className="text-base font-semibold">
            {t('motivasyon.secim.asamalar', { ad: karakterAdi(karakterTuru(tur.kod)) })}
          </h2>
          <p className="mt-0.5 text-sm text-metin-ikincil">
            {t('motivasyon.secim.asamalarAciklama')}
          </p>
          <ol className="mt-3 grid grid-cols-5 gap-1 sm:gap-3">
            {tur.asamalar.map((a) => (
              <li key={a.asama} className="flex flex-col items-center gap-1 text-center">
                <KarakterGorseli turKodu={tur.kod} asama={a.asama} boyut={64} />
                <span className="text-xs font-medium">{a.ad}</span>
                <span className="text-[0.6875rem] text-metin-ikincil">
                  {t('motivasyon.secim.seviyeEsigi', { n: a.gereken_seviye })}
                </span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <Etiket htmlFor={adId}>{t('motivasyon.secim.adEtiketi')}</Etiket>
        <Girdi
          id={adId}
          value={ad}
          maxLength={KARAKTER_AD_AZAMI}
          autoComplete="off"
          placeholder={t('motivasyon.secim.adYerTutucu')}
          aria-describedby={sec.isError ? hataId : undefined}
          aria-invalid={sec.isError || undefined}
          onChange={(e) => {
            setAd(e.target.value);
            if (sec.isError) sec.reset();
          }}
        />
        <p className="text-sm text-metin-ikincil">
          {t('motivasyon.secim.adYardim', { azami: KARAKTER_AD_AZAMI })}
        </p>
      </div>

      <div id={hataId} className="empty:hidden">
        {sec.isError ? <Uyari>{motivasyonHataMesaji(sec.error)}</Uyari> : null}
      </div>

      <div>
        <Dugme type="submit" disabled={bos || sec.isPending}>
          {sec.isPending ? t('ortak.yukleniyor') : t('motivasyon.secim.sec')}
        </Dugme>
      </div>
    </form>
  );
}
