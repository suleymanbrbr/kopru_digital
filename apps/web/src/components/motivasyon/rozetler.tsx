'use client';

import type { MotivasyonOgrenciDurumu } from '@kopru/contracts';
import { t, type MessageKey } from '@kopru/i18n';
import { Award, Lock } from 'lucide-react';

import { Ilerleme } from './ortak';

import { BosDurum } from '@/components/bos-durum';
import { Kart } from '@/components/ui/kart';
import { cn } from '@/lib/cn';

type Rozetler = MotivasyonOgrenciDurumu['rozetler'];

const KADEME_STILI: Record<string, string> = {
  bronz: 'bg-uyari-yumusak text-uyari',
  gumus: 'bg-yuzey-ikincil text-metin-ikincil',
  altin: 'bg-vurgu-yumusak text-uyari',
};

function KademeRozeti({ kademe }: { kademe: string }) {
  return (
    <span
      className={cn(
        'rounded-full px-2 py-0.5 text-xs font-medium',
        KADEME_STILI[kademe] ?? KADEME_STILI.bronz,
      )}
    >
      {t(`motivasyon.rozet.kademe.${kademe}` as MessageKey)}
    </span>
  );
}

/**
 * Rozetler: kazanilanlar ve kilitliler (ilerlemeli). Gizli rozetler kazanilana kadar sunucudan hic
 * gelmez; kademe bronz/gumus/altin metinle de yazilir (renge dayanmaz). Siralama ya da kiyaslama yoktur.
 */
export function RozetlerKarti({ rozetler }: { rozetler: Rozetler }) {
  const { kazanilan, kilitli } = rozetler;
  return (
    <Kart aria-labelledby="rozet-baslik" className="flex flex-col gap-4 p-5">
      <div>
        <h2 id="rozet-baslik" className="text-base font-semibold">
          {t('motivasyon.rozet.baslik')}
        </h2>
        <p className="text-sm text-metin-ikincil">
          {t('motivasyon.rozet.ozet', { kazanilan: kazanilan.length })}
        </p>
      </div>

      {kazanilan.length === 0 ? (
        <BosDurum
          ikon={Award}
          baslik={t('motivasyon.rozet.bos')}
          aciklama={t('motivasyon.rozet.bosAciklama')}
          className="py-4"
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2" data-testid="rozet-kazanilan">
          {kazanilan.map((r) => (
            <li key={r.kod} className="flex gap-3 rounded-orta bg-basari-yumusak p-3">
              <Award className="mt-0.5 size-5 shrink-0" aria-hidden />
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                  {r.ad}
                  <KademeRozeti kademe={r.kademe} />
                </p>
                <p className="text-sm text-metin-ikincil">{r.aciklama}</p>
              </div>
            </li>
          ))}
        </ul>
      )}

      {kilitli.length > 0 ? (
        <div>
          <h3 className="mb-2 text-sm font-semibold">{t('motivasyon.rozet.kilitli')}</h3>
          <ul className="grid gap-3 sm:grid-cols-2" data-testid="rozet-kilitli">
            {kilitli.map((r) => (
              <li key={r.kod} className="flex gap-3 rounded-orta border border-kenar p-3">
                <Lock className="mt-0.5 size-5 shrink-0 text-metin-ikincil" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                    {r.ad}
                    <KademeRozeti kademe={r.kademe} />
                  </p>
                  <p className="mb-2 text-sm text-metin-ikincil">{r.aciklama}</p>
                  <Ilerleme
                    deger={r.ilerleme}
                    ust={r.esik}
                    etiket={r.ad}
                    metin={t('motivasyon.rozet.ilerleme', { ilerleme: r.ilerleme, esik: r.esik })}
                  />
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Kart>
  );
}
