'use client';

import type { KaynakDetaySema } from '@kopru/contracts';
import { t } from '@kopru/i18n';
import { useMutation } from '@tanstack/react-query';
import { useId, useMemo, useState, type SyntheticEvent } from 'react';
import type { z } from 'zod';

import type { Kaynak } from './kaynak-karti';

import { HataDurumu } from '@/components/hata-durumu';
import { KonuSecici } from '@/components/ogrenme/konu-secici';
import { Alan } from '@/components/operasyon/ortak';
import { Dugme } from '@/components/ui/button';
import { OnayKutusu } from '@/components/ui/checkbox';
import { Girdi } from '@/components/ui/input';
import { Iskelet } from '@/components/ui/kart';
import { Pencere } from '@/components/ui/pencere';
import { Secim } from '@/components/ui/secim';
import { Uyari } from '@/components/ui/uyari';
import { hataMesaji } from '@/lib/api';
import { dersIstek } from '@/lib/hesap-istek';
import type { Gorunurluk } from '@/lib/kayit/form';
import { urlCoz } from '@/lib/kayit/saglayici';
import { useGrupUyeleri, useKayitYenile, useKaynakDetay } from '@/lib/kayit/veri';
import { useSaatDilimi } from '@/lib/operasyon-verisi';
import { yerelTarih, yerelUtc } from '@/lib/saat';

type Detay = z.infer<typeof KaynakDetaySema>;

export function KaynakDuzenle({
  kurumId,
  kaynak,
  kapat,
  bitti,
}: {
  kurumId: string;
  kaynak: Kaynak;
  kapat: () => void;
  bitti: () => void;
}) {
  const detay = useKaynakDetay(kurumId, kaynak.id);
  return (
    <Pencere
      acik
      degisti={(a) => {
        if (!a) kapat();
      }}
      genis
      baslik={t('kayitGeriBildirim.duzenle.baslik')}
    >
      {detay.isPending ? (
        <div role="status" aria-label={t('ortak.yukleniyor')} className="flex flex-col gap-3">
          <Iskelet className="h-10 w-full" />
          <Iskelet className="h-10 w-full" />
        </div>
      ) : detay.isError ? (
        <HataDurumu
          baslik={t('kayitGeriBildirim.duzenle.yuklenemedi')}
          aciklama={hataMesaji(detay.error)}
          tekrarDene={() => void detay.refetch()}
          className="py-6"
        />
      ) : (
        <Form kurumId={kurumId} kaynak={detay.data} kapat={kapat} bitti={bitti} />
      )}
    </Pencere>
  );
}

function Form({
  kurumId,
  kaynak: k,
  kapat,
  bitti,
}: {
  kurumId: string;
  kaynak: Detay;
  kapat: () => void;
  bitti: () => void;
}) {
  const kimlik = useId();
  const { saatDilimi } = useSaatDilimi(kurumId);
  const yenile = useKayitYenile(kurumId);
  const uyeler = useGrupUyeleri(kurumId, k.grup_id);
  const adaylar = useMemo(
    () =>
      (uyeler.data?.uyeler ?? [])
        .filter((u) => u.bitis_tarihi === null)
        .map((u) => ({ id: u.ogrenci_id, ad: u.gorunen_ad ?? '' })),
    [uyeler.data],
  );
  const ilkTarih = k.gecerlilik_bitis_at ? yerelTarih(k.gecerlilik_bitis_at, saatDilimi) : '';
  const [baslik, setBaslik] = useState(k.baslik);
  const [url, setUrl] = useState(k.url);
  const [parola, setParola] = useState(k.parola ?? '');
  const [tarih, setTarih] = useState(ilkTarih);
  const [gorunurluk, setGorunurluk] = useState<Gorunurluk>(k.gorunurluk);
  const [secili, setSecili] = useState<string[]>(k.ogrenci_idleri ?? []);
  const [konuId, setKonuId] = useState<string | null>(k.konu_id);
  const [hata, setHata] = useState<string | null>(null);

  const kaydet = useMutation({
    mutationFn: (govde: Record<string, unknown>) =>
      dersIstek(`kurumlar/${kurumId}/kaynaklar/${k.id}`, { yontem: 'PATCH', govde }),
    onSuccess: async () => {
      await yenile();
      bitti();
    },
  });

  const gonder = (e: SyntheticEvent) => {
    e.preventDefault();
    const govde: Record<string, unknown> = {};
    const temizBaslik = baslik.trim();
    if (temizBaslik.length === 0) {
      setHata(t('kayitGeriBildirim.duzenle.hata.baslik'));
      return;
    }
    if (temizBaslik !== k.baslik) govde.baslik = temizBaslik;
    if (url.trim() !== k.url) {
      const sonuc = urlCoz(url);
      if (!sonuc.ok) {
        setHata(t('kayitGeriBildirim.duzenle.hata.url'));
        return;
      }
      govde.url = sonuc.url;
    }
    if (parola !== (k.parola ?? '')) govde.parola = parola.trim() === '' ? null : parola.trim();
    if (tarih !== ilkTarih) {
      if (tarih !== '' && tarih < yerelTarih(new Date(), saatDilimi)) {
        setHata(t('kayitGeriBildirim.form.hata.tarihGecmis'));
        return;
      }
      govde.gecerlilik_bitis_at = tarih === '' ? null : yerelUtc(tarih, '23:59', saatDilimi);
    }
    if (konuId !== k.konu_id) govde.konu_id = konuId;
    const seciliDegisti =
      gorunurluk === 'secili_ogrenciler' &&
      (secili.length !== (k.ogrenci_idleri ?? []).length ||
        secili.some((s) => !(k.ogrenci_idleri ?? []).includes(s)));
    if (gorunurluk !== k.gorunurluk || seciliDegisti) {
      if (gorunurluk === 'secili_ogrenciler' && secili.length === 0) {
        setHata(t('kayitGeriBildirim.form.hata.ogrenciSec'));
        return;
      }
      govde.gorunurluk = gorunurluk;
      if (gorunurluk === 'secili_ogrenciler') govde.ogrenci_idleri = secili;
    }
    if (Object.keys(govde).length === 0) {
      kapat();
      return;
    }
    setHata(null);
    kaydet.mutate(govde);
  };

  return (
    <form onSubmit={gonder} noValidate className="flex flex-col gap-4">
      <Alan etiket={t('kayitGeriBildirim.duzenle.baslikAlani')}>
        {(o) => (
          <Girdi
            {...o}
            maxLength={200}
            value={baslik}
            onChange={(e) => {
              setBaslik(e.target.value);
            }}
          />
        )}
      </Alan>
      <Alan etiket={t('kayitGeriBildirim.duzenle.url')}>
        {(o) => (
          <Girdi
            {...o}
            type="url"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
            }}
          />
        )}
      </Alan>
      <Alan
        etiket={t('kayitGeriBildirim.duzenle.parola')}
        yardim={t('kayitGeriBildirim.duzenle.parolaYardim')}
      >
        {(o) => (
          <Girdi
            {...o}
            maxLength={200}
            autoComplete="off"
            value={parola}
            onChange={(e) => {
              setParola(e.target.value);
            }}
          />
        )}
      </Alan>
      <Alan
        etiket={t('kayitGeriBildirim.form.sonErisim')}
        yardim={t('kayitGeriBildirim.duzenle.sonErisimYardim')}
      >
        {(o) => (
          <Girdi
            {...o}
            type="date"
            value={tarih}
            onChange={(e) => {
              setTarih(e.target.value);
            }}
          />
        )}
      </Alan>
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
          {uyeler.isPending ? (
            <Iskelet className="h-10 w-full" />
          ) : adaylar.length === 0 ? (
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
        </fieldset>
      ) : null}
      <KonuSecici
        kurumId={kurumId}
        deger={konuId}
        {...(k.brans_kodu ? { brans: k.brans_kodu } : {})}
        degisti={(konu) => {
          setKonuId(konu?.id ?? null);
        }}
      />
      {hata ? <Uyari>{hata}</Uyari> : null}
      {kaydet.isError ? <Uyari>{hataMesaji(kaydet.error)}</Uyari> : null}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Dugme type="button" gorunum="ikincil" onClick={kapat} disabled={kaydet.isPending}>
          {t('ortak.vazgec')}
        </Dugme>
        <Dugme type="submit" disabled={kaydet.isPending}>
          {kaydet.isPending
            ? t('operasyon.ortak.kaydediliyor')
            : t('kayitGeriBildirim.duzenle.kaydet')}
        </Dugme>
      </div>
    </form>
  );
}
