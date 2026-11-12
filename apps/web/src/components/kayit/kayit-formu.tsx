'use client';

import { KaynakEkleYanitSema } from '@kopru/contracts';
import { t } from '@kopru/i18n';
import { useMutation } from '@tanstack/react-query';
import { TriangleAlert } from 'lucide-react';
import { useId, useMemo, useState, type SyntheticEvent } from 'react';

import { SaglayiciIkonu } from './saglayici-etiketi';

import { KonuSecici } from '@/components/ogrenme/konu-secici';
import { Alan } from '@/components/operasyon/ortak';
import { Dugme } from '@/components/ui/button';
import { OnayKutusu } from '@/components/ui/checkbox';
import { Girdi } from '@/components/ui/input';
import { MetinAlani } from '@/components/ui/metin-alani';
import { Secim } from '@/components/ui/secim';
import { Uyari } from '@/components/ui/uyari';
import { hataMesaji } from '@/lib/api';
import { dersIstek } from '@/lib/hesap-istek';
import {
  baglantilariAyir,
  kayitFormunuHazirla,
  type FormHatalari,
  type Gorunurluk,
  type LinkEki,
} from '@/lib/kayit/form';
import { saglayiciAdi, urlCoz } from '@/lib/kayit/saglayici';
import { useKayitYenile } from '@/lib/kayit/veri';
import { useSaatDilimi } from '@/lib/operasyon-verisi';

export type KayitHedefi = { tur: 'ders'; dersId: string } | { tur: 'materyal'; grupId: string };

export interface OgrenciAdayi {
  id: string;
  ad: string;
}

const BOS_HATALAR: FormHatalari = { linkler: {} };

/**
 * Kayit/materyal ekleme formu: baglantilari yapistir (birden cok olabilir, her biri yeni satirda),
 * saglayici aninda taninir, Kaydet. En az tiklama: varsayilan gorunurluk "grup", basliklar otomatik.
 */
export function KayitFormu({
  kurumId,
  hedef,
  brans,
  adaylar,
  vazgec,
  bitti,
}: {
  kurumId: string;
  hedef: KayitHedefi;
  brans?: string | undefined;
  /** "Secili ogrenciler" icin aday listesi (dersin katilimcilari ya da grubun uyeleri). */
  adaylar: readonly OgrenciAdayi[];
  vazgec?: () => void;
  bitti: (adet: number) => void;
}) {
  const kimlik = useId();
  const { saatDilimi } = useSaatDilimi(kurumId);
  const yenile = useKayitYenile(kurumId);
  const [metin, setMetin] = useState('');
  const [ekler, setEkler] = useState<Record<string, LinkEki>>({});
  const [sonErisim, setSonErisim] = useState('');
  const [konuId, setKonuId] = useState<string | null>(null);
  const [gorunurluk, setGorunurluk] = useState<Gorunurluk>('grup');
  const [secili, setSecili] = useState<string[]>([]);
  const [hatalar, setHatalar] = useState<FormHatalari>(BOS_HATALAR);

  const linkler = useMemo(
    () => baglantilariAyir(metin).map((url) => ({ url, sonuc: urlCoz(url) })),
    [metin],
  );
  const driveVar = linkler.some((l) => l.sonuc.ok && l.sonuc.saglayici === 'drive');

  const ekle = useMutation({
    mutationFn: (govde: Record<string, unknown>) =>
      dersIstek(
        hedef.tur === 'ders'
          ? `kurumlar/${kurumId}/dersler/${hedef.dersId}/kaynaklar`
          : `kurumlar/${kurumId}/gruplar/${hedef.grupId}/materyaller`,
        { govde, sema: KaynakEkleYanitSema },
      ),
    onSuccess: async (yanit) => {
      await yenile();
      setMetin('');
      setEkler({});
      setSonErisim('');
      setKonuId(null);
      setSecili([]);
      setHatalar(BOS_HATALAR);
      bitti(yanit.kaynaklar.length);
    },
  });

  const gonder = (e: SyntheticEvent) => {
    e.preventDefault();
    const sonuc = kayitFormunuHazirla({
      metin,
      ekler,
      sonErisim,
      gorunurluk,
      ogrenciIdleri: secili,
      konuId,
      tur: hedef.tur === 'ders' ? 'kayit' : 'materyal',
      saatDilimi,
    });
    if (!sonuc.ok) {
      setHatalar(sonuc.hatalar);
      return;
    }
    setHatalar(BOS_HATALAR);
    ekle.mutate(sonuc.govde);
  };

  const ekGuncelle = (url: string, parca: LinkEki) => {
    setEkler((onceki) => ({ ...onceki, [url]: { ...onceki[url], ...parca } }));
  };

  return (
    <form
      onSubmit={gonder}
      noValidate
      aria-label={
        hedef.tur === 'ders'
          ? t('kayitGeriBildirim.form.kayitEkle')
          : t('kayitGeriBildirim.form.materyalEkle')
      }
      className="flex flex-col gap-4 rounded-orta border border-kenar bg-yuzey-ikincil/40 p-4"
    >
      <Alan
        etiket={t('kayitGeriBildirim.form.baglantilar')}
        yardim={t('kayitGeriBildirim.form.baglantilarYardim')}
        hata={hatalar.genel}
      >
        {(o) => (
          <MetinAlani
            {...o}
            rows={3}
            autoFocus
            spellCheck={false}
            autoComplete="off"
            placeholder="https://"
            value={metin}
            onChange={(e) => {
              setMetin(e.target.value);
              setHatalar(BOS_HATALAR);
            }}
          />
        )}
      </Alan>

      {driveVar ? (
        <div
          role="note"
          className="flex items-start gap-2 rounded-orta bg-uyari-yumusak px-3 py-2.5 text-sm"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{t('kayitGeriBildirim.form.driveUyari')}</span>
        </div>
      ) : null}

      {linkler.length > 0 ? (
        <ul className="flex flex-col gap-3" aria-label={t('kayitGeriBildirim.form.taninanlar')}>
          {linkler.map(({ url, sonuc }, i) => (
            <li
              key={url}
              className="flex flex-col gap-2 rounded-orta border border-kenar bg-yuzey p-3"
            >
              <div className="flex min-w-0 items-center gap-2 text-sm">
                {sonuc.ok ? (
                  <>
                    <SaglayiciIkonu saglayici={sonuc.saglayici} />
                    <span className="font-medium">{saglayiciAdi(sonuc.saglayici)}</span>
                  </>
                ) : (
                  <TriangleAlert className="size-5 text-hata" aria-hidden />
                )}
                <span className="min-w-0 truncate text-metin-ikincil">{url}</span>
              </div>
              {hatalar.linkler[url] ? (
                <p className="text-sm text-hata" role="alert">
                  {hatalar.linkler[url]}
                </p>
              ) : null}
              {sonuc.ok ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <Alan etiket={t('kayitGeriBildirim.form.baslik', { sira: i + 1 })}>
                    {(o) => (
                      <Girdi
                        {...o}
                        maxLength={200}
                        placeholder={t('kayitGeriBildirim.form.baslikYer')}
                        value={ekler[url]?.baslik ?? ''}
                        onChange={(e) => {
                          ekGuncelle(url, { baslik: e.target.value });
                        }}
                      />
                    )}
                  </Alan>
                  {sonuc.saglayici === 'zoom' ? (
                    <Alan etiket={t('kayitGeriBildirim.form.parola', { sira: i + 1 })}>
                      {(o) => (
                        <Girdi
                          {...o}
                          maxLength={200}
                          autoComplete="off"
                          value={ekler[url]?.parola ?? ''}
                          onChange={(e) => {
                            ekGuncelle(url, { parola: e.target.value });
                          }}
                        />
                      )}
                    </Alan>
                  ) : null}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      <Alan etiket={t('kayitGeriBildirim.form.gorunurluk')}>
        {(o) => (
          <Secim
            {...o}
            value={gorunurluk}
            onChange={(e) => {
              setGorunurluk(e.target.value as Gorunurluk);
            }}
          >
            <option value="grup">{t('kayitGeriBildirim.gorunurluk.grup')}</option>
            <option value="secili_ogrenciler">
              {t('kayitGeriBildirim.gorunurluk.secili_ogrenciler')}
            </option>
            <option value="ogretmen">{t('kayitGeriBildirim.gorunurluk.ogretmen')}</option>
          </Secim>
        )}
      </Alan>

      {gorunurluk === 'secili_ogrenciler' ? (
        <fieldset className="flex flex-col gap-1">
          <legend className="mb-1 text-sm font-medium">
            {t('kayitGeriBildirim.form.ogrenciler')}
          </legend>
          {adaylar.length === 0 ? (
            <p className="text-sm text-metin-ikincil">{t('kayitGeriBildirim.form.ogrenciYok')}</p>
          ) : (
            <ul className="grid gap-1 sm:grid-cols-2">
              {adaylar.map((a) => {
                const id = `${kimlik}-${a.id}`;
                return (
                  <li key={a.id} className="flex min-h-11 items-center gap-3">
                    <OnayKutusu
                      id={id}
                      checked={secili.includes(a.id)}
                      onCheckedChange={(acik) => {
                        setSecili((onceki) =>
                          acik === true ? [...onceki, a.id] : onceki.filter((x) => x !== a.id),
                        );
                      }}
                    />
                    <label htmlFor={id} className="flex-1 text-sm">
                      {a.ad || t('operasyon.ortak.adsiz')}
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
          {hatalar.ogrenciler ? (
            <p className="text-sm text-hata" role="alert">
              {hatalar.ogrenciler}
            </p>
          ) : null}
        </fieldset>
      ) : null}

      <details className="rounded-orta border border-kenar bg-yuzey px-3 py-2">
        <summary className="min-h-9 cursor-pointer py-1.5 text-sm font-medium">
          {t('kayitGeriBildirim.form.ayrintilar')}
        </summary>
        <div className="mt-3 flex flex-col gap-4 pb-2">
          <Alan
            etiket={t('kayitGeriBildirim.form.sonErisim')}
            yardim={t('kayitGeriBildirim.form.sonErisimYardim')}
            hata={hatalar.sonErisim}
          >
            {(o) => (
              <Girdi
                {...o}
                type="date"
                value={sonErisim}
                onChange={(e) => {
                  setSonErisim(e.target.value);
                }}
              />
            )}
          </Alan>
          <KonuSecici
            kurumId={kurumId}
            deger={konuId}
            brans={brans}
            degisti={(k) => {
              setKonuId(k?.id ?? null);
            }}
          />
        </div>
      </details>

      {ekle.isError ? <Uyari>{hataMesaji(ekle.error)}</Uyari> : null}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {vazgec ? (
          <Dugme type="button" gorunum="ikincil" onClick={vazgec} disabled={ekle.isPending}>
            {t('ortak.vazgec')}
          </Dugme>
        ) : null}
        <Dugme type="submit" disabled={ekle.isPending}>
          {ekle.isPending ? t('operasyon.ortak.kaydediliyor') : t('kayitGeriBildirim.form.kaydet')}
        </Dugme>
      </div>
    </form>
  );
}
