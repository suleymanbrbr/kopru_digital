import {
  DEGERLENDIRME_DUZENLEME_GUN,
  DEGERLENDIRME_EN_FAZLA_DONEM_GUN,
  degerlendirmeHataKodlari,
  errorCodes,
  ogrenmeDegerlendirmeYayimlandiV1,
  ogrenmeKaynakOnerisiEklendiV1,
  type Degerlendirme,
  type KaynakOnerisi,
  type KaynakOnerisiTuru,
  type OgrenciDegerlendirme,
} from '@kopru/contracts';
import { AppError, publishInTx, type Tx } from '@kopru/service-kit';
import { and, desc, eq, inArray, isNull, lt, sql } from 'drizzle-orm';

import {
  kaynakKitaplar,
  kaynakKitapTestleri,
  konular,
  kaynakOnerileri,
  ogretmenDegerlendirmeleri,
} from '../../db/schema.js';
import { gorunenAdlar, type YetkiBaglami } from '../hesap/index.js';
import { OUTBOX_TABLOSU, imlecCoz, imlecYaz, type OdevOlayBaglami } from './odev-deposu.js';
import { ogrenciBul } from './plan-deposu.js';
import { gunFarki, planBugunu } from './plan-zaman.js';

export type DegerlendirmeSatiri = typeof ogretmenDegerlendirmeleri.$inferSelect;
export type OneriSatiri = typeof kaynakOnerileri.$inferSelect;

const GUN_MS = 24 * 60 * 60 * 1000;

export const degerlendirmeBulunamadi = () =>
  new AppError(404, errorCodes.notFound, 'Değerlendirme bulunamadı.');
export const oneriBulunamadi = () =>
  new AppError(404, errorCodes.notFound, 'Kaynak önerisi bulunamadı.');

/** Sahip ve yonetici baskasinin kaydini geri cekebilir. */
export const yonetimMi = (y: Pick<YetkiBaglami, 'rol'>) =>
  y.rol === 'sahip' || y.rol === 'yonetici';

// --- Donem ve duzenleme penceresi ------------------------------------------------------------

/**
 * Donem: baslangic bugunden sonra olamaz, bitis baslangictan once olamaz, en cok 31 gun (ucu dahil).
 * Aksi 422 `donem_gecersiz`.
 */
export function donemiDogrula(
  baslangic: string,
  bitis: string,
  bugun: string = planBugunu(),
): void {
  const hata = (mesaj: string) => new AppError(422, degerlendirmeHataKodlari.donemGecersiz, mesaj);
  if (baslangic > bugun) throw hata('Dönem başlangıcı gelecekte olamaz.');
  if (bitis < baslangic) throw hata('Dönem bitişi başlangıçtan önce olamaz.');
  if (gunFarki(baslangic, bitis) + 1 > DEGERLENDIRME_EN_FAZLA_DONEM_GUN) {
    throw hata(`Dönem en çok ${String(DEGERLENDIRME_EN_FAZLA_DONEM_GUN)} gün olabilir.`);
  }
}

export const duzenlemeSonu = (d: Pick<DegerlendirmeSatiri, 'created_at'>): Date =>
  new Date(d.created_at.getTime() + DEGERLENDIRME_DUZENLEME_GUN * GUN_MS);

export function duzenlenebilirMi(
  d: Pick<DegerlendirmeSatiri, 'created_at' | 'geri_cekildi_at'>,
  simdi: Date = new Date(),
): boolean {
  return d.geri_cekildi_at === null && duzenlemeSonu(d).getTime() > simdi.getTime();
}

// --- Yanitlar --------------------------------------------------------------------------------

/** Personel yaniti: yazar adi, gorunurluk, duzenleme durumu. */
export async function degerlendirmeYanitlari(
  tx: Tx,
  y: YetkiBaglami,
  satirlar: readonly DegerlendirmeSatiri[],
): Promise<Degerlendirme[]> {
  if (satirlar.length === 0) return [];
  const adlar = await gorunenAdlar(tx, [...new Set(satirlar.map((s) => s.yazar_id))]);
  const simdi = new Date();
  return satirlar.map((s) => ({
    id: s.id,
    ogrenci_id: s.ogrenci_id,
    yazar_id: s.yazar_id,
    yazar_ad: adlar.get(s.yazar_id) ?? null,
    donem_baslangic: s.donem_baslangic,
    donem_bitis: s.donem_bitis,
    brans_kodu: s.brans_kodu,
    calisma_duzeni: s.calisma_duzeni,
    derse_katilim: s.derse_katilim,
    odev_disiplini: s.odev_disiplini,
    anlama_duzeyi: s.anlama_duzeyi,
    yorum: s.yorum,
    ogrenci_gorur: s.ogrenci_gorur,
    geri_cekildi_at: s.geri_cekildi_at?.toISOString() ?? null,
    benim: s.yazar_id === y.uyelikId,
    duzenlenebilir: s.yazar_id === y.uyelikId && duzenlenebilirMi(s, simdi),
    duzenleme_son_at: duzenlemeSonu(s).toISOString(),
    surum: s.surum,
    created_at: s.created_at.toISOString(),
  }));
}

/**
 * Ogrenci yaniti. Yalniz gorunur ve geri cekilmemis satirlar verilmelidir; savunma amacli burada da
 * filtrelenir (cagiran hata yapsa bile gizli yorum yanita girmez).
 */
export async function ogrenciDegerlendirmeYanitlari(
  tx: Tx,
  satirlar: readonly DegerlendirmeSatiri[],
): Promise<OgrenciDegerlendirme[]> {
  const gorunen = satirlar.filter((s) => s.ogrenci_gorur && s.geri_cekildi_at === null);
  if (gorunen.length === 0) return [];
  const adlar = await gorunenAdlar(tx, [...new Set(gorunen.map((s) => s.yazar_id))]);
  return gorunen.map((s) => ({
    id: s.id,
    yazar_ad: adlar.get(s.yazar_id) ?? null,
    donem_baslangic: s.donem_baslangic,
    donem_bitis: s.donem_bitis,
    brans_kodu: s.brans_kodu,
    calisma_duzeni: s.calisma_duzeni,
    derse_katilim: s.derse_katilim,
    odev_disiplini: s.odev_disiplini,
    anlama_duzeyi: s.anlama_duzeyi,
    yorum: s.yorum,
    created_at: s.created_at.toISOString(),
  }));
}

// --- Erisim ----------------------------------------------------------------------------------

/**
 * Degerlendirme: kurumda yoksa 404. Yazar degilse kaydin ogrencisi kapsamda olmali (aksi 404: varligi ifsa
 * etmez); yazar kendi kaydini ogrencisi kapsamdan ciksa bile bulur.
 */
export async function degerlendirmeBul(
  tx: Tx,
  y: YetkiBaglami,
  id: string,
  kilit = false,
): Promise<DegerlendirmeSatiri> {
  const sorgu = tx
    .select()
    .from(ogretmenDegerlendirmeleri)
    .where(
      and(eq(ogretmenDegerlendirmeleri.id, id), eq(ogretmenDegerlendirmeleri.kurum_id, y.kurumId)),
    );
  const [d] = await (kilit ? sorgu.for('update') : sorgu);
  if (!d) throw degerlendirmeBulunamadi();
  if (d.yazar_id !== y.uyelikId) {
    try {
      await ogrenciBul(tx, y, d.ogrenci_id, false);
    } catch {
      throw degerlendirmeBulunamadi();
    }
  }
  return d;
}

export async function oneriBul(
  tx: Tx,
  y: YetkiBaglami,
  id: string,
  kilit = false,
): Promise<OneriSatiri> {
  const sorgu = tx
    .select()
    .from(kaynakOnerileri)
    .where(and(eq(kaynakOnerileri.id, id), eq(kaynakOnerileri.kurum_id, y.kurumId)));
  const [o] = await (kilit ? sorgu.for('update') : sorgu);
  if (!o) throw oneriBulunamadi();
  if (o.oneren_id !== y.uyelikId) {
    try {
      await ogrenciBul(tx, y, o.ogrenci_id, false);
    } catch {
      throw oneriBulunamadi();
    }
  }
  return o;
}

/** Personel zaman cizelgesi sayfasi (en yeni once, imlec). Kapsam denetimi cagiranindir. */
export async function degerlendirmeSayfasi(
  tx: Tx,
  y: YetkiBaglami,
  ogrenciId: string,
  s: { limit: number; imlec: string | undefined; geriCekilenler: boolean },
) {
  const imlec = imlecCoz(s.imlec);
  const satirlar = await tx
    .select()
    .from(ogretmenDegerlendirmeleri)
    .where(
      and(
        eq(ogretmenDegerlendirmeleri.kurum_id, y.kurumId),
        eq(ogretmenDegerlendirmeleri.ogrenci_id, ogrenciId),
        s.geriCekilenler ? undefined : isNull(ogretmenDegerlendirmeleri.geri_cekildi_at),
        imlec ? lt(ogretmenDegerlendirmeleri.id, imlec) : undefined,
      ),
    )
    .orderBy(desc(ogretmenDegerlendirmeleri.id))
    .limit(s.limit + 1);
  const sayfa = satirlar.slice(0, s.limit);
  const son = sayfa[sayfa.length - 1];
  return {
    degerlendirmeler: await degerlendirmeYanitlari(tx, y, sayfa),
    sonraki_imlec: satirlar.length > s.limit && son ? imlecYaz(son.id) : null,
  };
}

// --- Olaylar ---------------------------------------------------------------------------------

/** Ogrenciye gorunur degerlendirme: bildirim olayi (ayni islemde outbox). Yorum metni yoktur. */
export async function degerlendirmeYayimlandiOlayiYaz(
  tx: Tx,
  baglam: OdevOlayBaglami,
  d: Pick<DegerlendirmeSatiri, 'id' | 'ogrenci_id' | 'yazar_id'>,
): Promise<void> {
  await publishInTx(
    tx,
    ogrenmeDegerlendirmeYayimlandiV1.create({
      ...baglam,
      data: { degerlendirme_id: d.id, ogrenci_id: d.ogrenci_id, yazar_id: d.yazar_id },
    }),
    { table: OUTBOX_TABLOSU },
  );
}

export async function oneriOlayiYaz(
  tx: Tx,
  baglam: OdevOlayBaglami,
  o: Pick<OneriSatiri, 'id' | 'ogrenci_id' | 'oneren_id' | 'tur'>,
): Promise<void> {
  await publishInTx(
    tx,
    ogrenmeKaynakOnerisiEklendiV1.create({
      ...baglam,
      data: {
        oneri_id: o.id,
        ogrenci_id: o.ogrenci_id,
        oneren_id: o.oneren_id,
        tur: o.tur as KaynakOnerisiTuru,
      },
    }),
    { table: OUTBOX_TABLOSU },
  );
}

// --- Kaynak onerisi yanitlari ----------------------------------------------------------------

interface Kullanim {
  ilk: string;
  son: string;
  sayi: number;
}

/**
 * Oneriden sonra (oneri zamanindan itibaren) ogrencinin gunluk soru kaydinda kitap/test/metin kullanildi mi.
 * Tek sorgu: ilgili ogrencilerin oneri tarihinden sonraki kaynakli kayitlari; eslestirme bellekte.
 */
async function kullanimlar(
  tx: Tx,
  kurumId: string,
  satirlar: readonly OneriSatiri[],
): Promise<Map<string, Kullanim | null>> {
  const sonuc = new Map<string, Kullanim | null>();
  const olculebilir = satirlar.filter((o) => o.tur !== 'link');
  if (olculebilir.length === 0) return sonuc;
  const ogrenciler = [...new Set(olculebilir.map((o) => o.ogrenci_id))];
  const enEski = new Date(Math.min(...olculebilir.map((o) => o.created_at.getTime())));
  const kayitlar = await tx.execute<
    {
      ogrenci_id: string;
      kaynak_test_id: string | null;
      kitap_id: string | null;
      metin: string | null;
      gun: string;
      created_at: Date;
    } & Record<string, unknown>
  >(sql`
    select k.ogrenci_id, k.kaynak_test_id, t.kitap_id, lower(btrim(k.kaynak_metin)) as metin,
           k.gun::text as gun, k.created_at
      from ogrenme.gunluk_soru_kayitlari k
      left join ogrenme.kaynak_kitap_testleri t on t.id = k.kaynak_test_id
     where k.kurum_id = ${kurumId}::uuid
       and k.ogrenci_id in (${sql.join(
         ogrenciler.map((i) => sql`${i}::uuid`),
         sql`, `,
       )})
       and (k.kaynak_test_id is not null or k.kaynak_metin is not null)
       and k.created_at >= ${enEski.toISOString()}::timestamptz
     order by k.created_at desc
     limit 5000`);
  for (const o of olculebilir) {
    const hedefMetin = o.baslik?.trim().toLowerCase() ?? null;
    const eslesen = kayitlar.filter((k) => {
      if (k.ogrenci_id !== o.ogrenci_id || new Date(k.created_at) < o.created_at) return false;
      if (o.tur === 'kaynak_kitap') return k.kitap_id !== null && k.kitap_id === o.kaynak_kitap_id;
      if (o.tur === 'kaynak_kitap_testi') return k.kaynak_test_id === o.kaynak_test_id;
      return hedefMetin !== null && k.metin === hedefMetin;
    });
    if (eslesen.length === 0) {
      sonuc.set(o.id, null);
      continue;
    }
    const gunler = eslesen.map((k) => k.gun).sort();
    sonuc.set(o.id, {
      ilk: gunler[0] ?? '',
      son: gunler[gunler.length - 1] ?? '',
      sayi: eslesen.length,
    });
  }
  return sonuc;
}

export async function oneriYanitlari(
  tx: Tx,
  y: YetkiBaglami,
  satirlar: readonly OneriSatiri[],
): Promise<KaynakOnerisi[]> {
  if (satirlar.length === 0) return [];
  const adlar = await gorunenAdlar(tx, [...new Set(satirlar.map((s) => s.oneren_id))]);
  const kitapIdleri = [
    ...new Set(satirlar.map((s) => s.kaynak_kitap_id).filter((x): x is string => x !== null)),
  ];
  const testIdleri = [
    ...new Set(satirlar.map((s) => s.kaynak_test_id).filter((x): x is string => x !== null)),
  ];
  const konuIdleri = [
    ...new Set(satirlar.map((s) => s.konu_id).filter((x): x is string => x !== null)),
  ];
  const [kitaplar, testler, konuAd, kullanim] = await Promise.all([
    kitapIdleri.length === 0
      ? []
      : tx
          .select({ id: kaynakKitaplar.id, ad: kaynakKitaplar.ad })
          .from(kaynakKitaplar)
          .where(inArray(kaynakKitaplar.id, kitapIdleri)),
    testIdleri.length === 0
      ? []
      : tx
          .select({ id: kaynakKitapTestleri.id, ad: kaynakKitapTestleri.ad })
          .from(kaynakKitapTestleri)
          .where(inArray(kaynakKitapTestleri.id, testIdleri)),
    konuIdleri.length === 0
      ? []
      : tx
          .select({ id: konular.id, ad: konular.ad })
          .from(konular)
          .where(inArray(konular.id, konuIdleri)),
    kullanimlar(tx, y.kurumId, satirlar),
  ]);
  const kitapAd = new Map(kitaplar.map((k) => [k.id, k.ad]));
  const testAd = new Map(testler.map((t) => [t.id, t.ad]));
  const konuAdi = new Map(konuAd.map((k) => [k.id, k.ad]));
  return satirlar.map((s) => {
    const k = kullanim.get(s.id) ?? null;
    return {
      id: s.id,
      ogrenci_id: s.ogrenci_id,
      oneren_id: s.oneren_id,
      oneren_ad: adlar.get(s.oneren_id) ?? null,
      tur: s.tur as KaynakOnerisiTuru,
      kaynak_kitap_id: s.kaynak_kitap_id,
      kaynak_kitap_ad: s.kaynak_kitap_id ? (kitapAd.get(s.kaynak_kitap_id) ?? null) : null,
      kaynak_test_id: s.kaynak_test_id,
      kaynak_test_ad: s.kaynak_test_id ? (testAd.get(s.kaynak_test_id) ?? null) : null,
      baglanti_url: s.baglanti_url,
      baslik: s.baslik,
      brans_kodu: s.brans_kodu,
      konu_id: s.konu_id,
      konu_ad: s.konu_id ? (konuAdi.get(s.konu_id) ?? null) : null,
      not: s.not_metni,
      basladi: s.tur === 'link' ? null : k !== null,
      ilk_kullanim_gun: k?.ilk ?? null,
      son_kullanim_gun: k?.son ?? null,
      kayit_sayisi: k?.sayi ?? 0,
      geri_cekildi_at: s.geri_cekildi_at?.toISOString() ?? null,
      benim: s.oneren_id === y.uyelikId,
      created_at: s.created_at.toISOString(),
    };
  });
}
