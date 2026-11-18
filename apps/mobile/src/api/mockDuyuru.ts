import type { BildirimAdapter, Duyuru } from './bildirimTipleri';
import type { MockOperasyonSecenekleri } from './mockOperasyon';
import { ApiHata } from './tipler';

const DAKIKA = 60_000;
const SAAT = 60 * DAKIKA;
const KURUM_ID = '0190f3a0-0000-7000-8000-0000000000c0';
const GRUP_ID = 'g-8a';

export type MockDuyuruAdaptoru = Pick<
  BildirimAdapter,
  | 'duyurularim'
  | 'duyuru'
  | 'duyuruOkundu'
  | 'duyuruYonetim'
  | 'duyuruTaslak'
  | 'duyuruGuncelle'
  | 'duyuruYayinla'
  | 'duyuruArsivle'
  | 'duyuruSil'
>;

/**
 * Mock duyurular (yalniz bellek): alici gorunumu, yazar/yonetici gorunumu, taslak -> yayin ve
 * okunma sayaci. Rol, etkin uyelik kimliginden okunur (`uyelik-ogrenci-*` alicidir, digerleri
 * yazardir); yazar her zaman `uyelik-ogretmen-a`.
 */
export function mockDuyuru(sec: MockOperasyonSecenekleri): MockDuyuruAdaptoru {
  const simdi = () => sec.simdi?.() ?? Date.now();
  const iso = (ms: number) => new Date(ms).toISOString();
  const gecik = async () => {
    await sec.bekle(sec.gecikmeMs / 2);
    await sec.oturumGerekli();
  };
  const uyelik = () => sec.aktifUyelikId() ?? '';
  const ogrenciMi = () => uyelik().includes('ogrenci');
  const yazarId = 'uyelik-ogretmen-a';

  let sayac = 0;
  const yeniId = () => `0190f3a0-0000-7000-8000-${String(200 + ++sayac).padStart(12, '0')}`;

  /** Duyuru -> bu uyeliklerin okudugu. */
  const okuyanlar = new Map<string, Set<string>>();

  const olustur = (
    o: Pick<Duyuru, 'baslik' | 'govde'> & Partial<Duyuru>,
    kacSaatOnce: number | null,
  ): Duyuru => {
    const id = o.id ?? yeniId();
    const t0 = simdi() - (kacSaatOnce ?? 0) * SAAT;
    return {
      id,
      hedef_turu: 'grup',
      hedef_id: GRUP_ID,
      hedef_roller: ['ogrenci'],
      yazar_id: yazarId,
      durum: kacSaatOnce === null ? 'taslak' : 'yayinda',
      yayin_at: kacSaatOnce === null ? null : iso(t0),
      bitis_at: null,
      sabit: false,
      push_gonderildi: true,
      alici_sayisi: kacSaatOnce === null ? 0 : 12,
      okunan_sayisi: 0,
      dagitim_tamam: true,
      created_at: iso(t0),
      updated_at: iso(t0),
      ...o,
    };
  };

  const duyurular: Duyuru[] = [
    olustur(
      {
        id: '0190f3a0-0000-7000-8000-0000000000d1',
        baslik: 'Hafta sonu telafi dersi',
        govde:
          "Cumartesi 10:00'da telafi dersi yapılacak. Ayrıntılar için https://ornek.com/telafi adresine bakabilirsiniz.",
        sabit: true,
        okunan_sayisi: 5,
      },
      30,
    ),
    olustur(
      {
        id: '0190f3a0-0000-7000-8000-0000000000d2',
        baslik: 'Deneme sınavı cuma günü',
        govde: 'Cuma günü 4. derste TYT deneme sınavı var. Kalem ve silgi getirmeyi unutmayın.',
        okunan_sayisi: 3,
      },
      4,
    ),
    olustur(
      {
        id: '0190f3a0-0000-7000-8000-0000000000d3',
        baslik: 'Veli toplantısı',
        govde: 'Taslak metin.',
      },
      null,
    ),
  ];
  okuyanlar.set('0190f3a0-0000-7000-8000-0000000000d1', new Set(['uyelik-ogrenci-a']));

  const bul = (id: string) => {
    const d = duyurular.find((x) => x.id === id);
    if (!d) throw new ApiHata('bulunamadi', undefined, { durum: 404 });
    return d;
  };
  const okundu = (d: Duyuru) => okuyanlar.get(d.id)?.has(uyelik()) ?? false;
  const yonetimGorunumu = (d: Duyuru): Duyuru => ({
    ...d,
    okunan_sayisi: Math.max(d.okunan_sayisi, okuyanlar.get(d.id)?.size ?? 0),
  });
  const aliciOgesi = (d: Duyuru) => ({
    id: d.id,
    baslik: d.baslik,
    govde: d.govde,
    hedef_turu: d.hedef_turu,
    hedef_id: d.hedef_id,
    yazar_id: d.yazar_id,
    sabit: d.sabit,
    yayin_at: d.yayin_at ?? iso(simdi()),
    bitis_at: d.bitis_at,
    okundu_at: okundu(d) ? iso(simdi()) : null,
  });
  const alicinin = () =>
    duyurular
      .filter(
        (d) =>
          d.durum === 'yayinda' && d.hedef_roller.includes(ogrenciMi() ? 'ogrenci' : 'ogretmen'),
      )
      .sort(
        (a, b) =>
          Number(b.sabit) - Number(a.sabit) || (b.yayin_at ?? '').localeCompare(a.yayin_at ?? ''),
      );
  const yazarMi = () => !ogrenciMi();
  const yetkiGerekli = () => {
    if (!yazarMi()) throw new ApiHata('izin_yok', undefined, { durum: 403 });
  };

  return {
    async duyurularim(s) {
      await gecik();
      const liste = alicinin().filter((d) => !s?.okunmamis || !okundu(d));
      const bas = s?.offset ?? 0;
      return {
        ogeler: liste.slice(bas, bas + (s?.limit ?? 50)).map(aliciOgesi),
        toplam: liste.length,
      };
    },
    async duyuru(id) {
      await gecik();
      const d = bul(id);
      if (ogrenciMi() && (d.durum !== 'yayinda' || !alicinin().some((x) => x.id === id))) {
        throw new ApiHata('bulunamadi', undefined, { durum: 404 });
      }
      return {
        ...aliciOgesi(d),
        yayin_at: d.yayin_at,
        yonetim: yazarMi() ? yonetimGorunumu(d) : null,
      };
    },
    async duyuruOkundu(id) {
      await gecik();
      const d = bul(id);
      const k = okuyanlar.get(id) ?? new Set<string>();
      if (!k.has(uyelik())) {
        k.add(uyelik());
        d.okunan_sayisi = Math.max(d.okunan_sayisi, k.size);
      }
      okuyanlar.set(id, k);
    },
    async duyuruYonetim(s) {
      await gecik();
      yetkiGerekli();
      const liste = duyurular
        .filter((d) => !s?.durum || d.durum === s.durum)
        .filter((d) => d.durum !== 'arsiv' || s?.durum === 'arsiv')
        .sort((a, b) => b.created_at.localeCompare(a.created_at));
      const bas = s?.offset ?? 0;
      return {
        ogeler: liste.slice(bas, bas + (s?.limit ?? 50)).map(yonetimGorunumu),
        toplam: liste.length,
      };
    },
    async duyuruTaslak(g) {
      await gecik();
      yetkiGerekli();
      const d = olustur(
        {
          baslik: g.baslik,
          govde: g.govde,
          hedef_turu: g.hedef_turu,
          hedef_id: g.hedef_id ?? KURUM_ID,
          hedef_roller: g.hedef_roller ?? ['ogrenci'],
          sabit: g.sabit ?? false,
          push_gonderildi: g.push_gonderildi ?? true,
          bitis_at: g.bitis_at ?? null,
        },
        null,
      );
      duyurular.push(d);
      return d;
    },
    async duyuruGuncelle(id, g) {
      await gecik();
      yetkiGerekli();
      const d = bul(id);
      if (d.durum !== 'taslak' && (g.baslik || g.govde || g.hedef_turu || g.hedef_id)) {
        throw new ApiHata('cakisma', undefined, { durum: 409, ayrinti: 'cakisma' });
      }
      Object.assign(d, g, { updated_at: iso(simdi()) });
      return d;
    },
    async duyuruYayinla(id) {
      await gecik();
      yetkiGerekli();
      const d = bul(id);
      if (d.durum !== 'taslak') throw new ApiHata('cakisma', undefined, { durum: 409 });
      d.durum = 'yayinda';
      d.yayin_at = iso(simdi());
      d.alici_sayisi = 12;
      return d;
    },
    async duyuruArsivle(id) {
      await gecik();
      yetkiGerekli();
      const d = bul(id);
      d.durum = 'arsiv';
      return d;
    },
    async duyuruSil(id) {
      await gecik();
      yetkiGerekli();
      bul(id);
      duyurular.splice(
        duyurular.findIndex((x) => x.id === id),
        1,
      );
    },
  };
}
