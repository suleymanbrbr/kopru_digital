'use client';

import { FaturaBilgisiYanitSema } from '@kopru/contracts';
import { t } from '@kopru/i18n';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type Ref } from 'react';
import type { z } from 'zod';

import { BildirimKutusu, basari, basarisiz, type Bildirim } from '@/components/hesap/ortak';
import { Alan } from '@/components/operasyon/ortak';
import { Dugme } from '@/components/ui/button';
import { OnayKutusu } from '@/components/ui/checkbox';
import { Girdi } from '@/components/ui/input';
import { Kart } from '@/components/ui/kart';
import {
  faturaFormunuDogrula,
  type FaturaFormHatalari,
  type FaturaFormu as Form,
} from '@/lib/abonelik/bicim';
import { faturaBilgisiAnahtari } from '@/lib/abonelik/veri';
import { abonelikIstek } from '@/lib/hesap-istek';

type Kayitli = z.output<typeof FaturaBilgisiYanitSema>['fatura_bilgisi'];

function baslangic(f: Kayitli): Form {
  return {
    unvan: f?.unvan ?? '',
    vergiNo: f?.vergi_no ?? '',
    vergiDairesi: f?.vergi_dairesi ?? '',
    satir: f?.adres.satir ?? '',
    ilce: f?.adres.ilce ?? '',
    il: f?.adres.il ?? '',
    postaKodu: f?.adres.posta_kodu ?? '',
    eposta: f?.eposta ?? '',
    eFatura: f?.e_fatura_mukellefi ?? false,
  };
}

/** Fatura alici bilgileri (VKN/TCKN sağlama basamagi dahil dogrulanir). Ilk deger yuklenen kayittan alinir; kayittan sonra form durumu korunur. */
export function FaturaFormu({
  kurumId,
  kayitli,
  formRef,
  uyari,
}: {
  kurumId: string;
  kayitli: Kayitli;
  formRef?: Ref<HTMLElement>;
  /** Odeme baslatilamadiginda ("once fatura bilgisi") gosterilen uyari. */
  uyari?: string | null;
}) {
  const qc = useQueryClient();
  const [f, setF] = useState<Form>(() => baslangic(kayitli));
  const [hatalar, setHatalar] = useState<FaturaFormHatalari>({});
  const [bildirim, setBildirim] = useState<Bildirim>(null);

  const kaydet = useMutation({
    mutationFn: (g: Form) =>
      abonelikIstek(`kurumlar/${kurumId}/fatura-bilgileri`, {
        yontem: 'PUT',
        sema: FaturaBilgisiYanitSema,
        govde: {
          unvan: g.unvan.trim(),
          vergi_no: g.vergiNo.trim(),
          vergi_dairesi: g.vergiDairesi.trim() || null,
          adres: {
            satir: g.satir.trim(),
            ilce: g.ilce.trim(),
            il: g.il.trim(),
            ...(g.postaKodu.trim() ? { posta_kodu: g.postaKodu.trim() } : {}),
          },
          eposta: g.eposta.trim(),
          e_fatura_mukellefi: g.eFatura,
        },
      }),
    onSuccess: async () => {
      setBildirim(basari(t('abonelik.fatura.kaydedildi')));
      await qc.invalidateQueries({ queryKey: faturaBilgisiAnahtari(kurumId) });
    },
    onError: (hata) => {
      setBildirim(basarisiz(hata));
    },
  });

  const ayarla = <K extends keyof Form>(alan: K, deger: Form[K]) => {
    setF((onceki) => ({ ...onceki, [alan]: deger }));
  };

  function gonder(olay: React.SyntheticEvent) {
    olay.preventDefault();
    const h = faturaFormunuDogrula(f);
    setHatalar(h);
    setBildirim(null);
    if (Object.keys(h).length > 0) return;
    kaydet.mutate(f);
  }

  const hata = (k: keyof FaturaFormHatalari) =>
    hatalar[k] ? t(`abonelik.fatura.hata.${k}`) : undefined;

  return (
    <Kart aria-labelledby="abonelik-fatura" className="p-5" ref={formRef} tabIndex={-1}>
      <h2 id="abonelik-fatura" className="text-lg font-semibold">
        {t('abonelik.fatura.baslik')}
      </h2>
      <p className="mb-4 text-sm text-metin-ikincil">{t('abonelik.fatura.aciklama')}</p>
      <form onSubmit={gonder} noValidate className="grid gap-4 sm:grid-cols-2">
        {uyari ? (
          <div className="sm:col-span-2">
            <BildirimKutusu bildirim={{ tur: 'hata', metin: uyari }} />
          </div>
        ) : null}
        <Alan etiket={t('abonelik.fatura.unvan')} hata={hata('unvan')} className="sm:col-span-2">
          {(o) => (
            <Girdi
              {...o}
              value={f.unvan}
              maxLength={300}
              autoComplete="organization"
              onChange={(e) => {
                ayarla('unvan', e.target.value);
              }}
            />
          )}
        </Alan>
        <Alan
          etiket={t('abonelik.fatura.vergiNo')}
          yardim={t('abonelik.fatura.vergiNoYardim')}
          hata={hata('vergiNo')}
        >
          {(o) => (
            <Girdi
              {...o}
              value={f.vergiNo}
              inputMode="numeric"
              maxLength={11}
              onChange={(e) => {
                ayarla('vergiNo', e.target.value.replace(/\D/g, ''));
              }}
            />
          )}
        </Alan>
        <Alan etiket={t('abonelik.fatura.vergiDairesi')}>
          {(o) => (
            <Girdi
              {...o}
              value={f.vergiDairesi}
              maxLength={100}
              onChange={(e) => {
                ayarla('vergiDairesi', e.target.value);
              }}
            />
          )}
        </Alan>
        <Alan etiket={t('abonelik.fatura.adres')} hata={hata('adres')} className="sm:col-span-2">
          {(o) => (
            <Girdi
              {...o}
              value={f.satir}
              maxLength={300}
              autoComplete="street-address"
              onChange={(e) => {
                ayarla('satir', e.target.value);
              }}
            />
          )}
        </Alan>
        <Alan etiket={t('abonelik.fatura.ilce')} hata={hata('ilce')}>
          {(o) => (
            <Girdi
              {...o}
              value={f.ilce}
              maxLength={100}
              onChange={(e) => {
                ayarla('ilce', e.target.value);
              }}
            />
          )}
        </Alan>
        <Alan etiket={t('abonelik.fatura.il')} hata={hata('il')}>
          {(o) => (
            <Girdi
              {...o}
              value={f.il}
              maxLength={100}
              autoComplete="address-level1"
              onChange={(e) => {
                ayarla('il', e.target.value);
              }}
            />
          )}
        </Alan>
        <Alan etiket={t('abonelik.fatura.postaKodu')} hata={hata('postaKodu')}>
          {(o) => (
            <Girdi
              {...o}
              value={f.postaKodu}
              inputMode="numeric"
              maxLength={5}
              autoComplete="postal-code"
              onChange={(e) => {
                ayarla('postaKodu', e.target.value.replace(/\D/g, ''));
              }}
            />
          )}
        </Alan>
        <Alan etiket={t('abonelik.fatura.eposta')} hata={hata('eposta')}>
          {(o) => (
            <Girdi
              {...o}
              type="email"
              value={f.eposta}
              maxLength={320}
              autoComplete="email"
              onChange={(e) => {
                ayarla('eposta', e.target.value);
              }}
            />
          )}
        </Alan>
        <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm sm:col-span-2">
          <OnayKutusu
            checked={f.eFatura}
            onCheckedChange={(d) => {
              ayarla('eFatura', d === true);
            }}
          />
          {t('abonelik.fatura.eFatura')}
        </label>
        <div className="flex flex-col gap-3 sm:col-span-2">
          <BildirimKutusu bildirim={bildirim} />
          <div>
            <Dugme type="submit" disabled={kaydet.isPending}>
              {kaydet.isPending ? t('ortak.yukleniyor') : t('abonelik.fatura.kaydet')}
            </Dugme>
          </div>
        </div>
      </form>
    </Kart>
  );
}
