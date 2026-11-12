'use client';

import type { GeriBildirimSayilariSema } from '@kopru/contracts';
import { t } from '@kopru/i18n';
import { useMemo } from 'react';
import type { z } from 'zod';

import { DegerRozeti } from './deger-rozeti';

import { HataDurumu } from '@/components/hata-durumu';
import { ListeIskeleti, zamanYaz } from '@/components/hesap/ortak';
import { UygulamaHatasi, hataMesaji } from '@/lib/api';
import { GERI_BILDIRIM_DEGERLERI, oranlar, yuzdeYaz } from '@/lib/kayit/geri-bildirim';
import { useDersGeriBildirimleri } from '@/lib/kayit/veri';
import { useKonular } from '@/lib/ogrenme/veri';

type Sayilar = z.infer<typeof GeriBildirimSayilariSema>;

/** Sayilar + yuzdeler: renk yanina metin etiketi ve sayi her zaman yazilir. */
export function SayilarOzeti({ sayilar }: { sayilar: Sayilar }) {
  const o = oranlar(sayilar);
  return (
    <dl className="grid grid-cols-3 gap-2 text-center">
      {GERI_BILDIRIM_DEGERLERI.map((d) => (
        <div key={d} className="rounded-orta bg-yuzey-ikincil px-2 py-2.5">
          <dt className="text-xs text-metin-ikincil">
            {t(`kayitGeriBildirim.geriBildirim.deger.${d}`)}
          </dt>
          <dd className="text-lg font-semibold tabular-nums">
            {sayilar[d]}
            <span className="ml-1.5 text-sm font-normal text-metin-ikincil">{yuzdeYaz(o[d])}</span>
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Ders ayrintisinda (personel) ogrenci geri bildirimleri: ozet ve kisi bazli liste (anonim degil). */
export function DersGeriBildirimi({ kurumId, dersId }: { kurumId: string; dersId: string }) {
  const q = useDersGeriBildirimleri(kurumId, dersId, true);
  const konular = useKonular(kurumId);
  const konuAdlari = useMemo(
    () => new Map((konular.data ?? []).map((k) => [k.id, k.ad])),
    [konular.data],
  );

  // Modul kapali ya da ders bu geri bildirim icin uygun degilse bolum hic gosterilmez.
  if (
    q.error instanceof UygulamaHatasi &&
    (q.error.kod === 'modul_kapali' || q.error.durum === 403)
  ) {
    return null;
  }

  return (
    <section
      aria-label={t('kayitGeriBildirim.geriBildirim.dersBaslik')}
      className="border-t border-kenar pt-4"
    >
      <h3 className="mb-3 text-base font-semibold">
        {t('kayitGeriBildirim.geriBildirim.dersBaslik')}
      </h3>
      {q.isPending ? (
        <ListeIskeleti satir={2} />
      ) : q.isError ? (
        <HataDurumu
          baslik={t('kayitGeriBildirim.geriBildirim.yuklenemedi')}
          aciklama={hataMesaji(q.error)}
          tekrarDene={() => void q.refetch()}
          className="py-6"
        />
      ) : q.data.geri_bildirimler.length === 0 ? (
        <p className="rounded-orta border border-dashed border-kenar px-4 py-5 text-center text-sm text-metin-ikincil">
          {t('kayitGeriBildirim.geriBildirim.dersBos', { n: q.data.katilimci_sayisi })}
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-metin-ikincil">
            {t('kayitGeriBildirim.geriBildirim.dersCevap', {
              n: q.data.ozet.toplam,
              toplam: q.data.katilimci_sayisi,
            })}
          </p>
          <SayilarOzeti sayilar={q.data.ozet} />
          <ul className="divide-y divide-kenar rounded-orta border border-kenar">
            {q.data.geri_bildirimler.map((g) => (
              <li key={g.id} className="flex flex-col gap-1 px-3 py-2.5 text-sm">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{g.gorunen_ad ?? t('operasyon.ortak.adsiz')}</span>
                  <DegerRozeti deger={g.deger} />
                  <span className="text-metin-ikincil">{zamanYaz(g.updated_at)}</span>
                </span>
                {g.konu_id ? (
                  <span className="text-metin-ikincil">
                    {t('kayitGeriBildirim.geriBildirim.zorlandi', {
                      konu:
                        konuAdlari.get(g.konu_id) ?? t('kayitGeriBildirim.geriBildirim.konuYok'),
                    })}
                  </span>
                ) : null}
                {g.not ? <span>{g.not}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
