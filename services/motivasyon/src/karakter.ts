import type { KarakterDetay } from '@kopru/contracts';
import { AppError, type Tx } from '@kopru/service-kit';
import { sql } from 'drizzle-orm';

import { karakterAdiniDegerlendir } from './karakter-ad.js';
import { modulKontrol, zamanBilgisi, type Kimlik } from './odak-ortak.js';
import { durumuGarantile, iso, ogrenciKilitle, yeniId } from './ortak.js';

const uygunsuzAd = () =>
  new AppError(422, 'karakter_adi_uygunsuz', 'Bu ad uygun değil. Başka bir ad dene.');
const karakterYok = () =>
  new AppError(422, 'karakter_secilmemis', 'Önce bir yol arkadaşı seçmelisin.');

export async function turleriListele(tx: Tx) {
  const turler = await tx.execute<{ kod: string; ad: string }>(sql`
    select kod, ad from motivasyon.karakter_turleri where aktif order by kod`);
  const asamalar = await tx.execute<{
    tur_kodu: string;
    asama: number;
    ad: string | null;
    gereken_seviye: number;
  }>(sql`
    select tur_kodu, asama::int as asama, ad, gereken_seviye::int as gereken_seviye
      from motivasyon.karakter_asamalari order by tur_kodu, asama`);
  return turler.map((t) => ({
    kod: t.kod,
    ad: t.ad,
    asamalar: asamalar
      .filter((a) => a.tur_kodu === t.kod)
      .map((a) => ({ asama: a.asama, ad: a.ad ?? '', gereken_seviye: a.gereken_seviye })),
  }));
}

export async function karakterOku(
  tx: Tx,
  kurumId: string,
  ogrenciId: string,
): Promise<KarakterDetay | null> {
  const [c] = await tx.execute<{
    tur_kodu: string;
    tur_adi: string;
    ad: string;
    asama: number;
    asama_adi: string | null;
    sonraki: number | null;
    tur_degistirme_hakki: number;
    secildi_at: string;
  }>(sql`
    select c.tur_kodu, t.ad as tur_adi, c.ad, c.asama::int as asama, a.ad as asama_adi,
           (select min(n.gereken_seviye)::int from motivasyon.karakter_asamalari n
             where n.tur_kodu = c.tur_kodu and n.asama = c.asama + 1) as sonraki,
           c.tur_degistirme_hakki::int as tur_degistirme_hakki, ${iso('c.secildi_at')} as secildi_at
      from motivasyon.ogrenci_karakterleri c
      join motivasyon.karakter_turleri t on t.kod = c.tur_kodu
      left join motivasyon.karakter_asamalari a on a.tur_kodu = c.tur_kodu and a.asama = c.asama
     where c.kurum_id = ${kurumId} and c.ogrenci_id = ${ogrenciId}`);
  if (!c) return null;
  const kusanilanlar = await tx.execute<{ slot: string; kozmetik_kodu: string }>(sql`
    select slot, kozmetik_kodu from motivasyon.karakter_kusanimlari
     where kurum_id = ${kurumId} and ogrenci_id = ${ogrenciId} order by slot`);
  return {
    tur_kodu: c.tur_kodu,
    tur_adi: c.tur_adi,
    ad: c.ad,
    asama: c.asama,
    asama_adi: c.asama_adi ?? '',
    sonraki_asama_seviyesi: c.sonraki,
    tur_degistirme_hakki: c.tur_degistirme_hakki,
    secildi_at: c.secildi_at,
    kusanilanlar: kusanilanlar.map((x) => ({ ...x })) as KarakterDetay['kusanilanlar'],
  };
}

async function hazirlik(tx: Tx, k: Kimlik, an: Date): Promise<void> {
  const z = await zamanBilgisi(tx, k.kurumId, an);
  await modulKontrol(tx, k.kurumId, k.uyelikId, z.gun);
  await ogrenciKilitle(tx, k.uyelikId);
}

async function turDogrula(tx: Tx, turKodu: string): Promise<void> {
  const [t] = await tx.execute(sql`
    select 1 from motivasyon.karakter_turleri where kod = ${turKodu} and aktif`);
  if (!t) throw new AppError(422, 'karakter_turu_gecersiz', 'Bu karakter türü yok.');
}

/** Karakter okuma, modul denetimiyle (ogrenci uclari). */
export async function karakterim(tx: Tx, k: Kimlik, an: Date): Promise<KarakterDetay | null> {
  const z = await zamanBilgisi(tx, k.kurumId, an);
  await modulKontrol(tx, k.kurumId, k.uyelikId, z.gun);
  return karakterOku(tx, k.kurumId, k.uyelikId);
}

export async function karakterSec(
  tx: Tx,
  k: Kimlik,
  istek: { tur_kodu: string; ad: string },
  an: Date,
): Promise<KarakterDetay> {
  await hazirlik(tx, k, an);
  const ad = karakterAdiniDegerlendir(istek.ad);
  if (!ad.uygun) throw uygunsuzAd();
  await turDogrula(tx, istek.tur_kodu);
  await durumuGarantile(tx, k.kurumId, k.uyelikId);
  const [var_] = await tx.execute(sql`
    select 1 from motivasyon.ogrenci_karakterleri where kurum_id = ${k.kurumId} and ogrenci_id = ${k.uyelikId}`);
  if (var_) {
    throw new AppError(
      409,
      'karakter_zaten_secildi',
      'Yol arkadaşını zaten seçtin. Türü ya da adı değiştirebilirsin.',
    );
  }
  // Asama mevcut seviyeden: seviye 1'de asama 1; daha once XP kazanmis ogrenci yuksek asamayla baslar.
  await tx.execute(sql`
    insert into motivasyon.ogrenci_karakterleri (id, kurum_id, created_by, ogrenci_id, tur_kodu, ad, asama, secildi_at)
    values (${yeniId()}, ${k.kurumId}, ${k.kullaniciId}, ${k.uyelikId}, ${istek.tur_kodu}, ${ad.ad},
            coalesce((select max(a.asama) from motivasyon.karakter_asamalari a
                       where a.tur_kodu = ${istek.tur_kodu}
                         and a.gereken_seviye <= (select d.seviye from motivasyon.ogrenci_durumlari d
                                                   where d.kurum_id = ${k.kurumId} and d.ogrenci_id = ${k.uyelikId})), 1),
            ${an.toISOString()}::timestamptz)`);
  const c = await karakterOku(tx, k.kurumId, k.uyelikId);
  if (!c) throw new Error('karakter yazilamadi');
  return c;
}

/** Tur degistirme tek sefer (`tur_degistirme_hakki`); asama ve kusanimlar korunur. */
export async function turDegistir(
  tx: Tx,
  k: Kimlik,
  turKodu: string,
  an: Date,
): Promise<KarakterDetay> {
  await hazirlik(tx, k, an);
  const mevcut = await karakterOku(tx, k.kurumId, k.uyelikId);
  if (!mevcut) throw karakterYok();
  if (mevcut.tur_kodu === turKodu) {
    throw new AppError(422, 'ayni_tur', 'Zaten bu türdesin.');
  }
  await turDogrula(tx, turKodu);
  if (mevcut.tur_degistirme_hakki < 1) {
    throw new AppError(
      409,
      'tur_degistirme_hakki_yok',
      'Türünü değiştirme hakkını zaten kullandın.',
    );
  }
  await tx.execute(sql`
    update motivasyon.ogrenci_karakterleri set tur_kodu = ${turKodu}, tur_degistirme_hakki = 0
     where kurum_id = ${k.kurumId} and ogrenci_id = ${k.uyelikId}`);
  const c = await karakterOku(tx, k.kurumId, k.uyelikId);
  if (!c) throw new Error('karakter okunamadi');
  return c;
}

export async function adDegistir(
  tx: Tx,
  k: Kimlik,
  istek: string,
  an: Date,
): Promise<KarakterDetay> {
  await hazirlik(tx, k, an);
  const ad = karakterAdiniDegerlendir(istek);
  if (!ad.uygun) throw uygunsuzAd();
  const r = await tx.execute(sql`
    update motivasyon.ogrenci_karakterleri set ad = ${ad.ad}
     where kurum_id = ${k.kurumId} and ogrenci_id = ${k.uyelikId} returning id`);
  if (r.length === 0) throw karakterYok();
  const c = await karakterOku(tx, k.kurumId, k.uyelikId);
  if (!c) throw new Error('karakter okunamadi');
  return c;
}

// --- Kozmetikler -----------------------------------------------------------------------------

export async function kozmetikleriListele(tx: Tx, k: Kimlik, an: Date) {
  const z = await zamanBilgisi(tx, k.kurumId, an);
  await modulKontrol(tx, k.kurumId, k.uyelikId, z.gun);
  const satirlar = await tx.execute<{
    kod: string;
    slot: string;
    ad: string;
    nadirlik: string;
    acilma_kosulu: { rozet?: string; seviye?: number; seri?: number };
    rozet_adi: string | null;
    acildi_at: string | null;
    kusanildi: boolean;
  }>(sql`
    select t.kod, t.slot, t.ad, t.nadirlik, t.acilma_kosulu, r.ad as rozet_adi,
           ${iso('o.acildi_at')} as acildi_at, (ku.kozmetik_kodu is not null) as kusanildi
      from motivasyon.kozmetik_tanimlari t
      left join motivasyon.ogrenci_kozmetikleri o
        on o.kozmetik_kodu = t.kod and o.kurum_id = ${k.kurumId} and o.ogrenci_id = ${k.uyelikId}
      left join motivasyon.karakter_kusanimlari ku
        on ku.kozmetik_kodu = t.kod and ku.kurum_id = ${k.kurumId} and ku.ogrenci_id = ${k.uyelikId}
      left join motivasyon.rozet_tanimlari r on r.kod = t.acilma_kosulu->>'rozet'
     where t.aktif or o.id is not null
     order by t.slot, t.kod`);
  return satirlar.map((s) => ({
    kod: s.kod,
    slot: s.slot as KarakterDetay['kusanilanlar'][number]['slot'],
    ad: s.ad,
    nadirlik: s.nadirlik as 'yaygin' | 'nadir' | 'efsanevi',
    sahip: s.acildi_at !== null,
    acildi_at: s.acildi_at,
    kusanildi: s.kusanildi,
    acilma_kosulu: {
      ...s.acilma_kosulu,
      ...(s.rozet_adi ? { rozet_adi: s.rozet_adi } : {}),
    },
  }));
}

/** Slota kozmetik giydirir: sahiplik ve slot eslesmesi zorunlu, karakter secilmis olmali. */
export async function kusan(
  tx: Tx,
  k: Kimlik,
  slot: string,
  kozmetikKodu: string,
  an: Date,
): Promise<KarakterDetay> {
  await hazirlik(tx, k, an);
  const [c] = await tx.execute(sql`
    select 1 from motivasyon.ogrenci_karakterleri where kurum_id = ${k.kurumId} and ogrenci_id = ${k.uyelikId}`);
  if (!c) throw karakterYok();
  const [t] = await tx.execute<{ slot: string; sahip: boolean }>(sql`
    select t.slot, (o.id is not null) as sahip
      from motivasyon.kozmetik_tanimlari t
      left join motivasyon.ogrenci_kozmetikleri o
        on o.kozmetik_kodu = t.kod and o.ogrenci_id = ${k.uyelikId}
     where t.kod = ${kozmetikKodu}`);
  if (!t?.sahip) {
    throw new AppError(422, 'kozmetik_sahip_degil', 'Bu kozmetiğe henüz sahip değilsin.');
  }
  if (t.slot !== slot) {
    throw new AppError(422, 'kozmetik_slot_uyusmuyor', 'Bu kozmetik bu yuvaya takılamaz.');
  }
  await tx.execute(sql`
    insert into motivasyon.karakter_kusanimlari (ogrenci_id, slot, kurum_id, kozmetik_kodu)
    values (${k.uyelikId}, ${slot}, ${k.kurumId}, ${kozmetikKodu})
    on conflict (ogrenci_id, slot) do update set kozmetik_kodu = excluded.kozmetik_kodu`);
  const sonuc = await karakterOku(tx, k.kurumId, k.uyelikId);
  if (!sonuc) throw new Error('karakter okunamadi');
  return sonuc;
}

/** Slottaki kozmetigi cikarir (bos slot icin de basarili: idempotent). */
export async function cikar(tx: Tx, k: Kimlik, slot: string, an: Date): Promise<KarakterDetay> {
  await hazirlik(tx, k, an);
  const c0 = await karakterOku(tx, k.kurumId, k.uyelikId);
  if (!c0) throw karakterYok();
  await tx.execute(sql`
    delete from motivasyon.karakter_kusanimlari where ogrenci_id = ${k.uyelikId} and slot = ${slot}`);
  const c = await karakterOku(tx, k.kurumId, k.uyelikId);
  if (!c) throw new Error('karakter okunamadi');
  return c;
}
