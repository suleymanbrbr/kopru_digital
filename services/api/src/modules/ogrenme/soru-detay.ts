import type { SoruDetay, SoruOzet, MedyaOkumaAdresi } from '@kopru/contracts';
import type { Tx } from '@kopru/service-kit';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';

import { soruDosyalari, soruMesajEkleri, soruMesajlari, sorular } from '../../db/schema.js';
import { gorunenAdlar, type YetkiBaglami } from '../hesap/index.js';
import { soruBulunamadi } from './soru-ortak.js';
import { gorunurlukKosulu } from './soru-yonlendirme.js';

export type SoruSatiri = typeof sorular.$inferSelect;
type MesajSatiri = typeof soruMesajlari.$inferSelect;
type EkSatiri = typeof soruMesajEkleri.$inferSelect;

/** Gorunur soru (kapsam disi 404). `kilit`: satiri `FOR UPDATE` ile kilitler. */
export async function gorunurSoruBul(tx: Tx, y: YetkiBaglami, id: string, kilit = false) {
  const sorgu = tx
    .select()
    .from(sorular)
    .where(and(eq(sorular.id, id), eq(sorular.kurum_id, y.kurumId), gorunurlukKosulu(tx, y)));
  const [s] = await (kilit ? sorgu.for('update') : sorgu);
  if (!s) throw soruBulunamadi();
  return s;
}

export interface DetayHam {
  soru: SoruSatiri;
  ogrenciAdi: string | null;
  mesajlar: { m: MesajSatiri; yazarAdi: string | null; ekler: EkSatiri[] }[];
  fotograflar: { medya_dosya_id: string; sira: number }[];
  takipSayisi: number;
}

export async function detayHam(tx: Tx, soru: SoruSatiri): Promise<DetayHam> {
  const mesajlar = await tx
    .select()
    .from(soruMesajlari)
    .where(eq(soruMesajlari.soru_id, soru.id))
    .orderBy(asc(soruMesajlari.sira));
  const ekler = mesajlar.length
    ? await tx
        .select()
        .from(soruMesajEkleri)
        .where(
          inArray(
            soruMesajEkleri.mesaj_id,
            mesajlar.map((m) => m.id),
          ),
        )
        .orderBy(asc(soruMesajEkleri.sira))
    : [];
  const fotograflar = await tx
    .select({ medya_dosya_id: soruDosyalari.medya_dosya_id, sira: soruDosyalari.sira })
    .from(soruDosyalari)
    .where(eq(soruDosyalari.soru_id, soru.id))
    .orderBy(asc(soruDosyalari.sira));
  const adlar = await gorunenAdlar(tx, [soru.ogrenci_id, ...mesajlar.map((m) => m.yazar_id)]);
  return {
    soru,
    ogrenciAdi: adlar.get(soru.ogrenci_id) ?? null,
    mesajlar: mesajlar.map((m) => ({
      m,
      yazarAdi: adlar.get(m.yazar_id) ?? null,
      ekler: ekler.filter((e) => e.mesaj_id === m.id),
    })),
    fotograflar,
    takipSayisi: mesajlar.filter((m) => m.tur === 'takip').length,
  };
}

export const hamDosyaIdleri = (h: DetayHam): string[] => [
  ...h.fotograflar.map((f) => f.medya_dosya_id),
  ...h.mesajlar.flatMap((m) => m.ekler.map((e) => e.medya_dosya_id)),
];

/** Sorunun tum dosya kimlikleri (fotograflar + mesaj ekleri): cozuldu/yeniden_acildi olaylari icin. */
export async function soruDosyaIdleri(tx: Tx, soruId: string): Promise<string[]> {
  const satirlar = await tx.execute<{ id: string }>(sql`
    select medya_dosya_id as id from ogrenme.soru_dosyalari where soru_id = ${soruId}::uuid
    union
    select e.medya_dosya_id from ogrenme.soru_mesaj_ekleri e
    join ogrenme.soru_mesajlari m on m.id = e.mesaj_id where m.soru_id = ${soruId}::uuid`);
  return satirlar.map((r) => r.id);
}

const iso = (d: Date | null) => d?.toISOString() ?? null;

export function ozetYaniti(
  s: SoruSatiri,
  ekstra: { ogrenciAdi: string | null; onizleme: string | null; mesajSayisi: number },
): SoruOzet {
  return {
    id: s.id,
    ogrenci_id: s.ogrenci_id,
    ogrenci_adi: ekstra.ogrenciAdi,
    brans_kodu: s.brans_kodu,
    konu_id: s.konu_id,
    baslik: s.baslik,
    metin_onizleme: ekstra.onizleme,
    durum: s.durum as SoruOzet['durum'],
    yonlendirme: s.yonlendirme as SoruOzet['yonlendirme'],
    atanan_ogretmen_id: s.atanan_ogretmen_id,
    masa_id: s.masa_id,
    ustlenen_id: s.ustlenen_id,
    mesaj_sayisi: ekstra.mesajSayisi,
    created_at: s.created_at.toISOString(),
    son_hareket_at: s.son_hareket_at.toISOString(),
    ilk_cevap_at: iso(s.ilk_cevap_at),
    cozuldu_at: iso(s.cozuldu_at),
  };
}

export function detayYaniti(
  h: DetayHam,
  adresler: ReadonlyMap<string, MedyaOkumaAdresi>,
  alinamadi: boolean,
  takipLimiti: number,
): SoruDetay {
  const adres = (id: string) => {
    const a = adresler.get(id);
    if (!a) return null;
    return {
      mime_tipi: a.mime_tipi,
      asil_url: a.asil_url,
      kucuk_url: a.kucuk_url,
      orta_url: a.orta_url,
      genislik: a.genislik,
      yukseklik: a.yukseklik,
      sure_sn: a.sure_sn,
      gecerlilik_bitis_at: a.gecerlilik_bitis_at,
    };
  };
  const ilk = h.mesajlar.find((x) => x.m.sira === 1)?.m.metin ?? null;
  return {
    ...ozetYaniti(h.soru, {
      ogrenciAdi: h.ogrenciAdi,
      onizleme: ilk?.slice(0, 160) ?? null,
      mesajSayisi: h.mesajlar.length,
    }),
    foto_silinme_at: iso(h.soru.foto_silinme_at),
    yeniden_acilma_sayisi: h.soru.yeniden_acilma_sayisi,
    kalan_takip_hakki: Math.max(0, takipLimiti - h.takipSayisi),
    fotograflar: h.fotograflar.map((f) => ({
      medya_dosya_id: f.medya_dosya_id,
      sira: f.sira,
      adres: adres(f.medya_dosya_id),
    })),
    mesajlar: h.mesajlar.map(({ m, yazarAdi, ekler }) => ({
      id: m.id,
      yazar_id: m.yazar_id,
      yazar_adi: yazarAdi,
      yazar_rolu: m.yazar_rolu as 'ogrenci',
      tur: m.tur as 'soru',
      metin: m.metin,
      derste_konusalim: m.derste_konusalim,
      sira: m.sira,
      created_at: m.created_at.toISOString(),
      ekler: ekler.map((e) => ({
        id: e.id,
        tur: e.tur as 'fotograf',
        medya_dosya_id: e.medya_dosya_id,
        kaynak_dosya_id: e.kaynak_dosya_id,
        sure_sn: e.sure_sn,
        cizim_verisi: (e.cizim_verisi ?? null) as Record<string, unknown> | null,
        sira: e.sira,
        adres: adres(e.medya_dosya_id),
      })),
    })),
    adres_alinamadi: alinamadi,
  };
}

/** Liste satirlarina mesaj sayisi, onizleme ve ogrenci adi ekler (tek sorgu + ad sorgusu). */
export async function ozetleriHazirla(
  tx: Tx,
  satirlar: readonly SoruSatiri[],
): Promise<SoruOzet[]> {
  if (satirlar.length === 0) return [];
  const idler = satirlar.map((s) => s.id);
  const sayilar = await tx.execute<{ soru_id: string; n: number; onizleme: string | null }>(sql`
    select m.soru_id, count(*)::int as n, max(left(m.metin, 160)) filter (where m.sira = 1) as onizleme
    from ogrenme.soru_mesajlari m
    where m.soru_id in (${sql.join(
      idler.map((i) => sql`${i}::uuid`),
      sql`, `,
    )})
    group by m.soru_id`);
  const adlar = await gorunenAdlar(
    tx,
    satirlar.map((s) => s.ogrenci_id),
  );
  const harita = new Map(sayilar.map((r) => [r.soru_id, r]));
  return satirlar.map((s) =>
    ozetYaniti(s, {
      ogrenciAdi: adlar.get(s.ogrenci_id) ?? null,
      onizleme: harita.get(s.id)?.onizleme ?? null,
      mesajSayisi: harita.get(s.id)?.n ?? 0,
    }),
  );
}
