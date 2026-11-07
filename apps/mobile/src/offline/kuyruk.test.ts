import { ApiHata } from '../api/tipler';
import { bellekKv } from '../depo/kv';
import { OfflineKuyruk, type AgGozlemcisi, type KuyrukSecenekleri } from './kuyruk';

function kur(ek: Partial<KuyrukSecenekleri> = {}) {
  let n = 0;
  let simdi = 1_000;
  const depo = ek.depo ?? bellekKv();
  const durum = { cevrimici: true, kapsam: 'u1' as string | null };
  const q = new OfflineKuyruk({
    depo,
    yeniId: () => `id-${++n}`,
    kapsam: () => durum.kapsam,
    cevrimiciMi: () => durum.cevrimici,
    simdi: () => simdi,
    gecikme: () => 1000,
    ...ek,
  });
  return { q, depo, durum, ilerlet: (ms: number) => (simdi += ms) };
}

describe('OfflineKuyruk', () => {
  it('istek_id uretir ve kalici saklar; yeni ornek ayni isleri okur', () => {
    const { q, depo } = kur();
    const is = q.ekle('yoklama.kaydet', { ders: 1 });
    expect(is.istekId).toBe('id-1');
    const q2 = new OfflineKuyruk({ depo, yeniId: () => 'x', kapsam: () => 'u1' });
    expect(q2.bekleyenler()).toHaveLength(1);
    expect(q2.bekleyenler()[0]?.yuk).toEqual({ ders: 1 });
  });

  it('ayni istekId iki kez eklenmez', () => {
    const { q } = kur();
    q.ekle('a', 1, { istekId: 'sabit' });
    q.ekle('a', 2, { istekId: 'sabit' });
    expect(q.bekleyenler()).toHaveLength(1);
  });

  it('sirayla gonderir ve istek_id isleyiciye iletilir', async () => {
    const { q } = kur();
    const gorulen: string[] = [];
    q.kaydet('a', (is) => {
      gorulen.push(is.istekId);
      return Promise.resolve();
    });
    q.ekle('a', 1);
    q.ekle('a', 2);
    const s = await q.bosalt();
    expect(gorulen).toEqual(['id-1', 'id-2']);
    expect(s).toEqual({ gonderilen: 2, bekleyen: 0, basarisiz: 0 });
  });

  it('cevrimdisiyken gondermez, cevrimici olunca gonderir', async () => {
    const { q, durum } = kur();
    const f = jest.fn(() => Promise.resolve());
    q.kaydet('a', f);
    q.ekle('a', 1);
    durum.cevrimici = false;
    await q.bosalt();
    expect(f).not.toHaveBeenCalled();
    durum.cevrimici = true;
    await q.bosalt();
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('tekrar edilebilir hatada isi korur, ayni istekId ile geri cekilmeden sonra yeniden dener', async () => {
    const { q, ilerlet } = kur();
    const idler: string[] = [];
    let basarisiz = true;
    q.kaydet('a', (is) => {
      idler.push(is.istekId);
      return basarisiz ? Promise.reject(new ApiHata('ag')) : Promise.resolve();
    });
    q.ekle('a', 1);
    q.ekle('a', 2);
    let s = await q.bosalt();
    expect(s.bekleyen).toBe(2);
    expect(q.bekleyenler()[0]?.deneme).toBe(1);
    // geri cekilme suresi dolmadan tekrar denenmez ve sira (is 2) beklemede kalir
    await q.bosalt();
    expect(idler).toEqual(['id-1']);
    ilerlet(1500);
    basarisiz = false;
    s = await q.bosalt();
    expect(idler).toEqual(['id-1', 'id-1', 'id-2']);
    expect(s.bekleyen).toBe(0);
  });

  it('kalici hata (4xx) isi basarisiz listesine tasir ve kuyruk devam eder', async () => {
    const { q } = kur();
    q.kaydet('a', (is) =>
      is.yuk === 'kotu'
        ? Promise.reject(new ApiHata('dogrulama', 'x', { durum: 422 }))
        : Promise.resolve(),
    );
    q.ekle('a', 'kotu');
    q.ekle('a', 'iyi');
    const s = await q.bosalt();
    expect(s).toEqual({ gonderilen: 1, bekleyen: 0, basarisiz: 1 });
    expect(q.basarisizlar()[0]?.sonHata).toBe('x');
    q.yenidenDene('id-1');
    expect(q.bekleyenler()).toHaveLength(1);
    expect(q.basarisizlar()).toHaveLength(0);
  });

  it('en fazla deneme asilinca basarisiz olur', async () => {
    const { q, ilerlet } = kur({ enFazlaDeneme: 2 });
    q.kaydet('a', () => Promise.reject(new ApiHata('ag')));
    q.ekle('a', 1);
    await q.bosalt();
    ilerlet(2000);
    const s = await q.bosalt();
    expect(s.basarisiz).toBe(1);
    expect(s.bekleyen).toBe(0);
  });

  it('yetkisiz hatada isi korur ve deneme sayisini artirmaz', async () => {
    const { q } = kur();
    q.kaydet('a', () => Promise.reject(new ApiHata('yetkisiz', undefined, { durum: 401 })));
    q.ekle('a', 1);
    await q.bosalt();
    expect(q.bekleyenler()[0]?.deneme).toBe(0);
  });

  it('eszamanli bosalt cagrilari tek calisma paylasir', async () => {
    const { q } = kur();
    const f = jest.fn(() => Promise.resolve());
    q.kaydet('a', f);
    q.ekle('a', 1);
    await Promise.all([q.bosalt(), q.bosalt(), q.bosalt()]);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('yalnizca etkin kapsamin (uyelik) islerini gonderir', async () => {
    const { q, durum } = kur();
    const f = jest.fn(() => Promise.resolve());
    q.kaydet('a', f);
    q.ekle('a', 1); // u1
    durum.kapsam = 'u2';
    await q.bosalt();
    expect(f).not.toHaveBeenCalled();
    durum.kapsam = null;
    await q.bosalt();
    expect(f).not.toHaveBeenCalled();
    durum.kapsam = 'u1';
    await q.bosalt();
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('bozuk kalici veriyle bos baslar', () => {
    const depo = bellekKv();
    depo.set('kopru.kuyruk.v1', '{bozuk');
    expect(kur({ depo }).q.bekleyenler()).toHaveLength(0);
  });

  it('baglan: yeniden baglaninca otomatik bosaltir', async () => {
    const { q, durum } = kur();
    const f = jest.fn(() => Promise.resolve());
    q.kaydet('a', f);
    durum.cevrimici = false;
    let dinleyici: (c: boolean) => void = () => undefined;
    const ag: AgGozlemcisi = {
      cevrimiciMi: () => durum.cevrimici,
      abone: (d) => {
        dinleyici = d;
        return () => undefined;
      },
    };
    const birak = q.baglan(ag);
    q.ekle('a', 1);
    expect(f).not.toHaveBeenCalled();
    durum.cevrimici = true;
    dinleyici(true);
    await q.bosalt();
    expect(f).toHaveBeenCalledTimes(1);
    birak();
  });
});
