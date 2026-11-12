import { mockMedya, type MockMedyaKancalari } from '../api/mockMedya';
import { ApiHata } from '../api/tipler';
import { bellekKv, type KvDepo } from '../depo/kv';
import { YuklemeKuyrugu, type YuklemeKaydi } from './kuyruk';

function kur(
  secenek: {
    depo?: KvDepo;
    kancalar?: MockMedyaKancalari;
    cevrimici?: { deger: boolean };
    medya?: ReturnType<typeof mockMedya>;
    isle?: number;
  } = {},
) {
  const depo = secenek.depo ?? bellekKv();
  const medya = secenek.medya ?? mockMedya({ gecikmeMs: 0, isle: secenek.isle ?? 0, kancalar: secenek.kancalar });
  const cevrimici = secenek.cevrimici ?? { deger: true };
  let n = 0;
  const silinen: string[] = [];
  const kuyruk = new YuklemeKuyrugu({
    depo,
    yeniId: () => `uuid-${String(++n)}-${String(Math.random()).slice(2, 8)}`,
    kapsam: () => 'uyelik-1',
    medya: () => medya,
    yerel: {
      kalici: (uri, ad) => Promise.resolve(`file:///kalici/${ad}`.replace('//kalici', '/kalici') + `?src=${encodeURIComponent(uri)}`),
      sil: (uri) => {
        silinen.push(uri);
        return Promise.resolve();
      },
    },
    cevrimiciMi: () => cevrimici.deger,
    bekle: () => Promise.resolve(),
    gecikme: () => 0,
  });
  return { kuyruk, medya, depo, cevrimici, silinen };
}

async function bitir(k: YuklemeKuyrugu, tur = 6) {
  for (let i = 0; i < tur; i++) await k.calistir();
}

const girdi = { tur: 'soru_fotografi', mimeTipi: 'image/jpeg', yerelUri: 'file:///cache/a.jpg' } as const;

describe('YuklemeKuyrugu', () => {
  it('izin -> PUT -> tamam -> hazir; dosya kimligi ve istemci anahtari kayitlidir', async () => {
    const { kuyruk, medya } = kur();
    const k = await kuyruk.ekle(girdi);
    expect(k.durum).toBe('bekliyor');
    await bitir(kuyruk);
    const son = kuyruk.al(k.id) as YuklemeKaydi;
    expect(son.durum).toBe('hazir');
    expect(son.dosyaId).toMatch(/^00000000-0000-7000/);
    expect(son.boyutBayt).toBeGreaterThan(0);
    expect(son.sha256).toHaveLength(64);
    expect(medya.sayilar.yukle).toBe(1);
    // Kalici dosyaya tasindi.
    expect(son.yerelUri).toContain('/kalici/');
  });

  it('PUT yarida kalinca ayni istemci anahtariyla yeniden izin alinir ve yukleme tamamlanir', async () => {
    const { kuyruk, medya } = kur({
      kancalar: { yukle: (n) => (n === 1 ? new ApiHata('ag', 'baglanti koptu') : null) },
    });
    const k = await kuyruk.ekle(girdi);
    await bitir(kuyruk, 10);
    const son = kuyruk.al(k.id) as YuklemeKaydi;
    expect(son.durum).toBe('hazir');
    expect(medya.sayilar.yukle).toBe(2);
    // Ayni anahtar -> medya ayni kaydi dondurdu (tek dosya).
    expect(medya.dosyalar.size).toBe(1);
    expect(medya.sayilar.izinAl).toBe(2);
  });

  it('gecici hatada deneme sayilir ve geri cekilme zamani yazilir', async () => {
    const t = { simdi: 1_000_000 };
    const depo = bellekKv();
    const medya = mockMedya({ gecikmeMs: 0, isle: 0, kancalar: { izinAl: () => new ApiHata('ag') } });
    const kuyruk = new YuklemeKuyrugu({
      depo,
      yeniId: () => `id-${String(t.simdi++)}`,
      kapsam: () => 'uyelik-1',
      medya: () => medya,
      yerel: { kalici: (u) => Promise.resolve(u), sil: () => Promise.resolve() },
      simdi: () => 5_000,
      gecikme: (d) => d * 1000,
      bekle: () => Promise.resolve(),
    });
    const k = await kuyruk.ekle(girdi);
    await kuyruk.calistir();
    const a = kuyruk.al(k.id) as YuklemeKaydi;
    expect(a.durum).toBe('bekliyor');
    expect(a.deneme).toBe(1);
    expect(a.sonrakiDenemeAt).toBe(6_000);
    expect(a.hataKodu).toBe('ag');
    // Zamani gelmeden yeniden denenmez.
    const once = medya.sayilar.izinAl;
    await kuyruk.calistir();
    expect(medya.sayilar.izinAl).toBe(once);
  });

  it('uygulama yeniden baslayinca yukleniyor kaydi once tamam sorar, PUT tekrarlanmaz', async () => {
    const depo = bellekKv();
    const medya = mockMedya({ gecikmeMs: 0, isle: 0 });
    const a = kur({ depo, medya });
    // PUT bitti (arka plan oturumu) ama uygulama `tamam` demeden olduruldu: durum yukleniyor.
    const k = await a.kuyruk.ekle(girdi);
    await a.kuyruk.calistir();
    const bitmis = a.kuyruk.al(k.id) as YuklemeKaydi;
    expect(bitmis.durum).toBe('hazir');
    // Bellekteki kaydi "yukleniyor"a geri sarip yeni bir kuyruk (yeniden baslatma) ac.
    const ham = JSON.parse(depo.getString('kopru.yukleme.v1') as string) as {
      kayitlar: YuklemeKaydi[];
    };
    ham.kayitlar[0] = { ...bitmis, durum: 'yukleniyor' };
    depo.set('kopru.yukleme.v1', JSON.stringify(ham));
    const b = kur({ depo, medya });
    expect(b.kuyruk.al(k.id)?.durum).toBe('yukleniyor');
    const yuklePutOnce = medya.sayilar.yukle;
    await bitir(b.kuyruk);
    expect(b.kuyruk.al(k.id)?.durum).toBe('hazir');
    expect(medya.sayilar.yukle).toBe(yuklePutOnce);
  });

  it('yeniden baslatmada nesne yoksa PUT bastan yapilir (yukleme_bulunamadi)', async () => {
    const depo = bellekKv();
    const medya = mockMedya({ gecikmeMs: 0, isle: 0 });
    const a = kur({ depo, medya, kancalar: undefined });
    const k = await a.kuyruk.ekle(girdi);
    // Izin alindi, PUT hic gitmedi: kayit yukleniyor (olduruldu).
    await medya.izinAl({
      tur: 'soru_fotografi',
      mimeTipi: 'image/jpeg',
      boyutBayt: 1,
      sha256: 'a'.repeat(64),
      istemciAnahtari: (a.kuyruk.al(k.id) as YuklemeKaydi).istemciAnahtari,
    });
    const izinli = (a.kuyruk.al(k.id) as YuklemeKaydi).istemciAnahtari;
    const ham = JSON.parse(depo.getString('kopru.yukleme.v1') as string) as {
      kayitlar: YuklemeKaydi[];
    };
    ham.kayitlar[0] = {
      ...(a.kuyruk.al(k.id) as YuklemeKaydi),
      durum: 'yukleniyor',
      dosyaId: [...medya.dosyalar.keys()][0] ?? null,
      istemciAnahtari: izinli,
    };
    depo.set('kopru.yukleme.v1', JSON.stringify(ham));
    const b = kur({ depo, medya });
    await bitir(b.kuyruk, 10);
    expect(b.kuyruk.al(k.id)?.durum).toBe('hazir');
    expect(medya.sayilar.yukle).toBeGreaterThanOrEqual(1);
  });

  it('cevrimdisiyken hicbir istek yapilmaz; baglanti gelince surer', async () => {
    const cevrimici = { deger: false };
    const { kuyruk, medya } = kur({ cevrimici });
    const k = await kuyruk.ekle(girdi);
    await bitir(kuyruk);
    expect(medya.sayilar.izinAl).toBe(0);
    expect(kuyruk.al(k.id)?.durum).toBe('bekliyor');
    cevrimici.deger = true;
    await bitir(kuyruk);
    expect(kuyruk.al(k.id)?.durum).toBe('hazir');
  });

  it('kalici hata (415) dosyayi hataya dusurur; yenidenDene bastan dener', async () => {
    let bozuk = true;
    const { kuyruk } = kur({
      kancalar: {
        izinAl: () =>
          bozuk
            ? new ApiHata('dogrulama', 'mime', { durum: 415, ayrinti: 'mime_desteklenmiyor' })
            : null,
      },
    });
    const k = await kuyruk.ekle(girdi);
    await bitir(kuyruk);
    const a = kuyruk.al(k.id) as YuklemeKaydi;
    expect(a.durum).toBe('hata');
    expect(a.hataKodu).toBe('mime_desteklenmiyor');
    bozuk = false;
    kuyruk.yenidenDene(k.id);
    await bitir(kuyruk);
    expect(kuyruk.al(k.id)?.durum).toBe('hazir');
  });

  it('yetkisiz: dosya beklemede kalir, hataya dusmez', async () => {
    const { kuyruk } = kur({ kancalar: { izinAl: () => new ApiHata('yetkisiz', undefined, { durum: 401 }) } });
    const k = await kuyruk.ekle(girdi);
    await bitir(kuyruk);
    const a = kuyruk.al(k.id) as YuklemeKaydi;
    expect(a.durum).toBe('bekliyor');
    expect(a.deneme).toBe(0);
  });

  it('isleme surerken hata saymaz, sonra hazir olur', async () => {
    const t = { simdi: 1_000 };
    const medya = mockMedya({ gecikmeMs: 0, isle: 10_000, simdi: () => t.simdi });
    const kuyruk = new YuklemeKuyrugu({
      depo: bellekKv(),
      yeniId: (() => {
        let n = 0;
        return () => `id-${String(++n)}`;
      })(),
      kapsam: () => 'uyelik-1',
      medya: () => medya,
      yerel: { kalici: (u) => Promise.resolve(u), sil: () => Promise.resolve() },
      simdi: () => t.simdi,
      bekle: () => {
        t.simdi += 100;
        return Promise.resolve();
      },
    });
    const k = await kuyruk.ekle(girdi);
    await kuyruk.calistir();
    const a = kuyruk.al(k.id) as YuklemeKaydi;
    expect(a.durum).toBe('tamam');
    expect(a.deneme).toBe(0);
    t.simdi += 20_000;
    await kuyruk.calistir();
    await kuyruk.calistir();
    expect(kuyruk.al(k.id)?.durum).toBe('hazir');
  });

  it('PUT adresi gecersiz (403) yeni izinle yeniden denenir', async () => {
    const { kuyruk, medya } = kur({
      kancalar: {
        yukle: (n) =>
          n === 1
            ? new ApiHata('dogrulama', 'PUT 403', {
                durum: 403,
                ayrinti: 'yukleme_adresi_gecersiz',
                yenidenDenenebilir: true,
              })
            : null,
      },
    });
    const k = await kuyruk.ekle(girdi);
    await bitir(kuyruk, 10);
    expect(kuyruk.al(k.id)?.durum).toBe('hazir');
    expect(medya.sayilar.izinAl).toBe(2);
  });

  it('sil kaydi ve yerel dosyayi kaldirir', async () => {
    const { kuyruk, silinen } = kur();
    const k = await kuyruk.ekle(girdi);
    await bitir(kuyruk);
    await kuyruk.sil(k.id);
    expect(kuyruk.liste()).toHaveLength(0);
    expect(silinen).toHaveLength(1);
  });
});
