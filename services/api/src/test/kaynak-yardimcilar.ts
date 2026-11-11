import type postgres from 'postgres';
import { expect } from 'vitest';

import { type Kurulum, type Uye, type dersYardimcilari } from './ders-yardimcilar.js';
import { bearer } from './yardimcilar.js';

type DersY = ReturnType<typeof dersYardimcilari>;

/** Geri bildirim ve kaynak testleri icin ortak kurulum yardimcilari. */
export function kaynakYardimcilari(y: DersY, sistem: postgres.Sql) {
  const { app } = y;

  /** Giris yapabilen ogrenci: davet kabul + gruba ekleme (ders acilmadan ONCE cagrilmali). */
  async function ogrenciEkle(s: Kurulum): Promise<Uye> {
    const o = await y.davetliUye(s.k, 'ogrenci');
    await y.gruba(s.k, s.grup.id, [o.uyelikId]);
    return o;
  }

  /** Dersi gecmise tasir: `bitisOnceDk` dakika once biter, 60 dk surer (sistem rolu, API tarih kurali disinda). */
  async function dersZamanla(dersId: string, bitisOnceDk: number, sureDk = 60) {
    await sistem`
      update ders.dersler
      set baslangic_at = now() - make_interval(mins => ${bitisOnceDk + sureDk}),
          bitis_at = now() - make_interval(mins => ${bitisOnceDk}),
          ilk_baslangic_at = now() - make_interval(mins => ${bitisOnceDk + sureDk})
      where id = ${dersId}`;
  }

  /** Ders bitmis ve (verilen ogrenciler icin) yoklama `geldi`. */
  async function bitmisDers(
    s: Kurulum,
    ogrenciler: readonly string[],
    bitisOnceDk = 60,
    durumlar: Partial<Record<string, 'geldi' | 'gelmedi' | 'izinli' | 'gec'>> = {},
  ) {
    const ders = await y.dersAc(s);
    await dersZamanla(ders.id, bitisOnceDk);
    const res = await y.yoklamaPut(
      s.k,
      s.hoca.token,
      ders.id,
      ogrenciler.map((o) => y.yoklamaSatiri(o, durumlar[o] ?? 'geldi')),
    );
    expect(res.statusCode, res.body).toBe(200);
    return ders;
  }

  const modulKapat = async (
    s: Kurulum,
    modul: string,
    kapsam: 'kurum' | 'grup' = 'kurum',
  ): Promise<void> => {
    const res = await app.inject({
      method: 'PUT',
      url: y.hesapApi(s.k, '/modul-ayarlari'),
      headers: bearer(s.k.token),
      payload:
        kapsam === 'kurum'
          ? { modul_kodu: modul, kapsam: 'kurum', acik: false }
          : { modul_kodu: modul, kapsam: 'grup', kapsam_id: s.grup.id, acik: false },
    });
    expect(res.statusCode, res.body).toBe(200);
  };

  const olaylar = (kurumId: string, subject: string) =>
    sistem<{ payload: { data: Record<string, unknown> } }[]>`
      select payload from ortak.outbox where kurum_id = ${kurumId} and subject = ${subject} order by created_at, id`;

  return { ogrenciEkle, dersZamanla, bitmisDers, modulKapat, olaylar };
}
