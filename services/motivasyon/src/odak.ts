import {
  errorCodes,
  ODAK_AZAMI_ACIK_SAAT,
  ODAK_AZAMI_DK,
  type OdakBaslatIstegi,
  type OdakOturumu,
} from '@kopru/contracts';
import { AppError, type Tx } from '@kopru/service-kit';
import { sql } from 'drizzle-orm';

import { modulKontrol, odakOlayId, zamanBilgisi, type Kimlik } from './odak-ortak.js';
import {
  durumuGarantile,
  iso,
  ogrenciKilitle,
  yeniId,
  type IsBaglami,
  type Islem,
} from './ortak.js';
import { seriDegerlendir } from './seri.js';
import {
  aktiviteArtir,
  ayarOku,
  kuralGetir,
  rozetleriDegerlendir,
  sayacArtir,
  xpKazan,
} from './xp-cekirdek.js';

/** Istemci saati ile sunucu arasinda izin verilen ileri sapma (baslangic icin). */
const SAPMA_MS = 2 * 60_000;
/** Cevrimdisi baslayan oturumun en eski baslangici. */
const EN_ESKI_BASLANGIC_MS = 24 * 3_600_000;
const SANIYE_TAVANI = ODAK_AZAMI_DK * 60;

interface OturumSatiri extends Record<string, unknown> {
  id: string;
  istemci_id: string;
  baslangic_at: string;
  bitis_at: string | null;
  planlanan_dk: number;
  gerceklesen_sn: number;
  durum: 'devam' | 'tamam' | 'yarida';
  brans_kodu: string | null;
  plan_gorev_id: string | null;
  cihaz: string | null;
  dogrulanmamis_sayilan_sn: number;
  dogrulanmamis_sayilmayan_sn: number;
}

const KOLONLAR = sql`
  id, istemci_id, ${iso('baslangic_at')} as baslangic_at, ${iso('bitis_at')} as bitis_at,
  planlanan_dk::int as planlanan_dk, gerceklesen_sn, durum, brans_kodu, plan_gorev_id, cihaz,
  dogrulanmamis_sayilan_sn, dogrulanmamis_sayilmayan_sn`;

const oturum = (s: OturumSatiri): OdakOturumu => ({
  id: s.id,
  istemci_id: s.istemci_id,
  baslangic_at: s.baslangic_at,
  bitis_at: s.bitis_at,
  planlanan_dk: s.planlanan_dk,
  gerceklesen_sn: s.gerceklesen_sn,
  durum: s.durum,
  brans_kodu: s.brans_kodu,
  plan_gorev_id: s.plan_gorev_id,
  cihaz: s.cihaz,
});

async function istemciIleBul(
  tx: Islem,
  kurumId: string,
  ogrenciId: string,
  istemciId: string,
  kilitle = false,
): Promise<OturumSatiri | null> {
  const [s] = await tx.execute<OturumSatiri>(sql`
    select ${KOLONLAR} from motivasyon.odak_oturumlari
     where kurum_id = ${kurumId} and ogrenci_id = ${ogrenciId} and istemci_id = ${istemciId}
     ${kilitle ? sql`for update` : sql``}`);
  return s ?? null;
}

/**
 * Altı saatten uzun `devam` oturumlarını `yarida` yapar. Bitiş bilinmediği için bitiş = başlangıç +
 * planlanan süre, `gerceklesen_sn = 0` (doğrulanmamış süreye XP verilmez). `ogrenciId` verilirse yalnız o
 * öğrenci (başlatma sırasında); verilmezse hepsi (worker, `motivasyon_sistem`). Kapatılan sayısını döner.
 */
export async function eskiAcikOturumlariKapat(
  tx: Islem,
  an: Date,
  ogrenciId?: string,
): Promise<number> {
  const r = await tx.execute(sql`
    update motivasyon.odak_oturumlari
       set durum = 'yarida', gerceklesen_sn = 0,
           bitis_at = baslangic_at + (planlanan_dk * interval '1 minute')
     where durum = 'devam'
       and baslangic_at < ${an.toISOString()}::timestamptz - make_interval(hours => ${ODAK_AZAMI_ACIK_SAAT}::int)
       ${ogrenciId ? sql`and ogrenci_id = ${ogrenciId}` : sql``}
    returning id`);
  return r.length;
}

const planlananDk = (istek: OdakBaslatIstegi): number =>
  istek.mod === '25_5' ? 25 : istek.mod === '50_10' ? 50 : (istek.planlanan_dk ?? 25);

export async function odakBaslat(
  tx: Tx,
  k: Kimlik,
  istek: OdakBaslatIstegi,
  an: Date,
): Promise<{ oturum: OdakOturumu; yeni: boolean }> {
  const z = await zamanBilgisi(tx, k.kurumId, an);
  await modulKontrol(tx, k.kurumId, k.uyelikId, z.gun);
  await ogrenciKilitle(tx, k.uyelikId);
  await durumuGarantile(tx, k.kurumId, k.uyelikId);

  const var_ = await istemciIleBul(tx, k.kurumId, k.uyelikId, istek.istemci_id);
  if (var_) return { oturum: oturum(var_), yeni: false };

  await eskiAcikOturumlariKapat(tx, an, k.uyelikId);
  const [acik] = await tx.execute<OturumSatiri>(sql`
    select ${KOLONLAR} from motivasyon.odak_oturumlari
     where kurum_id = ${k.kurumId} and ogrenci_id = ${k.uyelikId} and durum = 'devam'`);
  if (acik) {
    throw new AppError(409, 'acik_oturum_var', 'Devam eden bir odak oturumun var.', {
      oturum: oturum(acik),
    });
  }

  const baslangic = istek.baslangic_at ? new Date(istek.baslangic_at) : an;
  if (baslangic.getTime() > an.getTime() + SAPMA_MS) {
    throw new AppError(422, 'baslangic_gecersiz', 'Başlangıç zamanı gelecekte olamaz.');
  }
  if (baslangic.getTime() < an.getTime() - EN_ESKI_BASLANGIC_MS) {
    throw new AppError(422, 'baslangic_gecersiz', 'Başlangıç zamanı 24 saatten eski olamaz.');
  }

  const [yeni] = await tx.execute<OturumSatiri>(sql`
    insert into motivasyon.odak_oturumlari
      (id, kurum_id, created_by, ogrenci_id, istemci_id, baslangic_at, planlanan_dk, brans_kodu,
       plan_gorev_id, cihaz, sunucu_gordu_at)
    values (${yeniId()}, ${k.kurumId}, ${k.kullaniciId}, ${k.uyelikId}, ${istek.istemci_id},
            ${baslangic.toISOString()}::timestamptz, ${planlananDk(istek)}, ${istek.brans_kodu ?? null},
            ${istek.plan_gorev_id ?? null}, ${istek.cihaz ?? null}, ${an.toISOString()}::timestamptz)
    returning ${KOLONLAR}`);
  if (!yeni) throw new Error('odak oturumu yazilamadi');
  return { oturum: oturum(yeni), yeni: true };
}

export interface OdakKazanimi {
  xp: number;
  seviye_atladi: boolean;
  yeni_rozetler: string[];
  /** Geriye donuk (dogrulanmamis) sureden XP/aktiviteye sayilan saniye. */
  dogrulanmamis_sayilan_sn: number;
  /** Gunluk paya takilip sayilmayan saniye (oturumda gorunur, XP/aktivite/rozete girmez). */
  dogrulanmamis_sayilmayan_sn: number;
}

/** Baslangic saat kaymasi payi: sunucunun gordugu andan onceki bu kadar sure dogrulanmis sayilir. */
const SAAT_KAYMASI_SN = 120;
const VARSAYILAN_DOGRULANMAMIS_DK = 30;
export async function odakBitir(
  tx: Tx,
  k: Kimlik,
  istemciId: string,
  istek: { durum: 'tamam' | 'yarida'; bitis_at?: string | undefined },
  an: Date,
): Promise<{ oturum: OdakOturumu; kazanim: OdakKazanimi }> {
  const z = await zamanBilgisi(tx, k.kurumId, an);
  await modulKontrol(tx, k.kurumId, k.uyelikId, z.gun);
  await ogrenciKilitle(tx, k.uyelikId);

  const mevcut = await istemciIleBul(tx, k.kurumId, k.uyelikId, istemciId, true);
  if (!mevcut) throw new AppError(404, errorCodes.notFound, 'Odak oturumu bulunamadı.');

  if (mevcut.durum !== 'devam') {
    // Tekrar bitirme: durum degismez, ikinci XP yok. Kazanim olarak defterdeki toplam doner.
    const [t] = await tx.execute<{ xp: number }>(sql`
      select coalesce(sum(xp), 0)::int as xp from motivasyon.xp_hareketleri
       where kurum_id = ${k.kurumId} and ogrenci_id = ${k.uyelikId}
         and kaynak_olay_id = ${odakOlayId(mevcut.id)} and kural_kodu = 'odak_oturumu'`);
    return {
      oturum: oturum(mevcut),
      kazanim: {
        xp: Math.max(t?.xp ?? 0, 0),
        seviye_atladi: false,
        yeni_rozetler: [],
        dogrulanmamis_sayilan_sn: mevcut.dogrulanmamis_sayilan_sn,
        dogrulanmamis_sayilmayan_sn: mevcut.dogrulanmamis_sayilmayan_sn,
      },
    };
  }

  // Bitis: istemcinin bildirdigi zaman, [baslangic, simdi] araligina sikistirilir. Sure ust siniri:
  // LEAST(bitis - baslangic, planlanan*60 + 60, 3 saat).
  const bildirilen = (istek.bitis_at ? new Date(istek.bitis_at) : an).toISOString();
  const [g] = await tx.execute<OturumSatiri>(sql`
    update motivasyon.odak_oturumlari o
       set durum = ${istek.durum}, bitis_at = x.bitis,
           gerceklesen_sn = greatest(0, least(floor(extract(epoch from (x.bitis - o.baslangic_at)))::int,
                                              o.planlanan_dk * 60 + 60, ${SANIYE_TAVANI}::int))
      from (select least(greatest(${bildirilen}::timestamptz, baslangic_at), ${an.toISOString()}::timestamptz) as bitis
              from motivasyon.odak_oturumlari where id = ${mevcut.id}) x
     where o.id = ${mevcut.id}
    returning ${KOLONLAR}`);
  if (!g?.bitis_at) throw new Error('odak oturumu kapatilamadi');

  // Dogrulanmamis sure: baslangic_at ile sunucunun oturumu ilk gordugu an arasi (2 dk saat kaymasi payi
  // dusulur). Cap (planlanan*60+60, 3 saat) once dogrulanmamis kisimdan keser. Gunluk pay ogrenci kilidi
  // altinda, bitis gunundeki onceki sayilan dogrulanmamis sureden dusulur.
  const bitisGun = await zamanBilgisi(tx, k.kurumId, new Date(g.bitis_at));
  const [o] = await tx.execute<{ ham_sn: number; once_sn: number }>(sql`
    select greatest(0, floor(extract(epoch from (bitis_at - baslangic_at))))::int as ham_sn,
           greatest(0, floor(extract(epoch from (least(bitis_at, sunucu_gordu_at) - baslangic_at))))::int as once_sn
      from motivasyon.odak_oturumlari where id = ${g.id}`);
  const ham = o?.ham_sn ?? 0;
  const dogrulanmamis = Math.max(0, (o?.once_sn ?? 0) - SAAT_KAYMASI_SN);
  const dogrulanmisHam = ham - dogrulanmamis;
  const dogrulanmamisKirpilmis = Math.min(
    dogrulanmamis,
    Math.max(0, g.gerceklesen_sn - dogrulanmisHam),
  );
  const dogrulanmis = g.gerceklesen_sn - dogrulanmamisKirpilmis;
  const pay =
    (await ayarOku<number>(tx, 'odak.dogrulanmamis_gunluk_azami_dk', VARSAYILAN_DOGRULANMAMIS_DK)) *
    60;
  const [kul] = await tx.execute<{ sn: number }>(sql`
    select coalesce(sum(dogrulanmamis_sayilan_sn), 0)::int as sn from motivasyon.odak_oturumlari
     where kurum_id = ${k.kurumId} and ogrenci_id = ${k.uyelikId} and dogrulanmamis_gun = ${bitisGun.gun}::date`);
  const sayilan = Math.min(dogrulanmamisKirpilmis, Math.max(0, pay - (kul?.sn ?? 0)));
  const sayilmayan = dogrulanmamisKirpilmis - sayilan;
  await tx.execute(sql`
    update motivasyon.odak_oturumlari
       set dogrulanmamis_sayilan_sn = ${sayilan}, dogrulanmamis_sayilmayan_sn = ${sayilmayan},
           dogrulanmamis_gun = ${sayilan > 0 ? bitisGun.gun : null}::date
     where id = ${g.id}`);
  g.dogrulanmamis_sayilan_sn = sayilan;
  g.dogrulanmamis_sayilmayan_sn = sayilmayan;

  const sayilanToplam = dogrulanmis + sayilan; // XP ve aktiviteye giren sure
  const uygun = g.durum === 'tamam' || g.gerceklesen_sn >= 60;
  const dakika = Math.floor(sayilanToplam / 60);
  const kazanim: OdakKazanimi = {
    xp: 0,
    seviye_atladi: false,
    yeni_rozetler: [],
    dogrulanmamis_sayilan_sn: sayilan,
    dogrulanmamis_sayilmayan_sn: sayilmayan,
  };
  if (uygun && dakika > 0) {
    const b: IsBaglami = {
      kurumId: k.kurumId,
      ogrenciId: k.uyelikId,
      olayId: odakOlayId(g.id),
      olusmaAt: g.bitis_at,
      saatDilimi: bitisGun.saatDilimi,
      gun: bitisGun.gun,
      hafta: bitisGun.hafta,
    };
    const kural = await kuralGetir(tx, 'odak_oturumu');
    if (!kural) throw new Error('xp kurali yok: odak_oturumu');
    const s = await xpKazan(tx, b, { kural, miktar: dakika, bransKodu: g.brans_kodu });
    // Seri kosulu icin gunluk aktivite ve rozet sayaci tavandan bagimsiz artar (yalniz sayilan sureyle).
    await aktiviteArtir(tx, b, b.gun, 'odak_sn', sayilanToplam);
    // 20 dk odak gun kosulunu saglarsa seri ayni islemde guncellenir (kilometre tasi/rozet gecikmesin).
    await seriDegerlendir(tx, b);
    await sayacArtir(tx, b, 'toplam_odak_dk', dakika);
    kazanim.yeni_rozetler = await rozetleriDegerlendir(tx, b, ['toplam_odak_dk']);
    kazanim.xp = s.verilen;
    kazanim.seviye_atladi = s.seviyeAtladi;
  }
  return { oturum: oturum(g), kazanim };
}

export async function acikOturum(tx: Tx, k: Kimlik, an: Date): Promise<OdakOturumu | null> {
  const z = await zamanBilgisi(tx, k.kurumId, an);
  await modulKontrol(tx, k.kurumId, k.uyelikId, z.gun);
  const [s] = await tx.execute<OturumSatiri>(sql`
    select ${KOLONLAR} from motivasyon.odak_oturumlari
     where kurum_id = ${k.kurumId} and ogrenci_id = ${k.uyelikId} and durum = 'devam'
       and baslangic_at >= ${an.toISOString()}::timestamptz - make_interval(hours => ${ODAK_AZAMI_ACIK_SAAT}::int)`);
  return s ? oturum(s) : null;
}

export async function sonOturumlar(
  tx: Tx,
  k: Kimlik,
  limit: number,
  an: Date,
): Promise<OdakOturumu[]> {
  const z = await zamanBilgisi(tx, k.kurumId, an);
  await modulKontrol(tx, k.kurumId, k.uyelikId, z.gun);
  const satirlar = await tx.execute<OturumSatiri>(sql`
    select ${KOLONLAR} from motivasyon.odak_oturumlari
     where kurum_id = ${k.kurumId} and ogrenci_id = ${k.uyelikId}
     order by baslangic_at desc, id desc limit ${limit}`);
  return satirlar.map(oturum);
}
