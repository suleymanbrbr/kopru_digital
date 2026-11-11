import type { OgrenmeAdapter } from '../api/ogrenmeTipleri';
import { ApiHata } from '../api/tipler';
import { bellekKv } from '../depo/kv';
import { OfflineKuyruk } from './kuyruk';
import { gerceklesenKuyrugaAl, planIsleyicisiKaydet, PLAN_GERCEKLESEN_TURU } from './plan';

const yuk = (miktar: number, gorevId = 'g1') => ({
  gorevId,
  gorevBaslik: 'Üslü Sayılar',
  gun: '2026-11-10',
  miktar,
});

function kur(gerceklesen: jest.Mock, kapsam: { deger: string | null } = { deger: 'uyelik-1' }) {
  const cevrimici = { deger: true };
  const kuyruk = new OfflineKuyruk({
    depo: bellekKv(),
    yeniId: (() => {
      let n = 0;
      return () => `istek-${String(++n)}`;
    })(),
    kapsam: () => kapsam.deger,
    cevrimiciMi: () => cevrimici.deger,
    gecikme: () => 0,
    enFazlaDeneme: 3,
  });
  const basarili = jest.fn();
  planIsleyicisiKaydet(
    kuyruk,
    () => ({ gorevGerceklesen: gerceklesen }) as unknown as OgrenmeAdapter,
    basarili,
  );
  return { kuyruk, cevrimici, kapsam, basarili };
}

describe('plan.gerceklesen kuyrugu', () => {
  it('cevrimdisiyken bekler; baglanti gelince (gorevId, miktar) gonderilir, surum yok', async () => {
    const f = jest.fn().mockResolvedValue({});
    const { kuyruk, cevrimici, basarili } = kur(f);
    cevrimici.deger = false;
    gerceklesenKuyrugaAl(kuyruk, yuk(15));
    await kuyruk.bosalt(); // cevrimdisi tur bitsin
    expect(kuyruk.bekleyenler()).toHaveLength(1);
    expect(kuyruk.bekleyenler()[0]?.tur).toBe(PLAN_GERCEKLESEN_TURU);
    expect(f).not.toHaveBeenCalled();
    cevrimici.deger = true;
    await kuyruk.bosalt();
    expect(f).toHaveBeenCalledTimes(1);
    expect(f).toHaveBeenCalledWith('g1', 15); // iki arguman: surum yok
    expect(kuyruk.bekleyenler()).toHaveLength(0);
    expect(basarili).toHaveBeenCalled();
  });

  it('ayni istekId tekrar eklenmez; yeniden denemede ayni istekId korunur', async () => {
    const f = jest.fn().mockRejectedValueOnce(new ApiHata('ag')).mockResolvedValue({});
    const { kuyruk } = kur(f);
    const a = kuyruk.ekle(PLAN_GERCEKLESEN_TURU, yuk(10), { istekId: 'sabit' });
    const b = kuyruk.ekle(PLAN_GERCEKLESEN_TURU, yuk(10), { istekId: 'sabit' });
    expect(b).toBe(a);
    expect(kuyruk.bekleyenler()).toHaveLength(1);
    await kuyruk.bosalt(); // ag hatasi: gecici, is kuyrukta kalir
    expect(kuyruk.bekleyenler()).toHaveLength(1);
    expect(kuyruk.bekleyenler()[0]?.istekId).toBe('sabit');
    expect(kuyruk.bekleyenler()[0]?.deneme).toBe(1);
    await kuyruk.bosalt();
    expect(f).toHaveBeenCalledTimes(2);
    expect(f.mock.calls[0]).toEqual(f.mock.calls[1]);
    expect(kuyruk.bekleyenler()).toHaveLength(0);
  });

  it('ayni gorev icin sirayla iki giris FIFO gonderilir (son deger kazanir)', async () => {
    const f = jest.fn().mockResolvedValue({});
    const { kuyruk } = kur(f);
    gerceklesenKuyrugaAl(kuyruk, yuk(5));
    gerceklesenKuyrugaAl(kuyruk, yuk(12));
    await kuyruk.bosalt();
    expect((f.mock.calls as [string, number][]).map((c) => c[1])).toEqual([5, 12]);
  });

  it('kalici hata (plan_kilitli) basarisiz listesine duser ve kod korunur', async () => {
    const f = jest
      .fn()
      .mockRejectedValue(new ApiHata('cakisma', 'x', { durum: 409, ayrinti: 'plan_kilitli' }));
    const { kuyruk, basarili } = kur(f);
    gerceklesenKuyrugaAl(kuyruk, yuk(15));
    await kuyruk.bosalt();
    expect(kuyruk.bekleyenler()).toHaveLength(0);
    expect(kuyruk.basarisizlar()).toHaveLength(1);
    expect(kuyruk.basarisizlar()[0]?.sonHataKodu).toBe('plan_kilitli');
    expect(basarili).not.toHaveBeenCalled();
    // tekrar dene -> yeniden kuyruga alinir
    f.mockResolvedValue({});
    kuyruk.yenidenDene(kuyruk.basarisizlar()[0]?.istekId ?? '');
    await kuyruk.bosalt();
    expect(kuyruk.basarisizlar()).toHaveLength(0);
  });

  it('gorev_zaten_devredildi ve hedef gun hatalari da kalicidir', async () => {
    const f = jest
      .fn()
      .mockRejectedValue(
        new ApiHata('cakisma', 'x', { durum: 409, ayrinti: 'gorev_zaten_devredildi' }),
      );
    const { kuyruk } = kur(f);
    gerceklesenKuyrugaAl(kuyruk, yuk(3));
    await kuyruk.bosalt();
    expect(kuyruk.basarisizlar()[0]?.sonHataKodu).toBe('gorev_zaten_devredildi');
  });

  it('429 gecicidir (yeniden denenir), 5xx de', async () => {
    const f = jest
      .fn()
      .mockRejectedValueOnce(new ApiHata('cok_istek', 'x', { durum: 429 }))
      .mockRejectedValueOnce(new ApiHata('sunucu', 'x', { durum: 503 }))
      .mockResolvedValue({});
    const { kuyruk } = kur(f);
    gerceklesenKuyrugaAl(kuyruk, yuk(3));
    await kuyruk.bosalt();
    expect(kuyruk.bekleyenler()).toHaveLength(1);
    await kuyruk.bosalt();
    expect(kuyruk.bekleyenler()).toHaveLength(1);
    await kuyruk.bosalt();
    expect(kuyruk.bekleyenler()).toHaveLength(0);
    expect(kuyruk.basarisizlar()).toHaveLength(0);
  });

  it('kapsam degisimi: baska uyelik/kurumun isi gonderilmez, kapsama donunce gonderilir', async () => {
    const f = jest.fn().mockResolvedValue({});
    const { kuyruk, kapsam } = kur(f);
    gerceklesenKuyrugaAl(kuyruk, yuk(15)); // uyelik-1 kapsaminda eklenir (gonderim bekletilmez)
    await kuyruk.bosalt();
    f.mockClear();
    kapsam.deger = 'uyelik-1';
    const is = kuyruk.ekle(PLAN_GERCEKLESEN_TURU, yuk(9));
    expect(is.kapsam).toBe('uyelik-1');
    kapsam.deger = 'uyelik-2'; // kurum/uyelik degisti
    await kuyruk.bosalt();
    expect(f).not.toHaveBeenCalled();
    expect(kuyruk.bekleyenler()).toHaveLength(1);
    kapsam.deger = null; // oturum yok
    await kuyruk.bosalt();
    expect(f).not.toHaveBeenCalled();
    kapsam.deger = 'uyelik-1';
    await kuyruk.bosalt();
    expect(f).toHaveBeenCalledWith('g1', 9);
    expect(kuyruk.bekleyenler()).toHaveLength(0);
  });
});
