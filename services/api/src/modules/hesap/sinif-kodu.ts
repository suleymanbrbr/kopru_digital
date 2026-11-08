import { randomInt } from 'node:crypto';

import {
  KATILIM_KODU_ALFABESI,
  KATILIM_KODU_UZUNLUK,
  type KatilimKoduSema,
} from '@kopru/contracts';
import { AppError } from '@kopru/service-kit';
import type { z } from 'zod';

import type { sinifKatilimKodlari } from '../../db/schema.js';

/** Veritabani CHECK'i ile ayni desen: `^[2-9A-HJKMNP-Z]{8}$`. */
const KOD_DESENI = /^[2-9A-HJKMNP-Z]{8}$/;

/** Kriptografik rastgele, onyargisiz (`randomInt`) 8 karakterlik kod. */
export function katilimKoduUret(): string {
  let kod = '';
  for (let i = 0; i < KATILIM_KODU_UZUNLUK; i++) {
    kod += KATILIM_KODU_ALFABESI.charAt(randomInt(KATILIM_KODU_ALFABESI.length));
  }
  return kod;
}

/** Kullanici girdisini temizler (bosluk/tire, kucuk harf); desene uymuyorsa `null`. */
export function katilimKoduNormallestir(girdi: string): string | null {
  const kod = girdi.replace(/[\s-]/g, '').toUpperCase();
  return KOD_DESENI.test(kod) ? kod : null;
}

type KodSatiri = typeof sinifKatilimKodlari.$inferSelect;

export const katilimKoduYaniti = (k: KodSatiri): z.infer<typeof KatilimKoduSema> => ({
  id: k.id,
  grup_id: k.grup_id,
  kod: k.kod,
  aktif: k.aktif,
  expires_at: k.expires_at?.toISOString() ?? null,
  max_kullanim: k.max_kullanim,
  kullanim_sayisi: k.kullanim_sayisi,
  iptal_at: k.iptal_at?.toISOString() ?? null,
  created_at: k.created_at.toISOString(),
});

const DAKIKA_MS = 60_000;

/**
 * Basarisiz kod cozme denemesi sayaci (docs/schema/api.md): 15 dakika icinde 5 basarisiz
 * deneme -> anahtar 15 dakika bloklanir (`429`). Anahtarlar IP ve kullanicidir. Bellek ici ve
 * surec basinadir; cok kopyali calistirmada her kopya kendi sayacini tutar (bilinen sinir).
 */
export class BasarisizDenemeSiniri {
  private readonly kayitlar = new Map<
    string,
    { sayi: number; ilkAt: number; engelBitis: number }
  >();

  constructor(
    private readonly azami = 5,
    private readonly pencereMs = 15 * DAKIKA_MS,
    private readonly simdi: () => number = Date.now,
  ) {}

  /** Anahtarlardan biri engelliyse `429` firlatir. */
  denetle(...anahtarlar: string[]): void {
    const an = this.simdi();
    for (const anahtar of anahtarlar) {
      const k = this.kayitlar.get(anahtar);
      if (!k) continue;
      if (k.engelBitis > an) {
        throw new AppError(
          429,
          'rate_limited',
          'Çok fazla geçersiz kod denediniz. Lütfen daha sonra tekrar deneyin.',
          { tekrar_dene_sn: Math.ceil((k.engelBitis - an) / 1000) },
        );
      }
      if (k.engelBitis > 0 || an - k.ilkAt > this.pencereMs) this.kayitlar.delete(anahtar);
    }
  }

  basarisiz(...anahtarlar: string[]): void {
    const an = this.simdi();
    for (const anahtar of anahtarlar) {
      const mevcut = this.kayitlar.get(anahtar);
      const k =
        mevcut && an - mevcut.ilkAt <= this.pencereMs
          ? mevcut
          : { sayi: 0, ilkAt: an, engelBitis: 0 };
      k.sayi += 1;
      if (k.sayi >= this.azami) k.engelBitis = an + this.pencereMs;
      this.kayitlar.set(anahtar, k);
    }
    // Bellek sinirsiz buyumesin: suresi dolan kayitlari ara sira temizle.
    if (this.kayitlar.size > 10_000) {
      for (const [anahtar, k] of this.kayitlar) {
        if (k.engelBitis <= an && an - k.ilkAt > this.pencereMs) this.kayitlar.delete(anahtar);
      }
    }
  }
}
