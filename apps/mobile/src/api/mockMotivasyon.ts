import type { MockOperasyonSecenekleri } from './mockOperasyon';
import type {
  Duraklatma,
  KarakterDetay,
  KarakterTuru,
  Kozmetik,
  KozmetikSlotu,
  MotivasyonAdapter,
  MotivasyonDurumu,
  OdakOturumu,
  SeriDetayi,
  YildizVerdiklerim,
} from './motivasyonTipleri';
import { ApiHata } from './tipler';

/** Mock motivasyon: seviye `40*(n-1)^2` XP, asamalar 5/12/25/40. Yalniz bellek ici. */
const SEVIYE_KATSAYISI = 40;
const seviyeBaslangic = (n: number) => SEVIYE_KATSAYISI * (n - 1) ** 2;
const ASAMA_SEVIYELERI = [1, 5, 12, 25, 40];
const ASAMA_ADLARI = ['Kıvılcım', 'Alev', 'Meşale', 'Ateş', 'Efsane'];

const TURLER: KarakterTuru[] = [
  { kod: 'kivilcim', ad: 'Kıvılcım' },
  { kod: 'dinamo', ad: 'Dinamo' },
  { kod: 'sedir', ad: 'Sedir' },
].map((t) => ({
  ...t,
  asamalar: ASAMA_SEVIYELERI.map((gereken_seviye, i) => ({
    asama: i + 1,
    ad: ASAMA_ADLARI[i] ?? '',
    gereken_seviye,
  })),
}));

/** Ayni uygunsuz ad listesi mantigi (sunucu `karakter-ad.ts` kucuk bir liste kullanir). */
const YASAKLI = ['aptal', 'salak', 'mal'];
function adUygunsuz(ad: string): boolean {
  const k = ad.toLocaleLowerCase('tr');
  return YASAKLI.some((y) => k.split(/\s+/).includes(y));
}

type Kural = 'plan' | 'odev' | 'soru' | 'anladim' | 'kayit' | 'geri_bildirim';
const KURAL_XP: Record<Kural, number> = {
  plan: 5,
  odev: 15,
  soru: 3,
  anladim: 5,
  kayit: 5,
  geri_bildirim: 2,
};

const GUN = 86_400_000;
const yerelGun = (ms: number) => {
  const d = new Date(ms);
  return `${String(d.getFullYear())}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export interface MockMotivasyon {
  adaptor: MotivasyonAdapter;
  /** Baska mock adaptorlerin eylemleri XP yazar (olay hattinin yerine). */
  odul: (kural: Kural) => void;
}

/**
 * Mock motivasyon adaptoru: tum akislar (karakter secimi, XP, seviye/evrim, seri, odak, kozmetik,
 * yildiz, duraklatma) bellekte calisir. `uyelik-ogrenci-b` (Atlas) karaktersiz baslar:
 * ilk acilis karakter secimini denemek icin.
 */
export function mockMotivasyon(sec: MockOperasyonSecenekleri): MockMotivasyon {
  const simdi = () => sec.simdi?.() ?? Date.now();
  const gecik = async () => {
    await sec.bekle(sec.gecikmeMs / 2);
    await sec.oturumGerekli();
  };

  let toplamXp = 620;
  let bugunXp = 0;
  let planSayac = 0;
  let odakDk = 0;
  let karakter: {
    tur_kodu: string;
    ad: string;
    secildi_at: string;
    turHakki: 0 | 1;
    kusan: Partial<Record<KozmetikSlotu, string>>;
  } | null = null;
  let karakterAyarlandi = false;
  const rozetler: MotivasyonDurumu['rozetler']['kazanilan'] = [
    {
      kod: 'odev_bronz',
      ad: 'Ödev Arı',
      aciklama: '5 ödev teslim et.',
      kategori: 'emek',
      kademe: 'bronz',
      kazanildi_at: new Date(simdi() - 9 * GUN).toISOString(),
    },
    {
      kod: 'seri_bronz',
      ad: 'Düzenli',
      aciklama: '7 gün üst üste çalış.',
      kategori: 'devamlilik',
      kademe: 'bronz',
      kazanildi_at: new Date(simdi() - 3 * GUN).toISOString(),
    },
  ];
  const kilitliler: MotivasyonDurumu['rozetler']['kilitli'] = [
    {
      kod: 'odak_bronz',
      ad: 'Odak Ustası',
      aciklama: 'Toplam 300 dakika odaklan.',
      kategori: 'emek',
      kademe: 'bronz',
      sayac_kodu: 'toplam_odak_dk',
      ilerleme: 120,
      esik: 300,
    },
    {
      kod: 'merak_soru_bronz',
      ad: 'Meraklı',
      aciklama: '3 soru sor.',
      kategori: 'merak',
      kademe: 'bronz',
      sayac_kodu: 'toplam_soru',
      ilerleme: 1,
      esik: 3,
    },
    {
      kod: 'odev_gumus',
      ad: 'Ödev Kurdu',
      aciklama: '25 ödev teslim et.',
      kategori: 'emek',
      kademe: 'gumus',
      sayac_kodu: 'toplam_odev_teslim',
      ilerleme: 6,
      esik: 25,
    },
  ];
  const hareketler: MotivasyonDurumu['son_hareketler'] = [];
  let hareketNo = 0;
  const sahip = new Set(['sapka_bere', 'gozluk_yildiz', 'arka_plan_gokyuzu']);
  const kozmetikTanim: Omit<Kozmetik, 'sahip' | 'kusanildi' | 'acildi_at'>[] = [
    {
      kod: 'sapka_bere',
      slot: 'sapka',
      ad: 'Kış beresi',
      nadirlik: 'yaygin',
      acilma_kosulu: { seviye: 1 },
    },
    {
      kod: 'sapka_kasif',
      slot: 'sapka',
      ad: 'Kaşif şapkası',
      nadirlik: 'nadir',
      acilma_kosulu: { seviye: 10 },
    },
    {
      kod: 'gozluk_yildiz',
      slot: 'gozluk',
      ad: 'Yıldız gözlük',
      nadirlik: 'yaygin',
      acilma_kosulu: { seviye: 1 },
    },
    {
      kod: 'aksesuar_atki',
      slot: 'aksesuar',
      ad: 'Rengârenk atkı',
      nadirlik: 'nadir',
      acilma_kosulu: { rozet: 'merak_soru_bronz', rozet_adi: 'Meraklı' },
    },
    {
      kod: 'arka_plan_gokyuzu',
      slot: 'arka_plan',
      ad: 'Gökyüzü',
      nadirlik: 'yaygin',
      acilma_kosulu: { seviye: 1 },
    },
    {
      kod: 'cerceve_altin',
      slot: 'cerceve',
      ad: 'Altın çerçeve',
      nadirlik: 'efsanevi',
      acilma_kosulu: { seri: 30 },
    },
  ];

  function seviye(): number {
    let n = 1;
    while (toplamXp >= seviyeBaslangic(n + 1) && n < 60) n++;
    return n;
  }
  function asama(): number {
    const s = seviye();
    let a = 1;
    ASAMA_SEVIYELERI.forEach((g, i) => {
      if (s >= g) a = i + 1;
    });
    return a;
  }

  function karakterVarsayilani() {
    if (karakterAyarlandi) return;
    karakterAyarlandi = true;
    if (sec.aktifUyelikId() !== 'uyelik-ogrenci-b') {
      karakter = {
        tur_kodu: 'kivilcim',
        ad: 'Közü',
        secildi_at: new Date(simdi() - 20 * GUN).toISOString(),
        turHakki: 1,
        kusan: { sapka: 'sapka_bere' },
      };
    }
  }

  function karakterDetay(): KarakterDetay | null {
    karakterVarsayilani();
    if (!karakter) return null;
    const a = asama();
    const tur = TURLER.find((t) => t.kod === karakter?.tur_kodu);
    const sonraki = tur?.asamalar.find((x) => x.asama === a + 1);
    return {
      tur_kodu: karakter.tur_kodu,
      tur_adi: tur?.ad ?? karakter.tur_kodu,
      ad: karakter.ad,
      asama: a,
      asama_adi: tur?.asamalar.find((x) => x.asama === a)?.ad ?? '',
      sonraki_asama_seviyesi: sonraki?.gereken_seviye ?? null,
      tur_degistirme_hakki: karakter.turHakki,
      secildi_at: karakter.secildi_at,
      kusanilanlar: Object.entries(karakter.kusan).map(([slot, kod]) => ({
        slot: slot as KozmetikSlotu,
        kozmetik_kodu: kod,
      })),
    };
  }

  const seriGunleri = new Map<string, 'aktif' | 'dondurma' | 'kacirildi'>();
  function seriHazirla() {
    if (seriGunleri.size > 0) return;
    const bugun = simdi();
    for (let i = 1; i <= 34; i++) {
      const gun = yerelGun(bugun - i * GUN);
      if (i <= 3) seriGunleri.set(gun, 'aktif');
      else if (i === 4) seriGunleri.set(gun, 'dondurma');
      else if (i === 5) seriGunleri.set(gun, 'kacirildi');
      else if (i % 3 !== 0) seriGunleri.set(gun, 'aktif');
    }
  }

  function hedefler(): SeriDetayi['hedefler'] {
    const h = (tur: SeriDetayi['hedefler'][number]['tur'], yapilan: number, esik: number) => ({
      tur,
      yapilan,
      esik,
      kalan: Math.max(esik - yapilan, 0),
    });
    return [h('plan_gorevi', planSayac, 3), h('odak_dk', odakDk, 20)];
  }
  const bugunAktif = () => hedefler().some((x) => x.kalan === 0);

  function durumUret(ogrenciId = 'mock-ogrenci'): MotivasyonDurumu {
    seriHazirla();
    const s = seviye();
    const sonraki = seviyeBaslangic(s + 1);
    const gunler = seriGunleri;
    const bugun = yerelGun(simdi());
    let seri = bugunAktif() ? 1 : 0;
    for (let i = 1; i < 40; i++) {
      const d = gunler.get(yerelGun(simdi() - i * GUN));
      if (d === 'aktif' || d === 'dondurma') seri += d === 'aktif' ? 1 : 0;
      else break;
    }
    return {
      ogrenci_id: ogrenciId,
      toplam_xp: toplamXp,
      seviye: s,
      seviye_baslangic_xp: seviyeBaslangic(s),
      sonraki_seviye_xp: sonraki,
      sonraki_seviyeye_kalan: sonraki - toplamXp,
      bu_hafta_xp: toplamXp % 400,
      bugun: {
        gun: bugun,
        xp: bugunXp,
        tavanlar: [{ kod: 'genel', kullanilan: bugunXp, ust_sinir: 300 }],
      },
      beceriler: [
        { kod: 'sayisal', ad: 'Sayısal', puan: 6 + Math.floor(planSayac / 2) },
        { kod: 'sozel', ad: 'Sözel', puan: 3 },
        { kod: 'fen', ad: 'Fen', puan: 8 },
        { kod: 'sosyal', ad: 'Sosyal', puan: 2 },
        { kod: 'dil', ad: 'Dil', puan: 4 + Math.floor(odakDk / 30) },
      ],
      rozetler: { kazanilan: rozetler, kilitli: kilitliler },
      karakter: (() => {
        const k = karakterDetay();
        if (!k) return null;
        return {
          tur_kodu: k.tur_kodu,
          ad: k.ad,
          asama: k.asama,
          sonraki_asama_seviyesi: k.sonraki_asama_seviyesi,
          kusanilanlar: k.kusanilanlar,
        };
      })(),
      seri: {
        mevcut_seri: seri,
        en_uzun_seri: Math.max(seri, 7),
        son_aktif_gun: bugunAktif() ? bugun : yerelGun(simdi() - GUN),
        dondurma_stogu: 1,
        onarim_hakki: 1,
        bozulan_seri: null,
        bozulan_gun: null,
        onarim_bitis_at: null,
      },
      son_hareketler: hareketler.slice(0, 8),
    };
  }

  function xpYaz(kural: string, xp: number) {
    toplamXp += xp;
    bugunXp += xp;
    hareketNo += 1;
    hareketler.unshift({
      id: `00000000-0000-7000-8000-${String(hareketNo).padStart(12, '0')}`,
      kural_kodu: kural,
      xp,
      gun: yerelGun(simdi()),
      kismi: false,
      created_at: new Date(simdi()).toISOString(),
    });
  }

  // --- Odak -----------------------------------------------------------------------------
  const oturumlar = new Map<string, OdakOturumu>();
  const acik = () => [...oturumlar.values()].find((o) => o.durum === 'devam') ?? null;

  // --- Ogretmen -------------------------------------------------------------------------
  const yildizlar: YildizVerdiklerim['yildizlar'] = [];
  const duraklatmalar: Duraklatma[] = [];
  const GRUP_OGRENCILERI = [
    { ogrenciId: 'ogr-elif', ad: 'Elif Kaya' },
    { ogrenciId: 'ogr-mert', ad: 'Mert Aydın' },
    { ogrenciId: 'ogr-zeynep', ad: 'Zeynep Demir' },
  ];
  const haftaBaslangic = () => {
    const d = new Date(simdi());
    const fark = (d.getDay() + 6) % 7;
    return yerelGun(simdi() - fark * GUN);
  };

  const adaptor: MotivasyonAdapter = {
    async benim() {
      await gecik();
      return durumUret();
    },
    async ogrenciOzeti(ogrenciId) {
      await gecik();
      const d = durumUret(ogrenciId);
      let n = 0;
      for (let i = 0; i < ogrenciId.length; i++) n += ogrenciId.charCodeAt(i);
      return {
        ...d,
        toplam_xp: 400 + (n % 7) * 220,
        seviye: 3 + (n % 7),
        beceriler: d.beceriler.map((b, i) => ({ ...b, puan: (n + i * 3) % 12 })),
        seri: { ...d.seri, mevcut_seri: n % 9 },
        rozetler: { ...d.rozetler, kazanilan: d.rozetler.kazanilan.slice(0, 1 + (n % 2)) },
      };
    },
    async seri() {
      await gecik();
      seriHazirla();
      const bugun = yerelGun(simdi());
      const gunler: SeriDetayi['gunler'] = [];
      for (let i = 34; i >= 0; i--) {
        const gun = yerelGun(simdi() - i * GUN);
        const kayit = seriGunleri.get(gun);
        gunler.push({
          gun,
          durum: i === 0 ? (bugunAktif() ? 'aktif' : 'yok') : (kayit ?? 'yok'),
          bugun: i === 0,
        });
      }
      return {
        bugun,
        mevcut_seri: durumUret().seri.mevcut_seri,
        en_uzun_seri: 7,
        dondurma_stogu: 1,
        onarim_hakki: 1,
        bugun_aktif: bugunAktif(),
        hedefler: hedefler(),
        onarim: null,
        sonraki_kilometre_tasi: { hedef: 7, kalan: Math.max(7 - durumUret().seri.mevcut_seri, 1) },
        gunler,
      };
    },

    async karakterTurleri() {
      await gecik();
      return TURLER;
    },
    async karakter() {
      await gecik();
      return karakterDetay();
    },
    async karakterSec(turKodu, ad) {
      await gecik();
      karakterVarsayilani();
      if (karakter)
        throw new ApiHata('cakisma', undefined, { durum: 409, ayrinti: 'karakter_zaten_secildi' });
      if (adUygunsuz(ad)) {
        throw new ApiHata('dogrulama', undefined, { durum: 422, ayrinti: 'karakter_adi_uygunsuz' });
      }
      karakter = {
        tur_kodu: turKodu,
        ad: ad.trim(),
        secildi_at: new Date(simdi()).toISOString(),
        turHakki: 1,
        kusan: {},
      };
      const d = karakterDetay();
      if (!d) throw new ApiHata('sunucu');
      return d;
    },
    async turDegistir(turKodu) {
      await gecik();
      if (!karakter)
        throw new ApiHata('dogrulama', undefined, { durum: 422, ayrinti: 'karakter_secilmemis' });
      if (karakter.turHakki === 0) {
        throw new ApiHata('cakisma', undefined, {
          durum: 409,
          ayrinti: 'tur_degistirme_hakki_yok',
        });
      }
      karakter = { ...karakter, tur_kodu: turKodu, turHakki: 0 };
      const d = karakterDetay();
      if (!d) throw new ApiHata('sunucu');
      return d;
    },
    async adDegistir(ad) {
      await gecik();
      if (!karakter)
        throw new ApiHata('dogrulama', undefined, { durum: 422, ayrinti: 'karakter_secilmemis' });
      if (adUygunsuz(ad)) {
        throw new ApiHata('dogrulama', undefined, { durum: 422, ayrinti: 'karakter_adi_uygunsuz' });
      }
      karakter = { ...karakter, ad: ad.trim() };
      const d = karakterDetay();
      if (!d) throw new ApiHata('sunucu');
      return d;
    },
    async kozmetikler() {
      await gecik();
      karakterVarsayilani();
      const s = seviye();
      for (const k of kozmetikTanim) {
        if (k.acilma_kosulu.seviye !== undefined && s >= k.acilma_kosulu.seviye) sahip.add(k.kod);
        const r = k.acilma_kosulu.rozet;
        if (r && rozetler.some((x) => x.kod === r)) sahip.add(k.kod);
      }
      return kozmetikTanim.map((k) => ({
        ...k,
        sahip: sahip.has(k.kod),
        acildi_at: sahip.has(k.kod) ? new Date(simdi() - 7 * GUN).toISOString() : null,
        kusanildi: karakter?.kusan[k.slot] === k.kod,
      }));
    },
    async kusan(slot, kod) {
      await gecik();
      if (!karakter)
        throw new ApiHata('dogrulama', undefined, { durum: 422, ayrinti: 'karakter_secilmemis' });
      const k = kozmetikTanim.find((x) => x.kod === kod);
      if (!k || !sahip.has(kod)) {
        throw new ApiHata('dogrulama', undefined, { durum: 422, ayrinti: 'kozmetik_sahip_degil' });
      }
      if (k.slot !== slot) {
        throw new ApiHata('dogrulama', undefined, {
          durum: 422,
          ayrinti: 'kozmetik_slot_uyusmuyor',
        });
      }
      karakter = { ...karakter, kusan: { ...karakter.kusan, [slot]: kod } };
    },
    async cikar(slot) {
      await gecik();
      if (!karakter) return;
      const kalan: Partial<Record<KozmetikSlotu, string>> = Object.fromEntries(
        Object.entries(karakter.kusan).filter(([s]) => s !== slot),
      );
      karakter = { ...karakter, kusan: kalan };
    },

    async odakAcik() {
      await gecik();
      return acik();
    },
    async odakBaslat(g) {
      await gecik();
      const var_ = oturumlar.get(g.istemciId);
      if (var_) return var_;
      const a = acik();
      if (a) {
        throw new ApiHata('cakisma', undefined, {
          durum: 409,
          ayrinti: 'acik_oturum_var',
          detay: { oturum: a },
        });
      }
      const planlanan = g.planlananDk ?? (g.mod === '25_5' ? 25 : 50);
      const o: OdakOturumu = {
        id: `mock-odak-${g.istemciId}`,
        istemci_id: g.istemciId,
        baslangic_at: g.baslangicAt ?? new Date(simdi()).toISOString(),
        bitis_at: null,
        planlanan_dk: planlanan,
        gerceklesen_sn: 0,
        durum: 'devam',
        brans_kodu: g.bransKodu ?? null,
        plan_gorev_id: g.planGorevId ?? null,
        cihaz: g.cihaz ?? null,
      };
      oturumlar.set(g.istemciId, o);
      return o;
    },
    async odakBitir(istemciId, durum, bitisAt) {
      await gecik();
      const o = oturumlar.get(istemciId);
      if (!o) throw new ApiHata('bulunamadi', undefined, { durum: 404 });
      if (o.durum !== 'devam') {
        return {
          oturum: o,
          kazanim: {
            xp: Math.floor(o.gerceklesen_sn / 60),
            seviyeAtladi: false,
            yeniRozetler: [],
            dogrulanmamisSayilanSn: 0,
            dogrulanmamisSayilmayanSn: 0,
          },
        };
      }
      const bitis = Math.min(Date.parse(bitisAt ?? new Date(simdi()).toISOString()), simdi());
      const baslangic = Date.parse(o.baslangic_at);
      const sn = Math.max(
        Math.min(Math.floor((bitis - baslangic) / 1000), o.planlanan_dk * 60 + 60, 10_800),
        0,
      );
      const kapali: OdakOturumu = {
        ...o,
        durum,
        bitis_at: new Date(Math.max(bitis, baslangic)).toISOString(),
        gerceklesen_sn: sn,
      };
      oturumlar.set(istemciId, kapali);
      const xp = sn >= 60 ? Math.floor(sn / 60) : 0;
      const onceki = seviye();
      if (xp > 0) {
        xpYaz('odak_oturumu', xp);
        odakDk += Math.floor(sn / 60);
      }
      return {
        oturum: kapali,
        kazanim: {
          xp,
          seviyeAtladi: seviye() > onceki,
          yeniRozetler: [],
          dogrulanmamisSayilanSn: 0,
          dogrulanmamisSayilmayanSn: 0,
        },
      };
    },

    async yildizVer(g) {
      await gecik();
      if (!GRUP_OGRENCILERI.some((o) => o.ogrenciId === g.ogrenciId)) {
        throw new ApiHata('bulunamadi', undefined, { durum: 404 });
      }
      if (yildizlar.some((y) => y.ogrenci_id === g.ogrenciId)) {
        throw new ApiHata('cakisma', undefined, {
          durum: 409,
          ayrinti: 'haftanin_yildizi_verilmis',
        });
      }
      if (yildizlar.length >= 3) {
        throw new ApiHata('cakisma', undefined, { durum: 409, ayrinti: 'haftalik_limit_asildi' });
      }
      const y = {
        id: `00000000-0000-7000-8000-${String(900 + yildizlar.length).padStart(12, '0')}`,
        ogrenci_id: g.ogrenciId,
        veren_ogretmen_id: 'mock-ogretmen',
        grup_id: g.grupId,
        hafta_baslangic: haftaBaslangic(),
        gerekce: g.gerekce ?? null,
        created_at: new Date(simdi()).toISOString(),
      };
      yildizlar.push(y);
      return { yildiz: y, xp: 50, yeniRozetler: [] };
    },
    async yildizVerdiklerim() {
      await gecik();
      return {
        haftaBaslangic: haftaBaslangic(),
        limit: 3,
        verilen: yildizlar.length,
        kalan: Math.max(3 - yildizlar.length, 0),
        yildizlar,
      };
    },
    async yildizAldiklari() {
      await gecik();
      return [
        {
          id: '00000000-0000-7000-8000-000000000700',
          ogrenci_id: 'mock-ogrenci',
          veren_ogretmen_id: 'mock-ogretmen',
          grup_id: 'grup-8a',
          hafta_baslangic: yerelGun(simdi() - 14 * GUN),
          gerekce: 'Bu hafta her ödevini zamanında teslim ettin.',
          created_at: new Date(simdi() - 12 * GUN).toISOString(),
        },
      ];
    },
    async duraklatmalar(grupId) {
      await gecik();
      return duraklatmalar.filter((d) => d.grup_id === grupId);
    },
    async duraklatmaOlustur(grupId, g) {
      await gecik();
      const fark = (Date.parse(g.bitis_gun) - Date.parse(g.baslangic_gun)) / GUN;
      if (fark > 30) throw new ApiHata('dogrulama', undefined, { durum: 422 });
      if (g.baslangic_gun < yerelGun(simdi()))
        throw new ApiHata('dogrulama', undefined, { durum: 422 });
      const cakisan = duraklatmalar.some(
        (d) =>
          d.grup_id === grupId &&
          d.iptal_at === null &&
          d.baslangic_gun <= g.bitis_gun &&
          g.baslangic_gun <= d.bitis_gun,
      );
      if (cakisan) {
        throw new ApiHata('cakisma', undefined, { durum: 409, ayrinti: 'duraklatma_cakisiyor' });
      }
      const d: Duraklatma = {
        id: `00000000-0000-7000-8000-${String(800 + duraklatmalar.length).padStart(12, '0')}`,
        grup_id: grupId,
        veren_ogretmen_id: 'mock-ogretmen',
        baslangic_gun: g.baslangic_gun,
        bitis_gun: g.bitis_gun,
        neden: g.neden ?? null,
        iptal_at: null,
        created_at: new Date(simdi()).toISOString(),
      };
      duraklatmalar.unshift(d);
      return d;
    },
    async duraklatmaIptal(grupId, duraklatmaId) {
      await gecik();
      const i = duraklatmalar.findIndex((d) => d.id === duraklatmaId && d.grup_id === grupId);
      const d = duraklatmalar[i];
      if (d?.iptal_at !== null) throw new ApiHata('bulunamadi', undefined, { durum: 404 });
      duraklatmalar[i] = { ...d, iptal_at: new Date(simdi()).toISOString() };
    },
    async grupOgrencileri() {
      await gecik();
      return GRUP_OGRENCILERI;
    },
  };

  return {
    adaptor,
    odul(kural) {
      const xp = KURAL_XP[kural];
      xpYaz(kural, xp);
      if (kural === 'plan') planSayac += 1;
    },
  };
}
