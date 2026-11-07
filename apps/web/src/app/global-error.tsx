'use client';

import { t } from '@kopru/i18n';

/** Kok duzen coktugunde son savunma; stil dosyasina bagimli degildir. */
export default function GenelHata({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="tr">
      <body style={{ fontFamily: 'system-ui, sans-serif', padding: 32, textAlign: 'center' }}>
        <h1>{t('hata.sayfaBaslik')}</h1>
        <p>{t('hata.sayfaAciklama')}</p>
        <button type="button" onClick={reset} style={{ padding: '10px 16px' }}>
          {t('ortak.tekrarDene')}
        </button>
      </body>
    </html>
  );
}
