'use client';

import { t } from '@kopru/i18n';
import { CircleCheck } from 'lucide-react';
import Link from 'next/link';

import { BosDurum } from '@/components/bos-durum';
import { BolumKarti } from '@/components/bugun/bolum-karti';
import { kisaTarih } from '@/components/ogrenme/ortak';
import { dugmeStili } from '@/components/ui/button';
import { useKurum } from '@/kurum/baglam';
import { koclukYolu } from '@/lib/degerlendirme/model';
import { useDegerlendirmeHatirlatma } from '@/lib/degerlendirme/veri';

const GORUNEN = 5;

/**
 * Öğretmen/yönetici Bugün: "Bu hafta değerlendirmesi olmayan öğrencilerim". Öğrenciye dokununca Koçluk sekmesi
 * ve değerlendirme yazma penceresi açılır. Kapsamında öğrenci yoksa kart hiç gösterilmez.
 */
export function BugunDegerlendirmeKarti() {
  const { uyelik } = useKurum();
  const kurumId = uyelik.kurumId;
  const q = useDegerlendirmeHatirlatma(kurumId);
  if (q.data?.ogrenci_sayisi === 0) return null;
  const liste = q.data?.ogrenciler ?? [];
  const gorunen = liste.slice(0, GORUNEN);
  const kalan = (q.data?.eksik_sayisi ?? 0) - gorunen.length;
  return (
    <BolumKarti
      baslik={t('degerlendirme.hatirlatma.baslik')}
      yukleniyor={q.isPending}
      hata={q.isError}
      tekrarDene={() => void q.refetch()}
    >
      {liste.length === 0 ? (
        <BosDurum ikon={CircleCheck} baslik={t('degerlendirme.hatirlatma.bos')} />
      ) : (
        <div data-testid="degerlendirme-hatirlatma">
          <p className="px-5 pt-3 text-sm text-metin-ikincil">
            {t('degerlendirme.hatirlatma.aciklama')}
          </p>
          <ul className="divide-y divide-kenar">
            {gorunen.map((o) => (
              <li key={o.ogrenci_id}>
                <Link
                  href={koclukYolu(kurumId, o.ogrenci_id, true)}
                  aria-label={t('degerlendirme.hatirlatma.yaz', {
                    ad: o.ogrenci_ad ?? t('hesap.uye.adsiz'),
                  })}
                  className="flex min-h-12 items-center justify-between gap-3 px-5 py-2 text-sm hover:bg-yuzey-ikincil"
                >
                  <span className="min-w-0 truncate font-medium">
                    {o.ogrenci_ad ?? t('hesap.uye.adsiz')}
                  </span>
                  <span className="shrink-0 text-metin-ikincil">
                    {o.son_degerlendirme_gun
                      ? t('degerlendirme.hatirlatma.sonDegerlendirme', {
                          tarih: kisaTarih(o.son_degerlendirme_gun),
                        })
                      : t('degerlendirme.hatirlatma.hicYok')}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-kenar p-3">
            <p className="px-2 text-sm text-metin-ikincil">
              {kalan > 0 ? t('degerlendirme.hatirlatma.dahaFazla', { n: kalan }) : ''}
            </p>
            <Link
              href={`/${kurumId}/ogrenciler`}
              className={dugmeStili({ gorunum: 'hayalet', boyut: 'sm' })}
            >
              {t('degerlendirme.hatirlatma.tumOgrenciler')}
            </Link>
          </div>
        </div>
      )}
    </BolumKarti>
  );
}
