import { createHmac, timingSafeEqual } from 'node:crypto';

import type { AbonelikKaynak, Periyot } from '@kopru/contracts';

/**
 * Odeme saglayici arayuzu (docs/schema/api.md `abonelik`). Gercek saglayicilar (`iyzico.ts`, `revenuecat.ts`)
 * ve gelistirme/test saglayicisi (`SahteOdemeSaglayici`) bu arayuzun arkasindadir. Webhook akisi: ham govde
 * ayristirilmadan once imza dogrulanir (`webhookDogrula`), `webhookOzeti` ile olay kimligi cikarilip
 * `abonelik.abonelik_olaylari`na yazilir (ON CONFLICT DO NOTHING), sonra `webhookAyristir` ile islenir.
 */
export type OdemeKaynagi = Exclude<AbonelikKaynak, 'deneme' | 'kurumsal'>;

/** Odeme baslatmak icin saglayiciya gonderilen alici (fatura bilgisi kopyasi). */
export interface OdemeAlicisi {
  unvan: string;
  vergiNo: string;
  eposta: string;
  adres: { satir: string; ilce: string; il: string; postaKodu?: string | undefined };
}

export interface OdemeBaslatGirdisi {
  kurumId: string;
  /** Odeme oturumu kimligi (saglayiciya `conversationId` olarak gider). */
  oturumId: string;
  planKodu: string;
  periyot: Periyot;
  /** KDV dahil tutar (kurus). */
  tutarKurus: number;
  /** Odeme sonrasi saglayicinin cagiracagi donus (callback) adresi. */
  donusUrl?: string;
  alici?: OdemeAlicisi;
}

export interface OdemeBaslatSonucu {
  /** Saglayicinin islem/oturum kimligi (iyzico: checkout form belirteci). */
  disIslemId: string;
  /** Kullanicinin yonlendirilecegi odeme sayfasi. */
  yonlendirmeUrl: string | null;
  /** Gomulecek odeme formu (HTML/JS parcasi). */
  formIcerigi: string | null;
}

/** Bildirimin abonelik uzerindeki etkisi (saglayicidan bagimsiz). */
export type WebhookIslemi =
  | 'odeme' // `odeme` alani dolu: basarili / basarisiz / iade
  | 'iptal' // otomatik yenileme kapatildi (donem sonuna kadar erisim)
  | 'iptal_geri_alindi' // otomatik yenileme yeniden acildi
  | 'sona_erdi' // abonelik sona erdi (suresi doldu / iptal edildi)
  | 'plan_degisti' // sonraki donemde uygulanacak plan degisikligi
  | 'yoksay';

/** Saglayici bildiriminin saglayicidan bagimsiz ayristirilmis hali. */
export interface AyristirilmisWebhook {
  disOlayId: string;
  tur: string;
  islem: WebhookIslemi;
  disAbonelikId: string | null;
  disIslemId: string | null;
  disMusteriId?: string | null;
  /** Kurum, saglayicinin kendi tasidigi kimlikle biliniyorsa (RevenueCat `app_user_id`, sahte saglayici). */
  kurumId?: string | null;
  /** Odeme baslatma oturumu belirteci (iyzico donusu). */
  oturumToken?: string | null;
  planKodu?: string | null;
  periyot?: Periyot | null;
  /** Magaza urun kodu; plan `planlar.magaza_urun_kodlari` ile cozulur. */
  magazaUrunKodu?: string | null;
  /** `plan_degisti`: yeni donemde gecerli urun. */
  yeniMagazaUrunKodu?: string | null;
  /** Magaza sandbox ortami (uretimde yoksayilir). */
  sandbox?: boolean;
  /** Magaza ucretsiz deneme donemi: abonelik acilir, odeme kaydi yazilmaz. */
  ucretsizDeneme?: boolean;
  /** `sona_erdi`/`iptal` olaylarinda olayin bitis zamani (sirasiz olay karsilastirmasi). */
  donemBitisAt?: Date;
  /** Olay odeme sonucuysa. */
  odeme?: {
    durum: 'basarili' | 'basarisiz' | 'iade';
    /** KDV dahil (kurus). */
    tutarKurus: number;
    /** Saglayici TL tutari vermedi (ornegin yabanci para birimi): plan fiyati (KDV dahil) kullanilir. */
    tutarBelirsiz?: boolean;
    donemBaslangicAt: Date;
    donemBitisAt: Date;
    hataKodu?: string;
    /** `iade`: iade edilen odemenin `disIslemId`si (verilmezse `disIslemId`). */
    iadeEdilenIslemId?: string;
  };
}

export type WebhookBasliklari = Record<string, string | undefined>;

export interface OdemeSaglayici {
  readonly kaynak: OdemeKaynagi;
  /** Web odemesi baslatir (magaza saglayicilarinda yoktur: satin alma uygulama icindedir). */
  odemeBaslat?(girdi: OdemeBaslatGirdisi): Promise<OdemeBaslatSonucu>;
  /** Imza dogrulamasi: ham govde ve basliklarla. Dogrulanmayan olay saklanmaz (401). */
  webhookDogrula(hamGovde: string, basliklar: WebhookBasliklari): boolean;
  /** Imza dogrulandiktan sonra senkron: olay kimligi, turu ve (saglayici birden cok kaynak tasiyorsa) kaynagi. */
  webhookOzeti(hamGovde: string): { disOlayId: string; tur: string; kaynak?: OdemeKaynagi };
  /** Olayin tam ayristirilmasi; saglayici API'sine ek sorgu gerekebilir (zaman asimi/hata -> yeniden denenir). */
  webhookAyristir(hamGovde: string): AyristirilmisWebhook | Promise<AyristirilmisWebhook>;
  /** Veritabanina saklanacak basliklar (gizli deger tasiyan baslik (Authorization) saklanmaz). */
  saklanacakBasliklar(basliklar: WebhookBasliklari): Record<string, string>;
  /** Odeme sayfasindan donuste (callback) oturum sonucunu saglayicidan sorgular. */
  donusCoz?(girdi: DonusGirdisi): Promise<AyristirilmisWebhook>;
  /** Otomatik yenilemeyi saglayicida durdurur (yoksa yalniz yerel kayit tutulur). */
  yenilemeyiDurdur?(disAbonelikId: string): Promise<void>;
}

export interface DonusGirdisi {
  token: string;
  oturum: {
    id: string;
    kurumId: string;
    planKodu: string;
    periyot: Periyot;
    tutarKurus: number;
    kdvKurus: number;
  };
}

/** `AyristirilmisWebhook` <-> JSON (tarihler ISO metni); donus olaylarinin `ham_govde`si bu bicimdedir. */
export function webhookJsonYap(a: AyristirilmisWebhook): string {
  return JSON.stringify(a);
}

export function webhookJsondanOku(ham: string): AyristirilmisWebhook {
  const g = JSON.parse(ham) as Record<string, unknown> & {
    odeme?: Record<string, unknown>;
    donemBitisAt?: string;
  };
  const sonuc = { ...g } as unknown as AyristirilmisWebhook;
  if (typeof g.donemBitisAt === 'string') sonuc.donemBitisAt = new Date(g.donemBitisAt);
  if (g.odeme) {
    sonuc.odeme = {
      ...(g.odeme as unknown as NonNullable<AyristirilmisWebhook['odeme']>),
      donemBaslangicAt: new Date(g.odeme.donemBaslangicAt as string),
      donemBitisAt: new Date(g.odeme.donemBitisAt as string),
    };
  }
  return sonuc;
}

/** Sabit sure karsilastirmali dize esitligi. */
export function guvenliEsit(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Sahte saglayici govdesi (`x-sahte-imza` = HMAC-SHA256(ham govde, sir)). */
export interface SahteWebhookGovdesi {
  id: string;
  tur: string;
  /** Kurum kimligi (imzali govde; yalniz sahte saglayicida). */
  kurum_id?: string;
  /** `odeme/baslat` yanitindaki `disIslemId` (`sahte_<oturum_id>`). */
  oturum_token?: string;
  abonelik_id?: string;
  islem_id?: string;
  plan_kodu?: string;
  periyot?: Periyot;
  odeme?: {
    durum: 'basarili' | 'basarisiz' | 'iade';
    tutar_kurus: number;
    donem_baslangic_at: string;
    donem_bitis_at: string;
    hata_kodu?: string;
    iade_edilen_islem_id?: string;
  };
  donem_bitis_at?: string;
}

/**
 * Gelistirme/test saglayicisi: gercek ag cagrisi yapmaz. Govde `SahteWebhookGovdesi` JSON'udur; `tur` degerleri:
 * `odeme.*` (odeme alani dolu), `abonelik.iptal`, `abonelik.sona_erdi`. Gelistirmede odeme sayfasi yerine
 * `yonlendirmeUrl` donus adresine (`?token=`) gider; `donusCoz` oturumun tutarini basarili sayar.
 */
export class SahteOdemeSaglayici implements OdemeSaglayici {
  readonly kaynak: OdemeKaynagi = 'iyzico';
  readonly sahte = true;

  constructor(private readonly sir = 'sahte-sir') {}

  imzala(hamGovde: string): string {
    return createHmac('sha256', this.sir).update(hamGovde).digest('hex');
  }

  odemeBaslat(girdi: OdemeBaslatGirdisi): Promise<OdemeBaslatSonucu> {
    const token = `sahte_${girdi.oturumId}`;
    const url = girdi.donusUrl ? `${girdi.donusUrl}?token=${encodeURIComponent(token)}` : null;
    return Promise.resolve({ disIslemId: token, yonlendirmeUrl: url, formIcerigi: null });
  }

  webhookDogrula(hamGovde: string, basliklar: WebhookBasliklari): boolean {
    const gelen = basliklar['x-sahte-imza'];
    return gelen !== undefined && guvenliEsit(this.imzala(hamGovde), gelen);
  }

  webhookOzeti(hamGovde: string): { disOlayId: string; tur: string } {
    const g = JSON.parse(hamGovde) as Partial<SahteWebhookGovdesi>;
    if (typeof g.id !== 'string' || typeof g.tur !== 'string') throw new Error('olay kimliği yok');
    return { disOlayId: g.id, tur: g.tur };
  }

  saklanacakBasliklar(basliklar: WebhookBasliklari): Record<string, string> {
    const imza = basliklar['x-sahte-imza'];
    return imza ? { 'x-sahte-imza': imza } : {};
  }

  webhookAyristir(hamGovde: string): AyristirilmisWebhook {
    const g = JSON.parse(hamGovde) as SahteWebhookGovdesi;
    const islem: WebhookIslemi = g.odeme
      ? 'odeme'
      : g.tur === 'abonelik.iptal'
        ? 'iptal'
        : g.tur === 'abonelik.sona_erdi'
          ? 'sona_erdi'
          : 'yoksay';
    return {
      disOlayId: g.id,
      tur: g.tur,
      islem,
      disAbonelikId: g.abonelik_id ?? null,
      disIslemId: g.islem_id ?? null,
      kurumId: g.kurum_id ?? null,
      oturumToken: g.oturum_token ?? null,
      planKodu: g.plan_kodu ?? null,
      periyot: g.periyot ?? null,
      ...(g.donem_bitis_at ? { donemBitisAt: new Date(g.donem_bitis_at) } : {}),
      ...(g.odeme
        ? {
            odeme: {
              durum: g.odeme.durum,
              tutarKurus: g.odeme.tutar_kurus,
              donemBaslangicAt: new Date(g.odeme.donem_baslangic_at),
              donemBitisAt: new Date(g.odeme.donem_bitis_at),
              ...(g.odeme.hata_kodu ? { hataKodu: g.odeme.hata_kodu } : {}),
              ...(g.odeme.iade_edilen_islem_id
                ? { iadeEdilenIslemId: g.odeme.iade_edilen_islem_id }
                : {}),
            },
          }
        : {}),
    };
  }

  donusCoz(girdi: DonusGirdisi): Promise<AyristirilmisWebhook> {
    const baslangic = new Date();
    const bitis = new Date(
      baslangic.getTime() + (girdi.oturum.periyot === 'yillik' ? 365 : 30) * 86_400_000,
    );
    return Promise.resolve({
      disOlayId: `donus:${girdi.token}`,
      tur: 'donus',
      islem: 'odeme',
      disAbonelikId: `sahte_abonelik_${girdi.oturum.id}`,
      disIslemId: `sahte_islem_${girdi.oturum.id}`,
      oturumToken: girdi.token,
      kurumId: girdi.oturum.kurumId,
      odeme: {
        durum: 'basarili',
        tutarKurus: girdi.oturum.tutarKurus,
        donemBaslangicAt: baslangic,
        donemBitisAt: bitis,
      },
    });
  }

  yenilemeyiDurdur(): Promise<void> {
    return Promise.resolve();
  }
}
