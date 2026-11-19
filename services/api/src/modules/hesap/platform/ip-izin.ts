import { BlockList, isIP } from 'node:net';

/** `::ffff:1.2.3.4` bicimini IPv4'e indirger. */
function normallestir(ip: string): string {
  const m = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(ip);
  return m?.[1] ?? ip;
}

/**
 * IP izin listesi (tek IP veya CIDR). Liste bos ise `null` doner (kisit tanimli degil); aksi halde
 * istemci adresi listede mi diye bakan bir fonksiyon. Girdiler `gecerliProxyAdresi` ile dogrulanmis olmalidir.
 */
export function ipIzinListesi(girdiler: readonly string[]): ((ip: string) => boolean) | null {
  if (girdiler.length === 0) return null;
  const liste = new BlockList();
  for (const girdi of girdiler) {
    const [adres, onek] = girdi.split('/');
    const norm = normallestir(adres ?? '');
    const surum = isIP(norm);
    if (surum === 0) continue;
    const tur = surum === 4 ? 'ipv4' : 'ipv6';
    if (onek === undefined) liste.addAddress(norm, tur);
    else liste.addSubnet(norm, Number(onek), tur);
  }
  return (ip) => {
    const norm = normallestir(ip);
    const surum = isIP(norm);
    if (surum === 0) return false;
    return liste.check(norm, surum === 4 ? 'ipv4' : 'ipv6');
  };
}
