import type { Database, Tx } from '@kopru/service-kit';

import { withSistem } from './with-sistem.js';

export interface KurumOlusturBaglami {
  kullaniciId: string;
  kurumId: string;
  /** Yalnizca UUID ise denetim kaydina yazilir. */
  istekId?: string | undefined;
}

/**
 * Kurum onboarding'i: kiraci henuz yok, bu yuzden `api_sistem` havuzunda calisir (ADR 0003).
 * `withSistem` yalnizca `src/sistem/**` altindan cagrilir (ESLint `kopru/sistem-siniri`); modul kodu
 * is govdesini `fn` ile verir, eylem adi ve nedeni burada sabittir ve denetim kaydina yazilir.
 */
export function kurumOlusturSistem<T>(
  sistemDb: Database | null,
  baglam: KurumOlusturBaglami,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  return withSistem(
    sistemDb,
    {
      eylem: 'sistem.kurum_olustur',
      neden: 'Kurum onboarding: kiracı henüz yok, kurum ve ilk üyelikler oluşturuluyor',
      aktorKullaniciId: baglam.kullaniciId,
      kurumId: baglam.kurumId,
      hedefTuru: 'kurum',
      hedefId: baglam.kurumId,
      istekId: baglam.istekId,
    },
    fn,
  );
}
