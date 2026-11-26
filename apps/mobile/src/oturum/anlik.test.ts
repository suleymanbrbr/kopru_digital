import { mockAdaptorler } from '../api/mock';
import { ApiHata } from '../api/tipler';
import { bellekBelirtecDeposu } from '../depo/belirtecDeposu';
import { bellekKv } from '../depo/kv';
import { anlikCoz, anlikDeposu, type OturumAnligi } from './anlik';
import { oturumYoneticisiOlustur } from './yonetici';

const ORNEK: OturumAnligi = {
  kullanici: { id: 'k1', adSoyad: 'Deniz Yılmaz' },
  uyelikler: [{ uyelikId: 'u1', kurumId: 'kr1', kurumAd: 'Kurs', kurumTur: null, rol: 'ogrenci' }],
  kvkkSurum: '2026-01',
  aktif: { uyelikId: 'u1', moduller: { takvim: true }, vurgu: '#112233' },
};

describe('anlikCoz', () => {
  it('gecerli kaydi okur; telefon gibi ek alanlar yoksayilir', () => {
    const ham = JSON.stringify({
      s: 1,
      ...ORNEK,
      kullanici: { ...ORNEK.kullanici, telefon: '555' },
    });
    const a = anlikCoz(ham);
    expect(a?.kullanici).toEqual({ id: 'k1', adSoyad: 'Deniz Yılmaz' });
    expect(a?.aktif?.uyelikId).toBe('u1');
  });

  it('bozuk, eski surum ya da tutarsiz kayit null doner', () => {
    expect(anlikCoz(undefined)).toBeNull();
    expect(anlikCoz('{bozuk')).toBeNull();
    expect(anlikCoz(JSON.stringify({ s: 99, ...ORNEK }))).toBeNull();
    expect(anlikCoz(JSON.stringify({ s: 1, ...ORNEK, kvkkSurum: '' }))).toBeNull();
    // etkin uyelik listede yok
    expect(
      anlikCoz(JSON.stringify({ s: 1, ...ORNEK, aktif: { ...ORNEK.aktif, uyelikId: 'yok' } })),
    ).toBeNull();
    // veli rolu mobilde yok
    expect(
      anlikCoz(
        JSON.stringify({ s: 1, ...ORNEK, uyelikler: [{ ...ORNEK.uyelikler[0], rol: 'veli' }] }),
      ),
    ).toBeNull();
  });
});

/** Ayni belirtecle yeni (soguk acilis) adaptoru; sunucuda KVKK onayi kalicidir, mock'ta yeniden verilir. */
async function yeniAdaptor(depo: ReturnType<typeof bellekBelirtecDeposu>) {
  const a = mockAdaptorler(depo, 0);
  await a.auth.kvkkKabulEt('2026-01');
  return a;
}

async function girisliYonetici() {
  const depo = bellekBelirtecDeposu();
  const kv = bellekKv();
  const anlik = anlikDeposu(() => kv);
  const adaptorler = mockAdaptorler(depo, 0);
  const y = oturumYoneticisiOlustur({ adaptorler, anlik });
  await adaptorler.auth.otpDogrula('+905551110002', '123456');
  await y.girisTamamlandi();
  await y.kvkkKabulEt();
  await y.uyelikSec('uyelik-ogrenci-a');
  return { depo, kv, anlik, adaptorler, y };
}

describe('oturum anligi: yazma', () => {
  it('KVKK onayi bekleyen oturumda yazilmaz; etkin kurum secilince yazilir', async () => {
    const depo = bellekBelirtecDeposu();
    const kv = bellekKv();
    const anlik = anlikDeposu(() => kv);
    const adaptorler = mockAdaptorler(depo, 0);
    const y = oturumYoneticisiOlustur({ adaptorler, anlik });
    await adaptorler.auth.otpDogrula('+905551110002', '123456');
    await y.girisTamamlandi();
    expect(anlik.oku()).toBeNull();
    await y.kvkkKabulEt();
    expect(anlik.oku()?.aktif).toBeNull();
    await y.uyelikSec('uyelik-ogrenci-a');
    const a = anlik.oku();
    expect(a?.aktif?.uyelikId).toBe('uyelik-ogrenci-a');
    // telefon/e-posta alani saklanmaz
    expect(Object.keys(a?.kullanici ?? {}).sort()).toEqual(['adSoyad', 'id']);
    expect(JSON.stringify(a)).not.toContain('telefon');
  });

  it('cikista ve oturum kapaninca silinir', async () => {
    const { anlik, y } = await girisliYonetici();
    expect(anlik.oku()).not.toBeNull();
    await y.cikis();
    expect(anlik.oku()).toBeNull();

    const b = await girisliYonetici();
    b.y.kendiOturumuKapandi();
    expect(b.anlik.oku()).toBeNull();
  });

  it('kurum degisince etkin baglam anliktan kalkar, kullanici ve uyelikler kalir', async () => {
    const { anlik, y } = await girisliYonetici();
    y.kurumDegistir();
    const a = anlik.oku();
    expect(a?.aktif).toBeNull();
    expect(a?.uyelikler.length).toBeGreaterThan(0);
  });
});

describe('oturum anligi: soguk acilis', () => {
  it('anlik + belirtec varsa agi beklemeden giris ve etkin kurum durumuna gecer', async () => {
    const { depo, kv } = await girisliYonetici();
    const adaptorler = await yeniAdaptor(depo);
    let bilgiCagrildi = 0;
    // Sunucu yanit vermiyor: ilk durum yine de anliktan gelmeli.
    adaptorler.auth.oturumBilgisi = () => {
      bilgiCagrildi++;
      return new Promise(() => undefined);
    };
    const y = oturumYoneticisiOlustur({ adaptorler, anlik: anlikDeposu(() => kv) });
    await y.baslat();
    const d = y.depo.al();
    if (d.asama !== 'giris') throw new Error('giris bekleniyordu');
    expect(d.aktif?.uyelik.uyelikId).toBe('uyelik-ogrenci-a');
    expect(d.kullanici.adSoyad).toBe('Deniz Yılmaz');
    expect(d.kvkk.kabulEdilenSurum).toBe(d.kvkk.guncelSurum);
    expect(bilgiCagrildi).toBe(1); // arka plan tazelemesi basladi
  });

  it('arka plan tazelemesi durumu sunucuyla esler (yeni modul durumu)', async () => {
    const { depo, kv } = await girisliYonetici();
    const adaptorler = await yeniAdaptor(depo);
    const y = oturumYoneticisiOlustur({ adaptorler, anlik: anlikDeposu(() => kv) });
    await y.baslat();
    await y.tazeleBitti();
    const d = y.depo.al();
    if (d.asama !== 'giris') throw new Error();
    expect(d.kullanici.telefon).toBe('+905551110002');
    expect(d.aktif?.moduller).toBeDefined();
  });

  it('tazeleme 401 donerse oturum kapanir ve anlik silinir', async () => {
    const { depo, kv } = await girisliYonetici();
    const adaptorler = await yeniAdaptor(depo);
    adaptorler.auth.oturumBilgisi = () =>
      Promise.reject(new ApiHata('yetkisiz', undefined, { durum: 401 }));
    const anlik = anlikDeposu(() => kv);
    const temizle = jest.fn();
    const y = oturumYoneticisiOlustur({ adaptorler, anlik, temizle });
    await y.baslat();
    await y.tazeleBitti();
    expect(y.depo.al().asama).toBe('cikis');
    expect(anlik.oku()).toBeNull();
    expect(temizle).toHaveBeenCalled();
  });

  it('tazeleme ag hatasiyla basarisizsa anlik durumu korunur (cevrimdisi acilis)', async () => {
    const { depo, kv } = await girisliYonetici();
    const adaptorler = await yeniAdaptor(depo);
    adaptorler.auth.oturumBilgisi = () => Promise.reject(new ApiHata('ag'));
    const y = oturumYoneticisiOlustur({ adaptorler, anlik: anlikDeposu(() => kv) });
    await y.baslat();
    await y.tazeleBitti();
    const d = y.depo.al();
    expect(d.asama).toBe('giris');
    if (d.asama === 'giris') expect(d.aktif).not.toBeNull();
  });

  it('sunucuda uyelik artik yoksa etkin baglam kalkar (kurum secimine doner)', async () => {
    const { depo, kv } = await girisliYonetici();
    const adaptorler = await yeniAdaptor(depo);
    const gercek = adaptorler.auth.oturumBilgisi.bind(adaptorler.auth);
    adaptorler.auth.oturumBilgisi = async () => ({ ...(await gercek()), uyelikler: [] });
    const y = oturumYoneticisiOlustur({ adaptorler, anlik: anlikDeposu(() => kv) });
    await y.baslat();
    await y.tazeleBitti();
    const d = y.depo.al();
    if (d.asama !== 'giris') throw new Error();
    expect(d.aktif).toBeNull();
  });

  it('sunucu yeni KVKK metni isterse etkin baglam kalkar', async () => {
    const { depo, kv } = await girisliYonetici();
    const adaptorler = await yeniAdaptor(depo);
    const gercek = adaptorler.auth.oturumBilgisi.bind(adaptorler.auth);
    adaptorler.auth.oturumBilgisi = async () => {
      const b = await gercek();
      return { ...b, kvkk: { ...b.kvkk, kabulEdilenSurum: null } };
    };
    const y = oturumYoneticisiOlustur({ adaptorler, anlik: anlikDeposu(() => kv) });
    await y.baslat();
    await y.tazeleBitti();
    const d = y.depo.al();
    if (d.asama !== 'giris') throw new Error();
    expect(d.aktif).toBeNull();
    expect(d.kvkk.kabulEdilenSurum).toBeNull();
  });

  it('anlik var ama belirtec yoksa normal acilis (cikis)', async () => {
    const { kv } = await girisliYonetici();
    const adaptorler = mockAdaptorler(bellekBelirtecDeposu(), 0);
    const anlik = anlikDeposu(() => kv);
    const y = oturumYoneticisiOlustur({ adaptorler, anlik });
    await y.baslat();
    expect(y.depo.al().asama).toBe('cikis');
    expect(anlik.oku()).toBeNull();
  });
});
