import { t } from '@kopru/i18n';

/**
 * Platform yonetimi (destek/yonetici rolleri, taklit, kurum listesi) sonraki fazda gelir.
 * Simdilik yalnizca yer tutucu; web uygulamasiyla ayni tema kullanilir.
 */
export default function PlatformYonetimi() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center px-6">
      <p className="text-sm font-medium text-metin-ikincil">{t('marka.ad')}</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Platform yönetimi</h1>
      <p className="mt-3 text-base text-metin-ikincil">
        Kurumları, abonelikleri ve destek taleplerini yönetecek ekranlar burada olacak. Bu alan
        henüz hazır değil.
      </p>
    </main>
  );
}
