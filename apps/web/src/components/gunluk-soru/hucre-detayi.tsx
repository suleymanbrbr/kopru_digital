'use client';

import { t } from '@kopru/i18n';

import type { HucreSecimi } from './isi-haritasi';

import { HataDurumu } from '@/components/hata-durumu';
import { kisaTarih } from '@/components/ogrenme/ortak';
import { SoruGorseli } from '@/components/soru/ekler';
import { Dugme } from '@/components/ui/button';
import { Iskelet } from '@/components/ui/kart';
import { Pencere } from '@/components/ui/pencere';
import { Rozet } from '@/components/ui/rozet';
import { Uyari } from '@/components/ui/uyari';
import { hataMesaji } from '@/lib/api';
import { zorlukAdi } from '@/lib/gunluk-soru/analiz';
import { useHucreDetayi, type AnalizSorgusu } from '@/lib/gunluk-soru/veri';

/**
 * Bir isi haritasi hucresinin ayrintisi: hucreyi olusturan kayitlar (gun, kaynak, D/Y/B) ve yanlis
 * sorularin fotograflari. Fotograf adresleri sureli oldugundan pencere acildikca yeniden alinir.
 */
export function HucreDetayPenceresi({
  kurumId,
  ogrenciId,
  secim,
  sorgu,
  kapat,
}: {
  kurumId: string;
  ogrenciId: string | undefined;
  secim: HucreSecimi | null;
  sorgu: AnalizSorgusu;
  kapat: () => void;
}) {
  const q = useHucreDetayi(
    kurumId,
    ogrenciId,
    secim ? { ...sorgu, konuId: secim.konuId, zorluk: secim.zorluk } : null,
  );
  const zorluk = secim?.zorluk ? zorlukAdi(secim.zorluk) : t('gunlukSoru.analiz.toplamSutunu');
  return (
    <Pencere
      acik={secim !== null}
      degisti={(a) => {
        if (!a) kapat();
      }}
      baslik={t('gunlukSoru.hucre.baslik', { konu: secim?.konuAd ?? '', zorluk })}
      aciklama={t('gunlukSoru.hucre.aciklama')}
      genis
    >
      {q.isPending ? (
        <div role="status" aria-label={t('ortak.yukleniyor')} className="flex flex-col gap-3">
          <Iskelet className="h-14 w-full" />
          <Iskelet className="h-14 w-full" />
        </div>
      ) : q.isError ? (
        <HataDurumu
          baslik={t('gunlukSoru.hucre.yuklenemedi')}
          aciklama={hataMesaji(q.error)}
          tekrarDene={() => void q.refetch()}
        />
      ) : q.data.kayitlar.length === 0 ? (
        <p className="text-sm text-metin-ikincil">{t('gunlukSoru.hucre.bos')}</p>
      ) : (
        <div className="flex flex-col gap-4">
          {q.data.fotograf_adresleri_alinamadi ? (
            <Uyari>
              <span className="flex flex-wrap items-center gap-2">
                {t('gunlukSoru.hucre.fotoAlinamadi')}
                <Dugme type="button" gorunum="ikincil" boyut="sm" onClick={() => void q.refetch()}>
                  {t('gunlukSoru.ortak.yenile')}
                </Dugme>
              </span>
            </Uyari>
          ) : null}
          <ul className="flex flex-col divide-y divide-kenar" data-testid="hucre-kayitlari">
            {q.data.kayitlar.map((k) => (
              <li key={`${k.kaynak}-${k.id}`} className="flex flex-col gap-2 py-3">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-medium">{kisaTarih(k.gun)}</span>
                  <Rozet>{zorlukAdi(k.zorluk)}</Rozet>
                  {k.kaynak === 'odev' ? (
                    <Rozet ton="bilgi">{t('gunlukSoru.hucre.kaynakOdev')}</Rozet>
                  ) : null}
                  <span className="text-sm tabular-nums text-metin-ikincil">
                    {t('gunlukSoru.liste.sayilar', {
                      dogru: k.dogru,
                      yanlis: k.yanlis,
                      bos: k.bos,
                    })}
                  </span>
                </div>
                <p className="text-sm text-metin-ikincil">
                  {k.kaynak_adi ?? t('gunlukSoru.ortak.kaynakYok')}
                </p>
                {k.dosyalar.length > 0 ? (
                  <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {k.dosyalar.map((f, i) => (
                      <li key={f.medya_dosya_id}>
                        <SoruGorseli
                          adres={f.adres}
                          alt={t('gunlukSoru.hucre.fotoAlt', {
                            tarih: kisaTarih(k.gun),
                            sira: i + 1,
                          })}
                          yenile={() => void q.refetch()}
                        />
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Pencere>
  );
}
