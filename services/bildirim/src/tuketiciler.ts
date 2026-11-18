import {
  hesapAtamaDegistiV1,
  hesapGrupDegistiV1,
  hesapGrupUyesiDegistiV1,
  hesapKademeDegistiV1,
  hesapKurumDegistiV1,
  hesapModulAyariDegistiV1,
  hesapUyelikDegistiV1,
} from '@kopru/contracts';
import {
  startConsumer,
  type Database,
  type Tuketici,
  type TuketiciBaglami,
} from '@kopru/service-kit';
import type { NatsConnection } from 'nats';

import { sonradanKatilanaDagit } from './duyuru.js';
import { ESLEMELER } from './eslemeler/index.js';
import {
  atamaDegisti,
  grupDegisti,
  grupUyesiDegisti,
  kademeDegisti,
  kurumDegisti,
  modulAyariDegisti,
  uyelikDegisti,
} from './kopya.js';

export interface TuketiciBagimliliklari {
  nats: Pick<NatsConnection, 'jetstream' | 'jetstreamManager'>;
  /** `bildirim_app` baglantisi: RLS atlanamaz, `kiraci: 'olaydan'` ile kurum baglami ayarlanir. */
  db: Pick<Database, 'orm'>;
  log: TuketiciBaglami['log'];
  /** Testlerde paylasilan NATS'ta cakismamak icin tuketici adi soneki (uretimde bos). */
  sonek?: string;
  baslangic?: 'hepsi' | 'yeni';
}

/**
 * Tuketicileri baslatir: `bildirim.kopya` (hesap kopyalari) ve `bildirim.uretim` (olaydan bildirim; olay
 * eslemeleri `eslemeler/index.ts` listesinden).
 *
 * TODO(bildirim.kopya): `hesap.kullanici.degisti.v1` ve `hesap.kullanici.silindi.v1` sozlesmeleri
 * `@kopru/contracts`ta yok (kullanici duzeyinde olay, zarf `kurumId` zorunlu); gelince ayni tuketiciye
 * kullanici kopyasi ve veri temizligi (cihaz/tercih/ayar silme) eklenir. Abonelik olaylari da (kurum
 * kopyasinin abonelik alanlari) sonraki pakette.
 */
export async function tuketicileriBaslat(b: TuketiciBagimliliklari): Promise<Tuketici[]> {
  const ek = b.sonek ?? '';
  const ortak = {
    nats: b.nats,
    db: b.db,
    log: b.log,
    kiraci: 'olaydan',
    ...(b.baslangic ? { baslangic: b.baslangic } : {}),
  } as const;

  const kopya = await startConsumer({
    ...ortak,
    tuketici: `bildirim.kopya${ek}`,
    olaylar: [
      hesapKurumDegistiV1,
      hesapKademeDegistiV1,
      hesapUyelikDegistiV1,
      hesapGrupDegistiV1,
      hesapGrupUyesiDegistiV1,
      hesapAtamaDegistiV1,
      hesapModulAyariDegistiV1,
    ] as const,
    isle: async (tx, olay) => {
      switch (olay.type) {
        case 'hesap.kurum.degisti':
          return kurumDegisti(tx, olay);
        case 'hesap.kademe.degisti':
          return kademeDegisti(tx, olay);
        case 'hesap.uyelik.degisti':
          return uyelikDegisti(tx, olay);
        case 'hesap.grup.degisti':
          return grupDegisti(tx, olay);
        case 'hesap.grup_uyesi.degisti':
          await grupUyesiDegisti(tx, olay);
          // Duyuru: sonradan katilan uyeye yayindaki duyurular (push'suz kutu bildirimi).
          await sonradanKatilanaDagit(tx, {
            kurumId: olay.kurumId,
            grupId: olay.data.grup_id,
            ogrenciId: olay.data.ogrenci_id,
            bitisTarihi: olay.data.bitis_tarihi,
          });
          return;
        case 'hesap.atama.degisti':
          return atamaDegisti(tx, olay);
        case 'hesap.modul_ayari.degisti':
          return modulAyariDegisti(tx, olay);
      }
    },
  });

  const eslemeler = new Map(ESLEMELER.map((e) => [e.olay.type, e]));
  const uretim = await startConsumer({
    ...ortak,
    tuketici: `bildirim.uretim${ek}`,
    olaylar: ESLEMELER.map((e) => e.olay),
    isle: async (tx, olay, baglam) => {
      const esleme = eslemeler.get((olay as { type: string }).type);
      if (!esleme) return;
      await esleme.isle(tx, olay, baglam);
    },
  });
  return [kopya, uretim];
}
