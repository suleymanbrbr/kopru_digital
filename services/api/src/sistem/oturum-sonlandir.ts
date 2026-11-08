import type { Database } from '@kopru/service-kit';
import { and, eq, inArray } from 'drizzle-orm';

import { oturumlar } from '../db/schema.js';
import { withSistem } from './with-sistem.js';

export interface OturumSonlandirBaglami {
  kullaniciId: string;
  /** Silinecek oturum kimlikleri (sahiplik `kullanici_id` kosuluyla ayrica zorlanir). */
  oturumIdleri: string[];
  /** Tek oturum sonlandirmada hedef; yoksa hedef kullanicinin tum oturumlaridir. */
  hedefOturumId?: string;
  /** Denetim kaydinin `sonra` alanina (kisisel veri yok). */
  ayrinti?: Record<string, unknown>;
}

/**
 * Kullanicinin kendi oturum satirlarini siler ve denetim kaydini AYNI islemde yazar. Oturumlar
 * kiracisiz tablodur; denetim satiri kurumsuz oldugu icin yalniz `api_sistem` yazabilir (ADR 0003).
 * Silinen satir sayisini doner. `withSistem` yalniz `src/sistem/**` altindan cagrilir.
 */
export async function oturumSonlandirSistem(
  sistemDb: Database | null,
  baglam: OturumSonlandirBaglami,
): Promise<number> {
  if (baglam.oturumIdleri.length === 0) return 0;
  const tek = baglam.hedefOturumId !== undefined;
  const silinen = await withSistem(
    sistemDb,
    {
      eylem: tek ? 'hesap.oturum_sonlandir' : 'hesap.oturumlar_tumunu_kapat',
      neden: tek
        ? 'Kullanıcı kendi oturumunu sonlandırdı'
        : 'Kullanıcı kendi oturumlarını sonlandırdı',
      aktorKullaniciId: baglam.kullaniciId,
      hedefTuru: tek ? 'oturum' : 'kullanici',
      hedefId: baglam.hedefOturumId ?? baglam.kullaniciId,
      ...(baglam.ayrinti ? { ayrinti: baglam.ayrinti } : {}),
    },
    (tx) =>
      tx
        .delete(oturumlar)
        .where(
          and(
            eq(oturumlar.kullanici_id, baglam.kullaniciId),
            inArray(oturumlar.id, baglam.oturumIdleri),
          ),
        )
        .returning({ id: oturumlar.id }),
  );
  return silinen.length;
}
