import { guvenliBaglanti, markdownAyristir } from './ayristir';

const ORNEK = `# Ana baslik

Bir **kalin** ve *italik* metin, [kurum](https://ornek.com/kvkk) baglantisi.

> Alinti metni

1. Birinci
2. Ikinci

- Madde A
- Madde B
`;

describe('markdownAyristir', () => {
  it('baslik, paragraf, alinti ve listeleri ayirir', () => {
    expect(markdownAyristir(ORNEK).map((b) => b.tur)).toEqual([
      'baslik',
      'paragraf',
      'alinti',
      'liste',
      'liste',
    ]);
  });

  it('kalin, italik ve baglanti satir ici ogeleri uretir', () => {
    const p = markdownAyristir(ORNEK)[1];
    if (p?.tur !== 'paragraf') throw new Error('paragraf bekleniyordu');
    expect(p.ic.map((s) => s.tur)).toEqual([
      'metin',
      'kalin',
      'metin',
      'italik',
      'metin',
      'baglanti',
      'metin',
    ]);
  });

  it('javascript: ve data: baglantilarini baglanti yapmaz, etiketi korur', () => {
    const [p] = markdownAyristir('[tikla](javascript:alert(1)) [veri](data:text/html;base64,AAAA)');
    const json = JSON.stringify(p);
    expect(json).not.toContain('"baglanti"');
    expect(json).toContain('tikla');
    expect(json).toContain('veri');
    expect(guvenliBaglanti('javascript:alert(1)')).toBeNull();
    expect(guvenliBaglanti('https://ornek.com')).toBe('https://ornek.com/');
  });

  it('bilinmeyen token turleri sessizce dusmez, ham metin olarak kalir', () => {
    const kaynak = [
      '```',
      'kod blogu',
      '```',
      '',
      '| a | b |',
      '|---|---|',
      '| 1 | 2 |',
      '',
      '<script>alert(1)</script>',
      '',
      'Satir ici `kod` ve ~~silinmis~~ metin.',
    ].join('\n');
    const json = JSON.stringify(markdownAyristir(kaynak));
    for (const parca of [
      'kod blogu',
      '| 1 | 2 |',
      '<script>alert(1)</script>',
      '`kod`',
      '~~silinmis~~',
    ]) {
      expect(json).toContain(parca);
    }
  });
});
