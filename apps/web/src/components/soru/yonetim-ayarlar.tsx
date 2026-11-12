'use client';

import { SORU_SES_EN_FAZLA_SN, SoruAyarlariSema } from '@kopru/contracts';
import { t } from '@kopru/i18n';
import { useMutation } from '@tanstack/react-query';
import { useState, type SyntheticEvent } from 'react';
import type { z } from 'zod';

import { HataDurumu } from '@/components/hata-durumu';
import {
  BildirimKutusu,
  ListeIskeleti,
  basari,
  basarisiz,
  type Bildirim,
} from '@/components/hesap/ortak';
import { Alan } from '@/components/operasyon/ortak';
import { Dugme } from '@/components/ui/button';
import { Girdi } from '@/components/ui/input';
import { useKurum } from '@/kurum/baglam';
import { hataMesaji } from '@/lib/api';
import { ogrenmeIstek } from '@/lib/hesap-istek';
import { useSoruAyarlari, useSoruYenile } from '@/lib/soru/veri';

type SoruAyarlari = z.output<typeof SoruAyarlariSema>;

interface Form {
  gunlukSinirsiz: boolean;
  gunluk: string;
  aylikSinirsiz: boolean;
  aylik: string;
  takip: string;
  ses: string;
  saklama: string;
}

function formdan(a: SoruAyarlari): Form {
  return {
    gunlukSinirsiz: a.gunluk_soru_limiti === null,
    gunluk: String(a.gunluk_soru_limiti ?? 3),
    aylikSinirsiz: a.aylik_soru_limiti === null,
    aylik: String(a.aylik_soru_limiti ?? 60),
    takip: String(a.soru_basina_takip_limiti),
    ses: String(a.ses_azami_sn),
    saklama: String(a.foto_saklama_gun),
  };
}

const tamSayi = (s: string): number | null => (/^\d+$/.test(s.trim()) ? Number(s) : null);

/** Soru ayarlari: gunluk/aylik kota (varsayilan gunde 3), takip siniri, ses suresi ve fotograf saklama. */
export function YonetimAyarlar() {
  const { uyelik } = useKurum();
  const q = useSoruAyarlari(uyelik.kurumId);
  // Bildirim, kayittan sonra yeniden kurulan formun disinda tutulur.
  const [bildirim, setBildirim] = useState<Bildirim>(null);
  if (q.isPending) return <ListeIskeleti satir={3} />;
  if (q.isError) {
    return <HataDurumu aciklama={hataMesaji(q.error)} tekrarDene={() => void q.refetch()} />;
  }
  // Kayittan sonra gelen yeni surumle form yeniden kurulur.
  return (
    <AyarFormu
      key={q.data.surum ?? 0}
      ayar={q.data}
      bildirim={bildirim}
      bildirimYaz={setBildirim}
    />
  );
}

function AyarFormu({
  ayar,
  bildirim,
  bildirimYaz: setBildirim,
}: {
  ayar: SoruAyarlari;
  bildirim: Bildirim;
  bildirimYaz: (b: Bildirim) => void;
}) {
  const { uyelik } = useKurum();
  const kurumId = uyelik.kurumId;
  const yenile = useSoruYenile(kurumId);
  const [form, setForm] = useState<Form>(() => formdan(ayar));

  const kaydet = useMutation({
    mutationFn: (g: Record<string, number | null>) =>
      ogrenmeIstek(`kurumlar/${kurumId}/soru-ayarlari`, {
        yontem: 'PUT',
        govde: g,
        sema: SoruAyarlariSema,
      }),
    onSuccess: () => {
      setBildirim(basari(t('soruSor.ayar.kaydedildi')));
      void yenile();
    },
    onError: (h) => {
      setBildirim(basarisiz(h));
    },
  });

  const guncelle = (yama: Partial<Form>) => {
    setForm({ ...form, ...yama });
  };
  const gunluk = form.gunlukSinirsiz ? null : tamSayi(form.gunluk);
  const aylik = form.aylikSinirsiz ? null : tamSayi(form.aylik);
  const takip = tamSayi(form.takip);
  const ses = tamSayi(form.ses);
  const saklama = tamSayi(form.saklama);
  const hata = {
    gunluk: !form.gunlukSinirsiz && (gunluk === null || gunluk < 1 || gunluk > 1000),
    aylik: !form.aylikSinirsiz && (aylik === null || aylik < 1 || aylik > 10_000),
    takip: takip === null || takip > 20,
    ses: ses === null || ses < 10 || ses > SORU_SES_EN_FAZLA_SN,
    saklama: saklama === null || saklama < 1 || saklama > 365,
  };
  const gecerli = !Object.values(hata).some(Boolean);

  const gonder = (e: SyntheticEvent) => {
    e.preventDefault();
    if (!gecerli || takip === null || ses === null || saklama === null) return;
    setBildirim(null);
    kaydet.mutate({
      gunluk_soru_limiti: gunluk,
      aylik_soru_limiti: aylik,
      soru_basina_takip_limiti: takip,
      ses_azami_sn: ses,
      foto_saklama_gun: saklama,
    });
  };

  return (
    <section
      aria-label={t('soruSor.ayar.baslik')}
      className="rounded-buyuk border border-kenar bg-yuzey"
    >
      <header className="border-b border-kenar px-4 py-3">
        <h2 className="text-base font-semibold">{t('soruSor.ayar.baslik')}</h2>
        <p className="mt-0.5 text-sm text-metin-ikincil">
          {ayar.varsayilan ? t('soruSor.ayar.varsayilan') : t('soruSor.ayar.aciklama')}
        </p>
      </header>
      <form
        onSubmit={gonder}
        className="flex flex-col gap-5 p-4"
        aria-label={t('soruSor.ayar.baslik')}
      >
        <BildirimKutusu bildirim={bildirim} />
        <fieldset className="grid gap-4 sm:grid-cols-2">
          <legend className="mb-2 text-sm font-semibold">{t('soruSor.ayar.kota')}</legend>
          <SinirAlani
            etiket={t('soruSor.ayar.gunluk')}
            yardim={t('soruSor.ayar.gunlukYardim')}
            sinirsiz={form.gunlukSinirsiz}
            deger={form.gunluk}
            hata={hata.gunluk ? t('soruSor.ayar.hata.aralik', { en: 1, cok: 1000 }) : undefined}
            sinirsizDegisti={(v) => {
              guncelle({ gunlukSinirsiz: v });
            }}
            degisti={(v) => {
              guncelle({ gunluk: v });
            }}
          />
          <SinirAlani
            etiket={t('soruSor.ayar.aylik')}
            yardim={t('soruSor.ayar.aylikYardim')}
            sinirsiz={form.aylikSinirsiz}
            deger={form.aylik}
            hata={hata.aylik ? t('soruSor.ayar.hata.aralik', { en: 1, cok: 10000 }) : undefined}
            sinirsizDegisti={(v) => {
              guncelle({ aylikSinirsiz: v });
            }}
            degisti={(v) => {
              guncelle({ aylik: v });
            }}
          />
        </fieldset>
        <div className="grid gap-4 sm:grid-cols-3">
          <Alan
            etiket={t('soruSor.ayar.takip')}
            yardim={t('soruSor.ayar.takipYardim')}
            hata={hata.takip ? t('soruSor.ayar.hata.aralik', { en: 0, cok: 20 }) : undefined}
          >
            {(o) => (
              <Girdi
                {...o}
                inputMode="numeric"
                value={form.takip}
                onChange={(e) => {
                  guncelle({ takip: e.target.value });
                }}
              />
            )}
          </Alan>
          <Alan
            etiket={t('soruSor.ayar.ses')}
            yardim={t('soruSor.ayar.sesYardim')}
            hata={
              hata.ses
                ? t('soruSor.ayar.hata.aralik', { en: 10, cok: SORU_SES_EN_FAZLA_SN })
                : undefined
            }
          >
            {(o) => (
              <Girdi
                {...o}
                inputMode="numeric"
                value={form.ses}
                onChange={(e) => {
                  guncelle({ ses: e.target.value });
                }}
              />
            )}
          </Alan>
          <Alan
            etiket={t('soruSor.ayar.saklama')}
            yardim={t('soruSor.ayar.saklamaYardim')}
            hata={hata.saklama ? t('soruSor.ayar.hata.aralik', { en: 1, cok: 365 }) : undefined}
          >
            {(o) => (
              <Girdi
                {...o}
                inputMode="numeric"
                value={form.saklama}
                onChange={(e) => {
                  guncelle({ saklama: e.target.value });
                }}
              />
            )}
          </Alan>
        </div>
        <div className="flex justify-end">
          <Dugme type="submit" disabled={!gecerli || kaydet.isPending}>
            {kaydet.isPending ? t('ortak.yukleniyor') : t('soruSor.ayar.kaydet')}
          </Dugme>
        </div>
      </form>
    </section>
  );
}

function SinirAlani({
  etiket,
  yardim,
  sinirsiz,
  deger,
  hata,
  sinirsizDegisti,
  degisti,
}: {
  etiket: string;
  yardim: string;
  sinirsiz: boolean;
  deger: string;
  hata: string | undefined;
  sinirsizDegisti: (v: boolean) => void;
  degisti: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Alan etiket={etiket} yardim={yardim} hata={sinirsiz ? undefined : hata}>
        {(o) => (
          <Girdi
            {...o}
            inputMode="numeric"
            disabled={sinirsiz}
            value={sinirsiz ? '' : deger}
            placeholder={sinirsiz ? t('soruSor.ayar.sinirsiz') : ''}
            onChange={(e) => {
              degisti(e.target.value);
            }}
          />
        )}
      </Alan>
      <label className="flex min-h-9 cursor-pointer items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={sinirsiz}
          onChange={(e) => {
            sinirsizDegisti(e.target.checked);
          }}
          className="size-4 accent-[var(--birincil)]"
        />
        {t('soruSor.ayar.sinirsizEtiket', { ad: etiket })}
      </label>
    </div>
  );
}
