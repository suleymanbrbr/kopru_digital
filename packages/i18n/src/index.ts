import { type Messages, tr } from './tr.js';

export { tr };
export type { Messages };

type Paths<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Paths<T[K], `${P}${K}.`>;
}[keyof T & string];

export type MessageKey = Paths<Messages>;

/** `{ad}` biciminde degiskenleri doldurur; anahtar yoksa anahtarin kendisini dondurur. */
export function createT(messages: Messages = tr) {
  return function t(key: MessageKey, vars?: Record<string, string | number>): string {
    let node: unknown = messages;
    for (const part of key.split('.')) {
      node = (node as Record<string, unknown> | undefined)?.[part];
    }
    if (typeof node !== 'string') return key;
    return vars ? node.replace(/\{(\w+)\}/g, (m, name: string) => String(vars[name] ?? m)) : node;
  };
}

export const t = createT();

export { kurusBicimle, tlMetniniKurusaCevir } from './para.js';
