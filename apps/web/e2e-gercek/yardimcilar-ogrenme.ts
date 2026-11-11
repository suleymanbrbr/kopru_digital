import { sonOtpKodu } from './yardimcilar';
import { api, belirtecAl, rizaKabul } from './yardimcilar-operasyon';

export interface OgrenmeOrtami {
  kurumId: string;
  kurumAdi: string;
  grupAdi: string;
  ogrenciAdi: string;
  ogrenciUyelikId: string;
  grupId: string;
  sahipBelirteci: string;
}

/** Telefonla (OTP) giris yapip KVKK'yi API'den kabul eder; kurum kimligi verilirse o kurumun belirtecini dondurur. */
async function telefonlaGir(telefon: string, kurumId?: string) {
  await api('/auth/otp/gonder', { govde: { telefon } });
  const kod = await sonOtpKodu(telefon);
  const { oturum_belirteci: oturum } = await api<{ oturum_belirteci: string }>(
    '/auth/otp/dogrula',
    { govde: { telefon, kod } },
  );
  const ilk = await belirtecAl(oturum);
  await rizaKabul(ilk);
  return { oturum, erisim: kurumId ? await belirtecAl(oturum, kurumId) : ilk };
}

/**
 * Kurum (sahip telefonla), bir grup ve gruba bagli bir ogrenci (ikinci telefon, KVKK kabul edilmis)
 * kurar. Tarayicida yalniz OTP girisi gerekir; KVKK ekrani cikmaz.
 */
export async function ogrenmeOrtaminiKur(
  sahipTelefon: string,
  ogrenciTelefon: string,
  ek: string,
): Promise<OgrenmeOrtami> {
  const sahip0 = await telefonlaGir(sahipTelefon);
  const kurumAdi = `Ogrenme Kurumu ${ek}`;
  const { kurum } = await api<{ kurum: { id: string } }>('/v1/hesap/kurumlar', {
    belirtec: sahip0.erisim,
    govde: { ad: kurumAdi, tur: 'kurum' },
  });
  const sahipOturum = sahip0.oturum;
  const sahip = await belirtecAl(sahipOturum, kurum.id);

  const ogrenciAdi = `Deniz Yılmaz ${ek}`;
  const davet = await api<{ belirtec: string }>(`/v1/hesap/kurumlar/${kurum.id}/davetler`, {
    belirtec: sahip,
    govde: { kanal: 'baglanti', rol: 'ogrenci', hedef_ad: ogrenciAdi },
  });
  const ogr = await telefonlaGir(ogrenciTelefon);
  const { uyelik_id: ogrenciUyelikId } = await api<{ uyelik_id: string }>(
    '/v1/hesap/davetler/kabul',
    { belirtec: ogr.erisim, govde: { belirtec: davet.belirtec } },
  );
  const grupAdi = `8-A Matematik ${ek}`;
  const grup = await api<{ id: string }>(`/v1/hesap/kurumlar/${kurum.id}/gruplar`, {
    belirtec: sahip,
    govde: { tur: 'sinif', ad: grupAdi },
  });
  await api(`/v1/hesap/kurumlar/${kurum.id}/gruplar/${grup.id}/uyeler`, {
    belirtec: sahip,
    govde: { ogrenci_idleri: [ogrenciUyelikId] },
  });
  return {
    kurumId: kurum.id,
    kurumAdi,
    grupAdi,
    ogrenciAdi,
    ogrenciUyelikId,
    grupId: grup.id,
    sahipBelirteci: sahip,
  };
}
