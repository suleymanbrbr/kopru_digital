'use client';

import { t } from '@kopru/i18n';
import { TriangleAlert } from 'lucide-react';

import { Dugme } from '@/components/ui/button';
import { cn } from '@/lib/cn';

export function HataDurumu({
  baslik = t('hata.sayfaBaslik'),
  aciklama = t('hata.sayfaAciklama'),
  istekNo,
  tekrarDene,
  className,
}: {
  baslik?: string;
  aciklama?: string;
  istekNo?: string | undefined;
  tekrarDene?: () => void;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn('flex flex-col items-center px-4 py-12 text-center', className)}
    >
      <span className="mb-4 flex size-12 items-center justify-center rounded-full bg-hata-yumusak text-hata">
        <TriangleAlert className="size-6" aria-hidden />
      </span>
      <h2 className="text-lg font-semibold">{baslik}</h2>
      <p className="mt-1 max-w-sm text-sm text-metin-ikincil">{aciklama}</p>
      {tekrarDene ? (
        <Dugme className="mt-5" onClick={tekrarDene}>
          {t('ortak.tekrarDene')}
        </Dugme>
      ) : null}
      {istekNo ? (
        <p className="mt-4 text-xs text-metin-ikincil">{t('hata.istekNo', { id: istekNo })}</p>
      ) : null}
    </div>
  );
}
