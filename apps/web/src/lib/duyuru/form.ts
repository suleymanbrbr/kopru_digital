import {
  DUYURU_BASLIK_EN_FAZLA,
  DUYURU_GOVDE_EN_FAZLA,
  type Duyuru,
  type DuyuruAliciRol,
  type DuyuruOlustur,
} from '@kopru/contracts';
import type { MessageKey } from '@kopru/i18n';

/** Web formunda hedef: kademe secimi yok (kademe listeleme ucu yok), yalniz grup ya da tum kurum. */
export type FormHedefTuru = 'grup' | 'kurum';

export interface DuyuruFormDegerleri {
  baslik: string;
  govde: string;
  hedefTuru: FormHedefTuru;
  grupId: string;
  roller: DuyuruAliciRol[];
  sabit: boolean;
  /** `datetime-local` degeri (`YYYY-MM-DDTHH:mm`, tarayici saat dilimi) ya da bos. */
  bitis: string;
  push: boolean;
}

export type FormAlani = 'baslik' | 'govde' | 'grup' | 'roller' | 'bitis';
export type FormHatalari = Partial<Record<FormAlani, MessageKey>>;

export const BOS_FORM: DuyuruFormDegerleri = {
  baslik: '',
  govde: '',
  hedefTuru: 'grup',
  grupId: '',
  roller: ['ogrenci'],
  sabit: false,
  bitis: '',
  push: true,
};

const iki = (n: number) => String(n).padStart(2, '0');

/** ISO anini `datetime-local` degerine (tarayici yerel saati) cevirir. */
export function yerelZamanDegeri(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getFullYear())}-${iki(d.getMonth() + 1)}-${iki(d.getDate())}T${iki(d.getHours())}:${iki(d.getMinutes())}`;
}

/** `datetime-local` degerini ISO (UTC, ofsetli) metne cevirir; bos/gecersiz `null`. */
export function yerelZamandanIso(deger: string): string | null {
  if (deger.trim() === '') return null;
  const d = new Date(deger);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** `datetime-local` bitis degeri gecersiz ya da gecmiste mi? (bos deger gecerlidir) */
export function bitisHatali(deger: string, simdi: number = Date.now()): boolean {
  if (deger === '') return false;
  const iso = yerelZamandanIso(deger);
  return iso === null || Date.parse(iso) <= simdi;
}

export function formHatalari(
  d: DuyuruFormDegerleri,
  secenek: { simdi?: number; grupZorunlu?: boolean } = {},
): FormHatalari {
  const hatalar: FormHatalari = {};
  if (d.baslik.trim() === '' || d.baslik.trim().length > DUYURU_BASLIK_EN_FAZLA) {
    hatalar.baslik = 'duyurular.form.baslikBos';
  }
  if (d.govde.trim() === '' || d.govde.trim().length > DUYURU_GOVDE_EN_FAZLA) {
    hatalar.govde = 'duyurular.form.govdeBos';
  }
  if (d.hedefTuru === 'grup' && d.grupId === '' && secenek.grupZorunlu !== false) {
    hatalar.grup = 'duyurular.form.grupGerekli';
  }
  if (d.roller.length === 0) hatalar.roller = 'duyurular.form.rolGerekli';
  if (bitisHatali(d.bitis, secenek.simdi)) hatalar.bitis = 'duyurular.form.bitisGecmis';
  return hatalar;
}

/** Form degerlerinden `POST /duyurular` govdesi. */
export function formdanGovde(d: DuyuruFormDegerleri, kurumId: string): DuyuruOlustur {
  return {
    baslik: d.baslik.trim(),
    govde: d.govde.trim(),
    hedef_turu: d.hedefTuru,
    hedef_id: d.hedefTuru === 'grup' ? d.grupId : kurumId,
    hedef_roller: d.roller,
    sabit: d.sabit,
    bitis_at: yerelZamandanIso(d.bitis),
    push_gonderildi: d.push,
  };
}

/** Taslak duyuruyu forma doldurur. Kademe hedefli taslakta grup alani bos kalir (web kademe secmez). */
export function duyurudenForm(duyuru: Duyuru): DuyuruFormDegerleri {
  return {
    baslik: duyuru.baslik,
    govde: duyuru.govde,
    hedefTuru: duyuru.hedef_turu === 'kurum' ? 'kurum' : 'grup',
    grupId: duyuru.hedef_turu === 'grup' ? duyuru.hedef_id : '',
    roller: duyuru.hedef_roller,
    sabit: duyuru.sabit,
    bitis: yerelZamanDegeri(duyuru.bitis_at),
    push: duyuru.push_gonderildi,
  };
}
