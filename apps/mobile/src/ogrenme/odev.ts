import type { OdevTuru, OgrenciOdevi, TeslimGirdisi } from '../api/ogrenmeTipleri';
import { tarihEkle, yerelDenUtc } from '../lib/saat';

/** Teslim bekleyen (atandi ya da tekrar istendi) odev mi? */
export function teslimBekliyorMu(o: Pick<OgrenciOdevi, 'durum'>): boolean {
  return o.durum === 'atandi' || o.durum === 'tekrar_istendi';
}

/** Teslim bekliyor ve son teslim gecmis mi? */
export function odevGecikmisMi(
  o: Pick<OgrenciOdevi, 'durum' | 'sonTeslim'>,
  simdiMs: number,
): boolean {
  return teslimBekliyorMu(o) && o.sonTeslim !== null && Date.parse(o.sonTeslim) < simdiMs;
}

export interface OdevBolumleri {
  geciken: OgrenciOdevi[];
  yaklasan: OgrenciOdevi[];
  /** Teslim edilmis ya da incelenmis (yeni teslim/inceleme once). */
  teslimEdilen: OgrenciOdevi[];
}

const sonTeslimSirasi = (a: OgrenciOdevi, b: OgrenciOdevi) =>
  (a.sonTeslim ? Date.parse(a.sonTeslim) : Infinity) -
  (b.sonTeslim ? Date.parse(b.sonTeslim) : Infinity);

/** Ogrencinin odevlerini geciken / yaklasan / teslim edilen olarak boler (iptaller atilir). */
export function odevleriBol(liste: readonly OgrenciOdevi[], simdiMs: number): OdevBolumleri {
  const bekleyen = liste.filter(teslimBekliyorMu).sort(sonTeslimSirasi);
  return {
    geciken: bekleyen.filter((o) => odevGecikmisMi(o, simdiMs)),
    yaklasan: bekleyen.filter((o) => !odevGecikmisMi(o, simdiMs)),
    teslimEdilen: liste
      .filter((o) => o.durum === 'teslim_edildi' || o.durum === 'incelendi')
      .sort((a, b) => Date.parse(b.teslimAt ?? '') - Date.parse(a.teslimAt ?? ''))
      .slice(0, 10),
  };
}

/** Varsayilan teslim: bugunden 3 gun sonra, kurum saat diliminde 23:59 (UTC ISO). */
export function varsayilanSonTeslim(bugun: string, tz: string, gun = 3): string {
  return yerelDenUtc(tarihEkle(bugun, gun), '23:59', tz);
}

/** "Üslü sayılar: 20 soru" gibi onerilen baslik. */
export function odevBasligiOner(konuAdi: string, tur: OdevTuru, sayi: number | null): string {
  if (tur === 'soru' && sayi) return `${konuAdi}: ${String(sayi)} soru`;
  if (tur === 'sayfa' && sayi) return `${konuAdi}: ${String(sayi)} sayfa`;
  return konuAdi;
}

export type TeslimHatasi = 'yapilan' | 'gecersiz' | 'asim' | 'toplam';

export type TeslimSonucu =
  { ok: true; girdi: TeslimGirdisi } | { ok: false; hata: TeslimHatasi };

function sayiCoz(metin: string): number | null | undefined {
  const m = metin.trim();
  if (m === '') return undefined;
  return /^\d{1,5}$/.test(m) ? Number(m) : null;
}

/**
 * Teslim girdisini dogrular. Yapilan soru zorunlu; dogru/yanlis/bos istege baglidir. Dogru ve
 * yanlis verilip bos yoksa bos hesaplanir; uc deger de toplamda yapilana esit olmali.
 */
export function teslimKur(
  yapilanMetni: string,
  dogruMetni: string,
  yanlisMetni: string,
  bosMetni: string,
  not: string,
): TeslimSonucu {
  const yapilan = sayiCoz(yapilanMetni);
  const dogru = sayiCoz(dogruMetni);
  const yanlis = sayiCoz(yanlisMetni);
  const bos = sayiCoz(bosMetni);
  if (yapilan === undefined) return { ok: false, hata: 'yapilan' };
  if (yapilan === null || dogru === null || yanlis === null || bos === null) {
    return { ok: false, hata: 'gecersiz' };
  }
  let b = bos;
  if (dogru !== undefined || yanlis !== undefined || bos !== undefined) {
    const d = dogru ?? 0;
    const y = yanlis ?? 0;
    if (d + y + (bos ?? 0) > yapilan) return { ok: false, hata: 'asim' };
    b = bos ?? (dogru !== undefined || yanlis !== undefined ? yapilan - d - y : undefined);
    if (b !== undefined && d + y + b !== yapilan) return { ok: false, hata: 'toplam' };
  }
  const notu = not.trim();
  return {
    ok: true,
    girdi: {
      yapilanSoru: yapilan,
      ...(dogru !== undefined || yanlis !== undefined || b !== undefined
        ? { dogru: dogru ?? 0, yanlis: yanlis ?? 0, ...(b !== undefined ? { bos: b } : {}) }
        : {}),
      ...(notu ? { not: notu } : {}),
    },
  };
}
