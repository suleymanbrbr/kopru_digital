import {
  dersGeriBildirimVerildiV1,
  dersKaynakIzlendiV1,
  dersYoklamaKaydedildiV1,
  ogrenmeDenemeGirildiV1,
  ogrenmeOdevIncelendiV1,
  ogrenmeOdevTeslimEdildiV1,
  ogrenmePlanGoreviGuncellendiV1,
  ogrenmeSoruCozulduV1,
  ogrenmeSoruSorildiV1,
} from '@kopru/contracts';
import { createDb, withTenant, type Database, type Tx } from '@kopru/service-kit';
import postgres from 'postgres';
import { uuidv7 } from 'uuidv7';

import { testDb } from './yardimcilar.js';

/** Sabit "simdi": 10 Kasim 2026 Sali 12:00 Istanbul (09:00Z); hafta Pazartesi 9 Kasim. */
export const T0 = new Date('2026-11-10T09:00:00.000Z');
export const dk = (taban: Date, dakika: number) => new Date(taban.getTime() + dakika * 60_000);
export const sn = (taban: Date, saniye: number) => new Date(taban.getTime() + saniye * 1000);

export interface Ortam {
  app: Database;
  sistem: postgres.Sql;
  owner: postgres.Sql;
  isle<T>(kurumId: string, fn: (tx: Tx) => Promise<T>): Promise<T>;
  kapat(): Promise<void>;
}

export function ortamKur(): Ortam {
  const urls = testDb();
  if (!urls) throw new Error('testDb yok');
  const app = createDb({ url: urls.appUrl, max: 4 });
  const sistem = postgres(urls.sistemUrl, { max: 2, onnotice: () => undefined });
  const owner = postgres(urls.ownerUrl, { max: 1, onnotice: () => undefined });
  return {
    app,
    sistem,
    owner,
    isle: (kurumId, fn) => withTenant(app, { kurumId }, fn),
    kapat: async () => {
      await app.close();
      await sistem.end();
      await owner.end();
    },
  };
}

export interface Senaryo {
  kurumId: string;
  ogrenciId: string;
}

export const yeniSenaryo = (): Senaryo => ({ kurumId: uuidv7(), ogrenciId: uuidv7() });

const zarf = (s: { kurumId: string }, at: Date) => ({
  kurumId: s.kurumId,
  actor: { tur: 'sistem', id: 'api' } as const,
  correlationId: 'test',
  occurredAt: at,
});

export const olay = {
  yoklama: (
    s: Senaryo,
    o: {
      at: Date;
      durum: 'geldi' | 'gelmedi' | 'izinli' | 'gec';
      yoklamaId: string;
      surum: number;
      grupId?: string;
      brans?: string;
    },
  ) =>
    dersYoklamaKaydedildiV1.create({
      ...zarf(s, o.at),
      data: {
        yoklama_id: o.yoklamaId,
        ders_id: uuidv7(),
        grup_id: o.grupId ?? uuidv7(),
        ogrenci_id: s.ogrenciId,
        brans_kodu: o.brans ?? 'matematik',
        durum: o.durum,
        onceki_durum: null,
        gec_dakika: o.durum === 'gec' ? 5 : null,
        isaretlenme_at: o.at.toISOString(),
        yoklama_surumu: o.surum,
      },
    }),
  geriBildirim: (s: Senaryo, at: Date) =>
    dersGeriBildirimVerildiV1.create({
      ...zarf(s, at),
      data: {
        geri_bildirim_id: uuidv7(),
        ders_id: uuidv7(),
        ogrenci_id: s.ogrenciId,
        brans_kodu: 'fizik',
        deger: 'anladim',
        konu_id: null,
      },
    }),
  kayitIzlendi: (s: Senaryo, at: Date, kaynakId = uuidv7()) =>
    dersKaynakIzlendiV1.create({
      ...zarf(s, at),
      data: {
        kaynak_id: kaynakId,
        ogrenci_id: s.ogrenciId,
        ders_id: null,
        grup_id: uuidv7(),
        brans_kodu: null,
        izledi_at: at.toISOString(),
      },
    }),
  odevTeslim: (
    s: Senaryo,
    o: { at: Date; odevId?: string; gec?: boolean; yeniden?: boolean; soru?: number },
  ) =>
    ogrenmeOdevTeslimEdildiV1.create({
      ...zarf(s, o.at),
      data: {
        ogrenci_odev_id: o.odevId ?? uuidv7(),
        odev_id: uuidv7(),
        ogrenci_id: s.ogrenciId,
        veren_id: uuidv7(),
        brans_kodu: 'turkce',
        yapilan_soru_sayisi: o.soru ?? 0,
        dosya_sayisi: 0,
        gec_teslim: o.gec ?? false,
        yeniden_teslim: o.yeniden ?? false,
      },
    }),
  odevIncelendi: (
    s: Senaryo,
    o: { at: Date; odevId: string; sonuc?: 'tamam' | 'eksik' | 'tekrar' },
  ) =>
    ogrenmeOdevIncelendiV1.create({
      ...zarf(s, o.at),
      data: {
        ogrenci_odev_id: o.odevId,
        odev_id: uuidv7(),
        ogrenci_id: s.ogrenciId,
        inceleyen_id: uuidv7(),
        brans_kodu: 'turkce',
        inceleme_sonucu: o.sonuc ?? 'tamam',
      },
    }),
  plan: (s: Senaryo, o: { at: Date; gorevId: string; durum: 'tamam' | 'bekliyor' | 'kismen' }) =>
    ogrenmePlanGoreviGuncellendiV1.create({
      ...zarf(s, o.at),
      data: {
        gorev_id: o.gorevId,
        plan_id: uuidv7(),
        ogrenci_id: s.ogrenciId,
        hafta_baslangic: '2026-11-09',
        gun: '2026-11-10',
        brans_kodu: 'matematik',
        hedef_turu: 'soru',
        hedef_miktar: 20,
        gerceklesen_miktar: o.durum === 'tamam' ? 20 : 5,
        onceki_gerceklesen_miktar: null,
        durum: o.durum,
        onceki_durum: 'bekliyor',
      },
    }),
  deneme: (
    s: Senaryo,
    o: { at: Date; net: number; tarih: string; kural?: string; denemeId?: string },
  ) =>
    ogrenmeDenemeGirildiV1.create({
      ...zarf(s, o.at),
      data: {
        deneme_id: o.denemeId ?? uuidv7(),
        ogrenci_id: s.ogrenciId,
        kural_kodu: o.kural ?? 'tyt',
        sinav_tarihi: o.tarih,
        toplam_net: o.net,
      },
    }),
  soruSorildi: (s: Senaryo, at: Date) =>
    ogrenmeSoruSorildiV1.create({
      ...zarf(s, at),
      data: {
        soru_id: uuidv7(),
        ogrenci_id: s.ogrenciId,
        brans_kodu: 'kimya',
        yonlendirme: 'atanan_ogretmen',
        atanan_ogretmen_id: null,
        masa_id: null,
        hedef_ogretmen_idleri: [],
      },
    }),
  soruCozuldu: (s: Senaryo, at: Date, soruId = uuidv7()) =>
    ogrenmeSoruCozulduV1.create({
      ...zarf(s, at),
      data: {
        soru_id: soruId,
        ogrenci_id: s.ogrenciId,
        brans_kodu: 'kimya',
        cozuldu_at: at.toISOString(),
        dosya_idleri: [],
        silinecek_at: dk(at, 60 * 24 * 30).toISOString(),
      },
    }),
};
