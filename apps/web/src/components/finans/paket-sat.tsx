'use client';

import { PaketSatisYanitSema } from '@kopru/contracts';
import { kurusBicimle, t } from '@kopru/i18n';
import { useMutation } from '@tanstack/react-query';
import { useState, type SyntheticEvent } from 'react';

import { usePaketler, useFinansYenile } from './finans-verisi';

import { basari, type Bildirim } from '@/components/hesap/ortak';
import { Alan } from '@/components/operasyon/ortak';
import { Dugme } from '@/components/ui/button';
import { Girdi } from '@/components/ui/input';
import { Pencere } from '@/components/ui/pencere';
import { Secim } from '@/components/ui/secim';
import { Uyari } from '@/components/ui/uyari';
import { hataMesaji, UygulamaHatasi } from '@/lib/api';
import { finansIstek } from '@/lib/hesap-istek';
import { tutarCoz } from '@/lib/operasyon';

type OdemeTuru = 'tamami' | 'kismi' | 'sonra';
const YONTEMLER = ['nakit', 'havale', 'kart'] as const;

export function PaketSat({
  acik,
  degisti,
  kurumId,
  ogrenciId,
  ogrenciAdi,
  bitti,
}: {
  acik: boolean;
  degisti: (acik: boolean) => void;
  kurumId: string;
  ogrenciId: string;
  ogrenciAdi: string;
  bitti: (b: Bildirim) => void;
}) {
  return (
    <Pencere
      acik={acik}
      degisti={degisti}
      baslik={t('operasyon.finans.paketSat.baslik')}
      aciklama={t('operasyon.finans.paketSat.aciklama', { ad: ogrenciAdi })}
    >
      <Icerik
        kurumId={kurumId}
        ogrenciId={ogrenciId}
        kapat={() => {
          degisti(false);
        }}
        bitti={bitti}
      />
    </Pencere>
  );
}

function Icerik({
  kurumId,
  ogrenciId,
  kapat,
  bitti,
}: {
  kurumId: string;
  ogrenciId: string;
  kapat: () => void;
  bitti: (b: Bildirim) => void;
}) {
  const yenile = useFinansYenile(kurumId);
  const paketler = usePaketler(kurumId);
  const [paketId, setPaketId] = useState('');
  const [odeme, setOdeme] = useState<OdemeTuru>('tamami');
  const [tutar, setTutar] = useState('');
  const [yontem, setYontem] = useState<(typeof YONTEMLER)[number]>('nakit');
  const [hatalar, setHatalar] = useState<{ paket?: string; tutar?: string }>({});
  const [modelDegisti, setModelDegisti] = useState(false);

  const secili = paketler.data?.paketler.find((p) => p.id === paketId);

  const sat = useMutation({
    mutationFn: (govde: Record<string, unknown>) =>
      finansIstek(`kurumlar/${kurumId}/paket-satislari`, {
        yontem: 'POST',
        govde,
        sema: PaketSatisYanitSema,
      }),
    onSuccess: (s) => {
      void yenile();
      bitti(basari(t('operasyon.finans.paketSat.satildi', { sayi: s.kalan_kredi })));
      kapat();
    },
  });

  const modeliDegistir = useMutation({
    mutationFn: () =>
      finansIstek(`kurumlar/${kurumId}/ogrenciler/${ogrenciId}/finans-profili`, {
        yontem: 'PUT',
        govde: { model: 'paket' },
      }),
    onSuccess: () => {
      void yenile();
      setModelDegisti(true);
      sat.reset();
    },
  });

  const gonder = (e: SyntheticEvent) => {
    e.preventDefault();
    const h: { paket?: string; tutar?: string } = {};
    if (!secili) h.paket = t('operasyon.finans.paketSat.hata.paket');
    let odemeGovde: Record<string, unknown> = { tur: 'sonra' };
    if (odeme !== 'sonra') {
      if (odeme === 'tamami') {
        odemeGovde = { tur: 'tamami', yontem };
      } else {
        const c = tutarCoz(tutar);
        if (!c.ok) h.tutar = t('operasyon.finans.paketSat.hata.tutar');
        else if (c.kurus >= (secili?.fiyat_kurus ?? Infinity)) {
          h.tutar = t('operasyon.finans.paketSat.hata.kismiFazla');
        } else odemeGovde = { tur: 'kismi', tutar_kurus: c.kurus, yontem };
      }
    }
    setHatalar(h);
    if (Object.keys(h).length > 0 || !secili) return;
    setModelDegisti(false);
    sat.mutate({ ogrenci_id: ogrenciId, paket_id: secili.id, odeme: odemeGovde });
  };

  const modelHatasi =
    sat.error instanceof UygulamaHatasi && sat.error.kod === 'ogrenci_modeli_paket_degil';
  const paketYok = paketler.data?.paketler.length === 0;

  return (
    <form onSubmit={gonder} noValidate className="flex flex-col gap-4">
      <Alan etiket={t('operasyon.finans.paketSat.paket')} hata={hatalar.paket}>
        {(o) => (
          <Secim
            {...o}
            value={paketId}
            disabled={paketler.isPending}
            onChange={(e) => {
              setPaketId(e.target.value);
            }}
          >
            <option value="">{t('operasyon.finans.paketSat.paketSec')}</option>
            {paketler.data?.paketler.map((p) => (
              <option key={p.id} value={p.id}>
                {t('operasyon.finans.paketSat.paketSecenek', {
                  ad: p.ad,
                  kredi: p.kredi_adedi,
                  fiyat: kurusBicimle(p.fiyat_kurus),
                })}
              </option>
            ))}
          </Secim>
        )}
      </Alan>
      {paketYok ? (
        <p className="text-sm text-metin-ikincil">{t('operasyon.finans.paketSat.paketYok')}</p>
      ) : null}

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">{t('operasyon.finans.paketSat.odeme')}</legend>
        {(['tamami', 'kismi', 'sonra'] as const).map((o) => (
          <label
            key={o}
            className="flex min-h-11 cursor-pointer items-center gap-3 rounded-orta border border-kenar px-3 text-sm has-[:checked]:border-birincil has-[:checked]:bg-birincil-yumusak"
          >
            <input
              type="radio"
              name="odeme-turu"
              value={o}
              checked={odeme === o}
              className="size-4 accent-[var(--birincil)]"
              onChange={() => {
                setOdeme(o);
              }}
            />
            {t(`operasyon.finans.paketSat.${o}`)}
            {o === 'tamami' && secili ? ` (${kurusBicimle(secili.fiyat_kurus)})` : ''}
          </label>
        ))}
      </fieldset>

      {odeme === 'kismi' ? (
        <Alan etiket={t('operasyon.finans.paketSat.tutar')} hata={hatalar.tutar}>
          {(o) => (
            <Girdi
              {...o}
              inputMode="decimal"
              autoComplete="off"
              value={tutar}
              onChange={(e) => {
                setTutar(e.target.value);
              }}
            />
          )}
        </Alan>
      ) : null}
      {odeme !== 'sonra' ? (
        <Alan etiket={t('operasyon.finans.paketSat.yontem')}>
          {(o) => (
            <Secim
              {...o}
              value={yontem}
              onChange={(e) => {
                setYontem(e.target.value as typeof yontem);
              }}
            >
              {YONTEMLER.map((y) => (
                <option key={y} value={y}>
                  {t(`operasyon.finans.yontem.${y}`)}
                </option>
              ))}
            </Secim>
          )}
        </Alan>
      ) : null}

      {modelHatasi ? (
        <div role="alert" className="flex flex-col gap-2 rounded-orta bg-uyari-yumusak p-3 text-sm">
          <p>{t('operasyon.finans.paketSat.modelOnerAciklama')}</p>
          <Dugme
            type="button"
            boyut="sm"
            gorunum="ikincil"
            className="self-start"
            disabled={modeliDegistir.isPending}
            onClick={() => {
              modeliDegistir.mutate();
            }}
          >
            {t('operasyon.finans.paketSat.modelOner')}
          </Dugme>
        </div>
      ) : sat.isError ? (
        <Uyari>{hataMesaji(sat.error)}</Uyari>
      ) : null}
      {modeliDegistir.isError ? <Uyari>{hataMesaji(modeliDegistir.error)}</Uyari> : null}
      {modelDegisti ? (
        <p role="status" className="rounded-orta bg-basari-yumusak px-3 py-2.5 text-sm">
          {t('operasyon.finans.paketSat.modelDegisti')}
        </p>
      ) : null}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Dugme type="button" gorunum="ikincil" onClick={kapat} disabled={sat.isPending}>
          {t('operasyon.ortak.vazgec')}
        </Dugme>
        <Dugme type="submit" disabled={sat.isPending}>
          {sat.isPending
            ? t('operasyon.finans.paketSat.satiliyor')
            : t('operasyon.finans.paketSat.sat')}
        </Dugme>
      </div>
    </form>
  );
}
