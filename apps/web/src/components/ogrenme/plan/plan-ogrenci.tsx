'use client';

import { PlanGorevSema, DevretYanitSema, type PlanGorevi } from '@kopru/contracts';
import { t } from '@kopru/i18n';
import { useMutation } from '@tanstack/react-query';
import { ArrowRight, Check, Target } from 'lucide-react';
import { useMemo, useState } from 'react';

import { HaftaGezgini } from './hafta-gezgini';
import { PlanOzeti } from './plan-ozeti';

import { BosDurum } from '@/components/bos-durum';
import { HataDurumu } from '@/components/hata-durumu';
import {
  BildirimKutusu,
  ListeIskeleti,
  basari,
  basarisiz,
  type Bildirim,
} from '@/components/hesap/ortak';
import { SayfaBasligi } from '@/components/kabuk/sayfa-basligi';
import { Dugme } from '@/components/ui/button';
import { Girdi } from '@/components/ui/input';
import { Rozet } from '@/components/ui/rozet';
import { useKurum } from '@/kurum/baglam';
import { hataMesaji } from '@/lib/api';
import { bransAdi } from '@/lib/bransler';
import { ogrenmeIstek } from '@/lib/hesap-istek';
import {
  devirHedefi,
  devralindiMi,
  devredilmisMi,
  gorevDurumTonu,
  gunlereBol,
  miktarEtiketi,
} from '@/lib/ogrenme/plan';
import { useKonular, useOgrenmeYenile, usePlanim } from '@/lib/ogrenme/veri';
import { useSaatDilimi } from '@/lib/operasyon-verisi';
import { bugunYerel, gunEtiketi, haftaBasi } from '@/lib/saat';

/**
 * Ogrencinin haftasi: gun gorevleri, gerceklesen girisi (tek ekranda, "tamamladim" tek dokunus) ve
 * "yarina tasi". Ogrenci hedefi degistiremez; yalniz gerceklesen miktari girer.
 */
export function PlanOgrenci() {
  const { uyelik } = useKurum();
  const kurumId = uyelik.kurumId;
  const { saatDilimi } = useSaatDilimi(kurumId);
  const bugun = bugunYerel(saatDilimi);
  const [secilen, setHafta] = useState<string | null>(null);
  const hafta = secilen ?? haftaBasi(bugun);
  const plan = usePlanim(kurumId, hafta);
  const konular = useKonular(kurumId);
  const [bildirim, setBildirim] = useState<Bildirim>(null);
  const konuAdlari = useMemo(
    () => new Map((konular.data ?? []).map((k) => [k.id, k.ad])),
    [konular.data],
  );
  const gunler = useMemo(
    () => (plan.data ? gunlereBol(plan.data.gorevler, hafta) : null),
    [plan.data, hafta],
  );
  const detay = plan.data;

  return (
    <>
      <SayfaBasligi
        baslik={t('ogrenme.plan.benimHaftam')}
        aciklama={t('ogrenme.plan.ogrenciAciklama')}
      >
        <HaftaGezgini hafta={hafta} bugun={bugun} degisti={setHafta} />
      </SayfaBasligi>
      <div className="mb-4">
        <BildirimKutusu bildirim={bildirim} />
      </div>
      {plan.isPending ? (
        <ListeIskeleti satir={5} />
      ) : plan.isError ? (
        <HataDurumu
          baslik={t('ogrenme.plan.yuklenemedi')}
          aciklama={hataMesaji(plan.error)}
          tekrarDene={() => void plan.refetch()}
        />
      ) : !detay?.plan ? (
        <section className="rounded-buyuk border border-kenar bg-yuzey">
          <BosDurum
            className="py-16"
            ikon={Target}
            baslik={t('ogrenme.plan.ogrenciPlanYok')}
            aciklama={t('ogrenme.plan.ogrenciPlanYokAciklama')}
          />
        </section>
      ) : (
        <div className="flex flex-col gap-4">
          {detay.kilitli ? (
            <p
              role="note"
              className="rounded-orta bg-yuzey-ikincil px-3 py-2 text-sm text-metin-ikincil"
            >
              {t('ogrenme.plan.kilitliAciklama')}
            </p>
          ) : null}
          {detay.plan.not ? (
            <section
              aria-label={t('ogrenme.plan.ogretmenNotu')}
              className="rounded-buyuk border border-kenar bg-birincil-yumusak p-4"
            >
              <h2 className="text-sm font-semibold">{t('ogrenme.plan.ogretmenNotu')}</h2>
              <p className="mt-1 text-sm">{detay.plan.not}</p>
            </section>
          ) : null}
          <ol aria-label={t('ogrenme.plan.gunler')} className="flex flex-col gap-3">
            {gunler
              ? [...gunler.entries()].map(([gun, gorevler]) => (
                  <li
                    key={gun}
                    aria-label={gunEtiketi(gun)}
                    className="rounded-buyuk border border-kenar bg-yuzey"
                  >
                    <h3
                      className={`border-b border-kenar px-4 py-2 text-sm font-semibold ${gun === bugun ? 'bg-birincil-yumusak' : ''}`}
                    >
                      {gunEtiketi(gun)}
                      {gun === bugun ? (
                        <span className="ml-2 text-xs font-normal">
                          ({t('ogrenme.plan.bugun')})
                        </span>
                      ) : null}
                    </h3>
                    {gorevler.length === 0 ? (
                      <p className="px-4 py-3 text-sm text-metin-ikincil">
                        {t('ogrenme.plan.ogrenciGunBos')}
                      </p>
                    ) : (
                      <ul className="divide-y divide-kenar">
                        {gorevler.map((g) => (
                          <GorevSatiri
                            key={`${g.id}-${String(g.surum)}`}
                            gorev={g}
                            kurumId={kurumId}
                            konuAdi={g.konu_id ? (konuAdlari.get(g.konu_id) ?? null) : null}
                            kilitli={detay.kilitli}
                            bildirim={setBildirim}
                          />
                        ))}
                      </ul>
                    )}
                  </li>
                ))
              : null}
          </ol>
          <section
            aria-label={t('ogrenme.plan.ozet')}
            className="rounded-buyuk border border-kenar bg-yuzey p-4"
          >
            <h2 className="mb-3 text-base font-semibold">{t('ogrenme.plan.ozet')}</h2>
            <PlanOzeti kurumId={kurumId} planId={detay.plan.id} />
          </section>
        </div>
      )}
    </>
  );
}

function GorevSatiri({
  gorev: g,
  kurumId,
  konuAdi,
  kilitli,
  bildirim,
}: {
  gorev: PlanGorevi;
  kurumId: string;
  konuAdi: string | null;
  kilitli: boolean;
  bildirim: (b: Bildirim) => void;
}) {
  const yenile = useOgrenmeYenile(kurumId);
  const [deger, setDeger] = useState(
    g.gerceklesen_miktar === null ? '' : String(g.gerceklesen_miktar),
  );
  const [hata, setHata] = useState<string | null>(null);
  const devir = devirHedefi(g);
  const devredildi = devredilmisMi(g);

  const yaz = useMutation({
    mutationFn: (miktar: number) =>
      ogrenmeIstek(`kurumlar/${kurumId}/gorevler/${g.id}/gerceklesen`, {
        yontem: 'PUT',
        govde: { gerceklesen_miktar: miktar, surum: g.surum },
        sema: PlanGorevSema,
      }),
    onSuccess: async () => {
      await yenile();
      bildirim(basari(t('ogrenme.plan.gerceklesenKaydedildi', { brans: bransAdi(g.brans_kodu) })));
    },
    onError: (h) => {
      bildirim(basarisiz(h));
    },
  });
  const tasi = useMutation({
    mutationFn: () =>
      ogrenmeIstek(`kurumlar/${kurumId}/gorevler/${g.id}/devret`, {
        govde: { surum: g.surum },
        sema: DevretYanitSema,
      }),
    onSuccess: async () => {
      await yenile();
      bildirim(basari(t('ogrenme.plan.tasindi', { brans: bransAdi(g.brans_kodu) })));
    },
    onError: (h) => {
      bildirim(basarisiz(h));
    },
  });

  const kaydet = () => {
    const n = Number(deger);
    if (deger.trim() === '' || !Number.isInteger(n) || n < 0 || n > 100_000) {
      setHata(t('ogrenme.plan.hata.gerceklesen'));
      return;
    }
    setHata(null);
    yaz.mutate(n);
  };

  const girdiId = `gerceklesen-${g.id}`;
  return (
    <li className={`flex flex-col gap-2 px-4 py-3 ${devredildi ? 'opacity-70' : ''}`}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className={`font-medium ${devredildi ? 'line-through' : ''}`}>
            {bransAdi(g.brans_kodu)}
            <span className="ml-2 font-normal text-metin-ikincil">
              {miktarEtiketi(g.hedef_turu, g.hedef_miktar)}
            </span>
          </p>
          {konuAdi ? <p className="truncate text-sm text-metin-ikincil">{konuAdi}</p> : null}
        </div>
        {devralindiMi(g) ? <Rozet ton="bilgi">{t('ogrenme.plan.devralindi')}</Rozet> : null}
        <Rozet ton={gorevDurumTonu(g)}>{t(`ogrenme.plan.gorevDurum.${g.durum}`)}</Rozet>
      </div>
      {!devredildi && !kilitli ? (
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-32">
            <label htmlFor={girdiId} className="text-xs text-metin-ikincil">
              {t(
                g.hedef_turu === 'soru' ? 'ogrenme.plan.yapilanSoru' : 'ogrenme.plan.yapilanDakika',
                {
                  brans: bransAdi(g.brans_kodu),
                },
              )}
            </label>
            <Girdi
              id={girdiId}
              inputMode="numeric"
              value={deger}
              aria-invalid={hata ? true : undefined}
              onChange={(e) => {
                setDeger(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') kaydet();
              }}
            />
          </div>
          <Dugme
            gorunum="ikincil"
            disabled={yaz.isPending}
            aria-label={t('ogrenme.plan.kaydetEtiket', { brans: bransAdi(g.brans_kodu) })}
            onClick={kaydet}
          >
            {t('ogrenme.ortak.kaydet')}
          </Dugme>
          {g.durum !== 'tamam' ? (
            <Dugme
              disabled={yaz.isPending}
              aria-label={t('ogrenme.plan.tamamladimEtiket', { brans: bransAdi(g.brans_kodu) })}
              onClick={() => {
                setDeger(String(g.hedef_miktar));
                yaz.mutate(g.hedef_miktar);
              }}
            >
              <Check aria-hidden />
              {t('ogrenme.plan.tamamladim')}
            </Dugme>
          ) : null}
          {devir && g.durum !== 'tamam' ? (
            <Dugme
              gorunum="hayalet"
              disabled={tasi.isPending}
              aria-label={t('ogrenme.plan.yarinaTasiEtiket', { brans: bransAdi(g.brans_kodu) })}
              onClick={() => {
                tasi.mutate();
              }}
            >
              <ArrowRight aria-hidden />
              {t('ogrenme.plan.yarinaTasi')}
            </Dugme>
          ) : null}
        </div>
      ) : null}
      {hata ? (
        <p role="alert" className="text-sm text-hata">
          {hata}
        </p>
      ) : null}
    </li>
  );
}
