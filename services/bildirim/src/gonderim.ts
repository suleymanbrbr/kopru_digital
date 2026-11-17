import type { Database } from '@kopru/service-kit';
import { sql } from 'drizzle-orm';

import { iso } from './ortak.js';
import type { PushMesaji, PushSaglayici } from './push/saglayici.js';
import { BAYAT_ESIGI_MS } from './uretim.js';

/**
 * `gonderim.isle`: bekleyen push gonderimlerini isler (worker, `bildirim_sistem`: BYPASSRLS; kurumlar arasi).
 *
 * - `durum IN ('beklemede','ertelendi') AND zamanlanan_at <= simdi` satirlari `FOR UPDATE SKIP LOCKED` ile
 *   cekilir (coklu worker guvenli); gonderim ayni islemde yapilir, sonuc ayni islemde yazilir.
 * - Gecici hata: `deneme_sayisi + 1`, ustel bekleme 1 / 5 / 30 / 120 dk; 5. denemede `basarisiz`.
 * - Kalici hata: `basarisiz`; `DeviceNotRegistered` ise cihaz `aktif = false`, `gecersiz_at` dolar.
 * - Cihaz silinmis/pasifse `atlandi (cihaz_yok)`; planlanandan 12 saati asan gecikme `atlandi (bayat)`.
 * - Garanti: en az bir kez. Gonderim basarili olup commit oncesi surec cokerse ayni push tekrar gidebilir.
 */

export const GONDERIM_AZAMI_DENEME = 5;
/** Basarisiz denemeden sonraki bekleme (dk): 1. hata 1 dk, 2. hata 5 dk, 3. hata 30 dk, 4. hata 120 dk. */
export const GONDERIM_BEKLEME_DK: readonly number[] = [1, 5, 30, 120];
export const GONDERIM_PAKET = 100;

export interface GonderimBagimliliklari {
  db: Pick<Database, 'orm'>;
  saglayici: PushSaglayici;
  simdi?: () => Date;
  paket?: number;
}

export interface GonderimOzeti {
  secilen: number;
  gonderildi: number;
  yenidenDenecek: number;
  basarisiz: number;
  atlandi: number;
}

interface BekleyenSatir extends Record<string, unknown> {
  id: string;
  bildirim_id: string | null;
  alici_kullanici_id: string;
  deneme_sayisi: number;
  zamanlanan_at: string;
  baslik: string | null;
  govde: string | null;
  derin_baglanti: string | null;
  cihaz_id: string | null;
  push_belirteci: string | null;
  platform: 'ios' | 'android' | 'web' | null;
  aktif: boolean | null;
  gecersiz_at: string | null;
}

const zaman = (d: Date) => d.toISOString();

export async function gonderimIsle(b: GonderimBagimliliklari): Promise<GonderimOzeti> {
  const simdi = (b.simdi ?? (() => new Date()))();
  const ozet: GonderimOzeti = {
    secilen: 0,
    gonderildi: 0,
    yenidenDenecek: 0,
    basarisiz: 0,
    atlandi: 0,
  };

  await b.db.orm.transaction(async (tx) => {
    const satirlar = await tx.execute<BekleyenSatir>(sql`
      select g.id, g.bildirim_id, g.alici_kullanici_id, g.deneme_sayisi::int as deneme_sayisi,
             ${iso('g.zamanlanan_at')} as zamanlanan_at, g.baslik, g.govde, g.derin_baglanti,
             c.id as cihaz_id, c.push_belirteci, c.platform, c.aktif, c.gecersiz_at::text as gecersiz_at
        from bildirim.gonderimler g
        left join bildirim.cihazlar c on c.id::text = g.hedef_anahtar
       where g.kanal = 'push' and g.durum in ('beklemede', 'ertelendi')
         and g.zamanlanan_at <= ${zaman(simdi)}::timestamptz
       order by g.zamanlanan_at, g.id
       limit ${b.paket ?? GONDERIM_PAKET}
         for update of g skip locked`);
    ozet.secilen = satirlar.length;
    if (satirlar.length === 0) return;

    const atla = async (id: string, neden: 'bayat' | 'cihaz_yok') => {
      ozet.atlandi += 1;
      await tx.execute(sql`
        update bildirim.gonderimler set durum = 'atlandi', atlama_nedeni = ${neden}
         where id = ${id}`);
    };

    const gonderilecek: { satir: BekleyenSatir; mesaj: PushMesaji }[] = [];
    for (const s of satirlar) {
      if (simdi.getTime() - new Date(s.zamanlanan_at).getTime() > BAYAT_ESIGI_MS) {
        await atla(s.id, 'bayat');
      } else if (!s.cihaz_id || !s.aktif || s.gecersiz_at || !s.push_belirteci || !s.platform) {
        await atla(s.id, 'cihaz_yok');
      } else {
        gonderilecek.push({
          satir: s,
          mesaj: {
            gonderimId: s.id,
            belirtec: s.push_belirteci,
            platform: s.platform,
            title: s.baslik ?? '',
            body: s.govde ?? '',
            data: { derin_baglanti: s.derin_baglanti, bildirim_id: s.bildirim_id },
          },
        });
      }
    }
    if (gonderilecek.length === 0) return;

    // iOS rozeti: kullanicinin tum kurumlardaki okunmamis (gecerli) bildirim sayisi.
    const iosKullanicilar = [
      ...new Set(
        gonderilecek
          .filter((g) => g.mesaj.platform === 'ios')
          .map((g) => g.satir.alici_kullanici_id),
      ),
    ];
    const rozetler = new Map<string, number>();
    if (iosKullanicilar.length > 0) {
      const sayilar = await tx.execute<{ kullanici_id: string; n: number }>(sql`
        select u.kullanici_id, count(*)::int as n
          from bildirim.bildirimler bl
          join bildirim.uyelik_kopyalari u on u.uyelik_id = bl.alici_id
         where u.kullanici_id in (${sql.join(
           iosKullanicilar.map((k) => sql`${k}::uuid`),
           sql`, `,
         )})
           and bl.okundu_at is null and bl.arsivlendi_at is null
           and (bl.gecerlilik_bitis_at is null or bl.gecerlilik_bitis_at > ${zaman(simdi)}::timestamptz)
         group by u.kullanici_id`);
      for (const r of sayilar) rozetler.set(r.kullanici_id, r.n);
    }
    for (const g of gonderilecek) {
      if (g.mesaj.platform === 'ios') {
        g.mesaj.badge = rozetler.get(g.satir.alici_kullanici_id) ?? 0;
      }
    }

    const sonuclar = await b.saglayici.gonder(gonderilecek.map((g) => g.mesaj));
    for (const [i, g] of gonderilecek.entries()) {
      const sonuc = sonuclar[i] ?? { tur: 'gecici', kod: 'sonuc_yok' };
      const deneme = g.satir.deneme_sayisi + 1;
      if (sonuc.tur === 'gonderildi') {
        ozet.gonderildi += 1;
        await tx.execute(sql`
          update bildirim.gonderimler
             set durum = 'gonderildi', saglayici = ${b.saglayici.ad},
                 saglayici_mesaj_id = ${sonuc.mesajId ?? null}, gonderildi_at = ${zaman(simdi)}::timestamptz,
                 deneme_sayisi = ${deneme}, hata_kodu = null
           where id = ${g.satir.id}`);
      } else if (sonuc.tur === 'kalici') {
        ozet.basarisiz += 1;
        await tx.execute(sql`
          update bildirim.gonderimler
             set durum = 'basarisiz', saglayici = ${b.saglayici.ad}, hata_kodu = ${sonuc.kod},
                 deneme_sayisi = ${deneme}
           where id = ${g.satir.id}`);
        if (sonuc.cihazGecersiz && g.satir.cihaz_id) {
          await tx.execute(sql`
            update bildirim.cihazlar set aktif = false, gecersiz_at = ${zaman(simdi)}::timestamptz
             where id = ${g.satir.cihaz_id}`);
        }
      } else if (deneme >= GONDERIM_AZAMI_DENEME) {
        ozet.basarisiz += 1;
        await tx.execute(sql`
          update bildirim.gonderimler
             set durum = 'basarisiz', saglayici = ${b.saglayici.ad}, hata_kodu = ${sonuc.kod},
                 deneme_sayisi = ${deneme}
           where id = ${g.satir.id}`);
      } else {
        ozet.yenidenDenecek += 1;
        const bekleme = GONDERIM_BEKLEME_DK[deneme - 1] ?? GONDERIM_BEKLEME_DK.at(-1) ?? 120;
        const sonraki = new Date(simdi.getTime() + bekleme * 60_000);
        await tx.execute(sql`
          update bildirim.gonderimler
             set durum = 'beklemede', saglayici = ${b.saglayici.ad}, hata_kodu = ${sonuc.kod},
                 deneme_sayisi = ${deneme}, zamanlanan_at = ${zaman(sonraki)}::timestamptz
           where id = ${g.satir.id}`);
      }
    }
  });
  return ozet;
}
