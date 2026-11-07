/** "5321234567" -> "532 123 45 67". Yalniz rakamlari alir, en fazla 10 hane. */
export function telefonBicimle(girdi: string): string {
  let rakamlar = girdi.replace(/\D/g, '');
  if (rakamlar.startsWith('90') && rakamlar.length > 10) rakamlar = rakamlar.slice(2);
  if (rakamlar.startsWith('0')) rakamlar = rakamlar.slice(1);
  rakamlar = rakamlar.slice(0, 10);
  return [rakamlar.slice(0, 3), rakamlar.slice(3, 6), rakamlar.slice(6, 8), rakamlar.slice(8, 10)]
    .filter(Boolean)
    .join(' ');
}
