import type postgres from 'postgres';
import { uuidv7 } from 'uuidv7';
import { expect } from 'vitest';

import {
  bearer,
  kurumluKullanici,
  otpIleGiris,
  rastgeleTelefon,
  rizaKabulEt,
  tokenAl,
  type KurumluKullanici,
  type TestServisi,
} from './test/yardimcilar.js';

/** finans testleri icin ortak hazirlik: kurum, ogretmen/ogrenci uyelikleri, grup ve atama. */

export interface Uye {
  uyelikId: string;
  kullaniciId: string;
  token: string;
}

export interface FinansDunyasi {
  owner: KurumluKullanici;
  kurumId: string;
  api: (yol: string) => string;
  /** Giris yapabilen uye (ogretmen/ogrenci/yonetici) ekler. */
  uyeEkle: (rol: 'ogrenci' | 'ogretmen' | 'yonetici', ad?: string, subeId?: string) => Promise<Uye>;
  /** Giris yapmayan, yalniz uyeligi olan ogrenci. */
  ogrenciEkle: (ad?: string) => Promise<{ uyelikId: string; kullaniciId: string }>;
  grupAc: (tur?: 'birebir' | 'grup' | 'sinif' | 'etut') => Promise<string>;
  grubaEkle: (grupId: string, ogrenciId: string) => Promise<void>;
  ata: (grupId: string, ogretmenUyelikId: string) => Promise<void>;
  paketOlustur: (govde?: Record<string, unknown>) => Promise<{ id: string; fiyat_kurus: number }>;
  paketSat: (
    ogrenciId: string,
    paketId: string,
    odeme?: Record<string, unknown>,
    token?: string,
  ) => Promise<{
    statusCode: number;
    govde: {
      satis: { id: string; kalan_kredi: number; bitis_tarihi: string | null; durum: string };
      tahsilat: { id: string } | null;
      kalan_kredi: number;
      bakiye_kurus: number;
    };
  }>;
}

export async function finansDunyasi(
  t: TestServisi,
  sistem: postgres.Sql,
  tur: 'bireysel' | 'ekip' | 'kurum' = 'kurum',
): Promise<FinansDunyasi> {
  const { app } = t.service;
  const owner = await kurumluKullanici(t, tur);
  const { kurumId } = owner;
  const api = (yol: string) => `/v1/finans/kurumlar/${kurumId}${yol}`;

  const ogrenciEkle = async (ad = 'Öğrenci') => {
    const kullaniciId = uuidv7();
    const uyelikId = uuidv7();
    await sistem`insert into hesap.kullanicilar (id, telefon_e164) values (${kullaniciId}, ${rastgeleTelefon()})`;
    await sistem`insert into hesap.uyelikler (id, kurum_id, kullanici_id, rol, gorunen_ad) values (${uyelikId}, ${kurumId}, ${kullaniciId}, 'ogrenci', ${ad})`;
    return { uyelikId, kullaniciId };
  };

  const uyeEkle: FinansDunyasi['uyeEkle'] = async (rol, ad = rol, subeId) => {
    const g = await otpIleGiris(t);
    const ilk = await tokenAl(t, g.oturum);
    await rizaKabulEt(t, ilk.accessToken);
    const uyelikId = uuidv7();
    await sistem`insert into hesap.uyelikler (id, kurum_id, kullanici_id, rol, gorunen_ad, sube_id) values (${uyelikId}, ${kurumId}, ${g.kullaniciId}, ${rol}, ${ad}, ${subeId ?? null})`;
    const tok = await tokenAl(t, g.oturum, { kurum_id: kurumId, uyelik_id: uyelikId });
    return { uyelikId, kullaniciId: g.kullaniciId, token: tok.accessToken };
  };

  const grupAc: FinansDunyasi['grupAc'] = async (grupTuru = 'grup') => {
    const res = await app.inject({
      method: 'POST',
      url: `/v1/hesap/kurumlar/${kurumId}/gruplar`,
      headers: bearer(owner.token),
      payload: { tur: grupTuru, ad: 'Grup ' + uuidv7().slice(-6) },
    });
    expect(res.statusCode).toBe(201);
    return res.json<{ id: string }>().id;
  };

  const grubaEkle = async (grupId: string, ogrenciId: string) => {
    await sistem`insert into hesap.grup_uyeleri (id, kurum_id, grup_id, ogrenci_id) values (${uuidv7()}, ${kurumId}, ${grupId}, ${ogrenciId})`;
  };
  const ata = async (grupId: string, ogretmenUyelikId: string) => {
    await sistem`insert into hesap.atamalar (id, kurum_id, grup_id, ogretmen_id, brans_kodu) values (${uuidv7()}, ${kurumId}, ${grupId}, ${ogretmenUyelikId}, 'matematik')`;
  };

  const paketOlustur: FinansDunyasi['paketOlustur'] = async (govde = {}) => {
    const res = await app.inject({
      method: 'POST',
      url: api('/paketler'),
      headers: bearer(owner.token),
      payload: { ad: '8 Ders', kredi_adedi: 8, fiyat_kurus: 600_000, ...govde },
    });
    expect(res.statusCode).toBe(201);
    return res.json<{ id: string; fiyat_kurus: number }>();
  };

  const paketSat: FinansDunyasi['paketSat'] = async (ogrenciId, paketId, odeme, token) => {
    const res = await app.inject({
      method: 'POST',
      url: api('/paket-satislari'),
      headers: bearer(token ?? owner.token),
      payload: { ogrenci_id: ogrenciId, paket_id: paketId, ...(odeme ? { odeme } : {}) },
    });
    return { statusCode: res.statusCode, govde: res.json() };
  };

  return {
    owner,
    kurumId,
    api,
    uyeEkle,
    ogrenciEkle,
    grupAc,
    grubaEkle,
    ata,
    paketOlustur,
    paketSat,
  };
}
