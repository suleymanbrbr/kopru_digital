'use client';

import type { GrupTipi } from '@kopru/contracts';
import { t } from '@kopru/i18n';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useId, useState } from 'react';

import { Dugme } from '@/components/ui/button';
import { Etiket, Girdi } from '@/components/ui/input';
import { Pencere } from '@/components/ui/pencere';
import { Secim } from '@/components/ui/secim';
import { Uyari } from '@/components/ui/uyari';
import { hataMesaji } from '@/lib/api';
import { hesapIstek } from '@/lib/hesap-istek';

const TURLER = ['sinif', 'grup', 'etut', 'birebir'] as const;

/**
 * Grup olustur / duzenle penceresi. `grup` doluysa duzenleme (tur degismez). Pencere kapaninca
 * icerik kaldirilir, bu yuzden her acilista alanlar yeniden kurulur.
 */
export function GrupFormu({
  acik,
  degisti,
  kurumId,
  grup,
  bitti,
}: {
  acik: boolean;
  degisti: (acik: boolean) => void;
  kurumId: string;
  grup: GrupTipi | null;
  bitti: (metin: string) => void;
}) {
  return (
    <Pencere
      acik={acik}
      degisti={degisti}
      baslik={grup ? t('hesap.gruplar.form.duzenleBaslik') : t('hesap.gruplar.form.olusturBaslik')}
    >
      <GrupFormIcerigi degisti={degisti} kurumId={kurumId} grup={grup} bitti={bitti} />
    </Pencere>
  );
}

function GrupFormIcerigi({
  degisti,
  kurumId,
  grup,
  bitti,
}: {
  degisti: (acik: boolean) => void;
  kurumId: string;
  grup: GrupTipi | null;
  bitti: (metin: string) => void;
}) {
  const qc = useQueryClient();
  const kimlik = useId();
  const [ad, setAd] = useState(grup?.ad ?? '');
  const [tur, setTur] = useState<(typeof TURLER)[number]>(
    TURLER.find((x) => x === grup?.tur) ?? 'sinif',
  );
  const [kapasite, setKapasite] = useState(grup?.kapasite != null ? String(grup.kapasite) : '');
  const [hata, setHata] = useState<{ ad?: string; kapasite?: string; genel?: string }>({});

  const kaydet = useMutation({
    mutationFn: (govde: Record<string, unknown>) =>
      grup
        ? hesapIstek(`kurumlar/${kurumId}/gruplar/${grup.id}`, { yontem: 'PATCH', govde })
        : hesapIstek(`kurumlar/${kurumId}/gruplar`, { yontem: 'POST', govde }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['hesap', kurumId, 'gruplar'] });
      degisti(false);
      bitti(
        grup ? t('hesap.gruplar.guncellendi') : t('hesap.gruplar.olusturuldu', { ad: ad.trim() }),
      );
    },
    onError: (e) => {
      setHata({ genel: hataMesaji(e) });
    },
  });

  function gonder(olay: React.SyntheticEvent) {
    olay.preventDefault();
    const yeni: typeof hata = {};
    const temizAd = ad.trim();
    if (!temizAd) yeni.ad = t('hesap.gruplar.form.adGerekli');
    let kap: number | null = null;
    if (kapasite.trim() !== '') {
      kap = Number(kapasite);
      if (!Number.isInteger(kap) || kap < 1 || kap > 500) {
        yeni.kapasite = t('hesap.gruplar.form.kapasiteHata');
      }
    }
    setHata(yeni);
    if (Object.keys(yeni).length > 0) return;

    if (grup) {
      kaydet.mutate({ ad: temizAd, kapasite: kap });
    } else {
      kaydet.mutate({
        tur,
        ad: temizAd,
        ...(tur === 'birebir' ? { kapasite: 1 } : kap !== null ? { kapasite: kap } : {}),
      });
    }
  }

  return (
    <form onSubmit={gonder} noValidate className="flex flex-col gap-4">
      {hata.genel ? <Uyari>{hata.genel}</Uyari> : null}

      <div className="flex flex-col gap-1.5">
        <Etiket htmlFor={`${kimlik}-ad`}>{t('hesap.gruplar.form.ad')}</Etiket>
        <Girdi
          id={`${kimlik}-ad`}
          value={ad}
          maxLength={200}
          placeholder={t('hesap.gruplar.form.adYer')}
          aria-invalid={hata.ad ? true : undefined}
          aria-describedby={hata.ad ? `${kimlik}-ad-hata` : undefined}
          onChange={(e) => {
            setAd(e.target.value);
          }}
        />
        {hata.ad ? (
          <p id={`${kimlik}-ad-hata`} className="text-sm text-hata">
            {hata.ad}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Etiket htmlFor={`${kimlik}-tur`}>{t('hesap.gruplar.form.tur')}</Etiket>
        <Secim
          id={`${kimlik}-tur`}
          value={tur}
          disabled={grup !== null}
          aria-describedby={grup ? `${kimlik}-tur-yardim` : undefined}
          onChange={(e) => {
            setTur(e.target.value as (typeof TURLER)[number]);
          }}
        >
          {TURLER.map((k) => (
            <option key={k} value={k}>
              {t(`hesap.gruplar.tur.${k}`)}
            </option>
          ))}
        </Secim>
        {grup ? (
          <p id={`${kimlik}-tur-yardim`} className="text-sm text-metin-ikincil">
            {t('hesap.gruplar.form.turDegismez')}
          </p>
        ) : null}
      </div>

      {tur !== 'birebir' ? (
        <div className="flex flex-col gap-1.5">
          <Etiket htmlFor={`${kimlik}-kap`}>{t('hesap.gruplar.form.kapasite')}</Etiket>
          <Girdi
            id={`${kimlik}-kap`}
            type="number"
            inputMode="numeric"
            min={1}
            max={500}
            value={kapasite}
            aria-invalid={hata.kapasite ? true : undefined}
            aria-describedby={hata.kapasite ? `${kimlik}-kap-hata` : undefined}
            onChange={(e) => {
              setKapasite(e.target.value);
            }}
          />
          {hata.kapasite ? (
            <p id={`${kimlik}-kap-hata`} className="text-sm text-hata">
              {hata.kapasite}
            </p>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-metin-ikincil">{t('hesap.gruplar.form.kapasiteYardim')}</p>
      )}

      <div className="mt-1 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Dugme
          type="button"
          gorunum="ikincil"
          onClick={() => {
            degisti(false);
          }}
        >
          {t('hesap.ortak.vazgec')}
        </Dugme>
        <Dugme type="submit" disabled={kaydet.isPending}>
          {kaydet.isPending
            ? grup
              ? t('hesap.ortak.kaydediliyor')
              : t('hesap.gruplar.form.olusturuluyor')
            : grup
              ? t('hesap.ortak.kaydet')
              : t('hesap.gruplar.olustur')}
        </Dugme>
      </div>
    </form>
  );
}
