import {
  MEDYA_OKUMA_EN_FAZLA_DOSYA,
  MEDYA_OKUMA_SCOPE,
  SORU_CIZIM_EN_FAZLA_BAYT,
  SORU_MESAJ_EN_FAZLA_EK,
  errorCodes,
  medyaOkumaAdresleriYanitiSema,
  ortakDosyaBaglandiV1,
  soruHataKodlari,
  type MedyaBagliTur,
  type MedyaOkumaAdresi,
  type SoruEkGirdi,
} from '@kopru/contracts';
import { AppError, publishInTx, type Tx } from '@kopru/service-kit';
import { and, eq, inArray } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { uuidv7 } from 'uuidv7';

import { medyaDosyaKopyalari, soruDosyalari, soruMesajEkleri } from '../../db/schema.js';
import { servisBelirteciUret, type YetkiBaglami } from '../hesap/index.js';
import { OUTBOX_TABLOSU, type EtkinAyar, type SoruOlayBaglami } from './soru-ortak.js';

/** Rolun ek turu -> medya dosya turu eslemesi. */
export const OGRENCI_EK_TURLERI = {
  fotograf: 'soru_fotografi',
  cizimli_fotograf: 'soru_cizim',
} as const;
export const PERSONEL_EK_TURLERI = {
  fotograf: 'soru_cevap_fotografi',
  cizimli_fotograf: 'soru_cizim',
  ses: 'soru_ses',
} as const;

export interface HazirEk {
  tur: 'fotograf' | 'cizimli_fotograf' | 'ses';
  medya_dosya_id: string;
  kaynak_dosya_id: string | null;
  cizim_verisi: unknown;
  sure_sn: number | null;
}

const dosyaHatasi = (mesaj: string) => new AppError(422, soruHataKodlari.dosyaGecersiz, mesaj);

/**
 * Verilen medya dosyalarini dogrular ve KILITLER (`FOR UPDATE`; ayni dosyanin eszamanli baglanmasi
 * serilesir): ayni kurum, sahibi cagiran kullanici, tur uygun, `durum='hazir'`, baska kayda bagli degil.
 * Kopya henuz yoksa (medya olayi gelmedi) ya da hazir degilse 409 `dosya_hazir_degil` (istemci yeniden dener).
 */
export async function dosyalariDogrula(
  tx: Tx,
  y: YetkiBaglami,
  istenen: readonly { id: string; tur: string }[],
): Promise<Map<string, typeof medyaDosyaKopyalari.$inferSelect>> {
  const idler = istenen.map((d) => d.id);
  if (new Set(idler).size !== idler.length)
    throw dosyaHatasi('Aynı dosya birden çok kez verilemez.');
  const kopyalar = new Map<string, typeof medyaDosyaKopyalari.$inferSelect>();
  if (idler.length === 0) return kopyalar;
  const satirlar = await tx
    .select()
    .from(medyaDosyaKopyalari)
    .where(and(inArray(medyaDosyaKopyalari.id, idler), eq(medyaDosyaKopyalari.kurum_id, y.kurumId)))
    .orderBy(medyaDosyaKopyalari.id)
    .for('update');
  for (const s of satirlar) kopyalar.set(s.id, s);

  for (const d of istenen) {
    const k = kopyalar.get(d.id);
    if (!k) continue;
    if (k.sahip_kullanici_id !== y.kullaniciId || k.tur !== d.tur) {
      throw dosyaHatasi('Dosya bu işlem için kullanılamaz (sahip ya da tür uygun değil).');
    }
    if (k.durum === 'islenemedi') {
      throw new AppError(
        422,
        soruHataKodlari.dosyaIslenemedi,
        'Dosya işlenemedi, yeniden yükleyin.',
      );
    }
    if (k.durum === 'silindi') throw dosyaHatasi('Dosya artık yok.');
  }
  const eksik = idler.filter((id) => !kopyalar.has(id));
  if (eksik.length > 0) {
    throw new AppError(409, soruHataKodlari.dosyaHazirDegil, 'Dosya henüz hazır değil.', {
      dosya_idleri: eksik,
    });
  }
  const bagliSoru = await tx
    .select({ id: soruDosyalari.medya_dosya_id })
    .from(soruDosyalari)
    .where(inArray(soruDosyalari.medya_dosya_id, idler));
  const bagliEk = await tx
    .select({ id: soruMesajEkleri.medya_dosya_id })
    .from(soruMesajEkleri)
    .where(inArray(soruMesajEkleri.medya_dosya_id, idler));
  if (bagliSoru.length + bagliEk.length > 0) {
    throw new AppError(409, soruHataKodlari.dosyaZatenBagli, 'Dosya zaten bir kayda bağlı.');
  }
  return kopyalar;
}

/** Medya turu eslemesine gore ek listesini dogrular (kaynak, ses suresi, cizim boyutu) ve hazirlar. */
export async function ekleriHazirla(
  tx: Tx,
  y: YetkiBaglami,
  ayar: EtkinAyar,
  ekler: readonly SoruEkGirdi[],
  turler: Partial<Record<HazirEk['tur'], string>>,
  kaynakKumesi: ReadonlySet<string>,
  ekDosyalar: readonly { id: string; tur: string }[] = [],
): Promise<{ hazir: HazirEk[]; dosyaIdleri: string[] }> {
  if (ekler.length > SORU_MESAJ_EN_FAZLA_EK) throw dosyaHatasi('En fazla 4 ek eklenebilir.');
  const istenen = ekler.map((e) => {
    const tur = turler[e.tur];
    if (!tur) throw dosyaHatasi('Bu ek türü sizin için kullanılamaz.');
    return { id: e.medya_dosya_id, tur };
  });
  for (const e of ekler) {
    if (e.tur === 'cizimli_fotograf') {
      if (!kaynakKumesi.has(e.kaynak_dosya_id) || e.kaynak_dosya_id === e.medya_dosya_id) {
        throw new AppError(
          422,
          soruHataKodlari.kaynakDosyaGecersiz,
          'Çizim, aynı sorunun bir fotoğrafı üzerine yapılmalı.',
        );
      }
      if (
        e.cizim_verisi !== undefined &&
        Buffer.byteLength(JSON.stringify(e.cizim_verisi)) > SORU_CIZIM_EN_FAZLA_BAYT
      ) {
        throw new AppError(422, errorCodes.validation, 'Çizim verisi en çok 256 KB olabilir.');
      }
    }
  }
  const kopyalar = await dosyalariDogrula(tx, y, [...ekDosyalar, ...istenen]);
  const hazir = ekler.map((e): HazirEk => {
    if (e.tur === 'ses') {
      const sure = kopyalar.get(e.medya_dosya_id)?.sure_sn ?? e.sure_sn ?? null;
      if (sure === null || sure < 1) {
        throw new AppError(422, errorCodes.validation, 'Ses süresi bilinmiyor.');
      }
      if (sure > ayar.sesAzami) {
        throw new AppError(
          422,
          soruHataKodlari.sesCokUzun,
          `Ses cevabı en çok ${String(ayar.sesAzami)} saniye olabilir.`,
        );
      }
      return {
        tur: 'ses',
        medya_dosya_id: e.medya_dosya_id,
        kaynak_dosya_id: null,
        cizim_verisi: null,
        sure_sn: sure,
      };
    }
    return {
      tur: e.tur,
      medya_dosya_id: e.medya_dosya_id,
      kaynak_dosya_id: e.tur === 'cizimli_fotograf' ? e.kaynak_dosya_id : null,
      cizim_verisi: e.tur === 'cizimli_fotograf' ? (e.cizim_verisi ?? null) : null,
      sure_sn: null,
    };
  });
  return { hazir, dosyaIdleri: hazir.map((h) => h.medya_dosya_id) };
}

export async function baglandiOlayiYaz(
  tx: Tx,
  baglam: SoruOlayBaglami,
  dosyaId: string,
  bagliTur: MedyaBagliTur,
  bagliId: string,
): Promise<void> {
  await publishInTx(
    tx,
    ortakDosyaBaglandiV1.create({
      ...baglam,
      data: { dosya_id: dosyaId, bagli_tur: bagliTur, bagli_id: bagliId },
    }),
    { table: OUTBOX_TABLOSU },
  );
}

/** Mesaj eklerini yazar ve her dosya icin ayni islemde `ortak.dosya.baglandi.v1` yayimlar. */
export async function ekleriYaz(
  tx: Tx,
  y: YetkiBaglami,
  baglam: SoruOlayBaglami,
  mesajId: string,
  ekler: readonly HazirEk[],
): Promise<void> {
  let sira = 0;
  for (const e of ekler) {
    await tx.insert(soruMesajEkleri).values({
      id: uuidv7(),
      kurum_id: y.kurumId,
      created_by: y.kullaniciId,
      mesaj_id: mesajId,
      tur: e.tur,
      medya_dosya_id: e.medya_dosya_id,
      kaynak_dosya_id: e.kaynak_dosya_id,
      cizim_verisi: e.cizim_verisi,
      sure_sn: e.sure_sn,
      sira: sira++,
    });
    await baglandiOlayiYaz(tx, baglam, e.medya_dosya_id, 'soru_mesaji', mesajId);
  }
}

/** Sorunun mevcut fotograflari (cizimin kaynagi olabilecek dosyalar). */
export async function sorununFotografKumesi(
  tx: Tx,
  soruId: string,
  mesajIdleri: readonly string[],
): Promise<Set<string>> {
  const a = await tx
    .select({ id: soruDosyalari.medya_dosya_id })
    .from(soruDosyalari)
    .where(eq(soruDosyalari.soru_id, soruId));
  const b =
    mesajIdleri.length === 0
      ? []
      : await tx
          .select({ id: soruMesajEkleri.medya_dosya_id })
          .from(soruMesajEkleri)
          .where(
            and(
              inArray(soruMesajEkleri.mesaj_id, [...mesajIdleri]),
              eq(soruMesajEkleri.tur, 'fotograf'),
            ),
          );
  return new Set([...a, ...b].map((r) => r.id));
}

// --- Okuma adresleri ---------------------------------------------------------------------------

export interface AdresSonucu {
  adresler: Map<string, MedyaOkumaAdresi>;
  /** `true`: medya yapilandirilmamis ya da yanit vermedi (adresler eksik). */
  alinamadi: boolean;
}

/**
 * Ek dosyalarinin okuma adreslerini medya ic ucundan (`POST /ic/okuma-adresleri`, servis JWT'si) tek
 * toplu istekle (50'lik parcalar) alir. Yetki karari cagiranda verilmistir. `MEDYA_URL` yoksa ya da medya
 * kisa zaman asimi icinde yanit vermezse hata firlatilmaz: bos sonuc + `alinamadi` (uyari logu).
 */
export async function okumaAdresleriAl(
  app: FastifyInstance,
  kurumId: string,
  dosyaIdleri: readonly string[],
): Promise<AdresSonucu> {
  const adresler = new Map<string, MedyaOkumaAdresi>();
  const idler = [...new Set(dosyaIdleri)];
  if (idler.length === 0) return { adresler, alinamadi: false };
  const { env } = app.kimlik;
  if (!env.MEDYA_URL) {
    app.log.warn('MEDYA_URL tanımlı değil: ek adresleri alınamadı');
    return { adresler, alinamadi: true };
  }
  const url = new URL('/ic/okuma-adresleri', env.MEDYA_URL);
  let alinamadi = false;
  try {
    const token = await servisBelirteciUret(app.kimlik, {
      hedef: 'medya',
      scope: [MEDYA_OKUMA_SCOPE],
    });
    const parcalar: string[][] = [];
    for (let i = 0; i < idler.length; i += MEDYA_OKUMA_EN_FAZLA_DOSYA) {
      parcalar.push(idler.slice(i, i + MEDYA_OKUMA_EN_FAZLA_DOSYA));
    }
    await Promise.all(
      parcalar.map(async (parca) => {
        try {
          const res = await fetch(url, {
            method: 'POST',
            headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
            body: JSON.stringify({ kurum_id: kurumId, dosya_idleri: parca }),
            signal: AbortSignal.timeout(env.MEDYA_ZAMAN_ASIMI_MS),
          });
          if (!res.ok) throw new Error(`medya yanıtı ${String(res.status)}`);
          const g = medyaOkumaAdresleriYanitiSema.parse(await res.json());
          for (const a of g.adresler) adresler.set(a.dosya_id, a);
        } catch (err) {
          alinamadi = true;
          app.log.warn({ err }, 'medya okuma adresleri alınamadı');
        }
      }),
    );
  } catch (err) {
    alinamadi = true;
    app.log.warn({ err }, 'medya servis belirteci üretilemedi');
  }
  return { adresler, alinamadi };
}
