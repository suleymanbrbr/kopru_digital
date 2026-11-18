import type { ModulDurumu } from '@kopru/contracts';

import type { MobilRol } from '../api/tipler';
import { modulAcikMi } from '../nav/yapilandirma';

/**
 * Gezinme hedefi: expo-router yolu (+ degiskenleri). `navigate`: sekme ve gelen kutusu gibi tekil
 * ekranlar (yiginda varsa ona doner, cogaltmaz); degilse `push`.
 */
export interface BildirimRotasi {
  pathname: string;
  params?: Record<string, string>;
  navigate?: boolean;
}

/** Hedefi taninmayan ya da bu rol/kurumda acilamayan bildirimler gelen kutusuna gider. */
export const KUTU_ROTASI: BildirimRotasi = { pathname: '/bildirimler', navigate: true };

export interface BaglantiBaglami {
  rol: MobilRol;
  moduller: ModulDurumu;
}

export interface AyrisanBaglanti {
  /** `kopru://<tur>/<id>` icindeki tur (kucuk harf). */
  tur: string;
  id: string | null;
}

/** Kimlikler UUID ya da kisa belirtecdir; yola girmeden once dar bir desene uymali. */
const KIMLIK = /^[A-Za-z0-9_-]{1,100}$/;
const BAGLANTI = /^[A-Za-z][A-Za-z0-9+.-]*:\/\/([^/?#]*)\/?([^?#]*)/;

/** `kopru://soru/<id>` -> `{ tur: 'soru', id }`; bicimsiz ya da bos baglantida `null`. */
export function derinBaglantiyiAyristir(url: string | null | undefined): AyrisanBaglanti | null {
  if (typeof url !== 'string') return null;
  const e = BAGLANTI.exec(url.trim());
  if (!e) return null;
  const tur = (e[1] ?? '').toLowerCase();
  if (!/^[a-z][a-z0-9_-]*$/.test(tur)) return null;
  const parca = (e[2] ?? '').split('/')[0] ?? '';
  let id: string | null = null;
  if (parca !== '') {
    if (!KIMLIK.test(parca)) return null;
    id = parca;
  }
  return { tur, id };
}

/**
 * Bildirimin `derin_baglanti` degerini uygulama rotasina cevirir (saf fonksiyon).
 *
 * - soru: ogrenci ve personel icin soru detayi; `soru_sor` modulu kapaliysa kutu.
 * - odev: ogrenci -> teslim ekrani, personel -> odev ozeti; `odev` modulu kapaliysa kutu.
 * - ders / yoklama: personel -> Dersler sekmesi (yoklama + kimlik -> yoklama ekrani); ogrenci -> Bugun.
 * - kayit / kayitlar / kayitlarim: ogrenci -> Kayitlarim; baska rol ya da modul kapali -> kutu.
 * - karakter / motivasyon / seri: ogrenci + `oyunlastirma` acik -> Karakterim, aksi halde Bugun.
 * - bugun: Bugun. duyuru ve bilinmeyen turler: kutu (duyuru ekrani yok).
 */
export function baglantiRotasi(
  url: string | null | undefined,
  baglam: BaglantiBaglami,
): BildirimRotasi {
  const b = derinBaglantiyiAyristir(url);
  if (!b) return KUTU_ROTASI;
  const { rol, moduller } = baglam;
  const ogrenci = rol === 'ogrenci';
  const acik = (m: Parameters<typeof modulAcikMi>[1]) => modulAcikMi(moduller, m);

  switch (b.tur) {
    case 'soru':
      if (!b.id || !acik('soru_sor')) return KUTU_ROTASI;
      return { pathname: '/(uygulama)/soru/[id]', params: { id: b.id } };
    case 'odev':
      if (!b.id || !acik('odev')) return KUTU_ROTASI;
      return ogrenci
        ? { pathname: '/odev-teslim/[id]', params: { id: b.id } }
        : { pathname: '/odev/[id]', params: { id: b.id } };
    case 'yoklama':
      if (!ogrenci && b.id && acik('yoklama')) {
        return { pathname: '/yoklama/[dersId]', params: { dersId: b.id } };
      }
      return ogrenci
        ? { pathname: '/bugun', navigate: true }
        : { pathname: '/dersler', navigate: true };
    case 'ders':
    case 'dersler':
      return ogrenci || !acik('takvim')
        ? { pathname: '/bugun', navigate: true }
        : { pathname: '/dersler', navigate: true };
    case 'kayit':
    case 'kayitlar':
    case 'kayitlarim':
      return ogrenci && acik('kayitlar') ? { pathname: '/kayitlarim' } : KUTU_ROTASI;
    case 'karakter':
    case 'motivasyon':
    case 'seri':
      return ogrenci && acik('oyunlastirma')
        ? { pathname: '/karakterim', navigate: true }
        : { pathname: '/bugun', navigate: true };
    case 'bugun':
      return { pathname: '/bugun', navigate: true };
    default:
      return KUTU_ROTASI;
  }
}

/** Bildirimden cikarilan, yonlendirme ve gosterim icin gereken alanlar. */
export interface BildirimYuku {
  derinBaglanti: string | null;
  bildirimId: string | null;
  /** Bildirim verisinde kurum varsa (su an servis yollamaz; ileriye donuk). */
  kurumId: string | null;
  baslik: string;
  govde: string;
}

const metinMi = (d: unknown): d is string => typeof d === 'string' && d !== '';

/**
 * Push `data` alanindan guvenli alan cikarimi. Sunucu `{ derin_baglanti, bildirim_id }` yollar;
 * Expo push servisi gonderiminde veri iç içe (`body`) gelebilir, ikisi de taninir. Beklenmeyen tipler
 * `null` olur; uygulama asla cokmez.
 */
export function yukuAyristir(
  data: unknown,
  metin?: { baslik?: string | null; govde?: string | null },
): BildirimYuku {
  const duz = (d: unknown): Record<string, unknown> =>
    d !== null && typeof d === 'object' && !Array.isArray(d) ? (d as Record<string, unknown>) : {};
  let v = duz(data);
  if (!('derin_baglanti' in v) && !('bildirim_id' in v)) {
    const ic = duz(v.body);
    if ('derin_baglanti' in ic || 'bildirim_id' in ic) v = ic;
  }
  const kimlik = (d: unknown) => (metinMi(d) && KIMLIK.test(d) ? d : null);
  return {
    derinBaglanti: metinMi(v.derin_baglanti) ? v.derin_baglanti : null,
    bildirimId: kimlik(v.bildirim_id),
    kurumId: kimlik(v.kurum_id),
    baslik: metin?.baslik ?? '',
    govde: metin?.govde ?? '',
  };
}
