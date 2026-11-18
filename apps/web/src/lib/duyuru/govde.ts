/**
 * Duyuru gövdesindeki düz metni parçalara ayırır: metin ve tıklanabilir bağlantı. Güvenlik: yalnız
 * `http:` ve `https:` adresleri bağlantı olur (`javascript:`, `data:` vb. düz metin kalır); gövde asla
 * HTML olarak yorumlanmaz (React metin olarak basar).
 */
export type GovdeParcasi =
  { tur: 'metin'; metin: string } | { tur: 'baglanti'; metin: string; href: string };

const ADRES = /\bhttps?:\/\/[^\s<>"'`]+/gi;
const SONDAKI_NOKTALAMA = /[.,;:!?\]}»”’…]/u;

const say = (metin: string, harf: string) => metin.split(harf).length - 1;

/** Adresin sonuna yapışan cümle noktalaması ve eşsiz kapanış parantezi bağlantıdan çıkarılır. */
function kirp(ham: string): string {
  let m = ham;
  while (m.length > 0) {
    const son = m.slice(-1);
    const noktalama = SONDAKI_NOKTALAMA.test(son);
    const esiziParantez = son === ')' && say(m, '(') < say(m, ')');
    if (!noktalama && !esiziParantez) break;
    m = m.slice(0, -1);
  }
  return m;
}

function guvenliAdres(aday: string): string | null {
  try {
    const url = new URL(aday);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (url.hostname === '') return null;
    return url.href;
  } catch {
    return null;
  }
}

export function govdeyiParcala(govde: string): GovdeParcasi[] {
  const sonuc: GovdeParcasi[] = [];
  let son = 0;
  for (const e of govde.matchAll(ADRES)) {
    const metin = kirp(e[0]);
    const href = guvenliAdres(metin);
    if (!href) continue;
    const bas = e.index;
    if (bas > son) sonuc.push({ tur: 'metin', metin: govde.slice(son, bas) });
    sonuc.push({ tur: 'baglanti', metin, href });
    son = bas + metin.length;
  }
  if (son < govde.length) sonuc.push({ tur: 'metin', metin: govde.slice(son) });
  return sonuc;
}
