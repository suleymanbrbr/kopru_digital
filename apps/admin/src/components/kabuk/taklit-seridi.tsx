'use client';

import { t } from '@kopru/i18n';
import { Eye } from 'lucide-react';
import Link from 'next/link';

import { dakikaSaniye } from '@/lib/bicim';
import { useKalanSure } from '@/lib/kalan-sure';
import type { TaklitOzeti } from '@/lib/tipler';

/** Etkin taklit oturumunu her sayfada hatirlatan serit. */
export function TaklitSeridi({ taklit }: { taklit: TaklitOzeti }) {
  const kalan = useKalanSure(taklit.bitis_at);
  if (kalan <= 0) return null;
  const { dk, sn } = dakikaSaniye(kalan);
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-uyari/40 bg-uyari-yumusak px-4 py-2 text-sm text-metin sm:px-6">
      <Eye className="size-4 text-uyari" aria-hidden />
      <span className="font-medium">{t('yonetim.taklit.basladi')}</span>
      <span>
        {t('yonetim.taklit.kalan')}: {t('yonetim.taklit.kalanDeger', { dk, sn })}
      </span>
      <Link href="/taklit" className="ml-auto font-medium underline underline-offset-2">
        {t('yonetim.nav.taklit')}
      </Link>
    </div>
  );
}
