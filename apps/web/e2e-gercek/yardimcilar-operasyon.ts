import { API_URL, sonOtpKodu } from './yardimcilar';

/** Gercek api'ye dogrudan (tarayicisiz) istek; senaryonun on kosullarini hizli kurmak icin. */
export async function api<T>(
  yol: string,
  {
    yontem = 'POST',
    govde,
    belirtec,
  }: { yontem?: string; govde?: unknown; belirtec?: string } = {},
): Promise<T> {
  const yanit = await fetch(`${API_URL}${yol}`, {
    method: yontem,
    headers: {
      ...(govde === undefined ? {} : { 'content-type': 'application/json' }),
      ...(belirtec ? { authorization: `Bearer ${belirtec}` } : {}),
    },
    ...(govde === undefined ? {} : { body: JSON.stringify(govde) }),
  });
  if (!yanit.ok) throw new Error(`${yontem} ${yol} ${String(yanit.status)}: ${await yanit.text()}`);
  return (await yanit.json()) as T;
}

interface Uyelik {
  uyelik_id: string;
  kurum_id: string;
  rol: string;
}

export async function belirtecAl(oturum: string, kurumId?: string): Promise<string> {
  const { access_token: erisim } = await api<{ access_token: string }>('/auth/token', {
    belirtec: oturum,
    govde: kurumId ? { kurum_id: kurumId } : {},
  });
  return erisim;
}

/** Bekleyen KVKK metinlerini kabul eder (yeni kullanici kiraci uclarini ancak bundan sonra kullanir). */
export async function rizaKabul(erisim: string): Promise<void> {
  const { metinler } = await api<{ metinler: { id: string; kabul_edildi: boolean }[] }>(
    '/v1/hesap/rizalar/guncel',
    { yontem: 'GET', belirtec: erisim },
  );
  for (const m of metinler.filter((x) => !x.kabul_edildi)) {
    await api('/v1/hesap/rizalar', { belirtec: erisim, govde: { riza_metni_id: m.id } });
  }
}

export interface OperasyonOrtami {
  kurumId: string;
  kurumAdi: string;
  ogrenciAdi: string;
  ogrenciUyelikId: string;
  paketAdi: string;
  /** Sahip erisim belirteci (kurum baglamli); dogrulama okumalari icin. */
  sahipBelirteci: string;
}

/**
 * Bireysel (solo hoca) kurum kurar: sahip (telefonla; KVKK tarayicida onaylanmis olmali), bir ogrenci
 * (e-posta/parola ile kayit + davet kabulu), ogrencinin paket modeli ve bir paket sablonu.
 */
export async function operasyonOrtaminiKur(telefon: string, ek: string): Promise<OperasyonOrtami> {
  await api('/auth/otp/gonder', { govde: { telefon } });
  const kod = await sonOtpKodu(telefon);
  const { oturum_belirteci: oturum } = await api<{ oturum_belirteci: string }>(
    '/auth/otp/dogrula',
    {
      govde: { telefon, kod },
    },
  );
  const ilk = await belirtecAl(oturum);
  const kurumAdi = `Solo Hoca ${ek}`;
  const { kurum } = await api<{ kurum: { id: string } }>('/v1/hesap/kurumlar', {
    belirtec: ilk,
    govde: { ad: kurumAdi, tur: 'bireysel' },
  });
  const sahip = await belirtecAl(oturum, kurum.id);
  const davet = await api<{ belirtec: string }>(`/v1/hesap/kurumlar/${kurum.id}/davetler`, {
    belirtec: sahip,
    govde: { kanal: 'baglanti', rol: 'ogrenci' },
  });

  const ogrenciAdi = `Deniz Yılmaz ${ek}`;
  const eposta = `ogrenci${ek}@example.com`;
  const { oturum_belirteci: ogrOturum } = await api<{ oturum_belirteci: string }>(
    '/auth/eposta/kayit',
    { govde: { eposta, parola: 'cok-gizli-parola', gorunen_ad: ogrenciAdi } },
  );
  const ogrIlk = await belirtecAl(ogrOturum);
  await rizaKabul(ogrIlk);
  const { uyelik_id: ogrenciUyelikId } = await api<Uyelik>('/v1/hesap/davetler/kabul', {
    belirtec: ogrIlk,
    govde: { belirtec: davet.belirtec },
  });

  const ogrenciId = ogrenciUyelikId;
  await api(`/v1/finans/kurumlar/${kurum.id}/ogrenciler/${ogrenciId}/finans-profili`, {
    yontem: 'PUT',
    belirtec: sahip,
    govde: { model: 'paket', odeyen_ad: 'Ayşe Yılmaz', odeyen_telefon: '+905321110099' },
  });
  const paketAdi = '8 Derslik Paket';
  await api(`/v1/finans/kurumlar/${kurum.id}/paketler`, {
    belirtec: sahip,
    govde: { ad: paketAdi, kredi_adedi: 8, fiyat_kurus: 480_000 },
  });
  return {
    kurumId: kurum.id,
    kurumAdi,
    ogrenciAdi,
    ogrenciUyelikId: ogrenciId,
    paketAdi,
    sahipBelirteci: sahip,
  };
}

/** Ogrencinin finans kartindaki kalan ders sayisini api'den okur (arayuzden bagimsiz dogrulama). */
export async function kalanDersOku(o: OperasyonOrtami): Promise<number> {
  const k = await api<{ kalan_kredi: number }>(
    `/v1/finans/kurumlar/${o.kurumId}/ogrenciler/${o.ogrenciUyelikId}/finans`,
    { yontem: 'GET', belirtec: o.sahipBelirteci },
  );
  return k.kalan_kredi;
}
