import type { AbonelikDurumu } from '@kopru/contracts';

import { ASKIDAN_SONA_ERME_GUN, EK_SURE_GUN, gunEkle } from './ortak.js';

/** Gecis kararinin ihtiyac duydugu satir alanlari. */
export interface GecisGirdisi {
  durum: AbonelikDurumu;
  donem_bitis_at: Date;
  deneme_bitis_at: Date | null;
  ek_sure_bitis_at: Date | null;
  iptal_istendi_at: Date | null;
}

export interface Gecis {
  yeniDurum: AbonelikDurumu;
  /** Verilirse satirin `ek_sure_bitis_at` alani bu degere ayarlanir. */
  ekSureBitisAt?: Date;
  /** Gunluk/denetim icin kisa neden kodu. */
  neden: string;
}

/**
 * Saf durum gecisi (docs/schema/api.md `abonelikler` durum makinesi): `simdi` itibariyla bir sonraki adim.
 * Kural: bir adim zamana baglidir ve yalniz gecen sureyle tetiklenir; odeme ve iptal olaylari
 * (`deneme` -> `aktif`, `odeme_bekliyor` -> `aktif`, ...) webhook/servis fonksiyonlarindadir.
 *
 *  - `deneme`          -> `sona_erdi`      deneme bitti
 *  - `aktif`           -> `iptal`          donem bitti ve iptal istenmisti
 *  - `aktif`           -> `odeme_bekliyor` donem bitti, yenileme odemesi alinmadi
 *  - `odeme_bekliyor`  -> `ek_sure`        donem bitti (ek sure donem bitisinden 7 gun; tam erisim surer)
 *  - `ek_sure`         -> `askida`         ek sure bitti (salt okunur)
 *  - `askida`          -> `sona_erdi`      askiya gecisten 90 gun sonra
 */
export function sonrakiGecis(a: GecisGirdisi, simdi: Date): Gecis | null {
  const gecti = (an: Date | null): boolean => an !== null && an.getTime() <= simdi.getTime();
  switch (a.durum) {
    case 'deneme':
      return gecti(a.deneme_bitis_at ?? a.donem_bitis_at)
        ? { yeniDurum: 'sona_erdi', neden: 'deneme_bitti' }
        : null;
    case 'aktif':
      if (!gecti(a.donem_bitis_at)) return null;
      return a.iptal_istendi_at !== null
        ? { yeniDurum: 'iptal', neden: 'iptal_donem_sonu' }
        : { yeniDurum: 'odeme_bekliyor', neden: 'yenileme_odenmedi' };
    case 'odeme_bekliyor':
      return gecti(a.donem_bitis_at)
        ? {
            yeniDurum: 'ek_sure',
            ekSureBitisAt: gunEkle(a.donem_bitis_at, EK_SURE_GUN),
            neden: 'ek_sure_basladi',
          }
        : null;
    case 'ek_sure':
      return gecti(a.ek_sure_bitis_at) ? { yeniDurum: 'askida', neden: 'ek_sure_bitti' } : null;
    case 'askida': {
      const askiBaslangic = a.ek_sure_bitis_at ?? a.donem_bitis_at;
      return gecti(gunEkle(askiBaslangic, ASKIDAN_SONA_ERME_GUN))
        ? { yeniDurum: 'sona_erdi', neden: 'aski_suresi_doldu' }
        : null;
    }
    case 'iptal':
    case 'sona_erdi':
      return null;
  }
}

/**
 * `sonrakiGecis` adimlarini durulana kadar uygular (worker uzun sure kapali kaldiysa `aktif` satiri tek
 * calismada `askida`ya kadar ilerler). Bos dizi = degisiklik yok. Ayni girdi ayni sonucu verir (idempotent).
 */
export function gecisZinciri(a: GecisGirdisi, simdi: Date): Gecis[] {
  const adimlar: Gecis[] = [];
  let guncel = { ...a };
  for (let i = 0; i < 8; i += 1) {
    const adim = sonrakiGecis(guncel, simdi);
    if (!adim) break;
    adimlar.push(adim);
    guncel = {
      ...guncel,
      durum: adim.yeniDurum,
      ek_sure_bitis_at: adim.ekSureBitisAt ?? guncel.ek_sure_bitis_at,
    };
  }
  return adimlar;
}
