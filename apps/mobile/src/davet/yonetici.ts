import type { HesapAdapter } from '../api/adaptorler';
import { apiHatasiMi } from '../api/tipler';
import type { DavetDeposu } from '../depo/davetDeposu';
import { depoOlustur, type Depo } from '../lib/store';
import { kvkkOnayliMi, type OturumYoneticisi } from '../oturum/yonetici';

export type DavetHatasi = 'gecersiz' | 'zaten_uye' | 'ag';

export type DavetDurumu =
  | { asama: 'yok' }
  /** Belirtec guvenli depoda; giris + KVKK tamamlanmasi bekleniyor. */
  | { asama: 'bekliyor' }
  | { asama: 'isleniyor' }
  | { asama: 'basarili'; kurumAd: string | null }
  | { asama: 'hata'; neden: DavetHatasi };

/** Saklanan davet bu sureden eskiyse atilir (davet bagli suresi 7 gun; pay birakilir). */
const SAKLAMA_MS = 14 * 24 * 60 * 60 * 1000;
/** Api sema siniri: 20-200 karakter. Belirtec URL-guvenli karakterlerden olusur. */
const BELIRTEC_DESENI = /^[A-Za-z0-9_-]{20,200}$/;

export interface DavetYoneticisiBagimliliklari {
  depo: DavetDeposu;
  hesap: HesapAdapter;
  oturum: OturumYoneticisi;
  simdi?: () => number;
}

export function belirtecGecerliMi(b: string): boolean {
  return BELIRTEC_DESENI.test(b);
}

/**
 * Davet derin baglantisi (`kopru://davet/<belirtec>`) akisi.
 *
 * - `kaydet`: belirteci guvenli depoya yazar (oturum olsa da olmasa da). Belirtec yalnizca
 *   depoda ve istek govdesinde bulunur; durumda, hata nesnesinde ya da log'da yer almaz.
 * - `baglan`: oturum durumunu izler; giris + KVKK onayi tamamlaninca daveti BIR kez kabul eder,
 *   uyelikleri yeniler ve ilgili kuruma gecer. Gecici hatada (ag/sunucu) belirtec saklanir.
 * - 410/409: belirtec silinir (tekrar denemek anlamsiz) ve aciklayici hata durumuna gecilir.
 */
export function davetYoneticisiOlustur({
  depo,
  hesap,
  oturum,
  simdi = () => Date.now(),
}: DavetYoneticisiBagimliliklari) {
  const durum: Depo<DavetDurumu> = depoOlustur<DavetDurumu>({ asama: 'yok' });
  let calisiyor = false;

  function oturumHazirMi(): boolean {
    const o = oturum.depo.al();
    return o.asama === 'giris' && kvkkOnayliMi(o.kvkk);
  }

  async function isle(): Promise<void> {
    if (calisiyor || durum.al().asama !== 'bekliyor' || !oturumHazirMi()) return;
    calisiyor = true;
    try {
      const kayit = await depo.oku();
      if (!kayit) {
        durum.ayarla(() => ({ asama: 'yok' }));
        return;
      }
      durum.ayarla(() => ({ asama: 'isleniyor' }));
      try {
        const sonuc = await hesap.davetKabul(kayit.belirtec);
        await depo.sil();
        await oturum.uyelikleriYenile();
        const o = oturum.depo.al();
        const uyelik =
          o.asama === 'giris' ? o.uyelikler.find((u) => u.uyelikId === sonuc.uyelikId) : undefined;
        // Veli gibi mobil arayuzu olmayan roller listede yoktur: yalnizca kabul edilmis olur.
        if (uyelik) await oturum.uyelikSec(uyelik.uyelikId);
        durum.ayarla(() => ({ asama: 'basarili', kurumAd: uyelik?.kurumAd ?? null }));
      } catch (e) {
        await hataIsle(e);
      }
    } finally {
      calisiyor = false;
    }
  }

  async function hataIsle(e: unknown): Promise<void> {
    if (!apiHatasiMi(e)) {
      durum.ayarla(() => ({ asama: 'hata', neden: 'ag' }));
      return;
    }
    switch (e.kod) {
      case 'davet_gecersiz':
        await depo.sil();
        durum.ayarla(() => ({ asama: 'hata', neden: 'gecersiz' }));
        return;
      case 'zaten_uye':
        await depo.sil();
        await oturum.uyelikleriYenile().catch(() => undefined);
        durum.ayarla(() => ({ asama: 'hata', neden: 'zaten_uye' }));
        return;
      case 'yetkisiz':
      case 'riza_gerekli':
        // Oturum akisi yeniden devralir (giris / KVKK); belirtec saklanir, sonra tekrar denenir.
        oturum.hataIsle(e);
        durum.ayarla(() => ({ asama: 'bekliyor' }));
        return;
      case 'izin_yok':
        await depo.sil();
        durum.ayarla(() => ({ asama: 'hata', neden: 'gecersiz' }));
        return;
      default:
        // ag, zaman_asimi, sunucu, cevrimdisi ...: belirtec saklanir, kullanici tekrar dener.
        durum.ayarla(() => ({ asama: 'hata', neden: 'ag' }));
    }
  }

  return {
    durum,

    /** Acilista saklanan davet varsa geri yukler. */
    async yukle(): Promise<void> {
      const kayit = await depo.oku();
      if (!kayit) return;
      if (simdi() - kayit.kayit > SAKLAMA_MS || !belirtecGecerliMi(kayit.belirtec)) {
        await depo.sil();
        return;
      }
      durum.ayarla(() => ({ asama: 'bekliyor' }));
      await isle();
    },

    /** Derin baglanti rotasi cagirir. Gecersiz bicimli belirtec depoya yazilmaz. */
    async kaydet(belirtec: string | undefined): Promise<void> {
      if (!belirtec || !belirtecGecerliMi(belirtec)) {
        durum.ayarla(() => ({ asama: 'hata', neden: 'gecersiz' }));
        return;
      }
      await depo.yaz({ belirtec, kayit: simdi() });
      durum.ayarla(() => ({ asama: 'bekliyor' }));
      // Kabul arka planda yurur (rota hemen kok yonlendirmeye doner); sonuc `durum`dan izlenir.
      void isle();
    },

    /** Oturum durumu degistikce (giris, KVKK, kurum secimi) bekleyen daveti dener. */
    baglan(): () => void {
      void isle();
      return oturum.depo.abone(() => {
        void isle();
      });
    },

    /** Hata ekranindan "Tekrar dene" (yalnizca gecici hatada belirtec hala saklidir). */
    async tekrarDene(): Promise<void> {
      if ((await depo.oku()) === null) {
        durum.ayarla(() => ({ asama: 'yok' }));
        return;
      }
      durum.ayarla(() => ({ asama: 'bekliyor' }));
      await isle();
    },

    /** Sonuc/hata ekranini kapatir. */
    kapat(): void {
      durum.ayarla(() => ({ asama: 'yok' }));
    },

    /** Kullanici bilerek cikis yaptiginda bekleyen davet de silinir (paylasilan cihaz). */
    async unut(): Promise<void> {
      await depo.sil();
      durum.ayarla(() => ({ asama: 'yok' }));
    },
  };
}

export type DavetYoneticisi = ReturnType<typeof davetYoneticisiOlustur>;
