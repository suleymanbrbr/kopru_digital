import { errorCodes } from '@kopru/contracts';
import { AppError } from '@kopru/service-kit';
import type { FastifyReply, FastifyRequest } from 'fastify';

/** Fastify basliklarini Web `Headers` nesnesine cevirir (Better Auth girdisi). */
export function webBasliklari(request: FastifyRequest): Headers {
  const basliklar = new Headers();
  for (const [ad, deger] of Object.entries(request.headers)) {
    if (Array.isArray(deger)) for (const d of deger) basliklar.append(ad, d);
    else if (deger !== undefined) basliklar.set(ad, deger);
  }
  return basliklar;
}

const HATA_ESLEME: Record<string, { status: number; code: string; message: string }> = {
  INVALID_OTP: {
    status: 400,
    code: errorCodes.kodGecersiz,
    message: 'Kod hatalı veya süresi dolmuş.',
  },
  OTP_EXPIRED: {
    status: 400,
    code: errorCodes.kodGecersiz,
    message: 'Kod hatalı veya süresi dolmuş.',
  },
  OTP_NOT_FOUND: {
    status: 400,
    code: errorCodes.kodGecersiz,
    message: 'Kod hatalı veya süresi dolmuş.',
  },
  TOO_MANY_ATTEMPTS: {
    status: 429,
    code: errorCodes.rateLimited,
    message: 'Çok fazla hatalı deneme. Yeni kod isteyin.',
  },
  INVALID_EMAIL_OR_PASSWORD: {
    status: 401,
    code: errorCodes.unauthorized,
    message: 'E-posta veya parola hatalı.',
  },
  USER_ALREADY_EXISTS: {
    status: 409,
    code: errorCodes.conflict,
    message: 'Bu e-posta ile kayıtlı bir hesap var.',
  },
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: {
    status: 409,
    code: errorCodes.conflict,
    message: 'Bu e-posta ile kayıtlı bir hesap var.',
  },
};

function ayristir(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

export interface BaYaniti {
  govde: unknown;
  /** Bearer eklentisinin imzali oturum belirteci (`set-auth-token`). */
  oturumBelirteci: string | null;
}

/**
 * Better Auth `Response` nesnesini Fastify yanitina uyarlar: oturum cerezlerini aktarir, hata
 * govdelerini Turkce standart hata formatina cevirir. Basarili ise ayristirilmis govdeyi dondurur.
 */
export async function baYaniti(response: Response, reply: FastifyReply): Promise<BaYaniti> {
  const text = await response.text();
  const govde = ayristir(text);
  if (!response.ok) {
    const kod =
      typeof govde === 'object' && govde !== null && 'code' in govde ? String(govde.code) : '';
    const esleme = HATA_ESLEME[kod];
    if (esleme) throw new AppError(esleme.status, esleme.code, esleme.message);
    const status = response.status >= 500 ? 502 : response.status;
    throw new AppError(
      status,
      status === 401 ? errorCodes.unauthorized : errorCodes.validation,
      'İstek işlenemedi.',
    );
  }
  const cerezler = response.headers.getSetCookie();
  if (cerezler.length > 0) void reply.header('set-cookie', cerezler);
  return { govde, oturumBelirteci: response.headers.get('set-auth-token') };
}
