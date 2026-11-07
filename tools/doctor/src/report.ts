import type { Check, CheckResult, Status } from './checks.js';

const symbols: Record<Status, string> = { ok: '✓', fail: '✗', skip: '-' };
const colors: Record<Status, string> = { ok: '\u001b[32m', fail: '\u001b[31m', skip: '\u001b[90m' };

const pad = (text: string, width: number) => text + ' '.repeat(Math.max(0, width - text.length));

/** Turkce durum tablosu. `color` false ise ANSI kodu uretilmez. */
export function renderTable(rows: { check: Check; result: CheckResult }[], color: boolean): string {
  const nameWidth = Math.max(...rows.map((row) => row.check.name.length), 6);
  const detailWidth = Math.max(...rows.map((row) => row.result.detail.length), 6);
  const paint = (status: Status, text: string) =>
    color ? `${colors[status]}${text}\u001b[0m` : text;

  const lines = [`${pad('', 2)} ${pad('Kontrol', nameWidth)}  ${pad('Sonuç', detailWidth)}  Çözüm`];
  for (const { check, result } of rows) {
    lines.push(
      `${paint(result.status, symbols[result.status])}  ${pad(check.name, nameWidth)}  ${pad(result.detail, detailWidth)}  ${result.hint ?? ''}`.trimEnd(),
    );
  }

  const failed = rows.filter((row) => row.result.status === 'fail').length;
  const skipped = rows.filter((row) => row.result.status === 'skip').length;
  lines.push(
    '',
    failed === 0
      ? `Her şey yolunda${skipped > 0 ? ` (${String(skipped)} kontrol bu platformda atlandı)` : ''}.`
      : `${String(failed)} sorun var; "Çözüm" sütunundaki komutları çalıştırıp tekrar deneyin.`,
  );
  return lines.join('\n');
}
