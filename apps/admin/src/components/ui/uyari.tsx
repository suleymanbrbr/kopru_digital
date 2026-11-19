import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

const TON = {
  bilgi: { sinif: 'border-birincil/40 bg-birincil-yumusak', Ikon: Info, rol: 'status' },
  basari: { sinif: 'border-basari/40 bg-basari-yumusak', Ikon: CheckCircle2, rol: 'status' },
  uyari: { sinif: 'border-uyari/40 bg-uyari-yumusak', Ikon: AlertTriangle, rol: 'status' },
  hata: { sinif: 'border-hata/40 bg-hata-yumusak', Ikon: XCircle, rol: 'alert' },
} as const;

/** Satir ici bildirim: hata `alert`, digerleri `status` olarak okunur. */
export function Uyari({
  ton = 'bilgi',
  baslik,
  className,
  children,
}: {
  ton?: keyof typeof TON;
  baslik?: string | undefined;
  className?: string;
  children?: ReactNode;
}) {
  const { sinif, Ikon, rol } = TON[ton];
  return (
    <div role={rol} className={cn('flex gap-3 rounded-orta border p-3 text-sm', sinif, className)}>
      <Ikon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        {baslik ? <p className="font-medium">{baslik}</p> : null}
        {children ? <div className={cn(baslik && 'mt-1')}>{children}</div> : null}
      </div>
    </div>
  );
}
