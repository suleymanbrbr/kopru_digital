'use client';

import { TopluPlanYanitSema } from '@kopru/contracts';
import { t } from '@kopru/i18n';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';

import { Alan } from '@/components/operasyon/ortak';
import { Dugme } from '@/components/ui/button';
import { Pencere } from '@/components/ui/pencere';
import { Secim } from '@/components/ui/secim';
import { hataMesaji } from '@/lib/api';
import { ogrenmeIstek } from '@/lib/hesap-istek';
import { usePlanSablonlari, useOgrenmeYenile } from '@/lib/ogrenme/veri';
import { useGruplar } from '@/lib/operasyon-verisi';
import { haftaEtiketi } from '@/lib/saat';

/** Gruba toplu plan: bir sablondaki gorevler grubun planı olmayan ogrencilerine verilir (varsa dokunulmaz). */
export function TopluPlan({
  kurumId,
  hafta,
  kapat,
  bitti,
}: {
  kurumId: string;
  hafta: string;
  kapat: () => void;
  bitti: (mesaj: string) => void;
}) {
  const gruplar = useGruplar(kurumId);
  const sablonlar = usePlanSablonlari(kurumId);
  const yenile = useOgrenmeYenile(kurumId);
  const [grupId, setGrupId] = useState('');
  const [sablonId, setSablonId] = useState('');
  const [yayinla, setYayinla] = useState(true);
  const [hata, setHata] = useState<string | null>(null);

  const kaydet = useMutation({
    mutationFn: () =>
      ogrenmeIstek(`kurumlar/${kurumId}/planlar/toplu`, {
        govde: { grup_id: grupId, hafta_baslangic: hafta, sablon_id: sablonId, yayinla },
        sema: TopluPlanYanitSema,
      }),
    onSuccess: async (r) => {
      await yenile();
      bitti(t('ogrenme.plan.topluSonuc', { olusan: r.olusturulan, atlanan: r.atlanan }));
    },
    onError: (h) => {
      setHata(hataMesaji(h));
    },
  });

  return (
    <Pencere
      acik
      degisti={(a) => {
        if (!a) kapat();
      }}
      baslik={t('ogrenme.plan.topluPlan')}
      aciklama={t('ogrenme.plan.topluAciklama', { hafta: haftaEtiketi(hafta) })}
    >
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          setHata(null);
          if (!grupId || !sablonId) {
            setHata(t('ogrenme.plan.topluHata'));
            return;
          }
          kaydet.mutate();
        }}
        className="flex flex-col gap-4"
      >
        <Alan etiket={t('ogrenme.odev.grup')}>
          {(o) => (
            <Secim
              {...o}
              value={grupId}
              onChange={(e) => {
                setGrupId(e.target.value);
              }}
            >
              <option value="">{t('ogrenme.odev.grupSec')}</option>
              {gruplar.secenekler.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.etiket}
                </option>
              ))}
            </Secim>
          )}
        </Alan>
        <Alan etiket={t('ogrenme.plan.sablon')} yardim={t('ogrenme.plan.topluSablonYardim')}>
          {(o) => (
            <Secim
              {...o}
              value={sablonId}
              onChange={(e) => {
                setSablonId(e.target.value);
              }}
            >
              <option value="">{t('ogrenme.plan.sablonSec')}</option>
              {sablonlar.data?.sablonlar.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.ad}
                </option>
              ))}
            </Secim>
          )}
        </Alan>
        <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
          <input
            type="checkbox"
            checked={yayinla}
            onChange={(e) => {
              setYayinla(e.target.checked);
            }}
            className="size-5 accent-[var(--birincil)]"
          />
          {t('ogrenme.plan.topluYayinla')}
        </label>
        {(sablonlar.data?.sablonlar.length ?? 0) === 0 && !sablonlar.isPending ? (
          <p className="text-sm text-metin-ikincil">{t('ogrenme.plan.topluSablonYok')}</p>
        ) : null}
        {hata ? (
          <p role="alert" className="text-sm text-hata">
            {hata}
          </p>
        ) : null}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Dugme type="button" gorunum="ikincil" onClick={kapat}>
            {t('ortak.vazgec')}
          </Dugme>
          <Dugme type="submit" disabled={kaydet.isPending}>
            {kaydet.isPending ? t('ortak.yukleniyor') : t('ogrenme.plan.topluUygula')}
          </Dugme>
        </div>
      </form>
    </Pencere>
  );
}
