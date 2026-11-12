/** Ses kaydi sureleri (saf mantik; birim testli). Sartname: en cok 3 dk, api siniri 180 sn. */
export const SES_EN_FAZLA_SN = 180;
/** Bu kadar saniye kalinca geri sayim uyarisi gosterilir. */
export const SES_UYARI_KALAN_SN = 15;
/** Bundan kisa kayitlar (kazara dokunus) gonderilmez. */
export const SES_EN_AZ_SN = 1;

/** `m:ss` (ornegin 65 -> "1:05"). */
export function sureMetni(sn: number): string {
  const t = Math.max(0, Math.floor(sn));
  return `${String(Math.floor(t / 60))}:${String(t % 60).padStart(2, '0')}`;
}

export function kalanSn(gecenSn: number, enFazla = SES_EN_FAZLA_SN): number {
  return Math.max(0, Math.ceil(enFazla - gecenSn));
}

export function sinirAsildiMi(gecenSn: number, enFazla = SES_EN_FAZLA_SN): boolean {
  return gecenSn >= enFazla;
}

/** Kayit suresini (sn) api'ye gidecek tam sayiya cevirir: en az 1, en cok sinir. */
export function kayitSuresiSn(gecenSn: number, enFazla = SES_EN_FAZLA_SN): number {
  return Math.max(SES_EN_AZ_SN, Math.min(enFazla, Math.round(gecenSn)));
}

export function kayitKullanilabilirMi(gecenSn: number): boolean {
  return gecenSn >= SES_EN_AZ_SN;
}
