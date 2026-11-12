import { MEDYA_TUR_KURALLARI, medyaYuklemeIstegiSema, type MedyaDosyaTuru } from '@kopru/contracts';

import type { MockIstek, MockYanit } from './vekil';

/**
 * `NEXT_PUBLIC_API_MOCK=1` iken `medya` servisinin bellek ici karsiligi (`/v1/dosyalar*`). Presigned `PUT`
 * ve okuma adresleri ayni kaynaktaki `/api/medya-mock/<id>` ucunu gosterir (depolama yerine bellek);
 * isleme gecikmesi taklit edilir: `tamam` sonrasi ilk durum sorgusu `isleniyor`, sonrakiler `hazir` doner.
 * Tohum dosyalari (`ornek-*`) SVG olarak uretilir. Yalniz deneme ve e2e icindir.
 */

interface MockDosya {
  id: string;
  tur: MedyaDosyaTuru;
  mime: string;
  boyut: number;
  istemciAnahtari: string;
  bayt: Uint8Array | null;
  /** Depolamaya yazilan gercek icerik turu (PUT'taki `Content-Type`). */
  icerikTuru: string;
  durum: 'yukleme_bekliyor' | 'yuklendi' | 'hazir';
  sorgu: number;
}

const kutu = globalThis as unknown as { __kopruMedyaMock?: Map<string, MockDosya> };
const depo = (): Map<string, MockDosya> => (kutu.__kopruMedyaMock ??= new Map<string, MockDosya>());

export function medyaMockSifirla(): void {
  kutu.__kopruMedyaMock = undefined;
}

const hata = (durum: number, kod: string, mesaj: string): MockYanit => ({
  durum,
  govde: { error: { code: kod, message: mesaj } },
});

const ORNEK = /^ornek-[a-z0-9]+$/;

/** Dosya `hazir` mi? (Tohum dosyalari her zaman hazirdir.) */
export function medyaMockHazirMi(id: string): boolean {
  return ORNEK.test(id) || depo().get(id)?.durum === 'hazir';
}

export function medyaMockTur(id: string): MedyaDosyaTuru | null {
  return depo().get(id)?.tur ?? null;
}

export function medyaMockMime(id: string): string {
  if (ORNEK.test(id)) return 'image/jpeg';
  return depo().get(id)?.mime ?? 'application/octet-stream';
}

const adresKok = (kaynak: string, id: string) => `${kaynak}/api/medya-mock/${id}`;

/** Soru ekleri icin okuma adresi (`SoruOkumaAdresi`). */
export function medyaMockAdres(kaynak: string, id: string, sureSn: number | null = null) {
  const url = adresKok(kaynak, id);
  const gorsel = medyaMockMime(id).startsWith('image/');
  return {
    mime_tipi: medyaMockMime(id),
    asil_url: url,
    kucuk_url: gorsel ? url : null,
    orta_url: gorsel ? url : null,
    genislik: null,
    yukseklik: null,
    sure_sn: sureSn,
    gecerlilik_bitis_at: new Date(Date.now() + 10 * 60_000).toISOString(),
  };
}

function ozet(d: MockDosya) {
  return { id: d.id, tur: d.tur, mime_tipi: d.mime, boyut_bayt: d.boyut, durum: d.durum };
}

function durumYaniti(d: MockDosya, kaynak: string, durum: string) {
  return {
    id: d.id,
    tur: d.tur,
    durum,
    mime_tipi: d.mime,
    boyut_bayt: d.boyut,
    genislik: null,
    yukseklik: null,
    sure_sn: null,
    hata_kodu: null,
    adresler:
      durum === 'hazir'
        ? {
            asil_url: adresKok(kaynak, d.id),
            kucuk_url: d.mime.startsWith('image/') ? adresKok(kaynak, d.id) : null,
            orta_url: d.mime.startsWith('image/') ? adresKok(kaynak, d.id) : null,
            gecerlilik_bitis_at: new Date(Date.now() + 10 * 60_000).toISOString(),
          }
        : null,
  };
}

/** `/api/medya/<yol>` mock'u: `dosyalar`, `dosyalar/{id}`, `dosyalar/{id}/tamam`. */
export function medyaMock(istek: MockIstek): MockYanit {
  const kaynak = istek.kaynak ?? 'http://localhost:3000';
  const p = istek.yol.split('/');
  if (p[0] !== 'dosyalar') return hata(404, 'bulunamadi', 'Kaynak bulunamadı.');

  if (p.length === 1 && istek.yontem === 'POST') {
    const g = medyaYuklemeIstegiSema.safeParse(istek.govde);
    if (!g.success) return hata(400, 'dogrulama_hatasi', 'İstek geçersiz.');
    const kural = MEDYA_TUR_KURALLARI[g.data.tur];
    if (!(kural.izinli_mime as readonly string[]).includes(g.data.mime_tipi)) {
      return hata(422, 'mime_desteklenmiyor', 'Bu dosya türü desteklenmiyor.');
    }
    if (g.data.boyut_bayt > kural.azami_boyut_bayt) {
      return hata(413, 'dosya_cok_buyuk', 'Dosya çok büyük.');
    }
    const mevcut = [...depo().values()].find((d) => d.istemciAnahtari === g.data.istemci_anahtari);
    const d: MockDosya = mevcut ?? {
      id: crypto.randomUUID(),
      tur: g.data.tur,
      mime: g.data.mime_tipi,
      boyut: g.data.boyut_bayt,
      istemciAnahtari: g.data.istemci_anahtari,
      bayt: null,
      icerikTuru: g.data.mime_tipi,
      durum: 'yukleme_bekliyor',
      sorgu: 0,
    };
    depo().set(d.id, d);
    return {
      durum: mevcut ? 200 : 201,
      govde: {
        dosya: ozet(d),
        yukleme:
          d.durum === 'yukleme_bekliyor'
            ? {
                yontem: 'PUT',
                url: adresKok(kaynak, d.id),
                basliklar: { 'content-type': d.mime },
                gecerlilik_bitis_at: new Date(Date.now() + 15 * 60_000).toISOString(),
              }
            : null,
      },
    };
  }

  const d = p[1] ? depo().get(p[1]) : undefined;
  if (!d) return hata(404, 'bulunamadi', 'Dosya bulunamadı.');

  if (p.length === 3 && p[2] === 'tamam' && istek.yontem === 'POST') {
    if (d.durum === 'yukleme_bekliyor') {
      if (!d.bayt) return hata(409, 'yukleme_bulunamadi', 'Yüklenen dosya henüz bulunamadı.');
      d.durum = 'yuklendi';
      d.sorgu = 0;
    }
    return {
      durum: 202,
      govde: durumYaniti(d, kaynak, d.durum === 'hazir' ? 'hazir' : 'isleniyor'),
    };
  }

  if (p.length === 2 && istek.yontem === 'GET') {
    if (d.durum === 'yuklendi') {
      d.sorgu += 1;
      if (d.sorgu >= 2) d.durum = 'hazir';
    }
    return {
      durum: 200,
      govde: durumYaniti(
        d,
        kaynak,
        d.durum === 'hazir' ? 'hazir' : d.durum === 'yuklendi' ? 'isleniyor' : d.durum,
      ),
    };
  }
  return hata(404, 'bulunamadi', 'Kaynak bulunamadı.');
}

// --- Depolama taklidi (`/api/medya-mock/<id>`) ---------------------------------------------------

/** Mock presigned PUT: baytlari bellege yazar. Yalniz mock modunda yol acar. */
export function medyaMockYaz(id: string, bayt: Uint8Array, icerikTuru: string): boolean {
  const d = depo().get(id);
  if (d?.durum !== 'yukleme_bekliyor') return false;
  d.bayt = bayt;
  d.icerikTuru = icerikTuru;
  return true;
}

const SVG_RENKLERI = ['#1d4ed8', '#be123c', '#15803d'];

/** Tohum "defter sayfasi" gorseli. */
function ornekSvg(id: string): string {
  const n = Number.parseInt(id.slice(-1), 36) || 0;
  const renk = SVG_RENKLERI[n % SVG_RENKLERI.length] ?? '#1d4ed8';
  const satirlar = Array.from(
    { length: 9 },
    (_, i) =>
      `<line x1="40" y1="${String(120 + i * 56)}" x2="760" y2="${String(120 + i * 56)}" stroke="#bcd0e8" stroke-width="2"/>`,
  ).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="640" viewBox="0 0 800 640" role="img" aria-label="Örnek defter sayfası">
<rect width="800" height="640" fill="#fffdf6"/>${satirlar}
<line x1="90" y1="0" x2="90" y2="640" stroke="#e8a0a0" stroke-width="2"/>
<text x="110" y="100" font-family="Georgia, serif" font-size="34" fill="${renk}">2x + 5 = 17</text>
<text x="110" y="212" font-family="Georgia, serif" font-size="34" fill="${renk}">2x = 17 - 5</text>
<text x="110" y="268" font-family="Georgia, serif" font-size="34" fill="${renk}">2x = 12  ?</text>
<text x="110" y="380" font-family="Georgia, serif" font-size="30" fill="#555">burada takıldım</text>
</svg>`;
}

/** Mock okuma: kayitli bayt ya da tohum gorseli; yoksa `null`. */
export function medyaMockOku(id: string): { bayt: Uint8Array; tur: string } | null {
  if (ORNEK.test(id)) return { bayt: new TextEncoder().encode(ornekSvg(id)), tur: 'image/svg+xml' };
  const d = depo().get(id);
  if (!d?.bayt) return null;
  return { bayt: d.bayt, tur: d.icerikTuru.split(';')[0] ?? d.icerikTuru };
}
