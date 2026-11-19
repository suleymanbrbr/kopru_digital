/** `+905321234567` -> `+90 5** *** ** 67` (yalniz son iki hane). */
export function telefonuMaskele(e164: string | null): string | null {
  if (!e164) return null;
  const son = e164.slice(-2);
  return `${e164.slice(0, 3)} ***${'*'.repeat(Math.max(0, e164.length - 8))} ${son}`.replace(
    /\s+/g,
    ' ',
  );
}

/** `ayse@ornek.com` -> `a***@o***.com` (yerel kismin ilk harfi, alan adinin ilk harfi ve uzantisi). */
export function epostayiMaskele(eposta: string | null): string | null {
  if (!eposta) return null;
  const [yerel = '', alan = ''] = eposta.split('@');
  const nokta = alan.lastIndexOf('.');
  const uzanti = nokta >= 0 ? alan.slice(nokta) : '';
  const govde = nokta >= 0 ? alan.slice(0, nokta) : alan;
  return `${yerel.slice(0, 1)}***@${govde.slice(0, 1)}***${uzanti}`;
}
