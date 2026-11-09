import type { Uyelik } from '@/oturum/tipler';

/**
 * Kurum secimi icin uyelikler. Bireysel (solo hoca) kurumda hoca iki uyelik tasir (sahip ve ogretmen);
 * "ogretmen" uyeligi atama olmadigi icin ogrencileri gostermez. Bu yuzden bireysel kurum basina yalniz
 * sahip uyeligi sunulur. Diger kurumlarda her uyelik ayri satirdir. Sira korunur.
 */
export function secilebilirUyelikler(uyelikler: readonly Uyelik[]): Uyelik[] {
  const sonuc: Uyelik[] = [];
  const gorulen = new Set<string>();
  for (const u of uyelikler) {
    if (u.kurumTur !== 'bireysel') {
      sonuc.push(u);
      continue;
    }
    if (gorulen.has(u.kurumId)) continue;
    gorulen.add(u.kurumId);
    const sahip = uyelikler.find((x) => x.kurumId === u.kurumId && x.rol === 'sahip');
    sonuc.push(sahip ?? u);
  }
  return sonuc;
}

/** Adres cubugundaki kurum icin tercih edilen uyelik (bireysel kurumda sahip). */
export function tercihEdilenUyelik(
  uyelikler: readonly Uyelik[],
  kurumId: string,
): Uyelik | undefined {
  return secilebilirUyelikler(uyelikler).find((u) => u.kurumId === kurumId);
}

/** Secim ekrani gereksiz mi: yalniz tek bir kurum var ve o bireysel (solo hoca). */
export function secimiAtla(uyelikler: readonly Uyelik[]): Uyelik | null {
  const liste = secilebilirUyelikler(uyelikler);
  const tek = liste.length === 1 ? liste[0] : undefined;
  return tek?.kurumTur === 'bireysel' ? tek : null;
}
