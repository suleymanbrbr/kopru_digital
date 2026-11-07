import { RolSema, type Rol, type UyelikOzetSema } from '@kopru/contracts';
import { withUser, type Database } from '@kopru/service-kit';
import { and, asc, eq } from 'drizzle-orm';
import type { z } from 'zod';

import { kurumlar, uyelikler } from '../../db/schema.js';

export type UyelikOzet = z.infer<typeof UyelikOzetSema>;

const ROL_ONCELIGI: readonly Rol[] = ['sahip', 'yonetici', 'ogretmen', 'ogrenci', 'veli'];

/** Kullanicinin etkin uyelikleri (tum kurumlar). Kullanici duzeyi RLS kolu ile okunur. */
export async function uyelikleriGetir(
  db: Pick<Database, 'orm'>,
  kullaniciId: string,
): Promise<UyelikOzet[]> {
  const satirlar = await withUser(db, { kullaniciId }, (tx) =>
    tx
      .select({
        uyelik_id: uyelikler.id,
        kurum_id: uyelikler.kurum_id,
        kurum_ad: kurumlar.ad,
        kurum_tur: kurumlar.tur,
        rol: uyelikler.rol,
        durum: uyelikler.durum,
        sube_id: uyelikler.sube_id,
      })
      .from(uyelikler)
      .leftJoin(kurumlar, eq(kurumlar.id, uyelikler.kurum_id))
      .where(and(eq(uyelikler.kullanici_id, kullaniciId), eq(uyelikler.durum, 'aktif')))
      .orderBy(asc(uyelikler.created_at), asc(uyelikler.id)),
  );
  return satirlar.flatMap((s) => {
    const rol = RolSema.safeParse(s.rol);
    const tur = s.kurum_tur;
    return rol.success
      ? [
          {
            ...s,
            rol: rol.data,
            durum: 'aktif' as const,
            kurum_tur: tur === 'bireysel' || tur === 'ekip' || tur === 'kurum' ? tur : null,
          },
        ]
      : [];
  });
}

/** Istenen uyelik yoksa kurumdaki en yuksek oncelikli rol; kurum da yoksa ilk uyelik. */
export function uyelikSec(
  liste: readonly UyelikOzet[],
  secim: {
    uyelikId?: string | undefined;
    kurumId?: string | undefined;
    tercihUyelikId?: string | null;
  },
): UyelikOzet | null {
  if (secim.uyelikId) return liste.find((u) => u.uyelik_id === secim.uyelikId) ?? null;
  const adaylar = secim.kurumId ? liste.filter((u) => u.kurum_id === secim.kurumId) : [...liste];
  if (adaylar.length === 0) return null;
  const tercih = adaylar.find((u) => u.uyelik_id === secim.tercihUyelikId);
  if (tercih) return tercih;
  return (
    [...adaylar].sort((a, b) => ROL_ONCELIGI.indexOf(a.rol) - ROL_ONCELIGI.indexOf(b.rol))[0] ??
    null
  );
}
