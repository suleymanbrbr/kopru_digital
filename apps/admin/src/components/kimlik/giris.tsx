'use client';

import { t } from '@kopru/i18n';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ShieldCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Alan } from '../ui/alan';
import { Dugme } from '../ui/dugme';
import { Uyari } from '../ui/uyari';

import { bff } from '@/lib/api';
import { cn } from '@/lib/cn';
import { hataMetni } from '@/lib/hata';

type Yontem = 'telefon' | 'eposta';

/** Giris: telefon OTP ya da e-posta + parola. Belirtecler cerezde kalir; sonra ikinci adim ekranina gidilir. */
export function GirisFormu() {
  const router = useRouter();
  const istemci = useQueryClient();
  const [yontem, setYontem] = useState<Yontem>('telefon');
  const [telefon, setTelefon] = useState('');
  const [kod, setKod] = useState('');
  const [kodIstendi, setKodIstendi] = useState(false);
  const [eposta, setEposta] = useState('');
  const [parola, setParola] = useState('');

  const bitir = () => {
    istemci.clear();
    router.replace('/dogrulama');
  };

  const kodIste = useMutation({
    mutationFn: () => bff.yolla('oturum/kod-iste', { telefon }),
    onSuccess: () => {
      setKodIstendi(true);
    },
  });
  const kodDogrula = useMutation({
    mutationFn: () => bff.yolla('oturum/kod-dogrula', { telefon, kod }),
    onSuccess: bitir,
  });
  const epostaGiris = useMutation({
    mutationFn: () => bff.yolla('oturum/eposta-giris', { eposta, parola }),
    onSuccess: bitir,
  });

  const hata = (yontem === 'telefon' ? (kodIstendi ? kodDogrula : kodIste) : epostaGiris).error;
  const bekliyor = kodIste.isPending || kodDogrula.isPending || epostaGiris.isPending;

  const gonder = (e: { preventDefault: () => void }) => {
    e.preventDefault();
    if (yontem === 'eposta') epostaGiris.mutate();
    else if (kodIstendi) kodDogrula.mutate();
    else kodIste.mutate();
  };

  const sekme = (deger: Yontem, etiket: string) => (
    <button
      type="button"
      role="tab"
      id={`sekme-${deger}`}
      aria-selected={yontem === deger}
      aria-controls="giris-paneli"
      onClick={() => {
        setYontem(deger);
      }}
      className={cn(
        'h-10 flex-1 rounded-kucuk text-sm font-medium transition-colors',
        yontem === deger ? 'bg-yuzey text-metin' : 'text-metin-ikincil hover:text-metin',
      )}
    >
      {etiket}
    </button>
  );

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-4 py-10">
      <div>
        <ShieldCheck className="size-9 text-birincil" aria-hidden />
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">{t('yonetim.giris.baslik')}</h1>
        <p className="mt-1 text-sm text-metin-ikincil">{t('yonetim.giris.aciklama')}</p>
      </div>

      <div className="rounded-buyuk border border-kenar bg-yuzey p-5">
        <div
          role="tablist"
          aria-label={t('yonetim.giris.sekmeler')}
          className="mb-5 flex gap-1 rounded-orta border border-kenar bg-yuzey-ikincil p-0.5"
        >
          {sekme('telefon', t('yonetim.giris.sekmeTelefon'))}
          {sekme('eposta', t('yonetim.giris.sekmeEposta'))}
        </div>

        <form
          id="giris-paneli"
          role="tabpanel"
          aria-labelledby={`sekme-${yontem}`}
          onSubmit={gonder}
          className="flex flex-col gap-4"
        >
          {yontem === 'telefon' ? (
            <>
              <Alan
                etiket={t('yonetim.giris.telefon')}
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={telefon}
                disabled={kodIstendi}
                onChange={(e) => {
                  setTelefon(e.target.value);
                }}
                required
              />
              {kodIstendi ? (
                <Alan
                  etiket={t('yonetim.giris.kod')}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={8}
                  value={kod}
                  onChange={(e) => {
                    setKod(e.target.value);
                  }}
                  yardim={t('yonetim.giris.kodGonderildi')}
                  required
                />
              ) : null}
            </>
          ) : (
            <>
              <Alan
                etiket={t('yonetim.giris.eposta')}
                type="email"
                autoComplete="username"
                value={eposta}
                onChange={(e) => {
                  setEposta(e.target.value);
                }}
                required
              />
              <Alan
                etiket={t('yonetim.giris.parola')}
                type="password"
                autoComplete="current-password"
                value={parola}
                onChange={(e) => {
                  setParola(e.target.value);
                }}
                required
              />
            </>
          )}

          {hata ? <Uyari ton="hata" baslik={hataMetni(hata)} /> : null}

          <div className="flex flex-wrap gap-2">
            <Dugme type="submit" disabled={bekliyor} className="flex-1">
              {yontem === 'eposta'
                ? t('yonetim.giris.epostaGiris')
                : kodIstendi
                  ? t('yonetim.giris.kodDogrula')
                  : t('yonetim.giris.kodGonder')}
            </Dugme>
            {yontem === 'telefon' && kodIstendi ? (
              <Dugme
                gorunum="ikincil"
                onClick={() => {
                  setKodIstendi(false);
                  setKod('');
                  kodDogrula.reset();
                }}
              >
                {t('yonetim.giris.yenidenKod')}
              </Dugme>
            ) : null}
          </div>
        </form>
      </div>
    </main>
  );
}
