import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Sinif birlestirici: kosullu siniflar + Tailwind catismalarini cozer. */
export function cn(...girdiler: ClassValue[]): string {
  return twMerge(clsx(girdiler));
}
