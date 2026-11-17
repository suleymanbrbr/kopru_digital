'use client';

import { KarakterYanitiSema, type MotivasyonKozmetikSlotSema } from '@kopru/contracts';
import { t, type MessageKey } from '@kopru/i18n';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Lock, Shirt } from 'lucide-react';
import { useState } from 'react';
import type { z } from 'zod';

import { HataDurumu } from '@/components/hata-durumu';
import { Dugme } from '@/components/ui/button';
import { Iskelet, Kart } from '@/components/ui/kart';
import { Rozet } from '@/components/ui/rozet';
import { Uyari } from '@/components/ui/uyari';
import { hataMesaji } from '@/lib/api';
import { motivasyonIstek } from '@/lib/hesap-istek';
import { motivasyonHataMesaji } from '@/lib/motivasyon/hata';
import { kilitMetni, yuvayaGoreGrupla } from '@/lib/motivasyon/kozmetik';
import { motivasyonAnahtari, useKozmetikler } from '@/lib/motivasyon/veri';

type Slot = z.infer<typeof MotivasyonKozmetikSlotSema>;

/**
 * Kostum dolabi: kuşan / cikar; sahip olunmayanlarin acilma kosulu i18n metniyle yazilir (sunucu rozet
 * ve kozmetik adlarini Turkce gonderir, kilit metnini degil).
 */
export function KozmetikDolabi({ kurumId }: { kurumId: string }) {
  const qc = useQueryClient();
  const liste = useKozmetikler(kurumId);
  const [bekleyen, setBekleyen] = useState<string | null>(null);

  const degistir = useMutation({
    mutationFn: async (g: { slot: Slot; kod: string | null }) => {
      setBekleyen(g.kod ?? g.slot);
      const yol = `kurumlar/${kurumId}/karakter/kusanimlar/${g.slot}`;
      return g.kod
        ? motivasyonIstek(yol, {
            yontem: 'PUT',
            govde: { kozmetik_kodu: g.kod },
            sema: KarakterYanitiSema,
          })
        : motivasyonIstek(yol, { yontem: 'DELETE', sema: KarakterYanitiSema });
    },
    onSettled: () => {
      setBekleyen(null);
      return qc.invalidateQueries({ queryKey: motivasyonAnahtari(kurumId) });
    },
  });

  return (
    <Kart aria-labelledby="dolap-baslik" className="flex flex-col gap-4 p-5">
      <div>
        <h2 id="dolap-baslik" className="text-base font-semibold">
          {t('motivasyon.kozmetik.baslik')}
        </h2>
        <p className="text-sm text-metin-ikincil">{t('motivasyon.kozmetik.aciklama')}</p>
      </div>

      {degistir.isError ? <Uyari>{motivasyonHataMesaji(degistir.error)}</Uyari> : null}

      {liste.isPending ? (
        <div role="status" aria-label={t('ortak.yukleniyor')} className="flex flex-col gap-2">
          <Iskelet className="h-16 w-full" />
          <Iskelet className="h-16 w-full" />
        </div>
      ) : liste.isError ? (
        <HataDurumu
          aciklama={hataMesaji(liste.error)}
          tekrarDene={() => void liste.refetch()}
          className="py-6"
        />
      ) : (
        yuvayaGoreGrupla(liste.data.kozmetikler).map(({ slot, ogeler }) => (
          <section key={slot} aria-labelledby={`yuva-${slot}`}>
            <h3 id={`yuva-${slot}`} className="mb-2 text-sm font-semibold">
              {t(`motivasyon.kozmetik.slot.${slot}` as MessageKey)}
            </h3>
            <ul className="grid gap-2 sm:grid-cols-2">
              {ogeler.map((k) => (
                <li
                  key={k.kod}
                  data-kod={k.kod}
                  className="flex items-center gap-3 rounded-orta border border-kenar p-3"
                >
                  <span
                    aria-hidden
                    className="flex size-10 shrink-0 items-center justify-center rounded-full bg-yuzey-ikincil text-metin-ikincil"
                  >
                    {k.sahip ? <Shirt className="size-5" /> : <Lock className="size-5" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                      {k.ad}
                      <Rozet>{t(`motivasyon.kozmetik.nadirlik.${k.nadirlik}` as MessageKey)}</Rozet>
                    </p>
                    <p className="text-sm text-metin-ikincil">
                      {k.sahip ? t('motivasyon.kozmetik.acildi') : kilitMetni(k.acilma_kosulu)}
                    </p>
                  </div>
                  {k.sahip ? (
                    <Dugme
                      gorunum={k.kusanildi ? 'ikincil' : 'birincil'}
                      boyut="sm"
                      disabled={degistir.isPending && bekleyen !== null}
                      aria-label={t(
                        k.kusanildi ? 'motivasyon.kozmetik.cikarAd' : 'motivasyon.kozmetik.kusanAd',
                        { ad: k.ad },
                      )}
                      onClick={() => {
                        degistir.mutate({ slot: k.slot, kod: k.kusanildi ? null : k.kod });
                      }}
                    >
                      {k.kusanildi
                        ? t('motivasyon.kozmetik.cikar')
                        : t('motivasyon.kozmetik.kusan')}
                    </Dugme>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </Kart>
  );
}
