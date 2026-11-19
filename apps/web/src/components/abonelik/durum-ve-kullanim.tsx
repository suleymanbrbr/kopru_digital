'use client';

import type { AbonelikPlanTipi, AbonelikYanitSema } from '@kopru/contracts';
import { t } from '@kopru/i18n';
import type { z } from 'zod';

import { tarihYaz } from '@/components/hesap/ortak';
import { Kart } from '@/components/ui/kart';
import { Rozet } from '@/components/ui/rozet';
import {
  kalanGun,
  kullanimOrani,
  kullanimSeviyesi,
  type KullanimSeviyesi,
} from '@/lib/abonelik/bicim';
import { cn } from '@/lib/cn';

type Yanit = z.output<typeof AbonelikYanitSema>;

const durumTonu = {
  deneme: 'bilgi',
  aktif: 'basari',
  odeme_bekliyor: 'uyari',
  ek_sure: 'uyari',
  askida: 'hata',
  iptal: 'notr',
  sona_erdi: 'hata',
} as const;

/** Durum metni: deneme kalan gun, ek sure, iptal istendi (donem sonu tarihi), askida... */
export function durumMetni(yanit: Yanit, simdi: number): string {
  const a = yanit.abonelik;
  if (!a) return t('abonelik.planYokAciklama');
  switch (a.durum) {
    case 'deneme': {
      const gun = a.deneme_bitis_at ? kalanGun(a.deneme_bitis_at, simdi) : 0;
      return t('abonelik.durumMetni.deneme', {
        gun,
        tarih: tarihYaz(a.deneme_bitis_at ?? a.donem_bitis_at),
      });
    }
    case 'aktif':
      return a.iptal_istendi_at
        ? t('abonelik.durumMetni.aktifIptal', { tarih: tarihYaz(a.donem_bitis_at) })
        : t('abonelik.durumMetni.aktif', { tarih: tarihYaz(a.donem_bitis_at) });
    case 'ek_sure':
      return t('abonelik.durumMetni.ek_sure', {
        tarih: tarihYaz(a.ek_sure_bitis_at ?? a.donem_bitis_at),
      });
    default:
      return t(`abonelik.durumMetni.${a.durum}`);
  }
}

export function DurumKarti({
  yanit,
  planlar,
  simdi,
}: {
  yanit: Yanit;
  planlar: readonly AbonelikPlanTipi[];
  simdi: number;
}) {
  const a = yanit.abonelik;
  const bekleyen = a?.bekleyen_plan_kodu
    ? planlar.find((p) => p.kod === a.bekleyen_plan_kodu)
    : undefined;
  return (
    <Kart aria-labelledby="abonelik-durum" className="p-5" data-testid="abonelik-durum">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="abonelik-durum" className="text-lg font-semibold">
          {t('abonelik.mevcutPlan')}: {a ? a.plan.ad : t('abonelik.planYok')}
        </h2>
        {a ? (
          <Rozet ton={durumTonu[a.durum]}>{t(`abonelik.durum.${a.durum}`)}</Rozet>
        ) : (
          <Rozet>{t('abonelik.ucretsizDurum')}</Rozet>
        )}
        {a ? <Rozet>{t(`abonelik.kaynak.${a.kaynak}`)}</Rozet> : null}
        {a && a.kaynak !== 'deneme' ? <Rozet>{t(`abonelik.periyot.${a.periyot}`)}</Rozet> : null}
      </div>
      <p className="mt-2 text-sm text-metin-ikincil">{durumMetni(yanit, simdi)}</p>
      {a?.bekleyen_plan_kodu ? (
        <p className="mt-2 text-sm font-medium" data-testid="bekleyen-plan">
          {t('abonelik.bekleyenPlan', {
            plan: bekleyen?.ad ?? a.bekleyen_plan_kodu,
            periyot: t(`abonelik.periyot.${a.bekleyen_periyot ?? a.periyot}`).toLocaleLowerCase(
              'tr',
            ),
            tarih: tarihYaz(a.donem_bitis_at),
          })}
        </p>
      ) : null}
    </Kart>
  );
}

const cubukRenkleri: Record<KullanimSeviyesi, string> = {
  normal: 'bg-birincil',
  yaklasti: 'bg-uyari',
  dolu: 'bg-hata',
};

function Sayac({ ad, mevcut, ust }: { ad: string; mevcut: number; ust: number | null }) {
  const oran = kullanimOrani(mevcut, ust);
  const seviye = kullanimSeviyesi(mevcut, ust);
  const metin =
    ust === null
      ? t('abonelik.kullanim.sayacSinirsiz', { mevcut })
      : t('abonelik.kullanim.sayac', { mevcut, sinir: ust });
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-medium">{ad}</span>
        <span className="text-metin-ikincil">
          {metin}
          {seviye === 'dolu' ? ` · ${t('abonelik.kullanim.dolu')}` : null}
          {seviye === 'yaklasti' ? ` · ${t('abonelik.kullanim.yaklasti')}` : null}
        </span>
      </div>
      {oran !== null && ust !== null ? (
        <div
          role="progressbar"
          aria-label={t('abonelik.kullanim.ilerleme', { ad, mevcut, sinir: ust })}
          aria-valuemin={0}
          aria-valuemax={ust}
          aria-valuenow={Math.min(mevcut, ust)}
          className="h-2.5 overflow-hidden rounded-full bg-yuzey-ikincil"
        >
          <div
            className={cn('h-full rounded-full', cubukRenkleri[seviye])}
            style={{ width: `${String(oran)}%` }}
          />
        </div>
      ) : null}
    </div>
  );
}

export function KullanimKarti({ yanit }: { yanit: Yanit }) {
  return (
    <Kart aria-labelledby="abonelik-kullanim" className="p-5">
      <h2 id="abonelik-kullanim" className="mb-4 text-lg font-semibold">
        {t('abonelik.kullanim.baslik')}
      </h2>
      <div className="flex flex-col gap-4">
        <Sayac
          ad={t('abonelik.kullanim.ogrenci')}
          mevcut={yanit.kullanim.ogrenci.mevcut}
          ust={yanit.kullanim.ogrenci.ust_sinir}
        />
        <Sayac
          ad={t('abonelik.kullanim.ogretmen')}
          mevcut={yanit.kullanim.ogretmen.mevcut}
          ust={yanit.kullanim.ogretmen.ust_sinir}
        />
      </div>
    </Kart>
  );
}
