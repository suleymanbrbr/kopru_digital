'use client';

import { t } from '@kopru/i18n';
import { useQuery } from '@tanstack/react-query';
import { useId, useState } from 'react';

import { HataDurumu } from '@/components/hata-durumu';
import { Dugme } from '@/components/ui/button';
import { OnayKutusu } from '@/components/ui/checkbox';
import { Etiket } from '@/components/ui/input';
import { Iskelet } from '@/components/ui/kart';
import { Uyari } from '@/components/ui/uyari';
import { bffIstek, hataMesaji, UygulamaHatasi } from '@/lib/api';
import { Markdown } from '@/lib/markdown/markdown';
import { useOturum } from '@/oturum/saglayici';
import { rizaMetniSema } from '@/oturum/tipler';

/** KVKK aydinlatma metni. Kabul edilene kadar uygulamanin geri kalani acilmaz (koruma + API 403). */
export function RizaEkrani({ sonra }: { sonra: () => void }) {
  const { rizaKabul, cikis } = useOturum();
  const [onay, setOnay] = useState(false);
  const [kaydediliyor, setKaydediliyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const onayId = useId();

  const metin = useQuery({
    queryKey: ['riza-metni'],
    queryFn: () => bffIstek('/api/oturum/riza', { sema: rizaMetniSema }),
  });

  async function kabulEt() {
    if (!metin.data) return;
    setKaydediliyor(true);
    setHata(null);
    try {
      await rizaKabul({ surum: metin.data.surum, metinIdleri: metin.data.metinIdleri });
      sonra();
    } catch (e) {
      setHata(hataMesaji(e));
      setKaydediliyor(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">{t('kvkk.baslik')}</h1>
        <p className="mt-2 text-base text-metin-ikincil">{t('kvkk.aciklama')}</p>
      </header>

      <div
        tabIndex={0}
        role="region"
        aria-label={t('kvkk.metniAc')}
        className="max-h-[min(46dvh,26rem)] overflow-y-auto rounded-buyuk border border-kenar bg-yuzey p-5"
      >
        {metin.isPending ? (
          <div className="flex flex-col gap-3" role="status" aria-label={t('ortak.yukleniyor')}>
            <Iskelet className="h-5 w-2/3" />
            <Iskelet className="h-4 w-full" />
            <Iskelet className="h-4 w-full" />
            <Iskelet className="h-4 w-4/5" />
            <Iskelet className="mt-3 h-5 w-1/2" />
            <Iskelet className="h-4 w-full" />
          </div>
        ) : metin.isError ? (
          <HataDurumu
            baslik={t('riza.metinYuklenemedi')}
            aciklama={hataMesaji(metin.error)}
            istekNo={metin.error instanceof UygulamaHatasi ? metin.error.istekId : undefined}
            tekrarDene={() => void metin.refetch()}
            className="py-6"
          />
        ) : (
          <article className="flex flex-col gap-4 text-[0.9375rem] leading-relaxed">
            {metin.data.baslik ? (
              <h2 className="text-lg font-semibold">{metin.data.baslik}</h2>
            ) : null}
            {metin.data.bolumler.map((bolum) => (
              <section key={bolum.baslik} className="flex flex-col">
                {metin.data.baslik ? (
                  <h3 className="font-semibold">{bolum.baslik}</h3>
                ) : (
                  <h2 className="text-base font-semibold">{bolum.baslik}</h2>
                )}
                <Markdown kaynak={bolum.metin} className="mt-2" />
              </section>
            ))}
            <p className="text-xs text-metin-ikincil">
              {t('riza.surum', { surum: metin.data.surum })}
            </p>
          </article>
        )}
      </div>

      <div className="flex items-start gap-3">
        <OnayKutusu
          id={onayId}
          checked={onay}
          disabled={!metin.data}
          onCheckedChange={(v) => {
            setOnay(v === true);
          }}
        />
        <Etiket htmlFor={onayId} className="cursor-pointer text-base font-normal leading-snug">
          {t('kvkk.onay')}
        </Etiket>
      </div>

      {hata ? <Uyari>{hata}</Uyari> : null}

      <div className="flex flex-col gap-3">
        <Dugme
          boyut="lg"
          disabled={!onay || !metin.data || kaydediliyor}
          onClick={() => void kabulEt()}
        >
          {kaydediliyor ? t('riza.kaydediliyor') : t('riza.kabulEt')}
        </Dugme>
        <p className="text-sm text-metin-ikincil">{t('riza.uyari')}</p>
        <Dugme gorunum="hayalet" boyut="sm" className="self-start" onClick={() => void cikis()}>
          {t('oturum.cikis')}
        </Dugme>
      </div>
    </div>
  );
}
