import type { Periyot } from '@kopru/contracts';
import type { Database, Tx } from '@kopru/service-kit';
import { uuidv7 } from 'uuidv7';

import { abonelikSistemIslemi } from '../../sistem/abonelik-sistem.js';
import type { AbonelikVePlan } from './abonelik-deposu.js';
import { gunEkle, sistemVeritabani } from './ortak.js';
import { aboneligiAktiflestir } from './yazma.js';

export interface KurumsalAktivasyonGirdisi {
  kurumId: string;
  planKodu: string;
  /** Teklif/fatura sozlesme numarasi (zorunlu). */
  sozlesmeNo: string;
  periyot?: Periyot;
  /** Varsayilan: simdi. */
  donemBaslangicAt?: Date;
  /** Varsayilan: periyoda gore 30 / 365 gun. */
  donemBitisAt?: Date;
  /** Anlasilan fiyat (kurus); varsayilan plan fiyati. */
  fiyatKurus?: number;
  /** Islemi yapan platform yoneticisi (denetim kaydi). */
  aktorKullaniciId: string;
  neden: string;
  istekId?: string;
}

/**
 * Teklif + fatura ile elle (kurumsal) aktivasyon: platform paneli kullanir. Kurum aboneligi `kurumsal`
 * kaynakla `aktif` olur; deneme/askida abonelik sona erer, kurum `aktif`e doner. `api_sistem` baglantisiyla,
 * `hesap.denetim_kayitlari`na nedenle yazilir. Otomatik yenilenmez (sure sonunda `odeme_bekliyor` -> ek sure).
 */
export function kurumsalAboneligiAktiflestir(
  sistemDb: Database | null,
  girdi: KurumsalAktivasyonGirdisi,
): Promise<AbonelikVePlan> {
  return abonelikSistemIslemi(
    sistemVeritabani(sistemDb),
    {
      eylem: 'sistem.abonelik_kurumsal_aktivasyon',
      neden: girdi.neden,
      kurumId: girdi.kurumId,
      aktorKullaniciId: girdi.aktorKullaniciId,
      ...(girdi.istekId ? { istekId: girdi.istekId } : {}),
      ayrinti: {
        plan_kodu: girdi.planKodu,
        periyot: girdi.periyot ?? 'aylik',
        sozlesme_no: girdi.sozlesmeNo,
      },
    },
    (tx) => kurumsalAktivasyonIslemi(tx, girdi),
  );
}

/** Aktivasyonun islem govdesi (cagiran `api_sistem` islemini ve denetimi yonetir; platform ucu da kullanir). */
export function kurumsalAktivasyonIslemi(
  tx: Tx,
  girdi: KurumsalAktivasyonGirdisi,
): Promise<AbonelikVePlan> {
  const periyot = girdi.periyot ?? 'aylik';
  const baslangic = girdi.donemBaslangicAt ?? new Date();
  const bitis = girdi.donemBitisAt ?? gunEkle(baslangic, periyot === 'yillik' ? 365 : 30);
  return aboneligiAktiflestir(tx, {
    kurumId: girdi.kurumId,
    planKodu: girdi.planKodu,
    kaynak: 'kurumsal',
    periyot,
    donemBaslangicAt: baslangic,
    donemBitisAt: bitis,
    ...(girdi.fiyatKurus === undefined ? {} : { fiyatKurus: girdi.fiyatKurus }),
    otomatikYenileme: false,
    kurumsalSozlesmeNo: girdi.sozlesmeNo,
    kullaniciId: girdi.aktorKullaniciId,
    actor: { tur: 'kullanici', id: girdi.aktorKullaniciId },
    correlationId: girdi.istekId ?? uuidv7(),
  });
}
