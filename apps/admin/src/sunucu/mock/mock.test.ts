import { beforeEach, describe, expect, it } from 'vitest';

import {
  durumuSifirla,
  mockEpostaGiris,
  mockErisimAl,
  mockKodDogrula,
  mockPlatform,
  MOCK_KOD,
} from '.';

interface Yanit {
  durum: number;
  govde?: unknown;
}
const kod = (y: Yanit) => (y.govde as { error?: { code?: string } }).error?.code;

function oturumAc(telefon = '532 123 45 67') {
  const g = mockKodDogrula(telefon, MOCK_KOD).govde as { oturum_belirteci: string };
  const erisim = mockErisimAl(g.oturum_belirteci);
  if (!erisim) throw new Error('erişim yok');
  return erisim.belirtec;
}

const cagri = (erisim: string, yontem: string, yol: string, govde?: unknown, sorgu = '') =>
  mockPlatform({ erisim, yontem, yol, sorgu: new URLSearchParams(sorgu), govde });

function dogrulanmisOturum(telefon?: string) {
  const e = oturumAc(telefon);
  cagri(e, 'POST', 'ikinci-adim/kur');
  expect(cagri(e, 'POST', 'ikinci-adim/onayla', { kod: MOCK_KOD }).durum).toBe(200);
  return e;
}

beforeEach(() => {
  durumuSifirla();
});

describe('mock giriş', () => {
  it('yanlış kod 400 kod_gecersiz, yanlış parola 401', () => {
    expect(kod(mockKodDogrula('532 123 45 67', '000000'))).toBe('kod_gecersiz');
    expect(mockEpostaGiris('a@b.com', 'yanlis').durum).toBe(401);
  });
});

describe('mock platform kapısı', () => {
  it('belirteçsiz 401; rolsüz hesap platform_yetkisi_yok', () => {
    expect(cagri('mock-erisim.yok', 'GET', 'ben').durum).toBe(401);
    expect(kod(cagri(oturumAc('500 000 00 00'), 'GET', 'ben'))).toBe('platform_yetkisi_yok');
  });

  it('ikinci adım olmadan kurumlar 403 ikinci_adim_gerekli', () => {
    const e = oturumAc();
    expect(kod(cagri(e, 'GET', 'kurumlar'))).toBe('ikinci_adim_gerekli');
    // ben ve ikinci adım uçları muaf
    expect(cagri(e, 'GET', 'ben').durum).toBe(200);
  });

  it('yanlış kodla doğrulanmaz, doğru kodla açılır; kurulan 2FA yeniden kurulamaz', () => {
    const e = oturumAc();
    cagri(e, 'POST', 'ikinci-adim/kur');
    expect(kod(cagri(e, 'POST', 'ikinci-adim/onayla', { kod: '111111' }))).toBe('kod_gecersiz');
    expect(cagri(e, 'POST', 'ikinci-adim/onayla', { kod: MOCK_KOD }).durum).toBe(200);
    expect(cagri(e, 'GET', 'kurumlar').durum).toBe(200);
    expect(kod(cagri(e, 'POST', 'ikinci-adim/kur'))).toBe('ikinci_adim_kurulu');
  });

  it('yedek kod tek kullanımlıktır', () => {
    const e = oturumAc();
    const kur = cagri(e, 'POST', 'ikinci-adim/kur').govde as { yedek_kodlar: string[] };
    cagri(e, 'POST', 'ikinci-adim/onayla', { kod: MOCK_KOD });
    const yedek = kur.yedek_kodlar[0] ?? '';
    const e2 = oturumAc();
    expect(cagri(e2, 'POST', 'ikinci-adim/dogrula', { yedek_kod: yedek }).durum).toBe(200);
    const e3 = oturumAc();
    expect(kod(cagri(e3, 'POST', 'ikinci-adim/dogrula', { yedek_kod: yedek }))).toBe(
      'kod_gecersiz',
    );
  });

  it('destek rolü yazamaz ve yönetici uçlarına giremez', () => {
    const e = dogrulanmisOturum('501 000 00 00');
    const kurum = (cagri(e, 'GET', 'kurumlar').govde as { kurumlar: { id: string }[] }).kurumlar[0];
    expect(
      kod(
        cagri(e, 'PUT', `kurumlar/${kurum?.id}/moduller/finans`, {
          acik: false,
          neden: 'yeterince uzun neden',
        }),
      ),
    ).toBe('platform_izin_yok');
    expect(kod(cagri(e, 'GET', 'denetim'))).toBe('platform_izin_yok');
    expect(kod(cagri(e, 'GET', 'mufredat/kataloglar'))).toBe('platform_izin_yok');
    expect(kod(cagri(e, 'GET', 'motivasyon/ayarlar'))).toBe('platform_izin_yok');
  });
});

describe('mock kurumlar ve denetim', () => {
  it('arama i/ı ve aksan farkı gözetmez; 1 karakter reddedilir', () => {
    const e = dogrulanmisOturum();
    const ara = (q: string) =>
      (
        cagri(e, 'GET', 'kurumlar', undefined, `q=${encodeURIComponent(q)}`).govde as {
          kurumlar: { ad: string }[];
        }
      ).kurumlar.map((k) => k.ad);
    expect(ara('isik')).toContain('Ege Işık Dershanesi');
    expect(ara('ISIK')).toContain('Ege Işık Dershanesi');
    expect(cagri(e, 'GET', 'kurumlar', undefined, 'q=e').durum).toBe(400);
  });

  it('modül kapatma neden ister, değişikliği yapar ve denetime yazar', () => {
    const e = dogrulanmisOturum();
    const kurum = (cagri(e, 'GET', 'kurumlar').govde as { kurumlar: { id: string }[] }).kurumlar[0];
    const yol = `kurumlar/${kurum?.id}/moduller/finans`;
    expect(cagri(e, 'PUT', yol, { acik: false, neden: 'kısa' }).durum).toBe(400);
    expect(cagri(e, 'PUT', yol, { acik: false, neden: 'Müşteri talebi üzerine' }).durum).toBe(200);
    const detay = cagri(e, 'GET', `kurumlar/${kurum?.id}`).govde as {
      moduller: { modul_kodu: string; kurum_acik: boolean; kurum_ayari_var: boolean }[];
    };
    expect(detay.moduller.find((m) => m.modul_kodu === 'finans')).toMatchObject({
      kurum_acik: false,
      kurum_ayari_var: true,
    });
    // null: varsayılana dön
    cagri(e, 'PUT', yol, { acik: null, neden: 'Varsayılana dönüş yapıldı' });
    const sonra = cagri(e, 'GET', `kurumlar/${kurum?.id}`).govde as typeof detay;
    expect(sonra.moduller.find((m) => m.modul_kodu === 'finans')).toMatchObject({
      kurum_acik: true,
      kurum_ayari_var: false,
    });
    const denetim = cagri(e, 'GET', 'denetim', undefined, 'eylem=platform.*').govde as {
      kayitlar: { eylem: string; neden: string }[];
    };
    expect(
      denetim.kayitlar.some(
        (k) => k.eylem === 'platform.modul_ayarla' && k.neden === 'Müşteri talebi üzerine',
      ),
    ).toBe(true);
  });

  it('taklit yalnız o kurumun üyesine; sonlandırınca belirteç geçersiz', () => {
    const e = dogrulanmisOturum();
    const kurum = (
      cagri(e, 'GET', 'kurumlar').govde as {
        kurumlar: { id: string; sahipler: { kullanici_id: string }[] }[];
      }
    ).kurumlar[0];
    const hedef = kurum?.sahipler[0]?.kullanici_id;
    expect(
      cagri(e, 'POST', 'taklit', { hedef_kullanici_id: hedef, kurum_id: kurum?.id, neden: 'kısa' })
        .durum,
    ).toBe(400);
    expect(
      cagri(e, 'POST', 'taklit', {
        hedef_kullanici_id: '0190a000-0000-7000-8000-00000000ffff',
        kurum_id: kurum?.id,
        neden: 'Müşteri şikayetini incelemek',
      }).durum,
    ).toBe(404);
    const t = cagri(e, 'POST', 'taklit', {
      hedef_kullanici_id: hedef,
      kurum_id: kurum?.id,
      neden: 'Müşteri şikayetini incelemek',
    }).govde as { access_token: string; taklit_id: string; expires_in: number };
    expect(t.expires_in).toBe(900);
    expect(cagri(e, 'POST', `taklit/${t.taklit_id}/sonlandir`).durum).toBe(200);
  });
});

describe('mock motivasyon', () => {
  it('geçersiz ayar 422 ayar_gecersiz ve alan listesi verir, değişiklik yok 422', () => {
    const e = dogrulanmisOturum();
    const r = cagri(e, 'PUT', 'motivasyon/ayarlar', {
      neden: 'deneme',
      kurallar: { yoklama_geldi: { xp: 400 } },
    });
    expect(r.durum).toBe(422);
    expect(kod(r)).toBe('ayar_gecersiz');
    const hatalar = (r.govde as { error: { details: { hatalar: { alan: string }[] } } }).error
      .details.hatalar;
    expect(hatalar.map((h) => h.alan)).toContain('kurallar.yoklama_geldi.xp');
    expect(
      kod(
        cagri(e, 'PUT', 'motivasyon/ayarlar', {
          neden: 'deneme',
          kurallar: { yoklama_geldi: { xp: 20 } },
        }),
      ),
    ).toBe('degisiklik_yok');
  });

  it('varsayımı bozan değişiklik uyarı üretir; geri alma yeni sürüm yazar', () => {
    const e = dogrulanmisOturum();
    const r = cagri(e, 'PUT', 'motivasyon/ayarlar', {
      neden: 'Deneme ayarı',
      beklenen_surum: 1,
      kurallar: { yoklama_geldi: { xp: 5 } },
    });
    expect(r.durum).toBe(200);
    const s = r.govde as { surum: number; uyarilar: { kod: string }[] };
    expect(s.surum).toBe(2);
    expect(s.uyarilar.map((u) => u.kod)).toContain('haftalik_xp_degisti');

    // Eski sürüm numarasıyla yazma: çakışma
    expect(
      kod(
        cagri(e, 'PUT', 'motivasyon/ayarlar', {
          neden: 'x yy',
          beklenen_surum: 1,
          tavanlar: { genel: 250 },
        }),
      ),
    ).toBe('surum_catismasi');

    const g = cagri(e, 'POST', 'motivasyon/ayarlar/geri-al', { surum: 1, neden: 'Geri alındı' });
    expect(g.durum).toBe(201);
    expect(g.govde).toMatchObject({ surum: 3, geri_alinan_surum: 1 });
    const liste = cagri(e, 'GET', 'motivasyon/ayarlar').govde as {
      gecerli: { degerler: { kurallar: { yoklama_geldi: { xp: number } } } };
      gecmis: unknown[];
    };
    expect(liste.gecerli.degerler.kurallar.yoklama_geldi.xp).toBe(20);
    expect(liste.gecmis).toHaveLength(3);
  });
});

describe('mock müfredat', () => {
  const kok = 'mufredat/kataloglar/lgs';

  it('taslak aç → işlem → fark → yayın; ikinci taslak 409, boş yayın 409', () => {
    const e = dogrulanmisOturum();
    expect(kod(cagri(e, 'POST', `${kok}/taslak/yayinla`))).toBe('taslak_yok');
    expect(cagri(e, 'POST', `${kok}/taslak`, { ad: '2027 LGS' }).durum).toBe(201);
    expect(kod(cagri(e, 'POST', `${kok}/taslak`, { ad: 'ikinci' }))).toBe('taslak_var');
    expect(kod(cagri(e, 'POST', `${kok}/taslak/yayinla`))).toBe('degisiklik_yok');

    // not zorunlu
    const agac = cagri(e, 'GET', `${kok}/surumler/2/agac`).govde as {
      konular: { id: string; ad: string }[];
    };
    const hedef = agac.konular.find((k) => k.ad === 'Üslü İfadeler');
    expect(
      cagri(e, 'POST', `${kok}/taslak/konular/${hedef?.id}/adlandir`, { ad: 'Üslü Sayılar' }).durum,
    ).toBe(400);
    expect(
      cagri(e, 'POST', `${kok}/taslak/konular/${hedef?.id}/adlandir`, {
        ad: 'Üslü Sayılar',
        not: 'düzeltme',
      }).durum,
    ).toBe(200);

    const fark = cagri(e, 'GET', `${kok}/surumler/2/fark`).govde as {
      ozet: Record<string, number>;
    };
    expect(fark.ozet).toMatchObject({ yeniden_adlandirilan: 1, eklenen: 0 });

    const y = cagri(e, 'POST', `${kok}/taslak/yayinla`);
    expect(y.durum).toBe(200);
    expect(
      (y.govde as { bildirilen_kurum_sayisi: number }).bildirilen_kurum_sayisi,
    ).toBeGreaterThan(0);
    // Yayınlanan sürüm artık değiştirilemez
    expect(
      kod(
        cagri(e, 'POST', `${kok}/taslak/konular`, {
          ad: 'x',
          brans_kodu: 'mat',
          seviye: 'unite',
          not: 'n',
        }),
      ),
    ).toBe('taslak_yok');
  });

  it('taşıma kendi altına, birleştirme farklı seviyeye reddedilir', () => {
    const e = dogrulanmisOturum();
    cagri(e, 'POST', `${kok}/taslak`, { ad: '2027 LGS' });
    const k = (
      cagri(e, 'GET', `${kok}/surumler/2/agac`).govde as { konular: { id: string; ad: string }[] }
    ).konular;
    const id = (ad: string) => k.find((x) => x.ad === ad)?.id;
    expect(
      kod(
        cagri(e, 'POST', `${kok}/taslak/konular/${id('Sayılar ve İşlemler')}/tasi`, {
          ust_id: id('Çarpanlar ve Katlar'),
          not: 'n',
        }),
      ),
    ).toBe('konu_ust_gecersiz');
    expect(
      kod(
        cagri(e, 'POST', `${kok}/taslak/konular/${id('Mitoz')}/birlestir`, {
          hedef_id: id('Cebir'),
          not: 'n',
        }),
      ),
    ).toBe('birlestirme_gecersiz');
  });
});

describe('mock abonelik ve platform askısı', () => {
  function ilkKurum(e: string) {
    const k = (cagri(e, 'GET', 'kurumlar').govde as { kurumlar: { id: string }[] }).kurumlar[0];
    return `kurumlar/${k?.id ?? ''}`;
  }
  const NEDEN = 'Müşteri talebi üzerine düzeltme';

  it('detayda abonelik özeti ve platform askısı bulunur; geçmiş/ödemeler ayrı uçta', () => {
    const e = dogrulanmisOturum();
    const yol = ilkKurum(e);
    const d = cagri(e, 'GET', yol).govde as {
      abonelik: { abonelik: { durum: string } | null; yazma_kilitli: boolean };
      platform_aski: { askida: boolean };
    };
    expect(d.abonelik.abonelik?.durum).toBe('deneme');
    expect(d.platform_aski.askida).toBe(false);
    const a = cagri(e, 'GET', `${yol}/abonelik`).govde as {
      gecmis: unknown[];
      odemeler: unknown[];
    };
    expect(a.gecmis).toEqual([]);
    expect(a.odemeler).toEqual([]);
  });

  it('deneme uzatma gün sınırını ve nedeni doğrular', () => {
    const e = dogrulanmisOturum();
    const yol = `${ilkKurum(e)}/abonelik/deneme-uzat`;
    expect(cagri(e, 'POST', yol, { gun: 7, neden: 'kısa' }).durum).toBe(400);
    expect(cagri(e, 'POST', yol, { gun: 91, neden: NEDEN }).durum).toBe(400);
    const once = (
      cagri(e, 'GET', ilkKurum(e)).govde as { abonelik: { abonelik: { deneme_bitis_at: string } } }
    ).abonelik.abonelik.deneme_bitis_at;
    expect(cagri(e, 'POST', yol, { gun: 7, neden: NEDEN }).durum).toBe(200);
    const sonra = (
      cagri(e, 'GET', ilkKurum(e)).govde as { abonelik: { abonelik: { deneme_bitis_at: string } } }
    ).abonelik.abonelik.deneme_bitis_at;
    expect(Date.parse(sonra) - Date.parse(once)).toBe(7 * 86_400_000);
  });

  it('kurumsal aktivasyon aboneliği aktif yapar ve eskisini geçmişe alır; olmayan plan 404', () => {
    const e = dogrulanmisOturum();
    const yol = `${ilkKurum(e)}/abonelik/kurumsal-aktivasyon`;
    expect(kod(cagri(e, 'POST', yol, { plan_kodu: 'yok', sozlesme_no: 'S-1', neden: NEDEN }))).toBe(
      'plan_bulunamadi',
    );
    expect(
      cagri(e, 'POST', yol, { plan_kodu: 'kurum', sozlesme_no: 'S-1', neden: NEDEN }).durum,
    ).toBe(200);
    const a = cagri(e, 'GET', `${ilkKurum(e)}/abonelik`).govde as {
      abonelik: { durum: string; kaynak: string };
      gecmis: { durum: string }[];
    };
    expect(a.abonelik).toMatchObject({ durum: 'aktif', kaynak: 'kurumsal' });
    expect(a.gecmis[0]?.durum).toBe('deneme');
    // aktif abonelikte deneme uzatılamaz
    expect(
      kod(cagri(e, 'POST', `${ilkKurum(e)}/abonelik/deneme-uzat`, { gun: 3, neden: NEDEN })),
    ).toBe('conflict');
  });

  it('platform askısı kurumu askıya alır, açar; abonelik kilitliyse askıda kalır; destek yapamaz', () => {
    const e = dogrulanmisOturum();
    const yol = ilkKurum(e);
    const al = cagri(e, 'POST', `${yol}/askiya-al`, { neden: NEDEN }).govde as {
      degisti: boolean;
      durum: string;
      platform_aski: { askida: boolean };
    };
    expect(al).toMatchObject({ degisti: true, durum: 'askida' });
    expect(al.platform_aski.askida).toBe(true);
    expect(
      (cagri(e, 'POST', `${yol}/askiya-al`, { neden: NEDEN }).govde as { degisti: boolean })
        .degisti,
    ).toBe(false);

    cagri(e, 'POST', `${yol}/abonelik/askiya-al`, { neden: NEDEN });
    const ac = cagri(e, 'POST', `${yol}/ac`, { neden: NEDEN }).govde as {
      durum: string;
      abonelik_kilitli: boolean;
    };
    expect(ac).toMatchObject({ durum: 'askida', abonelik_kilitli: true });

    const destek = dogrulanmisOturum('501 000 00 00');
    expect(kod(cagri(destek, 'POST', `${yol}/askiya-al`, { neden: NEDEN }))).toBe(
      'platform_izin_yok',
    );
    expect(kod(cagri(destek, 'POST', `${yol}/abonelik/iptal`, { neden: NEDEN }))).toBe(
      'platform_izin_yok',
    );
  });
});
