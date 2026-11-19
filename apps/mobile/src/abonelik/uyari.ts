import { apiHatasiMi } from '../api/tipler';
import { depoOlustur, type Depo } from '../lib/store';

export interface LimitUyarisi {
  /** Limit anahtari (ornegin `max_ogrenci`); bilinmiyorsa null. */
  limit: string | null;
  mevcut: number | null;
  ustSinir: number | null;
  /** Her 402 plan_limiti icin artar: "planini yukselt" sayfasi yeniden acilsin diye. */
  anahtar: number;
}

export interface UyariDurumu {
  /** 402 abonelik_gerekli goruldu: yazma kilitli (veri gorunmeye devam eder). */
  saltOkunur: boolean;
  /** 403 kurum_askida goruldu: kurum platform tarafindan askiya alindi. */
  askida: boolean;
  limit: LimitUyarisi | null;
}

const BOS: UyariDurumu = { saltOkunur: false, askida: false, limit: null };

function sayi(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

export interface AbonelikUyariYoneticisi {
  depo: Depo<UyariDurumu>;
  /** Adaptor hatalarini izler; abonelik/askı/limit durumlarini isaretler. */
  hataIsle: (e: unknown) => void;
  saltOkunurTemizle: () => void;
  askiTemizle: () => void;
  limitKapat: () => void;
  sifirla: () => void;
}

/** Yazma 402/403 hatalarindan turetilen, uygulama genelindeki abonelik uyari durumu. */
export function abonelikUyariYoneticisi(): AbonelikUyariYoneticisi {
  const depo = depoOlustur<UyariDurumu>(BOS);
  let sayac = 0;
  return {
    depo,
    hataIsle(e) {
      if (!apiHatasiMi(e)) return;
      if (e.kod === 'plan_limiti') {
        const d = (e.detay ?? {}) as Record<string, unknown>;
        depo.ayarla({
          limit: {
            limit: typeof d.limit === 'string' ? d.limit : null,
            mevcut: sayi(d.mevcut),
            ustSinir: sayi(d.ust_sinir),
            anahtar: ++sayac,
          },
        });
      } else if (e.kod === 'abonelik_gerekli') {
        depo.ayarla({ saltOkunur: true });
      } else if (e.kod === 'kurum_askida') {
        depo.ayarla({ askida: true });
      }
    },
    saltOkunurTemizle: () => {
      depo.ayarla({ saltOkunur: false });
    },
    askiTemizle: () => {
      depo.ayarla({ askida: false });
    },
    limitKapat: () => {
      depo.ayarla({ limit: null });
    },
    sifirla: () => {
      depo.ayarla(() => BOS);
    },
  };
}

type Fonksiyon = (...a: unknown[]) => unknown;

/**
 * Adaptor gruplarindaki her async cagriyi izler: hata uyari yoneticisine bildirilir, sonra aynen
 * yeniden firlatilir (kuyruktan ve dogrudan yapilan cagrilar dahil). `auth` haric tutulur.
 */
export function hatalariGozle<T extends object>(
  adaptorler: T,
  isle: (e: unknown) => void,
  haric: readonly string[] = ['auth'],
): T {
  const sonuc: Record<string, unknown> = {};
  for (const [grupAdi, grup] of Object.entries(adaptorler)) {
    if (haric.includes(grupAdi) || typeof grup !== 'object' || grup === null) {
      sonuc[grupAdi] = grup;
      continue;
    }
    const sarili: Record<string, unknown> = {};
    for (const [ad, deger] of Object.entries(grup as Record<string, unknown>)) {
      if (typeof deger !== 'function') {
        sarili[ad] = deger;
        continue;
      }
      sarili[ad] = (...a: unknown[]) => {
        const r = (deger as Fonksiyon).apply(grup, a);
        if (r instanceof Promise) {
          return r.catch((e: unknown) => {
            isle(e);
            throw e;
          });
        }
        return r;
      };
    }
    sonuc[grupAdi] = sarili;
  }
  return sonuc as T;
}
