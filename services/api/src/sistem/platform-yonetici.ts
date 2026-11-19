import type { PlatformRolu } from '@kopru/contracts';
import type { Database } from '@kopru/service-kit';
import { sql } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';

import { withSistem } from './with-sistem.js';

export interface PlatformYoneticiEkleSonucu {
  kullaniciId: string;
  yeniKullanici: boolean;
  rol: PlatformRolu;
  ikinciAdimSifirlandi: boolean;
}

/**
 * Bir kullaniciya platform rolu verir (yoksa kullaniciyi olusturur). Uretimde platform rolu YALNIZ bu
 * islemle (`pnpm --filter @kopru/api platform:yonetici-ekle`) verilir; HTTP ucu yoktur. Denetim satiri
 * (`platform.yonetici_ekle`) ayni islemde yazilir. Kisisel veri denetime girmez (yalniz kullanici kimligi).
 */
export async function platformYoneticiEkle(
  sistemDb: Database | null,
  girdi: {
    telefonE164?: string;
    eposta?: string;
    rol: PlatformRolu;
    ikinciAdimiSifirla: boolean;
  },
): Promise<PlatformYoneticiEkleSonucu> {
  const kullaniciId = uuidv7();
  return withSistem(
    sistemDb,
    {
      eylem: 'platform.yonetici_ekle',
      neden: `Platform rolü verildi (${girdi.rol}); betik ile`,
      hedefTuru: 'kullanici',
      ayrinti: { rol: girdi.rol, ikinci_adim_sifirlandi: girdi.ikinciAdimiSifirla },
    },
    async (tx) => {
      const mevcut = girdi.telefonE164
        ? await tx.execute<{ id: string }>(
            sql`select id from hesap.kullanicilar where telefon_e164 = ${girdi.telefonE164} for update`,
          )
        : await tx.execute<{ id: string }>(
            sql`select id from hesap.kullanicilar where eposta = ${girdi.eposta ?? ''} for update`,
          );
      let id = mevcut[0]?.id;
      const yeni = id === undefined;
      if (id === undefined) {
        id = kullaniciId;
        await tx.execute(sql`
          insert into hesap.kullanicilar (id, telefon_e164, telefon_dogrulandi_at, eposta, eposta_dogrulandi_at, platform_rolu)
          values (${id}::uuid, ${girdi.telefonE164 ?? null},
                  ${girdi.telefonE164 ? sql`now()` : sql`null`},
                  ${girdi.eposta ?? null}, null, ${girdi.rol})`);
      } else {
        await tx.execute(sql`
          update hesap.kullanicilar set platform_rolu = ${girdi.rol} where id = ${id}::uuid`);
      }
      // Denetim satirinin hedefi, kullanici belli olunca guncellenemez (degismez gunluk): ikinci satir.
      await tx.execute(sql`
        insert into hesap.denetim_kayitlari (id, aktor_kullanici_id, eylem, hedef_turu, hedef_id, neden, sonra)
        values (${uuidv7()}::uuid, null, 'platform.yonetici_ekle_sonuc', 'kullanici', ${id}::uuid,
                'Platform rolü verildi (betik)',
                ${JSON.stringify({ rol: girdi.rol, yeni_kullanici: yeni })}::jsonb)`);
      let sifirlandi = false;
      if (girdi.ikinciAdimiSifirla) {
        const silinen = await tx.execute<{ id: string }>(
          sql`delete from hesap.platform_ikinci_adim where kullanici_id = ${id}::uuid returning id`,
        );
        sifirlandi = silinen.length > 0;
      }
      return {
        kullaniciId: id,
        yeniKullanici: yeni,
        rol: girdi.rol,
        ikinciAdimSifirlandi: sifirlandi,
      };
    },
  );
}
