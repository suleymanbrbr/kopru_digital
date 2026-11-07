'use client';

import { t } from '@kopru/i18n';
import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useSyncExternalStore } from 'react';

import { cn } from '@/lib/cn';

const secenekler = [
  { deger: 'light', etiket: 'kabuk.temaAcik', Ikon: Sun },
  { deger: 'dark', etiket: 'kabuk.temaKoyu', Ikon: Moon },
  { deger: 'system', etiket: 'kabuk.temaSistem', Ikon: Monitor },
] as const;

const bos = () => () => undefined;

/** Acik / koyu / sistem secimi (radyo grubu). */
export function TemaAnahtari({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  // Sunucu ciktisiyla uyumsuzlugu onlemek icin secim istemcide gosterilir.
  const istemci = useSyncExternalStore(
    bos,
    () => true,
    () => false,
  );

  return (
    <div
      role="radiogroup"
      aria-label={t('kabuk.tema')}
      className={cn(
        'inline-flex rounded-orta border border-kenar bg-yuzey-ikincil p-0.5',
        className,
      )}
    >
      {secenekler.map(({ deger, etiket, Ikon }) => {
        const secili = istemci && theme === deger;
        return (
          <button
            key={deger}
            type="button"
            role="radio"
            aria-checked={secili}
            aria-label={t(etiket)}
            title={t(etiket)}
            onClick={() => {
              setTheme(deger);
            }}
            className={cn(
              'flex h-8 w-9 items-center justify-center rounded-kucuk text-metin-ikincil transition-colors',
              secili && 'bg-yuzey text-metin',
            )}
          >
            <Ikon className="size-4" aria-hidden />
          </button>
        );
      })}
    </div>
  );
}
