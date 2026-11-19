import { istemciIpBasliklari } from './istemci-ip';
import {
  mockCikis,
  mockEpostaGiris,
  mockErisimAl,
  mockKodDogrula,
  mockKodIste,
  mockPlatform,
  mockTaklitOkuma,
} from './mock';

/** `NEXT_PUBLIC_API_MOCK=1` ise bellek ici mock, aksi halde `api` ve `motivasyon` servisleri. */
export const mockModu = (): boolean => process.env.NEXT_PUBLIC_API_MOCK === '1';

export const apiAdresi = (): string => process.env.API_URL ?? 'http://localhost:4000';
export const motivasyonAdresi = (): string => process.env.MOTIVASYON_URL ?? 'http://localhost:4001';

/** Ust servisin (veya mock'un) ayristirilmis yaniti. */
export interface UstYanit {
  durum: number;
  govde?: unknown;
}

const AG_HATASI: UstYanit = {
  durum: 502,
  govde: { error: { code: 'hizmet_kullanilamiyor', message: 'Sunucuya ulaşılamadı.' } },
};

async function getir(
  adres: string,
  secenek: { yontem: string; belirtec?: string; govde?: unknown; gelen: Headers },
): Promise<UstYanit> {
  try {
    const yanit = await fetch(adres, {
      method: secenek.yontem,
      headers: {
        ...(secenek.belirtec ? { authorization: `Bearer ${secenek.belirtec}` } : {}),
        ...istemciIpBasliklari(secenek.gelen),
        ...(secenek.yontem === 'GET' ? {} : { 'content-type': 'application/json' }),
      },
      ...(secenek.yontem === 'GET'
        ? {}
        : { body: secenek.govde === undefined ? '{}' : JSON.stringify(secenek.govde) }),
      cache: 'no-store',
    });
    const metin = await yanit.text();
    let govde: unknown;
    try {
      govde = metin.length > 0 ? (JSON.parse(metin) as unknown) : undefined;
    } catch {
      govde = undefined;
    }
    return { durum: yanit.status, govde };
  } catch {
    return AG_HATASI;
  }
}

// --- Giris ---------------------------------------------------------------------------------------

export type GirisYolu = 'otp/gonder' | 'otp/dogrula' | 'eposta/giris';

export async function girisIstegi(
  yol: GirisYolu,
  govde: Record<string, unknown>,
  gelen: Headers,
): Promise<UstYanit> {
  if (mockModu()) {
    const m = (k: string): string => (typeof govde[k] === 'string' ? govde[k] : '');
    if (yol === 'otp/gonder') return mockKodIste(m('telefon'));
    if (yol === 'otp/dogrula') return mockKodDogrula(m('telefon'), m('kod'));
    return mockEpostaGiris(m('eposta'), m('parola'));
  }
  return getir(`${apiAdresi()}/auth/${yol}`, { yontem: 'POST', govde, gelen });
}

/** Oturum belirtecini kisa omurlu erisim belirtecine cevirir (`POST /auth/token`). */
export async function erisimAl(
  oturumBelirteci: string,
  gelen: Headers,
): Promise<{ belirtec: string; omurSn: number } | UstYanit> {
  if (mockModu()) {
    return (
      mockErisimAl(oturumBelirteci) ?? {
        durum: 401,
        govde: { error: { code: 'yetkisiz', message: 'Oturum açmanız gerekiyor.' } },
      }
    );
  }
  const yanit = await getir(`${apiAdresi()}/auth/token`, {
    yontem: 'POST',
    belirtec: oturumBelirteci,
    govde: {},
    gelen,
  });
  const g = yanit.govde as { access_token?: unknown; expires_in?: unknown } | undefined;
  if (yanit.durum === 200 && typeof g?.access_token === 'string') {
    return {
      belirtec: g.access_token,
      omurSn: typeof g.expires_in === 'number' ? g.expires_in : 900,
    };
  }
  return yanit;
}

export async function oturumuKapat(oturumBelirteci: string, gelen: Headers): Promise<void> {
  if (mockModu()) {
    mockCikis(oturumBelirteci);
    return;
  }
  await getir(`${apiAdresi()}/auth/cikis`, { yontem: 'POST', belirtec: oturumBelirteci, gelen });
}

// --- Platform ------------------------------------------------------------------------------------

/**
 * `yol`: `/platform/` sonrasi yol. `motivasyon/...` ile baslayanlar `motivasyon` servisine, digerleri
 * `api` servisine gider (ikisi de kok yolda `/platform/*`).
 */
export async function platformCagri(girdi: {
  yontem: string;
  yol: string;
  arama: string;
  govde: unknown;
  erisim: string;
  gelen: Headers;
}): Promise<UstYanit> {
  if (mockModu()) {
    return mockPlatform({
      erisim: girdi.erisim,
      yontem: girdi.yontem,
      yol: girdi.yol,
      sorgu: new URLSearchParams(girdi.arama),
      govde: girdi.govde,
    });
  }
  const motivasyon = girdi.yol.startsWith('motivasyon/');
  const adres = motivasyon
    ? `${motivasyonAdresi()}/platform/${girdi.yol}`
    : `${apiAdresi()}/platform/${girdi.yol}`;
  return getir(`${adres}${girdi.arama}`, {
    yontem: girdi.yontem,
    belirtec: girdi.erisim,
    govde: girdi.govde,
    gelen: girdi.gelen,
  });
}

/** Taklit belirteciyle `api`nin salt okunur ucunu okur (`/v1/<yol>`). */
export async function taklitOkuma(
  taklitBelirteci: string,
  yol: string,
  gelen: Headers,
): Promise<UstYanit> {
  if (mockModu()) return mockTaklitOkuma(taklitBelirteci, yol);
  return getir(`${apiAdresi()}/v1/${yol}`, { yontem: 'GET', belirtec: taklitBelirteci, gelen });
}
