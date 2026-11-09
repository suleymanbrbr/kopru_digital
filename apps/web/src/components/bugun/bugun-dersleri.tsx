'use client';

import { t } from '@kopru/i18n';
import { CalendarClock } from 'lucide-react';
import Link from 'next/link';
import { useMemo } from 'react';

import { BolumKarti } from './bolum-karti';

import { BosDurum } from '@/components/bos-durum';
import { useAralikDersleri } from '@/components/takvim/ders-verisi';
import { dugmeStili } from '@/components/ui/button';
import { Rozet } from '@/components/ui/rozet';
import { useKurum } from '@/kurum/baglam';
import { bransAdi } from '@/lib/bransler';
import { cn } from '@/lib/cn';
import { useGruplar, useOgretmenler, useSaatDilimi } from '@/lib/operasyon-verisi';
import { bugunYerel, saatAraligi, tarihEkle, yerelUtc } from '@/lib/saat';

/**
 * "Bugun" ekraninin ders karti: kurumun saat dilimine gore bugunun dersleri. Kapsami `api` belirler
 * (ogretmen kendi dersleri, ogrenci kendi dersleri, sahip/yonetici kurum). `takvim` modulu kapaliysa
 * kart hic cizilmez.
 */
export function BugunDersleriKarti() {
  const { uyelik, acikModuller } = useKurum();
  if (!acikModuller.includes('takvim')) return null;
  return <Kart kurumId={uyelik.kurumId} />;
}

function Kart({ kurumId }: { kurumId: string }) {
  const { rol } = useKurum();
  const personel = rol !== 'ogrenci';
  const yonetim = rol === 'sahip' || rol === 'yonetici';
  const { saatDilimi, hazir } = useSaatDilimi(kurumId);
  const bugun = bugunYerel(saatDilimi);
  const veri = useAralikDersleri({
    kurumId,
    baslangic: yerelUtc(bugun, '00:00', saatDilimi),
    bitis: yerelUtc(tarihEkle(bugun, 1), '00:00', saatDilimi),
    etkin: hazir,
  });
  const gruplar = useGruplar(kurumId, personel);
  const ogretmenler = useOgretmenler(kurumId, yonetim);
  const dersler = useMemo(
    () => [...veri.dersler].sort((a, b) => Date.parse(a.baslangic_at) - Date.parse(b.baslangic_at)),
    [veri.dersler],
  );

  return (
    <div className="md:col-span-2">
      <BolumKarti
        baslik={t('bugun.dersler')}
        yukleniyor={veri.isPending}
        hata={veri.isError}
        tekrarDene={() => void veri.refetch()}
      >
        {dersler.length === 0 ? (
          <BosDurum
            ikon={CalendarClock}
            baslik={t('bugun.dersBos')}
            aciklama={
              personel ? t('bugun.dersBosAciklama') : t('operasyon.takvim.bosOgrenciAciklama')
            }
          >
            {personel ? (
              <Link href={`/${kurumId}/takvim`} className={dugmeStili({ gorunum: 'ikincil' })}>
                {t('bugun.dersBosEylem')}
              </Link>
            ) : null}
          </BosDurum>
        ) : (
          <>
            <ul className="divide-y divide-kenar">
              {dersler.map((d) => {
                const ad = gruplar.adlar.get(d.grup_id)?.etiket ?? bransAdi(d.brans_kodu);
                const ogretmen = yonetim ? ogretmenler.adlar.get(d.ogretmen_id) : undefined;
                return (
                  <li key={d.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3">
                    <p
                      className={cn(
                        'w-28 shrink-0 text-sm font-semibold tabular-nums',
                        d.durum === 'iptal' && 'line-through',
                      )}
                    >
                      {saatAraligi(d.baslangic_at, d.bitis_at, saatDilimi)}
                    </p>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">
                        {ad}
                        {d.baslik ? ` · ${d.baslik}` : ''}
                      </p>
                      {ogretmen ? (
                        <p className="truncate text-sm text-metin-ikincil">{ogretmen}</p>
                      ) : null}
                    </div>
                    <Rozet
                      ton={
                        d.durum === 'tamamlandi' ? 'basari' : d.durum === 'iptal' ? 'notr' : 'bilgi'
                      }
                    >
                      {t(`operasyon.takvim.durum.${d.durum}`)}
                    </Rozet>
                  </li>
                );
              })}
            </ul>
            <div className="border-t border-kenar px-5 py-3">
              <Link
                href={`/${kurumId}/takvim`}
                className="text-sm font-medium text-birincil underline underline-offset-2"
              >
                {t('bugun.dersBosEylem')}
              </Link>
            </div>
          </>
        )}
      </BolumKarti>
    </div>
  );
}
