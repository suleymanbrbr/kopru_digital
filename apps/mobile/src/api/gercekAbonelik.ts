import type { createServisIstemcileri } from '@kopru/api-client';

import type { Abonelik, AbonelikAdapter, AbonelikOzeti, AbonelikPlani } from './abonelikTipleri';

type Istemciler = ReturnType<typeof createServisIstemcileri>;

interface Bagimliliklar {
  yetkili: Istemciler['api'];
  /** Kimliksiz cagrilar (platform mesaji) icin belirtecsiz istemci. */
  ham: Istemciler['api'];
  etkinKurum: () => string;
  veriAl: <T>(sonuc: { data?: T; error?: unknown; response: Response }) => T;
}

interface ApiPlan {
  kod: string;
  ad: string;
  kurum_turu: 'bireysel' | 'ekip' | 'kurum';
  aylik_fiyat_kurus: number;
  yillik_fiyat_kurus: number | null;
  limitler: { max_ogrenci: number; max_ogretmen: number };
}

/** Plan limitlerinde -1 = sinirsiz. */
const sinir = (n: number): number | null => (n < 0 ? null : n);

export function planCevir(p: ApiPlan): AbonelikPlani {
  return {
    kod: p.kod,
    ad: p.ad,
    kurumTuru: p.kurum_turu,
    aylikFiyatKurus: p.aylik_fiyat_kurus,
    yillikFiyatKurus: p.yillik_fiyat_kurus,
    maxOgrenci: sinir(p.limitler.max_ogrenci),
    maxOgretmen: sinir(p.limitler.max_ogretmen),
  };
}

export function abonelikAdaptoru({
  yetkili,
  ham,
  etkinKurum,
  veriAl,
}: Bagimliliklar): AbonelikAdapter {
  return {
    async ozet(): Promise<AbonelikOzeti> {
      const d = veriAl(
        await yetkili.GET('/v1/abonelik/kurumlar/{kurum_id}/abonelik', {
          params: { path: { kurum_id: etkinKurum() } },
        }),
      );
      const a = d.abonelik;
      const abonelik: Abonelik | null = a
        ? {
            durum: a.durum,
            kaynak: a.kaynak,
            plan: planCevir(a.plan),
            periyot: a.periyot,
            denemeBitis: a.deneme_bitis_at,
            ekSureBitis: a.ek_sure_bitis_at,
            donemBitis: a.donem_bitis_at,
            iptalIstendi: a.iptal_istendi_at,
            otomatikYenileme: a.otomatik_yenileme,
          }
        : null;
      return {
        abonelik,
        kullanim: {
          ogrenci: { mevcut: d.kullanim.ogrenci.mevcut, ustSinir: d.kullanim.ogrenci.ust_sinir },
          ogretmen: {
            mevcut: d.kullanim.ogretmen.mevcut,
            ustSinir: d.kullanim.ogretmen.ust_sinir,
          },
        },
        ucretsiz: d.ucretsiz,
        yazmaKilitli: d.yazma_kilitli,
      };
    },
    async planlar() {
      const d = veriAl(
        await yetkili.GET('/v1/abonelik/kurumlar/{kurum_id}/planlar', {
          params: { path: { kurum_id: etkinKurum() } },
        }),
      );
      return d.planlar.map(planCevir);
    },
    async platformMesaji() {
      const d = veriAl(await ham.GET('/v1/platform-mesaji'));
      const m = d.mesaj;
      return m ? { id: m.id, baslik: m.baslik, metin: m.metin, onem: m.onem } : null;
    },
  };
}
