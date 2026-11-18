import type { Database, Tx } from '@kopru/service-kit';

import { withSistem } from './with-sistem.js';

export interface PlatformMufredatBaglami {
  /** Islemi yapan platform yoneticisi (`hesap.kullanicilar.id`). */
  aktorKullaniciId: string;
  /** Kisa eylem adi: `taslak_ac`, `konu_ekle`, `yayinla`... Denetimde `platform.mufredat.<eylem>`. */
  eylem: string;
  /** Degisiklik notu / gerekce (denetim `neden` alani). */
  neden: string;
  hedefId?: string;
  /** Denetim `sonra` alani: kimlik/sayi (kisisel veri yok). */
  ayrinti?: Record<string, unknown>;
}

/**
 * Platform mufredat editoru yazmalari: `api_sistem` islemi + `hesap.denetim_kayitlari` satiri. Denetim
 * yazimi tek bu yardimcidadir; platform kimlik paketi (P1) kendi denetim yardimcisini getirince yalniz bu
 * dosya degisir. `withSistem` yalnizca `src/sistem/**` altindan cagrilir (ADR 0003).
 */
export function platformMufredatIslemi<T>(
  db: Pick<Database, 'orm'> | null,
  baglam: PlatformMufredatBaglami,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  return withSistem(
    db,
    {
      eylem: `platform.mufredat.${baglam.eylem}`,
      neden: baglam.neden,
      aktorKullaniciId: baglam.aktorKullaniciId,
      hedefTuru: 'mufredat',
      ...(baglam.hedefId ? { hedefId: baglam.hedefId } : {}),
      ...(baglam.ayrinti ? { ayrinti: baglam.ayrinti } : {}),
    },
    fn,
  );
}
