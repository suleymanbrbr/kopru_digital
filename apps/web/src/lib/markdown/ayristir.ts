import { lexer, type Token, type Tokens } from 'marked';

/**
 * Hukuki metinler (KVKK, kullanim kosullari) markdown olarak gelir. Burada HTML URETILMEZ:
 * `marked.lexer` token'lari kucuk, kapali bir agaca cevrilir; arayuz bu agaci kendi bilesenleriyle
 * cizer. Tanimadigimiz her token duz metin (`raw`) olarak korunur: hukuki metin eksik gorunemez.
 * Ham HTML de calistirilmaz, metin olarak gosterilir.
 */
export type Satir =
  | { tur: 'metin'; metin: string }
  | { tur: 'kalin'; ic: Satir[] }
  | { tur: 'italik'; ic: Satir[] }
  /** `href` yalniz http/https; baska sema ise baglanti hic uretilmez (cocuklar duz metin kalir). */
  | { tur: 'baglanti'; href: string; ic: Satir[] };

export type Blok =
  | { tur: 'paragraf'; ic: Satir[] }
  | { tur: 'baslik'; seviye: 1 | 2 | 3 | 4 | 5 | 6; ic: Satir[] }
  | { tur: 'alinti'; bloklar: Blok[] }
  | { tur: 'liste'; sirali: boolean; baslangic: number; ogeler: Blok[][] }
  /** Tanimsiz blok: ham metni oldugu gibi gosterilir. */
  | { tur: 'duz'; metin: string };

/** Tehlikeli semalari (`javascript:`, `data:` ...) eler; yalniz mutlak http/https kabul edilir. */
export function guvenliBaglanti(href: string): string | null {
  try {
    const url = new URL(href.trim());
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

function satirlar(tokenlar: Token[] | undefined, yedek: string): Satir[] {
  if (!tokenlar || tokenlar.length === 0) return yedek ? [{ tur: 'metin', metin: yedek }] : [];
  return tokenlar.flatMap(satir);
}

function satir(t: Token): Satir[] {
  switch (t.type) {
    case 'text': {
      const x = t as Tokens.Text;
      // Ic ice token varsa (liste ogesi, vurgu) onlari kullan; yoksa kodu cozulmus metin.
      return x.tokens && x.tokens.length > 0
        ? x.tokens.flatMap(satir)
        : [{ tur: 'metin', metin: x.text }];
    }
    case 'escape':
      return [{ tur: 'metin', metin: (t as Tokens.Escape).text }];
    case 'br':
      return [{ tur: 'metin', metin: '\n' }];
    case 'strong':
      return [{ tur: 'kalin', ic: satirlar((t as Tokens.Strong).tokens, t.raw) }];
    case 'em':
      return [{ tur: 'italik', ic: satirlar((t as Tokens.Em).tokens, t.raw) }];
    case 'link': {
      const x = t as Tokens.Link;
      const ic = satirlar(x.tokens, x.text);
      const href = guvenliBaglanti(x.href);
      // Guvensiz sema: baglanti olmaz, ama etiketi okunur kalir.
      return href ? [{ tur: 'baglanti', href, ic }] : ic;
    }
    default:
      // codespan, del, image, html, ... : sessizce dusurme, ham metni goster.
      return t.raw ? [{ tur: 'metin', metin: t.raw }] : [];
  }
}

function blok(t: Token): Blok[] {
  switch (t.type) {
    case 'space':
      return [];
    case 'paragraph': {
      const x = t as Tokens.Paragraph;
      return [{ tur: 'paragraf', ic: satirlar(x.tokens, x.text) }];
    }
    case 'text': {
      // Sik liste ogesinde sarmalanmamis metin blogu.
      const x = t as Tokens.Text;
      return [{ tur: 'paragraf', ic: satirlar(x.tokens, x.text) }];
    }
    case 'heading': {
      const x = t as Tokens.Heading;
      const seviye = Math.min(Math.max(x.depth, 1), 6) as 1 | 2 | 3 | 4 | 5 | 6;
      return [{ tur: 'baslik', seviye, ic: satirlar(x.tokens, x.text) }];
    }
    case 'blockquote':
      return [{ tur: 'alinti', bloklar: bloklar((t as Tokens.Blockquote).tokens) }];
    case 'list': {
      const x = t as Tokens.List;
      return [
        {
          tur: 'liste',
          sirali: x.ordered,
          baslangic: typeof x.start === 'number' ? x.start : 1,
          ogeler: x.items.map((o) => bloklar(o.tokens)),
        },
      ];
    }
    default:
      // code, table, hr, html, def, ... : hukuki metin eksik gorunmesin diye ham metin.
      return t.raw.trim() ? [{ tur: 'duz', metin: t.raw.replace(/\n+$/, '') }] : [];
  }
}

function bloklar(tokenlar: Token[]): Blok[] {
  return tokenlar.flatMap(blok);
}

/** Markdown govdesini guvenli blok agacina cevirir. */
export function markdownAyristir(kaynak: string): Blok[] {
  return bloklar(lexer(kaynak));
}
