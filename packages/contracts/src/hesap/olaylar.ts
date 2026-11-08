import { z } from 'zod';

import { defineEvent, type EventOf } from '../event.js';
import { RolSema } from './izinler.js';
import { ModulKoduSema } from './moduller.js';

/**
 * `hesap` olaylari (docs/schema/olaylar.md). Yukler `snake_case`, iletisim bilgisi (telefon, e-posta)
 * ve gizli icerik tasimaz. `*.degisti` olaylari kaydin tam guncel durumudur.
 *
 * Not: `hesap.kullanici.degisti` / `hesap.kullanici.silindi` kullanici duzeyindedir (kurum_id yok);
 * mevcut zarf `kurumId` zorunlu kildigi icin zarf kullanici duzeyini destekleyene kadar tanimlanmadi.
 */

export const kurumTurSema = z.enum(['bireysel', 'ekip', 'kurum']);
export const kurumDurumSema = z.enum(['aktif', 'askida', 'kapali']);
export const uyelikDurumSema = z.enum(['davetli', 'aktif', 'askida', 'ayrildi']);

export const hesapKurumDegistiV1 = defineEvent(
  'hesap.kurum.degisti',
  1,
  z.object({
    kurum_id: z.uuid(),
    ad: z.string(),
    tur: kurumTurSema,
    saat_dilimi: z.string(),
    durum: kurumDurumSema,
  }),
);

export const hesapKademeDegistiV1 = defineEvent(
  'hesap.kademe.degisti',
  1,
  z.object({
    kademe_id: z.uuid(),
    ad: z.string(),
    seviye: z.number().int().nullable(),
    arsivlendi: z.boolean(),
  }),
);

export const hesapUyelikDegistiV1 = defineEvent(
  'hesap.uyelik.degisti',
  1,
  z.object({
    uyelik_id: z.uuid(),
    kullanici_id: z.uuid(),
    rol: RolSema,
    durum: uyelikDurumSema,
    sube_id: z.uuid().nullable(),
    kademe_id: z.uuid().nullable(),
  }),
);

export const hesapGrupDegistiV1 = defineEvent(
  'hesap.grup.degisti',
  1,
  z.object({
    grup_id: z.uuid(),
    tur: z.enum(['birebir', 'grup', 'sinif', 'etut']),
    ad: z.string(),
    kademe_id: z.uuid().nullable(),
    sube_id: z.uuid().nullable(),
    durum: z.enum(['aktif', 'arsiv']),
  }),
);

export const hesapGrupUyesiDegistiV1 = defineEvent(
  'hesap.grup_uyesi.degisti',
  1,
  z.object({
    grup_uyesi_id: z.uuid(),
    grup_id: z.uuid(),
    ogrenci_id: z.uuid(),
    baslangic_tarihi: z.iso.date(),
    bitis_tarihi: z.iso.date().nullable(),
  }),
);

export const hesapAtamaDegistiV1 = defineEvent(
  'hesap.atama.degisti',
  1,
  z.object({
    atama_id: z.uuid(),
    grup_id: z.uuid(),
    ogretmen_id: z.uuid(),
    brans_kodu: z.string(),
    baslangic_tarihi: z.iso.date(),
    bitis_tarihi: z.iso.date().nullable(),
    ana_ogretmen: z.boolean(),
  }),
);

export const hesapModulAyariDegistiV1 = defineEvent(
  'hesap.modul_ayari.degisti',
  1,
  z.object({
    modul_ayari_id: z.uuid(),
    modul_kodu: ModulKoduSema,
    kapsam: z.enum(['kurum', 'kademe', 'grup']),
    kapsam_id: z.uuid(),
    /** Mirasa donuste `null`. */
    acik: z.boolean().nullable(),
  }),
);

export const hesapDavetKabulEdildiV1 = defineEvent(
  'hesap.davet.kabul_edildi',
  1,
  z.object({
    davet_id: z.uuid(),
    davet_eden_id: z.uuid(),
    uyelik_id: z.uuid(),
    rol: RolSema,
  }),
);

export type HesapKurumDegistiV1 = EventOf<typeof hesapKurumDegistiV1>;
export type HesapUyelikDegistiV1 = EventOf<typeof hesapUyelikDegistiV1>;
export type HesapModulAyariDegistiV1 = EventOf<typeof hesapModulAyariDegistiV1>;
