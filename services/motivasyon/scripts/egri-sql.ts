import { haftalikXp, ilkGunXp } from '../src/duzenli-ogrenci.js';
import { seviyeEgrisi } from '../src/seviye-egrisi.js';

/**
 * Seviye egrisini migration tohumu olarak (SQL VALUES) ve hedef tablosu olarak yazdirir.
 * `pnpm --filter @kopru/motivasyon egri` (migration tohumu degisirse yeni migration yazilir; uygulanmis
 * migration degistirilmez).
 */
const egri = seviyeEgrisi();
const hafta = haftalikXp();
console.log(
  `-- haftalik XP (duzenli ogrenci): ${String(hafta)}; gunluk ort. ${(hafta / 7).toFixed(1)}`,
);
console.log(`-- ilk gun XP: ${String(ilkGunXp())}`);
console.log(egri.map((s) => `(${String(s.seviye)}, ${String(s.gereken_toplam_xp)})`).join(',\n'));
console.log('\nseviye  toplam_xp  maliyet  gun(duzenli)');
for (const s of egri) {
  const onceki = egri[s.seviye - 2]?.gereken_toplam_xp ?? 0;
  console.log(
    `${String(s.seviye).padStart(6)}  ${String(s.gereken_toplam_xp).padStart(9)}  ${String(s.gereken_toplam_xp - onceki).padStart(7)}  ${((s.gereken_toplam_xp / hafta) * 7).toFixed(0)}`,
  );
}
