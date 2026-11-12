import { describe, expect, it } from 'vitest';

import { baglantilariAyir, kayitFormunuHazirla, type KayitFormGirdisi } from './form';
import { degistirilebilirMi, oranlar, sonGunlerAraligi, yuzdeYaz } from './geri-bildirim';
import { guvenliAdres, urlCoz } from './saglayici';

const IST = 'Europe/Istanbul';
const SIMDI = new Date('2026-11-11T09:00:00Z');

function girdi(ek: Partial<KayitFormGirdisi> = {}): KayitFormGirdisi {
  return {
    metin: 'https://us02web.zoom.us/rec/share/abc',
    ekler: {},
    sonErisim: '',
    gorunurluk: 'grup',
    ogrenciIdleri: [],
    konuId: null,
    saatDilimi: IST,
    simdi: SIMDI,
    ...ek,
  };
}

describe('saglayici tanima', () => {
  it('alan adindan taniyor', () => {
    const t = (u: string) => {
      const s = urlCoz(u);
      return s.ok ? s.saglayici : s.hata;
    };
    expect(t('https://us02web.zoom.us/rec/x')).toBe('zoom');
    expect(t('https://drive.google.com/file/d/1/view')).toBe('drive');
    expect(t('https://youtu.be/abc')).toBe('youtube');
    expect(t('https://www.youtube.com/watch?v=1')).toBe('youtube');
    expect(t('https://1drv.ms/x')).toBe('onedrive');
    expect(t('https://ornek.com/x')).toBe('diger');
  });

  it('benzer alan adini tanimaz, gecersizleri reddeder', () => {
    expect(urlCoz('https://evilzoom.us/x')).toMatchObject({ ok: true, saglayici: 'diger' });
    expect(urlCoz('http://zoom.us/x')).toEqual({ ok: false, hata: 'https' });
    expect(urlCoz('https://user:pw@zoom.us/x')).toEqual({ ok: false, hata: 'kullanici_bilgisi' });
    expect(urlCoz('https://')).toMatchObject({ ok: false });
    expect(urlCoz(`https://a.com/${'x'.repeat(2001)}`)).toEqual({ ok: false, hata: 'uzun' });
    expect(guvenliAdres('javascript:alert(1)')).toBeNull();
    expect(guvenliAdres('https://a.com')).toBe('https://a.com');
  });
});

describe('baglantilari ayir', () => {
  it('satir ve bosluklarla boler, tekrarlari atar', () => {
    expect(baglantilariAyir('https://a.com/1\n https://b.com/2  https://a.com/1\n\n')).toEqual([
      'https://a.com/1',
      'https://b.com/2',
    ]);
    expect(baglantilariAyir('   ')).toEqual([]);
  });
});

describe('kayit formu dogrulama', () => {
  it('bos metni reddeder', () => {
    const s = kayitFormunuHazirla(girdi({ metin: ' ' }));
    expect(s.ok).toBe(false);
  });

  it('gecersiz baglantiyi satirina hata olarak yazar', () => {
    const s = kayitFormunuHazirla(girdi({ metin: 'http://zoom.us/x' }));
    expect(s.ok).toBe(false);
    if (!s.ok) expect(Object.keys(s.hatalar.linkler)).toEqual(['http://zoom.us/x']);
  });

  it('varsayilan baslik, tek baglanti, grup gorunurlugu', () => {
    const s = kayitFormunuHazirla(girdi());
    expect(s.ok).toBe(true);
    if (s.ok) {
      expect(s.govde).toMatchObject({
        tur: 'kayit',
        gorunurluk: 'grup',
        linkler: [{ baslik: 'Zoom ders kaydı', url: 'https://us02web.zoom.us/rec/share/abc' }],
      });
      expect(s.govde).not.toHaveProperty('ogrenci_idleri');
    }
  });

  it('ayni saglayicidan cok baglanti numaralanir; parola yalniz Zoom icin gider', () => {
    const s = kayitFormunuHazirla(
      girdi({
        metin: 'https://zoom.us/a https://zoom.us/b https://drive.google.com/c',
        ekler: {
          'https://zoom.us/a': { parola: ' gizli ' },
          'https://drive.google.com/c': { parola: 'yok sayilir', baslik: 'Notlar' },
        },
      }),
    );
    expect(s.ok).toBe(true);
    if (s.ok) {
      const l = s.govde.linkler as { baslik: string; parola?: string }[];
      expect(l.map((x) => x.baslik)).toEqual([
        'Zoom ders kaydı (1)',
        'Zoom ders kaydı (2)',
        'Notlar',
      ]);
      expect(l[0]?.parola).toBe('gizli');
      expect(l[2]).not.toHaveProperty('parola');
    }
  });

  it('materyal turunde tur gonderilmez', () => {
    const s = kayitFormunuHazirla(girdi({ tur: 'materyal' }));
    expect(s.ok && s.govde).not.toHaveProperty('tur');
  });

  it('gecmis son erisim tarihini reddeder, bugunu kabul eder', () => {
    expect(kayitFormunuHazirla(girdi({ sonErisim: '2026-11-10' })).ok).toBe(false);
    const s = kayitFormunuHazirla(girdi({ sonErisim: '2026-11-11' }));
    expect(s.ok).toBe(true);
    if (s.ok) {
      const l = s.govde.linkler as { gecerlilik_bitis_at: string }[];
      expect(l[0]?.gecerlilik_bitis_at).toBe('2026-11-11T20:59:00.000Z');
    }
  });

  it('secili ogrenciler icin en az bir ogrenci ister', () => {
    expect(kayitFormunuHazirla(girdi({ gorunurluk: 'secili_ogrenciler' })).ok).toBe(false);
    const s = kayitFormunuHazirla(girdi({ gorunurluk: 'secili_ogrenciler', ogrenciIdleri: ['a'] }));
    expect(s.ok && s.govde.ogrenci_idleri).toEqual(['a']);
  });

  it('en cok 20 baglanti', () => {
    const metin = Array.from({ length: 21 }, (_, i) => `https://a.com/${String(i)}`).join('\n');
    expect(kayitFormunuHazirla(girdi({ metin })).ok).toBe(false);
  });
});

describe('geri bildirim yardimcilari', () => {
  it('yuzde ve oranlar', () => {
    expect(yuzdeYaz(0.857)).toBe('%86');
    expect(oranlar({ anladim: 0, kismen: 0, anlamadim: 0 })).toEqual({
      anladim: 0,
      kismen: 0,
      anlamadim: 0,
    });
    expect(oranlar({ anladim: 1, kismen: 1, anlamadim: 2 }).anlamadim).toBe(0.5);
  });

  it('son gunler araligi bugun dahil', () => {
    expect(sonGunlerAraligi(30, IST, SIMDI)).toEqual({
      baslangic: '2026-10-13',
      bitis: '2026-11-11',
    });
  });

  it('degistirme penceresi', () => {
    expect(degistirilebilirMi('2026-11-12T00:00:00Z', Date.parse('2026-11-11T00:00:00Z'))).toBe(
      true,
    );
    expect(degistirilebilirMi('2026-11-10T00:00:00Z', Date.parse('2026-11-11T00:00:00Z'))).toBe(
      false,
    );
  });
});
