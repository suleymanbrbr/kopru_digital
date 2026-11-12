import postgres from 'postgres';

import { API_ADMIN_DB_URL, API_URL, sonOtpKodu } from './yardimcilar';
import { api, belirtecAl, rizaKabul } from './yardimcilar-operasyon';

export interface KayitOrtami {
  kurumId: string;
  kurumAdi: string;
  ogrenciAdi: string;
  ogrenciUyelikId: string;
  grupId: string;
  dersId: string;
  dersBasligi: string;
}

async function telefonlaGir(telefon: string) {
  await api('/auth/otp/gonder', { govde: { telefon } });
  const kod = await sonOtpKodu(telefon);
  const { oturum_belirteci: oturum } = await api<{ oturum_belirteci: string }>(
    '/auth/otp/dogrula',
    { govde: { telefon, kod } },
  );
  const ilk = await belirtecAl(oturum);
  await rizaKabul(ilk);
  return { oturum, erisim: ilk };
}

/**
 * Bireysel (solo hoca) kurum: sahip telefonla (hoca da kendisidir), bir ogrenci (ikinci telefon), bir grup
 * ve bu gruba "Denklemler" dersi. Ders veritabaninda 2 saat once baslamis, 1 saat once bitmis yapilir ve
 * ogrencinin yoklamasi "geldi" alinir; boylece geri bildirim bekleyen listesinde cikar.
 */
export async function kayitOrtaminiKur(
  sahipTelefon: string,
  ogrenciTelefon: string,
  ek: string,
): Promise<KayitOrtami> {
  const sahip0 = await telefonlaGir(sahipTelefon);
  const kurumAdi = `Kayit Kurumu ${ek}`;
  const { kurum } = await api<{ kurum: { id: string } }>('/v1/hesap/kurumlar', {
    belirtec: sahip0.erisim,
    govde: { ad: kurumAdi, tur: 'bireysel' },
  });
  const sahip = await belirtecAl(sahip0.oturum, kurum.id);

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
  const grup = await api<{ id: string }>(`/v1/hesap/kurumlar/${kurum.id}/gruplar`, {
    belirtec: sahip,
    govde: { tur: 'grup', ad: `8-A Matematik ${ek}` },
  });
  await api(`/v1/hesap/kurumlar/${kurum.id}/gruplar/${grup.id}/uyeler`, {
    belirtec: sahip,
    govde: { ogrenci_idleri: [ogrenciUyelikId] },
  });

  const dersBasligi = 'Denklemler';
  const yarin = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(
    new Date(Date.now() + 86_400_000),
  );
  const { ders } = await api<{ ders: { id: string } }>(`/v1/ders/kurumlar/${kurum.id}/dersler`, {
    belirtec: sahip,
    govde: {
      grup_id: grup.id,
      tarih: yarin,
      baslangic_saati: '23:00',
      sure_dk: 60,
      brans_kodu: 'matematik',
      baslik: dersBasligi,
    },
  });
  const sql = postgres(API_ADMIN_DB_URL, { max: 1 });
  try {
    await sql`update ders.dersler set baslangic_at = now() - interval '2 hours', bitis_at = now() - interval '1 hour', ilk_baslangic_at = now() - interval '2 hours' where id = ${ders.id}`;
  } finally {
    await sql.end({ timeout: 1 });
  }
  const yanit = await fetch(
    `${API_URL}/v1/ders/kurumlar/${kurum.id}/dersler/${ders.id}/yoklamalar`,
    {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${sahip}`,
        'idempotency-key': crypto.randomUUID(),
      },
      body: JSON.stringify({
        yoklamalar: [
          { ogrenci_id: ogrenciUyelikId, durum: 'geldi', isaretlenme_at: new Date().toISOString() },
        ],
      }),
    },
  );
  if (!yanit.ok) throw new Error(`yoklama ${String(yanit.status)}: ${await yanit.text()}`);
  return {
    kurumId: kurum.id,
    kurumAdi,
    ogrenciAdi,
    ogrenciUyelikId,
    grupId: grup.id,
    dersId: ders.id,
    dersBasligi,
  };
}
