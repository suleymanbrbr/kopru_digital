import type { BildirimAdapter } from '../api/bildirimTipleri';
import type { KvDepo } from '../depo/kv';
import { depoOlustur, type Depo } from '../lib/store';
import { kvkkOnayliMi, type OturumYoneticisi } from '../oturum/yonetici';
import { baglantiRotasi, type BildirimRotasi, type BildirimYuku } from './baglanti';
import type { IzinDurumu, PushPlatformu } from './platform';

export type KayitDurumu = 'yok' | 'kayitli' | 'belirtecYok' | 'basarisiz';

export interface BildirimDurumu {
  /** `bilinmiyor`: sistem izni henuz okunmadi. */
  izin: IzinDurumu | 'bilinmiyor';
  /** Izin kartinin ertelenme zamani (epoch ms); kalici. */
  ertelendi: number | null;
  kayit: KayitDurumu;
  /** Uygulama ondeyken gelen son bildirim (uygulama ici afis). `anahtar` her bildirimde degisir. */
  afis: { anahtar: number; yuk: BildirimYuku } | null;
}

export interface BildirimYoneticisiBagimliliklari {
  platform: PushPlatformu;
  bildirim: () => BildirimAdapter;
  oturum: OturumYoneticisi;
  depo: KvDepo;
  yeniId: () => string;
  uygulamaSurumu?: string;
  /** Yalniz gelistirme: gercek belirtec yerine sahte belirtecle kayit (bkz. `ortam.pushSahte`). */
  sahteBelirtec?: boolean;
  /** Bildirim verisi degisti (okundu, yeni bildirim): sorgu onbellegi ve rozet tazelenir. */
  degisti?: () => void;
  simdi?: () => number;
}

const ANAHTAR_CIHAZ = 'kopru.bildirim.cihaz';
const ANAHTAR_ERTELENDI = 'kopru.bildirim.kartErtelendi';
const GUN = 24 * 60 * 60 * 1000;
/** "Simdi degil" sonrasi izin karti ne zaman tekrar gorunur (izin hic sorulmadiysa / reddedildiyse). */
export const ERTELEME_MS = { verilmedi: 3 * GUN, reddedildi: 14 * GUN } as const;
/** Dokunulan bildirimin hedefi, oturum hazir olana kadar bu sure bekler; sonra atilir. */
const HEDEF_OMRU_MS = 5 * 60 * 1000;
/** Basarili kayittan sonra one gelince yeniden kayit icin gecmesi gereken sure. */
const YENIDEN_KAYIT_MS = 6 * 60 * 60 * 1000;
const KAYIT_ZAMAN_ASIMI_MS = 8000;

export function sahteBelirtecUret(cihazKimligi: string): string {
  return `ExponentPushToken[sahte-${cihazKimligi}]`;
}

/** Izin karti: sorulmadiysa ya da reddedildiyse, ertelenme suresi dolduysa gorunur. */
export function izinKartiGorunurMu(d: BildirimDurumu, simdi: number): boolean {
  if (d.izin === 'bilinmiyor' || d.izin === 'verildi') return false;
  if (d.ertelendi === null) return true;
  return simdi - d.ertelendi >= ERTELEME_MS[d.izin];
}

interface BekleyenHedef {
  yuk: BildirimYuku;
  zaman: number;
}

/**
 * Push kaydi, izin, bildirime dokunma ve uygulama ici afis.
 *
 * - Izin ilk acilista ISTENMEZ: Bugun'deki aciklama kartindan (`izinIste`) istenir.
 * - Kayit: giris + KVKK + kurum secimi tamamlaninca (kullanici basina bir kez) ve belirtec degisince
 *   `PUT cihazlar`. Belirtec alinamazsa (simulator, EAS projesi yok) kayit atlanir, hata gosterilmez.
 * - Cikis: `cikis()` cihaz kaydini siler (oturum belirteci henuz gecerliyken).
 * - Dokunma: hedef oturum hazir olunca (kurum secili) `yonlendir`e verilir ve bildirim okundu yapilir.
 */
export function bildirimYoneticisiOlustur(b: BildirimYoneticisiBagimliliklari) {
  const simdi = b.simdi ?? (() => Date.now());
  const durum: Depo<BildirimDurumu> = depoOlustur<BildirimDurumu>({
    izin: 'bilinmiyor',
    ertelendi: Number(b.depo.getString(ANAHTAR_ERTELENDI)) || null,
    kayit: 'yok',
    afis: null,
  });
  let yonlendir: ((rota: BildirimRotasi) => void) | null = null;
  let bekleyen: BekleyenHedef | null = null;
  let isleniyor = false;
  let afisSayac = 0;
  /** Bu surecte kaydi yapilmis kullanici ve zaman (cikista/kullanici degisince sifirlanir). */
  let kayitliKullanici: string | null = null;
  let sonKayit = 0;
  let kaydediliyor = false;
  /** Kayit surerken zorunlu bir istek geldi (belirtec degisti, izin verildi): bitince yinelenir. */
  let tekrarIstendi = false;
  const gorulenler = new Set<string>();

  function cihazKimligi(): string {
    let id = b.depo.getString(ANAHTAR_CIHAZ);
    if (!id) {
      id = b.yeniId();
      b.depo.set(ANAHTAR_CIHAZ, id);
    }
    return id;
  }

  function hazirBaglam() {
    const o = b.oturum.depo.al();
    if (o.asama !== 'giris' || !kvkkOnayliMi(o.kvkk) || !o.aktif) return null;
    return { o, aktif: o.aktif };
  }

  async function izinOku(): Promise<IzinDurumu> {
    const izin = await b.platform.izinDurumu();
    durum.ayarla({ izin });
    return izin;
  }

  /** Belirtec alip cihazi kaydeder. Hata yutulur; durum `kayit` alaninda gorunur. */
  async function kaydol(zorla = false): Promise<void> {
    const h = hazirBaglam();
    if (!h) return;
    if (kaydediliyor) {
      if (zorla) tekrarIstendi = true;
      return;
    }
    const kullaniciId = h.o.kullanici.id;
    if (!zorla && kayitliKullanici === kullaniciId && simdi() - sonKayit < YENIDEN_KAYIT_MS) return;
    kaydediliyor = true;
    try {
      const izin = await izinOku();
      if (izin !== 'verildi') return;
      const kimlik = cihazKimligi();
      const belirtec = b.sahteBelirtec ? sahteBelirtecUret(kimlik) : await b.platform.belirtecAl();
      if (!belirtec) {
        durum.ayarla({ kayit: 'belirtecYok' });
        return;
      }
      await b.bildirim().cihazKaydet({
        platform: b.platform.os,
        push_belirteci: belirtec,
        cihaz_kimligi: kimlik,
        ...(b.uygulamaSurumu ? { uygulama_surumu: b.uygulamaSurumu } : {}),
        dil: 'tr',
      });
      kayitliKullanici = kullaniciId;
      sonKayit = simdi();
      durum.ayarla({ kayit: 'kayitli' });
    } catch {
      durum.ayarla({ kayit: 'basarisiz' });
    } finally {
      kaydediliyor = false;
    }
    if (tekrarIstendi) {
      tekrarIstendi = false;
      await kaydol(true);
    }
  }

  async function hedefiIsle(): Promise<void> {
    if (isleniyor || !bekleyen || !yonlendir) return;
    if (simdi() - bekleyen.zaman > HEDEF_OMRU_MS) {
      bekleyen = null;
      return;
    }
    let h = hazirBaglam();
    if (!h) return;
    isleniyor = true;
    const { yuk } = bekleyen;
    try {
      // Bildirim baska bir kurumun ise (veri kurum kimligi tasiyorsa) o kuruma gecilir.
      if (yuk.kurumId && yuk.kurumId !== h.aktif.uyelik.kurumId) {
        const hedef = h.o.uyelikler.find((u) => u.kurumId === yuk.kurumId);
        if (hedef) {
          await b.oturum.uyelikSec(hedef.uyelikId);
          h = hazirBaglam();
          if (!h) return;
        }
      }
      bekleyen = null;
      const rota = baglantiRotasi(yuk.derinBaglanti, {
        rol: h.aktif.uyelik.rol,
        moduller: h.aktif.moduller,
      });
      yonlendir(rota);
      if (yuk.bildirimId) {
        // Okundu isareti en iyi caba: hata (cevrimdisi, 404) gezinmeyi etkilemez.
        void b
          .bildirim()
          .okundu(yuk.bildirimId)
          .catch(() => undefined)
          .finally(() => {
            b.degisti?.();
          });
      }
    } catch {
      // Kurum gecisi basarisiz: hedef bekler, sonraki durum degisiminde yeniden denenir.
    } finally {
      isleniyor = false;
    }
  }

  function dokunuldu(yuk: BildirimYuku, kimlik?: string): void {
    if (kimlik) {
      if (gorulenler.has(kimlik)) return;
      gorulenler.add(kimlik);
    }
    bekleyen = { yuk, zaman: simdi() };
    void hedefiIsle();
  }

  return {
    durum,
    cihazKimligi,

    /** Dinleyicileri baglar; temizleyici dondurur (UygulamaSaglayicilari). */
    baslat(): () => void {
      void izinOku();
      const kapat = [
        b.platform.gelenDinle((yuk) => {
          durum.ayarla({ afis: { anahtar: ++afisSayac, yuk } });
          b.degisti?.();
        }),
        b.platform.dokunmaDinle((yuk, kimlik) => {
          dokunuldu(yuk, kimlik);
        }),
        b.platform.belirtecDegisinceDinle(() => {
          void kaydol(true);
        }),
        b.oturum.depo.abone(() => {
          const o = b.oturum.depo.al();
          // Cikis ya da baska kullanici: kayit bilgisi sifirlanir.
          if (o.asama !== 'giris') {
            kayitliKullanici = null;
            durum.ayarla({ kayit: 'yok' });
          }
          void kaydol();
          void hedefiIsle();
        }),
      ];
      void kaydol();
      return () => {
        kapat.forEach((f) => {
          f();
        });
      };
    },

    /** Navigasyon baglayicisi (kok duzen). Bekleyen hedef varsa hemen islenir. */
    yonlendirmeBagla(f: (rota: BildirimRotasi) => void): () => void {
      yonlendir = f;
      void hedefiIsle();
      return () => {
        if (yonlendir === f) yonlendir = null;
      };
    },

    /** Uygulama one gelince: izin degismis olabilir (ayarlardan acildi); kayit tazelenir. */
    async onePlana(): Promise<void> {
      await izinOku();
      await kaydol();
    },

    /** Bugun'deki aciklama kartinda "Bildirimleri ac": sistem izni istenir, verilirse kayit yapilir. */
    async izinIste(): Promise<IzinDurumu> {
      const once = await izinOku();
      // Reddedilmis izin sistem penceresiyle yeniden istenemez; ayarlara yonlendirilir.
      if (once === 'reddedildi') {
        await b.platform.ayarlariAc();
        return once;
      }
      const izin = await b.platform.izinIste();
      durum.ayarla({ izin });
      if (izin === 'verildi') await kaydol(true);
      return izin;
    },

    ayarlariAc: () => b.platform.ayarlariAc(),

    /** "Simdi degil": kart bir sure gizlenir (kalici). */
    kartiErtele(): void {
      const an = simdi();
      b.depo.set(ANAHTAR_ERTELENDI, String(an));
      durum.ayarla({ ertelendi: an });
    },

    /** Cikista cagrilir (oturum belirteci hala gecerliyken). Hata cikisi engellemez. */
    async cikis(): Promise<void> {
      kayitliKullanici = null;
      bekleyen = null;
      durum.ayarla({ kayit: 'yok', afis: null });
      await b.platform.rozetAyarla(0);
      // Oturum yoksa silinecek yetki de yoktur (sunucu oturum dusunce cihaz el degistirir).
      if (b.oturum.depo.al().asama !== 'giris') return;
      let zamanlayici: ReturnType<typeof setTimeout> | undefined;
      await Promise.race([
        b
          .bildirim()
          .cihazSil(cihazKimligi())
          .catch(() => undefined),
        new Promise<void>((coz) => {
          zamanlayici = setTimeout(coz, KAYIT_ZAMAN_ASIMI_MS);
        }),
      ]);
      clearTimeout(zamanlayici);
    },

    /** Kutudaki bir ogeye dokunuldu (liste ya da afis): hedefe gider ve okundu yapar. */
    ogeyeDokunuldu(yuk: BildirimYuku): void {
      dokunuldu(yuk);
    },

    /** Uygulama ici afis kapatildi ya da suresi doldu. */
    afisKapat(anahtar?: number): void {
      const a = durum.al().afis;
      if (a && (anahtar === undefined || a.anahtar === anahtar)) durum.ayarla({ afis: null });
    },

    rozetAyarla: (sayi: number) => b.platform.rozetAyarla(sayi),
  };
}

export type BildirimYoneticisi = ReturnType<typeof bildirimYoneticisiOlustur>;
