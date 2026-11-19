'use client';

import type { AbonelikPlanTipi, AbonelikYanitSema, Periyot } from '@kopru/contracts';
import { kurusBicimle, t } from '@kopru/i18n';
import { Check, Store } from 'lucide-react';
import { useState } from 'react';
import type { z } from 'zod';

import { tarihYaz } from '@/components/hesap/ortak';
import { Dugme } from '@/components/ui/button';
import { Kart } from '@/components/ui/kart';
import { Rozet } from '@/components/ui/rozet';
import { cn } from '@/lib/cn';

type Yanit = z.output<typeof AbonelikYanitSema>;

/** Bu kurumun planlari hangi kanaldan yonetiliyor? (`web`: iyzico/deneme/yok, digerleri web'den degistirilmez.) */
export type YonetimKanali = 'web' | 'magaza' | 'kurumsal';

export function yonetimKanali(yanit: Yanit): YonetimKanali {
  const a = yanit.abonelik;
  if (!a) return 'web';
  const ucretliEtkin = ['aktif', 'odeme_bekliyor', 'ek_sure'].includes(a.durum);
  if (!ucretliEtkin) return 'web';
  if (a.kaynak === 'apple' || a.kaynak === 'google') return 'magaza';
  if (a.kaynak === 'kurumsal') return 'kurumsal';
  return 'web';
}

function limitSatiri(sinir: number, tek: 'limitOgrenci' | 'limitOgretmen' | 'limitSube') {
  const sinirsiz = {
    limitOgrenci: 'ogrenciSinirsiz',
    limitOgretmen: 'ogretmenSinirsiz',
    limitSube: 'subeSinirsiz',
  } as const;
  return sinir < 0 ? t(`abonelik.plan.${sinirsiz[tek]}`) : t(`abonelik.plan.${tek}`, { n: sinir });
}

export function fiyatKurus(plan: AbonelikPlanTipi, periyot: Periyot): number | null {
  return periyot === 'yillik' ? plan.yillik_fiyat_kurus : plan.aylik_fiyat_kurus;
}

export function PlanKartlari({
  yanit,
  planlar,
  bekliyor,
  odemeBaslat,
  planDegistir,
}: {
  yanit: Yanit;
  planlar: readonly AbonelikPlanTipi[];
  bekliyor: boolean;
  odemeBaslat: (plan: AbonelikPlanTipi, periyot: Periyot) => void;
  planDegistir: (plan: AbonelikPlanTipi, periyot: Periyot) => void;
}) {
  const a = yanit.abonelik;
  const kanal = yonetimKanali(yanit);
  const [periyot, setPeriyot] = useState<Periyot>(a?.periyot ?? 'aylik');
  const denemede = a?.durum === 'deneme';
  const ucretliWeb = kanal === 'web' && a?.kaynak === 'iyzico' && a.durum === 'aktif';
  const kdv = planlar[0]?.kdv_orani ?? 20;

  return (
    <section aria-labelledby="abonelik-planlar" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="abonelik-planlar" className="text-lg font-semibold">
            {t('abonelik.plan.baslik')}
          </h2>
          <p className="text-sm text-metin-ikincil">{t('abonelik.plan.aciklama', { kdv })}</p>
        </div>
        <div
          role="radiogroup"
          aria-label={t('abonelik.periyotSec')}
          className="inline-flex rounded-orta border border-kenar bg-yuzey p-1"
        >
          {(['aylik', 'yillik'] as const).map((p) => (
            <button
              key={p}
              type="button"
              role="radio"
              aria-checked={periyot === p}
              onClick={() => {
                setPeriyot(p);
              }}
              className={cn(
                'min-h-9 rounded-[0.5rem] px-4 text-sm font-medium',
                periyot === p
                  ? 'bg-birincil text-birincil-uzeri'
                  : 'text-metin-ikincil hover:bg-yuzey-ikincil',
              )}
            >
              {t(`abonelik.periyot.${p}`)}
            </button>
          ))}
        </div>
      </div>

      {kanal === 'magaza' && a ? (
        <Kart className="flex items-start gap-3 p-4 text-sm" data-testid="magaza-bilgisi">
          <Store className="mt-0.5 size-5 shrink-0 text-metin-ikincil" aria-hidden />
          <div>
            <h3 className="font-semibold">
              {t('abonelik.magaza.baslik', { kaynak: t(`abonelik.kaynak.${a.kaynak}`) })}
            </h3>
            <p className="mt-1 text-metin-ikincil">
              {t('abonelik.magaza.aciklama', { kaynak: t(`abonelik.kaynak.${a.kaynak}`) })}
            </p>
          </div>
        </Kart>
      ) : null}
      {kanal === 'kurumsal' ? (
        <Kart className="p-4 text-sm" data-testid="kurumsal-bilgisi">
          <h3 className="font-semibold">{t('abonelik.kurumsal.baslik')}</h3>
          <p className="mt-1 text-metin-ikincil">{t('abonelik.kurumsal.aciklama')}</p>
        </Kart>
      ) : null}
      {ucretliWeb ? (
        <p className="text-sm text-metin-ikincil" data-testid="donem-sonu-notu">
          {t('abonelik.plan.donemSonuNotu', { tarih: tarihYaz(a.donem_bitis_at) })}
        </p>
      ) : null}
      {denemede ? (
        <p className="text-sm text-metin-ikincil">{t('abonelik.plan.denemedeGec')}</p>
      ) : null}

      <ul className="grid gap-4 md:grid-cols-3">
        {planlar.map((plan) => {
          const fiyat = fiyatKurus(plan, periyot);
          const mevcut =
            a !== null &&
            ['deneme', 'aktif', 'odeme_bekliyor', 'ek_sure'].includes(a.durum) &&
            a.plan.kod === plan.kod;
          const bekleyenBu = a?.bekleyen_plan_kodu === plan.kod;
          const ayniPeriyot = a?.periyot === periyot;
          return (
            <li key={plan.kod}>
              <Kart
                aria-labelledby={`plan-${plan.kod}`}
                data-testid={`plan-${plan.kod}`}
                className={cn(
                  'flex h-full flex-col gap-3 p-5',
                  mevcut && 'border-birincil ring-1 ring-birincil',
                )}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <h3 id={`plan-${plan.kod}`} className="text-base font-semibold">
                    {plan.ad}
                  </h3>
                  {mevcut ? <Rozet ton="bilgi">{t('abonelik.plan.mevcut')}</Rozet> : null}
                  {bekleyenBu ? <Rozet ton="uyari">{t('abonelik.plan.bekleyen')}</Rozet> : null}
                </div>
                <p className="text-2xl font-semibold tracking-tight">
                  {fiyat === null ? (
                    <span className="text-base font-normal text-metin-ikincil">
                      {t('abonelik.plan.yillikYok')}
                    </span>
                  ) : (
                    t(periyot === 'yillik' ? 'abonelik.plan.yillik' : 'abonelik.plan.aylik', {
                      fiyat: kurusBicimle(fiyat),
                    })
                  )}
                </p>
                <ul className="flex flex-col gap-1.5 text-sm">
                  {[
                    limitSatiri(plan.limitler.max_ogrenci, 'limitOgrenci'),
                    limitSatiri(plan.limitler.max_ogretmen, 'limitOgretmen'),
                    limitSatiri(plan.limitler.max_sube, 'limitSube'),
                  ].map((satir) => (
                    <li key={satir} className="flex items-center gap-2">
                      <Check className="size-4 shrink-0 text-basari" aria-hidden />
                      {satir}
                    </li>
                  ))}
                </ul>
                <div className="mt-auto flex flex-col gap-2 pt-2">
                  {kanal !== 'web' || fiyat === null ? null : ucretliWeb ? (
                    mevcut && ayniPeriyot ? null : (
                      <Dugme
                        gorunum="ikincil"
                        disabled={bekliyor || (bekleyenBu && a.bekleyen_periyot === periyot)}
                        onClick={() => {
                          planDegistir(plan, periyot);
                        }}
                      >
                        {t('abonelik.plan.gecDonemSonu', { plan: plan.ad })}
                      </Dugme>
                    )
                  ) : (
                    <>
                      <Dugme
                        disabled={bekliyor}
                        onClick={() => {
                          odemeBaslat(plan, periyot);
                        }}
                      >
                        {t('abonelik.plan.aboneOl', { plan: plan.ad })}
                      </Dugme>
                      {denemede && !mevcut ? (
                        <Dugme
                          gorunum="ikincil"
                          disabled={bekliyor}
                          onClick={() => {
                            planDegistir(plan, periyot);
                          }}
                        >
                          {t('abonelik.plan.gec', { plan: plan.ad })}
                        </Dugme>
                      ) : null}
                    </>
                  )}
                </div>
              </Kart>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
