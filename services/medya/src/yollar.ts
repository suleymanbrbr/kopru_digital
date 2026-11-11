import {
  MEDYA_OKUMA_ADRESI_OMRU_SN,
  MEDYA_OKUMA_SCOPE,
  MEDYA_TUR_KURALLARI,
  MEDYA_YUKLEME_ADRESI_OMRU_SN,
  errorCodes,
  medyaDosyaDurumYanitiSema,
  medyaDosyaParamSema,
  medyaHataKodlari,
  medyaOkumaAdresleriIstegiSema,
  medyaOkumaAdresleriYanitiSema,
  medyaTuruYuklenebilirMi,
  medyaYuklemeIstegiSema,
  medyaYuklemeYanitiSema,
  type MedyaDosyaDurumu,
  type MedyaDosyaTuru,
} from '@kopru/contracts';
import {
  AppError,
  withTenant,
  type AuthContext,
  type Database,
  type ServicePlugin,
  type Tx,
} from '@kopru/service-kit';
import { sql } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';

import type { Depolama } from './depolama.js';
import {
  dosyayiBasarisizYap,
  depolamaAnahtari,
  iso,
  yuklemeAnahtari,
} from './dosya-deposu.js';

interface DosyaSatiri extends Record<string, unknown> {
  id: string;
  tur: MedyaDosyaTuru;
  mime_tipi: string;
  bildirilen_boyut_bayt: number;
  boyut_bayt: number | null;
  durum: MedyaDosyaDurumu;
  hata_kodu: string | null;
  genislik: number | null;
  yukseklik: number | null;
  sure_sn: number | null;
  depolama_anahtari: string | null;
  sahip_kullanici_id: string;
  sahip_uyelik_id: string;
  kurum_id: string;
  bildirilen_sha256: string;
  yukleme_son_at: string;
  yukleme_gecerli: boolean;
}

const SECIM = sql`
  id, kurum_id, tur, mime_tipi, bildirilen_boyut_bayt::float8 as bildirilen_boyut_bayt,
  boyut_bayt::float8 as boyut_bayt, durum, hata_kodu, genislik, yukseklik, sure_sn, depolama_anahtari,
  sahip_kullanici_id, sahip_uyelik_id, encode(bildirilen_sha256, 'hex') as bildirilen_sha256,
  ${iso('yukleme_son_at')} as yukleme_son_at, (yukleme_son_at > now()) as yukleme_gecerli`;

const ozet = (d: DosyaSatiri) => ({
  id: d.id,
  tur: d.tur,
  mime_tipi: d.mime_tipi,
  boyut_bayt: d.boyut_bayt ?? d.bildirilen_boyut_bayt,
  durum: d.durum,
});

function kimlik(request: { auth: AuthContext | null }) {
  const a = request.auth;
  if (!a) throw new AppError(401, errorCodes.unauthorized, 'Oturum açmanız gerekiyor.');
  if (!a.kurumId || !a.uyelikId || !a.rol) {
    throw new AppError(403, errorCodes.kurumGerekli, 'Bu işlem için bir kurum seçmelisiniz.');
  }
  return { kullaniciId: a.kullaniciId, kurumId: a.kurumId, uyelikId: a.uyelikId, rol: a.rol };
}

const ctx = (k: ReturnType<typeof kimlik>) => ({
  kurumId: k.kurumId,
  kullaniciId: k.kullaniciId,
  roller: [k.rol],
});

export interface YolSecenekleri {
  depolama: Depolama | null;
  varsayilanKotaBayt: number;
  /** Testler icin saat. */
  simdi?: () => Date;
}

/** Kullanici uclari (`/v1/dosyalar*`) ve ic uc (`/ic/okuma-adresleri`). */
export function yollariOlustur(secenek: YolSecenekleri): ServicePlugin {
  const { depolama, varsayilanKotaBayt } = secenek;
  const simdi = secenek.simdi ?? (() => new Date());

  const depolamaGerekli = (): Depolama => {
    if (!depolama) {
      throw new AppError(
        503,
        medyaHataKodlari.depolamaYapilandirilmamis,
        'Dosya depolama şu an kullanılamıyor.',
      );
    }
    return depolama;
  };

  async function yuklemeAdresi(d: DosyaSatiri, dep: Depolama) {
    const bitis = new Date(simdi().getTime() + MEDYA_YUKLEME_ADRESI_OMRU_SN * 1000);
    const { url, basliklar } = await dep.yuklemeAdresi({
      anahtar: yuklemeAnahtari(d.depolama_anahtari ?? ''),
      mime: d.mime_tipi,
      boyutBayt: d.bildirilen_boyut_bayt,
      omurSn: MEDYA_YUKLEME_ADRESI_OMRU_SN,
    });
    return { yontem: 'PUT' as const, url, basliklar, gecerlilik_bitis_at: bitis.toISOString() };
  }

  return async (app) => {
    const { db } = app;
    if (!db) return;

    app.post(
      '/v1/dosyalar',
      {
        schema: {
          tags: ['medya'],
          summary:
            'Yukleme izni: kayit acar, kota ayirir, 15 dk gecerli presigned PUT adresi doner. Ayni `istemci_anahtari` ayni kaydi (ve gecerliyse yeni PUT adresi) dondurur. Istemci PUT istegine `basliklar`i aynen ekler.',
          body: medyaYuklemeIstegiSema,
          response: { 200: medyaYuklemeYanitiSema, 201: medyaYuklemeYanitiSema },
        },
      },
      async (request, reply) => {
        const dep = depolamaGerekli();
        const k = kimlik(request);
        const g = request.body;
        const kural = MEDYA_TUR_KURALLARI[g.tur];
        if (!medyaTuruYuklenebilirMi(g.tur, k.rol)) {
          throw new AppError(
            403,
            medyaHataKodlari.turYetkisiYok,
            'Bu dosya türünü yükleme yetkiniz yok.',
          );
        }
        if (!(kural.izinli_mime as readonly string[]).includes(g.mime_tipi)) {
          throw new AppError(
            415,
            medyaHataKodlari.mimeDesteklenmiyor,
            'Bu dosya biçimi desteklenmiyor. Fotoğrafları JPEG, PNG veya WebP olarak gönderin.',
          );
        }
        if (g.boyut_bayt > kural.azami_boyut_bayt) {
          throw new AppError(
            413,
            medyaHataKodlari.dosyaCokBuyuk,
            'Dosya izin verilen boyutu aşıyor.',
            { azami_boyut_bayt: kural.azami_boyut_bayt },
          );
        }

        const sonuc = await withTenant(db, ctx(k), async (tx: Tx) => {
          const [kopya] = await tx.execute<{ durum: string; medya_kota_bayt: number | null }>(sql`
            select durum, medya_kota_bayt::float8 as medya_kota_bayt from medya.kurum_kopyalari
             where kurum_id = ${k.kurumId}`);
          if (kopya && kopya.durum !== 'aktif') {
            throw new AppError(
              403,
              medyaHataKodlari.kurumAskida,
              'Kurum hesabı aktif olmadığı için dosya yüklenemiyor.',
            );
          }
          const kota = kopya?.medya_kota_bayt ?? varsayilanKotaBayt;

          const id = uuidv7();
          const an = simdi();
          const eklenen = await tx.execute<DosyaSatiri>(sql`
            insert into medya.dosyalar
              (id, kurum_id, created_by, sahip_kullanici_id, sahip_uyelik_id, tur, mime_tipi,
               bildirilen_boyut_bayt, bildirilen_sha256, depolama_anahtari, kova, istemci_anahtari,
               yukleme_son_at, kota_bayt)
            values (${id}, ${k.kurumId}, ${k.kullaniciId}, ${k.kullaniciId}, ${k.uyelikId}, ${g.tur},
                    ${g.mime_tipi}, ${g.boyut_bayt}, decode(${g.sha256}, 'hex'),
                    ${depolamaAnahtari(k.kurumId, g.tur, id, an)}, ${dep.kova}, ${g.istemci_anahtari},
                    ${new Date(an.getTime() + MEDYA_YUKLEME_ADRESI_OMRU_SN * 1000).toISOString()}::timestamptz,
                    ${g.boyut_bayt})
            on conflict (kurum_id, sahip_kullanici_id, istemci_anahtari) do nothing
            returning ${SECIM}`);
          const yeni = eklenen[0];
          if (yeni) {
            await tx.execute(sql`
              insert into medya.kurum_kotalari (id, kurum_id) values (${uuidv7()}, ${k.kurumId})
              on conflict (kurum_id) do nothing`);
            const ayrilan = await tx.execute(sql`
              update medya.kurum_kotalari
                 set kullanilan_bayt = kullanilan_bayt + ${g.boyut_bayt}, dosya_sayisi = dosya_sayisi + 1
               where kurum_id = ${k.kurumId} and kullanilan_bayt + ${g.boyut_bayt} <= ${kota}
               returning id`);
            if (ayrilan.length === 0) {
              throw new AppError(
                413,
                medyaHataKodlari.kotaAsildi,
                'Depolama kotanız doldu. Yer açmak için eski dosyalar silinmeli.',
              );
            }
            return { satir: yeni, yeni: true };
          }
          const [var_] = await tx.execute<DosyaSatiri>(sql`
            select ${SECIM} from medya.dosyalar
             where kurum_id = ${k.kurumId} and sahip_kullanici_id = ${k.kullaniciId}
               and istemci_anahtari = ${g.istemci_anahtari}`);
          if (!var_) throw new AppError(409, errorCodes.conflict, 'Kayıt çakıştı, tekrar deneyin.');
          if (
            var_.tur !== g.tur ||
            (var_.durum === 'yukleme_bekliyor' && var_.mime_tipi !== g.mime_tipi) ||
            var_.bildirilen_boyut_bayt !== g.boyut_bayt ||
            var_.bildirilen_sha256 !== g.sha256
          ) {
            throw new AppError(
              409,
              medyaHataKodlari.istemciAnahtariCakisti,
              'Bu istemci anahtarı farklı bir dosya için kullanılmış.',
            );
          }
          return { satir: var_, yeni: false };
        });

        const { satir } = sonuc;
        let yukleme = null;
        if (satir.durum === 'yukleme_bekliyor') {
          if (!satir.yukleme_gecerli) {
            throw new AppError(
              409,
              medyaHataKodlari.yuklemeSuresiDoldu,
              'Yükleme süresi doldu. Yeni bir istemci anahtarıyla yeniden başlayın.',
            );
          }
          yukleme = await yuklemeAdresi(satir, dep);
        }
        return reply.status(sonuc.yeni ? 201 : 200).send({ dosya: ozet(satir), yukleme });
      },
    );

    app.post(
      '/v1/dosyalar/:id/tamam',
      {
        schema: {
          tags: ['medya'],
          summary:
            'Yukleme bitti bildirimi: nesneyi HEAD ile dogrular (boyut, icerik turu), `yuklendi` yapar ve isleme kuyruguna alir. Idempotent. Nesne henuz yoksa 409 `yukleme_bulunamadi` (PUT bitince tekrar denenir).',
          params: medyaDosyaParamSema,
          response: { 202: medyaDosyaDurumYanitiSema },
        },
      },
      async (request, reply) => {
        const dep = depolamaGerekli();
        const k = kimlik(request);
        const { id } = request.params;
        const satir = await withTenant(db, ctx(k), async (tx) => {
          const [d] = await tx.execute<DosyaSatiri>(sql`
            select ${SECIM} from medya.dosyalar
             where id = ${id} and sahip_kullanici_id = ${k.kullaniciId} for update`);
          if (!d) throw new AppError(404, errorCodes.notFound, 'Dosya bulunamadı.');
          return d;
        });
        if (satir.durum !== 'yukleme_bekliyor') {
          return reply.status(202).send(await durumYaniti(satir, dep, db, k));
        }
        const bilgi = await dep.bilgi(yuklemeAnahtari(satir.depolama_anahtari ?? ''));
        if (!bilgi) {
          throw new AppError(
            409,
            medyaHataKodlari.yuklemeBulunamadi,
            'Yüklenen dosya henüz bulunamadı. Yükleme bitince tekrar deneyin.',
          );
        }
        const boyutOk = bilgi.boyutBayt === satir.bildirilen_boyut_bayt;
        const mimeOk = !bilgi.mime || bilgi.mime.split(';')[0]?.trim() === satir.mime_tipi;
        const sonuc = await withTenant(db, ctx(k), async (tx) => {
          if (!boyutOk || !mimeOk) {
            await dosyayiBasarisizYap(
              tx,
              { id, kurum_id: k.kurumId, sahip_kullanici_id: k.kullaniciId, tur: satir.tur },
              boyutOk ? 'mime_uyusmazligi' : 'boyut_uyusmazligi',
            );
          } else {
            await tx.execute(sql`
              update medya.dosyalar
                 set durum = 'yuklendi', tamamlandi_at = now(), boyut_bayt = ${bilgi.boyutBayt}
               where id = ${id} and durum = 'yukleme_bekliyor'`);
          }
          const [d] = await tx.execute<DosyaSatiri>(sql`select ${SECIM} from medya.dosyalar where id = ${id}`);
          return d ?? satir;
        });
        if (!boyutOk || !mimeOk) {
          throw new AppError(
            422,
            boyutOk ? medyaHataKodlari.mimeUyusmazligi : medyaHataKodlari.boyutUyusmazligi,
            'Yüklenen dosya bildirilenle uyuşmuyor.',
          );
        }
        return reply.status(202).send(await durumYaniti(sonuc, dep, db, k));
      },
    );

    app.get(
      '/v1/dosyalar/:id',
      {
        schema: {
          tags: ['medya'],
          summary:
            'Sahibine dosya durumu; `hazir` ise 10 dk gecerli presigned GET adresleri (asil, kucuk, orta). Baskasinin dosyasi api araciligiyla `/ic/okuma-adresleri` ile alinir.',
          params: medyaDosyaParamSema,
          response: { 200: medyaDosyaDurumYanitiSema },
        },
      },
      async (request) => {
        const dep = depolamaGerekli();
        const k = kimlik(request);
        const satir = await withTenant(db, ctx(k), async (tx) => {
          const [d] = await tx.execute<DosyaSatiri>(sql`
            select ${SECIM} from medya.dosyalar
             where id = ${request.params.id} and sahip_kullanici_id = ${k.kullaniciId}`);
          return d;
        });
        if (!satir) throw new AppError(404, errorCodes.notFound, 'Dosya bulunamadı.');
        return durumYaniti(satir, dep, db, k);
      },
    );

    app.post(
      '/ic/okuma-adresleri',
      {
        config: { servisScope: MEDYA_OKUMA_SCOPE },
        schema: {
          tags: ['ic'],
          summary:
            'Ic uc (servis JWT, `scope=medya.okuma`): kurumdaki hazir dosyalar icin 10 dk presigned GET adresleri. Kurumda olmayan/hazir olmayan/silinmis dosyalar yanitta yer almaz.',
          body: medyaOkumaAdresleriIstegiSema,
          response: { 200: medyaOkumaAdresleriYanitiSema },
        },
      },
      async (request) => {
        const dep = depolamaGerekli();
        const { kurum_id, dosya_idleri } = request.body;
        const idler = [...new Set(dosya_idleri)];
        const satirlar = await withTenant(db, { kurumId: kurum_id }, async (tx) => {
          const dosyalar = await tx.execute<
            DosyaSatiri & { sure_sn: number | null; depolama_anahtari: string }
          >(sql`
            select ${SECIM} from medya.dosyalar
             where kurum_id = ${kurum_id} and durum = 'hazir' and depolama_anahtari is not null
               and id = any(${idlerDizisi(idler)})`);
          const varyantlar = await tx.execute<{
            dosya_id: string;
            varyant: 'kucuk' | 'orta';
            depolama_anahtari: string;
          }>(sql`
            select dosya_id, varyant, depolama_anahtari from medya.kucuk_resimler
             where kurum_id = ${kurum_id} and dosya_id = any(${idlerDizisi(idler)})`);
          return { dosyalar, varyantlar };
        });
        const bitis = new Date(simdi().getTime() + MEDYA_OKUMA_ADRESI_OMRU_SN * 1000).toISOString();
        const adresler = await Promise.all(
          satirlar.dosyalar.map(async (d) => {
            const v = (ad: 'kucuk' | 'orta') =>
              satirlar.varyantlar.find((x) => x.dosya_id === d.id && x.varyant === ad);
            const url = async (anahtar: string | undefined) =>
              anahtar ? dep.okumaAdresi(anahtar, MEDYA_OKUMA_ADRESI_OMRU_SN) : null;
            return {
              dosya_id: d.id,
              mime_tipi: d.mime_tipi,
              asil_url: await dep.okumaAdresi(d.depolama_anahtari, MEDYA_OKUMA_ADRESI_OMRU_SN),
              kucuk_url: await url(v('kucuk')?.depolama_anahtari),
              orta_url: await url(v('orta')?.depolama_anahtari),
              genislik: d.genislik,
              yukseklik: d.yukseklik,
              sure_sn: d.sure_sn,
              gecerlilik_bitis_at: bitis,
            };
          }),
        );
        return { adresler };
      },
    );
  };
}

/** uuid[] parametresi. */
function idlerDizisi(idler: readonly string[]) {
  return sql`${`{${idler.join(',')}}`}::uuid[]`;
}

async function durumYaniti(
  d: DosyaSatiri,
  dep: Depolama,
  db: Pick<Database, 'orm'>,
  k: ReturnType<typeof kimlik>,
) {
  let adresler = null;
  if (d.durum === 'hazir' && d.depolama_anahtari) {
    const varyantlar = await withTenant(db, ctx(k), (tx) =>
      tx.execute<{ varyant: 'kucuk' | 'orta'; depolama_anahtari: string }>(sql`
        select varyant, depolama_anahtari from medya.kucuk_resimler where dosya_id = ${d.id}`),
    );
    const omur = MEDYA_OKUMA_ADRESI_OMRU_SN;
    const al = (ad: 'kucuk' | 'orta') => {
      const v = varyantlar.find((x) => x.varyant === ad);
      return v ? dep.okumaAdresi(v.depolama_anahtari, omur) : Promise.resolve(null);
    };
    adresler = {
      asil_url: await dep.okumaAdresi(d.depolama_anahtari, omur),
      kucuk_url: await al('kucuk'),
      orta_url: await al('orta'),
      gecerlilik_bitis_at: new Date(Date.now() + omur * 1000).toISOString(),
    };
  }
  return {
    id: d.id,
    tur: d.tur,
    durum: d.durum,
    mime_tipi: d.mime_tipi,
    boyut_bayt: d.boyut_bayt,
    genislik: d.genislik,
    yukseklik: d.yukseklik,
    sure_sn: d.sure_sn,
    hata_kodu: (d.hata_kodu as never) ?? null,
    adresler,
  };
}
