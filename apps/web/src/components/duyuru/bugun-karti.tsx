'use client';

import { t } from '@kopru/i18n';
import { Megaphone, Pin } from 'lucide-react';
import Link from 'next/link';

import { Rozet } from '@/components/ui/rozet';
import { useKurum } from '@/kurum/baglam';
import { useDuyurularim } from '@/lib/duyuru/veri';

/**
 * Bugun ekraninin duyuru karti: sabitlenmis ya da okunmamis en ust duyuru (sunucu sabitleri uste siralar).
 * Gosterilecek duyuru yoksa, `duyuru` modulu kapaliysa ya da yukleme/hata durumunda hic cizilmez (Bugun'u
 * bozmaz). Tek satirlik, kucuk bir kart: asil icerik "Duyurular" sayfasindadir.
 */
export function BugunDuyuruKarti() {
  const { uyelik, acikModuller } = useKurum();
  const kurumId = uyelik.kurumId;
  const etkin = acikModuller.includes('duyuru');
  const q = useDuyurularim(kurumId, false, etkin);
  if (!etkin) return null;
  const ogeler = q.data?.pages[0]?.ogeler ?? [];
  const oge = ogeler.find((o) => o.sabit || o.okundu_at === null);
  if (!oge) return null;
  const okunmamisSayisi = ogeler.filter((o) => o.okundu_at === null).length;
  const okunmamis = oge.okundu_at === null;
  const kok = `/${kurumId}`;

  return (
    <section
      aria-label={oge.sabit ? t('bugun.duyuruSabit') : t('bugun.duyuruYeni')}
      data-testid="bugun-duyuru-karti"
      className="flex flex-col gap-2 rounded-buyuk border border-kenar bg-birincil-yumusak/50 px-4 py-3 sm:flex-row sm:items-center sm:gap-4"
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span
          aria-hidden
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-yuzey text-metin-ikincil"
        >
          {oge.sabit ? (
            <Pin className="size-[1.125rem]" />
          ) : (
            <Megaphone className="size-[1.125rem]" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className={okunmamis ? 'font-semibold' : 'font-medium'}>{oge.baslik}</span>
            {oge.sabit ? <Rozet>{t('duyurular.sabit')}</Rozet> : null}
            {okunmamis ? <Rozet ton="bilgi">{t('duyurular.okunmamisIsareti')}</Rozet> : null}
          </p>
          <p className="line-clamp-1 text-sm text-metin-ikincil">{oge.govde}</p>
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 pl-12 text-sm font-medium sm:pl-0">
        <Link
          href={`${kok}/duyurular/${oge.id}`}
          className="text-birincil underline underline-offset-2"
        >
          {t('bugun.duyuruOku')}
          <span className="sr-only">: {oge.baslik}</span>
        </Link>
        <Link href={`${kok}/duyurular`} className="text-birincil underline underline-offset-2">
          {okunmamisSayisi > 1
            ? t('bugun.duyuruDahaSayi', { n: okunmamisSayisi })
            : t('bugun.duyuruDaha')}
        </Link>
      </div>
    </section>
  );
}
