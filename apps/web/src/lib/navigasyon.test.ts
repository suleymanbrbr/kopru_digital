import { MODUL_KODLARI, type ModulKodu } from '@kopru/contracts';
import { describe, expect, it } from 'vitest';

import {
  bolumDurumu,
  gorunurOgeler,
  gruplaginaAyir,
  mobilBolme,
  navOgeleri,
  type Rol,
} from './navigasyon';

const tumModuller: readonly ModulKodu[] = MODUL_KODLARI;
const yollar = (rol: Rol, acikModuller: readonly ModulKodu[] = tumModuller) =>
  gorunurOgeler({ rol, acikModuller }).map((o) => o.yol);

describe('navigasyon yapilandirmasi', () => {
  it('ogretmen menusu belirtilen sirayla gelir', () => {
    expect(yollar('ogretmen')).toEqual([
      'bugun',
      'takvim',
      'yoklama',
      'ogrenciler',
      'gruplar',
      'odevler',
      'planlar',
      'denemeler',
      'mufredat',
      'sorular',
      'kayitlar',
      'finans',
    ]);
  });

  it('ogrenci menusu belirtilen sirayla gelir', () => {
    expect(yollar('ogrenci')).toEqual([
      'bugun',
      'takvim',
      'gorevler',
      'odevlerim',
      'planlar',
      'denemeler',
      'soru-sor',
      'kayitlarim',
      'karakterim',
    ]);
  });

  it('yonetici ve sahip ek yonetim ogelerini gorur; abonelik yalnizca sahipte', () => {
    expect(yollar('yonetici')).toEqual(
      expect.arrayContaining(['kurum', 'ogretmenler', 'siniflar', 'moduller']),
    );
    expect(yollar('yonetici')).not.toContain('abonelik');
    expect(yollar('sahip')).toContain('abonelik');
    expect(yollar('ogretmen')).not.toContain('kurum');
  });

  it('geri bildirim ozeti yalniz yonetici ve sahipte; kayit menuleri modul kapaliyken gizlenir', () => {
    expect(yollar('yonetici')).toContain('geri-bildirim');
    expect(yollar('sahip')).toContain('geri-bildirim');
    expect(yollar('ogretmen')).not.toContain('geri-bildirim');
    expect(yollar('ogrenci')).not.toContain('geri-bildirim');
    const kapali = tumModuller.filter((m) => m !== 'kayitlar' && m !== 'geri_bildirim');
    expect(yollar('sahip', kapali)).not.toContain('geri-bildirim');
    expect(yollar('sahip', kapali)).not.toContain('kayitlar');
    expect(yollar('ogrenci', kapali)).not.toContain('kayitlarim');
    expect(bolumDurumu('kayitlarim', { rol: 'ogrenci', acikModuller: kapali }).durum).toBe(
      'modul-kapali',
    );
    expect(bolumDurumu('geri-bildirim', { rol: 'ogretmen', acikModuller: tumModuller }).durum).toBe(
      'yetkisiz',
    );
  });

  it('bireysel kurumda (solo hoca) kurum yapisi menuleri gizlenir', () => {
    const solo = gorunurOgeler({
      rol: 'sahip',
      acikModuller: tumModuller,
      kurumTur: 'bireysel',
    }).map((o) => o.yol);
    expect(solo).not.toContain('kurum');
    expect(solo).not.toContain('ogretmenler');
    expect(solo).not.toContain('siniflar');
    expect(solo).toEqual(expect.arrayContaining(['takvim', 'yoklama', 'finans', 'abonelik']));
    const kurum = gorunurOgeler({ rol: 'sahip', acikModuller: tumModuller, kurumTur: 'kurum' });
    expect(kurum.map((o) => o.yol)).toContain('ogretmenler');
  });

  it('ogrenci takvimi gorur ama yoklama ve finans menusu yoktur', () => {
    const ogrenci = yollar('ogrenci');
    expect(ogrenci).toContain('takvim');
    expect(ogrenci).not.toContain('yoklama');
    expect(ogrenci).not.toContain('finans');
    expect(bolumDurumu('takvim', { rol: 'ogrenci', acikModuller: tumModuller }).durum).toBe('acik');
    expect(bolumDurumu('yoklama', { rol: 'ogrenci', acikModuller: tumModuller }).durum).toBe(
      'yetkisiz',
    );
  });

  it('kapali modulun ogeleri gizlenir, cekirdek ogeler kalir', () => {
    const acik = tumModuller.filter((m) => m !== 'finans' && m !== 'deneme');
    const ogretmen = yollar('ogretmen', acik);
    expect(ogretmen).not.toContain('finans');
    expect(ogretmen).not.toContain('denemeler');
    expect(ogretmen).toContain('ogrenciler');
    expect(yollar('ogrenci', [])).toEqual(['bugun']);
  });

  it('veli icin faz 1 menusu bos kalir', () => {
    expect(yollar('veli')).toEqual([]);
  });

  it('her ogenin anahtari ve (rol, yol) cifti benzersizdir', () => {
    const anahtarlar = navOgeleri.map((o) => o.anahtar);
    expect(new Set(anahtarlar).size).toBe(anahtarlar.length);
    const ciftler = navOgeleri.flatMap((o) => o.roller.map((r) => `${r}:${o.yol}`));
    expect(new Set(ciftler).size).toBe(ciftler.length);
  });
});

describe('modul kodlari', () => {
  it('her nav ogesinin modulu sozlesmedeki kodlardan biridir', () => {
    for (const oge of navOgeleri) {
      if (oge.modul !== null) expect(MODUL_KODLARI).toContain(oge.modul);
    }
  });
});

describe('bolumDurumu', () => {
  const ogretmen = { rol: 'ogretmen', acikModuller: ['takvim'] } as const;

  it('acik, modul kapali, yetkisiz ve bilinmeyen bolumleri ayirir', () => {
    expect(bolumDurumu('takvim', ogretmen).durum).toBe('acik');
    expect(bolumDurumu('finans', ogretmen).durum).toBe('modul-kapali');
    expect(bolumDurumu('abonelik', ogretmen).durum).toBe('yetkisiz');
    expect(bolumDurumu('yok-boyle-sayfa', ogretmen).durum).toBe('yok');
  });
});

describe('mobil bolme ve gruplama', () => {
  it('alt menude en cok 4 oge, kalanlar cekmecede', () => {
    const ogeler = gorunurOgeler({ rol: 'ogretmen', acikModuller: tumModuller });
    const { alt, cekmece } = mobilBolme(ogeler);
    expect(alt.map((o) => o.yol)).toEqual(['bugun', 'takvim', 'ogrenciler', 'odevler']);
    expect(alt.length + cekmece.length).toBe(ogeler.length);
  });

  it('modul kapaliysa alt menu siradaki onceliklilerle dolar', () => {
    const ogeler = gorunurOgeler({ rol: 'ogrenci', acikModuller: ['odev'] });
    expect(mobilBolme(ogeler).alt.map((o) => o.yol)).toEqual(['bugun', 'odevlerim']);
  });

  it('yonetim grubu yalnizca yetkili rolde ayri grup olur', () => {
    const grup = (rol: Rol) =>
      gruplaginaAyir(gorunurOgeler({ rol, acikModuller: tumModuller })).map((g) => g.grup);
    expect(grup('ogretmen')).toEqual(['calisma']);
    expect(grup('sahip')).toEqual(['calisma', 'yonetim']);
  });
});
