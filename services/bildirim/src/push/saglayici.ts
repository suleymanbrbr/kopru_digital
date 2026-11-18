/**
 * Push saglayici arayuzu. Uygulamalar: `log` (gelistirme) ve `expo`. Saglayicilar yurt disindadir
 * (ADR 0005): metinde kisisel veri yoktur (sablon kurallari), yalniz belirtec ve genel metin gider.
 */

export interface PushMesaji {
  /** Gonderim satiri kimligi (sonucu eslemek icin). */
  gonderimId: string;
  /** Saglayici push belirteci (ornek `ExponentPushToken[...]`). */
  belirtec: string;
  platform: 'ios' | 'android' | 'web';
  title: string;
  body: string;
  /** Mobil, bildirime dokununca bu kuruma gecer (birden cok kurumlu kullanici). */
  data: { derin_baglanti: string | null; bildirim_id: string | null; kurum_id: string };
  /** iOS rozet sayisi (okunmamis bildirim sayisi). */
  badge?: number;
}

export type PushSonucu =
  | { tur: 'gonderildi'; mesajId?: string }
  /** Gecici hata (zaman asimi, 5xx, hiz siniri): ustel beklemeyle yeniden denenir. */
  | { tur: 'gecici'; kod: string }
  /** Kalici hata: yeniden denenmez. `cihazGecersiz` ise cihaz pasiflenir (`DeviceNotRegistered`). */
  | { tur: 'kalici'; kod: string; cihazGecersiz: boolean };

export interface PushSaglayici {
  /** `gonderimler.saglayici` degeri. */
  readonly ad: string;
  /** Sonuclar `mesajlar` ile ayni sirada ve uzunlukta doner. Asla firlatmaz (hata `gecici` sonuctur). */
  gonder(mesajlar: readonly PushMesaji[]): Promise<PushSonucu[]>;
}

/** Belirteci loga yazarken sonunu maskeler. */
export function belirtecMaskele(belirtec: string): string {
  return belirtec.length <= 8 ? '***' : `${belirtec.slice(0, 8)}***${belirtec.slice(-3)}`;
}
