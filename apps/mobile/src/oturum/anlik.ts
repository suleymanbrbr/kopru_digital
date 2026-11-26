import type { ModulDurumu, MobilRol, Uyelik } from '../api/tipler';
import type { KvDepo } from '../depo/kv';

/**
 * Oturum anligi: son bilinen oturum ozeti (kullanici, uyelikler, etkin kurum baglami). Soguk acilista
 * ilk cizim agi beklemeden bu anliktan yapilir; sunucu dogrulamasi arka planda gelir.
 *
 * Saklanan alanlar (cihazda MMKV, sorgu onbellegiyle ayni koruma duzeyi; cikista ve 401'de silinir):
 *  - kullanici: `id`, `adSoyad` (telefon/e-posta SAKLANMAZ)
 *  - uyelikler: `uyelikId`, `kurumId`, `kurumAd`, `kurumTur`, `rol`
 *  - kvkk: kabul edilen surum etiketi (anlik yalniz KVKK onayli oturumlarda yazilir)
 *  - aktif: etkin uyelik kimligi, `moduller`, kurum `vurgu` rengi
 * Belirtecler burada DEGIL, guvenli depodadir (`belirtecDeposu`).
 */
const ANAHTAR = 'kopru.oturum-anligi';
const SURUM = 1;

export interface OturumAnligi {
  kullanici: { id: string; adSoyad: string };
  uyelikler: (Uyelik & { rol: MobilRol })[];
  kvkkSurum: string;
  aktif: { uyelikId: string; moduller: ModulDurumu; vurgu: string | null } | null;
}

export interface AnlikDeposu {
  oku: () => OturumAnligi | null;
  yaz: (a: OturumAnligi) => void;
  sil: () => void;
}

const ROLLER = new Set(['sahip', 'yonetici', 'ogretmen', 'ogrenci']);

function metinMi(x: unknown): x is string {
  return typeof x === 'string';
}

/** Bozuk/eski bicimli kayit `null` doner (anlik yoksayilir, normal acilis olur). */
export function anlikCoz(ham: string | undefined): OturumAnligi | null {
  if (!ham) return null;
  try {
    const o = JSON.parse(ham) as Record<string, unknown>;
    if (o.s !== SURUM) return null;
    const k = o.kullanici as { id?: unknown; adSoyad?: unknown } | undefined;
    if (
      !k ||
      !metinMi(k.id) ||
      !metinMi(k.adSoyad) ||
      !metinMi(o.kvkkSurum) ||
      o.kvkkSurum === ''
    ) {
      return null;
    }
    if (!Array.isArray(o.uyelikler)) return null;
    const uyelikler: OturumAnligi['uyelikler'] = [];
    for (const u of o.uyelikler as Record<string, unknown>[]) {
      if (
        !metinMi(u.uyelikId) ||
        !metinMi(u.kurumId) ||
        !metinMi(u.kurumAd) ||
        !metinMi(u.rol) ||
        !ROLLER.has(u.rol)
      ) {
        return null;
      }
      uyelikler.push({
        uyelikId: u.uyelikId,
        kurumId: u.kurumId,
        kurumAd: u.kurumAd,
        kurumTur: (u.kurumTur as Uyelik['kurumTur']) ?? null,
        rol: u.rol as MobilRol,
      });
    }
    const a = o.aktif as { uyelikId?: unknown; moduller?: unknown; vurgu?: unknown } | null;
    let aktif: OturumAnligi['aktif'] = null;
    if (a) {
      if (!metinMi(a.uyelikId) || typeof a.moduller !== 'object' || a.moduller === null)
        return null;
      if (!uyelikler.some((u) => u.uyelikId === a.uyelikId)) return null;
      aktif = {
        uyelikId: a.uyelikId,
        moduller: a.moduller,
        vurgu: metinMi(a.vurgu) ? a.vurgu : null,
      };
    }
    return {
      kullanici: { id: k.id, adSoyad: k.adSoyad },
      uyelikler,
      kvkkSurum: o.kvkkSurum,
      aktif,
    };
  } catch {
    return null;
  }
}

export function anlikDeposu(kv: () => KvDepo): AnlikDeposu {
  return {
    oku: () => anlikCoz(kv().getString(ANAHTAR)),
    yaz: (a) => {
      kv().set(ANAHTAR, JSON.stringify({ s: SURUM, ...a }));
    },
    sil: () => {
      kv().remove(ANAHTAR);
    },
  };
}
