'use client';

import { useBransler } from '@/lib/bransler-sorgu';

/** `<select>` icinde brans `<option>`lari (api'den). */
export function BransSecenekleri() {
  const bransler = useBransler();
  return (
    <>
      {bransler.map((b) => (
        <option key={b.kod} value={b.kod}>
          {b.ad}
        </option>
      ))}
    </>
  );
}
