import { t } from '@kopru/i18n';

import { Iskelet } from '@/components/ui/kart';

/** Kurum duzeni yuklenirken kabugun iskeleti. */
export default function Yukleniyor() {
  return (
    <div role="status" aria-label={t('ortak.yukleniyor')} className="min-h-dvh lg:pl-64">
      <div className="fixed inset-y-0 left-0 hidden w-64 flex-col gap-4 border-r border-kenar bg-yuzey p-4 lg:flex">
        <Iskelet className="h-8 w-32" />
        <Iskelet className="h-14 w-full" />
        {Array.from({ length: 7 }, (_, i) => (
          <Iskelet key={i} className="h-10 w-full" />
        ))}
      </div>
      <div className="mx-auto max-w-5xl px-4 pt-8 sm:px-8 lg:px-10 lg:pt-10">
        <Iskelet className="h-9 w-64" />
        <Iskelet className="mt-3 h-5 w-80 max-w-full" />
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <Iskelet className="h-52 rounded-buyuk" />
          <Iskelet className="h-52 rounded-buyuk" />
        </div>
      </div>
    </div>
  );
}
