import {
  MotivasyonOgrenciDurumuSema,
  errorCodes,
  izinVarMi,
  motivasyonOgrenciYolParamSema,
  motivasyonYolParamSema,
  type MotivasyonOgrenciDurumu,
  type Rol,
} from '@kopru/contracts';
import {
  AppError,
  withTenant,
  type AuthContext,
  type ServicePlugin,
  type Tx,
} from '@kopru/service-kit';
import { sql } from 'drizzle-orm';

import { karakterYollari } from './karakter-yollari.js';
import { odakYollari } from './odak-yollari.js';
import { gunHesapla, iso, kurumBilgisi, modulAcikMi } from './ortak.js';
import { yildizYollari } from './yildiz-yollari.js';

function kimlik(request: { auth: AuthContext | null }, kurumId: string) {
  const a = request.auth;
  if (!a) throw new AppError(401, errorCodes.unauthorized, 'Oturum açmanız gerekiyor.');
  if (!a.kurumId || !a.uyelikId || !a.rol) {
    throw new AppError(403, errorCodes.kurumGerekli, 'Bu işlem için bir kurum seçmelisiniz.');
  }
  if (a.kurumId !== kurumId) {
    throw new AppError(403, errorCodes.forbidden, 'Bu kuruma erişiminiz yok.');
  }
  return { kullaniciId: a.kullaniciId, kurumId, uyelikId: a.uyelikId, rol: a.rol as Rol };
}

const modulKapali = () =>
  new AppError(403, errorCodes.modulKapali, 'Bu özellik kurumunuzda kapalı.');

async function modulKontrol(tx: Tx, kurumId: string, ogrenciId: string, gun: string) {
  const kurum = await kurumBilgisi(tx, kurumId);
  if (kurum.durum !== 'aktif' || !(await modulAcikMi(tx, { kurumId, ogrenciId, gun }))) {
    throw modulKapali();
  }
}

/**
 * Ogrenci durumu. `oyunlastirma.oku` izni (izin sozlugu surum 8) ogrenciye `kendi`, ogretmene `grup`,
 * sahip/yoneticiye `kurum` kapsaminda verilir. `grup` kapsami atandigi gruplardaki ogrencilerle sinirlidir
 * (`atama_kopyalari` + `grup_uyesi_kopyalari`).
 */
export async function ogrenciDurumuOku(
  tx: Tx,
  kurumId: string,
  ogrenciId: string,
  saatDilimi: string,
  simdi: Date,
): Promise<MotivasyonOgrenciDurumu> {
  const { gun } = await gunHesapla(tx, saatDilimi, simdi.toISOString());

  const [d] = await tx.execute<{
    toplam_xp: number;
    seviye: number;
    bu_hafta_xp: number;
    hafta_baslangic: string | null;
  }>(sql`
    select toplam_xp::float8 as toplam_xp, seviye, bu_hafta_xp, hafta_baslangic::text as hafta_baslangic
      from motivasyon.ogrenci_durumlari where kurum_id = ${kurumId} and ogrenci_id = ${ogrenciId}`);
  const toplamXp = d?.toplam_xp ?? 0;
  const seviye = d?.seviye ?? 1;
  // Hafta degistiyse (is henuz calismadiysa) eski hafta XP'si gosterilmez.
  const [h] = await tx.execute<{ hafta: string }>(sql`
    select (date_trunc('week', ${gun}::date))::date::text as hafta`);
  const buHafta = d && d.hafta_baslangic === h?.hafta ? d.bu_hafta_xp : 0;

  const [s] = await tx.execute<{ taban: number; sonraki: number | null }>(sql`
    select (select gereken_toplam_xp::float8 from motivasyon.seviyeler where seviye = ${seviye}) as taban,
           (select gereken_toplam_xp::float8 from motivasyon.seviyeler where seviye = ${seviye + 1}) as sonraki`);

  const [bugun] = await tx.execute<{ xp: number }>(sql`
    select coalesce(sum(xp), 0)::int as xp from motivasyon.xp_hareketleri
     where kurum_id = ${kurumId} and ogrenci_id = ${ogrenciId} and gun = ${gun}::date`);
  const tavanlar = await tx.execute<{ kod: string; kullanilan: number; ust_sinir: number }>(sql`
    select v.kod, coalesce(t.toplam, 0) as kullanilan, v.gunluk_ust_sinir as ust_sinir
      from motivasyon.xp_tavanlari v
      left join motivasyon.xp_gunluk_toplamlari t
        on t.tavan_grubu = v.kod and t.ogrenci_id = ${ogrenciId} and t.gun = ${gun}::date
     order by (v.kod = 'genel') desc, v.kod`);

  const beceriler = await tx.execute<{ kod: string; ad: string; puan: number }>(sql`
    select b.kod, b.ad, coalesce(p.puan, 0) as puan
      from motivasyon.beceri_tanimlari b
      left join motivasyon.beceri_puanlari p on p.beceri_kodu = b.kod and p.ogrenci_id = ${ogrenciId}
     order by b.sira`);

  const kazanilan = await tx.execute<{
    kod: string;
    ad: string;
    aciklama: string;
    kategori: string;
    kademe: string;
    kazanildi_at: string;
  }>(sql`
    select r.kod, r.ad, r.aciklama, r.kategori, r.kademe, ${iso('o.kazanildi_at')} as kazanildi_at
      from motivasyon.ogrenci_rozetleri o
      join motivasyon.rozet_tanimlari r on r.kod = o.rozet_kodu
     where o.kurum_id = ${kurumId} and o.ogrenci_id = ${ogrenciId}
     order by o.kazanildi_at desc, r.sira`);
  // Gizli rozetler kazanilana kadar listelenmez.
  const kilitli = await tx.execute<{
    kod: string;
    ad: string;
    aciklama: string;
    kategori: string;
    kademe: string;
    sayac_kodu: string;
    ilerleme: number;
    esik: number;
  }>(sql`
    select r.kod, r.ad, r.aciklama, r.kategori, r.kademe, r.sayac_kodu,
           least(coalesce(s.deger, 0), r.esik)::int as ilerleme, r.esik::int as esik
      from motivasyon.rozet_tanimlari r
      left join motivasyon.ogrenci_sayaclari s on s.sayac_kodu = r.sayac_kodu and s.ogrenci_id = ${ogrenciId}
     where r.aktif and not r.gizli
       and not exists (select 1 from motivasyon.ogrenci_rozetleri o
                        where o.ogrenci_id = ${ogrenciId} and o.rozet_kodu = r.kod)
     order by r.sira`);

  const [k] = await tx.execute<{
    id: string;
    tur_kodu: string;
    ad: string;
    asama: number;
    sonraki: number | null;
  }>(sql`
    select c.id, c.tur_kodu, c.ad, c.asama,
           (select min(a.gereken_seviye) from motivasyon.karakter_asamalari a
             where a.tur_kodu = c.tur_kodu and a.asama = c.asama + 1) as sonraki
      from motivasyon.ogrenci_karakterleri c
     where c.kurum_id = ${kurumId} and c.ogrenci_id = ${ogrenciId}`);
  const kusanilanlar = k
    ? await tx.execute<{ slot: string; kozmetik_kodu: string }>(sql`
        select slot, kozmetik_kodu from motivasyon.karakter_kusanimlari
         where kurum_id = ${kurumId} and ogrenci_id = ${ogrenciId} order by slot`)
    : [];

  const [seri] = await tx.execute<{
    mevcut_seri: number;
    en_uzun_seri: number;
    son_aktif_gun: string | null;
    dondurma_stogu: number;
    onarim_hakki: number;
    bozulan_seri: number | null;
    bozulan_gun: string | null;
    onarim_bitis_at: string | null;
  }>(sql`
    select mevcut_seri, en_uzun_seri, son_aktif_gun::text as son_aktif_gun, dondurma_stogu::int as dondurma_stogu,
           onarim_hakki::int as onarim_hakki, bozulan_seri, bozulan_gun::text as bozulan_gun,
           ${iso('onarim_bitis_at')} as onarim_bitis_at
      from motivasyon.seriler where kurum_id = ${kurumId} and ogrenci_id = ${ogrenciId}`);

  const hareketler = await tx.execute<{
    id: string;
    kural_kodu: string;
    xp: number;
    gun: string;
    kismi: boolean;
    created_at: string;
  }>(sql`
    select id, kural_kodu, xp, gun::text as gun, kismi, ${iso('created_at')} as created_at
      from motivasyon.xp_hareketleri where kurum_id = ${kurumId} and ogrenci_id = ${ogrenciId}
     order by created_at desc, id desc limit 20`);

  const sonrakiXp = s?.sonraki ?? null;
  return {
    ogrenci_id: ogrenciId,
    toplam_xp: toplamXp,
    seviye,
    seviye_baslangic_xp: s?.taban ?? 0,
    sonraki_seviye_xp: sonrakiXp,
    sonraki_seviyeye_kalan: sonrakiXp === null ? null : Math.max(sonrakiXp - toplamXp, 0),
    bu_hafta_xp: buHafta,
    bugun: { gun, xp: Math.max(bugun?.xp ?? 0, 0), tavanlar: [...tavanlar] },
    beceriler: [...beceriler],
    rozetler: {
      kazanilan: kazanilan.map((r) => ({
        ...r,
      })) as MotivasyonOgrenciDurumu['rozetler']['kazanilan'],
      kilitli: kilitli.map((r) => ({ ...r })) as MotivasyonOgrenciDurumu['rozetler']['kilitli'],
    },
    karakter: k
      ? {
          tur_kodu: k.tur_kodu,
          ad: k.ad,
          asama: k.asama,
          sonraki_asama_seviyesi: k.sonraki,
          kusanilanlar: kusanilanlar.map((x) => ({ ...x })) as NonNullable<
            MotivasyonOgrenciDurumu['karakter']
          >['kusanilanlar'],
        }
      : null,
    seri: seri ?? {
      mevcut_seri: 0,
      en_uzun_seri: 0,
      son_aktif_gun: null,
      dondurma_stogu: 0,
      onarim_hakki: 1,
      bozulan_seri: null,
      bozulan_gun: null,
      onarim_bitis_at: null,
    },
    son_hareketler: [...hareketler],
  };
}

async function ogretmenKapsamindaMi(
  tx: Tx,
  kurumId: string,
  ogretmenId: string,
  ogrenciId: string,
  gun: string,
): Promise<boolean> {
  const r = await tx.execute(sql`
    select 1 from motivasyon.atama_kopyalari a
      join motivasyon.grup_uyesi_kopyalari m on m.grup_id = a.grup_id and m.kurum_id = a.kurum_id
     where a.kurum_id = ${kurumId} and a.ogretmen_id = ${ogretmenId} and m.ogrenci_id = ${ogrenciId}
       and a.baslangic_tarihi <= ${gun}::date and (a.bitis_tarihi is null or a.bitis_tarihi >= ${gun}::date)
       and m.baslangic_tarihi <= ${gun}::date and (m.bitis_tarihi is null or m.bitis_tarihi >= ${gun}::date)
     limit 1`);
  return r.length > 0;
}

export interface YolSecenekleri {
  /** Testler icin saat. */
  simdi?: () => Date;
}

/** Kullanici uclari: `GET /v1/motivasyon/kurumlar/{kurum_id}/benim` ve `.../ogrenciler/{ogrenci_id}/ozet`. */
export function yollariOlustur(secenek: YolSecenekleri = {}): ServicePlugin {
  const simdi = secenek.simdi ?? (() => new Date());

  return (app) => {
    const { db } = app;
    if (!db) return Promise.resolve();

    app.get(
      '/v1/motivasyon/kurumlar/:kurum_id/benim',
      {
        schema: {
          tags: ['motivasyon'],
          summary:
            'Ogrencinin kendi motivasyon durumu: XP, seviye, bugunku tavanlar, beceriler, rozetler, karakter, seri ve son hareketler. Modul kapaliysa 403 modul_kapali.',
          params: motivasyonYolParamSema,
          response: { 200: MotivasyonOgrenciDurumuSema },
        },
      },
      async (request) => {
        const k = kimlik(request, request.params.kurum_id);
        if (!izinVarMi(k.rol, 'oyunlastirma.oku', 'kendi') || k.rol !== 'ogrenci') {
          throw new AppError(403, errorCodes.izinYok, 'Bu uç yalnızca öğrenciler içindir.');
        }
        return withTenant(
          db,
          { kurumId: k.kurumId, kullaniciId: k.kullaniciId, roller: [k.rol] },
          async (tx) => {
            const kurum = await kurumBilgisi(tx, k.kurumId);
            const an = simdi();
            const { gun } = await gunHesapla(tx, kurum.saatDilimi, an.toISOString());
            await modulKontrol(tx, k.kurumId, k.uyelikId, gun);
            return ogrenciDurumuOku(tx, k.kurumId, k.uyelikId, kurum.saatDilimi, an);
          },
        );
      },
    );

    app.get(
      '/v1/motivasyon/kurumlar/:kurum_id/ogrenciler/:ogrenci_id/ozet',
      {
        schema: {
          tags: ['motivasyon'],
          summary:
            'Ogrenci ozeti (benim ile ayni govde). Ogretmen yalniz atandigi gruplardaki ogrenciyi, yonetici/sahip kurumdakileri, ogrenci yalniz kendini gorur. Modul kapaliysa 403 modul_kapali.',
          params: motivasyonOgrenciYolParamSema,
          response: { 200: MotivasyonOgrenciDurumuSema },
        },
      },
      async (request) => {
        const { ogrenci_id: ogrenciId } = request.params;
        const k = kimlik(request, request.params.kurum_id);
        const kurumKapsami = izinVarMi(k.rol, 'oyunlastirma.oku', 'kurum');
        const grupKapsami = izinVarMi(k.rol, 'oyunlastirma.oku', 'grup');
        const kendi = k.rol === 'ogrenci' && k.uyelikId === ogrenciId;
        if (!grupKapsami && !kendi) {
          throw new AppError(403, errorCodes.izinYok, 'Bu öğrencinin özetini görme yetkiniz yok.');
        }
        return withTenant(
          db,
          { kurumId: k.kurumId, kullaniciId: k.kullaniciId, roller: [k.rol] },
          async (tx) => {
            const kurum = await kurumBilgisi(tx, k.kurumId);
            const an = simdi();
            const { gun } = await gunHesapla(tx, kurum.saatDilimi, an.toISOString());
            const bulunamadi = () => new AppError(404, errorCodes.notFound, 'Öğrenci bulunamadı.');
            if (!kendi) {
              if (!kurumKapsami) {
                if (!(await ogretmenKapsamindaMi(tx, k.kurumId, k.uyelikId, ogrenciId, gun))) {
                  throw bulunamadi();
                }
              } else {
                const [var_] = await tx.execute(sql`
                  select 1 from motivasyon.uyelik_kopyalari where uyelik_id = ${ogrenciId} and rol = 'ogrenci'
                  union all
                  select 1 from motivasyon.ogrenci_durumlari where ogrenci_id = ${ogrenciId}
                  limit 1`);
                if (!var_) throw bulunamadi();
              }
            }
            await modulKontrol(tx, k.kurumId, ogrenciId, gun);
            return ogrenciDurumuOku(tx, k.kurumId, ogrenciId, kurum.saatDilimi, an);
          },
        );
      },
    );

    // Odak oturumlari, haftanin yildizi, karakter ve kozmetik uclari (paket M3).
    app.register(odakYollari({ simdi }));
    app.register(yildizYollari({ simdi }));
    app.register(karakterYollari({ simdi }));

    return Promise.resolve();
  };
}
