import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { gunlukSoruMockSifirla } from './gunluk-soru-mock';
import { mockDurumAnahtari, mockDurumAnahtariAyarla } from './mock-durum';
import { gunlukSoruKoprusu, ogrenmeMockSifirla } from './ogrenme-mock';
import { ogrenmeVekili } from './ogrenme-vekil';

const OGRENCI = 'kurum-atlas';
const OGRETMEN = 'kurum-ege';

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_API_MOCK', '1');
  gunlukSoruMockSifirla();
  ogrenmeMockSifirla();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  mockDurumAnahtariAyarla(undefined);
  gunlukSoruMockSifirla();
  ogrenmeMockSifirla();
});

function istek(yol: string, cerez?: string, ek: { method?: string; body?: unknown } = {}) {
  return new NextRequest(`http://localhost/api/ogrenme/${yol}`, {
    method: ek.method ?? 'GET',
    ...(ek.body === undefined ? {} : { body: JSON.stringify(ek.body) }),
    headers: {
      authorization: 'Bearer tok',
      host: 'localhost',
      origin: 'http://localhost',
      ...(ek.body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(cerez ? { cookie: `mock_durum=${cerez}` } : {}),
    },
  });
}

async function json(yol: string, cerez?: string, ek: { method?: string; body?: unknown } = {}) {
  const y = await ogrenmeVekili(istek(yol, cerez, ek), yol.split('/'));
  return { durum: y.status, govde: (await y.json()) as Record<string, unknown> };
}

const kayitSayisi = async (cerez?: string) =>
  ((await json(`kurumlar/${OGRENCI}/gunluk-soru/kayitlar`, cerez)).govde.kayitlar as unknown[])
    .length;

describe('mock_durum cerezi: gunluk soru ve degerlendirme/kocluk yalitimi', () => {
  it('anahtarli gunluk soru kaydi yalniz kendi durumunda gorunur', async () => {
    const konu =
      gunlukSoruKoprusu(OGRENCI).konular.find((k) => k.ad === 'Bilimsel gösterim')?.id ?? '';
    const varsayilan = await kayitSayisi();
    expect(await kayitSayisi('abc1')).toBe(varsayilan);

    const olustur = await json(`kurumlar/${OGRENCI}/gunluk-soru/kayitlar`, 'abc1', {
      method: 'POST',
      body: { brans_kodu: 'matematik', konu_id: konu, zorluk: 'orta', dogru: 7, yanlis: 2, bos: 1 },
    });
    expect(olustur.durum).toBe(201);

    expect(await kayitSayisi('abc1')).toBe(varsayilan + 1);
    expect(await kayitSayisi()).toBe(varsayilan);
    expect(await kayitSayisi('abc2')).toBe(varsayilan);
  });

  it('anahtarli degerlendirme yalniz kendi durumunda gorunur', async () => {
    const ben = gunlukSoruKoprusu(OGRETMEN).benId;
    const yol = `kurumlar/${OGRETMEN}/ogrenciler/${ben}/degerlendirmeler`;
    const say = async (cerez?: string) => {
      const y = await json(`kurumlar/${OGRETMEN}/ogrenciler/${ben}/kocluk`, cerez);
      return (y.govde.degerlendirmeler as { degerlendirmeler: unknown[] }).degerlendirmeler.length;
    };
    const once = await say();
    const bugun = new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10);
    const yeni = await json(yol, 'abc1', {
      method: 'POST',
      body: {
        donem_baslangic: bugun,
        donem_bitis: bugun,
        calisma_duzeni: 4,
        derse_katilim: 4,
        odev_disiplini: 4,
        anlama_duzeyi: 4,
      },
    });
    expect(yeni.durum).toBe(201);
    expect(await say('abc1')).toBe(once + 1);
    expect(await say()).toBe(once);
  });

  it('cerez mock modu disinda okunmaz; istek gercek servise gider', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_MOCK', '0');
    const fetchMock = vi.fn(() => Promise.resolve(new Response('{}', { status: 200 })));
    vi.stubGlobal('fetch', fetchMock);
    mockDurumAnahtariAyarla(undefined);
    await json(`kurumlar/${OGRENCI}/gunluk-soru/kayitlar`, 'abc1');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(mockDurumAnahtari()).toBe('');
  });
});
