import { t } from '@kopru/i18n';

/** Odev ekranlarinin saf yardimcilari: form dogrulama, durum etiketleri, teslim sayilari. */

export type OdevHedefTuru = 'ogrenci' | 'grup' | 'kurum';

export interface OdevFormDegeri {
  hedefTuru: OdevHedefTuru;
  hedefId: string;
  brans: string;
  konuId: string | null;
  baslik: string;
  /** Baslik kullanici tarafindan degistirildi mi (konu secimi artik uzerine yazmaz). */
  baslikElle: boolean;
  tur: 'soru' | 'sayfa' | 'serbest';
  kaynak: string;
  /** `YYYY-MM-DD`; bos = teslim tarihi yok. */
  sonTeslim: string;
  hedefSayi: string;
}

/** Odev formunu dogrular; mesajlar `ogrenme.odev.hata.*`. Bos nesne = gecerli. */
export function odevFormunuDogrula(f: OdevFormDegeri, bugun: string): Record<string, string> {
  const hata: Record<string, string> = {};
  if (f.hedefTuru !== 'kurum' && !f.hedefId) hata.hedef = t('ogrenme.odev.hata.hedef');
  if (!f.brans) hata.brans = t('ogrenme.odev.hata.brans');
  if (!f.baslik.trim()) hata.baslik = t('ogrenme.odev.hata.baslik');
  if (f.sonTeslim && f.sonTeslim < bugun) hata.sonTeslim = t('ogrenme.odev.hata.gecmisTarih');
  if (f.tur === 'soru' && f.hedefSayi.trim() !== '') {
    const n = Number(f.hedefSayi);
    if (!Number.isInteger(n) || n < 1 || n > 100_000) hata.hedefSayi = t('ogrenme.odev.hata.sayi');
  }
  return hata;
}

export type TeslimHatasi = 'sayi' | 'asiyor' | null;

/** Teslim sayilari: tam sayi, dogru + yanlis + bos yapilan soru sayisini asmaz. Bos metin sayilmaz. */
export function teslimDogrula(
  yapilan: string,
  dogru: string,
  yanlis: string,
  bos: string,
): TeslimHatasi {
  if (yapilan.trim() === '') return 'sayi';
  const sayilar = [yapilan, dogru, yanlis, bos].filter((x) => x.trim() !== '').map(Number);
  if (!sayilar.every((n) => Number.isInteger(n) && n >= 0)) return 'sayi';
  const toplam = [dogru, yanlis, bos].reduce((s, x) => s + (x.trim() === '' ? 0 : Number(x)), 0);
  return toplam > Number(yapilan) ? 'asiyor' : null;
}

/** Ogrenci odev durumu icin rozet tonu ve etiketi. */
export function ogrenciOdevDurumu(durum: string): {
  ton: 'notr' | 'basari' | 'uyari' | 'hata' | 'bilgi';
  etiket: string;
} {
  switch (durum) {
    case 'atandi':
      return { ton: 'bilgi', etiket: t('ogrenme.odev.durum.atandi') };
    case 'teslim_edildi':
      return { ton: 'uyari', etiket: t('ogrenme.odev.durum.teslim_edildi') };
    case 'incelendi':
      return { ton: 'basari', etiket: t('ogrenme.odev.durum.incelendi') };
    case 'tekrar_istendi':
      return { ton: 'hata', etiket: t('ogrenme.odev.durum.tekrar_istendi') };
    default:
      return { ton: 'notr', etiket: t('ogrenme.odev.durum.iptal') };
  }
}

/** Teslim edilmemis ve son teslimi gecmis mi (gecikme gosterimi). */
export function gecikmisMi(
  durum: string,
  sonTeslim: string | null,
  simdi: Date = new Date(),
): boolean {
  return (
    (durum === 'atandi' || durum === 'tekrar_istendi') &&
    sonTeslim !== null &&
    Date.parse(sonTeslim) < simdi.getTime()
  );
}
