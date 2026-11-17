import { YenidenDene } from '@kopru/service-kit';
import { sql } from 'drizzle-orm';

import { kurumDurumu, yeniId, type Islem } from './ortak.js';
import {
  SablonHatasi,
  sablonlar as varsayilanSablonlar,
  sablonuCoz,
  type CozulmusSablon,
  type SablonDegiskenleri,
  type SablonKaydi,
} from './sablonlar.js';
import {
  ayarlariOku,
  kanalAcikMi,
  sessizSaatKarari,
  tercihleriOku,
  yerelParcalar,
  yerelden,
} from './tercih.js';

/**
 * Bildirim uretim hatti (cekirdek, olaydan bagimsiz):
 *
 *   olay -> kategori -> sablon -> alici (uyelik) -> `bildirimler` satiri (kutu)
 *        -> tercih + kurum durumu + cihaz + gunluk ust sinir + sessiz saat suzgeci -> `gonderimler` (push)
 *
 * Idempotenttir: `UNIQUE (kurum_id, alici_id, tekil_anahtar)`; ayni olayin ikinci kez gelmesi (ya da ayni
 * `tekilAnahtar`) yeni bildirim ve gonderim uretmez. Olaya ozel eslemeler `eslemeler/` altindadir ve yalniz
 * bu fonksiyonu cagirir.
 */

/** Ogrenci basina yerel gunluk push ust siniri (`sistem` kategorisi haric). */
export const GUNLUK_PUSH_SINIRI = 5;
/** Sessiz saat ertelemesi bu sureyi asarsa push `atlandi (bayat)` olur. */
export const BAYAT_ESIGI_MS = 12 * 60 * 60 * 1000;
/** Kullanici baglamli (tum kullanici) atlama satirlarinin `hedef_anahtar` degeri. */
export const KULLANICI_HEDEFI = '-';

export type AtlamaNedeni =
  'tercih' | 'sessiz_saat' | 'kota' | 'cihaz_yok' | 'kurum_askida' | 'bayat';

export interface BildirimGirdisi {
  kurumId: string;
  /** `hesap.uyelikler.id` listesi (kutu bildirimi uyelik basinadir). */
  aliciUyelikIdleri: readonly string[];
  sablonKodu: string;
  /** Yalniz bunlarla doldurulur (eksik yer tutucu kalici hata). Push metnine kisisel veri koymayin. */
  degiskenler: SablonDegiskenleri;
  /** Nesne kimlikleri (`bildirimler.veri`). */
  veri?: Readonly<Record<string, unknown>>;
  kaynakOlayId: string;
  /** `{sablon_kodu}:{ozne_id}[:{ek}]`; alici basina benzersizlik (kurum, alici, anahtar). */
  tekilAnahtar: string;
  /** Bu andan sonra kutuda gizlenir. */
  gecerlilikBitisAt?: Date;
  /**
   * `true`: sessiz saate denk gelen push ertelenmez, `atlandi (sessiz_saat)` olur (ders baslangicina 30 dk
   * kalmis hatirlatma gibi; `sistem` kategorisi her zaman boyledir).
   */
  ertelenemez?: boolean;
}

export interface UretimSecenekleri {
  /** Testler icin saat. */
  simdi?: Date;
  /** Testler icin sablon kaydi. */
  sablonlar?: SablonKaydi;
  gunlukPushSiniri?: number;
}

export interface PushSonucu {
  durum: 'beklemede' | 'ertelendi' | 'atlandi';
  atlamaNedeni?: AtlamaNedeni;
  /** Yazilan `gonderimler` satiri sayisi (cihaz basina bir). */
  satir: number;
  zamanlananAt?: Date;
}

export interface AliciSonucu {
  aliciId: string;
  sonuc: 'uretildi' | 'tekrar' | 'uyelik_aktif_degil';
  bildirimId?: string;
  push?: PushSonucu;
}

interface UyelikSatiri extends Record<string, unknown> {
  kullanici_id: string;
  rol: string;
  durum: string;
}

export async function bildirimUret(
  tx: Islem,
  girdi: BildirimGirdisi,
  secenek: UretimSecenekleri = {},
): Promise<AliciSonucu[]> {
  const simdi = secenek.simdi ?? new Date();
  const kayit = secenek.sablonlar ?? varsayilanSablonlar;
  const etiket = girdi.sablonKodu;

  const kutu = kayit.bul(girdi.sablonKodu, 'kutu');
  if (!kutu) throw new SablonHatasi(`${etiket}: kutu şablonu yok`);
  const pushSablon = kayit.bul(girdi.sablonKodu, 'push');
  if (pushSablon) {
    // Kod guvencesi (veritabani CHECK'inin ikincisi): kisisel veri iceren sablon push'a gidemez.
    if (pushSablon.kisiselVeri) {
      throw new SablonHatasi(`${etiket}: kişisel veri içeren şablon push'ta kullanılamaz`);
    }
    if (pushSablon.kategori !== kutu.kategori) {
      throw new SablonHatasi(`${etiket}: kutu ve push şablonlarının kategorisi farklı`);
    }
  }
  const kutuMetni = sablonuCoz(kutu, girdi.degiskenler);
  const pushMetni = pushSablon ? sablonuCoz(pushSablon, girdi.degiskenler) : null;
  const kurumDurum = await kurumDurumu(tx, girdi.kurumId);
  const sinir = secenek.gunlukPushSiniri ?? GUNLUK_PUSH_SINIRI;

  const sonuclar: AliciSonucu[] = [];
  // Sirali alici islemesi: ayni kullanici icin kilit sirasi deterministik (kilitlenme riski yok).
  for (const aliciId of [...new Set(girdi.aliciUyelikIdleri)].sort()) {
    const [u] = await tx.execute<UyelikSatiri>(sql`
      select kullanici_id, rol, durum from bildirim.uyelik_kopyalari
       where uyelik_id = ${aliciId} and kurum_id = ${girdi.kurumId}`);
    if (!u) throw new YenidenDene(`alıcı üyelik kopyası henüz yok (${aliciId})`);
    if (u.durum !== 'aktif') {
      sonuclar.push({ aliciId, sonuc: 'uyelik_aktif_degil' });
      continue;
    }

    // Kullanici basina islem kilidi: gunluk ust sinir sayimi yarisa girmez.
    await tx.execute(sql`select pg_advisory_xact_lock(727004, hashtext(${u.kullanici_id}))`);

    const bildirimId = yeniId();
    const [yazilan] = await tx.execute<{ id: string }>(sql`
      insert into bildirim.bildirimler
        (id, kurum_id, alici_id, kategori, sablon_kodu, baslik, govde, derin_baglanti, veri,
         kaynak_olay_id, tekil_anahtar, gecerlilik_bitis_at, created_at)
      values (${bildirimId}, ${girdi.kurumId}, ${aliciId}, ${kutu.kategori}, ${girdi.sablonKodu},
              ${kutuMetni.baslik}, ${kutuMetni.govde}, ${kutuMetni.derinBaglanti},
              ${JSON.stringify(girdi.veri ?? {})}::jsonb, ${girdi.kaynakOlayId}, ${girdi.tekilAnahtar},
              ${girdi.gecerlilikBitisAt?.toISOString() ?? null}::timestamptz, ${simdi.toISOString()}::timestamptz)
      on conflict (kurum_id, alici_id, tekil_anahtar) do nothing
      returning id`);
    if (!yazilan) {
      sonuclar.push({ aliciId, sonuc: 'tekrar' });
      continue;
    }

    const sonuc: AliciSonucu = { aliciId, sonuc: 'uretildi', bildirimId };
    if (pushMetni) {
      sonuc.push = await pushPlanla(tx, {
        kurumId: girdi.kurumId,
        kurumDurum,
        bildirimId,
        kullaniciId: u.kullanici_id,
        rol: u.rol,
        kategori: kutu.kategori,
        sablonKodu: girdi.sablonKodu,
        metin: pushMetni,
        simdi,
        sinir,
        ertelenemez: girdi.ertelenemez ?? false,
      });
    }
    sonuclar.push(sonuc);
  }
  return sonuclar;
}

interface PushBaglami {
  kurumId: string;
  kurumDurum: string;
  bildirimId: string;
  kullaniciId: string;
  rol: string;
  kategori: string;
  sablonKodu: string;
  metin: CozulmusSablon;
  simdi: Date;
  sinir: number;
  ertelenemez: boolean;
}

/** Kullanicinin etkin cihazlari: `cihazlar` RLS'i kullanici kollu, bu yuzden kisa sureligine baglam ayarlanir. */
async function etkinCihazlar(tx: Islem, kullaniciId: string): Promise<string[]> {
  const [onceki] = await tx.execute<{ v: string }>(
    sql`select coalesce(current_setting('app.kullanici_id', true), '') as v`,
  );
  await tx.execute(sql`select set_config('app.kullanici_id', ${kullaniciId}, true)`);
  const satirlar = await tx.execute<{ id: string }>(sql`
    select id from bildirim.cihazlar where aktif and gecersiz_at is null order by id`);
  await tx.execute(sql`select set_config('app.kullanici_id', ${onceki?.v ?? ''}, true)`);
  return satirlar.map((s) => s.id);
}

async function pushPlanla(tx: Islem, b: PushBaglami): Promise<PushSonucu> {
  const sistem = b.kategori === 'sistem';
  const atla = async (neden: AtlamaNedeni): Promise<PushSonucu> => {
    await gonderimYaz(tx, b, {
      hedef: KULLANICI_HEDEFI,
      durum: 'atlandi',
      atlamaNedeni: neden,
      zamanlananAt: b.simdi,
    });
    return { durum: 'atlandi', atlamaNedeni: neden, satir: 1 };
  };

  if (b.kurumDurum !== 'aktif') return atla('kurum_askida');

  const kayitli = await tercihleriOku(tx, b.kullaniciId, b.kurumId);
  if (!kanalAcikMi(kayitli, b.kategori as Parameters<typeof kanalAcikMi>[1], 'push')) {
    return atla('tercih');
  }

  const cihazlar = await etkinCihazlar(tx, b.kullaniciId);
  if (cihazlar.length === 0) return atla('cihaz_yok');

  const ayar = await ayarlariOku(tx, b.kullaniciId, b.kurumId);

  if (!sistem && b.rol === 'ogrenci') {
    const y = yerelParcalar(b.simdi, ayar.saat_dilimi);
    const gunBasi = yerelden(y.yil, y.ay, y.gun, 0, ayar.saat_dilimi);
    const gunSonu = yerelden(y.yil, y.ay, y.gun + 1, 0, ayar.saat_dilimi);
    const [say] = await tx.execute<{ n: number }>(sql`
      select count(distinct g.bildirim_id)::int as n
        from bildirim.gonderimler g
        join bildirim.bildirimler bl on bl.kurum_id = g.kurum_id and bl.id = g.bildirim_id
                                    and bl.kategori <> 'sistem'
       where g.alici_kullanici_id = ${b.kullaniciId} and g.kanal = 'push' and g.durum <> 'atlandi'
         and g.created_at >= ${gunBasi.toISOString()}::timestamptz
         and g.created_at < ${gunSonu.toISOString()}::timestamptz`);
    if ((say?.n ?? 0) >= b.sinir) return atla('kota');
  }

  let durum: 'beklemede' | 'ertelendi' = 'beklemede';
  let zamanlananAt = b.simdi;
  const sessiz = sessizSaatKarari(b.simdi, ayar);
  if (sessiz.sessiz) {
    // `sistem` ve ertelenemez bildirimler sessiz saati delmez: ertelenmez, atlanir (dokuman).
    if (sistem || b.ertelenemez) return atla('sessiz_saat');
    if (sessiz.bitisAt.getTime() - b.simdi.getTime() > BAYAT_ESIGI_MS) return atla('bayat');
    durum = 'ertelendi';
    zamanlananAt = sessiz.bitisAt;
  }

  for (const cihazId of cihazlar) {
    await gonderimYaz(tx, b, { hedef: cihazId, durum, zamanlananAt });
  }
  return { durum, satir: cihazlar.length, zamanlananAt };
}

async function gonderimYaz(
  tx: Islem,
  b: PushBaglami,
  g: {
    hedef: string;
    durum: 'beklemede' | 'ertelendi' | 'atlandi';
    atlamaNedeni?: AtlamaNedeni;
    zamanlananAt: Date;
  },
): Promise<void> {
  const push = g.durum !== 'atlandi';
  await tx.execute(sql`
    insert into bildirim.gonderimler
      (id, kurum_id, bildirim_id, alici_kullanici_id, kanal, sablon_kodu, hedef_anahtar, durum,
       atlama_nedeni, zamanlanan_at, baslik, govde, derin_baglanti, created_at)
    values (${yeniId()}, ${b.kurumId}, ${b.bildirimId}, ${b.kullaniciId}, 'push', ${b.sablonKodu},
            ${g.hedef}, ${g.durum}, ${g.atlamaNedeni ?? null}, ${g.zamanlananAt.toISOString()}::timestamptz,
            ${push ? b.metin.baslik : null}, ${push ? b.metin.govde : null},
            ${push ? b.metin.derinBaglanti : null}, ${b.simdi.toISOString()}::timestamptz)
    on conflict (bildirim_id, kanal, hedef_anahtar) where bildirim_id is not null do nothing`);
}
