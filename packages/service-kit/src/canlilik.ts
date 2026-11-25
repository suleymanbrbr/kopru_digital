import { writeFileSync, rmSync } from 'node:fs';

/**
 * Worker canlilik dosyasi: worker HTTP almaz, bu yuzden Docker HEALTHCHECK (`infra/docker/saglik.mjs`)
 * dosyanin yasina bakar. `saglikli()` false donerse (ornek: NATS baglantisi koptu) dosyaya dokunulmaz ve
 * dosya eskiyince konteyner "unhealthy" olur. Donen fonksiyon zamanlayiciyi durdurur ve dosyayi siler.
 */
export function canlilikDosyasiBaslat(
  dosya: string,
  saglikli: () => boolean = () => true,
  aralikMs = 10_000,
): () => void {
  const dokun = () => {
    if (!saglikli()) return;
    try {
      writeFileSync(dosya, String(Date.now()));
    } catch {
      // Yazilamiyorsa dosya eskir ve konteyner unhealthy olur; surec dusurulmez.
    }
  };
  dokun();
  const zamanlayici = setInterval(dokun, aralikMs);
  zamanlayici.unref();
  return () => {
    clearInterval(zamanlayici);
    rmSync(dosya, { force: true });
  };
}
