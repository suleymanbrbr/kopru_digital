import { NextResponse, type NextRequest } from 'next/server';

import { cerez, cerezSil, hataYaniti, OTURUM_CEREZI, TAKLIT_CEREZI } from '@/sunucu/bff';
import { taklitCereziOku } from '@/sunucu/vekil';

/** Etkin taklit oturumunun ozeti (belirtec donmez); sure dolduysa cerez silinir. */
export function GET(request: NextRequest) {
  if (!cerez(request, OTURUM_CEREZI))
    return hataYaniti('yetkisiz', 'Oturum açmanız gerekiyor.', 401);
  const c = taklitCereziOku(request);
  const bitti = !c || Date.parse(c.bitis_at) <= Date.now();
  const cevap = NextResponse.json(
    {
      taklit: bitti
        ? null
        : {
            taklit_id: c.taklit_id,
            kurum_id: c.kurum_id,
            hedef_kullanici_id: c.hedef_kullanici_id,
            rol: c.rol,
            bitis_at: c.bitis_at,
          },
    },
    { headers: { 'cache-control': 'no-store' } },
  );
  if (bitti && request.cookies.has(TAKLIT_CEREZI)) cerezSil(cevap, TAKLIT_CEREZI);
  return cevap;
}
