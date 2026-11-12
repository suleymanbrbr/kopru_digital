'use client';

import { t } from '@kopru/i18n';
import { MessageCircleQuestion } from 'lucide-react';
import Link from 'next/link';

import { BosDurum } from '@/components/bos-durum';
import { BolumKarti } from '@/components/bugun/bolum-karti';
import { dugmeStili } from '@/components/ui/button';
import { useKurum } from '@/kurum/baglam';
import { bransAdi } from '@/lib/bransler';
import { goreliZaman } from '@/lib/soru/soru';
import { useBekleyenSayisi } from '@/lib/soru/veri';

/** Ogretmen/yonetici Bugun: cevap bekleyen soru sayisi ve en eskisi; `soru_sor` modulu kapaliysa gosterilmez. */
export function BugunSoruKarti() {
  const { uyelik, acikModuller } = useKurum();
  const kurumId = uyelik.kurumId;
  const etkin = acikModuller.includes('soru_sor');
  const q = useBekleyenSayisi(kurumId, etkin);
  if (!etkin) return null;
  const sayi = q.data;
  return (
    <BolumKarti
      baslik={t('bugun.sorular')}
      yukleniyor={q.isPending}
      hata={q.isError}
      tekrarDene={() => void q.refetch()}
    >
      {!sayi || sayi.bekleyen === 0 ? (
        <BosDurum
          ikon={MessageCircleQuestion}
          baslik={t('bugun.soruBos')}
          aciklama={t('bugun.soruBosAciklama')}
        >
          <Link href={`/${kurumId}/sorular`} className={dugmeStili({ gorunum: 'ikincil' })}>
            {t('bugun.soruBosEylem')}
          </Link>
        </BosDurum>
      ) : (
        <div className="flex flex-col gap-3 p-5" data-testid="bugun-soru-karti">
          <p>
            <span className="text-4xl font-semibold" data-testid="bugun-soru-sayisi">
              {sayi.bekleyen}
            </span>{' '}
            <span className="text-base text-metin-ikincil">
              {t('soruSor.bugun.bekleyen', { n: sayi.bekleyen })}
            </span>
          </p>
          {sayi.en_eski_at ? (
            <p className="text-sm text-metin-ikincil">
              {t('soruSor.bugun.enEski', { sure: goreliZaman(sayi.en_eski_at) })}
            </p>
          ) : null}
          {sayi.branslar.length > 0 ? (
            <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
              {sayi.branslar.map((b) => (
                <li key={b.brans_kodu}>
                  {bransAdi(b.brans_kodu)}: <span className="font-medium">{b.bekleyen}</span>
                </li>
              ))}
            </ul>
          ) : null}
          <Link
            href={`/${kurumId}/sorular`}
            className={dugmeStili({ gorunum: 'birincil', className: 'self-start' })}
          >
            {t('bugun.soruBosEylem')}
          </Link>
        </div>
      )}
    </BolumKarti>
  );
}
