import { MOCK_KURUM_ROLLERI, mockKurumVerisi } from './hesap-mock';
import { mockSimdi } from './mock-zaman';
import type { MockIstek, MockYanit } from './vekil';

/**
 * `/api/bildirim/kurumlar/:kurum/duyurular...` ucunun bellek ici karsiligi (`NEXT_PUBLIC_API_MOCK=1`).
 * Yanit sekilleri `@kopru/contracts` `bildirim/duyuru.ts` ile aynidir. Rol kurumdan gelir (`kurum-atlas` ogrenci,
 * `kurum-ege` ogretmen, `kurum-mavi` yonetici, `kurum-kuzey` sahip). Gelen kutusu (`inbox`) tohum duyurulardir;
 * kullanicinin yazdigi duyuru kendi kutusuna dusmez (gercek servisle ayni: yazar alici degildir).
 * Veri sunucu sureci yeniden baslayana kadar bellekte kalir (yalniz gelistirme ve e2e).
 */

const BASLIK_EN_FAZLA = 200;
const GOVDE_EN_FAZLA = 4000;
const ROLLER = ['ogrenci', 'ogretmen'] as const;
const HEDEFLER = ['grup', 'kademe', 'kurum'] as const;

/** Tohum duyurulari ve bildirim mock'undaki derin baglantilar icin sabit kimlikler. */
export const mockDuyuruKimligi = (n: number): string =>
  `00000000-0000-4000-8000-0000000d${String(n).padStart(4, '0')}`;
/** Kurum hedefi icin sabit (sozlesme `hedef_id` uuid ister; mock kurum kimlikleri uuid degildir). */
const KURUM_HEDEF_ID = '00000000-0000-4000-8000-00000000c0de';
const BEN_UYELIK_ID = '00000000-0000-4000-8000-0000000000bb';
const BASKA_YAZAR_ID = '00000000-0000-4000-8000-0000000000cc';

interface MockDuyuru {
  id: string;
  baslik: string;
  govde: string;
  hedef_turu: (typeof HEDEFLER)[number];
  hedef_id: string;
  hedef_roller: string[];
  yazar_id: string;
  durum: 'taslak' | 'yayinda' | 'arsiv';
  yayin_at: string | null;
  bitis_at: string | null;
  sabit: boolean;
  push_gonderildi: boolean;
  alici_sayisi: number;
  okunan_sayisi: number;
  dagitim_tamam: boolean;
  created_at: string;
  updated_at: string;
  /** Kullanicinin kendi kutusunda mi (alici mi)? */
  inbox: boolean;
  benOkudu: string | null;
  okuyanlar: { alici_id: string; okundu_at: string }[];
  silindi: boolean;
}

const DK = 60_000;
const SA = 3_600_000;
const GUN = 86_400_000;
const ok = (govde: unknown, durum = 200): MockYanit => ({ durum, govde });
const hata = (durum: number, kod: string, mesaj: string): MockYanit => ({
  durum,
  govde: { error: { code: kod, message: mesaj } },
});
const bulunamadi = () => hata(404, 'bulunamadi', 'Duyuru bulunamadı.');
const izinYok = () => hata(403, 'izin_yok', 'Duyuru yazma yetkiniz yok.');
const nesne = (g: unknown): Record<string, unknown> =>
  typeof g === 'object' && g !== null ? (g as Record<string, unknown>) : {};
const iso = (ms: number) => new Date(ms).toISOString();

const genel = globalThis as { __kopruDuyuruMock?: Map<string, MockDuyuru[]> };
const depolar = (genel.__kopruDuyuruMock ??= new Map<string, MockDuyuru[]>());

/** Testler icin: tum duyuru durumunu tohum verisine dondurur. */
export function duyuruMockSifirla(): void {
  depolar.clear();
}

function yap(
  n: number,
  once: number,
  ek: Partial<MockDuyuru> & Pick<MockDuyuru, 'baslik' | 'govde'>,
): MockDuyuru {
  const an = mockSimdi() - once;
  return {
    id: mockDuyuruKimligi(n),
    hedef_turu: 'kurum',
    hedef_id: '',
    hedef_roller: ['ogrenci'],
    yazar_id: BASKA_YAZAR_ID,
    durum: 'yayinda',
    yayin_at: iso(an),
    bitis_at: null,
    sabit: false,
    push_gonderildi: true,
    alici_sayisi: 12,
    okunan_sayisi: 3,
    dagitim_tamam: true,
    created_at: iso(an - 5 * DK),
    updated_at: iso(an),
    inbox: false,
    benOkudu: null,
    okuyanlar: [],
    silindi: false,
    ...ek,
  };
}

function tohumla(kurumId: string): MockDuyuru[] {
  const rol = MOCK_KURUM_ROLLERI[kurumId] ?? 'ogrenci';
  const v = mockKurumVerisi(kurumId);
  const kurumHedefi = { hedef_turu: 'kurum' as const, hedef_id: KURUM_HEDEF_ID };
  const grup = v.gruplar.find((g) => g.durum === 'aktif' && g.tur === 'sinif') ?? v.gruplar[0];
  const grupHedefi = { hedef_turu: 'grup' as const, hedef_id: grup?.id ?? KURUM_HEDEF_ID };
  const ogrenciler = v.uyeler.filter((u) => u.rol === 'ogrenci');

  if (rol === 'ogrenci') {
    return [
      yap(1, 3 * SA, {
        ...kurumHedefi,
        baslik: 'Deneme sınavı takvimi açıklandı',
        govde:
          'Aralık ayı deneme sınavı tarihleri belli oldu. Ayrıntılar için https://ornek.kurum.test/deneme-takvimi adresine bak.\n\nSınav günü kimliğini yanında getirmeyi unutma.',
        sabit: true,
        inbox: true,
      }),
      yap(2, 50 * DK, {
        ...grupHedefi,
        baslik: 'Cuma etüdü saati değişti',
        govde: 'Bu hafta Cuma etüdü 16:00 yerine 17:30’da başlayacak.',
        inbox: true,
      }),
      yap(3, 2 * GUN, {
        ...kurumHedefi,
        baslik: 'Kütüphane kuralları',
        govde:
          'Kütüphanede sessizlik esastır. Kurallar: https://ornek.kurum.test/kutuphane — ayrıca javascript:alert(1) gibi metinler bağlantı olmaz.',
        inbox: true,
        benOkudu: iso(mockSimdi() - 2 * GUN + 10 * DK),
      }),
      yap(4, 6 * GUN, {
        ...kurumHedefi,
        baslik: 'Yeni dönem kayıtları',
        govde: 'Yeni dönem kayıtları başladı. Sorularını öğretmenine iletebilirsin.',
        inbox: true,
        benOkudu: iso(mockSimdi() - 6 * GUN + 10 * DK),
      }),
    ];
  }

  const benim = {
    yazar_id: BEN_UYELIK_ID,
  };
  const liste: MockDuyuru[] = [
    // Kutuma dusenler (digerlerinin yazdigi; hedef rol ogretmen)
    yap(1, 4 * SA, {
      ...kurumHedefi,
      baslik: 'Öğretmenler toplantısı Cuma günü',
      govde: 'Cuma 15:00’te öğretmenler odasında dönem değerlendirmesi var.',
      hedef_roller: ['ogretmen'],
      sabit: true,
      inbox: true,
      alici_sayisi: 3,
      okunan_sayisi: 1,
    }),
    yap(2, 3 * GUN, {
      ...kurumHedefi,
      baslik: 'Yoklama kilidi hatırlatması',
      govde: 'Yoklamalar 14 gün sonra kilitlenir. Eksik yoklamaları tamamla.',
      hedef_roller: ['ogretmen'],
      inbox: true,
      benOkudu: iso(mockSimdi() - 3 * GUN + 10 * DK),
      alici_sayisi: 3,
      okunan_sayisi: 2,
    }),
    // Yonetim listesi (benim yazdiklarim)
    yap(10, 2 * SA, {
      ...grupHedefi,
      ...benim,
      baslik: 'Yarınki sınav için hazırlık notu',
      govde:
        'Yarınki sınavdan önce 3. üniteyi tekrar edin. Kaynak: https://ornek.kurum.test/unite-3',
      alici_sayisi: Math.max(1, v.grupUyeleri[String(grup?.id)]?.length ?? 6),
      okunan_sayisi: 2,
      okuyanlar: ogrenciler.slice(0, 2).map((o, i) => ({
        alici_id: o.uyelik_id,
        okundu_at: iso(mockSimdi() - (30 + i * 20) * DK),
      })),
    }),
    yap(11, 1 * GUN, {
      ...grupHedefi,
      ...benim,
      baslik: 'Hafta sonu etüdü (taslak)',
      govde: 'Cumartesi 10:00’da ek etüt yapılacak. Katılım zorunlu değil.',
      durum: 'taslak',
      yayin_at: null,
      alici_sayisi: 0,
      okunan_sayisi: 0,
    }),
    yap(12, 10 * GUN, {
      ...grupHedefi,
      ...benim,
      baslik: 'Geçen haftanın ödev hatırlatması',
      govde: 'Geçen haftanın ödevlerini teslim etmeyi unutmayın.',
      durum: 'arsiv',
      alici_sayisi: 6,
      okunan_sayisi: 5,
    }),
  ];
  if (rol === 'yonetici' || rol === 'sahip') {
    liste.push(
      yap(13, 8 * SA, {
        ...kurumHedefi,
        ...benim,
        baslik: 'Bayram tatili duyurusu',
        govde: 'Kurumumuz bayram tatili süresince kapalı olacaktır.',
        hedef_roller: ['ogrenci', 'ogretmen'],
        alici_sayisi: 13,
        okunan_sayisi: 4,
        okuyanlar: ogrenciler.slice(0, 4).map((o, i) => ({
          alici_id: o.uyelik_id,
          okundu_at: iso(mockSimdi() - (60 + i * 15) * DK),
        })),
      }),
    );
  }
  return liste;
}

function depo(kurumId: string): MockDuyuru[] {
  let d = depolar.get(kurumId);
  if (!d) {
    d = tohumla(kurumId);
    depolar.set(kurumId, d);
  }
  return d;
}

const aktifMi = (d: MockDuyuru, an: number) =>
  d.durum === 'yayinda' && (d.bitis_at === null || Date.parse(d.bitis_at) > an);

function yonetimGorunumu({
  inbox: _i,
  benOkudu: _b,
  okuyanlar: _o,
  silindi: _s,
  ...d
}: MockDuyuru) {
  return d;
}

function aliciGorunumu(d: MockDuyuru) {
  return {
    id: d.id,
    baslik: d.baslik,
    govde: d.govde,
    hedef_turu: d.hedef_turu,
    hedef_id: d.hedef_id,
    yazar_id: d.yazar_id,
    sabit: d.sabit,
    yayin_at: d.yayin_at,
    bitis_at: d.bitis_at,
    okundu_at: d.benOkudu,
  };
}

function aliciSayisiniHesapla(kurumId: string, d: MockDuyuru): number {
  const v = mockKurumVerisi(kurumId);
  const roller = d.hedef_roller;
  let adaylar = v.uyeler.filter((u) => roller.includes(u.rol));
  if (d.hedef_turu === 'grup') {
    const ogrenciIdleri = new Set(
      (v.grupUyeleri[d.hedef_id] ?? []).map((u) => String(u.ogrenci_id)),
    );
    const ogretmenIdleri = new Set(
      v.atamalar.filter((a) => a.grup_id === d.hedef_id).map((a) => String(a.ogretmen_id)),
    );
    adaylar = adaylar.filter(
      (u) => ogrenciIdleri.has(u.uyelik_id) || ogretmenIdleri.has(u.uyelik_id),
    );
  }
  return adaylar.length;
}

export function duyuruMock(kurumId: string, parcalar: string[], istek: MockIstek): MockYanit {
  const rol = MOCK_KURUM_ROLLERI[kurumId] ?? 'ogrenci';
  const yazabilir = rol !== 'ogrenci';
  const yonetici = rol === 'yonetici' || rol === 'sahip';
  const liste = depo(kurumId);
  const an = mockSimdi();
  const [, , , a, b] = parcalar;
  const gorunen = liste.filter((d) => !d.silindi);
  const yonetebilir = (d: MockDuyuru) => yonetici || d.yazar_id === BEN_UYELIK_ID;

  // --- Koleksiyon ---
  if (a === undefined) {
    if (istek.yontem === 'GET') {
      const yalnizOkunmamis = istek.sorgu.get('okunmamis') === 'true';
      const limit = Math.min(100, Math.max(1, Number(istek.sorgu.get('limit') ?? 50) || 50));
      const offset = Math.max(0, Number(istek.sorgu.get('offset') ?? 0) || 0);
      const uygun = gorunen
        .filter((d) => d.inbox && aktifMi(d, an) && (!yalnizOkunmamis || d.benOkudu === null))
        .sort(
          (x, y) =>
            Number(y.sabit) - Number(x.sabit) || (y.yayin_at ?? '').localeCompare(x.yayin_at ?? ''),
        );
      return ok({
        ogeler: uygun.slice(offset, offset + limit).map(aliciGorunumu),
        toplam: uygun.length,
      });
    }
    if (istek.yontem === 'POST') {
      if (!yazabilir) return izinYok();
      const g = nesne(istek.govde);
      const baslik = typeof g.baslik === 'string' ? g.baslik.trim() : '';
      const govde = typeof g.govde === 'string' ? g.govde.trim() : '';
      if (!baslik || baslik.length > BASLIK_EN_FAZLA || !govde || govde.length > GOVDE_EN_FAZLA) {
        return hata(400, 'dogrulama_hatasi', 'Geçersiz istek.');
      }
      const hedefTuru = HEDEFLER.find((h) => h === g.hedef_turu);
      if (!hedefTuru) return hata(400, 'dogrulama_hatasi', 'Geçersiz istek.');
      if (hedefTuru !== 'kurum' && typeof g.hedef_id !== 'string') {
        return hata(400, 'dogrulama_hatasi', 'hedef_id grup ve kademe hedeflerinde zorunlu');
      }
      if (hedefTuru !== 'grup' && !yonetici) {
        return hata(403, 'yasak', 'Bu hedefe duyuru yapma yetkiniz yok.');
      }
      const roller = Array.isArray(g.hedef_roller)
        ? g.hedef_roller.filter((r): r is string => ROLLER.some((x) => x === r))
        : ['ogrenci'];
      if (roller.length === 0) return hata(400, 'dogrulama_hatasi', 'Geçersiz istek.');
      const simdi = iso(an);
      const yeni: MockDuyuru = {
        id: crypto.randomUUID(),
        baslik,
        govde,
        hedef_turu: hedefTuru,
        hedef_id: hedefTuru === 'kurum' ? KURUM_HEDEF_ID : String(g.hedef_id),
        hedef_roller: roller,
        yazar_id: BEN_UYELIK_ID,
        durum: 'taslak',
        yayin_at: null,
        bitis_at: typeof g.bitis_at === 'string' ? g.bitis_at : null,
        sabit: g.sabit === true,
        push_gonderildi: g.push_gonderildi !== false,
        alici_sayisi: 0,
        okunan_sayisi: 0,
        dagitim_tamam: true,
        created_at: simdi,
        updated_at: simdi,
        inbox: false,
        benOkudu: null,
        okuyanlar: [],
        silindi: false,
      };
      liste.unshift(yeni);
      return ok(yonetimGorunumu(yeni), 201);
    }
    return bulunamadi();
  }

  if (a === 'yonetim' && istek.yontem === 'GET') {
    if (!yazabilir) return izinYok();
    const durum = istek.sorgu.get('durum');
    const limit = Math.min(100, Math.max(1, Number(istek.sorgu.get('limit') ?? 50) || 50));
    const offset = Math.max(0, Number(istek.sorgu.get('offset') ?? 0) || 0);
    const uygun = gorunen
      .filter((d) => yonetebilir(d) && (!durum || d.durum === durum))
      .sort((x, y) => (y.yayin_at ?? y.created_at).localeCompare(x.yayin_at ?? x.created_at));
    return ok({
      ogeler: uygun.slice(offset, offset + limit).map(yonetimGorunumu),
      toplam: uygun.length,
    });
  }

  const d = gorunen.find((x) => x.id === a);
  if (!d) return bulunamadi();

  // --- Tekil ---
  if (b === undefined) {
    if (istek.yontem === 'GET') {
      const yonetimi = yazabilir && yonetebilir(d);
      const alici = d.inbox && aktifMi(d, an);
      if (!yonetimi && !alici) return bulunamadi();
      return ok({ ...aliciGorunumu(d), yonetim: yonetimi ? yonetimGorunumu(d) : null });
    }
    if (!yazabilir) return izinYok();
    if (!yonetebilir(d)) return bulunamadi();
    if (istek.yontem === 'PATCH') {
      const g = nesne(istek.govde);
      if (Object.keys(g).length === 0)
        return hata(400, 'dogrulama_hatasi', 'En az bir alan verilmeli');
      if (d.durum === 'arsiv') return hata(409, 'cakisma', 'Arşivlenmiş duyuru değiştirilemez.');
      const yayinda = d.durum === 'yayinda';
      if (yayinda && Object.keys(g).some((k) => k !== 'sabit' && k !== 'bitis_at')) {
        return hata(409, 'cakisma', 'Yayındaki duyuruda yalnız sabit ve bitiş değişir.');
      }
      if (typeof g.baslik === 'string') d.baslik = g.baslik.trim();
      if (typeof g.govde === 'string') d.govde = g.govde.trim();
      if (Array.isArray(g.hedef_roller)) d.hedef_roller = g.hedef_roller.map(String);
      if (typeof g.hedef_turu === 'string' && HEDEFLER.some((h) => h === g.hedef_turu)) {
        d.hedef_turu = g.hedef_turu as MockDuyuru['hedef_turu'];
        d.hedef_id =
          d.hedef_turu === 'kurum'
            ? KURUM_HEDEF_ID
            : typeof g.hedef_id === 'string'
              ? g.hedef_id
              : d.hedef_id;
      } else if (typeof g.hedef_id === 'string') d.hedef_id = g.hedef_id;
      if (typeof g.sabit === 'boolean') d.sabit = g.sabit;
      if (g.bitis_at === null || typeof g.bitis_at === 'string') d.bitis_at = g.bitis_at;
      if (typeof g.push_gonderildi === 'boolean') d.push_gonderildi = g.push_gonderildi;
      d.updated_at = iso(an);
      return ok(yonetimGorunumu(d));
    }
    if (istek.yontem === 'DELETE') {
      d.silindi = true;
      return ok({ id: d.id, silindi: true });
    }
    return bulunamadi();
  }

  // --- Eylemler ---
  if (b === 'okundu' && istek.yontem === 'POST') {
    if (!d.inbox || !aktifMi(d, an)) return bulunamadi();
    if (d.benOkudu === null) {
      d.benOkudu = iso(an);
      d.okunan_sayisi += 1;
    }
    return ok({ duyuru_id: d.id, okundu_at: d.benOkudu });
  }
  if (!yazabilir) return izinYok();
  if (!yonetebilir(d)) return bulunamadi();
  if (b === 'yayinla' && istek.yontem === 'POST') {
    if (d.durum !== 'taslak') return hata(409, 'cakisma', 'Duyuru zaten yayınlanmış.');
    d.durum = 'yayinda';
    d.yayin_at = iso(an);
    d.alici_sayisi = aliciSayisiniHesapla(kurumId, d);
    d.okunan_sayisi = 0;
    d.updated_at = iso(an);
    return ok(yonetimGorunumu(d));
  }
  if (b === 'arsivle' && istek.yontem === 'POST') {
    if (d.durum !== 'yayinda') return hata(409, 'cakisma', 'Yalnız yayındaki duyuru arşivlenir.');
    d.durum = 'arsiv';
    d.updated_at = iso(an);
    return ok(yonetimGorunumu(d));
  }
  if (b === 'okuyanlar' && istek.yontem === 'GET') {
    const limit = Math.min(500, Math.max(1, Number(istek.sorgu.get('limit') ?? 100) || 100));
    const offset = Math.max(0, Number(istek.sorgu.get('offset') ?? 0) || 0);
    return ok({
      okuyanlar: d.okuyanlar.slice(offset, offset + limit),
      okunan_sayisi: d.okunan_sayisi,
      alici_sayisi: d.alici_sayisi,
    });
  }
  return bulunamadi();
}
