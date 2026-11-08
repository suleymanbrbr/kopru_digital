/** "8 Kas 14:32" gibi kisa, yerel (tr-TR) tarih-saat. Gecersiz girdide bos metin. */
export function zamanGoster(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  try {
    return d.toLocaleString('tr-TR', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return d.toISOString().slice(0, 16).replace('T', ' ');
  }
}

/** "8 Kas 2026" gibi yalnizca tarih. */
export function tarihGoster(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  try {
    return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return d.toISOString().slice(0, 10);
  }
}
