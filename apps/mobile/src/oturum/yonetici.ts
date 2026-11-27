import type { Adaptorler } from '../api/adaptorler';
import {
  apiHatasiMi,
  type KvkkDurumu,
  type Kullanici,
  type ModulDurumu,
  type MobilRol,
  type Uyelik,
  type UyelikBaglami,
} from '../api/tipler';
import { depoOlustur } from '../lib/store';
import type { AnlikDeposu, OturumAnligi } from './anlik';

export interface AktifBaglam {
  uyelik: Uyelik & { rol: MobilRol };
  moduller: ModulDurumu;
  vurgu: string | null;
}

export type OturumDurumu =
  | { asama: 'baslatiliyor' }
  | { asama: 'cikis' }
  | {
      asama: 'giris';
      kullanici: Kullanici;
      /** Yalnizca mobil arayuzu olan roller (veli elenir). */
      uyelikler: (Uyelik & { rol: MobilRol })[];
      kvkk: KvkkDurumu;
      aktif: AktifBaglam | null;
    };

export function mobilUyelikMi(u: Uyelik): u is Uyelik & { rol: MobilRol } {
  return u.rol !== 'veli';
}

export function kvkkOnayliMi(k: KvkkDurumu): boolean {
  return k.kabulEdilenSurum === k.guncelSurum;
}

export interface OturumYoneticisiBagimliliklari {
  adaptorler: Adaptorler;
  /** Cikista kisisel verili onbellekleri temizler. */
  temizle?: () => void;
  /** Kullanici bilerek cikis yaptiginda (401 ile oturum dusmesi degil) cagrilir. */
  kullaniciCikisi?: () => void;
  /**
   * Cikista sunucuya `auth.cikis` gitmeden once beklenir (belirtec hala gecerliyken: ornegin push
   * cihaz kaydinin silinmesi). Hata cikisi engellemez.
   */
  cikisOncesi?: () => Promise<void>;
  /**
   * Oturum anligi deposu (bkz. `anlik.ts`): varsa soguk acilista ilk durum ag beklenmeden anliktan
   * kurulur ve sunucu dogrulamasi arka planda yapilir.
   */
  anlik?: AnlikDeposu;
}

/**
 * Oturum durum makinesi. Ekran yonlendirmesi bu durumdan turetilir (Stack.Protected):
 * cikis -> giris | kvkk onayi -> kurum secimi -> uygulama.
 */
export function oturumYoneticisiOlustur({
  adaptorler,
  temizle,
  kullaniciCikisi,
  cikisOncesi,
  anlik,
}: OturumYoneticisiBagimliliklari) {
  const depo = depoOlustur<OturumDurumu>({ asama: 'baslatiliyor' });
  const { auth } = adaptorler;

  /** Durum degisince anligi esler: yalniz KVKK onayli `giris` yazilir; digerlerinde silinir. */
  if (anlik) {
    depo.abone(() => {
      const d = depo.al();
      if (d.asama === 'baslatiliyor') return;
      if (d.asama === 'giris' && kvkkOnayliMi(d.kvkk)) {
        anlik.yaz({
          kullanici: { id: d.kullanici.id, adSoyad: d.kullanici.adSoyad },
          uyelikler: d.uyelikler,
          kvkkSurum: d.kvkk.guncelSurum,
          aktif: d.aktif
            ? {
                uyelikId: d.aktif.uyelik.uyelikId,
                moduller: d.aktif.moduller,
                vurgu: d.aktif.vurgu,
              }
            : null,
        });
      } else {
        anlik.sil();
      }
    });
  }

  /** Anliktan ilk durum: ag yok. `aktif` yoksa kurum secimine gider. */
  function anliktanKur(a: OturumAnligi): void {
    const aktifUyelik = a.aktif ? a.uyelikler.find((u) => u.uyelikId === a.aktif?.uyelikId) : null;
    if (a.aktif && aktifUyelik) {
      auth.etkinBaglamiAyarla({ kurumId: aktifUyelik.kurumId, uyelikId: aktifUyelik.uyelikId });
    }
    depo.ayarla(() => ({
      asama: 'giris',
      kullanici: { id: a.kullanici.id, adSoyad: a.kullanici.adSoyad, telefon: '' },
      uyelikler: a.uyelikler,
      kvkk: { guncelSurum: a.kvkkSurum, kabulEdilenSurum: a.kvkkSurum, metinler: [] },
      aktif:
        a.aktif && aktifUyelik
          ? { uyelik: aktifUyelik, moduller: a.aktif.moduller, vurgu: a.aktif.vurgu }
          : null,
    }));
  }

  let tazeleme: Promise<void> = Promise.resolve();

  /** Anliktan acilista sunucu dogrulamasi (arka plan): durumu sunucuyla esler. */
  async function tazele(): Promise<void> {
    try {
      const bilgi = await auth.oturumBilgisi();
      const d = depo.al();
      if (d.asama !== 'giris') return;
      const uyelikler = bilgi.uyelikler.filter(mobilUyelikMi);
      depo.ayarla({ kullanici: bilgi.kullanici, uyelikler, kvkk: bilgi.kvkk });
      const onceki = d.aktif;
      if (!onceki) return;
      // Yeni KVKK metni ya da kalkmis uyelik: etkin baglam birakilir (kurum secimi/KVKK ekrani).
      if (
        !kvkkOnayliMi(bilgi.kvkk) ||
        !uyelikler.some((u) => u.uyelikId === onceki.uyelik.uyelikId)
      ) {
        depo.ayarla({ aktif: null });
        return;
      }
      const b = await auth.uyelikSec(onceki.uyelik.uyelikId);
      if (!mobilUyelikMi(b.uyelik) || depo.al().asama !== 'giris') return;
      depo.ayarla({ aktif: { uyelik: b.uyelik, moduller: b.moduller, vurgu: b.vurgu } });
    } catch (e) {
      if (apiHatasiMi(e) && e.kod === 'yetkisiz') {
        temizle?.();
        depo.ayarla(() => ({ asama: 'cikis' }));
      } else if (apiHatasiMi(e) && e.kod === 'riza_gerekli') {
        depo.ayarla((onceki) =>
          onceki.asama === 'giris'
            ? {
                ...onceki,
                kvkk: { ...onceki.kvkk, kabulEdilenSurum: null, metinler: [] },
                aktif: null,
              }
            : onceki,
        );
      }
      // Ag/sunucu hatasi: anlik durum korunur (cevrimdisi acilis); sorgular kendi hatasini gosterir.
    }
  }

  async function yukle(): Promise<void> {
    const bilgi = await auth.oturumBilgisi();
    depo.ayarla(() => ({
      asama: 'giris',
      kullanici: bilgi.kullanici,
      uyelikler: bilgi.uyelikler.filter(mobilUyelikMi),
      kvkk: bilgi.kvkk,
      aktif: null,
    }));
  }

  return {
    depo,
    /** Acilista kayitli oturumu geri yukler. */
    async baslat() {
      // Hizli yol: anlik + cihazda belirtec varsa agi beklemeden ac, dogrulamayi arka planda yap.
      const a = anlik?.oku() ?? null;
      if (a) {
        if (await auth.oturumVarMi().catch(() => false)) {
          anliktanKur(a);
          tazeleme = tazele();
          return;
        }
        anlik?.sil();
      }
      try {
        await yukle();
      } catch {
        depo.ayarla(() => ({ asama: 'cikis' }));
      }
    },
    /** Anliktan acilista arka plan dogrulamasinin bitmesini bekler (testler icin). */
    tazeleBitti: () => tazeleme,
    /** OTP dogrulandiktan sonra cagrilir. */
    async girisTamamlandi() {
      await yukle();
    },
    /** Onay bekleyen metinleri sunucudan okuyup durumdaki `kvkk.metinler`e yazar. */
    async kvkkMetinleriYukle() {
      const d0 = depo.al();
      if (d0.asama !== 'giris') return;
      const metinler = await auth.kvkkMetinleri();
      const d = depo.al();
      if (d.asama !== 'giris') return;
      depo.ayarla({ kvkk: { ...d.kvkk, metinler } });
    },
    async kvkkKabulEt() {
      const d = depo.al();
      if (d.asama !== 'giris') return;
      await auth.kvkkKabulEt(d.kvkk.guncelSurum);
      depo.ayarla({ kvkk: { ...d.kvkk, kabulEdilenSurum: d.kvkk.guncelSurum } });
    },
    /** Sunucu `riza_gerekli` (403) dondurdugunde KVKK ekranina geri dondurur. */
    rizaGerekli() {
      const d = depo.al();
      if (d.asama !== 'giris') return;
      // Metinler bayat olabilir (yeni surum): ekran taze okusun.
      depo.ayarla({ kvkk: { ...d.kvkk, kabulEdilenSurum: null, metinler: [] }, aktif: null });
    },
    async uyelikSec(uyelikId: string) {
      const d = depo.al();
      if (d.asama !== 'giris') return;
      const b: UyelikBaglami = await auth.uyelikSec(uyelikId);
      if (!mobilUyelikMi(b.uyelik)) return;
      const onceki = d.aktif;
      depo.ayarla({ aktif: { uyelik: b.uyelik, moduller: b.moduller, vurgu: b.vurgu } });
      // Soguk acilista (`aktif` bos) kalici sorgu onbellegi silinmez: anahtarlar uyelik kapsamlidir,
      // cikis ve `kurumDegistir` zaten temizler. Boylece Bugun onbellekten hemen dolar. Yalniz bir
      // uyelikten digerine dogrudan gecis onbellegi sifirlar.
      if (onceki && onceki.uyelik.uyelikId !== b.uyelik.uyelikId) temizle?.();
    },
    kurumDegistir() {
      if (depo.al().asama !== 'giris') return;
      depo.ayarla({ aktif: null });
      temizle?.();
    },
    /** Davet/sinif kodu sonrasi yeni uyelikleri okur; etkin kurum ve KVKK durumu korunur. */
    async uyelikleriYenile() {
      const bilgi = await auth.oturumBilgisi();
      const d = depo.al();
      if (d.asama !== 'giris') return;
      depo.ayarla({ kullanici: bilgi.kullanici, uyelikler: bilgi.uyelikler.filter(mobilUyelikMi) });
    },
    /** Kendi gorunen adini kaydeder; durumdaki kullanici adini gunceller. */
    async adGuncelle(ad: string) {
      const yeni = await adaptorler.hesap.adGuncelle(ad);
      const d = depo.al();
      if (d.asama !== 'giris') return;
      depo.ayarla({ kullanici: { ...d.kullanici, adSoyad: yeni } });
    },
    /**
     * Sunucu bu cihazin oturumunu zaten kapatti (Oturumlarim'dan sonlandirma); adaptor yerel
     * belirteci sildi. Yalnizca yerel durumu ve onbellegi sifirlar, sunucuya cikis istegi atmaz.
     */
    kendiOturumuKapandi() {
      temizle?.();
      depo.ayarla(() => ({ asama: 'cikis' }));
    },
    async cikis() {
      await cikisOncesi?.().catch(() => undefined);
      kullaniciCikisi?.();
      try {
        await auth.cikis();
      } finally {
        temizle?.();
        depo.ayarla(() => ({ asama: 'cikis' }));
      }
    },
    /** 401 -> oturumu kapat; 403 riza_gerekli -> KVKK. Sorgu/mutasyon hatalarindan cagrilir. */
    hataIsle(e: unknown) {
      if (!apiHatasiMi(e)) return;
      if (e.kod === 'yetkisiz') depo.ayarla(() => ({ asama: 'cikis' }));
      else if (e.kod === 'riza_gerekli') this.rizaGerekli();
    },
  };
}

export type OturumYoneticisi = ReturnType<typeof oturumYoneticisiOlustur>;
