import { KARAKTER_AD_AZAMI } from '@kopru/contracts';

/**
 * Karakter adi suzgeci. Kurallar:
 *  - kirpilmis ad 1-24 karakter; yalniz harf (Unicode), rakam ve tek bosluk; bosluk basta/sonda olamaz;
 *  - yasakli kelime listesi (kucuk, Turkce ve genel kufur/nefret): ad kucuk harfe, aksan ve sik
 *    "leet" rakamlarina (0->o, 1->i, 3->e, 4->a, 5->s, 7->t) indirgenip karsilastirilir.
 *    Kisa kelimeler (< 5) yalniz TAM kelime olarak, uzun kelimeler bosluksuz birlesik adin icinde (alt
 *    dize) aranir; boylece "basik" ya da "kamkat" gibi masum adlar yanlis reddedilmez, "o r o s p u"
 *    gibi bosluklu yazimlar yakalanir.
 * Liste yer tutucudur; moderasyon geri bildirimiyle genisletilir (kodda degisiklik gerekmez: yalniz bu dizi).
 */
export const YASAKLI_KELIMELER: readonly string[] = [
  // kufur / cinsel
  'amk',
  'aq',
  'mk',
  'sik',
  'sikis',
  'siktir',
  'sikerim',
  'sikik',
  'orospu',
  'orospucocugu',
  'pic',
  'pezevenk',
  'yarak',
  'yarrak',
  'dalyarak',
  'got',
  'gotveren',
  'amcik',
  'amina',
  'anani',
  'ibne',
  'pust',
  'kahpe',
  'fahise',
  'gavat',
  'bok',
  'oc',
  // nefret / siddet
  'hitler',
  'nazi',
  'tecavuz',
  'intihar',
  'terorist',
  // yaygin Ingilizce
  'fuck',
  'shit',
  'bitch',
  'dick',
  'porn',
];

const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't' };
const ASCII: Record<string, string> = { ı: 'i', ğ: 'g', ü: 'u', ş: 's', ö: 'o', ç: 'c' };

/** Kucuk harf, aksansiz ASCII, leet rakamlar harfe. */
export function adiIndirge(ad: string): string {
  return ad
    .replaceAll('İ', 'i')
    .replaceAll('I', 'ı')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[ığüşöç]/g, (c) => ASCII[c] ?? c)
    .replace(/[013457]/g, (c) => LEET[c] ?? c);
}

const IZINLI_BICIM = /^[\p{L}\p{N}]+(?: [\p{L}\p{N}]+)*$/u;

export type AdSonucu = { uygun: true; ad: string } | { uygun: false; neden: 'bicim' | 'yasakli' };

export function karakterAdiniDegerlendir(girdi: string): AdSonucu {
  const ad = girdi.trim().replace(/\s+/g, ' ');
  if (ad.length < 1 || Array.from(ad).length > KARAKTER_AD_AZAMI || !IZINLI_BICIM.test(ad)) {
    return { uygun: false, neden: 'bicim' };
  }
  const indirgenmis = adiIndirge(ad);
  const kelimeler = indirgenmis.split(' ');
  const birlesik = indirgenmis.replaceAll(' ', '');
  for (const y of YASAKLI_KELIMELER) {
    if (y.length < 5 ? kelimeler.includes(y) || birlesik === y : birlesik.includes(y)) {
      return { uygun: false, neden: 'yasakli' };
    }
  }
  return { uygun: true, ad };
}
