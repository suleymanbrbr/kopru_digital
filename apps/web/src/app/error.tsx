'use client';

import { HataDurumu } from '@/components/hata-durumu';

export default function Hata({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main id="icerik" className="mx-auto flex min-h-dvh max-w-md items-center">
      <HataDurumu istekNo={error.digest} tekrarDene={reset} />
    </main>
  );
}
