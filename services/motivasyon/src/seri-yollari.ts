import {
  MotivasyonDuraklatmaGirdisiSema,
  MotivasyonDuraklatmaListesiSema,
  MotivasyonDuraklatmaSema,
  MotivasyonSeriDetaySema,
  errorCodes,
  izinVarMi,
  motivasyonDuraklatmaKimlikParamSema,
  motivasyonDuraklatmaYolParamSema,
  motivasyonYolParamSema,
  type MotivasyonDuraklatma,
  type MotivasyonSeriDetayi,
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

import { gunHesapla, iso, kurumBilgisi, modulAcikMi, yeniId } from './ortak.js';
import { aktiviteOku, gunTamam, hedefler, seriAyarlariOku, seriOku } from './seri.js';

const NIL_UUID = '00000000-0000-0000-0000-000000000000';

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

/** Ogrencinin seri ekrani: son 35 gun, hedefler, onarim penceresi, sonraki kilometre tasi. */
export async function seriDetayiOku(
  tx: Tx,
  kurumId: string,
  ogrenciId: string,
  saatDilimi: string,
  simdi: Date,
): Promise<MotivasyonSeriDetayi> {
  const { gun: bugun } = await gunHesapla(tx, saatDilimi, simdi.toISOString());
  const ay = await seriAyarlariOku(tx);
  const s = await seriOku(tx, ogrenciId);
  const a = await aktiviteOku(tx, ogrenciId, bugun);
  const gunler = await tx.execute<{ gun: string; durum: string }>(sql`
    select (${bugun}::date - (34 - i))::text as gun, coalesce(g.durum, 'yok') as durum
      from generate_series(0, 34) i
      left join motivasyon.seri_gunleri g
        on g.ogrenci_id = ${ogrenciId} and g.gun = ${bugun}::date - (34 - i)
     order by i`);
  const bugunDurum = gunler.at(-1)?.durum ?? 'yok';
  const [b] = await tx.execute<{
    bozulan_seri: number | null;
    bozulan_gun: string | null;
    bitis: string | null;
    pencere: boolean;
  }>(sql`
    select bozulan_seri, bozulan_gun::text as bozulan_gun, ${iso('onarim_bitis_at')} as bitis,
           coalesce(bozulan_gun + 1 = ${bugun}::date, false) as pencere
      from motivasyon.seriler where kurum_id = ${kurumId} and ogrenci_id = ${ogrenciId}`);
  const mevcut = s?.mevcut_seri ?? 0;
  const onarim =
    s?.onarim_hakki === 1 && b?.pencere && b.bozulan_gun && b.bitis && b.bozulan_seri != null
      ? {
          bozulan_gun: b.bozulan_gun,
          bozulan_seri: b.bozulan_seri,
          bitis_at: b.bitis,
          hedefler: hedefler(a, ay, 2),
        }
      : null;
  const sonraki = ay.kilometreTaslari.find((m) => m > mevcut) ?? null;
  return {
    bugun,
    mevcut_seri: mevcut,
    en_uzun_seri: s?.en_uzun_seri ?? 0,
    dondurma_stogu: s?.dondurma_stogu ?? 0,
    onarim_hakki: s?.onarim_hakki ?? 1,
    bugun_aktif: bugunDurum === 'aktif' || gunTamam(a, ay),
    hedefler: hedefler(a, ay),
    onarim,
    sonraki_kilometre_tasi: sonraki === null ? null : { hedef: sonraki, kalan: sonraki - mevcut },
    gunler: gunler.map((g) => ({
      gun: g.gun,
      durum: g.durum as MotivasyonSeriDetayi['gunler'][number]['durum'],
      bugun: g.gun === bugun,
    })),
  };
}

interface DuraklatmaSatiri extends Record<string, unknown> {
  id: string;
  grup_id: string;
  veren_ogretmen_id: string;
  baslangic_gun: string;
  bitis_gun: string;
  neden: string | null;
  iptal_at: string | null;
  created_at: string;
}

const DURAKLATMA_ALANLARI = sql`
  id, grup_id, veren_ogretmen_id, baslangic_gun::text as baslangic_gun, bitis_gun::text as bitis_gun,
  neden, ${iso('iptal_at')} as iptal_at, ${iso('created_at')} as created_at`;

/**
 * Yetki: `oyunlastirma.oku` izni uzerinden (sozluk degismedi). Kurum kapsami (sahip/yonetici) kurumdaki
 * her grup icin; grup kapsami (ogretmen) yalniz `atama_kopyalari`nda aktif atandigi grup icin. Veli/ogrenci
 * yetkisiz. Grup kopyasi yoksa 404.
 */
async function grupYetkisi(
  tx: Tx,
  k: ReturnType<typeof kimlik>,
  grupId: string,
  bugun: string,
): Promise<void> {
  const kurumKapsami = izinVarMi(k.rol, 'oyunlastirma.oku', 'kurum');
  const grupKapsami = izinVarMi(k.rol, 'oyunlastirma.oku', 'grup');
  if (!grupKapsami) {
    throw new AppError(403, errorCodes.izinYok, 'Seri duraklatma yetkiniz yok.');
  }
  const [g] = await tx.execute(sql`
    select 1 from motivasyon.grup_kopyalari where grup_id = ${grupId} and kurum_id = ${k.kurumId}`);
  if (!g) throw new AppError(404, errorCodes.notFound, 'Grup bulunamadı.');
  if (!kurumKapsami) {
    const [a] = await tx.execute(sql`
      select 1 from motivasyon.atama_kopyalari
       where kurum_id = ${k.kurumId} and grup_id = ${grupId} and ogretmen_id = ${k.uyelikId}
         and baslangic_tarihi <= ${bugun}::date and (bitis_tarihi is null or bitis_tarihi >= ${bugun}::date)
       limit 1`);
    if (!a) {
      throw new AppError(403, errorCodes.izinYok, 'Bu gruba atanmış değilsiniz.');
    }
  }
  const kurum = await kurumBilgisi(tx, k.kurumId);
  if (
    kurum.durum !== 'aktif' ||
    !(await modulAcikMi(tx, { kurumId: k.kurumId, ogrenciId: NIL_UUID, gun: bugun, grupId }))
  ) {
    throw modulKapali();
  }
}

/** Seri uclari: ogrenci takvimi ve ogretmen/yonetici grup duraklatmasi. */
export function seriYollari(secenek: { simdi?: () => Date } = {}): ServicePlugin {
  const simdi = secenek.simdi ?? (() => new Date());

  return (app) => {
    const { db } = app;
    if (!db) return Promise.resolve();

    app.get(
      '/v1/motivasyon/kurumlar/:kurum_id/benim/seri',
      {
        schema: {
          tags: ['motivasyon'],
          summary:
            'Ogrencinin seri ekrani: son 35 gunun takvimi (gun basina durum), mevcut/en uzun seri, dondurma stogu, onarim hakki ve penceresi, bugun aktif mi ve hedefe ne kaldi, siradaki kilometre tasi. Modul kapaliysa 403 modul_kapali.',
          params: motivasyonYolParamSema,
          response: { 200: MotivasyonSeriDetaySema },
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
            if (
              kurum.durum !== 'aktif' ||
              !(await modulAcikMi(tx, { kurumId: k.kurumId, ogrenciId: k.uyelikId, gun }))
            ) {
              throw modulKapali();
            }
            return seriDetayiOku(tx, k.kurumId, k.uyelikId, kurum.saatDilimi, an);
          },
        );
      },
    );

    const yol = '/v1/motivasyon/kurumlar/:kurum_id/gruplar/:grup_id/seri-duraklatmalari';

    app.post(
      yol,
      {
        schema: {
          tags: ['motivasyon'],
          summary:
            'Grup icin seri duraklatmasi baslatir (ogretmen yalniz atandigi grup, yonetici/sahip kurumdaki grup). En cok 31 gun (baslangic ve bitis dahil), gecmis gun olamaz; cakisan aralik 409. Aralikta grubun etkin uyeleri icin gunler `duraklatma` olur: seri bozulmaz, dondurma harcanmaz.',
          params: motivasyonDuraklatmaYolParamSema,
          body: MotivasyonDuraklatmaGirdisiSema,
          response: { 201: MotivasyonDuraklatmaSema },
        },
      },
      async (request, reply) => {
        const k = kimlik(request, request.params.kurum_id);
        const { grup_id: grupId } = request.params;
        const g = request.body;
        const sonuc = await withTenant(
          db,
          { kurumId: k.kurumId, kullaniciId: k.kullaniciId, roller: [k.rol] },
          async (tx): Promise<MotivasyonDuraklatma> => {
            const kurum = await kurumBilgisi(tx, k.kurumId);
            const { gun: bugun } = await gunHesapla(tx, kurum.saatDilimi, simdi().toISOString());
            await grupYetkisi(tx, k, grupId, bugun);
            const [fark] = await tx.execute<{ uzun: boolean; gecmis: boolean }>(sql`
              select (${g.bitis_gun}::date - ${g.baslangic_gun}::date > 30) as uzun,
                     (${g.baslangic_gun}::date < ${bugun}::date) as gecmis`);
            if (fark?.uzun) {
              throw new AppError(422, errorCodes.validation, 'Duraklatma en çok 31 gün olabilir.');
            }
            if (fark?.gecmis) {
              throw new AppError(
                422,
                errorCodes.validation,
                'Duraklatma geçmiş bir günle başlayamaz.',
              );
            }
            try {
              const [satir] = await tx.execute<DuraklatmaSatiri>(sql`
                insert into motivasyon.seri_duraklatmalari
                  (id, kurum_id, created_by, grup_id, veren_ogretmen_id, baslangic_gun, bitis_gun, neden)
                values (${yeniId()}, ${k.kurumId}, ${k.kullaniciId}, ${grupId}, ${k.uyelikId},
                        ${g.baslangic_gun}::date, ${g.bitis_gun}::date, ${g.neden ?? null})
                returning ${DURAKLATMA_ALANLARI}`);
              if (!satir) throw new Error('duraklatma yazılamadı');
              return satir;
            } catch (err) {
              const kod = (err as { cause?: { code?: string } }).cause?.code;
              if (kod === '23P01') {
                throw new AppError(
                  409,
                  errorCodes.conflict,
                  'Bu tarihlerde grup için zaten bir duraklatma var.',
                );
              }
              throw err;
            }
          },
        );
        return reply.code(201).send(sonuc);
      },
    );

    app.get(
      yol,
      {
        schema: {
          tags: ['motivasyon'],
          summary:
            'Grubun seri duraklatmalari (iptal edilenler dahil, baslangica gore yeniden eskiye; en cok 100).',
          params: motivasyonDuraklatmaYolParamSema,
          response: { 200: MotivasyonDuraklatmaListesiSema },
        },
      },
      async (request) => {
        const k = kimlik(request, request.params.kurum_id);
        const { grup_id: grupId } = request.params;
        return withTenant(
          db,
          { kurumId: k.kurumId, kullaniciId: k.kullaniciId, roller: [k.rol] },
          async (tx) => {
            const kurum = await kurumBilgisi(tx, k.kurumId);
            const { gun: bugun } = await gunHesapla(tx, kurum.saatDilimi, simdi().toISOString());
            await grupYetkisi(tx, k, grupId, bugun);
            const satirlar = await tx.execute<DuraklatmaSatiri>(sql`
              select ${DURAKLATMA_ALANLARI} from motivasyon.seri_duraklatmalari
               where kurum_id = ${k.kurumId} and grup_id = ${grupId}
               order by baslangic_gun desc, id desc limit 100`);
            return { duraklatmalar: satirlar.map((s) => s as MotivasyonDuraklatma) };
          },
        );
      },
    );

    app.delete(
      `${yol}/:duraklatma_id`,
      {
        schema: {
          tags: ['motivasyon'],
          summary:
            'Duraklatmayi iptal eder (yalniz henuz degerlendirilmemis gunler etkilenir; gecen gunler `duraklatma` kalir). Zaten iptalse 404.',
          params: motivasyonDuraklatmaKimlikParamSema,
          response: { 200: MotivasyonDuraklatmaSema },
        },
      },
      async (request) => {
        const k = kimlik(request, request.params.kurum_id);
        const { grup_id: grupId, duraklatma_id: id } = request.params;
        return withTenant(
          db,
          { kurumId: k.kurumId, kullaniciId: k.kullaniciId, roller: [k.rol] },
          async (tx) => {
            const kurum = await kurumBilgisi(tx, k.kurumId);
            const { gun: bugun } = await gunHesapla(tx, kurum.saatDilimi, simdi().toISOString());
            await grupYetkisi(tx, k, grupId, bugun);
            const [satir] = await tx.execute<DuraklatmaSatiri>(sql`
              update motivasyon.seri_duraklatmalari set iptal_at = ${simdi().toISOString()}::timestamptz
               where id = ${id} and kurum_id = ${k.kurumId} and grup_id = ${grupId} and iptal_at is null
              returning ${DURAKLATMA_ALANLARI}`);
            if (!satir) throw new AppError(404, errorCodes.notFound, 'Duraklatma bulunamadı.');
            return satir;
          },
        );
      },
    );

    return Promise.resolve();
  };
}
