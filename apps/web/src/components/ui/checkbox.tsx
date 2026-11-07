'use client';

import { Check } from 'lucide-react';
import { Checkbox as CheckboxOge } from 'radix-ui';
import type { ComponentProps } from 'react';

import { cn } from '@/lib/cn';

export function OnayKutusu({ className, ...props }: ComponentProps<typeof CheckboxOge.Root>) {
  return (
    <CheckboxOge.Root
      className={cn(
        'flex size-6 shrink-0 items-center justify-center rounded-kucuk border-2 border-metin-ikincil/60 bg-yuzey text-birincil-uzeri transition-colors data-[state=checked]:border-birincil data-[state=checked]:bg-birincil',
        className,
      )}
      {...props}
    >
      <CheckboxOge.Indicator>
        <Check className="size-4" strokeWidth={3} aria-hidden />
      </CheckboxOge.Indicator>
    </CheckboxOge.Root>
  );
}
