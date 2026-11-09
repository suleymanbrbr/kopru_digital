import {
  bugunTarihi,
  gunAraligi,
  haftaninGunu,
  tarihEkle,
  tarihGecerliMi,
  yerelDenUtc,
  yerelSaat,
  yerelTarih,
} from './saat';

describe('saat dilimi islemleri', () => {
  it('UTC aninin kurum yerel gunu ve saati: Istanbul UTC+3', () => {
    // 21:30Z = ertesi gun 00:30 Istanbul
    expect(yerelTarih('2026-11-08T21:30:00Z', 'Europe/Istanbul')).toBe('2026-11-09');
    expect(yerelSaat('2026-11-08T21:30:00Z', 'Europe/Istanbul')).toBe('00:30');
  });

  it('cihaz saat diliminden bagimsizdir: ayni an farkli kurum diliminde farkli gun', () => {
    expect(yerelTarih('2026-11-08T21:30:00Z', 'America/New_York')).toBe('2026-11-08');
    expect(yerelSaat('2026-11-08T21:30:00Z', 'America/New_York')).toBe('16:30');
  });

  it('yerel tarih+saat -> UTC (gidis donus)', () => {
    const utc = yerelDenUtc('2026-11-09', '14:00', 'Europe/Istanbul');
    expect(utc).toBe('2026-11-09T11:00:00.000Z');
    expect(yerelSaat(utc, 'Europe/Istanbul')).toBe('14:00');
  });

  it('yaz saati gecisinde (New York, Mart) dogru ofseti kullanir', () => {
    expect(yerelDenUtc('2026-03-07', '12:00', 'America/New_York')).toBe('2026-03-07T17:00:00.000Z');
    expect(yerelDenUtc('2026-03-09', '12:00', 'America/New_York')).toBe('2026-03-09T16:00:00.000Z');
  });

  it('gun araligi yerel gece yarisindan gece yarisina', () => {
    expect(gunAraligi('2026-11-09', 'Europe/Istanbul')).toEqual({
      baslangic: '2026-11-08T21:00:00.000Z',
      bitis: '2026-11-09T21:00:00.000Z',
    });
  });

  it('bugun kurum saat dilimine gore', () => {
    const an = Date.parse('2026-11-08T22:00:00Z');
    expect(bugunTarihi('Europe/Istanbul', an)).toBe('2026-11-09');
    expect(bugunTarihi('UTC', an)).toBe('2026-11-08');
  });

  it('tarih aritmetigi ve hafta gunu', () => {
    expect(tarihEkle('2026-12-31', 1)).toBe('2027-01-01');
    expect(tarihEkle('2026-03-01', -1)).toBe('2026-02-28');
    expect(haftaninGunu('2026-11-09')).toBe('MO');
    expect(haftaninGunu('2026-11-08')).toBe('SU');
  });

  it('tarih dogrulama', () => {
    expect(tarihGecerliMi('2026-02-30')).toBe(false);
    expect(tarihGecerliMi('2026-02-28')).toBe(true);
    expect(tarihGecerliMi('9.11.2026')).toBe(false);
  });
});
