'use client';

import { t } from '@kopru/i18n';

import { Rozet } from '../ui/rozet';
import { Tablo, Td, Th } from '../ui/tablo';

import type { Degisiklik, Fark, Konu } from '@/lib/tipler';

const BOLUMLER = [
  { anahtar: 'eklenen', baslik: 'yonetim.mufredat.farkEklenen' },
  { anahtar: 'yeniden_adlandirilan', baslik: 'yonetim.mufredat.farkAdlandirilan' },
  { anahtar: 'tasinan', baslik: 'yonetim.mufredat.farkTasinan' },
  { anahtar: 'birlesen', baslik: 'yonetim.mufredat.farkBirlesen' },
  { anahtar: 'kaldirilan', baslik: 'yonetim.mufredat.farkKaldirilan' },
] as const;

/** Taslak (ya da yayinli surum) farki: islem turlerine gore gruplu, notlariyla. */
export function FarkGorunumu({ fark, konular }: { fark: Fark; konular: readonly Konu[] }) {
  const adlar = new Map(konular.map((k) => [k.id, k.ad]));
  const ad = (d: Degisiklik) =>
    d.ad_sonra ?? d.ad_once ?? adlar.get(d.konu_id) ?? d.konu_id.slice(0, 8);
  const toplam = Object.values(fark.ozet).reduce((a, b) => a + b, 0);

  if (toplam === 0) {
    return (
      <p className="py-6 text-center text-sm text-metin-ikincil">{t('yonetim.mufredat.farkYok')}</p>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <ul aria-label={t('yonetim.mufredat.ozet')} className="flex flex-wrap gap-2">
        {BOLUMLER.map((b) => (
          <li key={b.anahtar}>
            <Rozet ton={fark.ozet[b.anahtar] > 0 ? 'bilgi' : 'notr'}>
              {t(b.baslik)}: {fark.ozet[b.anahtar]}
            </Rozet>
          </li>
        ))}
      </ul>

      {BOLUMLER.filter((b) => fark[b.anahtar].length > 0).map((b) => (
        <section key={b.anahtar} aria-labelledby={`fark-${b.anahtar}`}>
          <h3 id={`fark-${b.anahtar}`} className="mb-2 text-sm font-semibold">
            {t(b.baslik)}
          </h3>
          <Tablo etiket={t(b.baslik)}>
            <thead>
              <tr>
                <Th>{t('yonetim.mufredat.ad')}</Th>
                <Th>
                  {t('yonetim.mufredat.oncekiAd')} → {t('yonetim.mufredat.sonrakiAd')}
                </Th>
                <Th>{t('yonetim.mufredat.not')}</Th>
              </tr>
            </thead>
            <tbody>
              {fark[b.anahtar].map((d) => (
                <tr key={d.id}>
                  <Td className="font-medium">{ad(d)}</Td>
                  <Td className="text-metin-ikincil">
                    {d.ad_once && d.ad_sonra ? `${d.ad_once} → ${d.ad_sonra}` : ''}
                  </Td>
                  <Td className="min-w-48">{d.not}</Td>
                </tr>
              ))}
            </tbody>
          </Tablo>
        </section>
      ))}
    </div>
  );
}
