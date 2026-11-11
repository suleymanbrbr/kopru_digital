import { KAYNAK_TOPLU_MAKS, type KaynakSaglayici } from '@kopru/contracts';
import { t, type MessageKey } from '@kopru/i18n';

import { saglayiciAdi, urlCoz, type UrlHatasi } from './saglayici';

import { yerelTarih, yerelUtc } from '@/lib/saat';

export type Gorunurluk = 'grup' | 'secili_ogrenciler' | 'ogretmen';

/** Yapistirilan metinden baglantilari ayirir: bosluk ve satir sonlariyla, tekrarlar atilir (sira korunur). */
export function baglantilariAyir(metin: string): string[] {
  const goruldu = new Set<string>();
  const sonuc: string[] = [];
  for (const parca of metin.split(/[\s,;]+/)) {
    const url = parca.trim();
    if (url.length === 0 || goruldu.has(url)) continue;
    goruldu.add(url);
    sonuc.push(url);
  }
  return sonuc;
}

export interface LinkEki {
  baslik?: string;
  parola?: string;
}

export interface KayitFormGirdisi {
  metin: string;
  /** Baglanti metnine gore girilen baslik ve parola. */
  ekler: Readonly<Record<string, LinkEki>>;
  /** `YYYY-MM-DD` (kurum yerel gunu), bos olabilir. */
  sonErisim: string;
  gorunurluk: Gorunurluk;
  ogrenciIdleri: readonly string[];
  konuId: string | null;
  tur?: 'kayit' | 'materyal';
  saatDilimi: string;
  /** Testler icin sabit "simdi". */
  simdi?: Date;
}

export interface FormHatalari {
  genel?: string;
  /** Baglanti metni -> hata metni. */
  linkler: Record<string, string>;
  sonErisim?: string;
  ogrenciler?: string;
}

const URL_HATA_ANAHTARI: Record<UrlHatasi, MessageKey> = {
  https: 'kayitGeriBildirim.form.hata.https',
  gecersiz: 'kayitGeriBildirim.form.hata.gecersiz',
  uzun: 'kayitGeriBildirim.form.hata.uzun',
  kullanici_bilgisi: 'kayitGeriBildirim.form.hata.kullaniciBilgisi',
};

/** Basligi bos baglantiya saglayiciya gore varsayilan ad (ayni saglayicidan birden cok varsa numaralanir). */
export function varsayilanBaslik(
  saglayici: KaynakSaglayici,
  tur: 'kayit' | 'materyal',
  sira: number,
  ayniAdAdedi: number,
): string {
  const ad = saglayiciAdi(saglayici);
  const taban =
    tur === 'kayit'
      ? t('kayitGeriBildirim.form.varsayilanKayit', { saglayici: ad })
      : t('kayitGeriBildirim.form.varsayilanMateryal', { saglayici: ad });
  return ayniAdAdedi > 1 ? `${taban} (${String(sira)})` : taban;
}

export type FormSonucu =
  { ok: true; govde: Record<string, unknown> } | { ok: false; hatalar: FormHatalari };

/** Form girdisini dogrular ve `POST .../kaynaklar` ya da `.../materyaller` govdesini uretir. */
export function kayitFormunuHazirla(g: KayitFormGirdisi): FormSonucu {
  const hatalar: FormHatalari = { linkler: {} };
  const tur = g.tur ?? 'kayit';
  const urller = baglantilariAyir(g.metin);
  if (urller.length === 0) {
    return { ok: false, hatalar: { linkler: {}, genel: t('kayitGeriBildirim.form.hata.bos') } };
  }
  if (urller.length > KAYNAK_TOPLU_MAKS) {
    return {
      ok: false,
      hatalar: {
        linkler: {},
        genel: t('kayitGeriBildirim.form.hata.cokLink', { en: KAYNAK_TOPLU_MAKS }),
      },
    };
  }
  const cozulen = urller.map((u) => ({ girdi: u, sonuc: urlCoz(u) }));
  for (const c of cozulen) {
    if (!c.sonuc.ok) hatalar.linkler[c.girdi] = t(URL_HATA_ANAHTARI[c.sonuc.hata]);
  }

  let gecerlilik: string | null = null;
  if (g.sonErisim) {
    const bugun = yerelTarih(g.simdi ?? new Date(), g.saatDilimi);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(g.sonErisim) || g.sonErisim < bugun) {
      hatalar.sonErisim = t('kayitGeriBildirim.form.hata.tarihGecmis');
    } else {
      gecerlilik = yerelUtc(g.sonErisim, '23:59', g.saatDilimi);
    }
  }
  if (g.gorunurluk === 'secili_ogrenciler' && g.ogrenciIdleri.length === 0) {
    hatalar.ogrenciler = t('kayitGeriBildirim.form.hata.ogrenciSec');
  }
  if (
    Object.keys(hatalar.linkler).length > 0 ||
    hatalar.sonErisim !== undefined ||
    hatalar.ogrenciler !== undefined
  ) {
    return { ok: false, hatalar };
  }

  const adetler = new Map<string, number>();
  for (const c of cozulen) {
    if (c.sonuc.ok) adetler.set(c.sonuc.saglayici, (adetler.get(c.sonuc.saglayici) ?? 0) + 1);
  }
  const sayac = new Map<string, number>();
  const linkler = cozulen.flatMap((c) => {
    if (!c.sonuc.ok) return [];
    const sira = (sayac.get(c.sonuc.saglayici) ?? 0) + 1;
    sayac.set(c.sonuc.saglayici, sira);
    const ek = g.ekler[c.girdi] ?? {};
    const baslik = ek.baslik?.trim();
    const parola = ek.parola?.trim();
    return [
      {
        baslik:
          baslik && baslik.length > 0
            ? baslik.slice(0, 200)
            : varsayilanBaslik(c.sonuc.saglayici, tur, sira, adetler.get(c.sonuc.saglayici) ?? 1),
        url: c.sonuc.url,
        ...(parola && c.sonuc.saglayici === 'zoom' ? { parola } : {}),
        ...(gecerlilik ? { gecerlilik_bitis_at: gecerlilik } : {}),
        ...(g.konuId ? { konu_id: g.konuId } : {}),
      },
    ];
  });
  return {
    ok: true,
    govde: {
      ...(tur === 'kayit' ? { tur: 'kayit' } : {}),
      linkler,
      gorunurluk: g.gorunurluk,
      ...(g.gorunurluk === 'secili_ogrenciler' ? { ogrenci_idleri: [...g.ogrenciIdleri] } : {}),
    },
  };
}
