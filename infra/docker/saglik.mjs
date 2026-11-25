// Docker HEALTHCHECK betigi (tum servis ve uygulama imajlarinda /app/saglik.mjs).
//
//   Worker sureci : WORKER_SAGLIK_DOSYASI tanimliysa dosyanin son 60 sn icinde guncellendigini denetler
//                   (runWorker her 10 sn'de dosyaya dokunur; NATS baglantisi kopuksa dokunmaz).
//   HTTP sureci   : GET http://127.0.0.1:$PORT$SAGLIK_YOLU (varsayilan /health = canlilik, bagimlilik denetlemez).
//
// Cikis kodu 0 = saglikli, 1 = degil. Kabuk, curl ya da wget gerekmez (node:24-slim'de yok).
import { statSync } from 'node:fs';

const dosya = process.env.WORKER_SAGLIK_DOSYASI;

if (dosya) {
  try {
    process.exit(Date.now() - statSync(dosya).mtimeMs < 60_000 ? 0 : 1);
  } catch {
    process.exit(1);
  }
} else {
  const port = process.env.PORT ?? '3000';
  const yol = process.env.SAGLIK_YOLU ?? '/health';
  try {
    const yanit = await fetch(`http://127.0.0.1:${port}${yol}`, {
      signal: AbortSignal.timeout(3000),
    });
    process.exit(yanit.ok ? 0 : 1);
  } catch {
    process.exit(1);
  }
}
