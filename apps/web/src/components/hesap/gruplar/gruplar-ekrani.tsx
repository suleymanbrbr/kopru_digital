'use client';

import { GrupListeYanitSema, type GrupTipi } from '@kopru/contracts';
import { t } from '@kopru/i18n';
import { useMutation, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { Plus, UsersRound } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { z } from 'zod';

import {
  basari,
  basarisiz,
  BildirimKutusu,
  DahaFazla,
  ListeIskeleti,
  type Bildirim,
} from '../ortak';
import { GrupFormu } from './grup-formu';

import { BosDurum } from '@/components/bos-durum';
import { HataDurumu } from '@/components/hata-durumu';
import { SayfaBasligi } from '@/components/kabuk/sayfa-basligi';
import { Dugme } from '@/components/ui/button';
import { Kart } from '@/components/ui/kart';
import { OnayPenceresi } from '@/components/ui/pencere';
import { Rozet } from '@/components/ui/rozet';
import { Secim } from '@/components/ui/secim';
import { useKurum } from '@/kurum/baglam';
import { hataMesaji, UygulamaHatasi } from '@/lib/api';
import { hesapIstek } from '@/lib/hesap-istek';
import { useSayfaliSorgu } from '@/lib/sayfali-sorgu';
import { trSirala } from '@/lib/sirala';
import { izinli } from '@/lib/yetki';

type GrupListe = z.output<typeof GrupListeYanitSema>;

export function gruplarAnahtari(kurumId: string) {
  return ['hesap', kurumId, 'gruplar'] as const;
}

export function GrupSatirBilgisi({ grup }: { grup: GrupTipi }) {
  return (
    <span className="flex flex-wrap items-center gap-2 text-sm text-metin-ikincil">
      <Rozet ton="bilgi">{t(`hesap.gruplar.tur.${grup.tur}`)}</Rozet>
      {grup.durum === 'arsiv' ? <Rozet>{t('hesap.gruplar.arsivde')}</Rozet> : null}
      <span>
        {grup.kapasite !== null
          ? t('hesap.gruplar.uyeKapasite', { n: grup.uye_sayisi, kapasite: grup.kapasite })
          : t('hesap.gruplar.uyeSayisi', { n: grup.uye_sayisi })}
      </span>
    </span>
  );
}

export function GruplarEkrani() {
  const { uyelik, rol } = useKurum();
  const kurumId = uyelik.kurumId;
  const yazabilir = izinli(rol, 'grup.yaz');
  const qc = useQueryClient();

  const [durum, setDurum] = useState<'aktif' | 'arsiv'>('aktif');
  const [tur, setTur] = useState('');
  const [formAcik, setFormAcik] = useState(false);
  const [duzenlenen, setDuzenlenen] = useState<GrupTipi | null>(null);
  const [arsivlenecek, setArsivlenecek] = useState<GrupTipi | null>(null);
  const [bildirim, setBildirim] = useState<Bildirim>(null);

  const sorgu = useSayfaliSorgu({
    anahtar: gruplarAnahtari(kurumId),
    yol: `kurumlar/${kurumId}/gruplar`,
    sema: GrupListeYanitSema,
    sorgu: { durum, tur: tur || undefined },
  });

  const gruplar = useMemo(
    () => trSirala(sorgu.data?.pages.flatMap((s) => s.gruplar) ?? [], (g) => g.ad),
    [sorgu.data],
  );

  // Arsivle: iyimser; liste aninda guncellenir, hata olursa eski haline doner.
  const arsivle = useMutation({
    mutationFn: (grup: GrupTipi) =>
      hesapIstek(`kurumlar/${kurumId}/gruplar/${grup.id}/arsivle`, { yontem: 'POST' }),
    onMutate: async (grup) => {
      await qc.cancelQueries({ queryKey: gruplarAnahtari(kurumId) });
      const onceki = qc.getQueriesData<InfiniteData<GrupListe>>({
        queryKey: gruplarAnahtari(kurumId),
      });
      qc.setQueriesData<InfiniteData<GrupListe>>({ queryKey: gruplarAnahtari(kurumId) }, (v) =>
        v
          ? {
              ...v,
              pages: v.pages.map((s) => ({
                ...s,
                gruplar: s.gruplar.filter((g) => g.id !== grup.id),
              })),
            }
          : v,
      );
      setArsivlenecek(null);
      return { onceki };
    },
    onError: (hata, _grup, baglam) => {
      for (const [anahtar, veri] of baglam?.onceki ?? []) qc.setQueryData(anahtar, veri);
      setBildirim(basarisiz(hata));
    },
    onSuccess: (_s, grup) => {
      setBildirim(basari(t('hesap.gruplar.arsivlendi', { ad: grup.ad })));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: gruplarAnahtari(kurumId) }),
  });

  const bosMetin =
    tur !== ''
      ? t('hesap.gruplar.bosFiltre')
      : durum === 'arsiv'
        ? t('hesap.gruplar.bosArsiv')
        : t('hesap.gruplar.bosBaslik');

  return (
    <>
      <SayfaBasligi baslik={t('hesap.gruplar.baslik')} aciklama={t('hesap.gruplar.aciklama')}>
        {yazabilir ? (
          <Dugme
            onClick={() => {
              setDuzenlenen(null);
              setFormAcik(true);
            }}
          >
            <Plus aria-hidden />
            {t('hesap.gruplar.olustur')}
          </Dugme>
        ) : null}
      </SayfaBasligi>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="w-48">
          <Secim
            aria-label={t('hesap.ortak.durum')}
            value={durum}
            onChange={(e) => {
              setDurum(e.target.value as 'aktif' | 'arsiv');
            }}
          >
            <option value="aktif">{t('hesap.gruplar.durumAktif')}</option>
            <option value="arsiv">{t('hesap.gruplar.durumArsiv')}</option>
          </Secim>
        </div>
        <div className="w-48">
          <Secim
            aria-label={t('hesap.gruplar.form.tur')}
            value={tur}
            onChange={(e) => {
              setTur(e.target.value);
            }}
          >
            <option value="">{t('hesap.gruplar.turHepsi')}</option>
            {(['sinif', 'grup', 'etut', 'birebir'] as const).map((k) => (
              <option key={k} value={k}>
                {t(`hesap.gruplar.tur.${k}`)}
              </option>
            ))}
          </Secim>
        </div>
      </div>

      <div className="mb-4 empty:hidden">
        <BildirimKutusu bildirim={bildirim} />
      </div>

      <Kart>
        {sorgu.isPending ? (
          <ListeIskeleti />
        ) : sorgu.isError ? (
          <HataDurumu
            baslik={t('hesap.gruplar.yuklenemedi')}
            aciklama={hataMesaji(sorgu.error)}
            istekNo={sorgu.error instanceof UygulamaHatasi ? sorgu.error.istekId : undefined}
            tekrarDene={() => void sorgu.refetch()}
          />
        ) : gruplar.length === 0 ? (
          <BosDurum
            className="py-14"
            ikon={UsersRound}
            baslik={bosMetin}
            {...(durum === 'aktif' && tur === ''
              ? {
                  aciklama: yazabilir
                    ? t('hesap.gruplar.bosAciklama')
                    : t('hesap.gruplar.bosYetkisiz'),
                }
              : {})}
          >
            {yazabilir && durum === 'aktif' && tur === '' ? (
              <Dugme
                onClick={() => {
                  setDuzenlenen(null);
                  setFormAcik(true);
                }}
              >
                <Plus aria-hidden />
                {t('hesap.gruplar.olustur')}
              </Dugme>
            ) : null}
          </BosDurum>
        ) : (
          <>
            <ul className="divide-y divide-kenar">
              {gruplar.map((g) => (
                <li key={g.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <Link
                    href={`/${kurumId}/gruplar/${g.id}`}
                    className="min-w-0 flex-1 rounded-orta py-1 hover:text-birincil"
                  >
                    <span className="block truncate text-base font-semibold">{g.ad}</span>
                    <GrupSatirBilgisi grup={g} />
                  </Link>
                  {yazabilir && g.durum === 'aktif' ? (
                    <div className="flex gap-2">
                      <Dugme
                        gorunum="ikincil"
                        boyut="sm"
                        aria-label={`${t('hesap.gruplar.duzenle')}: ${g.ad}`}
                        onClick={() => {
                          setDuzenlenen(g);
                          setFormAcik(true);
                        }}
                      >
                        {t('hesap.gruplar.duzenle')}
                      </Dugme>
                      <Dugme
                        gorunum="hayalet"
                        boyut="sm"
                        aria-label={`${t('hesap.gruplar.arsivle')}: ${g.ad}`}
                        onClick={() => {
                          setArsivlenecek(g);
                        }}
                      >
                        {t('hesap.gruplar.arsivle')}
                      </Dugme>
                    </div>
                  ) : null}
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
      </Kart>

      <GrupFormu
        acik={formAcik}
        degisti={setFormAcik}
        kurumId={kurumId}
        grup={duzenlenen}
        bitti={(metin) => {
          setBildirim(basari(metin));
        }}
      />

      <OnayPenceresi
        acik={arsivlenecek !== null}
        degisti={(a) => {
          if (!a) setArsivlenecek(null);
        }}
        baslik={t('hesap.gruplar.arsivOnay.baslik', { ad: arsivlenecek?.ad ?? '' })}
        aciklama={t('hesap.gruplar.arsivOnay.aciklama')}
        onayEtiketi={t('hesap.gruplar.arsivOnay.onay')}
        tehlikeli
        bekliyor={arsivle.isPending}
        onay={() => {
          if (arsivlenecek) arsivle.mutate(arsivlenecek);
        }}
      />
    </>
  );
}
