import { createHmac, timingSafeEqual } from 'node:crypto';

import type { AbonelikKaynak, Periyot } from '@kopru/contracts';

/**
 * Odeme saglayici arayuzu (docs/schema/api.md `abonelik`). iyzico, RevenueCat (Apple/Google) ve e-Arsiv
 * entegratoru sonraki pakette bu arayuzun arkasina takilir; gercek hesap/anahtar yokken gelistirmede
 * `SahteOdemeSaglayici` kullanilir. Webhook akisi: ham govde ayristirilmadan once imza dogrulanir
 * (`webhookDogrula`), sonra `abonelik.abonelik_olaylari`na yazilir ve pg-boss isinde `webhookAyristir`
 * ile islenir.
 */
export type OdemeKaynagi = Exclude<AbonelikKaynak, 'deneme' | 'kurumsal'>;

export interface OdemeBaslatGirdisi {
  kurumId: string;
  planKodu: string;
  periyot: Periyot;
  /** KDV dahil tutar (kurus). */
  tutarKurus: number;
  /** Odeme sonrasi donus adresi (web). */
  donusUrl?: string;
}

export interface OdemeBaslatSonucu {
  /** Saglayicinin islem/oturum kimligi. */
  disIslemId: string;
  /** Kullanicinin yonlendirilecegi odeme sayfasi (store icin yok). */
  yonlendirmeUrl: string | null;
}

/** Saglayici bildiriminin saglayicidan bagimsiz ayristirilmis hali. */
export interface AyristirilmisWebhook {
  disOlayId: string;
  tur: string;
  disAbonelikId: string | null;
  disIslemId: string | null;
  /** Olay bir odeme sonucuysa. */
  odeme?: {
    durum: 'basarili' | 'basarisiz' | 'iade';
    tutarKurus: number;
    donemBaslangicAt: Date;
    donemBitisAt: Date;
    hataKodu?: string;
  };
}

export type WebhookBasliklari = Record<string, string | undefined>;

export interface OdemeSaglayici {
  readonly kaynak: OdemeKaynagi;
  odemeBaslat(girdi: OdemeBaslatGirdisi): Promise<OdemeBaslatSonucu>;
  /** Imza dogrulamasi: ham govde ve basliklarla. Dogrulanmayan olay `yoksayildi` olur. */
  webhookDogrula(hamGovde: string, basliklar: WebhookBasliklari): boolean;
  webhookAyristir(hamGovde: string): AyristirilmisWebhook;
  /** Otomatik yenilemeyi saglayicida durdurur (yoksa yalniz yerel kayit tutulur). */
  yenilemeyiDurdur?(disAbonelikId: string): Promise<void>;
}

/**
 * Gelistirme/test saglayicisi: gercek ag cagrisi yapmaz. Imza: `x-sahte-imza` = HMAC-SHA256(ham govde, sir).
 * Govde: `{ id, tur, abonelik_id?, islem_id?, odeme?: {...} }` JSON.
 */
export class SahteOdemeSaglayici implements OdemeSaglayici {
  readonly kaynak: OdemeKaynagi = 'iyzico';

  constructor(private readonly sir = 'sahte-sir') {}

  imzala(hamGovde: string): string {
    return createHmac('sha256', this.sir).update(hamGovde).digest('hex');
  }

  odemeBaslat(girdi: OdemeBaslatGirdisi): Promise<OdemeBaslatSonucu> {
    return Promise.resolve({
      disIslemId: `sahte_${girdi.kurumId}_${girdi.planKodu}_${String(Date.now())}`,
      yonlendirmeUrl: girdi.donusUrl ?? null,
    });
  }

  webhookDogrula(hamGovde: string, basliklar: WebhookBasliklari): boolean {
    const gelen = basliklar['x-sahte-imza'];
    if (!gelen) return false;
    const beklenen = Buffer.from(this.imzala(hamGovde));
    const alinan = Buffer.from(gelen);
    return beklenen.length === alinan.length && timingSafeEqual(beklenen, alinan);
  }

  webhookAyristir(hamGovde: string): AyristirilmisWebhook {
    const g = JSON.parse(hamGovde) as {
      id: string;
      tur: string;
      abonelik_id?: string;
      islem_id?: string;
      odeme?: {
        durum: 'basarili' | 'basarisiz' | 'iade';
        tutar_kurus: number;
        donem_baslangic_at: string;
        donem_bitis_at: string;
        hata_kodu?: string;
      };
    };
    return {
      disOlayId: g.id,
      tur: g.tur,
      disAbonelikId: g.abonelik_id ?? null,
      disIslemId: g.islem_id ?? null,
      ...(g.odeme
        ? {
            odeme: {
              durum: g.odeme.durum,
              tutarKurus: g.odeme.tutar_kurus,
              donemBaslangicAt: new Date(g.odeme.donem_baslangic_at),
              donemBitisAt: new Date(g.odeme.donem_bitis_at),
              ...(g.odeme.hata_kodu ? { hataKodu: g.odeme.hata_kodu } : {}),
            },
          }
        : {}),
    };
  }

  yenilemeyiDurdur(): Promise<void> {
    return Promise.resolve();
  }
}
