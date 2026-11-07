/** Yalnizca rakamlari birakir. */
export function rakamlar(s: string): string {
  return s.replace(/\D/g, '');
}

/**
 * Kullanici girdisinden 10 haneli ulusal numara (5XXXXXXXXX) cikarir; `+90`, `90`, `0` onekleri atilir.
 * Gecerli degilse null.
 */
export function ulusalNumara(girdi: string): string | null {
  let r = rakamlar(girdi);
  if (r.startsWith('90') && r.length >= 12) r = r.slice(2);
  else if (r.startsWith('0')) r = r.slice(1);
  return /^5\d{9}$/.test(r) ? r : null;
}

/** E.164: +905XXXXXXXXX */
export function e164(girdi: string): string | null {
  const n = ulusalNumara(girdi);
  return n ? `+90${n}` : null;
}

/** Yazarken bicimlendirir: "5XX XXX XX XX" (en fazla 10 hane). */
export function telefonBicimle(girdi: string): string {
  let r = rakamlar(girdi);
  if (r.startsWith('90') && r.length > 10) r = r.slice(2);
  if (r.startsWith('0')) r = r.slice(1);
  r = r.slice(0, 10);
  const parcalar = [r.slice(0, 3), r.slice(3, 6), r.slice(6, 8), r.slice(8, 10)];
  return parcalar.filter(Boolean).join(' ');
}
