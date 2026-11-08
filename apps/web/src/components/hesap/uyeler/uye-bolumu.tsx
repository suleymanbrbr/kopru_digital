'use client';

import { UyeListeYanitSema } from '@kopru/contracts';
import { t } from '@kopru/i18n';
import { Users } from 'lucide-react';
import { useMemo } from 'react';

import { DavetBolumu } from '../davetler/davet-bolumu';
import { Bolum, DahaFazla, ListeIskeleti, tarihYaz } from '../ortak';

import { BosDurum } from '@/components/bos-durum';
import { HataDurumu } from '@/components/hata-durumu';
import { BolumKapisi } from '@/components/kabuk/bolum-yer-tutucu';
import { SayfaBasligi } from '@/components/kabuk/sayfa-basligi';
import { Rozet } from '@/components/ui/rozet';
import { useKurum } from '@/kurum/baglam';
import { hataMesaji } from '@/lib/api';
import { useSayfaliSorgu } from '@/lib/sayfali-sorgu';
import { trSirala } from '@/lib/sirala';
import { izinli } from '@/lib/yetki';

/** `ogrenciler` ve `ogretmenler` bolumleri: uye listesi + davetler. */
export function UyeBolumu({ rolu }: { rolu: 'ogrenci' | 'ogretmen' }) {
  const kopya = rolu === 'ogrenci' ? 'ogrenciler' : 'ogretmenler';
  return (
    <BolumKapisi bolum={kopya}>
      <UyeIcerigi rolu={rolu} />
    </BolumKapisi>
  );
}

function UyeIcerigi({ rolu }: { rolu: 'ogrenci' | 'ogretmen' }) {
  const { uyelik, rol } = useKurum();
  const kurumId = uyelik.kurumId;
  const kopya = rolu === 'ogrenci' ? 'ogrenciler' : 'ogretmenler';
  const davetEdebilir = izinli(rol, 'davet.yaz');

  const sorgu = useSayfaliSorgu({
    anahtar: ['hesap', kurumId, 'uyelikler'],
    yol: `kurumlar/${kurumId}/uyelikler`,
    sema: UyeListeYanitSema,
    sorgu: { rol: rolu },
  });
  const uyeler = useMemo(
    () => trSirala(sorgu.data?.pages.flatMap((s) => s.uyeler) ?? [], (u) => u.gorunen_ad),
    [sorgu.data],
  );

  // Ogretmen yalniz ogrenci davet eder; yonetici rolunu yalniz sahip davet eder.
  const roller =
    rolu === 'ogrenci'
      ? (['ogrenci'] as const)
      : rol === 'sahip'
        ? (['ogretmen', 'yonetici'] as const)
        : (['ogretmen'] as const);

  return (
    <>
      <SayfaBasligi baslik={t(`hesap.${kopya}.baslik`)} aciklama={t(`hesap.${kopya}.aciklama`)} />
      <div className="flex flex-col gap-6">
        <Bolum baslik={t(`hesap.${kopya}.uyeler`)}>
          {sorgu.isPending ? (
            <ListeIskeleti />
          ) : sorgu.isError ? (
            <HataDurumu
              baslik={t(`hesap.${kopya}.uyelerYuklenemedi`)}
              aciklama={hataMesaji(sorgu.error)}
              tekrarDene={() => void sorgu.refetch()}
              className="py-8"
            />
          ) : uyeler.length === 0 ? (
            <BosDurum
              className="py-10"
              ikon={Users}
              baslik={t(`hesap.${kopya}.uyelerBos`)}
              aciklama={t(`hesap.${kopya}.uyelerBosAciklama`)}
            />
          ) : (
            <>
              <ul className="divide-y divide-kenar">
                {uyeler.map((u) => (
                  <li key={u.uyelik_id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{u.gorunen_ad ?? t('hesap.uye.adsiz')}</p>
                      {u.katildi_at ? (
                        <p className="text-sm text-metin-ikincil">
                          {t('hesap.uye.katildi', { tarih: tarihYaz(u.katildi_at) })}
                        </p>
                      ) : null}
                    </div>
                    <Rozet ton={u.durum === 'aktif' ? 'basari' : 'notr'}>
                      {t(`hesap.uye.durum.${u.durum}`)}
                    </Rozet>
                  </li>
                ))}
              </ul>
              <DahaFazla
                daha={sorgu.hasNextPage}
                yukleniyor={sorgu.isFetchingNextPage}
                yukle={() => void sorgu.fetchNextPage()}
              />
            </>
          )}
        </Bolum>

        {davetEdebilir ? (
          <DavetBolumu
            kurumId={kurumId}
            rolu={roller}
            roller={roller}
            grupSecilebilir={rolu === 'ogrenci'}
          />
        ) : null}
      </div>
    </>
  );
}
