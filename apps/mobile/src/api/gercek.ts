import { createServisIstemcileri, hataGovdesiMi } from '@kopru/api-client';
import { MODUL_KODLARI, type ModulDurumu } from '@kopru/contracts';

import type { Belirtecler, BelirtecDeposu } from '../depo/belirtecDeposu';
import type { Adaptorler } from './adaptorler';
import {
  ApiHata,
  type MobilRol,
  type OturumBilgisi,
  type RizaMetni,
  type Rol,
  type Uyelik,
  type UyelikBaglami,
} from './tipler';

export interface GercekAdaptorSecenekleri {
  /** Api taban adresi (ornegin http://localhost:4000). */
  apiUrl: string;
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

interface ApiUyelik {
  uyelik_id: string;
  kurum_id: string;
  kurum_ad: string | null;
  rol: Rol;
  durum: 'davetli' | 'aktif' | 'askida' | 'ayrildi';
}

/**
 * HTTP yanitini adaptor hata modeline cevirir (ADR 0004 hata kodlari).
 * 401 -> yetkisiz, 402 -> abonelik_gerekli, 403 -> riza_gerekli | modul_kapali | izin_yok.
 */
export function apiHatasiOlustur(durum: number, govde: unknown): ApiHata {
  const kod = hataGovdesiMi(govde) ? govde.error.code : undefined;
  const mesaj = hataGovdesiMi(govde) ? govde.error.message : undefined;
  const sec = { durum };
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
  if (kod === 'kod_gecersiz') return new ApiHata('otp_gecersiz', mesaj, sec);
  if (durum === 429) return new ApiHata('otp_cok_deneme', mesaj, sec);
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
  const { api: yetkili } = createServisIstemcileri({
    adresler: { api: sec.apiUrl },
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

  function uyelikCevir(u: ApiUyelik): Uyelik {
    return { uyelikId: u.uyelik_id, kurumId: u.kurum_id, kurumAd: u.kurum_ad ?? '', rol: u.rol };
  }

  return {
    auth: {
      async otpIste(telefon) {
        veriAl(await ham.POST('/auth/otp/gonder', { body: { telefon } }));
        // Api yeniden gonderme bekleme suresi dondurmez; istemci tarafi sabit bekleme.
        return { yenidenGondermeSn: 30 };
      },

      async otpDogrula(telefon, kod) {
        const d = veriAl(await ham.POST('/auth/otp/dogrula', { body: { telefon, kod } }));
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

        const sonuclar = await Promise.all(
          MODUL_KODLARI.map(async (modul_kodu) => {
            const m = veriAl(
              await yetkili.GET('/v1/hesap/modul-ayarlari/etkin', {
                params: { query: { modul_kodu } },
              }),
            );
            return [modul_kodu, m.acik] as const;
          }),
        );
        const moduller: ModulDurumu = Object.fromEntries(sonuclar);
        // Kurum vurgu rengi icin api'de henuz alan yok.
        return { uyelik, moduller, vurgu: null };
      },

      async cikis() {
        try {
          const b = await depo.oku();
          if (b) {
            // En iyi caba: sunucu tarafi iptal basarisiz olsa da yerel oturum kapanir.
            await ham
              .POST('/auth/cikis', { headers: { Authorization: `Bearer ${b.yenileme}` } })
              .catch(() => undefined);
          }
        } finally {
          aktif = null;
          uyelikOnbellek = [];
          await depo.sil();
        }
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
