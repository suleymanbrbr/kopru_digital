import { createServisIstemcileri, hataGovdesiMi } from '@kopru/api-client';
import { MODUL_KODLARI, type ModulDurumu } from '@kopru/contracts';

import type { Belirtecler, BelirtecDeposu } from '../depo/belirtecDeposu';
import type { Adaptorler } from './adaptorler';
import { kayitAdaptoru } from './gercekKayit';
import { medyaAdaptoru } from './gercekMedya';
import { ogrenmeAdaptoru } from './gercekOgrenme';
import { operasyonAdaptorleri } from './gercekOperasyon';
import { soruAdaptoru } from './gercekSoru';
import {
  ApiHata,
  type GrupKatilimIstegi,
  type KatilimIstegi,
  type KatilimKodu,
  type MobilRol,
  type OturumBilgisi,
  type OturumKaydi,
  type RizaMetni,
  type Rol,
  type Uyelik,
  type UyelikBaglami,
} from './tipler';

export interface GercekAdaptorSecenekleri {
  /** Api taban adresi (ornegin http://localhost:4000). */
  apiUrl: string;
  /** Medya servisi taban adresi; canlida api ile ayni alan adi (varsayilan `apiUrl`). */
  medyaUrl?: string;
  depo: BelirtecDeposu;
  /** Test icin fetch degistirme; varsayilan `globalThis.fetch` (her cagrida okunur). */
  fetch?: typeof globalThis.fetch;
  simdi?: () => number;
  /** KVKK onayinin kaynagi (`api` `kaynak` alani). */
  kaynak?: 'ios' | 'android' | 'web';
  /** Tek istek icin zaman asimi (ms). */
  zamanAsimiMs?: number;
}

/** Erisim belirteci bitmeden bu kadar once (ms) yenilenir; saat sapmasina karsi pay. */
const YENILEME_PAYI_MS = 30_000;
const VARSAYILAN_ZAMAN_ASIMI_MS = 15_000;

interface ApiRizaMetni {
  id: string;
  tur: string;
  baslik: string;
  govde_markdown: string;
  surum: string;
}

function rizaMetniCevir(m: ApiRizaMetni): RizaMetni {
  return {
    id: m.id,
    tur: m.tur,
    baslik: m.baslik,
    govdeMarkdown: m.govde_markdown,
    surum: m.surum,
  };
}

/**
 * Govdesiz mutasyonlar icin acik bos JSON govdesi. Bazi calisma ortamlari (React Native fetch)
 * govdesiz isteklere `content-type: application/json` ekleyebilir; api bunu bos govdeyle 400
 * reddeder. `{}` gondermek hem guvenli hem tipli istemcinin beklentisiyle uyumludur.
 */
export const BOS_GOVDE = {} as never;

interface ApiKatilimIstegi {
  id: string;
  kurum_id: string;
  kurum_ad: string | null;
  grup_id: string;
  grup_ad: string | null;
  durum: KatilimIstegi['durum'];
  created_at: string;
}

function katilimIstegiCevir(i: ApiKatilimIstegi): KatilimIstegi {
  return {
    id: i.id,
    kurumId: i.kurum_id,
    kurumAd: i.kurum_ad ?? '',
    grupId: i.grup_id,
    grupAd: i.grup_ad ?? '',
    durum: i.durum,
    olusturma: i.created_at,
  };
}

interface ApiKatilimKodu {
  kod: string;
  expires_at: string | null;
  max_kullanim: number | null;
  kullanim_sayisi: number;
}

function katilimKoduCevir(k: ApiKatilimKodu): KatilimKodu {
  return {
    kod: k.kod,
    bitis: k.expires_at,
    maxKullanim: k.max_kullanim,
    kullanimSayisi: k.kullanim_sayisi,
  };
}

interface ApiUyelik {
  uyelik_id: string;
  kurum_id: string;
  kurum_ad: string | null;
  kurum_tur?: 'bireysel' | 'ekip' | 'kurum' | null;
  rol: Rol;
  durum: 'davetli' | 'aktif' | 'askida' | 'ayrildi';
}

/**
 * HTTP yanitini adaptor hata modeline cevirir (ADR 0004 hata kodlari).
 * 401 -> yetkisiz, 402 -> abonelik_gerekli, 403 -> riza_gerekli | modul_kapali | izin_yok,
 * 410 -> kod_gecersiz | davet_gecersiz, 409 -> zaten_uye | cakisma, 429 -> cok_istek.
 * OTP adaptorleri 429'u `otp_cok_deneme`ye cevirir.
 */
export function apiHatasiOlustur(durum: number, govde: unknown): ApiHata {
  const kod = hataGovdesiMi(govde) ? govde.error.code : undefined;
  const mesaj = hataGovdesiMi(govde) ? govde.error.message : undefined;
  const detay = hataGovdesiMi(govde) ? govde.error.details : undefined;
  const sec = {
    durum,
    ...(kod ? { ayrinti: kod } : {}),
    ...(detay !== undefined ? { detay } : {}),
  };
  if (durum === 401) return new ApiHata('yetkisiz', mesaj, sec);
  if (durum === 402 || kod === 'abonelik_gerekli') {
    return new ApiHata('abonelik_gerekli', mesaj, sec);
  }
  if (durum === 403) {
    if (kod === 'riza_gerekli') return new ApiHata('riza_gerekli', mesaj, sec);
    if (kod === 'modul_kapali') return new ApiHata('modul_kapali', mesaj, sec);
    // izin_yok, yasak, kurum_gerekli, taklit_salt_okunur ... : kullaniciya tek tip "yetkin yok"
    return new ApiHata('izin_yok', mesaj, sec);
  }
  // Sinif kodu / davet: 410 (tum "kullanilamaz" nedenleri ayni yanit).
  if (durum === 410 && kod === 'davet_gecersiz') return new ApiHata('davet_gecersiz', mesaj, sec);
  if (durum === 410) return new ApiHata('kod_gecersiz', mesaj, sec);
  if (durum === 409 && kod === 'zaten_uye') return new ApiHata('zaten_uye', mesaj, sec);
  if (durum === 409) return new ApiHata('cakisma', mesaj, sec);
  // OTP dogrulamada yanlis kod 400 kod_gecersiz doner (sinif kodunun 410'undan farkli).
  if (kod === 'kod_gecersiz') return new ApiHata('otp_gecersiz', mesaj, sec);
  if (durum === 429) return new ApiHata('cok_istek', mesaj, sec);
  if (durum === 404) return new ApiHata('bulunamadi', mesaj, sec);
  if (durum >= 500) return new ApiHata('sunucu', mesaj, sec);
  return new ApiHata('dogrulama', mesaj, sec);
}

function mobilRolMu(rol: Rol): rol is MobilRol {
  return rol !== 'veli';
}

/**
 * `@kopru/api-client` uzerinden gercek api'ye baglanan adaptorler.
 *
 * Belirtec modeli: `Belirtecler.yenileme` = opak `oturum_belirteci` (guvenli depoda, 30 gun kayan),
 * `Belirtecler.erisim` = 15 dk'lik JWT. Erisim belirteci bitmeden ya da 401'de oturum belirteciyle
 * `POST /auth/token` cagrilarak yenilenir; ayni anda tek yenileme ucusu vardir. Yenileme 401
 * donerse belirtecler silinir ve `yetkisiz` firlatilir (oturum yoneticisi oturumu kapatir); ag
 * hatasinda belirtecler korunur.
 */
export function gercekAdaptorler(sec: GercekAdaptorSecenekleri): Adaptorler {
  const { depo } = sec;
  const simdi = sec.simdi ?? (() => Date.now());
  const zamanAsimi = sec.zamanAsimiMs ?? VARSAYILAN_ZAMAN_ASIMI_MS;
  const kaynak = sec.kaynak ?? 'ios';

  /** Etkin kurum/uyelik; yenilemede ayni kapsamla belirtec alinir. Bellekte tutulur. */
  let aktif: { kurumId: string; uyelikId: string } | null = null;
  let uyelikOnbellek: ApiUyelik[] = [];
  let tekUcus: Promise<string> | null = null;

  /** Ag/zaman asimi hatalarini `ApiHata`ya cevirir. Yanit durumu burada yorumlanmaz. */
  const aglaFetch: typeof globalThis.fetch = async (girdi, init) => {
    const dene = sec.fetch ?? globalThis.fetch;
    const kontrol = new AbortController();
    const zd = { doldu: false };
    const zamanlayici = setTimeout(() => {
      zd.doldu = true;
      kontrol.abort();
    }, zamanAsimi);
    try {
      return await dene(girdi, { ...init, signal: kontrol.signal });
    } catch (e) {
      if (zd.doldu) throw new ApiHata('zaman_asimi', undefined, { yenidenDenenebilir: true });
      throw new ApiHata('ag', e instanceof Error ? e.message : undefined);
    } finally {
      clearTimeout(zamanlayici);
    }
  };

  /** 401'de bir kez yenileyip ayni istegi tekrarlar (govde `clone` ile korunur). */
  const yenilemeliFetch: typeof globalThis.fetch = async (girdi, init) => {
    if (!(girdi instanceof Request)) return aglaFetch(girdi, init);
    const kopya = girdi.clone();
    const kullanilan = girdi.headers.get('Authorization')?.replace(/^Bearer /, '') ?? null;
    const yanit = await aglaFetch(girdi, init);
    if (yanit.status !== 401) return yanit;
    const yeni = await yenile(kullanilan);
    kopya.headers.set('Authorization', `Bearer ${yeni}`);
    return aglaFetch(kopya, init);
  };

  const { api: ham } = createServisIstemcileri({
    adresler: { api: sec.apiUrl },
    fetch: aglaFetch,
  });
  const { api: yetkili, medya: medyaIstemcisi } = createServisIstemcileri({
    adresler: { api: sec.apiUrl, medya: sec.medyaUrl ?? sec.apiUrl },
    tokenAl: erisimAl,
    fetch: yenilemeliFetch,
  });

  /** `eskiErisim`: reddedilen belirtec. Baska bir cagri zaten yeniledi ise yeniden istemez. */
  async function yenile(eskiErisim: string | null): Promise<string> {
    if (tekUcus) return tekUcus;
    const b = await depo.oku();
    if (!b) throw new ApiHata('yetkisiz', undefined, { durum: 401 });
    if (eskiErisim !== null && b.erisim && b.erisim !== eskiErisim) return b.erisim;
    tekUcus ??= yenileIs(b).finally(() => {
      tekUcus = null;
    });
    return tekUcus;
  }

  async function yenileIs(b: Belirtecler): Promise<string> {
    const { data, error, response } = await ham.POST('/auth/token', {
      headers: { Authorization: `Bearer ${b.yenileme}` },
      body: aktif ? { kurum_id: aktif.kurumId, uyelik_id: aktif.uyelikId } : {},
    });
    if (!data) {
      // Oturum belirteci gecersiz/iptal: yerel belirtecler de anlamsiz.
      if (response.status === 401) await depo.sil();
      throw apiHatasiOlustur(response.status, error);
    }
    await depo.yaz({
      erisim: data.access_token,
      yenileme: b.yenileme,
      erisimBitis: simdi() + data.expires_in * 1000,
    });
    return data.access_token;
  }

  async function erisimAl(): Promise<string | null> {
    const b = await depo.oku();
    if (!b) return null;
    if (b.erisim && b.erisimBitis - simdi() > YENILEME_PAYI_MS) return b.erisim;
    return yenile(null);
  }

  /** Basarisiz yaniti firlatir; basariliysa veriyi dondurur. */
  function veriAl<T>(sonuc: { data?: T; error?: unknown; response: Response }): T {
    if (sonuc.data === undefined) throw apiHatasiOlustur(sonuc.response.status, sonuc.error);
    return sonuc.data;
  }

  /** OTP uclarinda 429 "cok deneme" olarak bilinir. */
  function otpAl<T>(sonuc: { data?: T; error?: unknown; response: Response }): T {
    try {
      return veriAl(sonuc);
    } catch (e) {
      if (e instanceof ApiHata && e.kod === 'cok_istek') {
        throw new ApiHata('otp_cok_deneme', e.message, { durum: e.durum ?? 429 });
      }
      throw e;
    }
  }

  /** Etkin kurum: ogretmen/yonetici uclari yolda `kurum_id` ister. */
  function etkinKurum(): string {
    if (!aktif) throw new ApiHata('bulunamadi', undefined, { durum: 404 });
    return aktif.kurumId;
  }

  /** Kendi oturumu sonlandiginda yerel belirtec ve baglam silinir. */
  async function yerelOturumuKapat(): Promise<void> {
    aktif = null;
    uyelikOnbellek = [];
    await depo.sil();
  }

  function uyelikCevir(u: ApiUyelik): Uyelik {
    return {
      uyelikId: u.uyelik_id,
      kurumId: u.kurum_id,
      kurumAd: u.kurum_ad ?? '',
      kurumTur: u.kurum_tur ?? null,
      rol: u.rol,
    };
  }

  const operasyon = operasyonAdaptorleri({ yetkili, etkinKurum, veriAl });
  const ogrenme = ogrenmeAdaptoru({ yetkili, etkinKurum, veriAl });
  const kayit = kayitAdaptoru({ yetkili, etkinKurum, veriAl });
  const soru = soruAdaptoru({ yetkili, etkinKurum, veriAl });
  const medya = medyaAdaptoru({ medya: medyaIstemcisi, veriAl });

  return {
    ...operasyon,
    ogrenme,
    kayit,
    soru,
    medya,
    auth: {
      async otpIste(telefon) {
        otpAl(await ham.POST('/auth/otp/gonder', { body: { telefon } }));
        // Api yeniden gonderme bekleme suresi dondurmez; istemci tarafi sabit bekleme.
        return { yenidenGondermeSn: 30 };
      },

      async otpDogrula(telefon, kod) {
        const d = otpAl(await ham.POST('/auth/otp/dogrula', { body: { telefon, kod } }));
        aktif = null;
        uyelikOnbellek = [];
        // Erisim belirteci tembel alinir (`erisimBitis: 0` -> ilk istekte `/auth/token`).
        await depo.yaz({ erisim: '', yenileme: d.oturum_belirteci, erisimBitis: 0 });
      },

      async oturumBilgisi(): Promise<OturumBilgisi> {
        if (!(await depo.oku())) throw new ApiHata('yetkisiz', undefined, { durum: 401 });
        // `/v1/hesap/ben` ve `rizalar/guncel` riza kontrolunden muaf; `uyeliklerim` degil
        // (onay oncesi 403 riza_gerekli doner), bu yuzden uyelikler `ben` yanitindan okunur.
        const [ben, riza] = await Promise.all([
          yetkili.GET('/v1/hesap/ben'),
          yetkili.GET('/v1/hesap/rizalar/guncel'),
        ]);
        const b = veriAl(ben);
        const r = veriAl(riza);
        uyelikOnbellek = b.uyelikler.filter((u) => u.durum === 'aktif');
        const metin = r.metinler.find((m) => m.tur === 'kvkk_aydinlatma') ?? r.metinler[0];
        const bekleyen = r.metinler.filter((m) => !m.kabul_edildi);
        const guncelSurum = metin?.surum ?? '';
        return {
          kullanici: {
            id: b.kullanici.id,
            adSoyad: b.kullanici.gorunen_ad ?? '',
            telefon: b.kullanici.telefon_e164 ?? '',
          },
          uyelikler: uyelikOnbellek.map(uyelikCevir),
          kvkk: {
            guncelSurum,
            kabulEdilenSurum: r.onay_gerekli ? null : guncelSurum,
            metinler: bekleyen.map(rizaMetniCevir),
          },
        };
      },

      async kvkkMetinleri() {
        const r = veriAl(await yetkili.GET('/v1/hesap/rizalar/guncel'));
        return r.metinler.filter((m) => !m.kabul_edildi).map(rizaMetniCevir);
      },

      async kvkkKabulEt() {
        // Surum parametresi bilgi amaclidir; kabul edilecek metinler sunucudan taze okunur.
        const r = veriAl(await yetkili.GET('/v1/hesap/rizalar/guncel'));
        for (const metin of r.metinler.filter((m) => !m.kabul_edildi)) {
          veriAl(
            await yetkili.POST('/v1/hesap/rizalar', {
              body: { riza_metni_id: metin.id, karar: 'kabul', kaynak },
            }),
          );
        }
      },

      async uyelikSec(uyelikId): Promise<UyelikBaglami> {
        let hedef = uyelikOnbellek.find((u) => u.uyelik_id === uyelikId);
        if (!hedef) {
          const b = veriAl(await yetkili.GET('/v1/hesap/ben'));
          uyelikOnbellek = b.uyelikler.filter((u) => u.durum === 'aktif');
          hedef = uyelikOnbellek.find((u) => u.uyelik_id === uyelikId);
        }
        if (!hedef) throw new ApiHata('bulunamadi', undefined, { durum: 404 });

        const oturum = await depo.oku();
        if (!oturum) throw new ApiHata('yetkisiz', undefined, { durum: 401 });
        const d = veriAl(
          await ham.POST('/auth/token', {
            headers: { Authorization: `Bearer ${oturum.yenileme}` },
            body: { kurum_id: hedef.kurum_id, uyelik_id: hedef.uyelik_id },
          }),
        );
        aktif = { kurumId: hedef.kurum_id, uyelikId: hedef.uyelik_id };
        await depo.yaz({
          erisim: d.access_token,
          yenileme: oturum.yenileme,
          erisimBitis: simdi() + d.expires_in * 1000,
        });

        const rol = d.rol ?? hedef.rol;
        const uyelik = uyelikCevir({ ...hedef, rol });
        if (!mobilRolMu(rol)) return { uyelik, moduller: {}, vurgu: null };

        const tum = veriAl(await yetkili.GET('/v1/hesap/modul-ayarlari/etkin-tumu'));
        const moduller: ModulDurumu = Object.fromEntries(
          MODUL_KODLARI.map((kodu) => [kodu, tum.moduller[kodu] === true] as const),
        );
        // Kurum vurgu rengi icin api'de henuz alan yok.
        return { uyelik, moduller, vurgu: null };
      },

      async cikis() {
        try {
          const b = await depo.oku();
          if (b) {
            // En iyi caba: sunucu tarafi iptal basarisiz olsa da yerel oturum kapanir.
            await ham
              .POST('/auth/cikis', {
                headers: { Authorization: `Bearer ${b.yenileme}` },
                body: BOS_GOVDE,
              })
              .catch(() => undefined);
          }
        } finally {
          aktif = null;
          uyelikOnbellek = [];
          await depo.sil();
        }
      },
    },

    hesap: {
      async sinifKoduKatil(kod) {
        return katilimIstegiCevir(
          veriAl(await yetkili.POST('/v1/hesap/sinif-kodu/katil', { body: { kod } })),
        );
      },
      async sinifKoduIsteklerim() {
        const d = veriAl(await yetkili.GET('/v1/hesap/sinif-kodu/istekler'));
        return d.istekler.map(katilimIstegiCevir);
      },
      async sinifKoduIstegiIptal(istekId) {
        veriAl(
          await yetkili.POST('/v1/hesap/sinif-kodu/istekler/{istek_id}/iptal', {
            params: { path: { istek_id: istekId } },
            body: BOS_GOVDE,
          }),
        );
      },

      async sinifBekleyenleri() {
        const kurumId = etkinKurum();
        const gruplar: { id: string; ad: string; uyeSayisi: number }[] = [];
        let imlec: string | undefined;
        for (let sayfa = 0; sayfa < 10; sayfa++) {
          const d = veriAl(
            await yetkili.GET('/v1/hesap/kurumlar/{kurum_id}/gruplar', {
              params: {
                path: { kurum_id: kurumId },
                query: { tur: 'sinif', durum: 'aktif', ...(imlec ? { imlec } : {}) },
              },
            }),
          );
          for (const g of d.gruplar) gruplar.push({ id: g.id, ad: g.ad, uyeSayisi: g.uye_sayisi });
          if (!d.sonraki_imlec) break;
          imlec = d.sonraki_imlec;
        }
        return Promise.all(
          gruplar.map(async (grup) => {
            const d = veriAl(
              await yetkili.GET(
                '/v1/hesap/kurumlar/{kurum_id}/gruplar/{grup_id}/katilim-istekleri',
                {
                  params: {
                    path: { kurum_id: kurumId, grup_id: grup.id },
                    query: { durum: 'bekliyor', limit: 200 },
                  },
                },
              ),
            );
            const istekler: GrupKatilimIstegi[] = d.istekler.map((i) => ({
              id: i.id,
              grupId: i.grup_id,
              kullaniciId: i.kullanici_id,
              gorunenAd: i.gorunen_ad ?? '',
              olusturma: i.created_at,
            }));
            return { grup, istekler };
          }),
        );
      },
      async katilimIstegiOnayla(grupId, istekId) {
        veriAl(
          await yetkili.POST(
            '/v1/hesap/kurumlar/{kurum_id}/gruplar/{grup_id}/katilim-istekleri/{istek_id}/onayla',
            {
              params: { path: { kurum_id: etkinKurum(), grup_id: grupId, istek_id: istekId } },
              body: BOS_GOVDE,
            },
          ),
        );
      },
      async katilimIstegiReddet(grupId, istekId) {
        veriAl(
          await yetkili.POST(
            '/v1/hesap/kurumlar/{kurum_id}/gruplar/{grup_id}/katilim-istekleri/{istek_id}/reddet',
            {
              params: { path: { kurum_id: etkinKurum(), grup_id: grupId, istek_id: istekId } },
              body: BOS_GOVDE,
            },
          ),
        );
      },
      async katilimKodu(grupId) {
        const sonuc = await yetkili.GET(
          '/v1/hesap/kurumlar/{kurum_id}/gruplar/{grup_id}/katilim-kodu',
          { params: { path: { kurum_id: etkinKurum(), grup_id: grupId } } },
        );
        // Etkin kod yoksa 404: hata degil, "kod yok".
        if (sonuc.response.status === 404) return null;
        return katilimKoduCevir(veriAl(sonuc));
      },
      async katilimKoduYenile(grupId) {
        return katilimKoduCevir(
          veriAl(
            await yetkili.POST('/v1/hesap/kurumlar/{kurum_id}/gruplar/{grup_id}/katilim-kodu', {
              params: { path: { kurum_id: etkinKurum(), grup_id: grupId } },
              body: {},
            }),
          ),
        );
      },

      async davetKabul(belirtec) {
        const d = veriAl(await yetkili.POST('/v1/hesap/davetler/kabul', { body: { belirtec } }));
        return { kurumId: d.kurum_id, uyelikId: d.uyelik_id, rol: d.rol };
      },

      async oturumlar() {
        const d = veriAl(await yetkili.GET('/v1/hesap/oturumlar'));
        return d.oturumlar.map((o): OturumKaydi => ({
          id: o.id,
          olusturma: o.created_at,
          sonKullanim: o.son_kullanim_at,
          cihaz: o.cihaz,
          ipMaskeli: o.ip_maskeli,
          buOturum: o.bu_oturum,
        }));
      },
      async oturumSonlandir(oturumId, buOturum) {
        veriAl(
          await yetkili.DELETE('/v1/hesap/oturumlar/{oturum_id}', {
            params: { path: { oturum_id: oturumId } },
            body: BOS_GOVDE,
          }),
        );
        if (buOturum) await yerelOturumuKapat();
        return { kendiOturumuKapandi: buOturum };
      },
      async oturumlariKapat(mevcutHaric) {
        const d = veriAl(
          await yetkili.POST('/v1/hesap/oturumlar/tumunu-kapat', {
            body: { mevcut_haric: mevcutHaric },
          }),
        );
        if (!mevcutHaric) await yerelOturumuKapat();
        return { kapatilan: d.kapatilan, kendiOturumuKapandi: !mevcutHaric };
      },
    },

    // Ders/odev/motivasyon uclari henuz yok (faz 1 sonraki bloklar): bos durum doner.
    veri: {
      async ogretmenBugun() {
        if (!(await depo.oku())) throw new ApiHata('yetkisiz', undefined, { durum: 401 });
        return { dersler: [], bekleyenSorular: [] };
      },
      async ogrenciBugun() {
        if (!(await depo.oku())) throw new ApiHata('yetkisiz', undefined, { durum: 401 });
        return {
          seri: 0,
          gorevler: [],
          karakter: {
            ad: 'Közü',
            tur: 'kivilcim',
            asama: 1,
            seviye: 1,
            varyant: 0,
            beceriler: { sayisal: 0, sozel: 0, fen: 0, sosyal: 0, dil: 0 },
            uykulu: false,
          },
        };
      },
    },
  };
}
