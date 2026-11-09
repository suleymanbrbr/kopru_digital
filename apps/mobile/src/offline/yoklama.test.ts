import type { DersAdapter, YoklamaSatiri } from '../api/operasyonTipleri';
import { ApiHata } from '../api/tipler';
import { bellekKv } from '../depo/kv';
import { OfflineKuyruk } from './kuyruk';
import { yoklamaIsleyicisiKaydet, yoklamaKuyrugaAl, type YoklamaYuku } from './yoklama';

const SATIR: YoklamaSatiri = {
  ogrenciId: 'o1',
  durum: 'geldi',
  isaretlenmeAt: '2026-11-09T09:00:00.000Z',
};
const YUK: YoklamaYuku = {
  dersId: 'd1',
  dersBaslik: 'Matematik',
  dersBaslangic: '2026-11-09T08:00:00.000Z',
  satirlar: [SATIR],
};

function kur(kaydet: jest.Mock) {
  let n = 0;
  let simdi = 1000;
  const durum = { kapsam: 'u1' as string | null, cevrimici: true };
  const q = new OfflineKuyruk({
    depo: bellekKv(),
    yeniId: () => `istek-${String(++n)}`,
    kapsam: () => durum.kapsam,
    cevrimiciMi: () => durum.cevrimici,
    simdi: () => simdi,
    gecikme: () => 10,
  });
  yoklamaIsleyicisiKaydet(q, () => ({ yoklamaKaydet: kaydet }) as unknown as DersAdapter);
  return { q, durum, ilerlet: (ms: number) => (simdi += ms) };
}

describe('yoklama.kaydet kuyrugu', () => {
  it('her denemede ayni Idempotency-Key (istekId) ve ayni isaretlenme_at gonderilir', async () => {
    const kaydet = jest
      .fn()
      .mockRejectedValueOnce(new ApiHata('ag'))
      .mockResolvedValue({
        dersId: 'd1',
        sonuclar: [{ ogrenciId: 'o1', sonuc: 'yeni', kalanKredi: 3 }],
      });
    const { q, ilerlet } = kur(kaydet);
    yoklamaKuyrugaAl(q, YUK);
    await q.bosalt();
    expect(q.bekleyenler()).toHaveLength(1);
    ilerlet(100);
    const s = await q.bosalt();
    expect(s).toEqual({ gonderilen: 1, bekleyen: 0, basarisiz: 0 });
    expect(kaydet).toHaveBeenCalledTimes(2);
    const [a, b] = kaydet.mock.calls as [string, YoklamaSatiri[], string][];
    expect(a[2]).toBe('istek-1');
    expect(b[2]).toBe('istek-1');
    expect(a[1][0]?.isaretlenmeAt).toBe('2026-11-09T09:00:00.000Z');
    expect(b[1][0]?.isaretlenmeAt).toBe(a[1][0]?.isaretlenmeAt);
  });

  it('kalici 4xx hata basarisiz listesine duser ve hata kodu saklanir', async () => {
    const kaydet = jest
      .fn()
      .mockRejectedValue(
        new ApiHata('izin_yok', 'kilitli', { durum: 403, ayrinti: 'yoklama_kilitli' }),
      );
    const { q } = kur(kaydet);
    yoklamaKuyrugaAl(q, YUK);
    const s = await q.bosalt();
    expect(s).toEqual({ gonderilen: 0, bekleyen: 0, basarisiz: 1 });
    expect(q.basarisizlar()[0]?.sonHataKodu).toBe('yoklama_kilitli');
    expect(q.basarisizlar()[0]?.istekId).toBe('istek-1');
  });

  it("sunucu 'eski' sonuc dondururse is sessizce kaybolmaz: basarisiz yoklama_eski", async () => {
    const kaydet = jest.fn().mockResolvedValue({
      dersId: 'd1',
      sonuclar: [{ ogrenciId: 'o1', sonuc: 'eski', kalanKredi: null }],
    });
    const { q } = kur(kaydet);
    yoklamaKuyrugaAl(q, YUK);
    await q.bosalt();
    expect(q.basarisizlar()).toHaveLength(1);
    expect(q.basarisizlar()[0]?.sonHataKodu).toBe('yoklama_eski');
  });

  it('429 gecici sayilir: is kuyrukta kalir', async () => {
    const kaydet = jest.fn().mockRejectedValue(new ApiHata('cok_istek', undefined, { durum: 429 }));
    const { q } = kur(kaydet);
    yoklamaKuyrugaAl(q, YUK);
    await q.bosalt();
    expect(q.bekleyenler()).toHaveLength(1);
    expect(q.basarisizlar()).toHaveLength(0);
  });

  it('kapsam degisince baska kurumun isi gonderilmez; kapsam donunce gonderilir', async () => {
    const kaydet = jest.fn().mockResolvedValue({ dersId: 'd1', sonuclar: [] });
    const { q, durum } = kur(kaydet);
    durum.cevrimici = false;
    yoklamaKuyrugaAl(q, YUK); // u1 kapsaminda eklendi, cevrimdisi
    durum.cevrimici = true;
    durum.kapsam = 'u2'; // kullanici baska kuruma gecti
    await q.bosalt();
    expect(kaydet).not.toHaveBeenCalled();
    expect(q.bekleyenler()).toHaveLength(1);
    durum.kapsam = null; // oturum yok
    await q.bosalt();
    expect(kaydet).not.toHaveBeenCalled();
    durum.kapsam = 'u1';
    await q.bosalt();
    expect(kaydet).toHaveBeenCalledTimes(1);
  });

  it('basarisiz is tekrar denenince ayni istekId ile kuyruga doner', async () => {
    const kaydet = jest
      .fn()
      .mockRejectedValueOnce(
        new ApiHata('dogrulama', undefined, { durum: 422, ayrinti: 'ders_henuz_baslamadi' }),
      )
      .mockResolvedValue({
        dersId: 'd1',
        sonuclar: [{ ogrenciId: 'o1', sonuc: 'yeni', kalanKredi: null }],
      });
    const { q } = kur(kaydet);
    yoklamaKuyrugaAl(q, YUK);
    await q.bosalt();
    q.yenidenDene('istek-1');
    await q.bosalt();
    expect((kaydet.mock.calls as [string, unknown, string][]).map((c) => c[2])).toEqual([
      'istek-1',
      'istek-1',
    ]);
  });
});
