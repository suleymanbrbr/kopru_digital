import type { BelirtecDeposu } from '../depo/belirtecDeposu';
import type { Adaptorler } from './adaptorler';
import { mockKayit } from './mockKayit';
import { mockOgrenme } from './mockOgrenme';
import { mockOperasyon } from './mockOperasyon';
import {
  ApiHata,
  type GrupKatilimIstegi,
  type KatilimIstegi,
  type KatilimKodu,
  type MobilRol,
  type OturumBilgisi,
  type OturumKaydi,
  type SinifGrubu,
  type RizaMetni,
  type Rol,
  type Uyelik,
  type UyelikBaglami,
} from './tipler';

const KVKK_SURUMU = '2026-01';
const KVKK_METINLERI: RizaMetni[] = [
  {
    id: 'mock-kvkk-aydinlatma',
    tur: 'kvkk_aydinlatma',
    baslik: 'Kişisel Verilerin Korunması Aydınlatma Metni',
    surum: KVKK_SURUMU,
    govdeMarkdown: [
      '## Veri sorumlusu',
      '',
      'Köprü ve bağlı olduğun **kurum**, kişisel verilerini 6698 sayılı KVKK kapsamında işler.',
      '',
      '## İşlenen veriler',
      '',
      '- Ad, soyad ve telefon numaran',
      '- Ders, yoklama ve ödev kayıtların',
      '',
      '> Verilerin yalnızca eğitim hizmetini sunmak için ve Türkiye içinde işlenir.',
      '',
      '## Haklarının kullanımı',
      '',
      '1. Verilerinin işlenip işlenmediğini öğrenebilirsin.',
      '2. Düzeltilmesini veya silinmesini isteyebilirsin.',
      '',
      'Ayrıntılar için [KVKK sayfası](https://www.kvkk.gov.tr) adresine bakabilirsin.',
    ].join('\n'),
  },
  {
    id: 'mock-kullanim-kosullari',
    tur: 'kullanim_kosullari',
    baslik: 'Kullanım Koşulları',
    surum: KVKK_SURUMU,
    govdeMarkdown: [
      '## Hizmetin kullanımı',
      '',
      'Uygulamayı yalnızca *eğitim amacıyla* ve kurumunun kurallarına uygun kullanırsın.',
      '',
      '- Hesabını başkasıyla paylaşmazsın.',
      '- Diğer kullanıcılara saygılı davranırsın.',
    ].join('\n'),
  },
];
export const MOCK_OTP = '123456';

const kurumlar = {
  a: { id: 'kurum-a', ad: 'Köprü Dershanesi', vurgu: null },
  b: { id: 'kurum-b', ad: 'Atlas Fen Lisesi Kursu', vurgu: '#0F9D8A' },
};

/**
 * Telefonun son hanesine gore rol: 1 ogretmen, 2 ogrenci, 3 yonetici, 4 sahip, 5 cok kurumlu,
 * 6 uyeliksiz (sinif kodu / davet akislarini denemek icin).
 */
function uyelikleriUret(telefon: string): Uyelik[] {
  const u = (rol: Rol, k: keyof typeof kurumlar, kurumTur?: 'bireysel'): Uyelik => ({
    uyelikId: `uyelik-${rol}-${k}`,
    kurumId: kurumlar[k].id,
    kurumAd: kurumlar[k].ad,
    ...(kurumTur ? { kurumTur } : {}),
    rol,
  });
  switch (telefon.slice(-1)) {
    case '2':
      return [u('ogrenci', 'a')];
    case '6':
      return [];
    case '3':
      return [u('yonetici', 'a')];
    case '4':
      // Solo hoca: bireysel kurum, sahip + ogretmen uyeligi (kurum secimi tek satira iner).
      return [u('sahip', 'a', 'bireysel'), u('ogretmen', 'a', 'bireysel')];
    case '5':
      return [u('ogretmen', 'a'), u('ogrenci', 'b'), u('veli', 'b')];
    default:
      return [u('ogretmen', 'a')];
  }
}

/**
 * Mock sinif kodlari (8 karakter, api alfabesi): MATEM234 -> 8-A Matematik (gecerli);
 * ZATEN234 -> 409 zaten_uye; BEKLE234 -> 429; diger gecerli bicimli kodlar -> 410.
 * Davet belirteci (en az 20 karakter): "gecersiz..." -> 410, "zatenuye..." -> 409,
 * "agsorunu..." -> baglanti hatasi, digerleri -> "Davet Edilen Kurum" ogrenci uyeligi.
 */
export const MOCK_SINIF_KODU = 'MATEM234';
/** Mock'ta bekleyen istek bu sure sonra "onaylandi" olur (ogrenci tarafi demo). */
const MOCK_ONAY_SURESI_MS = 8000;

const davetKurumu = { id: 'kurum-davet', ad: 'Davet Edilen Kurum' };

interface MockGrup extends SinifGrubu {
  kod: KatilimKodu | null;
  istekler: GrupKatilimIstegi[];
}

function mockGruplar(): MockGrup[] {
  const bugun = Date.now();
  return [
    {
      id: 'grup-8a',
      ad: '8-A Matematik',
      uyeSayisi: 18,
      kod: { kod: MOCK_SINIF_KODU, bitis: null, maxKullanim: 40, kullanimSayisi: 18 },
      istekler: [
        {
          id: 'istek-1',
          grupId: 'grup-8a',
          kullaniciId: 'k-1',
          gorunenAd: 'Elif Kaya',
          olusturma: new Date(bugun - 3600_000).toISOString(),
        },
        {
          id: 'istek-2',
          grupId: 'grup-8a',
          kullaniciId: 'k-2',
          gorunenAd: 'Mert Aydın',
          olusturma: new Date(bugun - 1800_000).toISOString(),
        },
        {
          // Onaylanamaz: iyimser guncellemenin geri alinmasini denemek icin (409 kapasite_dolu).
          id: 'istek-3',
          grupId: 'grup-8a',
          kullaniciId: 'k-3',
          gorunenAd: 'Kapasite Deneme',
          olusturma: new Date(bugun - 600_000).toISOString(),
        },
      ],
    },
    { id: 'grup-8b', ad: '8-B Fen', uyeSayisi: 22, kod: null, istekler: [] },
  ];
}

const bekle = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function moduller(rol: MobilRol | Rol, kurum: 'a' | 'b') {
  // b kurumunda "soru sor" kapali: sekme gizlenmesini gostermek icin.
  return {
    takvim: true,
    yoklama: true,
    odev: true,
    // b kurumunda haftalik plan ve deneme kapali: kart/sekme gizlenmesini gostermek icin.
    haftalik_plan: kurum === 'a',
    deneme: kurum === 'a',
    finans: kurum === 'a',
    soru_sor: kurum === 'a',
    oyunlastirma: rol === 'ogrenci',
    duyuru: true,
    // b kurumunda ders kayitlari ve geri bildirim kapali: giris noktalarinin gizlenmesini gostermek icin.
    kayitlar: kurum === 'a',
    geri_bildirim: kurum === 'a',
  };
}

/** Backend olmadan calisan sahte adaptorler (EXPO_PUBLIC_API_MOCK=1). */
export function mockAdaptorler(depo: BelirtecDeposu, gecikmeMs = 350): Adaptorler {
  let telefon: string | null = null;
  let kvkkSurum: string | null = null;
  const ekUyelikler: Uyelik[] = [];
  const gruplar = mockGruplar();
  const istekler: KatilimIstegi[] = [];
  let sayac = 0;
  let oturumlar: OturumKaydi[] = [];
  let aktifUyelikId: string | null = null;

  function tumUyelikler(tel: string): Uyelik[] {
    return [...uyelikleriUret(tel), ...ekUyelikler];
  }

  /** Bekleyen istekler bir sure sonra onaylanir ve uyelik olusur. */
  function istekleriIlerlet() {
    for (const i of istekler) {
      if (i.durum === 'bekliyor' && Date.now() - Date.parse(i.olusturma) > MOCK_ONAY_SURESI_MS) {
        i.durum = 'onaylandi';
        ekUyelikler.push({
          uyelikId: `uyelik-ogrenci-${i.kurumId}`,
          kurumId: i.kurumId,
          kurumAd: i.kurumAd,
          rol: 'ogrenci',
        });
      }
    }
  }

  /** Oturum listesi ilk kullanimda uretilir (cikista silinir). */
  function oturumlariHazirla() {
    if (oturumlar.length === 0) oturumlar = mockOturumlari();
  }

  function mockOturumlari(): OturumKaydi[] {
    const simdi = Date.now();
    return [
      {
        id: 'oturum-bu',
        olusturma: new Date(simdi - 60_000).toISOString(),
        sonKullanim: new Date(simdi).toISOString(),
        cihaz: 'iPhone (Köprü iOS)',
        ipMaskeli: '192.168.*.*',
        buOturum: true,
      },
      {
        id: 'oturum-ipad',
        olusturma: new Date(simdi - 5 * 86_400_000).toISOString(),
        sonKullanim: new Date(simdi - 2 * 3600_000).toISOString(),
        cihaz: 'iPad (Köprü iOS)',
        ipMaskeli: '85.100.*.*',
        buOturum: false,
      },
      {
        id: 'oturum-web',
        olusturma: new Date(simdi - 12 * 86_400_000).toISOString(),
        sonKullanim: new Date(simdi - 3 * 86_400_000).toISOString(),
        cihaz: 'Safari, macOS',
        ipMaskeli: null,
        buOturum: false,
      },
    ];
  }

  async function oturumGerekli() {
    if (!(await depo.oku())) throw new ApiHata('yetkisiz', undefined, { durum: 401 });
  }

  const operasyonSecenekleri = {
    bekle,
    gecikmeMs,
    oturumGerekli,
    aktifUyelikId: () => aktifUyelikId,
  };
  const operasyon = mockOperasyon(operasyonSecenekleri);
  const ogrenme = mockOgrenme(operasyonSecenekleri);
  const kayit = mockKayit(operasyonSecenekleri, operasyon.okuma);

  return {
    ders: operasyon.ders,
    finans: operasyon.finans,
    ogrenme,
    kayit,
    auth: {
      async otpIste(tel) {
        await bekle(gecikmeMs);
        telefon = tel;
        return { yenidenGondermeSn: 30 };
      },
      async otpDogrula(tel, kod) {
        await bekle(gecikmeMs);
        if (kod !== MOCK_OTP) throw new ApiHata('otp_gecersiz', undefined, { durum: 400 });
        telefon = tel;
        await depo.yaz({
          erisim: `mock-erisim-${tel}`,
          yenileme: `mock-yenileme-${tel}`,
          erisimBitis: Date.now() + 15 * 60_000,
        });
      },
      async oturumBilgisi(): Promise<OturumBilgisi> {
        await bekle(gecikmeMs / 2);
        await oturumGerekli();
        const tel =
          telefon ?? (await depo.oku())?.erisim.replace('mock-erisim-', '') ?? '5550000001';
        telefon = tel;
        return {
          kullanici: { id: `kullanici-${tel}`, adSoyad: 'Deniz Yılmaz', telefon: tel },
          uyelikler: tumUyelikler(tel),
          kvkk: {
            guncelSurum: KVKK_SURUMU,
            kabulEdilenSurum: kvkkSurum,
            metinler: kvkkSurum ? [] : KVKK_METINLERI,
          },
        };
      },
      async kvkkMetinleri() {
        await bekle(gecikmeMs);
        await oturumGerekli();
        return kvkkSurum ? [] : KVKK_METINLERI;
      },
      async kvkkKabulEt(surum) {
        await bekle(gecikmeMs);
        await oturumGerekli();
        kvkkSurum = surum;
      },
      async uyelikSec(uyelikId): Promise<UyelikBaglami> {
        await bekle(gecikmeMs);
        await oturumGerekli();
        const uyelik = tumUyelikler(telefon ?? '5550000001').find((x) => x.uyelikId === uyelikId);
        if (!uyelik) throw new ApiHata('bulunamadi', undefined, { durum: 404 });
        aktifUyelikId = uyelik.uyelikId;
        const k = uyelik.kurumId === 'kurum-b' ? 'b' : 'a';
        return { uyelik, moduller: moduller(uyelik.rol, k), vurgu: kurumlar[k].vurgu };
      },
      async cikis() {
        await bekle(100);
        await depo.sil();
        telefon = null;
        ekUyelikler.length = 0;
        oturumlar = [];
      },
    },
    hesap: {
      async sinifKoduKatil(kod) {
        await bekle(gecikmeMs);
        await oturumGerekli();
        if (kod === 'BEKLE234') throw new ApiHata('cok_istek', undefined, { durum: 429 });
        if (kod === 'ZATEN234') throw new ApiHata('zaten_uye', undefined, { durum: 409 });
        const grup = gruplar.find((g) => g.kod?.kod === kod);
        if (!grup) throw new ApiHata('kod_gecersiz', undefined, { durum: 410 });
        const var_ = istekler.find((i) => i.grupId === grup.id && i.durum === 'bekliyor');
        if (var_) return var_;
        const istek: KatilimIstegi = {
          id: `ben-istek-${++sayac}`,
          kurumId: kurumlar.a.id,
          kurumAd: kurumlar.a.ad,
          grupId: grup.id,
          grupAd: grup.ad,
          durum: 'bekliyor',
          olusturma: new Date().toISOString(),
        };
        istekler.push(istek);
        return istek;
      },
      async sinifKoduIsteklerim() {
        await bekle(gecikmeMs / 2);
        await oturumGerekli();
        istekleriIlerlet();
        return istekler.filter((i) => i.durum === 'bekliyor');
      },
      async sinifKoduIstegiIptal(istekId) {
        await bekle(gecikmeMs / 2);
        await oturumGerekli();
        const i = istekler.find((x) => x.id === istekId);
        if (!i) throw new ApiHata('bulunamadi', undefined, { durum: 404 });
        if (i.durum !== 'bekliyor' && i.durum !== 'iptal') {
          throw new ApiHata('cakisma', undefined, { durum: 409, ayrinti: 'istek_beklemiyor' });
        }
        i.durum = 'iptal';
      },

      async sinifBekleyenleri() {
        await bekle(gecikmeMs);
        await oturumGerekli();
        return gruplar.map((g) => ({
          grup: { id: g.id, ad: g.ad, uyeSayisi: g.uyeSayisi },
          istekler: [...g.istekler],
        }));
      },
      async katilimIstegiOnayla(grupId, istekId) {
        await bekle(gecikmeMs);
        await oturumGerekli();
        const g = gruplar.find((x) => x.id === grupId);
        const i = g?.istekler.find((x) => x.id === istekId);
        if (!g || !i)
          throw new ApiHata('cakisma', undefined, { durum: 409, ayrinti: 'istek_beklemiyor' });
        if (i.gorunenAd === 'Kapasite Deneme') {
          throw new ApiHata('cakisma', undefined, { durum: 409, ayrinti: 'kapasite_dolu' });
        }
        g.istekler = g.istekler.filter((x) => x.id !== istekId);
        g.uyeSayisi += 1;
      },
      async katilimIstegiReddet(grupId, istekId) {
        await bekle(gecikmeMs);
        await oturumGerekli();
        const g = gruplar.find((x) => x.id === grupId);
        if (!g?.istekler.some((x) => x.id === istekId)) {
          throw new ApiHata('cakisma', undefined, { durum: 409, ayrinti: 'istek_beklemiyor' });
        }
        g.istekler = g.istekler.filter((x) => x.id !== istekId);
      },
      async katilimKodu(grupId) {
        await bekle(gecikmeMs / 2);
        await oturumGerekli();
        return gruplar.find((g) => g.id === grupId)?.kod ?? null;
      },
      async katilimKoduYenile(grupId) {
        await bekle(gecikmeMs);
        await oturumGerekli();
        const g = gruplar.find((x) => x.id === grupId);
        if (!g) throw new ApiHata('bulunamadi', undefined, { durum: 404 });
        // Gecerli alfabeyle (I, L, O, 0, 1 yok) sahte ama bicimi dogru kod.
        const yeni = `NEWKD${String(100 + (++sayac % 900)).replace(/[01]/g, '7')}`.slice(0, 8);
        g.kod = { kod: yeni, bitis: null, maxKullanim: 40, kullanimSayisi: 0 };
        return g.kod;
      },

      async davetKabul(belirtec) {
        await bekle(gecikmeMs);
        await oturumGerekli();
        if (belirtec.startsWith('gecersiz')) {
          throw new ApiHata('davet_gecersiz', undefined, { durum: 410 });
        }
        if (belirtec.startsWith('zatenuye')) {
          throw new ApiHata('zaten_uye', undefined, { durum: 409 });
        }
        if (belirtec.startsWith('agsorunu')) throw new ApiHata('ag');
        const uyelikId = `uyelik-ogrenci-${davetKurumu.id}`;
        if (!ekUyelikler.some((u) => u.uyelikId === uyelikId)) {
          ekUyelikler.push({
            uyelikId,
            kurumId: davetKurumu.id,
            kurumAd: davetKurumu.ad,
            rol: 'ogrenci',
          });
        }
        return { kurumId: davetKurumu.id, uyelikId, rol: 'ogrenci' };
      },

      async oturumlar() {
        await bekle(gecikmeMs / 2);
        await oturumGerekli();
        oturumlariHazirla();
        return oturumlar.map((o) => ({ ...o }));
      },
      async oturumSonlandir(oturumId, buOturum) {
        await bekle(gecikmeMs / 2);
        await oturumGerekli();
        oturumlariHazirla();
        if (!oturumlar.some((o) => o.id === oturumId)) {
          throw new ApiHata('bulunamadi', undefined, { durum: 404 });
        }
        oturumlar = oturumlar.filter((o) => o.id !== oturumId);
        if (buOturum) {
          await depo.sil();
          oturumlar = [];
        }
        return { kendiOturumuKapandi: buOturum };
      },
      async oturumlariKapat(mevcutHaric) {
        await bekle(gecikmeMs / 2);
        await oturumGerekli();
        oturumlariHazirla();
        const once = oturumlar.length;
        oturumlar = mevcutHaric ? oturumlar.filter((o) => o.buOturum) : [];
        if (!mevcutHaric) await depo.sil();
        return { kapatilan: once - oturumlar.length, kendiOturumuKapandi: !mevcutHaric };
      },
    },
    veri: {
      async ogretmenBugun() {
        await bekle(gecikmeMs);
        await oturumGerekli();
        return { dersler: [], bekleyenSorular: [] };
      },
      async ogrenciBugun() {
        await bekle(gecikmeMs);
        await oturumGerekli();
        return {
          seri: 3,
          gorevler: [],
          karakter: {
            ad: 'Közü',
            tur: 'kivilcim',
            asama: 3,
            seviye: 12,
            varyant: 0,
            beceriler: { sayisal: 6, sozel: 3, fen: 8, sosyal: 2, dil: 4 },
            uykulu: false,
          },
        };
      },
    },
  };
}
