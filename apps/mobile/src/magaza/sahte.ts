import {
  MagazaHatasi,
  type MagazaSaglayici,
  type MagazaTeklifi,
  type SatinAlmaSonucu,
} from './tipler';

/** Sahte magazada gorunen teklifler (api `planlar` kodlariyla ayni). */
export const SAHTE_TEKLIFLER: MagazaTeklifi[] = [
  {
    urunId: 'kopru.baslangic.aylik',
    planKodu: 'baslangic',
    periyot: 'aylik',
    fiyatMetni: '₺299,99',
  },
  {
    urunId: 'kopru.baslangic.yillik',
    planKodu: 'baslangic',
    periyot: 'yillik',
    fiyatMetni: '₺2.999,99',
  },
  { urunId: 'kopru.koc.aylik', planKodu: 'koc', periyot: 'aylik', fiyatMetni: '₺699,99' },
  { urunId: 'kopru.koc.yillik', planKodu: 'koc', periyot: 'yillik', fiyatMetni: '₺6.999,99' },
  { urunId: 'kopru.ekip.aylik', planKodu: 'ekip', periyot: 'aylik', fiyatMetni: '₺1.499,99' },
  { urunId: 'kopru.ekip.yillik', planKodu: 'ekip', periyot: 'yillik', fiyatMetni: '₺14.999,99' },
  { urunId: 'kopru.kurum.aylik', planKodu: 'kurum', periyot: 'aylik', fiyatMetni: '₺4.999,99' },
  { urunId: 'kopru.kurum.yillik', planKodu: 'kurum', periyot: 'yillik', fiyatMetni: '₺49.999,99' },
];

export interface SahteMagazaSecenekleri {
  teklifler?: MagazaTeklifi[];
  /** Satin alma tamamlaninca cagrilir (mock modda sahte abonelik aktivasyonu). */
  satinAlindi?: (teklif: MagazaTeklifi, kurumId: string | null) => void | Promise<void>;
  geriYuklendi?: (kurumId: string | null) => void | Promise<void>;
  gecikmeMs?: number;
}

/** Test ve gelistirme icin sahte saglayici; `sonraki` ile bir sonraki satin alma sonucu belirlenir. */
export interface SahteMagaza extends MagazaSaglayici {
  readonly tur: 'sahte';
  /** Bir sonraki `satinAl` cagrisinin sonucu (tek kullanimlik). */
  sonraki: SatinAlmaSonucu | MagazaHatasi | null;
  readonly kurumId: string | null;
  readonly cagrilar: string[];
}

export function sahteMagazaOlustur(sec: SahteMagazaSecenekleri = {}): SahteMagaza {
  const bekle = () =>
    (sec.gecikmeMs ?? 0) > 0
      ? new Promise<void>((r) => setTimeout(r, sec.gecikmeMs))
      : Promise.resolve();
  const durum = {
    kurumId: null as string | null,
    sonraki: null as SatinAlmaSonucu | MagazaHatasi | null,
    cagrilar: [] as string[],
  };
  return {
    tur: 'sahte',
    get sonraki() {
      return durum.sonraki;
    },
    set sonraki(v) {
      durum.sonraki = v;
    },
    get kurumId() {
      return durum.kurumId;
    },
    cagrilar: durum.cagrilar,
    logIn(kurumId) {
      durum.cagrilar.push(`logIn:${kurumId}`);
      durum.kurumId = kurumId;
      return Promise.resolve();
    },
    logOut() {
      durum.cagrilar.push('logOut');
      durum.kurumId = null;
      return Promise.resolve();
    },
    async teklifleriGetir() {
      await bekle();
      return sec.teklifler ?? SAHTE_TEKLIFLER;
    },
    async satinAl(teklif) {
      await bekle();
      durum.cagrilar.push(`satinAl:${teklif.urunId}`);
      const s = durum.sonraki;
      durum.sonraki = null;
      if (s instanceof MagazaHatasi) throw s;
      if (s?.durum === 'iptal') return s;
      await sec.satinAlindi?.(teklif, durum.kurumId);
      return { durum: 'tamam' };
    },
    async geriYukle() {
      await bekle();
      durum.cagrilar.push('geriYukle');
      await sec.geriYuklendi?.(durum.kurumId);
    },
  };
}
