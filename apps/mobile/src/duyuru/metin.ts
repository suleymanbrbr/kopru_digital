/**
 * Duyuru govdesi duz metindir; yalniz `http://` ve `https://` baglantilari tiklanabilir (docs/schema/
 * bildirim.md: "duz metin + baglanti"). `javascript:`, `intent:`, `kopru:` vb. hicbir kosulda baglanti
 * sayilmaz. Saf fonksiyonlar; ekran bunlari parcalara bakarak cizer.
 */
export type DuyuruParcasi = { tur: 'metin'; metin: string } | { tur: 'baglanti'; url: string };

const URL_DESENI = /https?:\/\/[^\s<>"']+/gi;
/** Cumle sonu noktalamasi baglantinin parcasi sayilmaz. */
const SON_NOKTALAMA = /[.,;:!?)\]}'"…]+$/;

/** Gelen metni duz metin ve baglanti parcalarina ayirir. */
export function duyuruParcalari(govde: string): DuyuruParcasi[] {
  const parcalar: DuyuruParcasi[] = [];
  let son = 0;
  for (const e of govde.matchAll(URL_DESENI)) {
    const ham = e[0];
    const kes = SON_NOKTALAMA.exec(ham);
    const url = kes ? ham.slice(0, ham.length - kes[0].length) : ham;
    if (!guvenliBaglantiMi(url)) continue;
    const bas = e.index;
    if (bas > son) parcalar.push({ tur: 'metin', metin: govde.slice(son, bas) });
    parcalar.push({ tur: 'baglanti', url });
    son = bas + url.length;
  }
  if (son < govde.length) parcalar.push({ tur: 'metin', metin: govde.slice(son) });
  return parcalar;
}

/** Uygulama ici tarayicida acilabilir mi: yalniz gecerli http/https adresi, kullanici bilgisi yok. */
export function guvenliBaglantiMi(url: string): boolean {
  if (!/^https?:\/\/[^\s]+$/i.test(url)) return false;
  try {
    const u = new URL(url);
    return (u.protocol === 'http:' || u.protocol === 'https:') && u.hostname !== '' && !u.username;
  } catch {
    return false;
  }
}

/** Liste onizlemesi: satir sonlarini bosluga cevirir, `n` karakterde keser. */
export function duyuruOnizleme(govde: string, n = 110): string {
  const duz = govde.replace(/\s+/g, ' ').trim();
  return duz.length <= n ? duz : `${duz.slice(0, n - 1).trimEnd()}…`;
}
