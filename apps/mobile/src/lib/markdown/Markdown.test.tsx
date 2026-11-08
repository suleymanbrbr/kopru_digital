import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { Linking } from 'react-native';

import { Markdown } from './Markdown';

interface Dugum {
  tip: string;
  props: Record<string, unknown>;
}

/** Bilesenleri (kancasiz, saf) cagirarak genisletir; metinleri ve ogeleri toplar. */
function topla(ogeler: ReactNode, cikti: { metin: string[]; dugumler: Dugum[] }) {
  if (ogeler === null || ogeler === undefined || typeof ogeler === 'boolean') return;
  if (typeof ogeler === 'string' || typeof ogeler === 'number') {
    cikti.metin.push(String(ogeler));
    return;
  }
  if (Array.isArray(ogeler)) {
    for (const o of ogeler as ReactNode[]) topla(o, cikti);
    return;
  }
  if (!isValidElement(ogeler)) return;
  const el = ogeler as ReactElement<Record<string, unknown>>;
  const sinif =
    typeof el.type === 'function' &&
    !!(el.type.prototype as { isReactComponent?: unknown } | undefined)?.isReactComponent;
  if (typeof el.type === 'function' && !sinif) {
    topla((el.type as (p: unknown) => ReactNode)(el.props), cikti);
    return;
  }
  cikti.dugumler.push({ tip: typeof el.type === 'string' ? el.type : 'bilesen', props: el.props });
  topla(el.props.children as ReactNode, cikti);
}

function ciz(kaynak: string) {
  const cikti = { metin: [] as string[], dugumler: [] as Dugum[] };
  topla(Markdown({ kaynak }), cikti);
  return { ...cikti, tamMetin: cikti.metin.join('') };
}

describe('Markdown (mobil)', () => {
  it('ham isaretler gorunmez; baslik rolu ve liste isaretleri uretilir', () => {
    const { tamMetin, dugumler } = ciz(
      '## Baslik\n\nBir **kalin** metin.\n\n> Alinti\n\n1. Bir\n2. Iki\n\n- A\n',
    );
    expect(tamMetin).toContain('Baslik');
    expect(tamMetin).toContain('kalin');
    expect(tamMetin).toContain('1.');
    expect(tamMetin).toContain('•');
    expect(tamMetin).not.toMatch(/[#*>]/);
    expect(dugumler.some((d) => d.props.accessibilityRole === 'header')).toBe(true);
  });

  it('https baglantisi Linking ile acilir', () => {
    const ac = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    const { dugumler } = ciz('[kurum](https://ornek.com/kvkk)');
    const baglanti = dugumler.find((d) => d.props.accessibilityRole === 'link');
    (baglanti?.props.onPress as () => void)();
    expect(ac).toHaveBeenCalledWith('https://ornek.com/kvkk');
    ac.mockRestore();
  });

  it('javascript: baglantisi tiklanamaz, etiket duz metin kalir', () => {
    const { dugumler, tamMetin } = ciz('[kotu](javascript:alert(1))');
    expect(dugumler.some((d) => d.props.accessibilityRole === 'link')).toBe(false);
    expect(dugumler.some((d) => typeof d.props.onPress === 'function')).toBe(false);
    expect(tamMetin).toContain('kotu');
  });

  it('bilinmeyen token duz metin olarak gorunur', () => {
    const { tamMetin } = ciz('```\nkod blogu\n```\n\n<script>x</script>');
    expect(tamMetin).toContain('kod blogu');
    expect(tamMetin).toContain('<script>x</script>');
  });
});
