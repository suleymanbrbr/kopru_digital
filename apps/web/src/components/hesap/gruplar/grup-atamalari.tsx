'use client';

import { AtamaGrupListeYanitSema, UyeListeYanitSema, type GrupTipi } from '@kopru/contracts';
import { t } from '@kopru/i18n';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { GraduationCap, UserPlus } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import type { z } from 'zod';

import { basari, basarisiz, BildirimKutusu, Bolum, ListeIskeleti, type Bildirim } from '../ortak';

import { BosDurum } from '@/components/bos-durum';
import { HataDurumu } from '@/components/hata-durumu';
import { Dugme } from '@/components/ui/button';
import { OnayKutusu } from '@/components/ui/checkbox';
import { Etiket } from '@/components/ui/input';
import { OnayPenceresi, Pencere } from '@/components/ui/pencere';
import { Rozet } from '@/components/ui/rozet';
import { Secim } from '@/components/ui/secim';
import { Uyari } from '@/components/ui/uyari';
import { hataMesaji } from '@/lib/api';
import { bransAdi, siraliBransler } from '@/lib/bransler';
import { hesapIstek } from '@/lib/hesap-istek';
import { useSayfaliSorgu, yenidenDene } from '@/lib/sayfali-sorgu';
import { trKarsilastir, trSirala } from '@/lib/sirala';

type Atamalar = z.output<typeof AtamaGrupListeYanitSema>;

export function GrupAtamalari({
  kurumId,
  grup,
  yazabilir,
}: {
  kurumId: string;
  grup: GrupTipi;
  yazabilir: boolean;
}) {
  const qc = useQueryClient();
  const anahtar = ['hesap', kurumId, 'gruplar', grup.id, 'atamalar'] as const;
  const [ataAcik, setAtaAcik] = useState(false);
  const [bitirilecek, setBitirilecek] = useState<Atamalar['atamalar'][number] | null>(null);
  const [bildirim, setBildirim] = useState<Bildirim>(null);

  const sorgu = useQuery({
    queryKey: anahtar,
    retry: yenidenDene,
    queryFn: () =>
      hesapIstek(`kurumlar/${kurumId}/gruplar/${grup.id}/atamalar`, {
        sema: AtamaGrupListeYanitSema,
      }),
  });
  const atamalar = useMemo(
    () => trSirala(sorgu.data?.atamalar ?? [], (a) => a.ogretmen_ad),
    [sorgu.data],
  );

  const bitir = useMutation({
    mutationFn: (id: string) =>
      hesapIstek(`kurumlar/${kurumId}/atamalar/${id}/bitir`, { yontem: 'POST' }),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: anahtar });
      const onceki = qc.getQueryData<Atamalar>(anahtar);
      qc.setQueryData<Atamalar>(anahtar, (v) =>
        v ? { atamalar: v.atamalar.filter((a) => a.id !== id) } : v,
      );
      setBitirilecek(null);
      return { onceki };
    },
    onError: (e, _id, baglam) => {
      qc.setQueryData(anahtar, baglam?.onceki);
      setBildirim(basarisiz(e));
    },
    onSuccess: () => {
      setBildirim(basari(t('hesap.gruplar.atamalar.bitirildi')));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: anahtar }),
  });

  return (
    <Bolum
      baslik={t('hesap.gruplar.atamalar.baslik')}
      eylemler={
        yazabilir && grup.durum === 'aktif' ? (
          <Dugme
            boyut="sm"
            onClick={() => {
              setAtaAcik(true);
            }}
          >
            <UserPlus aria-hidden />
            {t('hesap.gruplar.atamalar.ata')}
          </Dugme>
        ) : undefined
      }
    >
      <div className="px-4 pt-3 empty:hidden">
        <BildirimKutusu bildirim={bildirim} />
      </div>
      {sorgu.isPending ? (
        <ListeIskeleti satir={2} />
      ) : sorgu.isError ? (
        <HataDurumu
          baslik={t('hesap.ortak.listeYuklenemedi')}
          aciklama={hataMesaji(sorgu.error)}
          tekrarDene={() => void sorgu.refetch()}
          className="py-8"
        />
      ) : atamalar.length === 0 ? (
        <BosDurum className="py-8" ikon={GraduationCap} baslik={t('hesap.gruplar.atamalar.bos')} />
      ) : (
        <ul className="divide-y divide-kenar">
          {atamalar.map((a) => {
            const ad = a.ogretmen_ad ?? t('hesap.uye.adsiz');
            return (
              <li key={a.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{ad}</p>
                  <p className="flex flex-wrap items-center gap-2 text-sm text-metin-ikincil">
                    <span>{bransAdi(a.brans_kodu)}</span>
                    {a.ana_ogretmen ? (
                      <Rozet ton="bilgi">{t('hesap.gruplar.atamalar.anaOgretmen')}</Rozet>
                    ) : null}
                  </p>
                </div>
                {yazabilir && grup.durum === 'aktif' ? (
                  <Dugme
                    gorunum="hayalet"
                    boyut="sm"
                    aria-label={t('hesap.gruplar.atamalar.bitirAria', { ad })}
                    onClick={() => {
                      setBitirilecek(a);
                    }}
                  >
                    {t('hesap.gruplar.atamalar.bitir')}
                  </Dugme>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      <OgretmenAta
        acik={ataAcik}
        degisti={setAtaAcik}
        kurumId={kurumId}
        grupId={grup.id}
        bitti={(b) => {
          setBildirim(b);
        }}
      />

      <OnayPenceresi
        acik={bitirilecek !== null}
        degisti={(a) => {
          if (!a) setBitirilecek(null);
        }}
        baslik={t('hesap.gruplar.atamalar.bitirBaslik', {
          ad: bitirilecek?.ogretmen_ad ?? t('hesap.uye.adsiz'),
        })}
        aciklama={t('hesap.gruplar.atamalar.bitirAciklama', {
          brans: bitirilecek ? bransAdi(bitirilecek.brans_kodu) : '',
        })}
        onayEtiketi={t('hesap.gruplar.atamalar.bitirOnay')}
        tehlikeli
        bekliyor={bitir.isPending}
        onay={() => {
          if (bitirilecek) bitir.mutate(bitirilecek.id);
        }}
      />
    </Bolum>
  );
}

function OgretmenAta({
  acik,
  degisti,
  kurumId,
  grupId,
  bitti,
}: {
  acik: boolean;
  degisti: (a: boolean) => void;
  kurumId: string;
  grupId: string;
  bitti: (b: Bildirim) => void;
}) {
  const qc = useQueryClient();
  const kimlik = useId();
  const [ogretmenId, setOgretmenId] = useState('');
  const [brans, setBrans] = useState('');
  const [ana, setAna] = useState(false);
  const [hata, setHata] = useState<string | null>(null);

  const ogretmenler = useSayfaliSorgu({
    anahtar: ['hesap', kurumId, 'uyelikler'],
    yol: `kurumlar/${kurumId}/uyelikler`,
    sema: UyeListeYanitSema,
    sorgu: { rol: 'ogretmen' },
    etkin: acik,
  });
  const liste = useMemo(
    () =>
      (ogretmenler.data?.pages.flatMap((s) => s.uyeler) ?? [])
        .filter((u) => u.durum === 'aktif')
        .sort((a, b) => trKarsilastir(a.gorunen_ad, b.gorunen_ad)),
    [ogretmenler.data],
  );

  const ata = useMutation({
    mutationFn: () =>
      hesapIstek(`kurumlar/${kurumId}/gruplar/${grupId}/atamalar`, {
        govde: { ogretmen_id: ogretmenId, brans_kodu: brans, ana_ogretmen: ana },
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['hesap', kurumId, 'gruplar', grupId, 'atamalar'] });
      bitti(basari(t('hesap.gruplar.atamalar.atandi')));
      setOgretmenId('');
      setBrans('');
      setAna(false);
      degisti(false);
    },
    onError: (e) => {
      setHata(hataMesaji(e));
    },
  });

  function gonder(olay: React.SyntheticEvent) {
    olay.preventDefault();
    setHata(null);
    if (!ogretmenId) {
      setHata(t('hesap.gruplar.atamalar.ogretmenSecGerekli'));
      return;
    }
    if (!brans) {
      setHata(t('hesap.gruplar.atamalar.bransSecGerekli'));
      return;
    }
    ata.mutate();
  }

  return (
    <Pencere
      acik={acik}
      degisti={(a) => {
        if (!a) setHata(null);
        degisti(a);
      }}
      baslik={t('hesap.gruplar.atamalar.ata')}
    >
      <form onSubmit={gonder} noValidate className="flex flex-col gap-4">
        {hata ? <Uyari>{hata}</Uyari> : null}
        {ogretmenler.isSuccess && liste.length === 0 && !ogretmenler.hasNextPage ? (
          <p className="text-sm text-metin-ikincil">{t('hesap.gruplar.atamalar.ogretmenYok')}</p>
        ) : null}
        <div className="flex flex-col gap-1.5">
          <Etiket htmlFor={`${kimlik}-og`}>{t('hesap.gruplar.atamalar.ogretmen')}</Etiket>
          <Secim
            id={`${kimlik}-og`}
            value={ogretmenId}
            onChange={(e) => {
              setOgretmenId(e.target.value);
            }}
          >
            <option value="">{t('hesap.gruplar.atamalar.ogretmenSec')}</option>
            {liste.map((u) => (
              <option key={u.uyelik_id} value={u.uyelik_id}>
                {u.gorunen_ad ?? t('hesap.uye.adsiz')}
              </option>
            ))}
          </Secim>
        </div>
        <div className="flex flex-col gap-1.5">
          <Etiket htmlFor={`${kimlik}-br`}>{t('hesap.gruplar.atamalar.brans')}</Etiket>
          <Secim
            id={`${kimlik}-br`}
            value={brans}
            onChange={(e) => {
              setBrans(e.target.value);
            }}
          >
            <option value="">{t('hesap.gruplar.atamalar.bransSec')}</option>
            {siraliBransler().map((b) => (
              <option key={b.kod} value={b.kod}>
                {b.ad}
              </option>
            ))}
          </Secim>
        </div>
        <div className="flex items-center gap-3">
          <OnayKutusu
            id={`${kimlik}-ana`}
            checked={ana}
            onCheckedChange={(c) => {
              setAna(c === true);
            }}
          />
          <label htmlFor={`${kimlik}-ana`} className="cursor-pointer text-sm">
            {t('hesap.gruplar.atamalar.anaOgretmen')}
          </label>
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Dugme
            type="button"
            gorunum="ikincil"
            onClick={() => {
              degisti(false);
            }}
          >
            {t('hesap.ortak.vazgec')}
          </Dugme>
          <Dugme type="submit" disabled={ata.isPending}>
            {ata.isPending ? t('hesap.gruplar.atamalar.ataniyor') : t('hesap.gruplar.atamalar.ata')}
          </Dugme>
        </div>
      </form>
    </Pencere>
  );
}
