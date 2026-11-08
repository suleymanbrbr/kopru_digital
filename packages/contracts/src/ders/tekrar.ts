/**
 * Tekrar kurali: RFC 5545'in kucuk bir alt kumesi (docs/schema/api.md `ders_serileri.tekrar_kurali`).
 * Yalniz `FREQ=WEEKLY|DAILY`, `INTERVAL` ve `BYDAY`. Saf fonksiyonlar; istemci ve sunucu ayni
 * ayristiriciyi kullanir.
 */

export const TEKRAR_GUNLERI = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'] as const;
export type TekrarGunu = (typeof TEKRAR_GUNLERI)[number];

export interface TekrarKurali {
  freq: 'WEEKLY' | 'DAILY';
  /** 1-52: her `interval` haftada/gunde bir. */
  interval: number;
  /** Bos: haftalikta baslangic gununun haftanin gunu; gunlukte her gun. */
  byday: TekrarGunu[];
}

export type TekrarKuraliSonucu = { ok: true; kural: TekrarKurali } | { ok: false; hata: string };

const hata = (mesaj: string): TekrarKuraliSonucu => ({ ok: false, hata: mesaj });

export function tekrarKuraliCoz(metin: string): TekrarKuraliSonucu {
  const parcalar = metin.trim().split(';');
  const degerler = new Map<string, string>();
  for (const parca of parcalar) {
    const [anahtar, deger, ...fazla] = parca.split('=');
    if (!anahtar || deger === undefined || fazla.length > 0 || deger.length === 0) {
      return hata('Tekrar kuralı KEY=DEĞER biçiminde olmalı.');
    }
    const a = anahtar.trim().toUpperCase();
    if (a !== 'FREQ' && a !== 'INTERVAL' && a !== 'BYDAY') {
      return hata('Tekrar kuralında yalnızca FREQ, INTERVAL ve BYDAY desteklenir.');
    }
    if (degerler.has(a)) return hata(`${a} bir kez verilebilir.`);
    degerler.set(a, deger.trim().toUpperCase());
  }
  const freq = degerler.get('FREQ');
  if (freq !== 'WEEKLY' && freq !== 'DAILY') {
    return hata('FREQ yalnızca WEEKLY veya DAILY olabilir.');
  }
  const intervalMetni = degerler.get('INTERVAL') ?? '1';
  if (!/^\d{1,2}$/.test(intervalMetni)) return hata('INTERVAL 1-52 arasında olmalı.');
  const interval = Number(intervalMetni);
  if (interval < 1 || interval > 52) return hata('INTERVAL 1-52 arasında olmalı.');
  const byday: TekrarGunu[] = [];
  const bydayMetni = degerler.get('BYDAY');
  if (bydayMetni !== undefined) {
    for (const g of bydayMetni.split(',')) {
      const gun = TEKRAR_GUNLERI.find((x) => x === g);
      if (!gun) return hata('BYDAY değerleri MO,TU,WE,TH,FR,SA,SU olabilir.');
      if (byday.includes(gun)) return hata('BYDAY içinde aynı gün iki kez olamaz.');
      byday.push(gun);
    }
    byday.sort((a, b) => TEKRAR_GUNLERI.indexOf(a) - TEKRAR_GUNLERI.indexOf(b));
  }
  return { ok: true, kural: { freq, interval, byday } };
}

/** Kanonik metin: `FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,WE` (BYDAY bos ise yazilmaz). */
export function tekrarKuraliYaz(kural: TekrarKurali): string {
  const parcalar = [`FREQ=${kural.freq}`, `INTERVAL=${String(kural.interval)}`];
  if (kural.byday.length > 0) parcalar.push(`BYDAY=${kural.byday.join(',')}`);
  return parcalar.join(';');
}
