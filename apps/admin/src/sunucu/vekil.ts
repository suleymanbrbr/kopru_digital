import { NextResponse, type NextRequest } from 'next/server';

import { erisimAl, platformCagri, taklitOkuma, type UstYanit } from './api';
import {
  ayniKaynakMi,
  cerez,
  cerezSil,
  cerezYaz,
  ERISIM_CEREZI,
  hataYaniti,
  nesneMi,
  OTURUM_CEREZI,
  TAKLIT_CEREZI,
} from './bff';

/**
 * `/api/platform/<yol>` -> `api` servisinin `/platform/<yol>` (ve `motivasyon/...` icin motivasyon
 * servisinin `/platform/motivasyon/...`) ucu icin tek gecit. Tarayici hicbir belirtec gormez: BFF oturum
 * cerezinden erisim belirtecini uretir ve Bearer olarak iletir. Yalniz asagidaki yontem+yol desenleri
 * gecer; gerisi 404.
 */

const UUID = String.raw`[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}`;
const KAT = String.raw`(?:lgs|tyt|ayt|ydt|okul)`;
const MUF = `mufredat/kataloglar/${KAT}`;

export const IZINLI: readonly { yontem: string; desen: RegExp }[] = [
  { yontem: 'GET', desen: /^ben$/ },
  { yontem: 'POST', desen: /^ikinci-adim\/(?:kur|onayla|dogrula)$/ },
  { yontem: 'GET', desen: /^kurumlar$/ },
  { yontem: 'GET', desen: new RegExp(`^kurumlar/${UUID}$`) },
  { yontem: 'PUT', desen: new RegExp(`^kurumlar/${UUID}/(?:moduller|beta)/[a-z][a-z0-9_]{1,39}$`) },
  { yontem: 'GET', desen: new RegExp(`^kurumlar/${UUID}/abonelik$`) },
  {
    yontem: 'POST',
    desen: new RegExp(
      `^kurumlar/${UUID}/abonelik/(?:kurumsal-aktivasyon|deneme-uzat|ek-sure|plan-degistir|iptal|askiya-al)$`,
    ),
  },
  { yontem: 'POST', desen: new RegExp(`^kurumlar/${UUID}/(?:askiya-al|ac)$`) },
  { yontem: 'POST', desen: /^taklit$/ },
  { yontem: 'POST', desen: new RegExp(`^taklit/${UUID}/sonlandir$`) },
  { yontem: 'GET', desen: /^denetim$/ },
  { yontem: 'GET', desen: /^sistem-sagligi$/ },
  { yontem: 'GET', desen: /^mesajlar$/ },
  { yontem: 'POST', desen: /^mesajlar$/ },
  { yontem: 'POST', desen: new RegExp(`^mesajlar/${UUID}/iptal$`) },
  // Mufredat editoru
  { yontem: 'GET', desen: /^mufredat\/kataloglar$/ },
  { yontem: 'GET', desen: new RegExp(`^${MUF}/surumler/\\d+/(?:agac|fark)$`) },
  { yontem: 'POST', desen: new RegExp(`^${MUF}/taslak$`) },
  { yontem: 'POST', desen: new RegExp(`^${MUF}/taslak/(?:konular|yayinla)$`) },
  {
    yontem: 'POST',
    desen: new RegExp(`^${MUF}/taslak/konular/${UUID}/(?:adlandir|tasi|birlestir|kaldir)$`),
  },
  // Motivasyon ayarlari
  { yontem: 'GET', desen: /^motivasyon\/ayarlar$/ },
  { yontem: 'PUT', desen: /^motivasyon\/ayarlar$/ },
  { yontem: 'POST', desen: /^motivasyon\/ayarlar\/geri-al$/ },
];

/** Taklit belirteciyle okunabilen `api` yollari (`/v1/<yol>`), yalniz GET. */
export const TAKLIT_OKUMA_IZINLI: readonly RegExp[] = [
  /^hesap\/ben$/,
  /^hesap\/modul-ayarlari\/etkin-tumu$/,
  new RegExp(`^hesap/kurumlar/${UUID}$`),
];

/** Parca guvenli karakterlerden olusur (`..`, bosluk, sorgu vb. gecmez). */
const PARCA = /^[A-Za-z0-9_-]+$/;

export function yolIzinliMi(parcalar: readonly string[], yontem: string): boolean {
  if (parcalar.length === 0 || !parcalar.every((p) => PARCA.test(p))) return false;
  const yol = parcalar.join('/');
  return IZINLI.some((i) => i.yontem === yontem && i.desen.test(yol));
}

export function taklitYoluIzinliMi(parcalar: readonly string[]): boolean {
  if (parcalar.length === 0 || !parcalar.every((p) => PARCA.test(p))) return false;
  const yol = parcalar.join('/');
  return TAKLIT_OKUMA_IZINLI.some((d) => d.test(yol));
}

/** `UstYanit` -> `NextResponse` (govde yoksa bos). */
export function yanitaCevir(ust: UstYanit): NextResponse {
  return ust.govde === undefined
    ? new NextResponse(null, { status: ust.durum, headers: { 'cache-control': 'no-store' } })
    : NextResponse.json(ust.govde, { status: ust.durum, headers: { 'cache-control': 'no-store' } });
}

export interface TaklitCerezi {
  token: string;
  taklit_id: string;
  kurum_id: string;
  hedef_kullanici_id: string;
  rol: string;
  bitis_at: string;
}

export function taklitCereziOku(request: NextRequest): TaklitCerezi | null {
  const ham = cerez(request, TAKLIT_CEREZI);
  if (!ham) return null;
  try {
    const v = JSON.parse(Buffer.from(ham, 'base64url').toString('utf8')) as unknown;
    if (!nesneMi(v)) return null;
    const dizge = (k: string) => (typeof v[k] === 'string' ? v[k] : null);
    const [token, taklitId, kurumId, hedef, rol, bitis] = [
      dizge('token'),
      dizge('taklit_id'),
      dizge('kurum_id'),
      dizge('hedef_kullanici_id'),
      dizge('rol'),
      dizge('bitis_at'),
    ];
    if (!token || !taklitId || !kurumId || !hedef || !rol || !bitis) return null;
    return {
      token,
      taklit_id: taklitId,
      kurum_id: kurumId,
      hedef_kullanici_id: hedef,
      rol,
      bitis_at: bitis,
    };
  } catch {
    return null;
  }
}

function taklitCereziYaz(yanit: NextResponse, request: NextRequest, c: TaklitCerezi): void {
  const kalanSn = (Date.parse(c.bitis_at) - Date.now()) / 1000;
  cerezYaz(
    yanit,
    request,
    TAKLIT_CEREZI,
    Buffer.from(JSON.stringify(c)).toString('base64url'),
    kalanSn,
  );
}

function erisimHatasi(yanit: UstYanit): NextResponse {
  const cevap = yanitaCevir(yanit.durum === 401 ? { durum: 401, govde: yanit.govde } : yanit);
  if (yanit.durum === 401) cerezSil(cevap, OTURUM_CEREZI, ERISIM_CEREZI, TAKLIT_CEREZI);
  return cevap;
}

export async function platformVekili(
  request: NextRequest,
  parcalar: readonly string[],
): Promise<NextResponse> {
  const yontem = request.method;
  if (!yolIzinliMi(parcalar, yontem)) return hataYaniti('bulunamadi', 'Kaynak bulunamadı.', 404);
  if (yontem !== 'GET' && !ayniKaynakMi(request)) {
    return hataYaniti('yasak', 'İstek kaynağı geçersiz.', 403);
  }
  const oturum = cerez(request, OTURUM_CEREZI);
  if (!oturum) return hataYaniti('yetkisiz', 'Oturum açmanız gerekiyor.', 401);

  const yol = parcalar.join('/');
  const govdesiz = yontem === 'GET';
  const govde: unknown = govdesiz ? undefined : await request.json().catch(() => undefined);
  const arama = request.nextUrl.search;

  let erisim = cerez(request, ERISIM_CEREZI);
  let yenilendi: { belirtec: string; omurSn: number } | undefined;
  const uret = async (): Promise<UstYanit | null> => {
    const sonuc = await erisimAl(oturum, request.headers);
    if ('belirtec' in sonuc) {
      yenilendi = sonuc;
      erisim = sonuc.belirtec;
      return null;
    }
    return sonuc;
  };

  if (!erisim) {
    const hata = await uret();
    if (hata) return erisimHatasi(hata);
  }
  const cagir = () =>
    platformCagri({ yontem, yol, arama, govde, erisim: erisim ?? '', gelen: request.headers });

  let ust = await cagir();
  if (ust.durum === 401 && !yenilendi) {
    // Erisim belirteci suresi dolmus olabilir: bir kez yenileyip tekrar dene.
    const hata = await uret();
    if (hata) return erisimHatasi(hata);
    ust = await cagir();
  }
  if (ust.durum === 401) return erisimHatasi(ust);

  // Ikinci adim dogrulandi: belirtec (2FA kaniti tasiyabilir) yenilenir.
  if (ust.durum === 200 && /^ikinci-adim\/(?:onayla|dogrula)$/.test(yol)) {
    const hata = await uret();
    if (hata) return erisimHatasi(hata);
  }

  // Taklit baslatma: taklit belirteci tarayiciya gitmez, httpOnly cerezde kalir.
  let cevapGovde = ust.govde;
  let taklitCerezi: TaklitCerezi | undefined;
  if (yol === 'taklit' && ust.durum === 200 && nesneMi(ust.govde)) {
    const { access_token: token, ...geri } = ust.govde;
    cevapGovde = geri;
    if (
      typeof token === 'string' &&
      typeof geri.taklit_id === 'string' &&
      typeof geri.kurum_id === 'string' &&
      typeof geri.hedef_kullanici_id === 'string' &&
      typeof geri.rol === 'string' &&
      typeof geri.bitis_at === 'string'
    ) {
      taklitCerezi = {
        token,
        taklit_id: geri.taklit_id,
        kurum_id: geri.kurum_id,
        hedef_kullanici_id: geri.hedef_kullanici_id,
        rol: geri.rol,
        bitis_at: geri.bitis_at,
      };
    }
  }

  const cevap = yanitaCevir({ durum: ust.durum, govde: cevapGovde });
  if (yenilendi) cerezYaz(cevap, request, ERISIM_CEREZI, yenilendi.belirtec, yenilendi.omurSn - 30);
  if (taklitCerezi) taklitCereziYaz(cevap, request, taklitCerezi);
  if (/^taklit\/[^/]+\/sonlandir$/.test(yol) && ust.durum === 200) cerezSil(cevap, TAKLIT_CEREZI);
  return cevap;
}

/** `GET /api/taklit/okuma/<yol>`: taklit belirteciyle salt okunur `api` okumasi. */
export async function taklitOkumaVekili(
  request: NextRequest,
  parcalar: readonly string[],
): Promise<NextResponse> {
  if (!taklitYoluIzinliMi(parcalar)) return hataYaniti('bulunamadi', 'Kaynak bulunamadı.', 404);
  if (!cerez(request, OTURUM_CEREZI))
    return hataYaniti('yetkisiz', 'Oturum açmanız gerekiyor.', 401);
  const c = taklitCereziOku(request);
  if (!c || Date.parse(c.bitis_at) <= Date.now()) {
    const cevap = hataYaniti('taklit_yok', 'Etkin taklit oturumu yok.', 404);
    cerezSil(cevap, TAKLIT_CEREZI);
    return cevap;
  }
  const ust = await taklitOkuma(c.token, parcalar.join('/'), request.headers);
  if (ust.durum === 401) {
    // Taklit belirteci sonlanmis (oturum degil): giris ekranina atmayiz.
    const cevap = hataYaniti('taklit_sona_erdi', 'Taklit oturumu sona ermiş.', 410);
    cerezSil(cevap, TAKLIT_CEREZI);
    return cevap;
  }
  return yanitaCevir(ust);
}
