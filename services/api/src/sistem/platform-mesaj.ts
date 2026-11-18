import type { Database } from '@kopru/service-kit';
import { sql } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';

import { isoZaman } from './platform-ortak.js';
import { withSistem, type SistemBaglami } from './with-sistem.js';

export interface MesajSatiri extends Record<string, unknown> {
  id: string;
  baslik: string;
  metin: string;
  onem: 'bilgi' | 'uyari' | 'kritik';
  baslangic_at: string;
  bitis_at: string;
  iptal_at: string | null;
  created_at: string;
}

export async function platformMesajiOlustur(
  sistemDb: Database | null,
  baglam: SistemBaglami & { aktorKullaniciId: string },
  girdi: { baslik: string; metin: string; onem: string; baslangicAt: Date | null; bitisAt: Date },
): Promise<MesajSatiri> {
  const id = uuidv7();
  return withSistem(
    sistemDb,
    { ...baglam, hedefTuru: 'platform_mesaji', hedefId: id },
    async (tx) => {
      const [satir] = await tx.execute<MesajSatiri>(sql`
      insert into hesap.platform_mesajlari (id, created_by, baslik, metin, onem, baslangic_at, bitis_at)
      values (${id}::uuid, ${baglam.aktorKullaniciId}::uuid, ${girdi.baslik}, ${girdi.metin}, ${girdi.onem},
              coalesce(${girdi.baslangicAt?.toISOString() ?? null}::timestamptz, now()),
              ${girdi.bitisAt.toISOString()}::timestamptz)
      returning id, baslik, metin, onem, ${isoZaman('baslangic_at')} as baslangic_at, ${isoZaman('bitis_at')} as bitis_at,
                ${isoZaman('iptal_at')} as iptal_at, ${isoZaman('created_at')} as created_at`);
      if (!satir) throw new Error('mesaj yazılamadı');
      return satir;
    },
  );
}

export async function platformMesajlariListele(
  sistemDb: Database | null,
  baglam: SistemBaglami,
): Promise<MesajSatiri[]> {
  return withSistem(sistemDb, baglam, async (tx) => {
    const rows = await tx.execute<MesajSatiri>(sql`
      select id, baslik, metin, onem, ${isoZaman('baslangic_at')} as baslangic_at, ${isoZaman('bitis_at')} as bitis_at,
             ${isoZaman('iptal_at')} as iptal_at, ${isoZaman('created_at')} as created_at
      from hesap.platform_mesajlari order by created_at desc, id desc limit 50`);
    return [...rows];
  });
}

/** Mesaji erkenden kaldirir (`iptal_at`); zaten iptal edilmis veya olmayan mesajda `false`. */
export async function platformMesajiIptalEt(
  sistemDb: Database | null,
  baglam: SistemBaglami,
  mesajId: string,
): Promise<boolean> {
  return withSistem(
    sistemDb,
    { ...baglam, hedefTuru: 'platform_mesaji', hedefId: mesajId },
    async (tx) => {
      const rows = await tx.execute<{ id: string }>(sql`
      update hesap.platform_mesajlari set iptal_at = now()
      where id = ${mesajId}::uuid and iptal_at is null returning id`);
      return rows.length > 0;
    },
  );
}
