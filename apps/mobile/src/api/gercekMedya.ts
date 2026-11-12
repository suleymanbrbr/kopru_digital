import type { ServisIstemcileri } from '@kopru/api-client';

import { presignedPutYukle, yerelBilgiOku } from '../yukleme/yerelDosya';
import type { MedyaAdapter, MedyaDosyaDurumu, MedyaDurumu } from './medyaTipleri';

type Istemci = ServisIstemcileri['medya'];

export interface MedyaBagimliligi {
  medya: Istemci;
  veriAl: <T>(sonuc: { data?: T; error?: unknown; response: Response }) => T;
}

interface ApiDurum {
  id: string;
  durum: MedyaDurumu;
  boyut_bayt: number | null;
  hata_kodu: string | null;
}

function durumCevir(d: ApiDurum): MedyaDosyaDurumu {
  return { dosyaId: d.id, durum: d.durum, boyutBayt: d.boyut_bayt, hataKodu: d.hata_kodu };
}

/** `medya` servisinin yukleme uclarini (`/v1/dosyalar*`) adaptor modeline ceviren gercek uygulama. */
export function medyaAdaptoru({ medya, veriAl }: MedyaBagimliligi): MedyaAdapter {
  return {
    async izinAl(g) {
      const d = veriAl(
        await medya.POST('/v1/dosyalar', {
          body: {
            tur: g.tur,
            mime_tipi: g.mimeTipi,
            boyut_bayt: g.boyutBayt,
            sha256: g.sha256,
            istemci_anahtari: g.istemciAnahtari,
          },
        }),
      );
      return {
        dosyaId: d.dosya.id,
        durum: d.dosya.durum,
        yukleme: d.yukleme
          ? {
              url: d.yukleme.url,
              basliklar: d.yukleme.basliklar,
              bitis: d.yukleme.gecerlilik_bitis_at,
            }
          : null,
      };
    },

    yukle: (adres, yerelUri) => presignedPutYukle(adres.url, adres.basliklar, yerelUri),

    async tamam(dosyaId) {
      return durumCevir(
        veriAl(
          await medya.POST('/v1/dosyalar/{id}/tamam', {
            params: { path: { id: dosyaId } },
            body: {} as never,
          }),
        ) as ApiDurum,
      );
    },

    async durum(dosyaId) {
      return durumCevir(
        veriAl(
          await medya.GET('/v1/dosyalar/{id}', { params: { path: { id: dosyaId } } }),
        ) as ApiDurum,
      );
    },

    yerelBilgi: yerelBilgiOku,
  };
}
