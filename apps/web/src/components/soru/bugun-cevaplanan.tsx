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
import { useSorularim } from '@/lib/soru/veri';

/** Ogrenci Bugun: cevaplanan sorularim (son 3); `soru_sor` modulu kapaliysa gosterilmez. */
export function BugunCevaplananKarti() {
  const { uyelik, acikModuller } = useKurum();
  const kurumId = uyelik.kurumId;
  const etkin = acikModuller.includes('soru_sor');
  const q = useSorularim(kurumId, { durum: 'cevaplandi' }, etkin);
  if (!etkin) return null;
  const liste = q.sorular.slice(0, 3);
  return (
    <BolumKarti
      baslik={t('bugun.cevaplananSorular')}
      yukleniyor={q.isPending}
      hata={q.isError}
      tekrarDene={() => void q.refetch()}
    >
      {liste.length === 0 ? (
        <BosDurum
          ikon={MessageCircleQuestion}
          baslik={t('bugun.cevaplananBos')}
          aciklama={t('bugun.cevaplananBosAciklama')}
        />
      ) : (
        <>
          <ul className="divide-y divide-kenar" data-testid="bugun-cevaplanan">
            {liste.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/${kurumId}/soru-sor/${s.id}`}
                  className="flex items-center justify-between gap-3 px-5 py-3 text-sm hover:bg-yuzey-ikincil"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">
                      {s.baslik ?? s.metin_onizleme ?? bransAdi(s.brans_kodu)}
                    </span>
                    <span className="text-metin-ikincil">
                      {bransAdi(s.brans_kodu)} · {goreliZaman(s.son_hareket_at)}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <div className="border-t border-kenar p-3">
            <Link
              href={`/${kurumId}/soru-sor`}
              className={dugmeStili({ gorunum: 'hayalet', boyut: 'sm' })}
            >
              {t('bugun.cevaplananTumu')}
            </Link>
          </div>
        </>
      )}
    </BolumKarti>
  );
}
