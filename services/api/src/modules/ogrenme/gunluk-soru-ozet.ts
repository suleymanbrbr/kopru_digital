import type { HaftalikOzetSema } from '@kopru/contracts';
import type { Tx } from '@kopru/service-kit';
import type { z } from 'zod';

import {
  analizSatirlari,
  bantGirdisi,
  bosHucre,
  bosHucreler,
  hucreEkle,
  konuAdlari,
  type AnalizSatiri,
} from './gunluk-soru-analiz.js';
import {
  SINIF_ZORLANAN_EN_AZ_SORU,
  bantDegisimi,
  bantTespit,
  basariOrani,
} from './gunluk-soru-bant.js';
import { tarihEkle } from './plan-zaman.js';

/**
 * Ogrenci karti haftalik ozeti (Pazartesi baslar): cozulen soru, en zayif 3 konu ve onceki haftaya gore bant
 * degisimi. Hem `haftalik-ozet` ucu hem kocluk gorunumu kullanir. Kapsam denetimi cagiranindir.
 */
export async function haftalikOzetUret(
  tx: Tx,
  kurumId: string,
  ogrenciId: string,
  hafta: string,
): Promise<z.infer<typeof HaftalikOzetSema>> {
  const oncekiHafta = tarihEkle(hafta, -7);
  const [bu, once] = await Promise.all([
    analizSatirlari(tx, kurumId, [ogrenciId], { bas: hafta, bit: tarihEkle(hafta, 6) }),
    analizSatirlari(tx, kurumId, [ogrenciId], {
      bas: oncekiHafta,
      bit: tarihEkle(oncekiHafta, 6),
    }),
  ]);
  const bantlar = (satirlar: readonly AnalizSatiri[]) => {
    const h = bosHucreler();
    for (const s of satirlar) hucreEkle(h[s.zorluk], s);
    return bantTespit(bantGirdisi(h));
  };
  const toplam = bosHucre();
  const konular = new Map<
    string,
    { brans: string; konu: string; h: ReturnType<typeof bosHucre> }
  >();
  for (const s of bu) {
    hucreEkle(toplam, s);
    const k = konular.get(`${s.brans_kodu}:${s.konu_id}`) ?? {
      brans: s.brans_kodu,
      konu: s.konu_id,
      h: bosHucre(),
    };
    konular.set(`${s.brans_kodu}:${s.konu_id}`, k);
    hucreEkle(k.h, s);
  }
  const zayif = [...konular.values()]
    .filter((k) => k.h.cozulen >= SINIF_ZORLANAN_EN_AZ_SORU)
    .sort((a, b) => (a.h.basari ?? 1) - (b.h.basari ?? 1) || b.h.cozulen - a.h.cozulen)
    .slice(0, 3);
  const adlar = await konuAdlari(
    tx,
    zayif.map((z) => z.konu),
  );
  const simdiki = bantlar(bu);
  const onceki = bantlar(once);
  return {
    ogrenci_id: ogrenciId,
    hafta_baslangic: hafta,
    cozulen: toplam.cozulen,
    dogru: toplam.dogru,
    yanlis: toplam.yanlis,
    bos: toplam.bos,
    basari: basariOrani(toplam.dogru, toplam.cozulen),
    en_zayif_konular: zayif.map((z) => ({
      brans_kodu: z.brans,
      konu_id: z.konu,
      konu_ad: adlar.get(z.konu)?.ad ?? null,
      cozulen: z.h.cozulen,
      basari: z.h.basari,
    })),
    bant: { onceki, simdiki, degisim: bantDegisimi(onceki, simdiki) },
  };
}
