/** Panoya kopyalar; izin yoksa ya da desteklenmiyorsa `false` doner. */
export async function panoyaKopyala(metin: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(metin);
    return true;
  } catch {
    return false;
  }
}
