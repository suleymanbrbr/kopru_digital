// web/admin imajlarinin baslatici (/app/next-baslat.mjs): uretimde sahte API modu ile acilmayi engeller.
//
// NEXT_PUBLIC_API_MOCK tanimliysa BFF gercek kimlik yerine sahte kimlige duser; bu yalniz gelistirme/e2e
// icindir. Kontrol YALNIZ imajin icinde calisir (yerel `next start` ve e2e akisi etkilenmez).
//
// Kullanim: node next-baslat.mjs apps/web/server.js
if (process.env.NEXT_PUBLIC_API_MOCK) {
  console.error(
    'NEXT_PUBLIC_API_MOCK uretim imajinda tanimlanamaz (BFF sahte kimlige duser). Degiskeni kaldirin.',
  );
  process.exit(1);
}

const sunucu = process.argv[2];
if (!sunucu) {
  console.error('Kullanim: node next-baslat.mjs <server.js yolu>');
  process.exit(2);
}
await import(new URL(sunucu, `file://${process.cwd()}/`).href);
