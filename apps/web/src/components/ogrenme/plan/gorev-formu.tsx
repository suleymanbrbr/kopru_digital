'use client';

import type { PlanGorevi } from '@kopru/contracts';
import { t } from '@kopru/i18n';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';

import { KonuSecici } from '@/components/ogrenme/konu-secici';
import { Alan } from '@/components/operasyon/ortak';
import { Dugme } from '@/components/ui/button';
import { Girdi } from '@/components/ui/input';
import { Pencere } from '@/components/ui/pencere';
import { Secim } from '@/components/ui/secim';
import { hataMesaji } from '@/lib/api';
import { siraliBransler } from '@/lib/bransler';
import { ogrenmeIstek } from '@/lib/hesap-istek';
import { gorevFormunuDogrula, haftaninGunleri, type GorevHatalari } from '@/lib/ogrenme/plan';
import { useOgrenmeYenile } from '@/lib/ogrenme/veri';
import { gunEtiketi } from '@/lib/saat';

/** Plana gorev ekler ya da gorevi duzenler (ders, konu, soru ya da dakika hedefi). */
export function GorevFormu({
  kurumId,
  planId,
  hafta,
  gun,
  duzenle,
  kapat,
  bitti,
}: {
  kurumId: string;
  planId: string;
  hafta: string;
  /** Yeni gorevin varsayilan gunu. */
  gun: string;
  duzenle: PlanGorevi | null;
  kapat: () => void;
  bitti: (mesaj: string) => void;
}) {
  const yenile = useOgrenmeYenile(kurumId);
  const [form, setForm] = useState({
    gun: duzenle?.gun ?? gun,
    brans: duzenle?.brans_kodu ?? 'matematik',
    konuId: duzenle?.konu_id ?? (null as string | null),
    hedefTuru: duzenle?.hedef_turu ?? 'soru',
    miktar: duzenle ? String(duzenle.hedef_miktar) : '30',
  });
  const [hatalar, setHatalar] = useState<GorevHatalari>({});
  const [genelHata, setGenelHata] = useState<string | null>(null);

  const kaydet = useMutation({
    mutationFn: () => {
      const govde = {
        gun: form.gun,
        brans_kodu: form.brans,
        hedef_turu: form.hedefTuru,
        hedef_miktar: Number(form.miktar),
        ...(form.konuId ? { konu_id: form.konuId } : duzenle ? { konu_id: null } : {}),
        ...(duzenle ? { surum: duzenle.surum } : {}),
      };
      return duzenle
        ? ogrenmeIstek(`kurumlar/${kurumId}/gorevler/${duzenle.id}`, { yontem: 'PATCH', govde })
        : ogrenmeIstek(`kurumlar/${kurumId}/planlar/${planId}/gorevler`, { govde });
    },
    onSuccess: async () => {
      await yenile();
      bitti(t(duzenle ? 'ogrenme.plan.gorevGuncellendi' : 'ogrenme.plan.gorevEklendi'));
    },
    onError: (h) => {
      setGenelHata(hataMesaji(h));
    },
  });

  return (
    <Pencere
      acik
      degisti={(a) => {
        if (!a) kapat();
      }}
      baslik={t(duzenle ? 'ogrenme.plan.gorevDuzenle' : 'ogrenme.plan.gorevEkle')}
      aciklama={t('ogrenme.plan.gorevAciklama')}
    >
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          setGenelHata(null);
          const h = gorevFormunuDogrula(form, hafta);
          setHatalar(h);
          if (Object.keys(h).length === 0) kaydet.mutate();
        }}
        className="flex flex-col gap-4"
      >
        <Alan etiket={t('ogrenme.plan.gun')} hata={hatalar.gun}>
          {(o) => (
            <Secim
              {...o}
              value={form.gun}
              onChange={(e) => {
                setForm((f) => ({ ...f, gun: e.target.value }));
              }}
            >
              {haftaninGunleri(hafta).map((g) => (
                <option key={g} value={g}>
                  {gunEtiketi(g)}
                </option>
              ))}
            </Secim>
          )}
        </Alan>
        <Alan etiket={t('ogrenme.odev.ders')} hata={hatalar.brans}>
          {(o) => (
            <Secim
              {...o}
              value={form.brans}
              onChange={(e) => {
                setForm((f) => ({ ...f, brans: e.target.value, konuId: null }));
              }}
            >
              {siraliBransler().map((b) => (
                <option key={b.kod} value={b.kod}>
                  {b.ad}
                </option>
              ))}
            </Secim>
          )}
        </Alan>
        <KonuSecici
          kurumId={kurumId}
          deger={form.konuId}
          brans={form.brans}
          degisti={(k) => {
            setForm((f) => ({ ...f, konuId: k?.id ?? null }));
          }}
        />
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">{t('ogrenme.plan.hedefTuru')}</legend>
          <div className="flex gap-2">
            {(['soru', 'dakika'] as const).map((h) => (
              <label
                key={h}
                className="flex min-h-11 cursor-pointer items-center gap-2 rounded-orta border border-kenar px-3 text-sm has-[:checked]:border-birincil has-[:checked]:bg-birincil-yumusak"
              >
                <input
                  type="radio"
                  name="gorev-hedef-turu"
                  checked={form.hedefTuru === h}
                  onChange={() => {
                    setForm((f) => ({ ...f, hedefTuru: h }));
                  }}
                  className="size-4 accent-[var(--birincil)]"
                />
                {t(`ogrenme.plan.hedefTuruAd.${h}`)}
              </label>
            ))}
          </div>
        </fieldset>
        <Alan
          etiket={t(
            form.hedefTuru === 'soru' ? 'ogrenme.plan.soruSayisi' : 'ogrenme.plan.dakikaSayisi',
          )}
          hata={hatalar.miktar}
        >
          {(o) => (
            <Girdi
              {...o}
              inputMode="numeric"
              value={form.miktar}
              onChange={(e) => {
                setForm((f) => ({ ...f, miktar: e.target.value }));
              }}
            />
          )}
        </Alan>
        {genelHata ? (
          <p role="alert" className="text-sm text-hata">
            {genelHata}
          </p>
        ) : null}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Dugme type="button" gorunum="ikincil" onClick={kapat}>
            {t('ortak.vazgec')}
          </Dugme>
          <Dugme type="submit" disabled={kaydet.isPending}>
            {kaydet.isPending
              ? t('ortak.yukleniyor')
              : t(duzenle ? 'ogrenme.ortak.kaydet' : 'ogrenme.plan.gorevEkleDugme')}
          </Dugme>
        </div>
      </form>
    </Pencere>
  );
}
