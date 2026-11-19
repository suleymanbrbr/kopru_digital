import type { MockDegisiklik, MockKonu, MockSurum } from './durum';
import { durum, simdi, yeniId } from './durum';
import type { MockYanit } from './yanit';
import { dogrulamaHatasi, hata, nesne, uuidMi } from './yanit';

/**
 * `ogrenme` modulunun platform mufredat editoru uclarinin mock'u (docs/schema/api.md "Platform mufredat
 * editoru"). Adlandirma/tasima mock'ta yerinde yapilir; gercek servis eski satiri kapatip kopya acar,
 * arayuzun gordugu sekil (agac, fark, ozet) ayni.
 */

const KATALOGLAR = ['lgs', 'tyt', 'ayt', 'ydt', 'okul'] as const;
const SEVIYE_SIRA = { unite: 0, konu: 1, alt_konu: 2 } as const;

const surumOzeti = (s: MockSurum) => ({
  surum_no: s.surum_no,
  ad: s.ad,
  ...(s.aciklama ? { aciklama: s.aciklama } : {}),
  taslak: s.taslak,
  ...(s.yayinlandi_at ? { yayinlandi_at: s.yayinlandi_at } : {}),
  degisiklik_sayisi: s.degisiklikler.length,
});

function katalogOzeti(kod: string) {
  const surumler = durum().katalog[kod] ?? [];
  const taslak = surumler.find((s) => s.taslak);
  const yayinli = surumler.filter((s) => !s.taslak).map((s) => s.surum_no);
  return {
    katalog_kodu: kod,
    en_yuksek_yayinlanmis: yayinli.length > 0 ? Math.max(...yayinli) : 0,
    taslak_surum_no: taslak?.surum_no ?? null,
    surumler: [...surumler].reverse().map(surumOzeti),
  };
}

const konuCikti = (k: MockKonu) => ({
  id: k.id,
  ad: k.ad,
  brans_kodu: k.brans_kodu,
  seviye: k.seviye,
  ...(k.sinif_seviyesi === undefined ? {} : { sinif_seviyesi: k.sinif_seviyesi }),
  ...(k.kazanim_kodu ? { kazanim_kodu: k.kazanim_kodu } : {}),
  sira: k.sira,
  ...(k.ust_id ? { ust_id: k.ust_id } : {}),
  yeni: k.yeni,
  gecerli_surum_baslangic: k.gecerli_surum_baslangic,
});

const degisiklikCikti = (d: MockDegisiklik) => ({
  id: d.id,
  created_at: d.created_at,
  tur: d.tur,
  konu_id: d.konu_id,
  ...(d.hedef_konu_id ? { hedef_konu_id: d.hedef_konu_id } : {}),
  ...(d.ad_once ? { ad_once: d.ad_once } : {}),
  ...(d.ad_sonra ? { ad_sonra: d.ad_sonra } : {}),
  ayrinti: d.ayrinti,
  not: d.not,
});

function notDogrula(govde: Record<string, unknown>): string | MockYanit {
  const n = typeof govde.not === 'string' ? govde.not.trim() : '';
  if (n.length < 1 || n.length > 1000) {
    return dogrulamaHatasi({ path: 'not', message: 'Not 1 ile 1000 karakter arasında olmalı.' });
  }
  return n;
}

function altlari(konular: MockKonu[], id: string): Set<string> {
  const sonuc = new Set<string>();
  const kuyruk = [id];
  while (kuyruk.length > 0) {
    const su = kuyruk.pop();
    if (su === undefined) break;
    for (const k of konular) {
      if (k.ust_id === su && !k.kapandi && !sonuc.has(k.id)) {
        sonuc.add(k.id);
        kuyruk.push(k.id);
      }
    }
  }
  return sonuc;
}

function degisiklikYaz(s: MockSurum, d: Omit<MockDegisiklik, 'id' | 'created_at'>): MockDegisiklik {
  const kayit: MockDegisiklik = { id: yeniId(), created_at: simdi(), ...d };
  s.degisiklikler.push(kayit);
  return kayit;
}

const sonuc = (d: MockDegisiklik, k: MockKonu, kod = 200): MockYanit => ({
  durum: kod,
  govde: { degisiklik: degisiklikCikti(d), konu: konuCikti(k) },
});

function farkUret(kod: string, s: MockSurum) {
  const tur = (t: MockDegisiklik['tur']) =>
    s.degisiklikler.filter((d) => d.tur === t).map(degisiklikCikti);
  const eklenen = tur('ekle');
  const yeniden = tur('adlandir');
  const tasinan = tur('tasi');
  const birlesen = tur('birlestir');
  const kaldirilan = tur('kaldir');
  return {
    katalog_kodu: kod,
    surum: surumOzeti(s),
    eklenen,
    yeniden_adlandirilan: yeniden,
    tasinan,
    birlesen,
    kaldirilan,
    ozet: {
      eklenen: eklenen.length,
      yeniden_adlandirilan: yeniden.length,
      tasinan: tasinan.length,
      birlesen: birlesen.length,
      kaldirilan: kaldirilan.length,
    },
  };
}

export function mufredatMock(yontem: string, yol: string, govde: unknown): MockYanit {
  const parcalar = yol.split('/'); // mufredat/kataloglar/...
  if (parcalar[0] !== 'mufredat' || parcalar[1] !== 'kataloglar')
    return hata(404, 'bulunamadi', 'Kaynak bulunamadı.');

  if (parcalar.length === 2 && yontem === 'GET') {
    return { durum: 200, govde: { kataloglar: KATALOGLAR.map(katalogOzeti) } };
  }

  const kod = parcalar[2];
  if (!kod || !(KATALOGLAR as readonly string[]).includes(kod)) {
    return hata(404, 'bulunamadi', 'Katalog bulunamadı.');
  }
  const surumler = durum().katalog[kod] ?? [];
  const taslak = surumler.find((s) => s.taslak);

  // GET .../surumler/:no/(agac|fark)
  if (parcalar[3] === 'surumler' && yontem === 'GET') {
    const no = Number(parcalar[4]);
    const s = surumler.find((x) => x.surum_no === no);
    if (!s) return hata(404, 'bulunamadi', 'Sürüm bulunamadı.');
    if (parcalar[5] === 'agac') {
      return {
        durum: 200,
        govde: {
          katalog_kodu: kod,
          surum: surumOzeti(s),
          konular: s.konular.filter((k) => !k.kapandi).map(konuCikti),
        },
      };
    }
    if (parcalar[5] === 'fark') return { durum: 200, govde: farkUret(kod, s) };
    return hata(404, 'bulunamadi', 'Kaynak bulunamadı.');
  }

  if (parcalar[3] !== 'taslak' || yontem !== 'POST')
    return hata(404, 'bulunamadi', 'Kaynak bulunamadı.');
  const g = nesne(govde) ? govde : {};

  // POST .../taslak (ac)
  if (parcalar.length === 4) {
    const ad = typeof g.ad === 'string' ? g.ad.trim() : '';
    if (ad.length < 1 || ad.length > 200) {
      return dogrulamaHatasi({ path: 'ad', message: 'Ad 1 ile 200 karakter arasında olmalı.' });
    }
    if (taslak) return hata(409, 'taslak_var', 'Bu katalogda zaten açık bir taslak var.');
    const sonYayinli = [...surumler].reverse().find((s) => !s.taslak);
    const no = surumler.length > 0 ? Math.max(...surumler.map((s) => s.surum_no)) + 1 : 1;
    const yeni: MockSurum = {
      surum_no: no,
      ad,
      ...(typeof g.aciklama === 'string' && g.aciklama.trim()
        ? { aciklama: g.aciklama.trim() }
        : {}),
      taslak: true,
      konular: structuredClone((sonYayinli?.konular ?? []).filter((k) => !k.kapandi)).map((k) => ({
        ...k,
        yeni: false,
      })),
      degisiklikler: [],
    };
    (durum().katalog[kod] ??= []).push(yeni);
    return { durum: 201, govde: { katalog_kodu: kod, surum: surumOzeti(yeni) } };
  }

  if (!taslak) return hata(404, 'taslak_yok', 'Bu katalogda açık taslak yok.');

  // POST .../taslak/yayinla
  if (parcalar.length === 5 && parcalar[4] === 'yayinla') {
    if (taslak.degisiklikler.length === 0)
      return hata(409, 'degisiklik_yok', 'Yayınlanacak değişiklik yok.');
    const ozet = farkUret(kod, taslak).ozet;
    taslak.taslak = false;
    taslak.yayinlandi_at = simdi();
    taslak.konular = taslak.konular.filter((k) => !k.kapandi);
    for (const k of taslak.konular) k.yeni = false;
    return {
      durum: 200,
      govde: {
        katalog_kodu: kod,
        surum: surumOzeti(taslak),
        ozet,
        bildirilen_kurum_sayisi: durum().kurumlar.filter((k) => k.durum === 'aktif').length,
        yeniden_baglanan_kurum_konusu: 0,
      },
    };
  }

  // POST .../taslak/konular (ekle)
  if (parcalar.length === 5 && parcalar[4] === 'konular') {
    const n = notDogrula(g);
    if (typeof n !== 'string') return n;
    const ad = typeof g.ad === 'string' ? g.ad.trim() : '';
    const brans = typeof g.brans_kodu === 'string' ? g.brans_kodu.trim() : '';
    const seviye = g.seviye;
    if (ad.length < 1 || ad.length > 200) {
      return dogrulamaHatasi({ path: 'ad', message: 'Ad 1 ile 200 karakter arasında olmalı.' });
    }
    if (brans.length < 1 || brans.length > 50) {
      return dogrulamaHatasi({
        path: 'brans_kodu',
        message: 'Branş kodu 1 ile 50 karakter arasında olmalı.',
      });
    }
    if (seviye !== 'unite' && seviye !== 'konu' && seviye !== 'alt_konu') {
      return dogrulamaHatasi({ path: 'seviye', message: 'Seviye geçersiz.' });
    }
    let ust: MockKonu | undefined;
    if (g.ust_id !== undefined && g.ust_id !== null) {
      ust = taslak.konular.find((k) => k.id === g.ust_id && !k.kapandi);
      if (!ust || SEVIYE_SIRA[ust.seviye] >= SEVIYE_SIRA[seviye] || ust.brans_kodu !== brans) {
        return hata(400, 'konu_ust_gecersiz', 'Üst konu geçersiz.');
      }
    } else if (seviye !== 'unite') {
      return hata(400, 'konu_ust_gecersiz', 'Ünite dışındaki konular için üst konu gerekir.');
    }
    const yeni: MockKonu = {
      id: yeniId(),
      ad,
      brans_kodu: brans,
      seviye,
      ...(typeof g.sinif_seviyesi === 'number' ? { sinif_seviyesi: g.sinif_seviyesi } : {}),
      ...(typeof g.kazanim_kodu === 'string' && g.kazanim_kodu
        ? { kazanim_kodu: g.kazanim_kodu }
        : {}),
      sira: typeof g.sira === 'number' ? g.sira : taslak.konular.length + 1,
      ...(ust ? { ust_id: ust.id } : {}),
      yeni: true,
      kapandi: false,
      gecerli_surum_baslangic: taslak.surum_no,
    };
    taslak.konular.push(yeni);
    return sonuc(
      degisiklikYaz(taslak, { tur: 'ekle', konu_id: yeni.id, ad_sonra: ad, ayrinti: {}, not: n }),
      yeni,
      201,
    );
  }

  // POST .../taslak/konular/:id/(adlandir|tasi|birlestir|kaldir)
  if (parcalar.length === 7 && parcalar[4] === 'konular') {
    const id = parcalar[5];
    const islem = parcalar[6];
    if (!uuidMi(id)) return hata(404, 'bulunamadi', 'Konu bulunamadı.');
    const konu = taslak.konular.find((k) => k.id === id && !k.kapandi);
    if (!konu) return hata(404, 'bulunamadi', 'Konu bulunamadı.');
    const n = notDogrula(g);
    if (typeof n !== 'string') return n;

    if (islem === 'adlandir') {
      const ad = typeof g.ad === 'string' ? g.ad.trim() : '';
      if (ad.length < 1 || ad.length > 200) {
        return dogrulamaHatasi({ path: 'ad', message: 'Ad 1 ile 200 karakter arasında olmalı.' });
      }
      const once = konu.ad;
      konu.ad = ad;
      return sonuc(
        degisiklikYaz(taslak, {
          tur: 'adlandir',
          konu_id: konu.id,
          ad_once: once,
          ad_sonra: ad,
          ayrinti: {},
          not: n,
        }),
        konu,
      );
    }
    if (islem === 'tasi') {
      if (!uuidMi(g.ust_id))
        return dogrulamaHatasi({ path: 'ust_id', message: 'Üst konu kimliği geçersiz.' });
      const hedef = taslak.konular.find((k) => k.id === g.ust_id && !k.kapandi);
      if (
        !hedef ||
        hedef.id === konu.id ||
        altlari(taslak.konular, konu.id).has(hedef.id) ||
        SEVIYE_SIRA[hedef.seviye] >= SEVIYE_SIRA[konu.seviye] ||
        hedef.brans_kodu !== konu.brans_kodu
      ) {
        return hata(
          400,
          'konu_ust_gecersiz',
          'Konu kendi altına ya da uygun olmayan bir üst konuya taşınamaz.',
        );
      }
      const eski = konu.ust_id;
      konu.ust_id = hedef.id;
      if (typeof g.sira === 'number') konu.sira = g.sira;
      return sonuc(
        degisiklikYaz(taslak, {
          tur: 'tasi',
          konu_id: konu.id,
          ayrinti: { ...(eski ? { eski_ust_id: eski } : {}), yeni_ust_id: hedef.id },
          not: n,
        }),
        konu,
      );
    }
    if (islem === 'birlestir') {
      if (!uuidMi(g.hedef_id))
        return dogrulamaHatasi({ path: 'hedef_id', message: 'Hedef konu kimliği geçersiz.' });
      const hedef = taslak.konular.find((k) => k.id === g.hedef_id && !k.kapandi);
      if (
        !hedef ||
        hedef.id === konu.id ||
        hedef.brans_kodu !== konu.brans_kodu ||
        hedef.seviye !== konu.seviye
      ) {
        return hata(
          400,
          'birlestirme_gecersiz',
          'Birleştirme için iki konu aynı branşta ve aynı seviyede olmalı.',
        );
      }
      let tasinan = 0;
      for (const k of taslak.konular) {
        if (k.ust_id === konu.id && !k.kapandi) {
          k.ust_id = hedef.id;
          tasinan += 1;
        }
      }
      konu.kapandi = true;
      return sonuc(
        degisiklikYaz(taslak, {
          tur: 'birlestir',
          konu_id: konu.id,
          hedef_konu_id: hedef.id,
          ad_once: konu.ad,
          ad_sonra: hedef.ad,
          ayrinti: { tasinan_alt_konu: tasinan },
          not: n,
        }),
        hedef,
      );
    }
    if (islem === 'kaldir') {
      const alt = altlari(taslak.konular, konu.id);
      konu.kapandi = true;
      for (const k of taslak.konular) if (alt.has(k.id)) k.kapandi = true;
      return sonuc(
        degisiklikYaz(taslak, {
          tur: 'kaldir',
          konu_id: konu.id,
          ad_once: konu.ad,
          ...(uuidMi(g.yerine_gecen_id) ? { hedef_konu_id: g.yerine_gecen_id } : {}),
          ayrinti: { kaldirilan_alt_konu: alt.size },
          not: n,
        }),
        konu,
      );
    }
  }
  return hata(404, 'bulunamadi', 'Kaynak bulunamadı.');
}
