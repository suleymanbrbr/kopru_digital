import { KaliciHata, withTenant, YenidenDene, type Database } from '@kopru/service-kit';
import { sql } from 'drizzle-orm';

import {
  GERI_BILDIRIM_PENCERE_SAAT,
  SABLON_GERI_BILDIRIM,
  SABLON_HATIRLATMA,
  SABLON_SABAH,
} from './ders-zamanlama.js';
import { saatMetni } from './eslemeler/yardimci.js';
import type { Islem } from './ortak.js';
import { ayarlariOku, sessizSaatKarari } from './tercih.js';
import { bildirimUret, type UretimSecenekleri } from './uretim.js';
import type { IptalNedeni } from './zamanlama.js';

/**
 * `zamanlanmis.uret` isi: zamani gelen `zamanlanmis_bildirimler` satirlarini `bildirimUret` ile bildirime cevirir.
 * Worker `bildirim_sistem` ile kurumlari bulur, her kurumun satirlarini `bildirim_app` + kurum baglaminda (RLS)
 * isler. Coklu worker guvenli: `FOR UPDATE SKIP LOCKED`.
 *
 * Satir basina karar: `uretildi` | `iptal` (kalici: ders iptal, zamani gecmis...) | `bekle` (henuz uygun degil:
 * geri bildirim icin ders `tamamlandi` olmali; alici kopyasi gelmedi). 24 saati asan gecikme iptal edilir.
 */

export const BAYAT_SAAT = 24;
export const PAKET = 100;
/** Bu sure ve altinda kalmis hatirlatma sessiz saate ertelenmez (docs/schema/bildirim.md). */
export const ERTELENEMEZ_ESIK_DK = 30;

export interface ZamanlanmisBagimliliklari {
  /** `bildirim_sistem`: yalniz bekleyen kurumlari bulmak icin. */
  sistem: Pick<Database, 'orm'>;
  /** `bildirim_app`: RLS'e tabi isleme. */
  app: Database;
  simdi?: () => Date;
  paket?: number;
  /** Yalniz bu kurumu isle (testler ve elle mudahale icin; verilmezse tum kurumlar). */
  kurumId?: string;
  log?: { error(nesne: Record<string, unknown>, mesaj: string): void };
}

export interface ZamanlanmisOzet {
  kurum: number;
  uretildi: number;
  iptal: number;
  bekleyen: number;
}

interface Satir extends Record<string, unknown> {
  id: string;
  kurum_id: string;
  kaynak_id: string;
  alici_id: string;
  sablon_kodu: string;
  gonderim_at: string;
  veri: Record<string, unknown>;
}

type Karar = { karar: 'uretildi' } | { karar: 'iptal'; nedeni: IptalNedeni } | { karar: 'bekle' };

/**
 * Geri bildirim satiri ancak ders `planli` degilken (tamamlandi ya da iptal) isleme alinir: yoklamasi
 * alinmamis dersin bekleyen satirlari her turda secilip siradaki satirlari aclikta birakmasin.
 */
function hazirKosulu(a: string) {
  const t = sql.raw(a);
  return sql`(${t}.sablon_kodu <> ${SABLON_GERI_BILDIRIM} or not exists (
    select 1 from bildirim.ders_planlari p
     where p.kurum_id = ${t}.kurum_id and p.ders_id = ${t}.kaynak_id and p.durum = 'planli'))`;
}

/** Yoklamasi hic alinmamis dersin (48 saati asan) geri bildirim satirlari kalici olarak iptal edilir. */
async function eskiyiTemizle(sistem: Pick<Database, 'orm'>, simdi: Date): Promise<void> {
  await sistem.orm.execute(sql`
    update bildirim.zamanlanmis_bildirimler z
       set iptal_at = ${simdi.toISOString()}::timestamptz, iptal_nedeni = 'gecmis'
     where z.sablon_kodu = ${SABLON_GERI_BILDIRIM} and z.iptal_at is null and z.uretildi_at is null
       and z.gonderim_at < ${new Date(simdi.getTime() - 2 * BAYAT_SAAT * 3_600_000).toISOString()}::timestamptz`);
}

export async function zamanlanmisUret(b: ZamanlanmisBagimliliklari): Promise<ZamanlanmisOzet> {
  const simdi = (b.simdi ?? (() => new Date()))();
  const ozet: ZamanlanmisOzet = { kurum: 0, uretildi: 0, iptal: 0, bekleyen: 0 };
  const kurumlar = await b.sistem.orm.execute<{ kurum_id: string }>(sql`
    select distinct z.kurum_id from bildirim.zamanlanmis_bildirimler z
     where z.gonderim_at <= ${simdi.toISOString()}::timestamptz and z.iptal_at is null
       and z.uretildi_at is null and ${hazirKosulu('z')}
       and (${b.kurumId ?? null}::uuid is null or z.kurum_id = ${b.kurumId ?? null}::uuid)
     limit 200`);
  await eskiyiTemizle(b.sistem, simdi);
  for (const { kurum_id: kurumId } of kurumlar) {
    ozet.kurum += 1;
    try {
      const o = await withTenant(b.app, { kurumId }, (tx) =>
        kurumuIsle(tx, kurumId, simdi, b.paket ?? PAKET),
      );
      ozet.uretildi += o.uretildi;
      ozet.iptal += o.iptal;
      ozet.bekleyen += o.bekleyen;
    } catch (err) {
      // Bir kurumun sorunu digerlerini durdurmaz; satirlar bir sonraki turda yeniden denenir.
      b.log?.error({ err, kurumId }, 'zamanlanmış bildirim kurum turu başarısız');
    }
  }
  return ozet;
}

async function kurumuIsle(
  tx: Islem,
  kurumId: string,
  simdi: Date,
  paket: number,
): Promise<{ uretildi: number; iptal: number; bekleyen: number }> {
  const satirlar = await tx.execute<Satir>(sql`
    select z.id, z.kurum_id, z.kaynak_id, z.alici_id, z.sablon_kodu, z.gonderim_at::text as gonderim_at, z.veri
      from bildirim.zamanlanmis_bildirimler z
     where z.kurum_id = ${kurumId} and z.gonderim_at <= ${simdi.toISOString()}::timestamptz
       and z.iptal_at is null and z.uretildi_at is null and ${hazirKosulu('z')}
     order by z.gonderim_at, z.id
     limit ${paket}
       for update of z skip locked`);
  const sonuc = { uretildi: 0, iptal: 0, bekleyen: 0 };
  for (const s of satirlar) {
    let k: Karar;
    try {
      k = await satiriIsle(tx, s, simdi);
    } catch (err) {
      if (err instanceof YenidenDene) k = { karar: 'bekle' };
      else if (err instanceof KaliciHata) k = { karar: 'iptal', nedeni: 'gecmis' };
      else throw err;
    }
    if (
      k.karar === 'bekle' &&
      simdi.getTime() - new Date(s.gonderim_at).getTime() > BAYAT_SAAT * 3_600_000
    ) {
      k = { karar: 'iptal', nedeni: 'gecmis' };
    }
    if (k.karar === 'uretildi') {
      await tx.execute(sql`
        update bildirim.zamanlanmis_bildirimler set uretildi_at = ${simdi.toISOString()}::timestamptz
         where id = ${s.id}`);
      sonuc.uretildi += 1;
    } else if (k.karar === 'iptal') {
      await tx.execute(sql`
        update bildirim.zamanlanmis_bildirimler
           set iptal_at = ${simdi.toISOString()}::timestamptz, iptal_nedeni = ${k.nedeni}
         where id = ${s.id}`);
      sonuc.iptal += 1;
    } else {
      sonuc.bekleyen += 1;
    }
  }
  return sonuc;
}

interface DersPlani extends Record<string, unknown> {
  durum: string;
  baslangic_at: string;
  bitis_at: string;
}

async function dersPlani(
  tx: Islem,
  kurumId: string,
  dersId: string,
): Promise<DersPlani | undefined> {
  const [p] = await tx.execute<DersPlani>(sql`
    select durum, baslangic_at::text as baslangic_at, bitis_at::text as bitis_at
      from bildirim.ders_planlari where kurum_id = ${kurumId} and ders_id = ${dersId}`);
  return p;
}

/** Uretim zamaninda alicinin yerel saat dilimi ve sessiz saat karari icin ayarlar. */
async function aliciAyari(tx: Islem, kurumId: string, uyelikId: string) {
  const [u] = await tx.execute<{ kullanici_id: string }>(sql`
    select kullanici_id from bildirim.uyelik_kopyalari where kurum_id = ${kurumId} and uyelik_id = ${uyelikId}`);
  if (!u) throw new YenidenDene(`alıcı üyelik kopyası henüz yok (${uyelikId})`);
  return ayarlariOku(tx, u.kullanici_id, kurumId);
}

const zamanMs = (s: unknown) => new Date(String(s)).getTime();

async function satiriIsle(tx: Islem, s: Satir, simdi: Date): Promise<Karar> {
  const sec: UretimSecenekleri = { simdi };
  const v = s.veri;
  switch (s.sablon_kodu) {
    case SABLON_HATIRLATMA: {
      const plan = await dersPlani(tx, s.kurum_id, s.kaynak_id);
      const baslangic = zamanMs(v.baslangic_at);
      if (plan && (plan.durum !== 'planli' || zamanMs(plan.baslangic_at) !== baslangic)) {
        return { karar: 'iptal', nedeni: 'ders' };
      }
      if (baslangic <= simdi.getTime()) return { karar: 'iptal', nedeni: 'gecmis' };
      const ayar = await aliciAyari(tx, s.kurum_id, s.alici_id);
      const sessiz = sessizSaatKarari(simdi, ayar);
      // Baslangica <= 30 dk kalmis ya da sessiz saat bitmeden ders baslayacaksa erteleme anlamsiz: atlanir.
      const ertelenemez =
        baslangic - simdi.getTime() <= ERTELENEMEZ_ESIK_DK * 60_000 ||
        (sessiz.sessiz && sessiz.bitisAt.getTime() >= baslangic);
      await bildirimUret(
        tx,
        {
          kurumId: s.kurum_id,
          aliciUyelikIdleri: [s.alici_id],
          sablonKodu: SABLON_HATIRLATMA,
          degiskenler: {
            ders_id: s.kaynak_id,
            saat: saatMetni(new Date(baslangic), ayar.saat_dilimi),
          },
          veri: { ders_id: s.kaynak_id },
          kaynakOlayId: s.id,
          tekilAnahtar: `${SABLON_HATIRLATMA}:${s.kaynak_id}:${String(baslangic)}`,
          gecerlilikBitisAt: new Date(zamanMs(v.bitis_at)),
          ertelenemez,
        },
        sec,
      );
      return { karar: 'uretildi' };
    }
    case SABLON_GERI_BILDIRIM: {
      const plan = await dersPlani(tx, s.kurum_id, s.kaynak_id);
      if (!plan || plan.durum === 'iptal') return { karar: 'iptal', nedeni: 'ders' };
      if (plan.durum !== 'tamamlandi') return { karar: 'bekle' }; // yoklama alininca (tamamlandi) uretilir
      const bitis = zamanMs(plan.bitis_at);
      const pencereBitisi = bitis + GERI_BILDIRIM_PENCERE_SAAT * 3_600_000;
      if (simdi.getTime() >= pencereBitisi) return { karar: 'iptal', nedeni: 'gecmis' };
      await bildirimUret(
        tx,
        {
          kurumId: s.kurum_id,
          aliciUyelikIdleri: [s.alici_id],
          sablonKodu: SABLON_GERI_BILDIRIM,
          degiskenler: { ders_id: s.kaynak_id },
          veri: { ders_id: s.kaynak_id },
          kaynakOlayId: s.id,
          tekilAnahtar: `${SABLON_GERI_BILDIRIM}:${s.kaynak_id}`,
          gecerlilikBitisAt: new Date(pencereBitisi),
        },
        sec,
      );
      return { karar: 'uretildi' };
    }
    case SABLON_SABAH: {
      const ilk = zamanMs(v.ilk_baslangic_at);
      if (ilk <= simdi.getTime()) return { karar: 'iptal', nedeni: 'gecmis' };
      const ayar = await aliciAyari(tx, s.kurum_id, s.alici_id);
      await bildirimUret(
        tx,
        {
          kurumId: s.kurum_id,
          aliciUyelikIdleri: [s.alici_id],
          sablonKodu: SABLON_SABAH,
          degiskenler: {
            ders_sayisi: Number(v.ders_sayisi),
            ilk_saat: saatMetni(new Date(ilk), ayar.saat_dilimi),
          },
          veri: { gun: v.gun },
          kaynakOlayId: s.id,
          tekilAnahtar: `${SABLON_SABAH}:${s.alici_id}:${String(v.gun)}`,
          gecerlilikBitisAt: new Date(zamanMs(v.gun_bitis_at)),
          ertelenemez: true,
        },
        sec,
      );
      return { karar: 'uretildi' };
    }
    case 'odev_teslim_yaklasiyor': {
      const sonTeslim = zamanMs(v.son_teslim_at);
      if (sonTeslim <= simdi.getTime()) return { karar: 'iptal', nedeni: 'gecmis' };
      await bildirimUret(
        tx,
        {
          kurumId: s.kurum_id,
          aliciUyelikIdleri: [s.alici_id],
          sablonKodu: 'odev_teslim_yaklasiyor',
          degiskenler: { odev_id: s.kaynak_id },
          veri: { odev_id: s.kaynak_id },
          kaynakOlayId: s.id,
          tekilAnahtar: `odev_teslim_yaklasiyor:${s.kaynak_id}`,
          gecerlilikBitisAt: new Date(sonTeslim),
        },
        sec,
      );
      return { karar: 'uretildi' };
    }
    default:
      throw new KaliciHata(`bilinmeyen zamanlanmış şablon: ${s.sablon_kodu}`);
  }
}
