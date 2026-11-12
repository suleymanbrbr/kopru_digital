import {
  dersGeriBildirimVerildiV1,
  dersKaynakIzlendiV1,
  dersYoklamaKaydedildiV1,
  hesapAtamaDegistiV1,
  hesapGrupDegistiV1,
  hesapGrupUyesiDegistiV1,
  hesapKurumDegistiV1,
  hesapModulAyariDegistiV1,
  hesapUyelikDegistiV1,
  ogrenmeDenemeGirildiV1,
  ogrenmeOdevIncelendiV1,
  ogrenmeOdevTeslimEdildiV1,
  ogrenmePlanGoreviGuncellendiV1,
  ogrenmeSoruCozulduV1,
  ogrenmeSoruSorildiV1,
} from '@kopru/contracts';
import {
  startConsumer,
  type Database,
  type Tuketici,
  type TuketiciBaglami,
} from '@kopru/service-kit';
import type { NatsConnection } from 'nats';

import {
  atamaDegisti,
  grupDegisti,
  grupUyesiDegisti,
  kurumDegisti,
  modulAyariDegisti,
  uyelikDegisti,
} from './kopya.js';
import {
  denemeIsle,
  geriBildirimIsle,
  kayitIzlendiIsle,
  odevIncelendiIsle,
  odevTeslimIsle,
  planGoreviIsle,
  soruCozulduIsle,
  soruSorildiIsle,
  yoklamaIsle,
} from './xp-tuketici.js';

export interface TuketiciBagimliliklari {
  nats: Pick<NatsConnection, 'jetstream' | 'jetstreamManager'>;
  /** `motivasyon_app` baglantisi: RLS atlanamaz, `kiraci: 'olaydan'` ile kurum baglami ayarlanir. */
  db: Pick<Database, 'orm'>;
  log: TuketiciBaglami['log'];
  /** Testlerde paylasilan NATS'ta cakismamak icin tuketici adi soneki (uretimde bos). */
  sonek?: string;
  baslangic?: 'hepsi' | 'yeni';
}

/**
 * Tuketicileri baslatir: `motivasyon.kopya` (hesap kopyalari) ve `motivasyon.xp` (XP kurallari).
 *
 * TODO(motivasyon.kopya): `hesap.kullanici.silindi.v1` sozlesmesi `@kopru/contracts`ta yok (kullanici
 * duzeyinde olay, zarf `kurumId` zorunlu); gelince ayni tuketiciye veri temizligi eklenir.
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
    tuketici: `motivasyon.kopya${ek}`,
    olaylar: [
      hesapKurumDegistiV1,
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
        case 'hesap.uyelik.degisti':
          return uyelikDegisti(tx, olay);
        case 'hesap.grup.degisti':
          return grupDegisti(tx, olay);
        case 'hesap.grup_uyesi.degisti':
          return grupUyesiDegisti(tx, olay);
        case 'hesap.atama.degisti':
          return atamaDegisti(tx, olay);
        case 'hesap.modul_ayari.degisti':
          return modulAyariDegisti(tx, olay);
      }
    },
  });

  const xp = await startConsumer({
    ...ortak,
    tuketici: `motivasyon.xp${ek}`,
    olaylar: [
      dersYoklamaKaydedildiV1,
      dersGeriBildirimVerildiV1,
      dersKaynakIzlendiV1,
      ogrenmeOdevTeslimEdildiV1,
      ogrenmeOdevIncelendiV1,
      ogrenmePlanGoreviGuncellendiV1,
      ogrenmeDenemeGirildiV1,
      ogrenmeSoruSorildiV1,
      ogrenmeSoruCozulduV1,
    ] as const,
    isle: async (tx, olay) => {
      switch (olay.type) {
        case 'ders.yoklama.kaydedildi':
          return yoklamaIsle(tx, olay);
        case 'ders.geri_bildirim.verildi':
          return geriBildirimIsle(tx, olay);
        case 'ders.kaynak.izlendi':
          return kayitIzlendiIsle(tx, olay);
        case 'ogrenme.odev.teslim_edildi':
          return odevTeslimIsle(tx, olay);
        case 'ogrenme.odev.incelendi':
          return odevIncelendiIsle(tx, olay);
        case 'ogrenme.plan_gorevi.guncellendi':
          return planGoreviIsle(tx, olay);
        case 'ogrenme.deneme.girildi':
          return denemeIsle(tx, olay);
        case 'ogrenme.soru.sorildi':
          return soruSorildiIsle(tx, olay);
        case 'ogrenme.soru.cozuldu':
          return soruCozulduIsle(tx, olay);
      }
    },
  });
  return [kopya, xp];
}
