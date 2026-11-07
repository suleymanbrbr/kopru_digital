import { depoOlustur } from '../lib/store';
import { kv } from '../depo/kv';

export type TemaTercihi = 'sistem' | 'acik' | 'koyu';

interface Tercihler {
  tema: TemaTercihi;
  animasyonlar: boolean;
}

const ANAHTAR = 'kopru.tercihler';

function oku(): Tercihler {
  const varsayilan: Tercihler = { tema: 'sistem', animasyonlar: true };
  try {
    const ham = kv().getString(ANAHTAR);
    if (!ham) return varsayilan;
    const v = JSON.parse(ham) as Partial<Tercihler>;
    return {
      tema: v.tema === 'acik' || v.tema === 'koyu' ? v.tema : 'sistem',
      animasyonlar: v.animasyonlar !== false,
    };
  } catch {
    return varsayilan;
  }
}

/** Kullanici tercihleri (kalici). */
export const tercihler = depoOlustur<Tercihler>(oku());

tercihler.abone(() => {
  try {
    kv().set(ANAHTAR, JSON.stringify(tercihler.al()));
  } catch {
    // depo yazilamazsa tercih yalnizca oturum boyunca gecerli kalir
  }
});
