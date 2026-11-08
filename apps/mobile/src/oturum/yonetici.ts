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
}

/**
 * Oturum durum makinesi. Ekran yonlendirmesi bu durumdan turetilir (Stack.Protected):
 * cikis -> giris | kvkk onayi -> kurum secimi -> uygulama.
 */
export function oturumYoneticisiOlustur({
  adaptorler,
  temizle,
  kullaniciCikisi,
}: OturumYoneticisiBagimliliklari) {
  const depo = depoOlustur<OturumDurumu>({ asama: 'baslatiliyor' });
  const { auth } = adaptorler;

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
      try {
        await yukle();
      } catch {
        depo.ayarla(() => ({ asama: 'cikis' }));
      }
    },
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
      depo.ayarla({ aktif: { uyelik: b.uyelik, moduller: b.moduller, vurgu: b.vurgu } });
      temizle?.();
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
    /**
     * Sunucu bu cihazin oturumunu zaten kapatti (Oturumlarim'dan sonlandirma); adaptor yerel
     * belirteci sildi. Yalnizca yerel durumu ve onbellegi sifirlar, sunucuya cikis istegi atmaz.
     */
    kendiOturumuKapandi() {
      temizle?.();
      depo.ayarla(() => ({ asama: 'cikis' }));
    },
    async cikis() {
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
