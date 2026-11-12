import type { MedyaTuru } from '../api/medyaTipleri';
import type {
  CevapGirdisi,
  EkGirdisi,
  SoruAdapter,
  SoruKotasi,
  SoruTahmini,
  TakipGirdisi,
} from '../api/soruTipleri';
import { ApiHata, apiHatasiMi } from '../api/tipler';
import type { KvDepo } from '../depo/kv';
import type { KuyrukIsi, OfflineKuyruk } from '../offline/kuyruk';
import type { YuklemeKuyrugu } from './kuyruk';

export const GONDERIM_TURU = 'soru.gonder';

export type GonderimTuru = 'soru' | 'cevap' | 'takip';
export type GonderimDurumu = 'yukleniyor' | 'gonderiliyor' | 'gonderildi' | 'hata';

/** Dosya referanslari yerel ADLARLA verilir (`dosyalar` eslemesi); gonderimde dosya kimliklerine cevrilir. */
export type EkTaslagi =
  | { tur: 'fotograf'; dosya: string }
  | {
      tur: 'cizimli_fotograf';
      dosya: string;
      /** Yerel ad (henuz yuklenen soru fotografi) ya da sunucudaki dosya kimligi. */
      kaynak: string;
      cizimVerisi?: unknown;
    }
  | { tur: 'ses'; dosya: string; sureSn: number };

export type GonderimGovdesi =
  | {
      tur: 'soru';
      bransKodu: string;
      konuId?: string;
      baslik?: string;
      metin?: string;
      fotograflar: string[];
      isaretler?: { dosya: string; kaynak: string; cizimVerisi?: unknown }[];
    }
  | {
      tur: 'cevap';
      soruId: string;
      metin?: string;
      dersteKonusalim: boolean;
      ekler: EkTaslagi[];
    }
  | {
      tur: 'takip';
      soruId: string;
      metin: string;
      ekler: Exclude<EkTaslagi, { tur: 'ses' }>[];
    };

export interface GonderimSonucu {
  soruId: string;
  /** Yalniz soru: tahmini ilk cevap suresi ve kalan kota. */
  tahmin?: SoruTahmini;
  kota?: SoruKotasi;
}

export interface Gonderim {
  id: string;
  /** Hem OfflineKuyruk `istekId`si hem api `istek_id`si: tekrar denemeler ayni kaydi verir. */
  istekId: string;
  kapsam: string;
  tur: GonderimTuru;
  /** Cevap/takip icin soru kimligi. */
  hedefId: string | null;
  /** Listede gosterilen kisa baslik (ders / ogrenci). Kisisel veri icermez: yalniz yerelde durur. */
  baslik: string;
  olusturulduAt: number;
  durum: GonderimDurumu;
  /** Yerel ad -> yukleme kaydi kimligi. */
  dosyalar: Record<string, string>;
  govde: GonderimGovdesi;
  sonuc?: GonderimSonucu;
  hataKodu?: string;
  /** `kota_asildi` hatasinda: gunluk sifirlanma (ISO). */
  hataSifirlanma?: string;
}

export interface DosyaTaslagi {
  tur: MedyaTuru;
  mimeTipi: string;
  yerelUri: string;
}

interface Kalici {
  surum: 1;
  gonderimler: Gonderim[];
}

export interface GonderimSecenekleri {
  depo: KvDepo;
  yeniId: () => string;
  kapsam: () => string | null;
  yukleme: YuklemeKuyrugu;
  kuyruk: OfflineKuyruk;
  soru: () => SoruAdapter;
  /** Gonderim sonuclaninca sorgu onbellegini tazelemek icin. */
  gonderildi?: (g: Gonderim) => void;
  simdi?: () => number;
  bekle?: (ms: number) => Promise<void>;
  /** `dosya_hazir_degil` (medyadan api'ye kopya olayi) icin kisa yeniden deneme. */
  hazirDeneme?: { sayi: number; araMs: number };
  anahtar?: string;
}

const GUN_MS = 24 * 60 * 60 * 1000;
const uyu = (ms: number) =>
  new Promise<void>((coz) => {
    setTimeout(coz, ms);
  });

/**
 * "Gonder"e basilinca baslayan, ekran kapansa da suren akis:
 *  1. Dosyalar yukleme kuyruguna (kalici) girer.
 *  2. Hepsi `hazir` olunca soru/cevap/takip OfflineKuyruk'a `soru.gonder` isi olarak girer (`istek_id`
 *     ile; yeniden deneme ayni kaydi verir, kota ikinci kez harcanmaz).
 *  3. Is basarili olunca gonderim `gonderildi` olur (tahmini sure ve kalan kota ile).
 * Kalici hata (4xx) `OfflineKuyruk.basarisiz` listesine DUSMEZ (orada ders adiyla gosterilirdi): gonderim
 * `hata` olur ve kullanici "Yeniden dene" / "Vazgec" ile karar verir.
 */
export class GonderimYoneticisi {
  private durum: Kalici;
  private readonly dinleyiciler = new Set<() => void>();
  private readonly anahtar: string;
  private ilerliyor = false;
  private tekrar = false;

  constructor(private readonly sec: GonderimSecenekleri) {
    this.anahtar = sec.anahtar ?? 'kopru.gonderim.v1';
    this.durum = this.oku();
    sec.kuyruk.kaydet(GONDERIM_TURU, (is) => this.isle(is));
    sec.yukleme.abone(() => {
      this.ilerlet();
    });
  }

  private simdi() {
    return this.sec.simdi?.() ?? Date.now();
  }

  private oku(): Kalici {
    const bos: Kalici = { surum: 1, gonderimler: [] };
    const ham = this.sec.depo.getString(this.anahtar);
    if (!ham) return bos;
    try {
      const v = JSON.parse(ham) as Partial<Kalici>;
      return v.surum === 1 && Array.isArray(v.gonderimler)
        ? { surum: 1, gonderimler: v.gonderimler }
        : bos;
    } catch {
      return bos;
    }
  }

  private yaz() {
    this.sec.depo.set(this.anahtar, JSON.stringify(this.durum));
    this.dinleyiciler.forEach((d) => {
      d();
    });
  }

  private degistir(id: string, degisim: Partial<Gonderim>): Gonderim | undefined {
    let sonuc: Gonderim | undefined;
    this.durum = {
      ...this.durum,
      gonderimler: this.durum.gonderimler.map((g) => {
        if (g.id !== id) return g;
        sonuc = { ...g, ...degisim };
        return sonuc;
      }),
    };
    if (sonuc) this.yaz();
    return sonuc;
  }

  abone(dinleyici: () => void): () => void {
    this.dinleyiciler.add(dinleyici);
    return () => {
      this.dinleyiciler.delete(dinleyici);
    };
  }

  liste(): readonly Gonderim[] {
    return this.durum.gonderimler;
  }

  al(id: string): Gonderim | undefined {
    return this.durum.gonderimler.find((g) => g.id === id);
  }

  /**
   * Gonderimi baslatir: dosyalari yukleme kuyruguna alir ve kaydi kalici yazar. Donus aninda ekran
   * kapatilabilir; geri kalani kuyruk ve yonetici yurutur.
   */
  async baslat(girdi: {
    tur: GonderimTuru;
    hedefId?: string;
    baslik: string;
    govde: GonderimGovdesi;
    dosyalar: Record<string, DosyaTaslagi>;
  }): Promise<Gonderim> {
    const eslem: Record<string, string> = {};
    for (const [ad, d] of Object.entries(girdi.dosyalar)) {
      eslem[ad] = (await this.sec.yukleme.ekle(d)).id;
    }
    const g: Gonderim = {
      id: this.sec.yeniId(),
      istekId: this.sec.yeniId(),
      kapsam: this.sec.kapsam() ?? '',
      tur: girdi.tur,
      hedefId: girdi.hedefId ?? null,
      baslik: girdi.baslik,
      olusturulduAt: this.simdi(),
      durum: 'yukleniyor',
      dosyalar: eslem,
      govde: girdi.govde,
    };
    this.durum = { ...this.durum, gonderimler: [...this.durum.gonderimler, g] };
    this.yaz();
    this.ilerlet();
    return g;
  }

  /** `yukleniyor` gonderimlerde dosya durumuna bakar: hepsi hazirsa isi kuyruga alir, biri hatadaysa durur. */
  ilerlet(): void {
    if (this.ilerliyor) {
      this.tekrar = true;
      return;
    }
    this.ilerliyor = true;
    try {
      const kapsam = this.sec.kapsam();
      for (const g of this.durum.gonderimler) {
        if (g.durum !== 'yukleniyor' || g.kapsam !== kapsam) continue;
        const kayitlar = Object.values(g.dosyalar).map((id) => this.sec.yukleme.al(id));
        const hatali = kayitlar.find((k) => k?.durum === 'hata');
        if (hatali || kayitlar.some((k) => !k)) {
          this.degistir(g.id, { durum: 'hata', hataKodu: hatali?.hataKodu ?? 'dosya_yok' });
        } else if (kayitlar.every((k) => k?.durum === 'hazir')) {
          this.degistir(g.id, { durum: 'gonderiliyor' });
          this.sec.kuyruk.ekle(GONDERIM_TURU, { gonderimId: g.id }, { istekId: g.istekId });
          void this.sec.kuyruk.bosalt();
        }
      }
    } finally {
      this.ilerliyor = false;
      if (this.tekrar) {
        this.tekrar = false;
        this.ilerlet();
      }
    }
  }

  /** Hatadaki gonderimi yeniden dener: hatali dosyalar bastan yuklenir; is kuyruga yeniden girer. */
  yenidenDene(id: string) {
    const g = this.al(id);
    if (g?.durum !== 'hata') return;
    for (const yid of Object.values(g.dosyalar)) this.sec.yukleme.yenidenDene(yid);
    this.degistir(id, { durum: 'yukleniyor', hataKodu: undefined, hataSifirlanma: undefined });
    void this.sec.yukleme.calistir();
    this.ilerlet();
  }

  /** Gonderimden vazgecer: kayit, bekleyen is ve yerel dosyalar silinir. */
  async vazgec(id: string) {
    const g = this.al(id);
    if (!g) return;
    this.sec.kuyruk.sil(g.istekId);
    this.durum = { ...this.durum, gonderimler: this.durum.gonderimler.filter((x) => x.id !== id) };
    this.yaz();
    await Promise.all(Object.values(g.dosyalar).map((y) => this.sec.yukleme.sil(y)));
  }

  /** Gonderildi kayitlarini (listeden) kaldirir; 24 saati gecenler otomatik. Dosya kayitlari zaten silinir. */
  temizle(simdi = this.simdi()) {
    const kalan = this.durum.gonderimler.filter(
      (g) => g.durum !== 'gonderildi' || simdi - g.olusturulduAt < GUN_MS,
    );
    if (kalan.length === this.durum.gonderimler.length) return;
    this.durum = { ...this.durum, gonderimler: kalan };
    this.yaz();
  }

  hepsiniSil() {
    this.durum = { surum: 1, gonderimler: [] };
    this.yaz();
  }

  // --- OfflineKuyruk isleyicisi -----------------------------------------------------------

  private dosyaKimligi(g: Gonderim, ad: string): string {
    const k = this.sec.yukleme.al(g.dosyalar[ad] ?? '');
    if (!k?.dosyaId)
      throw new ApiHata('cakisma', 'Dosya hazir degil', { ayrinti: 'dosya_hazir_degil' });
    return k.dosyaId;
  }

  /** `kaynak`: yerel ad (bu gonderimdeki fotograf) ya da sunucu dosya kimligi. */
  private kaynakKimligi(g: Gonderim, kaynak: string): string {
    return g.dosyalar[kaynak] ? this.dosyaKimligi(g, kaynak) : kaynak;
  }

  private ekCevir(g: Gonderim, e: EkTaslagi): EkGirdisi {
    if (e.tur === 'fotograf') return { tur: 'fotograf', dosyaId: this.dosyaKimligi(g, e.dosya) };
    if (e.tur === 'ses')
      return { tur: 'ses', dosyaId: this.dosyaKimligi(g, e.dosya), sureSn: e.sureSn };
    return {
      tur: 'cizimli_fotograf',
      dosyaId: this.dosyaKimligi(g, e.dosya),
      kaynakDosyaId: this.kaynakKimligi(g, e.kaynak),
      ...(e.cizimVerisi ? { cizimVerisi: e.cizimVerisi } : {}),
    };
  }

  private async gonder(g: Gonderim): Promise<GonderimSonucu> {
    const soru = this.sec.soru();
    const b = g.govde;
    if (b.tur === 'soru') {
      const s = await soru.soruSor({
        bransKodu: b.bransKodu,
        ...(b.konuId ? { konuId: b.konuId } : {}),
        ...(b.baslik ? { baslik: b.baslik } : {}),
        ...(b.metin ? { metin: b.metin } : {}),
        fotograflar: b.fotograflar.map((ad) => this.dosyaKimligi(g, ad)),
        ...(b.isaretler?.length
          ? {
              isaretler: b.isaretler.map((i) => ({
                dosyaId: this.dosyaKimligi(g, i.dosya),
                kaynakDosyaId: this.kaynakKimligi(g, i.kaynak),
                ...(i.cizimVerisi ? { cizimVerisi: i.cizimVerisi } : {}),
              })),
            }
          : {}),
        istekId: g.istekId,
      });
      return { soruId: s.soru.id, tahmin: s.tahmin, kota: s.kota };
    }
    if (b.tur === 'cevap') {
      const girdi: CevapGirdisi = {
        ...(b.metin ? { metin: b.metin } : {}),
        dersteKonusalim: b.dersteKonusalim,
        ...(b.ekler.length ? { ekler: b.ekler.map((e) => this.ekCevir(g, e)) } : {}),
        istekId: g.istekId,
      };
      const s = await soru.cevapla(b.soruId, girdi);
      return { soruId: s.id };
    }
    const girdi: TakipGirdisi = {
      metin: b.metin,
      ...(b.ekler.length
        ? { ekler: b.ekler.map((e) => this.ekCevir(g, e) as Exclude<EkGirdisi, { tur: 'ses' }>) }
        : {}),
      istekId: g.istekId,
    };
    const s = await soru.takip(b.soruId, girdi);
    return { soruId: s.id };
  }

  private async isle(is: KuyrukIsi): Promise<void> {
    const { gonderimId } = is.yuk as { gonderimId: string };
    const g = this.al(gonderimId);
    if (!g || g.durum === 'gonderildi') return; // vazgecildi ya da zaten gitti
    const bekle = this.sec.bekle ?? uyu;
    const { sayi, araMs } = this.sec.hazirDeneme ?? { sayi: 8, araMs: 1500 };
    try {
      let sonuc: GonderimSonucu | undefined;
      for (let i = 0; ; i++) {
        try {
          sonuc = await this.gonder(g);
          break;
        } catch (e) {
          // Medyadan api'ye dosya kopyasi olayla gelir: kisa aralikla tekrar dene.
          if (apiHatasiMi(e) && e.ayrinti === 'dosya_hazir_degil' && i < sayi) {
            await bekle(araMs);
            continue;
          }
          throw e;
        }
      }
      this.degistir(g.id, { durum: 'gonderildi', sonuc, hataKodu: undefined });
      // Yerel dosyalar artik gerekmez (sunucuda); kayitlar silinir.
      await Promise.all(Object.values(g.dosyalar).map((y) => this.sec.yukleme.sil(y)));
      const guncel = this.al(g.id);
      if (guncel) this.sec.gonderildi?.(guncel);
    } catch (e) {
      if (apiHatasiMi(e) && e.ayrinti === 'dosya_hazir_degil') {
        throw new ApiHata('sunucu', e.message, { durum: 409, yenidenDenenebilir: true });
      }
      if (apiHatasiMi(e) && e.kod === 'cok_istek' && e.ayrinti !== 'kota_asildi') {
        throw new ApiHata('sunucu', e.message, { durum: 429, yenidenDenenebilir: true });
      }
      if (apiHatasiMi(e) && (e.yenidenDenenebilir || e.kod === 'yetkisiz')) throw e;
      // Kalici hata: kuyrukta tutma, gonderimi hataya al (kullanici karar verir).
      const detay = apiHatasiMi(e)
        ? (e.detay as { kota?: { gunluk_sifirlanma_at?: string } } | undefined)
        : undefined;
      this.degistir(g.id, {
        durum: 'hata',
        hataKodu: apiHatasiMi(e) ? (e.ayrinti ?? e.kod) : 'bilinmeyen',
        ...(detay?.kota?.gunluk_sifirlanma_at
          ? { hataSifirlanma: detay.kota.gunluk_sifirlanma_at }
          : {}),
      });
    }
  }
}

/** Soru gonderimlerinden henuz sunucuya ulasmamis olanlar (gunluk kotadan sayilir). */
export function bekleyenSoruSayisi(g: readonly Gonderim[]): number {
  return g.filter(
    (x) => x.tur === 'soru' && (x.durum === 'yukleniyor' || x.durum === 'gonderiliyor'),
  ).length;
}
