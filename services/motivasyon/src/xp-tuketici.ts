import {
  type dersGeriBildirimVerildiV1,
  type dersKaynakIzlendiV1,
  type dersYoklamaKaydedildiV1,
  type ogrenmeDenemeGirildiV1,
  type ogrenmeOdevIncelendiV1,
  type ogrenmeOdevTeslimEdildiV1,
  type ogrenmePlanGoreviGuncellendiV1,
  type ogrenmeSoruCozulduV1,
  type ogrenmeSoruSorildiV1,
} from '@kopru/contracts';
import { sql } from 'drizzle-orm';

import {
  durumuGarantile,
  gunHesapla,
  kurumBilgisi,
  modulAcikMi,
  ogrenciKilitle,
  yeniId,
  type IsBaglami,
  type Islem,
} from './ortak.js';
import {
  aktifKazanim,
  aktiviteArtir,
  ayarOku,
  kosulSaglanir,
  kuralGetir,
  ozneDurumuOku,
  ozneDurumuYaz,
  ozneIlkKez,
  rozetleriDegerlendir,
  sayacArtir,
  xpKazan,
  xpTersCevir,
  type Kural,
} from './xp-cekirdek.js';

interface OlayZarfi {
  id: string;
  kurumId: string;
  occurredAt: string;
}

interface Hazir {
  b: IsBaglami;
  /** false: modul kapali/kurum aski; olay yalniz `pasif_olay_sayisi`na yazildi. */
  aktif: boolean;
}

/**
 * Ortak giris: kurum saat dilimi, ogrenci etkin mi, kilit, durum satiri, gun hesabi, modul/kurum durumu.
 * `null`: ogrenci etkin degil (kopyasi var ve etkin ogrenci degil) - olay tamamen yok sayilir.
 * Kopya yoksa varsayilanlar: Europe/Istanbul, modul acik, ogrenci etkin.
 */
async function hazirla(
  tx: Islem,
  olay: OlayZarfi,
  ogrenciId: string,
  grupId?: string | null,
): Promise<Hazir | null> {
  const [u] = await tx.execute<{ rol: string; durum: string }>(sql`
    select rol, durum from motivasyon.uyelik_kopyalari where uyelik_id = ${ogrenciId}`);
  if (u && (u.rol !== 'ogrenci' || u.durum !== 'aktif')) return null;

  const kurum = await kurumBilgisi(tx, olay.kurumId);
  const { gun, hafta } = await gunHesapla(tx, kurum.saatDilimi, olay.occurredAt);
  await ogrenciKilitle(tx, ogrenciId);
  await durumuGarantile(tx, olay.kurumId, ogrenciId);
  const b: IsBaglami = {
    kurumId: olay.kurumId,
    ogrenciId,
    olayId: olay.id,
    olusmaAt: olay.occurredAt,
    saatDilimi: kurum.saatDilimi,
    gun,
    hafta,
  };
  const acik = kurum.durum === 'aktif' && (await modulAcikMi(tx, { ...b, grupId: grupId ?? null }));
  if (!acik) {
    await tx.execute(sql`
      update motivasyon.ogrenci_durumlari set pasif_olay_sayisi = pasif_olay_sayisi + 1
       where kurum_id = ${b.kurumId} and ogrenci_id = ${b.ogrenciId}`);
  }
  return { b, aktif: acik };
}

async function kuralZorunlu(tx: Islem, kod: string): Promise<Kural> {
  const k = await kuralGetir(tx, kod);
  if (!k) throw new Error(`xp kurali yok: ${kod}`);
  return k;
}

// --- Yoklama ---------------------------------------------------------------------------------

export async function yoklamaIsle(
  tx: Islem,
  olay: ReturnType<typeof dersYoklamaKaydedildiV1.parse>,
): Promise<void> {
  const d = olay.data;
  const h = await hazirla(tx, olay, d.ogrenci_id, d.grup_id);
  if (!h?.aktif) return;
  const { b } = h;
  const kural = await kuralZorunlu(tx, 'yoklama_geldi');
  const kazanimli = kural.aktif && kosulSaglanir(kural.kosul, { durum: d.durum });
  const onceki = await ozneDurumuOku(tx, b, kural.kod, d.yoklama_id);
  if (onceki && d.yoklama_surumu <= onceki.surum) return; // eski/tekrar olay
  const etkinOnce = onceki?.etkin ?? false;
  await ozneDurumuYaz(tx, b, kural.kod, d.yoklama_id, {
    surum: d.yoklama_surumu,
    etkin: kazanimli,
    etkinOnce,
  });
  const ozne = { id: d.yoklama_id, surum: d.yoklama_surumu };
  if (kazanimli && !etkinOnce) {
    await xpKazan(tx, b, { kural, ozne, bransKodu: d.brans_kodu });
    await sayacArtir(tx, b, 'toplam_yoklama', 1);
    await rozetleriDegerlendir(tx, b, ['toplam_yoklama']);
  } else if (!kazanimli && etkinOnce) {
    const kazanim = await aktifKazanim(tx, b, kural.kod, d.yoklama_id);
    if (kazanim) await xpTersCevir(tx, b, kural, kazanim, ozne, 'yoklama_degisti');
    await sayacArtir(tx, b, 'toplam_yoklama', -1);
  }
}

// --- Geri bildirim, kayit izleme -------------------------------------------------------------

export async function geriBildirimIsle(
  tx: Islem,
  olay: ReturnType<typeof dersGeriBildirimVerildiV1.parse>,
): Promise<void> {
  const d = olay.data;
  const h = await hazirla(tx, olay, d.ogrenci_id);
  if (!h?.aktif) return;
  const kural = await kuralZorunlu(tx, 'geri_bildirim');
  await xpKazan(tx, h.b, {
    kural,
    ozne: { id: d.geri_bildirim_id },
    bransKodu: d.brans_kodu,
  });
}

export async function kayitIzlendiIsle(
  tx: Islem,
  olay: ReturnType<typeof dersKaynakIzlendiV1.parse>,
): Promise<void> {
  const d = olay.data;
  const h = await hazirla(tx, olay, d.ogrenci_id, d.grup_id);
  if (!h?.aktif) return;
  const { b } = h;
  const kural = await kuralZorunlu(tx, 'kayit_izledi');
  if (!(await ozneIlkKez(tx, b, kural.kod, d.kaynak_id))) return;
  await xpKazan(tx, b, { kural, ozne: { id: d.kaynak_id }, bransKodu: d.brans_kodu });
  await sayacArtir(tx, b, 'toplam_kayit_izleme', 1);
  await rozetleriDegerlendir(tx, b, ['toplam_kayit_izleme']);
}

// --- Odev ------------------------------------------------------------------------------------

export async function odevTeslimIsle(
  tx: Islem,
  olay: ReturnType<typeof ogrenmeOdevTeslimEdildiV1.parse>,
): Promise<void> {
  const d = olay.data;
  const h = await hazirla(tx, olay, d.ogrenci_id);
  if (!h?.aktif) return;
  const { b } = h;
  // Yeniden teslimde XP ve sayac yok (ayni odevi tekrar teslim ederek odul kazanilamaz).
  if (d.yeniden_teslim) return;
  const kural = await kuralZorunlu(tx, 'odev_teslim');
  if (!(await ozneIlkKez(tx, b, kural.kod, d.ogrenci_odev_id))) return;
  await xpKazan(tx, b, {
    kural,
    gec: d.gec_teslim,
    ozne: { id: d.ogrenci_odev_id },
    bransKodu: d.brans_kodu,
  });
  await aktiviteArtir(tx, b, b.gun, 'odev_teslim_sayisi', 1);
  await sayacArtir(tx, b, 'toplam_odev_teslim', 1);
  if (d.yapilan_soru_sayisi > 0) {
    await sayacArtir(tx, b, 'toplam_cozulen_soru', d.yapilan_soru_sayisi);
  }
  await rozetleriDegerlendir(tx, b, ['toplam_odev_teslim', 'toplam_cozulen_soru']);
}

export async function odevIncelendiIsle(
  tx: Islem,
  olay: ReturnType<typeof ogrenmeOdevIncelendiV1.parse>,
): Promise<void> {
  const d = olay.data;
  const h = await hazirla(tx, olay, d.ogrenci_id);
  if (!h?.aktif) return;
  const kural = await kuralZorunlu(tx, 'odev_onay');
  if (!kosulSaglanir(kural.kosul, { inceleme_sonucu: d.inceleme_sonucu })) return;
  await xpKazan(tx, h.b, {
    kural,
    ozne: { id: d.ogrenci_odev_id },
    bransKodu: d.brans_kodu,
  });
}

// --- Plan gorevi -----------------------------------------------------------------------------

export async function planGoreviIsle(
  tx: Islem,
  olay: ReturnType<typeof ogrenmePlanGoreviGuncellendiV1.parse>,
): Promise<void> {
  const d = olay.data;
  const h = await hazirla(tx, olay, d.ogrenci_id);
  if (!h?.aktif) return;
  const { b } = h;
  const kural = await kuralZorunlu(tx, 'plan_gorevi_tamam');
  const tamam = kural.aktif && kosulSaglanir(kural.kosul, { durum: d.durum });
  const onceki = await ozneDurumuOku(tx, b, kural.kod, d.gorev_id);
  // Surum yok: olay zamani eski olani yok sayar.
  if (onceki && new Date(olay.occurredAt) < new Date(onceki.son_olay_at)) return;
  const etkinOnce = onceki?.etkin ?? false;
  if (tamam === etkinOnce) return;
  await ozneDurumuYaz(tx, b, kural.kod, d.gorev_id, { surum: 0, etkin: tamam, etkinOnce });

  if (!tamam) {
    // Tamamlamadan cikti: aktivite sayaci, tamamlanan gunden azalir.
    await aktiviteArtir(tx, b, onceki?.gun ?? b.gun, 'plan_gorevi_sayisi', -1);
    return;
  }
  await aktiviteArtir(tx, b, b.gun, 'plan_gorevi_sayisi', 1);

  // Supheli orunti: pencerede esikten FAZLA tamamlama -> XP yok.
  const pencere = await ayarOku<number>(tx, 'supheli.plan_gorevi_pencere_sn', 60);
  const esik = await ayarOku<number>(tx, 'supheli.plan_gorevi_esik', 10);
  const [say] = await tx.execute<{ n: number }>(sql`
    select count(*)::int as n from motivasyon.xp_ozne_durumlari
     where ogrenci_id = ${b.ogrenciId} and kural_kodu = ${kural.kod} and etkin
       and etkin_at > ${b.olusmaAt}::timestamptz - make_interval(secs => ${pencere})
       and etkin_at <= ${b.olusmaAt}::timestamptz`);
  if ((say?.n ?? 0) > esik) return;
  await xpKazan(tx, b, { kural, ozne: { id: d.gorev_id }, bransKodu: d.brans_kodu });
}

// --- Deneme ----------------------------------------------------------------------------------

export async function denemeIsle(
  tx: Islem,
  olay: ReturnType<typeof ogrenmeDenemeGirildiV1.parse>,
): Promise<void> {
  const d = olay.data;
  const h = await hazirla(tx, olay, d.ogrenci_id);
  if (!h) return;
  const { b } = h;
  // Net artisi hesabi onceki 3 denemenin ortalamasina gore; gecmis modul kapaliyken de tutulur.
  const [r] = await tx.execute<{ artis: string | null }>(sql`
    select greatest(0, ${d.toplam_net}::numeric - avg(toplam_net))::text as artis
      from (select toplam_net from motivasyon.deneme_gecmisi
             where kurum_id = ${b.kurumId} and ogrenci_id = ${b.ogrenciId}
               and kural_kodu = ${d.kural_kodu} and sinav_tarihi <= ${d.sinav_tarihi}::date
             order by sinav_tarihi desc, created_at desc limit 3) son`);
  const yeni = await tx.execute(sql`
    insert into motivasyon.deneme_gecmisi
      (id, kurum_id, ogrenci_id, deneme_id, kural_kodu, sinav_tarihi, toplam_net)
    values (${yeniId()}, ${b.kurumId}, ${b.ogrenciId}, ${d.deneme_id}, ${d.kural_kodu},
            ${d.sinav_tarihi}::date, ${d.toplam_net})
    on conflict (deneme_id) do nothing returning id`);
  if (yeni.length === 0 || !h.aktif) return;
  // `avg` bos kumede NULL: onceki deneme yok -> artis 0.
  const artis = r?.artis ?? '0';
  const giris = await kuralZorunlu(tx, 'deneme_girisi');
  await xpKazan(tx, b, { kural: giris, ozne: { id: d.deneme_id } });
  const netKurali = await kuralZorunlu(tx, 'deneme_net_artisi');
  await xpKazan(tx, b, { kural: netKurali, miktar: artis, ozne: { id: d.deneme_id } });
  await sayacArtir(tx, b, 'toplam_deneme', 1);
  const [t] = await tx.execute<{ tam: number }>(sql`select floor(${artis}::numeric)::int as tam`);
  if (Number(artis) > 0) await sayacArtir(tx, b, 'net_artisi_deneme', 1);
  if ((t?.tam ?? 0) > 0) await sayacArtir(tx, b, 'toplam_net_artisi', t?.tam ?? 0);
  await rozetleriDegerlendir(tx, b, ['toplam_deneme', 'net_artisi_deneme', 'toplam_net_artisi']);
}

// --- Soru ------------------------------------------------------------------------------------

export async function soruSorildiIsle(
  tx: Islem,
  olay: ReturnType<typeof ogrenmeSoruSorildiV1.parse>,
): Promise<void> {
  const d = olay.data;
  const h = await hazirla(tx, olay, d.ogrenci_id);
  if (!h?.aktif) return;
  const { b } = h;
  const kural = await kuralZorunlu(tx, 'soru_sorma');
  if (!(await ozneIlkKez(tx, b, kural.kod, d.soru_id))) return;
  await xpKazan(tx, b, { kural, ozne: { id: d.soru_id }, bransKodu: d.brans_kodu });
  await sayacArtir(tx, b, 'toplam_soru', 1);
  await rozetleriDegerlendir(tx, b, ['toplam_soru']);
}

export async function soruCozulduIsle(
  tx: Islem,
  olay: ReturnType<typeof ogrenmeSoruCozulduV1.parse>,
): Promise<void> {
  const d = olay.data;
  const h = await hazirla(tx, olay, d.ogrenci_id);
  if (!h?.aktif) return;
  const { b } = h;
  const kural = await kuralZorunlu(tx, 'soru_anladim');
  // Yeniden acilip tekrar cozulen soru ikinci kez odul/sayac getirmez.
  if (!(await ozneIlkKez(tx, b, kural.kod, d.soru_id))) return;
  await xpKazan(tx, b, { kural, ozne: { id: d.soru_id }, bransKodu: d.brans_kodu });
  await aktiviteArtir(tx, b, b.gun, 'soru_anladim_sayisi', 1);
  await sayacArtir(tx, b, 'toplam_anladim', 1);
  await rozetleriDegerlendir(tx, b, ['toplam_anladim']);
}
