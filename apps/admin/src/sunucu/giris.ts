import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { erisimAl, girisIstegi, type GirisYolu, type UstYanit } from './api';
import {
  ayniKaynakMi,
  cerezSil,
  cerezYaz,
  ERISIM_CEREZI,
  hataYaniti,
  nesneMi,
  oturumCerezYaz,
  TAKLIT_CEREZI,
} from './bff';
import { yanitaCevir } from './vekil';

/** Giris uclarinin ust hata kodlarini arayuzun bildigi kodlara cevirir. */
const KOD_ESLEME: Record<string, string> = {
  unauthorized: 'giris_basarisiz',
  kod_gecersiz: 'otp_gecersiz',
  gecersiz_telefon: 'telefon_gecersiz',
};

function girisHatasi(ust: UstYanit): NextResponse {
  const hata = nesneMi(ust.govde) && nesneMi(ust.govde.error) ? ust.govde.error : undefined;
  const kod = typeof hata?.code === 'string' ? hata.code : 'sunucu_hatasi';
  const mesaj = typeof hata?.message === 'string' ? hata.message : 'İstek başarısız.';
  return hataYaniti(KOD_ESLEME[kod] ?? kod, mesaj, ust.durum >= 400 ? ust.durum : 502);
}

type Sema = z.ZodType<Record<string, unknown>>;

const telefon = z.object({ telefon: z.string().min(7).max(20) });
export const SEMALAR: Record<GirisYolu, Sema> = {
  'otp/gonder': telefon,
  'otp/dogrula': telefon.extend({ kod: z.string().min(4).max(10) }),
  'eposta/giris': z.object({ eposta: z.email(), parola: z.string().min(1).max(128) }),
};

/**
 * Giris uclarinin ortak govdesi. Oturum belirteci httpOnly cerezde kalir; ayni istekte erisim belirteci
 * de uretilir ve cerezine yazilir (tarayiciya hicbir belirtec donmez).
 */
export async function girisVekili(request: NextRequest, yol: GirisYolu): Promise<NextResponse> {
  if (!ayniKaynakMi(request)) return hataYaniti('yasak', 'İstek kaynağı geçersiz.', 403);
  const ham: unknown = await request.json().catch(() => null);
  const sonuc = SEMALAR[yol].safeParse(ham);
  if (!sonuc.success) return hataYaniti('dogrulama_hatasi', 'İstek geçersiz.', 400);

  const ust = await girisIstegi(yol, sonuc.data, request.headers);
  if (ust.durum !== 200) return girisHatasi(ust);
  if (yol === 'otp/gonder') return yanitaCevir({ durum: 200, govde: { gonderildi: true } });

  const oturum = nesneMi(ust.govde) ? ust.govde.oturum_belirteci : undefined;
  if (typeof oturum !== 'string')
    return hataYaniti('sunucu_hatasi', 'Beklenmeyen bir hata oluştu.', 502);
  const erisim = await erisimAl(oturum, request.headers);
  if (!('belirtec' in erisim)) return girisHatasi(erisim);

  const cevap = NextResponse.json({ ok: true }, { headers: { 'cache-control': 'no-store' } });
  oturumCerezYaz(cevap, request, oturum);
  cerezYaz(cevap, request, ERISIM_CEREZI, erisim.belirtec, erisim.omurSn - 30);
  cerezSil(cevap, TAKLIT_CEREZI);
  return cevap;
}
