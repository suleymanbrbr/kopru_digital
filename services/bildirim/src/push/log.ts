import {
  belirtecMaskele,
  type PushMesaji,
  type PushSaglayici,
  type PushSonucu,
} from './saglayici.js';

interface Log {
  info(nesne: Record<string, unknown>, mesaj: string): void;
}

/**
 * Gelistirme saglayicisi: gonderimi yapilandirilmis loga yazar ve basarili sayar. Betik ve yerel denemeler
 * `push gönderimi (log sağlayıcı)` satirini arar. Belirtec maskelenir.
 */
export function logSaglayici(log: Log): PushSaglayici {
  return {
    ad: 'log',
    gonder(mesajlar: readonly PushMesaji[]): Promise<PushSonucu[]> {
      return Promise.resolve(
        mesajlar.map((m) => {
          log.info(
            {
              gonderimId: m.gonderimId,
              belirtec: belirtecMaskele(m.belirtec),
              platform: m.platform,
              title: m.title,
              body: m.body,
              data: m.data,
              ...(m.badge === undefined ? {} : { badge: m.badge }),
            },
            'push gönderimi (log sağlayıcı)',
          );
          return { tur: 'gonderildi', mesajId: `log-${m.gonderimId}` } as const;
        }),
      );
    },
  };
}
