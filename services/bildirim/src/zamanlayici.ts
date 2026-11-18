interface Log {
  error(nesne: Record<string, unknown>, mesaj: string): void;
}

/** Europe/Istanbul saati (0-23) ve takvim gunu (`YYYY-MM-DD`). */
export function istanbulSaati(an: Date = new Date()): { saat: number; gun: string } {
  const parcalar = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(an);
  const al = (t: string) => parcalar.find((p) => p.type === t)?.value ?? '';
  return { saat: Number(al('hour')), gun: `${al('year')}-${al('month')}-${al('day')}` };
}

/**
 * Cakismayan (onceki calisma bitmeden yenisi baslamaz) periyodik is. Hata isi durdurmaz, loglanir.
 * Donen fonksiyon zamanlayiciyi durdurur ve calisan isin bitmesini bekler.
 */
export function periyodikIs(
  ad: string,
  aralikMs: number,
  log: Log,
  is: () => Promise<void>,
  options: { hemenCalistirma?: boolean } = {},
): () => Promise<void> {
  let calisan: Promise<void> | undefined;
  let durdu = false;
  const tur = () => {
    if (calisan || durdu) return;
    calisan = is()
      .catch((err: unknown) => {
        log.error({ err, is: ad }, 'zamanlanmış iş başarısız');
      })
      .finally(() => {
        calisan = undefined;
      });
  };
  if (options.hemenCalistirma ?? true) tur();
  const zamanlayici = setInterval(tur, aralikMs);
  return async () => {
    durdu = true;
    clearInterval(zamanlayici);
    await calisan;
  };
}
