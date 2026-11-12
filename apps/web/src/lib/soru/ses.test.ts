import { describe, expect, it } from 'vitest';

import {
  KAYIT_BASLANGIC,
  SES_EN_FAZLA_SN,
  kayitIlerlet,
  sesBicimiSec,
  sureBicimle,
  sureSaniyeYap,
  type KayitDurumu,
} from './ses';

describe('sesBicimiSec', () => {
  it('audio/mp4 destekleniyorsa onu secer (Safari)', () => {
    expect(sesBicimiSec(() => true)).toEqual({
      kayitTuru: 'audio/mp4',
      mime: 'audio/mp4',
      uzanti: 'm4a',
    });
  });

  it('mp4 yoksa webm opus secer; medyaya parametresiz mime bildirir (Chrome/Firefox)', () => {
    const b = sesBicimiSec((m) => m.startsWith('audio/webm'));
    expect(b).toEqual({ kayitTuru: 'audio/webm;codecs=opus', mime: 'audio/webm', uzanti: 'webm' });
  });

  it('opus parametresi yoksa duz webm; hicbiri yoksa null', () => {
    expect(sesBicimiSec((m) => m === 'audio/webm')?.kayitTuru).toBe('audio/webm');
    expect(sesBicimiSec(() => false)).toBeNull();
  });
});

describe('sure', () => {
  it('m:ss bicimler', () => {
    expect(sureBicimle(0)).toBe('0:00');
    expect(sureBicimle(65.9)).toBe('1:05');
    expect(sureBicimle(180)).toBe('3:00');
    expect(sureBicimle(-5)).toBe('0:00');
  });

  it('olculen ms sure_sn icin 1..180 araligina yuvarlanir', () => {
    expect(sureSaniyeYap(100)).toBe(1);
    expect(sureSaniyeYap(2300)).toBe(3);
    expect(sureSaniyeYap(999_000)).toBe(SES_EN_FAZLA_SN);
    expect(SES_EN_FAZLA_SN).toBe(180);
  });
});

describe('kayit durum makinesi ve 180 sn siniri', () => {
  const kaydediyor = kayitIlerlet(KAYIT_BASLANGIC, { tur: 'basla' });

  it('baslayinca kaydediyor olur ve gecen sure izlenir', () => {
    expect(kaydediyor).toEqual({ asama: 'kaydediyor', gecenMs: 0, siniraUlasti: false });
    expect(kayitIlerlet(kaydediyor, { tur: 'tik', gecenMs: 12_345 })).toMatchObject({
      asama: 'kaydediyor',
      gecenMs: 12_345,
    });
  });

  it('179,9 sn dolmamis sayilir; 180 snde kendiliginden biter ve siniraUlasti isaretlenir', () => {
    const neredeyse = kayitIlerlet(kaydediyor, { tur: 'tik', gecenMs: 179_900 });
    expect(neredeyse.asama).toBe('kaydediyor');
    const bitti = kayitIlerlet(neredeyse, { tur: 'tik', gecenMs: 180_000 });
    expect(bitti).toEqual({ asama: 'bitti', gecenMs: 180_000, siniraUlasti: true });
    // 180 snden sonra gelen tik'ler durumu degistirmez
    expect(kayitIlerlet(bitti, { tur: 'tik', gecenMs: 190_000 })).toBe(bitti);
  });

  it('sinir ozellestirilebilir (ayardaki ses_azami_sn)', () => {
    const d = kayitIlerlet(kaydediyor, { tur: 'tik', gecenMs: 30_000 }, 30);
    expect(d).toMatchObject({ asama: 'bitti', siniraUlasti: true, gecenMs: 30_000 });
  });

  it('elle bitirme siniraUlasti olmadan bitirir; tik kayit disinda yok sayilir', () => {
    const d = kayitIlerlet({ ...kaydediyor, gecenMs: 5000 }, { tur: 'bitir' });
    expect(d).toMatchObject({ asama: 'bitti', siniraUlasti: false, gecenMs: 5000 });
    const bos: KayitDurumu = KAYIT_BASLANGIC;
    expect(kayitIlerlet(bos, { tur: 'tik', gecenMs: 1000 })).toBe(bos);
    expect(kayitIlerlet(bos, { tur: 'bitir' })).toBe(bos);
  });

  it('hata ve sifirla', () => {
    expect(kayitIlerlet(kaydediyor, { tur: 'hata' }).asama).toBe('hata');
    expect(kayitIlerlet(kaydediyor, { tur: 'sifirla' })).toBe(KAYIT_BASLANGIC);
  });
});
