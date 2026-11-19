'use client';

import { PlatformMesajiAcikYanitSema } from '@kopru/contracts';
import { t } from '@kopru/i18n';
import { useQuery } from '@tanstack/react-query';
import { Info, OctagonAlert, TriangleAlert, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { Rozet } from '@/components/ui/rozet';
import { cn } from '@/lib/cn';
import { kapatilanlariOku, mesajiKapat } from '@/lib/platform-mesaji';

const tonlar = {
  bilgi: { kutu: 'bg-birincil-yumusak', rozet: 'bilgi', ikon: Info },
  uyari: { kutu: 'bg-uyari-yumusak', rozet: 'uyari', ikon: TriangleAlert },
  kritik: { kutu: 'bg-hata-yumusak', rozet: 'hata', ikon: OctagonAlert },
} as const;

/**
 * Platform bakim/duyuru mesaji (`GET /v1/platform-mesaji`, kimliksiz): tum sayfalarda, giris dahil,
 * ustte. Onem duzeyine gore ton; kapatma mesaj kimligine gore tarayicida hatirlanir.
 */
export function PlatformMesaji() {
  // Mesaj istemcide yuklenir; ilk cizimde yok oldugundan kapatilanlar dogrudan okunabilir.
  const [kapatilan, setKapatilan] = useState<string[]>(() =>
    typeof window === 'undefined' ? [] : kapatilanlariOku(),
  );
  const kutu = useRef<HTMLElement>(null);

  const sorgu = useQuery({
    queryKey: ['platform-mesaji'],
    refetchInterval: 5 * 60_000,
    retry: false,
    queryFn: async () => {
      const yanit = await fetch('/api/platform-mesaji', { cache: 'no-store' });
      if (!yanit.ok) return { mesaj: null };
      return PlatformMesajiAcikYanitSema.parse(await yanit.json());
    },
  });
  const mesaj = sorgu.data?.mesaj ?? null;
  const gorunur = mesaj !== null && !kapatilan.includes(mesaj.id);

  // Sabit yan menu ve ust cubuk afisin altindan baslasin.
  useEffect(() => {
    const kok = document.documentElement;
    if (!gorunur || !kutu.current) {
      kok.style.removeProperty('--afis-h');
      return;
    }
    const el = kutu.current;
    const olc = () => {
      kok.style.setProperty('--afis-h', `${String(el.offsetHeight)}px`);
    };
    olc();
    const izleyici = new ResizeObserver(olc);
    izleyici.observe(el);
    return () => {
      izleyici.disconnect();
      kok.style.removeProperty('--afis-h');
    };
  }, [gorunur]);

  if (!mesaj || !gorunur) return null;
  const ton = tonlar[mesaj.onem];
  const Ikon = ton.ikon;
  return (
    <section
      ref={kutu}
      aria-label={t(`platformMesaji.onem.${mesaj.onem}`)}
      role={mesaj.onem === 'kritik' ? 'alert' : 'status'}
      data-onem={mesaj.onem}
      className={cn(
        'sticky top-0 z-50 flex items-start gap-3 border-b border-kenar px-4 py-2.5 text-sm text-metin',
        ton.kutu,
      )}
    >
      <Ikon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        <Rozet ton={ton.rozet} className="mr-2 border border-kenar">
          {t(`platformMesaji.onem.${mesaj.onem}`)}
        </Rozet>
        <span className="font-semibold">{mesaj.baslik}</span>
        <span className="text-metin-ikincil"> · </span>
        <span>{mesaj.metin}</span>
      </div>
      <button
        type="button"
        aria-label={t('platformMesaji.kapat')}
        onClick={() => {
          setKapatilan(mesajiKapat(mesaj.id));
        }}
        className="-my-1.5 -mr-2 flex size-11 shrink-0 items-center justify-center rounded-orta hover:bg-yuzey/60"
      >
        <X className="size-4" aria-hidden />
      </button>
    </section>
  );
}
