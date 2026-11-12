import type { OdakModu, OdakOturumu } from '@kopru/contracts';

/** Odak modlari ve sureleri (dk). `serbest`te sure kullanicidan gelir (5-180). */
export const ODAK_MOD_SECENEKLERI: readonly { mod: OdakModu; dk: number | null }[] = [
  { mod: '25_5', dk: 25 },
  { mod: '50_10', dk: 50 },
  { mod: 'serbest', dk: null },
];
export const ODAK_SERBEST_EN_AZ = 5;
export const ODAK_SERBEST_EN_COK = 180;

export interface OdakKazanimi {
  xp: number;
  seviye_atladi: boolean;
  yeni_rozetler: string[];
  dogrulanmamis_sayilan_sn: number;
  dogrulanmamis_sayilmayan_sn: number;
}

/** Odak ekraninin durumu: yalniz sunucu oturumunun yansimasi; sayac duvar saatinden turetilir. */
export type OdakDurumu =
  | { tur: 'yukleniyor' }
  | { tur: 'hazir' }
  | { tur: 'baslatiliyor'; istemciId: string }
  | { tur: 'devam'; oturum: OdakOturumu }
  | { tur: 'bitiriliyor'; oturum: OdakOturumu; durum: 'tamam' | 'yarida' }
  | { tur: 'bitti'; oturum: OdakOturumu; kazanim: OdakKazanimi };

export type OdakOlayi =
  /** Acik oturum sorgusu sonuclandi. */
  | { tur: 'acik_bulundu'; oturum: OdakOturumu | null }
  | { tur: 'baslat'; istemciId: string }
  | { tur: 'baslatildi'; oturum: OdakOturumu }
  | { tur: 'baslatilamadi' }
  | { tur: 'bitir'; durum: 'tamam' | 'yarida' }
  | { tur: 'bitirildi'; oturum: OdakOturumu; kazanim: OdakKazanimi }
  | { tur: 'bitirilemedi' }
  | { tur: 'yeni' };

/**
 * Gecis fonksiyonu. Gecersiz olaylar durumu degistirmez (ornegin devam etmeyen oturumu bitirmek);
 * boylece cift tiklama ve gec gelen yanitlar guvenlidir.
 */
export function odakGecis(d: OdakDurumu, o: OdakOlayi): OdakDurumu {
  switch (o.tur) {
    case 'acik_bulundu':
      if (d.tur !== 'yukleniyor') return d;
      return o.oturum ? { tur: 'devam', oturum: o.oturum } : { tur: 'hazir' };
    case 'baslat':
      return d.tur === 'hazir' ? { tur: 'baslatiliyor', istemciId: o.istemciId } : d;
    case 'baslatildi':
      return d.tur === 'baslatiliyor' || d.tur === 'hazir' || d.tur === 'yukleniyor'
        ? { tur: 'devam', oturum: o.oturum }
        : d;
    case 'baslatilamadi':
      return d.tur === 'baslatiliyor' ? { tur: 'hazir' } : d;
    case 'bitir':
      return d.tur === 'devam' ? { tur: 'bitiriliyor', oturum: d.oturum, durum: o.durum } : d;
    case 'bitirildi':
      return d.tur === 'bitiriliyor' || d.tur === 'devam'
        ? { tur: 'bitti', oturum: o.oturum, kazanim: o.kazanim }
        : d;
    case 'bitirilemedi':
      return d.tur === 'bitiriliyor' ? { tur: 'devam', oturum: d.oturum } : d;
    case 'yeni':
      return d.tur === 'bitti' ? { tur: 'hazir' } : d;
  }
}

/** Oturum basindan beri gecen saniye (duvar saati; sekme kapaliyken de ilerler). */
export function gecenSaniye(oturum: Pick<OdakOturumu, 'baslangic_at'>, simdiMs: number): number {
  return Math.max(0, Math.floor((simdiMs - Date.parse(oturum.baslangic_at)) / 1000));
}

/** Planlanan sureden kalan saniye; sure dolduysa 0. */
export function kalanSaniye(
  oturum: Pick<OdakOturumu, 'baslangic_at' | 'planlanan_dk'>,
  simdiMs: number,
): number {
  return Math.max(0, oturum.planlanan_dk * 60 - gecenSaniye(oturum, simdiMs));
}

export function sureBittiMi(
  oturum: Pick<OdakOturumu, 'baslangic_at' | 'planlanan_dk'>,
  simdiMs: number,
): boolean {
  return kalanSaniye(oturum, simdiMs) === 0;
}

/** `1499` -> `24:59`; bir saati asarsa `1:05:00`. */
export function sureBicimle(sn: number): string {
  const toplam = Math.max(0, Math.floor(sn));
  const s = toplam % 60;
  const dk = Math.floor(toplam / 60) % 60;
  const saat = Math.floor(toplam / 3600);
  const iki = (n: number) => String(n).padStart(2, '0');
  return saat > 0 ? `${String(saat)}:${iki(dk)}:${iki(s)}` : `${iki(dk)}:${iki(s)}`;
}

/** Serbest modda planlanan dakika gecerli mi? (tam sayi, 5-180) */
export function serbestSureGecerliMi(dk: number): boolean {
  return Number.isInteger(dk) && dk >= ODAK_SERBEST_EN_AZ && dk <= ODAK_SERBEST_EN_COK;
}

/** Baslat istegi icin `planlanan_dk`: sabit modlarda gonderilmez (sunucu moddan bilir). */
export function planlananDk(mod: OdakModu, serbestDk: number): number {
  return mod === '25_5' ? 25 : mod === '50_10' ? 50 : serbestDk;
}

/** UUIDv7 (RFC 9562): 48 bit ms zaman damgasi + rastgele; `istemci_id` idempotent anahtardir. */
export function uuidv7Uret(simdiMs = Date.now(), rastgele?: Uint8Array): string {
  const b = rastgele ?? crypto.getRandomValues(new Uint8Array(16));
  const ts = BigInt(simdiMs);
  for (let i = 0; i < 6; i++) b[i] = Number((ts >> BigInt(8 * (5 - i))) & 0xffn);
  b[6] = ((b[6] ?? 0) & 0x0f) | 0x70;
  b[8] = ((b[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
