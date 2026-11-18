import {
  DuyuruAliciListesiSema,
  DuyuruDetaySema,
  DuyuruOkunduYanitiSema,
  DuyuruOkuyanlarSema,
  DuyuruSema,
  DuyuruSilYanitiSema,
  DuyuruYonetimListesiSema,
} from '@kopru/contracts';
import { beforeEach, describe, expect, it } from 'vitest';

import { bildirimMock, bildirimMockSifirla } from './bildirim-mock';
import { mockDuyuruKimligi } from './duyuru-mock';

const cagir = (kurum: string, yontem: string, yol: string, govde?: unknown, sorgu = {}) =>
  bildirimMock({
    yontem,
    yol: `kurumlar/${kurum}/duyurular${yol}`,
    sorgu: new URLSearchParams(sorgu),
    govde,
    basliklar: {},
  });

beforeEach(() => {
  bildirimMockSifirla();
});

describe('duyuru mock: alici (ogrenci)', () => {
  const K = 'kurum-atlas';

  it('sabitler uste siralanir, sozlesmeye uyar; okunmamis suzgeci calisir', () => {
    const liste = DuyuruAliciListesiSema.parse(cagir(K, 'GET', '').govde);
    expect(liste.toplam).toBe(4);
    expect(liste.ogeler[0]?.sabit).toBe(true);
    const okunmamis = DuyuruAliciListesiSema.parse(
      cagir(K, 'GET', '', undefined, { okunmamis: 'true' }).govde,
    );
    expect(okunmamis.ogeler.map((o) => o.okundu_at)).toEqual([null, null]);
  });

  it('acilinca okundu isaretlenir (idempotent) ve listeden okunmamis duser', () => {
    const id = mockDuyuruKimligi(1);
    const ilk = DuyuruOkunduYanitiSema.parse(cagir(K, 'POST', `/${id}/okundu`, {}).govde);
    const ikinci = DuyuruOkunduYanitiSema.parse(cagir(K, 'POST', `/${id}/okundu`, {}).govde);
    expect(ikinci.okundu_at).toBe(ilk.okundu_at);
    const okunmamis = DuyuruAliciListesiSema.parse(
      cagir(K, 'GET', '', undefined, { okunmamis: 'true' }).govde,
    );
    expect(okunmamis.toplam).toBe(1);
    const detay = DuyuruDetaySema.parse(cagir(K, 'GET', `/${id}`).govde);
    expect(detay.okundu_at).toBe(ilk.okundu_at);
    expect(detay.yonetim).toBeNull();
  });

  it('ogrenci yazamaz, yonetim listesini goremez; olmayan duyuru 404', () => {
    expect(cagir(K, 'POST', '', { baslik: 'a', govde: 'b', hedef_turu: 'kurum' }).durum).toBe(403);
    expect(cagir(K, 'GET', '/yonetim').durum).toBe(403);
    expect(cagir(K, 'GET', `/${mockDuyuruKimligi(99)}`).durum).toBe(404);
  });
});

describe('duyuru mock: yazar (ogretmen)', () => {
  const K = 'kurum-ege';

  it('taslak -> yayinla -> okuyanlar akisi; yayindaki degismez, yalniz sabit ve bitis duzenlenir', () => {
    const grupId = DuyuruYonetimListesiSema.parse(cagir(K, 'GET', '/yonetim').govde).ogeler.find(
      (d) => d.hedef_turu === 'grup',
    )?.hedef_id;
    expect(grupId).toBeDefined();
    const taslak = DuyuruSema.parse(
      cagir(K, 'POST', '', {
        baslik: 'Yeni',
        govde: 'Gövde',
        hedef_turu: 'grup',
        hedef_id: grupId,
      }).govde,
    );
    expect(taslak.durum).toBe('taslak');
    const yayin = DuyuruSema.parse(cagir(K, 'POST', `/${taslak.id}/yayinla`, {}).govde);
    expect(yayin.durum).toBe('yayinda');
    expect(yayin.alici_sayisi).toBeGreaterThan(0);
    expect(cagir(K, 'POST', `/${taslak.id}/yayinla`, {}).durum).toBe(409);
    expect(cagir(K, 'PATCH', `/${taslak.id}`, { baslik: 'x' }).durum).toBe(409);
    const sabit = DuyuruSema.parse(cagir(K, 'PATCH', `/${taslak.id}`, { sabit: true }).govde);
    expect(sabit.sabit).toBe(true);
    DuyuruOkuyanlarSema.parse(cagir(K, 'GET', `/${taslak.id}/okuyanlar`).govde);
    const arsiv = DuyuruSema.parse(cagir(K, 'POST', `/${taslak.id}/arsivle`, {}).govde);
    expect(arsiv.durum).toBe('arsiv');
    expect(DuyuruSilYanitiSema.parse(cagir(K, 'DELETE', `/${taslak.id}`).govde).silindi).toBe(true);
    expect(cagir(K, 'GET', `/${taslak.id}`).durum).toBe(404);
  });

  it('ogretmen kurum hedefine yazamaz (403 yasak); gecersiz govde 400', () => {
    const r = cagir(K, 'POST', '', { baslik: 'a', govde: 'b', hedef_turu: 'kurum' });
    expect(r.durum).toBe(403);
    expect(r.govde).toMatchObject({ error: { code: 'yasak' } });
    expect(cagir(K, 'POST', '', { baslik: '', govde: 'b', hedef_turu: 'kurum' }).durum).toBe(400);
    expect(
      cagir(K, 'POST', '', {
        baslik: 'a'.repeat(201),
        govde: 'b',
        hedef_turu: 'grup',
        hedef_id: 'x',
      }).durum,
    ).toBe(400);
  });

  it('yazilan duyuru yazarin kendi kutusuna dusmez', () => {
    const once = DuyuruAliciListesiSema.parse(cagir(K, 'GET', '').govde).toplam;
    const t = DuyuruSema.parse(
      cagir(K, 'POST', '', {
        baslik: 'A',
        govde: 'B',
        hedef_turu: 'grup',
        hedef_id: mockDuyuruKimligi(50),
      }).govde,
    );
    cagir(K, 'POST', `/${t.id}/yayinla`, {});
    expect(DuyuruAliciListesiSema.parse(cagir(K, 'GET', '').govde).toplam).toBe(once);
  });
});
