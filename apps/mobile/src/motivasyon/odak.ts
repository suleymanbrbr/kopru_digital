import {
  odakAcikOturumHatasindan,
  type MotivasyonAdapter,
  type OdakBaslatGirdisi,
  type OdakBitirSonucu,
  type OdakKazanimi,
  type OdakModu,
  type OdakOturumu,
} from '../api/motivasyonTipleri';
import { ApiHata, apiHatasiMi } from '../api/tipler';
import type { KvDepo } from '../depo/kv';
import type { KuyrukIsi, OfflineKuyruk } from '../offline/kuyruk';

export const ODAK_BASLAT_TURU = 'odak.baslat';
export const ODAK_BITIR_TURU = 'odak.bitir';
const KV_ANAHTARI = 'kopru.odak.v1';

/** Planlanan sure (dk) ve mod secenekleri. 25/5 ve 50/10'da yalniz odak kismi sayilir. */
export const ODAK_MODLARI: readonly { mod: OdakModu; dk: number | null }[] = [
  { mod: '25_5', dk: 25 },
  { mod: '50_10', dk: 50 },
  { mod: 'serbest', dk: null },
];
export const ODAK_SERBEST_ENAZ_DK = 5;
export const ODAK_SERBEST_ENCOK_DK = 180;
export const ODAK_SERBEST_ADIM_DK = 5;

/** Plan gorevine "gerceklesen" yazmak icin gorevin o anki durumu. */
export interface OdakPlanGorevi {
  id: string;
  baslik: string;
  /** Gorevin gunu (`YYYY-MM-DD`). */
  gun: string;
  /** Gorevde o ana kadar yazilan dakika (gerceklesen; yoksa 0). */
  mevcutDk: number;
  bransKodu: string;
}

/** Cihazda kalici tutulan devam eden oturum. */
export interface YerelOdak {
  surum: 1;
  /** Uyelik kimligi: baska kullanicinin oturumu gosterilmez. */
  kapsam: string;
  istemciId: string;
  mod: OdakModu;
  planlananDk: number;
  /** Oturumun gercek baslangici (ISO). Sure bundan hesaplanir: ekran kapaliyken de dogru. */
  baslangicAt: string;
  bransKodu?: string;
  planGorevi?: Omit<OdakPlanGorevi, 'bransKodu'>;
  /** Baslat istegi sunucuya ulasti. */
  sunucuda: boolean;
  /** Baska cihazdan/onceki acilistan sunucudaki acik oturum devralindi. */
  devralindi?: boolean;
  /** Modul kapali: oturum yalniz cihazda sayilir (sunucuya gonderilmez, XP yok). */
  yalnizYerel?: boolean;
}

export interface OdakSonucu {
  durum: 'tamam' | 'yarida';
  /** Yerelde hesaplanan sure; sunucunun `gerceklesen_sn`i gelince onun degeri. */
  gerceklesenSn: number;
  /** Sunucu kazanimi; `null` ise henuz eslesmedi. */
  kazanim: OdakKazanimi | null;
  /** Kalici hata: sunucu oturumu kabul etmedi. */
  hata: boolean;
  planYazildi: boolean;
}

export type OdakFaz = 'bos' | 'calisiyor' | 'bitiyor' | 'bitti';

export interface OdakDurumu {
  faz: OdakFaz;
  oturum: YerelOdak | null;
  sonuc: OdakSonucu | null;
}

type BaslatYuku = Pick<
  YerelOdak,
  'istemciId' | 'mod' | 'planlananDk' | 'baslangicAt' | 'bransKodu' | 'planGorevi'
> & { cihaz?: string };

type BitirYuku = BaslatYuku & { durum: 'tamam' | 'yarida'; bitisAt: string };

export interface OdakYoneticiSecenekleri {
  depo: KvDepo;
  kuyruk: OfflineKuyruk;
  motivasyon: () => MotivasyonAdapter;
  /** Etkin uyelik kimligi; yoksa `null`. */
  kapsam: () => string | null;
  yeniId: () => string;
  cevrimiciMi: () => boolean;
  /** `oyunlastirma` acik mi: kapaliysa odak yalniz yerel sayac olarak calisir. */
  sunucu?: () => boolean;
  simdi?: () => number;
  cihaz?: string;
  /** Sunucu bitisi kabul etti (XP geri bildirimi, plan gorevi yazimi). */
  bitti?: (
    yuk: { istemciId: string; planGorevi?: BaslatYuku['planGorevi'] },
    sonuc: OdakSonucu,
  ) => void;
}

function baslatGirdisi(y: BaslatYuku, baslangicGonder: boolean): OdakBaslatGirdisi {
  return {
    istemciId: y.istemciId,
    mod: y.mod,
    planlananDk: y.planlananDk,
    ...(baslangicGonder ? { baslangicAt: y.baslangicAt } : {}),
    ...(y.bransKodu ? { bransKodu: y.bransKodu } : {}),
    ...(y.planGorevi ? { planGorevId: y.planGorevi.id } : {}),
    ...(y.cihaz ? { cihaz: y.cihaz } : {}),
  };
}

/** Gecici hata mi (yeniden denenir)? 429 de gecici sayilir. */
function gecici(e: unknown): boolean {
  return !apiHatasiMi(e) || e.yenidenDenenebilir || e.kod === 'cok_istek';
}

function acikOturumMu(e: unknown): OdakOturumu | null {
  if (!apiHatasiMi(e) || e.kod !== 'cakisma' || e.ayrinti !== 'acik_oturum_var') return null;
  return odakAcikOturumHatasindan(e.detay);
}

/**
 * Odak oturumunun istemci tarafi yonetimi.
 *
 *  - **Sure** baslangic zamanindan hesaplanir (`gecenSn`): ekran kapaliyken ya da uygulama arka
 *    plandayken de dogrudur; sayac yalniz gosterim icin saniyede bir yenilenir.
 *  - **Baslat** hemen gonderilir (hile korumasi: sunucunun gormedigi geriye donuk sure gunde en cok
 *    30 dk sayilir). Cevrimdisiysa ya da ag hatasinda `odak.baslat` isi `baslangic_at` ile kuyruga girer;
 *    istek her denemede ayni `istemci_id`yi kullanir (idempotent).
 *  - **Bitir** her zaman kendi kendine yeten bir `odak.bitir` isidir (`bitis_at` dahil); baslat isi
 *    kuyrukta bekliyorsa ondan sonra gider (sira korunur). Sunucu 404 donerse (baslat hic ulasmamis)
 *    is once baslatir sonra bitirir.
 *  - **Yeniden acilis:** devam eden oturum cihazdan okunur; baslat hic gonderilmediyse is yeniden
 *    kuyruga alinir; yerel kayit yoksa sunucudaki acik oturum devralinir.
 */
export class OdakYoneticisi {
  private durum: OdakDurumu = { faz: 'bos', oturum: null, sonuc: null };
  private readonly dinleyiciler = new Set<() => void>();

  constructor(private readonly sec: OdakYoneticiSecenekleri) {
    sec.kuyruk.kaydet(ODAK_BASLAT_TURU, (is) => this.baslatIsle(is));
    sec.kuyruk.kaydet(ODAK_BITIR_TURU, (is) => this.bitirIsle(is));
    sec.kuyruk.abone(() => {
      this.basarisizKontrol();
    });
  }

  private simdi() {
    return this.sec.simdi?.() ?? Date.now();
  }

  private faz(): OdakFaz {
    return this.durum.faz;
  }

  al(): OdakDurumu {
    return this.durum;
  }

  abone(dinleyici: () => void): () => void {
    this.dinleyiciler.add(dinleyici);
    return () => this.dinleyiciler.delete(dinleyici);
  }

  private ata(d: OdakDurumu) {
    this.durum = d;
    this.dinleyiciler.forEach((f) => {
      f();
    });
  }

  /** Oturum baslangicindan gecen saniye (>= 0). */
  gecenSn(o: Pick<YerelOdak, 'baslangicAt'>, simdi = this.simdi()): number {
    return Math.max(Math.floor((simdi - Date.parse(o.baslangicAt)) / 1000), 0);
  }

  /** Planlanan sureye kalan saniye (>= 0). */
  kalanSn(o: Pick<YerelOdak, 'baslangicAt' | 'planlananDk'>, simdi = this.simdi()): number {
    return Math.max(o.planlananDk * 60 - this.gecenSn(o, simdi), 0);
  }

  private yazKv(o: YerelOdak | null) {
    if (o) this.sec.depo.set(KV_ANAHTARI, JSON.stringify(o));
    else this.sec.depo.remove(KV_ANAHTARI);
  }

  private okuKv(): YerelOdak | null {
    const ham = this.sec.depo.getString(KV_ANAHTARI);
    if (!ham) return null;
    try {
      const v = JSON.parse(ham) as Partial<YerelOdak>;
      if (v.surum !== 1 || !v.istemciId || !v.baslangicAt || !v.planlananDk || !v.mod) return null;
      return v as YerelOdak;
    } catch {
      return null;
    }
  }

  private baslatYuku(o: YerelOdak): BaslatYuku {
    return {
      istemciId: o.istemciId,
      mod: o.mod,
      planlananDk: o.planlananDk,
      baslangicAt: o.baslangicAt,
      ...(o.bransKodu ? { bransKodu: o.bransKodu } : {}),
      ...(o.planGorevi ? { planGorevi: o.planGorevi } : {}),
      ...(this.sec.cihaz ? { cihaz: this.sec.cihaz } : {}),
    };
  }

  private baslatIsiEkle(o: YerelOdak) {
    this.sec.kuyruk.ekle(ODAK_BASLAT_TURU, this.baslatYuku(o), {
      istekId: `odak-baslat-${o.istemciId}`,
    });
    void this.sec.kuyruk.bosalt();
  }

  /** Uygulama acilisinda: yerel oturumu sürdür, yoksa sunucudaki acik oturumu devral. */
  async yukle(): Promise<void> {
    const kapsam = this.sec.kapsam();
    if (!kapsam) return;
    const yerel = this.okuKv();
    if (yerel?.kapsam === kapsam) {
      this.ata({ faz: 'calisiyor', oturum: yerel, sonuc: null });
      if (!yerel.sunucuda) {
        // Baslat ya hic gitmedi ya da yanit gelmeden uygulama oldu; ayni kimlikle idempotent.
        this.baslatIsiEkle(yerel);
      }
      return;
    }
    if (this.durum.faz !== 'bos' || !this.sec.cevrimiciMi()) return;
    if (this.sec.sunucu && !this.sec.sunucu()) return;
    // Kuyrukta bekleyen odak isi varsa sunucudaki "acik" oturum bizim bitirmek uzere oldugumuzdur.
    if (this.sec.kuyruk.bekleyenler().some((i) => i.tur.startsWith('odak.'))) return;
    try {
      const o = await this.sec.motivasyon().odakAcik();
      if (o && this.faz() === 'bos') this.devral(o, kapsam);
    } catch {
      // acik oturum okunamadi: yeni oturum baslatilirken 409 ile de ogrenilir
    }
  }

  private devral(o: OdakOturumu, kapsam: string) {
    const yerel: YerelOdak = {
      surum: 1,
      kapsam,
      istemciId: o.istemci_id,
      mod: o.planlanan_dk === 25 ? '25_5' : o.planlanan_dk === 50 ? '50_10' : 'serbest',
      planlananDk: o.planlanan_dk,
      baslangicAt: o.baslangic_at,
      ...(o.brans_kodu ? { bransKodu: o.brans_kodu } : {}),
      sunucuda: true,
      devralindi: true,
    };
    this.yazKv(yerel);
    this.ata({ faz: 'calisiyor', oturum: yerel, sonuc: null });
  }

  /** Yeni oturum baslatir; baslat istegi hemen gider. */
  async baslat(g: {
    mod: OdakModu;
    planlananDk: number;
    planGorevi?: OdakPlanGorevi;
  }): Promise<void> {
    if (this.durum.faz === 'calisiyor' || this.durum.faz === 'bitiyor') return;
    const kapsam = this.sec.kapsam();
    if (!kapsam) throw new ApiHata('yetkisiz', undefined, { durum: 401 });
    const yerel: YerelOdak = {
      surum: 1,
      kapsam,
      istemciId: this.sec.yeniId(),
      mod: g.mod,
      planlananDk: g.planlananDk,
      baslangicAt: new Date(this.simdi()).toISOString(),
      ...(g.planGorevi ? { bransKodu: g.planGorevi.bransKodu } : {}),
      ...(g.planGorevi
        ? {
            planGorevi: {
              id: g.planGorevi.id,
              baslik: g.planGorevi.baslik,
              gun: g.planGorevi.gun,
              mevcutDk: g.planGorevi.mevcutDk,
            },
          }
        : {}),
      sunucuda: false,
    };
    if (this.sec.sunucu && !this.sec.sunucu()) {
      const yalniz = { ...yerel, sunucuda: true, yalnizYerel: true };
      this.yazKv(yalniz);
      this.ata({ faz: 'calisiyor', oturum: yalniz, sonuc: null });
      return;
    }
    this.yazKv(yerel);
    this.ata({ faz: 'calisiyor', oturum: yerel, sonuc: null });
    if (!this.sec.cevrimiciMi()) {
      this.baslatIsiEkle(yerel);
      return;
    }
    try {
      await this.sec.motivasyon().odakBaslat(baslatGirdisi(this.baslatYuku(yerel), false));
      this.sunucudaIsaretle(yerel.istemciId);
    } catch (e) {
      const mevcut = acikOturumMu(e);
      if (mevcut) {
        this.devral(mevcut, kapsam);
        return;
      }
      if (gecici(e)) {
        this.baslatIsiEkle(yerel);
        return;
      }
      this.yazKv(null);
      this.ata({ faz: 'bos', oturum: null, sonuc: null });
      throw e;
    }
  }

  private sunucudaIsaretle(istemciId: string) {
    const o = this.durum.oturum;
    if (this.durum.faz !== 'calisiyor' || o?.istemciId !== istemciId || o.sunucuda) return;
    const yeni = { ...o, sunucuda: true };
    this.yazKv(yeni);
    this.ata({ ...this.durum, oturum: yeni });
  }

  /** Oturumu bitirir. Sonuc sunucudan gelince `faz: 'bitti'` olur; cevrimdisiyken `bitiyor` kalir. */
  bitir(durum: 'tamam' | 'yarida', bitisAt?: string): void {
    const o = this.durum.oturum;
    if (this.durum.faz !== 'calisiyor' || !o) return;
    const baslangic = Date.parse(o.baslangicAt);
    const bitisMs = Math.max(
      Date.parse(bitisAt ?? new Date(this.simdi()).toISOString()),
      baslangic,
    );
    const yuk: BitirYuku = {
      ...this.baslatYuku(o),
      durum,
      bitisAt: new Date(bitisMs).toISOString(),
    };
    if (o.yalnizYerel) {
      this.yazKv(null);
      this.ata({
        faz: 'bitti',
        oturum: o,
        sonuc: {
          durum,
          gerceklesenSn: Math.floor((bitisMs - baslangic) / 1000),
          kazanim: null,
          hata: false,
          planYazildi: false,
        },
      });
      return;
    }
    this.sec.kuyruk.ekle(ODAK_BITIR_TURU, yuk, { istekId: `odak-bitir-${o.istemciId}` });
    this.yazKv(null);
    this.ata({
      faz: 'bitiyor',
      oturum: o,
      sonuc: {
        durum,
        gerceklesenSn: Math.floor((bitisMs - baslangic) / 1000),
        kazanim: null,
        hata: false,
        planYazildi: false,
      },
    });
    void this.sec.kuyruk.bosalt();
  }

  /** Sonuc ekranindan yeni tura gecer. */
  yeniTur(): void {
    if (this.durum.faz === 'bitti' || this.durum.faz === 'bitiyor') {
      this.ata({ faz: 'bos', oturum: null, sonuc: null });
    }
  }

  /** Cikis / kurum degisimi: bellekteki durum ve yerel kayit atilir (kuyruk isleri kapsamli kalir). */
  sifirla(): void {
    this.yazKv(null);
    this.ata({ faz: 'bos', oturum: null, sonuc: null });
  }

  // --- Kuyruk isleyicileri --------------------------------------------------------------

  private async baslatIsle(is: KuyrukIsi): Promise<void> {
    const yuk = is.yuk as BaslatYuku;
    try {
      await this.sec.motivasyon().odakBaslat(baslatGirdisi(yuk, true));
    } catch (e) {
      const mevcut = acikOturumMu(e);
      // Ayni oturum zaten acik (onceki deneme ulasmis): basari.
      if (mevcut?.istemci_id === yuk.istemciId) {
        this.sunucudaIsaretle(yuk.istemciId);
        return;
      }
      if (apiHatasiMi(e) && e.kod === 'cok_istek') {
        throw new ApiHata('sunucu', e.message, { durum: 429, yenidenDenenebilir: true });
      }
      throw e;
    }
    this.sunucudaIsaretle(yuk.istemciId);
  }

  private async bitirIsle(is: KuyrukIsi): Promise<void> {
    const yuk = is.yuk as BitirYuku;
    const adaptor = this.sec.motivasyon();
    let sonuc: OdakBitirSonucu;
    try {
      sonuc = await adaptor.odakBitir(yuk.istemciId, yuk.durum, yuk.bitisAt);
    } catch (e) {
      if (apiHatasiMi(e) && e.kod === 'bulunamadi') {
        // Baslat sunucuya hic ulasmamis: gercek baslangicla baslat, sonra bitir.
        try {
          await adaptor.odakBaslat(baslatGirdisi(yuk, true));
        } catch (e2) {
          if (acikOturumMu(e2)?.istemci_id !== yuk.istemciId) throw this.cevir(e2);
        }
        sonuc = await adaptor.odakBitir(yuk.istemciId, yuk.durum, yuk.bitisAt);
      } else {
        throw this.cevir(e);
      }
    }
    const planYazilacak = !!yuk.planGorevi && sonuc.oturum.gerceklesen_sn >= 60;
    const odakSonucu: OdakSonucu = {
      durum: yuk.durum,
      gerceklesenSn: sonuc.oturum.gerceklesen_sn,
      kazanim: sonuc.kazanim,
      hata: false,
      planYazildi: planYazilacak,
    };
    if (this.durum.faz === 'bitiyor' && this.durum.oturum?.istemciId === yuk.istemciId) {
      this.ata({ faz: 'bitti', oturum: this.durum.oturum, sonuc: odakSonucu });
    }
    this.sec.bitti?.(
      { istemciId: yuk.istemciId, ...(yuk.planGorevi ? { planGorevi: yuk.planGorevi } : {}) },
      odakSonucu,
    );
  }

  private cevir(e: unknown): unknown {
    if (apiHatasiMi(e) && e.kod === 'cok_istek') {
      return new ApiHata('sunucu', e.message, { durum: 429, yenidenDenenebilir: true });
    }
    return e;
  }

  /** Kuyrukta kalici hataya dusen bitis isi varsa ekranda "gonderilemedi" gosterilir. */
  private basarisizKontrol() {
    const d = this.durum;
    if (d.faz !== 'bitiyor' || !d.oturum || !d.sonuc) return;
    const id = `odak-bitir-${d.oturum.istemciId}`;
    if (this.sec.kuyruk.basarisizlar().some((i) => i.istekId === id)) {
      this.ata({ ...d, faz: 'bitti', sonuc: { ...d.sonuc, hata: true } });
    }
  }
}
