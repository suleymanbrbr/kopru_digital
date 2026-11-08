import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { markdownAyristir } from './ayristir';
import { Markdown } from './markdown';

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
    const turler = markdownAyristir(ORNEK).map((b) => b.tur);
    expect(turler).toEqual(['baslik', 'paragraf', 'alinti', 'liste', 'liste']);
  });

  it('javascript: baglantisini baglanti yapmaz ama etiketi korur', () => {
    const [p] = markdownAyristir('[tikla](javascript:alert(1))');
    expect(JSON.stringify(p)).not.toContain('baglanti');
    expect(JSON.stringify(p)).toContain('tikla');
  });
});

describe('Markdown', () => {
  it('ham isaretler gorunmeden ogeleri cizer', () => {
    const { container } = render(<Markdown kaynak={ORNEK} />);
    expect(screen.getByRole('heading', { level: 4, name: 'Ana baslik' })).toBeInTheDocument();
    expect(container.querySelector('strong')?.textContent).toBe('kalin');
    expect(container.querySelector('em')?.textContent).toBe('italik');
    expect(container.querySelector('blockquote')?.textContent).toContain('Alinti metni');
    expect(container.querySelectorAll('ol > li')).toHaveLength(2);
    expect(container.querySelectorAll('ul > li')).toHaveLength(2);
    expect(container.textContent).not.toMatch(/[#*>]/);
  });

  it('http/https baglantisi yeni sekmede ve noopener ile acilir', () => {
    render(<Markdown kaynak="[kurum](https://ornek.com/kvkk)" />);
    const a = screen.getByRole('link', { name: 'kurum' });
    expect(a).toHaveAttribute('href', 'https://ornek.com/kvkk');
    expect(a).toHaveAttribute('target', '_blank');
    expect(a).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('javascript: ve data: baglantilari tiklanamaz, etiket duz metin kalir', () => {
    const { container } = render(
      <Markdown kaynak={'[kotu](javascript:alert(1)) ve [veri](data:text/html;base64,AAAA)'} />,
    );
    expect(screen.queryByRole('link')).toBeNull();
    expect(container.querySelector('[href]')).toBeNull();
    expect(container.textContent).toContain('kotu');
    expect(container.textContent).toContain('veri');
  });

  it('bilinmeyen token turleri sessizce dusmez, duz metin olarak gorunur', () => {
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
    const { container } = render(<Markdown kaynak={kaynak} />);
    expect(container.textContent).toContain('kod blogu');
    expect(container.textContent).toContain('| 1 | 2 |');
    expect(container.textContent).toContain('<script>alert(1)</script>');
    expect(container.textContent).toContain('`kod`');
    expect(container.textContent).toContain('~~silinmis~~');
    // Ham HTML calistirilmaz: DOM'a eleman olarak girmez.
    expect(container.querySelector('script')).toBeNull();
  });
});
