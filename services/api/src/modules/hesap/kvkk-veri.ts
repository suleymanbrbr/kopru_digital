import { KVKK_VERI_SCOPE, KullaniciVeriYanitSema, type VerilerimYanit } from '@kopru/contracts';
import { withTenant, withUser, type Database, type Tx } from '@kopru/service-kit';
import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';

import { servisBelirteciUret } from './servis-belirteci.js';

type Kayit = Record<string, unknown>;

/** Tek kullanicinin bir kurumdaki verisi. Yalniz `uyelik_idleri` ile `kullanici_id`ye bagli satirlar. */
async function kurumVerisi(tx: Tx, kullaniciId: string, uyelikIdleri: string[]) {
  const ids = sql`(${sql.join(
    uyelikIdleri.map((i) => sql`${i}::uuid`),
    sql`, `,
  )})`;
  const oku = async (q: ReturnType<typeof sql>): Promise<Kayit[]> =>
    [...(await tx.execute<Kayit>(q))].map((r) => ({ ...r }));
  return {
    uyelikler: await oku(sql`
      select id, kurum_id, rol, durum, sube_id, kademe_id, ogrenci_no, gorunen_ad, katildi_at, ayrildi_at, created_at
        from hesap.uyelikler where id in ${ids} order by created_at`),
    yoklamalar: await oku(sql`
      select y.ders_id, y.durum, y.gec_dakika, y.isaretlenme_at,
             case when y.not_gorunurluk = 'ogrenciye' then y."not" end as "not"
        from ders.yoklamalar y where y.ogrenci_id in ${ids} order by y.isaretlenme_at`),
    ders_geri_bildirimleri: await oku(sql`
      select ders_id, deger, "not", created_at from ders.geri_bildirimler
       where ogrenci_id in ${ids} order by created_at`),
    odevler: await oku(sql`
      select odev_id, durum, son_teslim_at, teslim_at, gec_teslim, yapilan_soru_sayisi, dogru_sayisi,
             yanlis_sayisi, bos_sayisi, ogrenci_notu, inceleme_sonucu, inceleme_notu, incelendi_at
        from ogrenme.ogrenci_odevleri where ogrenci_id in ${ids} order by created_at`),
    // Ogrenci yalniz kendisine GORUNUR ve geri cekilmemis degerlendirmeleri alir; ogretmen kendi yazdiklarini.
    degerlendirmeler: await oku(sql`
      select ogrenci_id, yazar_id, donem_baslangic, donem_bitis, brans_kodu, calisma_duzeni, derse_katilim,
             odev_disiplini, anlama_duzeyi, yorum, ogrenci_gorur, geri_cekildi_at, created_at
        from ogrenme.ogretmen_degerlendirmeleri
       where yazar_id in ${ids}
          or (ogrenci_id in ${ids} and ogrenci_gorur and geri_cekildi_at is null)
       order by created_at`),
    kaynak_onerileri: await oku(sql`
      select ogrenci_id, oneren_id, tur, kaynak_kitap_id, kaynak_test_id, baglanti_url, baslik, brans_kodu,
             konu_id, not_metni, geri_cekildi_at, created_at
        from ogrenme.kaynak_onerileri
       where oneren_id in ${ids} or (ogrenci_id in ${ids} and geri_cekildi_at is null)
       order by created_at`),
    sorular: await oku(sql`
      select id, brans_kodu, durum, created_at, son_hareket_at from ogrenme.sorular
       where ogrenci_id in ${ids} order by created_at`),
    soru_mesajlari: await oku(sql`
      select soru_id, yazar_rolu, tur, metin, sira, created_at from ogrenme.soru_mesajlari
       where yazar_id in ${ids} order by created_at`),
    denemeler: await oku(sql`
      select ad, kural_kodu, yayinevi, sinav_tarihi, toplam_net, kaynak, sure_dk, not_metni, onay_durumu
        from ogrenme.denemeler where ogrenci_id in ${ids} order by sinav_tarihi`),
    sinif_katilim_istekleri: await oku(sql`
      select grup_id, durum, created_at, karar_at from hesap.sinif_katilim_istekleri
       where kullanici_id = ${kullaniciId} and kurum_id = ortak.aktif_kurum() order by created_at`),
  };
}

async function servisVerisi(
  app: FastifyInstance,
  hedef: 'motivasyon' | 'bildirim' | 'medya',
  taban: string | undefined,
  girdi: { kurum_id: string; kullanici_id: string; uyelik_idleri: string[] },
): Promise<Record<string, Kayit[]> | null> {
  if (!taban) return null;
  try {
    const token = await servisBelirteciUret(app.kimlik, { hedef, scope: [KVKK_VERI_SCOPE] });
    const res = await fetch(new URL('/ic/kvkk/veri', taban), {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(girdi),
      signal: AbortSignal.timeout(app.kimlik.env.KVKK_SERVIS_ZAMAN_ASIMI_MS),
    });
    if (!res.ok) throw new Error(`${hedef} yanıtı ${String(res.status)}`);
    const g = KullaniciVeriYanitSema.parse(await res.json());
    return g.bolumler;
  } catch (err) {
    app.log.warn({ err, hedef }, 'KVKK servis verisi alınamadı');
    return null;
  }
}

/**
 * Kisisel veri disa aktarma (KVKK m.11). `api` kendi verisini kurum baglaminda (RLS) okur; diger
 * servislerin verisini her kurum icin servis JWT'siyle (`POST /ic/kvkk/veri`) toplar. Ulasilamayan servis
 * `eksik_servisler`e yazilir (kismi sonuc; istemci yeniden dener).
 */
export async function verilerimiTopla(
  app: FastifyInstance,
  kullaniciId: string,
): Promise<VerilerimYanit> {
  const db: Database = app.kimlik.db;
  const { env } = app.kimlik;
  const [hesap] = await withUser(db, { kullaniciId }, async (tx) =>
    [
      ...(await tx.execute<Kayit>(sql`
      select id, ad, soyad, gorunen_ad, telefon_e164, telefon_dogrulandi_at, eposta, eposta_dogrulandi_at,
             dil, saat_dilimi, durum, created_at, son_giris_at
        from hesap.kullanicilar where id = ${kullaniciId}`)),
    ].map((r) => ({ ...r })),
  );
  const uyelikler = await withUser(db, { kullaniciId }, (tx) =>
    tx.execute<{ id: string; kurum_id: string }>(sql`
      select id, kurum_id from hesap.uyelikler where kullanici_id = ${kullaniciId} order by created_at`),
  );
  const rizalar = await withUser(db, { kullaniciId }, async (tx) =>
    [
      ...(await tx.execute<Kayit>(sql`
      select riza_metni_id, karar, kaynak, created_at, encode(govde_sha256, 'hex') as govde_sha256
        from hesap.rizalar where kullanici_id = ${kullaniciId} order by created_at`)),
    ].map((r) => ({ ...r })),
  );
  const bolumler: Record<string, Kayit[]> = { rizalar };
  const servisler: Record<string, Record<string, Kayit[]>> = {};
  const eksik = new Set<string>();

  const kurumlar = new Map<string, string[]>();
  for (const u of uyelikler) kurumlar.set(u.kurum_id, [...(kurumlar.get(u.kurum_id) ?? []), u.id]);

  for (const [kurumId, idler] of kurumlar) {
    const v = await withTenant(db, { kurumId, kullaniciId }, (tx) =>
      kurumVerisi(tx, kullaniciId, idler),
    );
    for (const [ad, satirlar] of Object.entries(v)) {
      bolumler[ad] = [
        ...(bolumler[ad] ?? []),
        ...satirlar.map((s) => ({ kurum_id: kurumId, ...s })),
      ];
    }
    const girdi = { kurum_id: kurumId, kullanici_id: kullaniciId, uyelik_idleri: idler };
    const hedefler = [
      ['motivasyon', env.MOTIVASYON_URL],
      ['bildirim', env.BILDIRIM_URL],
      ['medya', env.MEDYA_URL],
    ] as const;
    for (const [ad, taban] of hedefler) {
      const s = await servisVerisi(app, ad, taban, girdi);
      if (!s) {
        eksik.add(ad);
        continue;
      }
      const hedef = (servisler[ad] ??= {});
      for (const [bolum, satirlar] of Object.entries(s)) {
        hedef[bolum] = [
          ...(hedef[bolum] ?? []),
          ...satirlar.map((x) => ({ kurum_id: kurumId, ...x })),
        ];
      }
    }
  }
  if (kurumlar.size === 0) {
    for (const [ad, taban] of [
      ['motivasyon', env.MOTIVASYON_URL],
      ['bildirim', env.BILDIRIM_URL],
    ] as const) {
      if (!taban) eksik.add(ad);
    }
  }
  return {
    olusturuldu_at: new Date().toISOString(),
    kullanici_id: kullaniciId,
    hesap: hesap ?? {},
    bolumler,
    servisler,
    eksik_servisler: [...eksik].sort(),
  };
}
