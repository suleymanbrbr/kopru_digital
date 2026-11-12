import {
  hesapAtamaDegistiV1,
  hesapGrupDegistiV1,
  hesapGrupUyesiDegistiV1,
  hesapKademeDegistiV1,
  hesapKurumDegistiV1,
  hesapModulAyariDegistiV1,
  hesapUyelikDegistiV1,
  type Actor,
  type AnyEventEnvelope,
} from '@kopru/contracts';
import { publishInTx, type Database, type Tx } from '@kopru/service-kit';
import { and, eq, gt, inArray, sql } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';

import {
  atamalar,
  grupUyeleri,
  gruplar,
  kademeler,
  kurumlar,
  modulAyarlari,
  uyelikler,
} from '../db/schema.js';
import { grupOlayVerisi, grupUyesiOlayVerisi } from '../modules/hesap/index.js';
import { withSistem } from './with-sistem.js';

/** Yeniden yayimlanan olaylarin yazildigi tablo (api semasi). */
const OUTBOX_TABLOSU = 'ortak.outbox';
const NIL_UUID = '00000000-0000-0000-0000-000000000000';
export const VARSAYILAN_PARCA = 500;
/** Zarftaki `actor`: yeniden yayimlama olaylari bununla taninir (`actor.tur = 'sistem'`). */
export const YENIDEN_YAYIMLA_AKTOR: Actor = { tur: 'sistem', id: 'olay-yeniden-yayimla' };
/** Zarftaki `correlationId` on eki (ardindan calistirma kimligi). */
export const YENIDEN_YAYIMLA_KORELASYON_ON_EKI = 'yeniden-yayimla:';

interface OlayTanimi<TData> {
  create(input: {
    kurumId: string;
    actor: Actor;
    correlationId: string;
    data: TData;
  }): AnyEventEnvelope;
}

interface Baglam {
  actor: Actor;
  correlationId: string;
}

interface Varlik {
  ad: string;
  /** Kurumdaki toplam satir sayisi (salt okuma). */
  say(tx: Pick<Tx, 'select'>, kurumId: string): Promise<number>;
  /** `sonId`den sonraki en cok `n` satiri kilitleyerek okur, olaylari yazar. */
  yayimla(
    tx: Tx,
    kurumId: string,
    sonId: string,
    n: number,
    baglam: Baglam,
  ): Promise<{ adet: number; sonId: string }>;
}

/**
 * Bir tablo satirini, o tabloyu yazan modul kodunun urettigi olayla ayni yukle olaya cevirir.
 * Satirlar `FOR SHARE` ile kilitlenir: ayni satiri degistiren gercek bir istek ya bizden once commit olmus
 * (guncel durumu okuruz) ya da kilidi bekler; bu durumda olay kimligi (UUIDv7) bizimkinden SONRA uretilir ve
 * tuketicideki "daha yeni olay kazanir" kurali gercek degisikligi korur.
 */
function varlik<TSatir extends { id: string }, TData>(s: {
  ad: string;
  say: Varlik['say'];
  oku(tx: Tx, kurumId: string, sonId: string, n: number): Promise<TSatir[]>;
  olay: OlayTanimi<TData>;
  veri(satir: TSatir): TData;
}): Varlik {
  return {
    ad: s.ad,
    say: s.say,
    async yayimla(tx, kurumId, sonId, n, baglam) {
      const satirlar = await s.oku(tx, kurumId, sonId, n);
      for (const satir of satirlar) {
        const olay = s.olay.create({ kurumId, ...baglam, data: s.veri(satir) });
        await publishInTx(tx, olay, { table: OUTBOX_TABLOSU });
      }
      return { adet: satirlar.length, sonId: satirlar.at(-1)?.id ?? sonId };
    },
  };
}

const adet = sql<number>`count(*)::int`;

/**
 * Bagimlilik sirasi (kurum -> kademe -> uyelik -> grup -> grup uyesi -> atama -> modul ayari). Her varlik
 * icinde `id` (UUIDv7 = olusma sirasi) artan: ayni ogrenci icin eski (bitmis) grup uyeligi yenisinden once
 * yayimlanir, yenisi daha yeni olay kimligi alir.
 *
 * Silinmis/pasif varliklar: sozlesme durumu alanlarla tasir (`kurum.durum`, `uyelik.durum='ayrildi'`,
 * `kademe.arsivlendi`, `grup.durum='arsiv'`, `bitis_tarihi`), bu yuzden hepsi bu alanlarla yayimlanir.
 * Gercekten silinen tek varlik modul ayaridir (mirasa donus satiri siler): satir olmadigi icin yayimlanmaz.
 */
const VARLIKLAR: Varlik[] = [
  varlik({
    ad: 'kurum',
    say: async (tx, k) =>
      (await tx.select({ n: adet }).from(kurumlar).where(eq(kurumlar.id, k)))[0]?.n ?? 0,
    oku: (tx, k, son, n) =>
      tx
        .select()
        .from(kurumlar)
        .where(and(eq(kurumlar.id, k), gt(kurumlar.id, son)))
        .orderBy(kurumlar.id)
        .limit(n)
        .for('share'),
    olay: hesapKurumDegistiV1,
    veri: (r) => ({
      kurum_id: r.id,
      ad: r.ad,
      tur: r.tur as 'bireysel' | 'ekip' | 'kurum',
      saat_dilimi: r.saat_dilimi,
      durum: r.durum as 'aktif' | 'askida' | 'kapali',
    }),
  }),
  varlik({
    ad: 'kademe',
    say: async (tx, k) =>
      (await tx.select({ n: adet }).from(kademeler).where(eq(kademeler.kurum_id, k)))[0]?.n ?? 0,
    oku: (tx, k, son, n) =>
      tx
        .select()
        .from(kademeler)
        .where(and(eq(kademeler.kurum_id, k), gt(kademeler.id, son)))
        .orderBy(kademeler.id)
        .limit(n)
        .for('share'),
    olay: hesapKademeDegistiV1,
    veri: (r) => ({
      kademe_id: r.id,
      ad: r.ad,
      seviye: r.seviye,
      arsivlendi: r.arsivlendi_at !== null,
    }),
  }),
  varlik({
    ad: 'uyelik',
    say: async (tx, k) =>
      (await tx.select({ n: adet }).from(uyelikler).where(eq(uyelikler.kurum_id, k)))[0]?.n ?? 0,
    oku: (tx, k, son, n) =>
      tx
        .select()
        .from(uyelikler)
        .where(and(eq(uyelikler.kurum_id, k), gt(uyelikler.id, son)))
        .orderBy(uyelikler.id)
        .limit(n)
        .for('share'),
    olay: hesapUyelikDegistiV1,
    // Ad, telefon, e-posta ve ogrenci_no kasten yok (kisisel veri).
    veri: (r) => ({
      uyelik_id: r.id,
      kullanici_id: r.kullanici_id,
      rol: r.rol as 'sahip' | 'yonetici' | 'ogretmen' | 'ogrenci' | 'veli',
      durum: r.durum as 'davetli' | 'aktif' | 'askida' | 'ayrildi',
      sube_id: r.sube_id,
      kademe_id: r.kademe_id,
    }),
  }),
  varlik({
    ad: 'grup',
    say: async (tx, k) =>
      (await tx.select({ n: adet }).from(gruplar).where(eq(gruplar.kurum_id, k)))[0]?.n ?? 0,
    oku: (tx, k, son, n) =>
      tx
        .select()
        .from(gruplar)
        .where(and(eq(gruplar.kurum_id, k), gt(gruplar.id, son)))
        .orderBy(gruplar.id)
        .limit(n)
        .for('share'),
    olay: hesapGrupDegistiV1,
    veri: grupOlayVerisi,
  }),
  varlik({
    ad: 'grup_uyesi',
    say: async (tx, k) =>
      (await tx.select({ n: adet }).from(grupUyeleri).where(eq(grupUyeleri.kurum_id, k)))[0]?.n ??
      0,
    oku: (tx, k, son, n) =>
      tx
        .select()
        .from(grupUyeleri)
        .where(and(eq(grupUyeleri.kurum_id, k), gt(grupUyeleri.id, son)))
        .orderBy(grupUyeleri.id)
        .limit(n)
        .for('share'),
    olay: hesapGrupUyesiDegistiV1,
    veri: grupUyesiOlayVerisi,
  }),
  varlik({
    ad: 'atama',
    say: async (tx, k) =>
      (await tx.select({ n: adet }).from(atamalar).where(eq(atamalar.kurum_id, k)))[0]?.n ?? 0,
    oku: (tx, k, son, n) =>
      tx
        .select()
        .from(atamalar)
        .where(and(eq(atamalar.kurum_id, k), gt(atamalar.id, son)))
        .orderBy(atamalar.id)
        .limit(n)
        .for('share'),
    olay: hesapAtamaDegistiV1,
    // grup-yollari.ts'teki `atamaOlayVerisi` ile ayni yuk (o islev modul disina acik degil).
    veri: (r) => ({
      atama_id: r.id,
      grup_id: r.grup_id,
      ogretmen_id: r.ogretmen_id,
      brans_kodu: r.brans_kodu,
      baslangic_tarihi: r.baslangic_tarihi,
      bitis_tarihi: r.bitis_tarihi,
      ana_ogretmen: r.ana_ogretmen,
    }),
  }),
  varlik({
    ad: 'modul_ayari',
    say: async (tx, k) =>
      (await tx.select({ n: adet }).from(modulAyarlari).where(eq(modulAyarlari.kurum_id, k)))[0]
        ?.n ?? 0,
    oku: (tx, k, son, n) =>
      tx
        .select()
        .from(modulAyarlari)
        .where(and(eq(modulAyarlari.kurum_id, k), gt(modulAyarlari.id, son)))
        .orderBy(modulAyarlari.id)
        .limit(n)
        .for('share'),
    olay: hesapModulAyariDegistiV1,
    veri: (r) => ({
      modul_ayari_id: r.id,
      modul_kodu: r.modul_kodu as 'takvim',
      kapsam: r.kapsam as 'kurum' | 'kademe' | 'grup',
      kapsam_id: r.kapsam_id,
      acik: r.acik,
    }),
  }),
];

export type VarlikSayilari = Record<string, number>;

export interface YenidenYayimlaSecenekleri {
  /** Bos/verilmezse tum kurumlar. */
  kurumIdleri?: string[];
  /** Yalniz sayar, hicbir sey yazmaz (denetim kaydi da yazilmaz). */
  kuru?: boolean;
  /** Islem basina en cok satir (varsayilan 500). */
  parca?: number;
  log?: (mesaj: string) => void;
}

export interface YenidenYayimlaOzeti {
  calistirmaId: string;
  kuru: boolean;
  kurum: number;
  /** Varlik turune gore olay (kuru modda: yayimlanacak) sayisi. */
  olaylar: VarlikSayilari;
  toplam: number;
  /** Hata alan kurumlar (digerleri etkilenmez; yazilan parcalar kalir, tekrar calistirmak guvenlidir). */
  hatalar: { kurumId: string; hata: string }[];
}

/**
 * `hesap.*.degisti` olaylarini, mevcut satirlarin BUGUNKU durumundan yeniden uretip outbox'a yazar. Tuketici
 * servislerin yerel kopyalari (motivasyon, medya, bildirim) bos ya da bozuksa doldurmak icindir.
 *
 * Her parca kendi `withSistem` isleminde calisir (denetim kaydi: `sistem.olaylari_yeniden_yayimla`).
 * Tasarim notlari (ADR 0002 "Yeniden yayimlama"): zarfta `ozne_surumu` alani yoktur; tuketiciler eski olayi
 * olay kimligi (UUIDv7) siralamasiyla eler. Yeniden yayimlama olaylari yeni kimlik alir ve satirin o anki
 * durumunu tasir; bu yuzden her calistirma kopyada ayni duruma esit, zararsiz bir upsert uretir
 * (tekrar calistirmak idempotenttir; olay sayisi artar ama kopya degismez).
 */
export async function hesapOlaylariniYenidenYayimla(
  db: Database | null,
  secenek: YenidenYayimlaSecenekleri = {},
): Promise<YenidenYayimlaOzeti> {
  if (!db) throw new Error('DATABASE_SISTEM_URL tanımlı değil: olaylar yeniden yayımlanamaz.');
  const parca = secenek.parca ?? VARSAYILAN_PARCA;
  if (!Number.isInteger(parca) || parca < 1) throw new Error('parca pozitif tam sayı olmalı');
  const kuru = secenek.kuru ?? false;
  const log = secenek.log ?? (() => undefined);
  const calistirmaId = uuidv7();
  const baglam: Baglam = {
    actor: YENIDEN_YAYIMLA_AKTOR,
    correlationId: `${YENIDEN_YAYIMLA_KORELASYON_ON_EKI}${calistirmaId}`,
  };

  // Kurum listesi salt okuma; salt okuma icin denetim kaydi yazilmaz.
  const kurumSatirlari = await db.orm
    .select({ id: kurumlar.id })
    .from(kurumlar)
    .where(secenek.kurumIdleri?.length ? inArray(kurumlar.id, secenek.kurumIdleri) : undefined)
    .orderBy(kurumlar.id);
  const bulunanlar = new Set(kurumSatirlari.map((k) => k.id));
  for (const id of secenek.kurumIdleri ?? []) {
    if (!bulunanlar.has(id)) throw new Error(`kurum bulunamadı: ${id}`);
  }

  const ozet: YenidenYayimlaOzeti = {
    calistirmaId,
    kuru,
    kurum: kurumSatirlari.length,
    olaylar: Object.fromEntries(VARLIKLAR.map((v) => [v.ad, 0])),
    toplam: 0,
    hatalar: [],
  };

  for (const { id: kurumId } of kurumSatirlari) {
    try {
      for (const v of VARLIKLAR) {
        let toplam = 0;
        if (kuru) {
          toplam = await v.say(db.orm, kurumId);
        } else {
          let sonId = NIL_UUID;
          for (;;) {
            const sonuc = await withSistem(
              db,
              {
                eylem: 'sistem.olaylari_yeniden_yayimla',
                neden:
                  'Tüketici servislerin yerel kopyalarını doldurmak için hesap durumu olay olarak yeniden yayımlanıyor',
                kurumId,
                hedefTuru: 'kurum',
                hedefId: kurumId,
                ayrinti: { varlik: v.ad, calistirma_id: calistirmaId },
              },
              (tx) => v.yayimla(tx, kurumId, sonId, parca, baglam),
            );
            toplam += sonuc.adet;
            sonId = sonuc.sonId;
            if (sonuc.adet < parca) break;
            log(`  ${kurumId} ${v.ad}: ${String(toplam)} olay yazıldı...`);
          }
        }
        ozet.olaylar[v.ad] = (ozet.olaylar[v.ad] ?? 0) + toplam;
        ozet.toplam += toplam;
        if (toplam > 0) log(`${kurumId} ${v.ad}: ${String(toplam)}`);
      }
    } catch (err) {
      const hata = err instanceof Error ? err.message : String(err);
      ozet.hatalar.push({ kurumId, hata });
      log(`HATA ${kurumId}: ${hata}`);
    }
  }
  return ozet;
}
