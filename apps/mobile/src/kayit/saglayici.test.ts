import { tarihAraligi, sonErisimBitis, suresiDolduMu, varsayilanKayitBasligi } from './kurallar';
import { baglantiyiCoz, baglantiyiDuzenle, saglayiciTani } from './saglayici';

describe('saglayiciTani', () => {
  it.each([
    ['https://us02web.zoom.us/rec/share/abc', 'zoom'],
    ['https://zoom.us/rec/share/abc', 'zoom'],
    ['https://drive.google.com/file/d/1/view', 'drive'],
    ['https://docs.google.com/document/d/1', 'drive'],
    ['https://www.youtube.com/watch?v=1', 'youtube'],
    ['https://youtu.be/abc', 'youtube'],
    ['https://1drv.ms/v/s!abc', 'onedrive'],
    ['https://firma.sharepoint.com/x', 'onedrive'],
    ['https://ornek.com/kayit', 'diger'],
  ])('%s -> %s', (url, beklenen) => {
    expect(saglayiciTani(url)).toBe(beklenen);
  });

  it('benzer alan adlari taninmaz (sonek eslesmesi nokta ister)', () => {
    expect(saglayiciTani('https://evilzoom.us/x')).toBe('diger');
    expect(saglayiciTani('https://zoom.us.kotu.com/x')).toBe('diger');
    expect(saglayiciTani('bu bir url degil')).toBe('diger');
  });
});

describe('baglantiyiDuzenle ve baglantiyiCoz', () => {
  it('kirpar, semasiz adrese https ekler, http ve bosluklu metne dokunmaz', () => {
    expect(baglantiyiDuzenle('  https://zoom.us/j/1 \n')).toBe('https://zoom.us/j/1');
    expect(baglantiyiDuzenle('zoom.us/rec/share/abc')).toBe('https://zoom.us/rec/share/abc');
    expect(baglantiyiDuzenle('http://zoom.us/j/1')).toBe('http://zoom.us/j/1');
    expect(baglantiyiDuzenle('merhaba dunya')).toBe('merhaba dunya');
  });

  it('gecerli baglanti saglayiciyla doner', () => {
    expect(baglantiyiCoz('HTTPS://youtu.be/abc')).toEqual({
      gecerli: true,
      url: 'https://youtu.be/abc',
      saglayici: 'youtube',
    });
    expect(baglantiyiCoz('drive.google.com/file/d/1')).toMatchObject({
      gecerli: true,
      saglayici: 'drive',
    });
  });

  it('nedenler: bos, https, gecersiz, kullanici, uzun', () => {
    expect(baglantiyiCoz('   ')).toEqual({ gecerli: false, neden: 'bos' });
    expect(baglantiyiCoz('http://zoom.us/j/1')).toEqual({ gecerli: false, neden: 'https' });
    expect(baglantiyiCoz('merhaba')).toEqual({ gecerli: false, neden: 'https' });
    expect(baglantiyiCoz('https://yerel')).toEqual({ gecerli: false, neden: 'gecersiz' });
    expect(baglantiyiCoz('https://kullanici:parola@zoom.us/x')).toEqual({
      gecerli: false,
      neden: 'kullanici',
    });
    expect(baglantiyiCoz(`https://ornek.com/${'a'.repeat(2000)}`)).toEqual({
      gecerli: false,
      neden: 'uzun',
    });
  });
});

describe('kayit kurallari', () => {
  it('tarihAraligi kurum gunune gore dahil aralik uretir', () => {
    expect(tarihAraligi('hepsi', '2026-11-10')).toEqual({});
    expect(tarihAraligi('bugun', '2026-11-10')).toEqual({
      baslangic: '2026-11-10',
      bitis: '2026-11-10',
    });
    expect(tarihAraligi('yedi', '2026-11-10')).toEqual({
      baslangic: '2026-11-04',
      bitis: '2026-11-10',
    });
    expect(tarihAraligi('otuz', '2026-11-10')).toEqual({
      baslangic: '2026-10-12',
      bitis: '2026-11-10',
    });
  });

  it('sonErisimBitis: yok -> undefined, aksi halde simdi + gun', () => {
    const simdi = Date.parse('2026-11-10T10:00:00Z');
    expect(sonErisimBitis('yok', simdi)).toBeUndefined();
    expect(sonErisimBitis('7', simdi)).toBe('2026-11-17T10:00:00.000Z');
    expect(sonErisimBitis('90', simdi)).toBe('2027-02-08T10:00:00.000Z');
  });

  it('suresiDolduMu durum ya da tarihten', () => {
    const simdi = Date.parse('2026-11-10T10:00:00Z');
    expect(suresiDolduMu({ gecerlilikBitis: null, durum: 'aktif' }, simdi)).toBe(false);
    expect(suresiDolduMu({ gecerlilikBitis: '2026-11-09T00:00:00Z', durum: 'aktif' }, simdi)).toBe(
      true,
    );
    expect(suresiDolduMu({ gecerlilikBitis: null, durum: 'suresi_doldu' }, simdi)).toBe(true);
  });

  it('varsayilan baslik tekil ve cogul', () => {
    expect(varsayilanKayitBasligi('Denklemler', 1, 1)).toBe('Denklemler kaydı');
    expect(varsayilanKayitBasligi('Denklemler', 2, 3)).toBe('Denklemler kaydı 2');
    expect(varsayilanKayitBasligi('', 1, 1)).toContain('kaydı');
  });
});
