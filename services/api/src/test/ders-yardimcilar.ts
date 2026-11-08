import { randomInt } from 'node:crypto';

import type postgres from 'postgres';
import { uuidv7 } from 'uuidv7';
import { expect } from 'vitest';

import { tarihEkle } from '../modules/ders/index.js';
import {
  bearer,
  otpIleGiris,
  rizaKabulEt,
  yeniIp,
  type KurumluKullanici,
  type TestServisi,
} from './yardimcilar.js';

/** Ders takvimi testleri icin ortak kurulum yardimcilari. */

export interface Hata {
  error: {
    code: string;
    message: string;
    details?: { cakisanlar?: unknown[]; guncel_surum?: number };
  };
}

export interface DersJson {
  id: string;
  grup_id: string;
  seri_id: string | null;
  seri_sirasi: number | null;
  ogretmen_id: string;
  brans_kodu: string;
  baslik: string | null;
  baslangic_at: string;
  bitis_at: string;
  durum: string;
  iptal_nedeni: string | null;
  iptal_kaynagi: string | null;
  iptal_eden_id: string | null;
  gec_iptal: boolean;
  ilk_baslangic_at: string;
  ertelendi_sayisi: number;
  seri_istisna: boolean;
  online_baglanti: string | null;
  yer: string | null;
  cakisma_onayli: boolean;
  katilimci_sayisi: number;
  telafi: boolean;
  surum: number;
  katilimcilar?: { ogrenci_id: string; tur: string; gorunen_ad: string | null }[];
}

export interface IslemYaniti {
  ders: DersJson;
  etkilenen_ders_idleri: string[];
  uyari: { kod: string; ders_id: string; cakisan_ders_id: string; ogrenci_idleri: string[] }[];
}

export interface SeriYaniti {
  seri: {
    id: string;
    baslangic_saati: string;
    bitis_tarihi: string | null;
    adet: number | null;
    online_baglanti: string | null;
    durum: string;
    uretildi_son_tarih: string;
  };
  dersler: DersJson[];
  atlanan: { seri_sirasi: number; tarih: string; neden: string }[];
  cakisanlar: { id: string }[];
  uyari: unknown[];
}

export const BUGUN = tarihEkle(new Date().toISOString().slice(0, 10), 0);

/** Bugunden `n` gun sonrasi (yerel takvim gunu, UTC tabanli yaklasik; testlerde saat dilimi farki onemsiz). */
export const gunSonra = (n: number) => tarihEkle(BUGUN, n);

/** Bugunden sonraki ilk Pazartesi'den `hafta` hafta sonrasi. */
export function pazartesi(hafta: number): string {
  const jsGun = new Date(`${BUGUN}T00:00:00Z`).getUTCDay();
  const ilk = tarihEkle(BUGUN, ((8 - jsGun) % 7) + 7);
  return tarihEkle(ilk, hafta * 7);
}

export interface Uye {
  token: string;
  uyelikId: string;
  oturum: string;
  kullaniciId: string;
}

export interface Kurulum {
  k: KurumluKullanici;
  hoca: Uye;
  grup: { id: string };
  ogrenciler: string[];
}

export interface Yardimcilar {
  t: TestServisi;
  sistem: postgres.Sql;
}

export function dersYardimcilari({ t, sistem }: Yardimcilar) {
  const { app } = t.service;
  const api = (k: { kurumId: string }, yol: string) => `/v1/ders/kurumlar/${k.kurumId}${yol}`;
  const hesapApi = (k: { kurumId: string }, yol: string) => `/v1/hesap/kurumlar/${k.kurumId}${yol}`;

  /** `/auth/token`: IP hiz siniri testler arasi sizmasin diye her cagri ayri IP'den. */
  async function tokenAl(oturum: string, govde: { kurum_id?: string; uyelik_id?: string } = {}) {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/token',
      remoteAddress: yeniIp(),
      headers: bearer(oturum),
      payload: govde,
    });
    if (res.statusCode !== 200) throw new Error(`token: ${res.body}`);
    const j = res.json<{ access_token: string; uyelik_id: string | null }>();
    return { accessToken: j.access_token, uyelikId: j.uyelik_id ?? '' };
  }

  /** Giris + KVKK + kurum olusturma + kurum bagli token. */
  async function kurumluKullanici(
    tur: 'bireysel' | 'ekip' | 'kurum' = 'kurum',
  ): Promise<KurumluKullanici> {
    const giris = await otpIleGiris(t);
    const ilk = await tokenAl(giris.oturum);
    await rizaKabulEt(t, ilk.accessToken);
    const res = await app.inject({
      method: 'POST',
      url: '/v1/hesap/kurumlar',
      headers: bearer(ilk.accessToken),
      payload: { ad: 'Takvim Deneme Kurumu', tur },
    });
    if (res.statusCode !== 201) throw new Error(`kurum: ${res.body}`);
    const kurumId = res.json<{ kurum: { id: string } }>().kurum.id;
    const sonuc = await tokenAl(giris.oturum, { kurum_id: kurumId });
    return { ...giris, kurumId, token: sonuc.accessToken, uyelikId: sonuc.uyelikId };
  }

  async function davetliUye(k: KurumluKullanici, rol: 'ogrenci' | 'ogretmen'): Promise<Uye> {
    const d = await app.inject({
      method: 'POST',
      url: hesapApi(k, '/davetler'),
      headers: bearer(k.token),
      payload: { kanal: 'baglanti', rol },
    });
    expect(d.statusCode).toBe(201);
    const g = await otpIleGiris(t);
    const ilk = await tokenAl(g.oturum);
    await rizaKabulEt(t, ilk.accessToken);
    const kabul = await app.inject({
      method: 'POST',
      url: '/v1/hesap/davetler/kabul',
      headers: bearer(ilk.accessToken),
      payload: { belirtec: d.json<{ belirtec: string }>().belirtec },
    });
    expect(kabul.statusCode).toBe(200);
    const tok = await tokenAl(g.oturum, { kurum_id: k.kurumId });
    return {
      token: tok.accessToken,
      uyelikId: kabul.json<{ uyelik_id: string }>().uyelik_id,
      oturum: g.oturum,
      kullaniciId: g.kullaniciId,
    };
  }

  /** Giris yapmayan toplu ogrenciler (sistem rolu ile); uyelik kimlikleri doner. */
  async function topluOgrenci(kurumId: string, n: number, onEk = 'Ogrenci'): Promise<string[]> {
    const telefonlar = new Set<string>();
    while (telefonlar.size < n) telefonlar.add(`+9053${String(randomInt(10_000_000, 99_999_999))}`);
    const kullanicilar = [...telefonlar].map((telefon) => ({
      id: uuidv7(),
      telefon_e164: telefon,
    }));
    const uyelikler = kullanicilar.map((u, i) => ({
      id: uuidv7(),
      kurum_id: kurumId,
      kullanici_id: u.id,
      rol: 'ogrenci',
      gorunen_ad: `${onEk} ${String(i + 1)}`,
    }));
    if (n === 0) return [];
    await sistem`insert into hesap.kullanicilar ${sistem(kullanicilar)}`;
    await sistem`insert into hesap.uyelikler ${sistem(uyelikler)}`;
    return uyelikler.map((u) => u.id);
  }

  async function gruba(k: KurumluKullanici, grupId: string, ogrenciIdleri: string[]) {
    if (ogrenciIdleri.length === 0) return;
    // Buyuk listeler dogrudan sistem rolu ile (API kapasite/olay maliyeti testin konusu degil).
    await sistem`insert into hesap.grup_uyeleri ${sistem(
      ogrenciIdleri.map((o) => ({
        id: uuidv7(),
        kurum_id: k.kurumId,
        grup_id: grupId,
        ogrenci_id: o,
        katilim_yolu: 'yonetici',
      })),
    )}`;
  }

  async function grupAc(
    k: KurumluKullanici,
    tur: 'grup' | 'birebir' | 'sinif' = 'grup',
    ad = 'Grup A',
  ) {
    const res = await app.inject({
      method: 'POST',
      url: hesapApi(k, '/gruplar'),
      headers: bearer(k.token),
      payload: { tur, ad },
    });
    expect(res.statusCode).toBe(201);
    return res.json<{ id: string }>();
  }

  async function ata(k: KurumluKullanici, grupId: string, ogretmenId: string, brans = 'matematik') {
    const res = await app.inject({
      method: 'POST',
      url: hesapApi(k, `/gruplar/${grupId}/atamalar`),
      headers: bearer(k.token),
      payload: { ogretmen_id: ogretmenId, brans_kodu: brans },
    });
    expect(res.statusCode).toBe(201);
  }

  /** Kurum + atanmis ogretmen + grup + `ogrenciSayisi` ogrenci. */
  async function kur(
    opts: { ogrenciSayisi?: number; grupTur?: 'grup' | 'birebir' } = {},
  ): Promise<Kurulum> {
    const k = await kurumluKullanici();
    const hoca = await davetliUye(k, 'ogretmen');
    const grup = await grupAc(k, opts.grupTur ?? 'grup');
    await ata(k, grup.id, hoca.uyelikId);
    const ogrenciler = await topluOgrenci(k.kurumId, opts.ogrenciSayisi ?? 3);
    await gruba(k, grup.id, ogrenciler);
    return { k, hoca, grup, ogrenciler };
  }

  const post = (k: { kurumId: string }, token: string, yol: string, payload: unknown) =>
    app.inject({
      method: 'POST',
      url: api(k, yol),
      headers: bearer(token),
      payload: payload as object,
    });
  const patch = (k: { kurumId: string }, token: string, yol: string, payload: unknown) =>
    app.inject({
      method: 'PATCH',
      url: api(k, yol),
      headers: bearer(token),
      payload: payload as object,
    });
  const get = (k: { kurumId: string }, token: string, yol: string) =>
    app.inject({ url: api(k, yol), headers: bearer(token) });

  /** Tekil ders govdesi (Pazartesi 16:00, 60 dk). */
  const dersGovdesi = (grupId: string, ek: Record<string, unknown> = {}) => ({
    grup_id: grupId,
    tarih: pazartesi(1),
    baslangic_saati: '16:00',
    sure_dk: 60,
    ...ek,
  });

  async function dersAc(
    s: Kurulum,
    ek: Record<string, unknown> = {},
    token = s.k.token,
  ): Promise<DersJson> {
    const res = await post(
      s.k,
      token,
      '/dersler',
      dersGovdesi(s.grup.id, { ogretmen_id: s.hoca.uyelikId, ...ek }),
    );
    expect(res.statusCode, res.body).toBe(201);
    return res.json<{ ders: DersJson }>().ders;
  }

  async function seriAc(
    s: Kurulum,
    ek: Record<string, unknown> = {},
    token = s.k.token,
  ): Promise<SeriYaniti> {
    const res = await post(s.k, token, '/seriler', {
      grup_id: s.grup.id,
      ogretmen_id: s.hoca.uyelikId,
      tekrar_kurali: 'FREQ=WEEKLY;BYDAY=MO',
      baslangic_tarihi: pazartesi(1),
      baslangic_saati: '16:00',
      sure_dk: 60,
      adet: 5,
      ...ek,
    });
    expect(res.statusCode, res.body).toBe(201);
    return res.json<SeriYaniti>();
  }

  const dersOku = async (s: Kurulum, id: string): Promise<DersJson> => {
    const res = await get(s.k, s.k.token, `/dersler/${id}`);
    expect(res.statusCode).toBe(200);
    return res.json<DersJson>();
  };

  return {
    app,
    api,
    tokenAl,
    kurumluKullanici,
    hesapApi,
    davetliUye,
    topluOgrenci,
    gruba,
    grupAc,
    ata,
    kur,
    post,
    patch,
    get,
    dersGovdesi,
    dersAc,
    seriAc,
    dersOku,
  };
}
