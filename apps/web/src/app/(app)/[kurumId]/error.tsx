'use client';

import { HataDurumu } from '@/components/hata-durumu';

export default function SayfaHatasi({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <HataDurumu istekNo={error.digest} tekrarDene={reset} />;
}
