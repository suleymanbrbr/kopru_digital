import {
  errorCodes,
  hesapGrupDegistiV1,
  hesapGrupUyesiDegistiV1,
  hesapHataKodlari,
} from '@kopru/contracts';
import type { GrupUyesiSema, AtamaTipi, GrupTipi } from '@kopru/contracts';
import { AppError, type Tx } from '@kopru/service-kit';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import type { z } from 'zod';

import { type atamalar, grupUyeleri, gruplar, kullanicilar, uyelikler } from '../../db/schema.js';
import { olayYaz, type OlayBaglami } from './olaylar.js';

export type GrupSatiri = typeof gruplar.$inferSelect;
export type GrupUyesiSatiri = typeof grupUyeleri.$inferSelect;
export type AtamaSatiri = typeof atamalar.$inferSelect;
export type GrupUyesiYaniti = z.infer<typeof GrupUyesiSema>;

/** Gruptaki etkin ogrenci sayisi (sorgu alt ifadesi). */
export const uyeSayisiIfadesi = sql<number>`(select count(*)::int from hesap.grup_uyeleri gu where gu.grup_id = "hesap"."gruplar"."id" and gu.bitis_tarihi is null)`;

export function grupYaniti(g: GrupSatiri, uyeSayisi: number): GrupTipi {
  return {
    id: g.id,
    tur: g.tur as GrupTipi['tur'],
    ad: g.ad,
    sube_id: g.sube_id,
    kademe_id: g.kademe_id,
    kapasite: g.kapasite,
    renk: g.renk,
    durum: g.durum as GrupTipi['durum'],
    arsivlendi_at: g.arsivlendi_at?.toISOString() ?? null,
    uye_sayisi: uyeSayisi,
    surum: g.surum,
    created_at: g.created_at.toISOString(),
  };
}

export const grupUyesiYaniti = (s: GrupUyesiSatiri, gorunenAd: string | null): GrupUyesiYaniti => ({
  id: s.id,
  grup_id: s.grup_id,
  ogrenci_id: s.ogrenci_id,
  gorunen_ad: gorunenAd,
  baslangic_tarihi: s.baslangic_tarihi,
  bitis_tarihi: s.bitis_tarihi,
  katilim_yolu: s.katilim_yolu as GrupUyesiYaniti['katilim_yolu'],
});

export const atamaYaniti = (a: AtamaSatiri, ogretmenAd: string | null): AtamaTipi => ({
  id: a.id,
  grup_id: a.grup_id,
  ogretmen_id: a.ogretmen_id,
  ogretmen_ad: ogretmenAd,
  brans_kodu: a.brans_kodu,
  baslangic_tarihi: a.baslangic_tarihi,
  bitis_tarihi: a.bitis_tarihi,
  ana_ogretmen: a.ana_ogretmen,
});

export const grupOlayVerisi = (g: GrupSatiri) => ({
  grup_id: g.id,
  tur: g.tur as GrupTipi['tur'],
  ad: g.ad,
  kademe_id: g.kademe_id,
  sube_id: g.sube_id,
  durum: g.durum as GrupTipi['durum'],
});

export const grupUyesiOlayVerisi = (s: GrupUyesiSatiri) => ({
  grup_uyesi_id: s.id,
  grup_id: s.grup_id,
  ogrenci_id: s.ogrenci_id,
  baslangic_tarihi: s.baslangic_tarihi,
  bitis_tarihi: s.bitis_tarihi,
});

/**
 * Grubun etkin ogrencileri (uyelik kimlikleri). Bitis tarihi bos ve uyeligi `aktif` olanlar.
 * "Bir gruba verilen is her ogrenciye ayri satir" kurali ders/ogrenme modullerine aittir; onlar
 * ogrenci listesini bu fonksiyondan alir. `tx` kiraci baglamli (`withTenant`) bir islem olmalidir.
 */
export async function grupEtkinOgrencileri(tx: Tx, grupId: string): Promise<string[]> {
  const satirlar = await tx
    .select({ ogrenci_id: grupUyeleri.ogrenci_id })
    .from(grupUyeleri)
    .innerJoin(uyelikler, eq(uyelikler.id, grupUyeleri.ogrenci_id))
    .where(
      and(
        eq(grupUyeleri.grup_id, grupId),
        isNull(grupUyeleri.bitis_tarihi),
        eq(uyelikler.durum, 'aktif'),
      ),
    )
    .orderBy(grupUyeleri.id);
  return satirlar.map((s) => s.ogrenci_id);
}

export interface GrubaEkleSonucu {
  eklenenler: GrupUyesiSatiri[];
  zatenUye: string[];
}

/**
 * Ogrencileri gruba ekler (tek islem, kapasite `FOR UPDATE` ile korunur). Her yeni uyelik icin
 * `hesap.grup_uyesi.degisti.v1` ayni islemde outbox'a yazilir.
 */
export async function grubaOgrenciEkle(
  tx: Tx,
  girdi: {
    kurumId: string;
    grupId: string;
    ogrenciIdleri: readonly string[];
    katilimYolu: 'yonetici' | 'davet' | 'sinif_kodu';
    kullaniciId: string;
    baglam: OlayBaglami;
  },
): Promise<GrubaEkleSonucu> {
  const ids = [...new Set(girdi.ogrenciIdleri)];
  // Kapasite yarisini onlemek icin once grup satirini kilitle.
  const [grup] = await tx
    .select()
    .from(gruplar)
    .where(and(eq(gruplar.id, girdi.grupId), eq(gruplar.kurum_id, girdi.kurumId)))
    .for('update');
  if (!grup) throw new AppError(404, errorCodes.notFound, 'Grup bulunamadı.');
  if (grup.durum !== 'aktif') {
    throw new AppError(409, hesapHataKodlari.grupArsivde, 'Arşivlenmiş gruba öğrenci eklenemez.');
  }

  const gecerli = await tx
    .select({ id: uyelikler.id })
    .from(uyelikler)
    .where(
      and(
        eq(uyelikler.kurum_id, girdi.kurumId),
        inArray(uyelikler.id, ids),
        eq(uyelikler.rol, 'ogrenci'),
        eq(uyelikler.durum, 'aktif'),
      ),
    );
  const gecerliKume = new Set(gecerli.map((r) => r.id));
  const gecersiz = ids.filter((id) => !gecerliKume.has(id));
  if (gecersiz.length > 0) {
    throw new AppError(404, errorCodes.notFound, 'Bazı öğrenciler bulunamadı.', {
      gecersiz_ogrenci_idleri: gecersiz,
    });
  }

  const mevcut = await tx
    .select({ ogrenci_id: grupUyeleri.ogrenci_id })
    .from(grupUyeleri)
    .where(and(eq(grupUyeleri.grup_id, girdi.grupId), isNull(grupUyeleri.bitis_tarihi)));
  const mevcutKume = new Set(mevcut.map((m) => m.ogrenci_id));
  const yeniler = ids.filter((id) => !mevcutKume.has(id));
  const zatenUye = ids.filter((id) => mevcutKume.has(id));

  if (grup.kapasite !== null && mevcut.length + yeniler.length > grup.kapasite) {
    throw new AppError(409, hesapHataKodlari.kapasiteDolu, 'Grup kapasitesi aşılıyor.', {
      kapasite: grup.kapasite,
      mevcut: mevcut.length,
      eklenmek_istenen: yeniler.length,
    });
  }

  const eklenenler: GrupUyesiSatiri[] = [];
  for (const ogrenciId of yeniler) {
    const [satir] = await tx
      .insert(grupUyeleri)
      .values({
        id: uuidv7(),
        kurum_id: girdi.kurumId,
        grup_id: girdi.grupId,
        ogrenci_id: ogrenciId,
        katilim_yolu: girdi.katilimYolu,
        created_by: girdi.kullaniciId,
      })
      .returning();
    if (!satir) throw new Error('grup üyeliği yazılamadı');
    eklenenler.push(satir);
    await olayYaz(tx, hesapGrupUyesiDegistiV1, girdi.baglam, grupUyesiOlayVerisi(satir));
  }
  return { eklenenler, zatenUye };
}

/**
 * Solo hoca akisi: bireysel kurumda ogrenci eklendiginde ona ozel `birebir` grup acilir ve ogrenci
 * eklenir. Grup adi kisisel veri tasimasin diye sabittir (`hesap.grup.degisti` olayi `ad` tasir).
 * Ogrencinin zaten etkin bir birebir grubu varsa hicbir sey yapmaz ve `null` doner.
 */
export async function birebirGrupOlustur(
  tx: Tx,
  girdi: {
    kurumId: string;
    ogrenciId: string;
    kullaniciId: string;
    baglam: OlayBaglami;
  },
): Promise<{ grupId: string; grupUyesiId: string } | null> {
  const var_ = await tx
    .select({ id: gruplar.id })
    .from(grupUyeleri)
    .innerJoin(gruplar, eq(gruplar.id, grupUyeleri.grup_id))
    .where(
      and(
        eq(grupUyeleri.ogrenci_id, girdi.ogrenciId),
        isNull(grupUyeleri.bitis_tarihi),
        eq(gruplar.tur, 'birebir'),
        eq(gruplar.durum, 'aktif'),
      ),
    )
    .limit(1);
  if (var_.length > 0) return null;

  const [grup] = await tx
    .insert(gruplar)
    .values({
      id: uuidv7(),
      kurum_id: girdi.kurumId,
      tur: 'birebir',
      ad: 'Birebir ders',
      kapasite: 1,
      created_by: girdi.kullaniciId,
    })
    .returning();
  if (!grup) throw new Error('birebir grup oluşturulamadı');
  await olayYaz(tx, hesapGrupDegistiV1, girdi.baglam, grupOlayVerisi(grup));
  const sonuc = await grubaOgrenciEkle(tx, {
    kurumId: girdi.kurumId,
    grupId: grup.id,
    ogrenciIdleri: [girdi.ogrenciId],
    katilimYolu: 'yonetici',
    kullaniciId: girdi.kullaniciId,
    baglam: girdi.baglam,
  });
  const uye = sonuc.eklenenler[0];
  if (!uye) throw new Error('birebir grup üyeliği yazılamadı');
  return { grupId: grup.id, grupUyesiId: uye.id };
}

/** Uyelik kimliklerine gorunen ad esler (uyelik adi, yoksa kullanici adi). */
export async function gorunenAdlar(tx: Tx, uyelikIdleri: readonly string[]) {
  if (uyelikIdleri.length === 0) return new Map<string, string | null>();
  const satirlar = await tx
    .select({
      id: uyelikler.id,
      ad: sql<string | null>`coalesce(${uyelikler.gorunen_ad}, ${kullanicilar.gorunen_ad})`,
    })
    .from(uyelikler)
    .innerJoin(kullanicilar, eq(kullanicilar.id, uyelikler.kullanici_id))
    .where(inArray(uyelikler.id, [...uyelikIdleri]));
  return new Map(satirlar.map((s) => [s.id, s.ad]));
}

/** Postgres benzersizlik ihlali (Drizzle sarmalayicisi dahil). */
export function benzersizlikIhlaliMi(err: unknown): boolean {
  for (let e: unknown = err; e instanceof Error; e = e.cause) {
    if ((e as { code?: string }).code === '23505') return true;
  }
  return false;
}
