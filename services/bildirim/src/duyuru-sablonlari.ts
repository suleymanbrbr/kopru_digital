import type { SablonTanimi } from './sablonlar.js';

/**
 * Duyuru bildirim sablonlari (`sablonlar.ts` listesine eklenir).
 *
 * Push metni GENELdir: duyuru basligi ve govdesi push'a GIRMEZ. Gerekce: baslik/govde yazarin serbest
 * metnidir (ogrenci adi, not, ucret gibi kisisel veri icerebilir; dogrulanamaz) ve kilit ekraninda baskalarinca
 * gorulebilir (CLAUDE.md: push metinlerine kisisel veri konmaz). Push yalniz "Yeni duyuru" ve kurum baglamini
 * (`kurum`: kurum adi, kisisel veri degil) tasir; baslik ve ayrinti kutuda ve derin baglantidadir.
 */
export const DUYURU_SABLON_KODU = 'duyuru_yayinlandi';

export const DUYURU_SABLONLARI: readonly SablonTanimi[] = [
  {
    kod: DUYURU_SABLON_KODU,
    kategori: 'duyuru',
    kanal: 'kutu',
    baslik: '{{duyuru_baslik}}',
    govde: 'Yeni bir duyuru yayınlandı. Açıp okuyabilirsin.',
    derinBaglanti: 'kopru://duyuru/{{duyuru_id}}',
  },
  {
    kod: DUYURU_SABLON_KODU,
    kategori: 'duyuru',
    kanal: 'push',
    baslik: 'Yeni duyuru',
    govde: '{{kurum}} için yeni bir duyuru var.',
    derinBaglanti: 'kopru://duyuru/{{duyuru_id}}',
  },
];
