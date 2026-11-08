import { dersHataKodlari, tekrarKuraliCoz } from '@kopru/contracts';
import { AppError, type Tx } from '@kopru/service-kit';
import { eq } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';

import { dersKatilimcilari, dersSerileri, dersler } from '../../db/schema.js';
import { grupEtkinOgrencileri } from '../hesap/index.js';
import {
  cakisanYaniti,
  dersOlayiYaz,
  ogretmenCakismalari,
  type DersOlayBaglami,
  type DersSatiri,
  type SeriSatiri,
} from './ders-deposu.js';
import { tekrarOlusumlari } from './tekrar-uret.js';
import { yerelDenUtc } from './zaman.js';

/** Seri dersleri bu kadar gun ileriye uretilir (12 hafta). */
export const SERI_UFUK_GUN = 84;
/** Tek cagrida uretilecek en cok ders (gecmise donuk buyuk serileri sinirlar). */
const TEK_CAGRI_SINIRI = 400;
const DERS_PARCASI = 100;
const KATILIMCI_PARCASI = 500;

export interface SeriUretimSecenegi {
  /** Ust sinir yerel gun (dahil). */
  ufuk: string;
  /** Yalniz bu gun ve sonrasi uretilir (gece isi gecmisi yeniden uretmez); null: baslangictan itibaren. */
  alt: string | null;
  /**
   * Ogretmen cakismasinda: `reddet` = 409 ders_cakismasi (islem geri alinir), `onayla` = cakisma_onayli
   * ile yaz, `atla` = o dersi uretme (gece isi; kullaniciya sorulamaz).
   */
  cakisma: 'reddet' | 'onayla' | 'atla';
  baglam: DersOlayBaglami;
  /** `created_by`; sistem isinde null. */
  olusturan: string | null;
}

export interface SeriUretimSonucu {
  olusan: DersSatiri[];
  atlanan: { seri_sirasi: number; tarih: string; neden: 'cakisma' | 'zaten_var' }[];
  /** `onayla` kipinde: yazilan derslerin cakistigi mevcut dersler. */
  cakisanlar: DersSatiri[];
  ogrenciIdleri: string[];
  bitti: boolean;
}

/**
 * Seri kuralindan dersleri uretir. Idempotenttir: `UNIQUE (seri_id, seri_sirasi)` ve
 * `ON CONFLICT DO NOTHING` sayesinde ayni is iki kez calisirsa yeni satir olusmaz. Cakisan tek bir ders
 * tum seriyi dusurmez; atlananlar sonucta doner. Ogrenci listesi her ders icin uretim aninda grubun etkin
 * uyelerinden dondurulur. Her yeni ders icin `ders.ders.degisti.v1` (planlandi) ayni islemde yazilir.
 */
export async function seriDerslerUret(
  tx: Tx,
  seri: SeriSatiri,
  secenek: SeriUretimSecenegi,
): Promise<SeriUretimSonucu> {
  const kural = tekrarKuraliCoz(seri.tekrar_kurali);
  if (!kural.ok) throw new Error(`Seri ${seri.id} tekrar kuralı geçersiz: ${kural.hata}`);

  const { olusumlar, bitti } = tekrarOlusumlari({
    kural: kural.kural,
    baslangicTarihi: seri.baslangic_tarihi,
    bitisTarihi: seri.bitis_tarihi,
    adet: seri.adet,
    ufukTarihi: secenek.ufuk,
  });
  const alt = secenek.alt;
  const hedefler = olusumlar.filter((o) => alt === null || o.tarih >= alt);

  const atlanan: SeriUretimSonucu['atlanan'] = [];
  const mevcut = hedefler.length
    ? new Set(
        (
          await tx
            .select({ sira: dersler.seri_sirasi })
            .from(dersler)
            .where(eq(dersler.seri_id, seri.id))
        ).map((m) => m.sira),
      )
    : new Set<number | null>();
  const yeniler = hedefler.filter((o) => {
    if (!mevcut.has(o.sira)) return true;
    atlanan.push({ seri_sirasi: o.sira, tarih: o.tarih, neden: 'zaten_var' });
    return false;
  });
  if (yeniler.length > TEK_CAGRI_SINIRI) {
    throw new AppError(
      422,
      dersHataKodlari.tekrarKapsamiAsildi,
      `Tek seferde en çok ${String(TEK_CAGRI_SINIRI)} ders üretilebilir. Başlangıç tarihini yakınlaştırın.`,
    );
  }

  const saatMetni = seri.baslangic_saati.slice(0, 5);
  const planlar = yeniler.map((o) => {
    const baslangic = yerelDenUtc(o.tarih, saatMetni, seri.saat_dilimi);
    return {
      ...o,
      baslangic,
      bitis: new Date(baslangic.getTime() + seri.sure_dk * 60_000),
    };
  });

  const { cakismalar, hepsi } = await ogretmenCakismalari(
    tx,
    seri.kurum_id,
    seri.ogretmen_id,
    planlar,
  );
  if (secenek.cakisma === 'reddet' && hepsi.length > 0) {
    throw new AppError(
      409,
      dersHataKodlari.dersCakismasi,
      'Öğretmenin bu saatlerde başka dersi var.',
      { cakisanlar: hepsi.map(cakisanYaniti) },
    );
  }
  const yazilacaklar = planlar
    .map((p, i) => ({ ...p, cakisiyor: (cakismalar[i]?.length ?? 0) > 0 }))
    .filter((p) => {
      if (p.cakisiyor && secenek.cakisma === 'atla') {
        atlanan.push({ seri_sirasi: p.sira, tarih: p.tarih, neden: 'cakisma' });
        return false;
      }
      return true;
    });

  const ogrenciIdleri = await grupEtkinOgrencileri(tx, seri.grup_id);
  const olusan: DersSatiri[] = [];
  for (let i = 0; i < yazilacaklar.length; i += DERS_PARCASI) {
    const parca = yazilacaklar.slice(i, i + DERS_PARCASI);
    const eklenen = await tx
      .insert(dersler)
      .values(
        parca.map((p) => ({
          id: uuidv7(),
          kurum_id: seri.kurum_id,
          created_by: secenek.olusturan,
          grup_id: seri.grup_id,
          seri_id: seri.id,
          seri_sirasi: p.sira,
          ogretmen_id: seri.ogretmen_id,
          brans_kodu: seri.brans_kodu,
          baslik: seri.baslik,
          baslangic_at: p.baslangic,
          bitis_at: p.bitis,
          ilk_baslangic_at: p.baslangic,
          online_baglanti: seri.online_baglanti,
          yer: seri.yer,
          cakisma_onayli: p.cakisiyor,
        })),
      )
      // Hedefsiz: hem UNIQUE (seri_id, seri_sirasi) hem EXCLUDE (yaris) ihlali o satiri atlar.
      .onConflictDoNothing()
      .returning();
    const yazilan = new Set(eklenen.map((e) => e.seri_sirasi));
    for (const p of parca) {
      if (!yazilan.has(p.sira)) {
        atlanan.push({ seri_sirasi: p.sira, tarih: p.tarih, neden: 'cakisma' });
      }
    }
    olusan.push(...eklenen);
  }

  const katilimciSatirlari = olusan.flatMap((d) =>
    ogrenciIdleri.map((ogrenciId) => ({
      id: uuidv7(),
      kurum_id: seri.kurum_id,
      created_by: secenek.olusturan,
      ders_id: d.id,
      ogrenci_id: ogrenciId,
      tur: 'uye',
    })),
  );
  for (let i = 0; i < katilimciSatirlari.length; i += KATILIMCI_PARCASI) {
    await tx
      .insert(dersKatilimcilari)
      .values(katilimciSatirlari.slice(i, i + KATILIMCI_PARCASI))
      .onConflictDoNothing();
  }
  for (const d of olusan) await dersOlayiYaz(tx, secenek.baglam, 'planlandi', d, ogrenciIdleri);

  const yeniSon = bitisleSinirla(secenek.ufuk, seri.bitis_tarihi);
  const guncelleme: Partial<typeof dersSerileri.$inferInsert> = {};
  if (yeniSon > seri.uretildi_son_tarih) guncelleme.uretildi_son_tarih = yeniSon;
  if (bitti && seri.durum === 'aktif') guncelleme.durum = 'bitti';
  if (Object.keys(guncelleme).length > 0) {
    await tx.update(dersSerileri).set(guncelleme).where(eq(dersSerileri.id, seri.id));
  }

  const cakisanlar = secenek.cakisma === 'onayla' ? hepsi : [];
  atlanan.sort((a, b) => a.seri_sirasi - b.seri_sirasi);
  return { olusan, atlanan, cakisanlar, ogrenciIdleri, bitti };
}

/** `uretildi_son_tarih`: ufuk, ama serinin bitis tarihini gecmez. */
export function bitisleSinirla(ufuk: string, bitis: string | null): string {
  return bitis !== null && bitis < ufuk ? bitis : ufuk;
}
