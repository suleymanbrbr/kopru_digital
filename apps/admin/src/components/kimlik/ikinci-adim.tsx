'use client';

import { t } from '@kopru/i18n';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, Download, KeyRound } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';

import { Alan } from '../ui/alan';
import { Dugme } from '../ui/dugme';
import { Uyari } from '../ui/uyari';
import { KapiHatasi } from './kapi-hatasi';
import { QrKod } from './qr-kod';

import { platform } from '@/lib/api';
import { hataMetni } from '@/lib/hata';
import { BEN_ANAHTARI, useBen } from '@/lib/oturum';
import type { IkinciAdimKurulum, IkinciAdimSonuc } from '@/lib/tipler';

function Sayfa({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center gap-6 px-4 py-10">
      <div>
        <KeyRound className="size-9 text-birincil" aria-hidden />
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">
          {t('yonetim.ikinciAdim.baslik')}
        </h1>
      </div>
      {children}
    </main>
  );
}

/** Panoya kopyalar; basariyi kisa sure gosterir. */
function KopyalaDugmesi({ metin, etiket }: { metin: string; etiket: string }) {
  const [kopyalandi, setKopyalandi] = useState(false);
  useEffect(() => {
    if (!kopyalandi) return;
    const z = setTimeout(() => {
      setKopyalandi(false);
    }, 2000);
    return () => {
      clearTimeout(z);
    };
  }, [kopyalandi]);
  return (
    <Dugme
      gorunum="ikincil"
      boyut="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(metin);
          setKopyalandi(true);
        } catch {
          // Pano izni yoksa kullanici metni elle secip kopyalar.
        }
      }}
    >
      {kopyalandi ? <Check aria-hidden /> : <Copy aria-hidden />}
      {kopyalandi ? t('yonetim.ortak.kopyalandi') : etiket}
    </Dugme>
  );
}

/** Dogrulama uygulamasindaki 6 haneli kodu (ya da yedek kodu) girerek oturumu dogrular. */
function KodGirisi({ yedekKalan }: { yedekKalan: number }) {
  const router = useRouter();
  const istemci = useQueryClient();
  const [yedekKip, setYedekKip] = useState(false);
  const [kod, setKod] = useState('');
  const dogrula = useMutation({
    mutationFn: () =>
      platform.yolla<IkinciAdimSonuc>(
        'ikinci-adim/dogrula',
        yedekKip ? { yedek_kod: kod.trim() } : { kod: kod.trim() },
      ),
    onSuccess: async () => {
      await istemci.invalidateQueries({ queryKey: BEN_ANAHTARI });
      router.replace('/kurumlar');
    },
  });

  const gonder = (e: { preventDefault: () => void }) => {
    e.preventDefault();
    dogrula.mutate();
  };

  return (
    <form
      onSubmit={gonder}
      className="flex flex-col gap-4 rounded-buyuk border border-kenar bg-yuzey p-5"
    >
      <p className="text-sm text-metin-ikincil">{t('yonetim.ikinciAdim.aciklamaDogrula')}</p>
      <Alan
        etiket={
          yedekKip ? t('yonetim.ikinciAdim.yedekKodEtiketi') : t('yonetim.ikinciAdim.kodEtiketi')
        }
        inputMode={yedekKip ? 'text' : 'numeric'}
        autoComplete="one-time-code"
        autoFocus
        maxLength={yedekKip ? 32 : 8}
        value={kod}
        onChange={(e) => {
          setKod(e.target.value);
        }}
        yardim={t('yonetim.ikinciAdim.sifreleBilgi')}
        required
      />
      {dogrula.error ? <Uyari ton="hata" baslik={hataMetni(dogrula.error)} /> : null}
      <div className="flex flex-wrap items-center gap-2">
        <Dugme type="submit" disabled={dogrula.isPending || kod.trim().length < 6}>
          {t('yonetim.ikinciAdim.dogrula')}
        </Dugme>
        <Dugme
          gorunum="hayalet"
          onClick={() => {
            setYedekKip((v) => !v);
            setKod('');
            dogrula.reset();
          }}
        >
          {yedekKip
            ? t('yonetim.ikinciAdim.uygulamaKoduKullan')
            : t('yonetim.ikinciAdim.yedekKodKullan')}
        </Dugme>
      </div>
      {yedekKalan > 0 && yedekKalan <= 3 ? (
        <Uyari ton="uyari">{t('yonetim.ikinciAdim.azYedek', { n: yedekKalan })}</Uyari>
      ) : null}
    </form>
  );
}

/** Ilk kurulum: QR + yedek kodlar (bir kez) + ilk kodla onay. */
function Kurulum() {
  const router = useRouter();
  const istemci = useQueryClient();
  const [kurulum, setKurulum] = useState<IkinciAdimKurulum | null>(null);
  const [yedekOnay, setYedekOnay] = useState(false);
  const [kod, setKod] = useState('');

  const kur = useMutation({
    mutationFn: () => platform.yolla<IkinciAdimKurulum>('ikinci-adim/kur'),
    onSuccess: setKurulum,
  });
  const onayla = useMutation({
    mutationFn: () => platform.yolla<IkinciAdimSonuc>('ikinci-adim/onayla', { kod: kod.trim() }),
    onSuccess: async () => {
      await istemci.invalidateQueries({ queryKey: BEN_ANAHTARI });
      router.replace('/kurumlar');
    },
  });

  if (!kurulum) {
    return (
      <div className="flex flex-col gap-4 rounded-buyuk border border-kenar bg-yuzey p-5">
        <p className="text-sm text-metin-ikincil">{t('yonetim.ikinciAdim.aciklamaKur')}</p>
        {kur.error ? <Uyari ton="hata" baslik={hataMetni(kur.error)} /> : null}
        <Dugme
          className="self-start"
          disabled={kur.isPending}
          onClick={() => {
            kur.mutate();
          }}
        >
          {t('yonetim.ikinciAdim.kurBaslat')}
        </Dugme>
      </div>
    );
  }

  const yedekMetni = kurulum.yedek_kodlar.join('\n');
  const indir = () => {
    const url = URL.createObjectURL(new Blob([`${yedekMetni}\n`], { type: 'text/plain' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'kopru-yedek-kodlar.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  const gonder = (e: { preventDefault: () => void }) => {
    e.preventDefault();
    onayla.mutate();
  };

  return (
    <div className="flex flex-col gap-6">
      <section
        aria-labelledby="adim1"
        className="flex flex-col gap-3 rounded-buyuk border border-kenar bg-yuzey p-5"
      >
        <h2 id="adim1" className="font-semibold">
          {t('yonetim.ikinciAdim.adim1')}
        </h2>
        <QrKod deger={kurulum.otpauth_uri} />
        <p className="text-sm text-metin-ikincil">{t('yonetim.ikinciAdim.qrAciklama')}</p>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">{t('yonetim.ikinciAdim.sirEtiketi')}:</span>
          <code className="rounded-kucuk bg-yuzey-ikincil px-2 py-1 text-sm break-all">
            {kurulum.sir}
          </code>
          <KopyalaDugmesi metin={kurulum.sir} etiket={t('yonetim.ortak.kopyala')} />
        </div>
      </section>

      <section
        aria-labelledby="adim2"
        className="flex flex-col gap-3 rounded-buyuk border border-kenar bg-yuzey p-5"
      >
        <h2 id="adim2" className="font-semibold">
          {t('yonetim.ikinciAdim.adim2')}
        </h2>
        <p className="text-sm text-metin-ikincil">{t('yonetim.ikinciAdim.yedekAciklama')}</p>
        <ul
          className="grid grid-cols-2 gap-2 font-mono text-sm"
          aria-label={t('yonetim.ikinciAdim.adim2')}
        >
          {kurulum.yedek_kodlar.map((k) => (
            <li key={k} className="rounded-kucuk bg-yuzey-ikincil px-2 py-1">
              {k}
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-2">
          <KopyalaDugmesi metin={yedekMetni} etiket={t('yonetim.ikinciAdim.yedekKopyala')} />
          <Dugme gorunum="ikincil" boyut="sm" onClick={indir}>
            <Download aria-hidden />
            {t('yonetim.ikinciAdim.yedekIndir')}
          </Dugme>
        </div>
        <div className="flex items-start gap-2">
          <input
            id="yedek-onay"
            type="checkbox"
            checked={yedekOnay}
            onChange={(e) => {
              setYedekOnay(e.target.checked);
            }}
            className="mt-1 size-4"
          />
          <label htmlFor="yedek-onay" className="text-sm">
            {t('yonetim.ikinciAdim.yedekOnay')}
          </label>
        </div>
      </section>

      <form
        onSubmit={gonder}
        aria-labelledby="adim3"
        className="flex flex-col gap-3 rounded-buyuk border border-kenar bg-yuzey p-5"
      >
        <h2 id="adim3" className="font-semibold">
          {t('yonetim.ikinciAdim.adim3')}
        </h2>
        <Alan
          etiket={t('yonetim.ikinciAdim.kodEtiketi')}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={8}
          value={kod}
          onChange={(e) => {
            setKod(e.target.value);
          }}
          required
        />
        {onayla.error ? <Uyari ton="hata" baslik={hataMetni(onayla.error)} /> : null}
        <Dugme
          type="submit"
          className="self-start"
          disabled={onayla.isPending || !yedekOnay || kod.trim().length < 6}
        >
          {t('yonetim.ikinciAdim.onaylaVeBitir')}
        </Dugme>
      </form>
    </div>
  );
}

/** `/dogrulama`: kurulu degilse kurulum, kuruluysa kod girisi; dogrulanmissa panele. */
export function IkinciAdimSayfasi() {
  const router = useRouter();
  const ben = useBen();
  const dogrulandi = ben.data?.ikinci_adim.oturumda_dogrulandi === true;

  useEffect(() => {
    if (dogrulandi) router.replace('/kurumlar');
  }, [dogrulandi, router]);

  if (ben.isPending || dogrulandi) {
    return (
      <Sayfa>
        <p role="status" className="text-metin-ikincil">
          {t('yonetim.ortak.yukleniyor')}
        </p>
      </Sayfa>
    );
  }
  if (ben.error) {
    return (
      <KapiHatasi
        hata={ben.error}
        onYenile={() => {
          void ben.refetch();
        }}
      />
    );
  }
  return (
    <Sayfa>
      {ben.data.ikinci_adim.kurulu ? (
        <KodGirisi yedekKalan={ben.data.ikinci_adim.yedek_kod_kalan} />
      ) : (
        <Kurulum />
      )}
    </Sayfa>
  );
}
