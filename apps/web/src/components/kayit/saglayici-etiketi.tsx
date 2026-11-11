import type { KaynakSaglayici } from '@kopru/contracts';
import { CirclePlay, Cloud, FolderOpen, Link2, Video, type LucideIcon } from 'lucide-react';

import { saglayiciAdi } from '@/lib/kayit/saglayici';

const IKONLAR: Record<KaynakSaglayici, LucideIcon> = {
  zoom: Video,
  drive: FolderOpen,
  youtube: CirclePlay,
  onedrive: Cloud,
  diger: Link2,
};

/** Saglayici ikonu; ad her zaman metin olarak da gosterilir (ikon tek basina anlam tasimaz). */
export function SaglayiciIkonu({
  saglayici,
  className = 'size-5',
}: {
  saglayici: KaynakSaglayici;
  className?: string;
}) {
  const Ikon = IKONLAR[saglayici];
  return <Ikon className={className} aria-hidden />;
}

export function SaglayiciEtiketi({ saglayici }: { saglayici: KaynakSaglayici }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-metin-ikincil">
      <SaglayiciIkonu saglayici={saglayici} className="size-4" />
      {saglayiciAdi(saglayici)}
    </span>
  );
}
