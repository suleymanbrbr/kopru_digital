'use client';

import {
  GrupUyeEkleYanitSema,
  GrupUyeListeYanitSema,
  UyeListeYanitSema,
  type GrupTipi,
} from '@kopru/contracts';
import { t } from '@kopru/i18n';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { UserPlus, UserRound } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import type { z } from 'zod';

import {
  basari,
  basarisiz,
  BildirimKutusu,
  Bolum,
  DahaFazla,
  ListeIskeleti,
  tarihYaz,
  type Bildirim,
} from '../ortak';

import { BosDurum } from '@/components/bos-durum';
import { HataDurumu } from '@/components/hata-durumu';
import { Dugme } from '@/components/ui/button';
import { OnayKutusu } from '@/components/ui/checkbox';
import { Etiket, Girdi } from '@/components/ui/input';
import { OnayPenceresi, Pencere } from '@/components/ui/pencere';
import { hataMesaji } from '@/lib/api';
import { hesapIstek } from '@/lib/hesap-istek';
import { useSayfaliSorgu, yenidenDene } from '@/lib/sayfali-sorgu';
import { trKarsilastir, trSirala } from '@/lib/sirala';

type GrupUyeleri = z.output<typeof GrupUyeListeYanitSema>;

export function GrupUyeleri({
  kurumId,
  grup,
  yazabilir,
}: {
  kurumId: string;
  grup: GrupTipi;
  yazabilir: boolean;
}) {
  const qc = useQueryClient();
  const anahtar = ['hesap', kurumId, 'gruplar', grup.id, 'uyeler'] as const;
  const [secili, setSecili] = useState<ReadonlySet<string>>(new Set());
  const [ekleAcik, setEkleAcik] = useState(false);
  const [cikarOnay, setCikarOnay] = useState(false);
  const [bildirim, setBildirim] = useState<Bildirim>(null);

  const sorgu = useQuery({
    queryKey: anahtar,
    retry: yenidenDene,
    queryFn: () =>
      hesapIstek(`kurumlar/${kurumId}/gruplar/${grup.id}/uyeler`, {
        sema: GrupUyeListeYanitSema,
      }),
  });
  const uyeler = useMemo(
    () => trSirala(sorgu.data?.uyeler ?? [], (u) => u.gorunen_ad),
    [sorgu.data],
  );
  const arsivde = grup.durum === 'arsiv';

  const cikar = useMutation({
    mutationFn: async (idler: string[]) => {
      const sonuclar = await Promise.allSettled(
        idler.map((id) =>
          hesapIstek(`kurumlar/${kurumId}/gruplar/${grup.id}/uyeler/${id}`, { yontem: 'DELETE' }),
        ),
      );
      const basarisizlar = sonuclar.filter((s) => s.status === 'rejected');
      const ilkHata: unknown = basarisizlar[0]?.reason;
      return { toplam: idler.length, hata: basarisizlar.length, ilkHata };
    },
    onMutate: async (idler) => {
      await qc.cancelQueries({ queryKey: anahtar });
      const onceki = qc.getQueryData<GrupUyeleri>(anahtar);
      qc.setQueryData<GrupUyeleri>(anahtar, (v) =>
        v ? { uyeler: v.uyeler.filter((u) => !idler.includes(u.ogrenci_id)) } : v,
      );
      setCikarOnay(false);
      setSecili(new Set());
      return { onceki };
    },
    onSuccess: (sonuc, _idler, baglam) => {
      if (sonuc.hata > 0) {
        qc.setQueryData(anahtar, baglam.onceki);
        setBildirim(
          sonuc.hata === sonuc.toplam
            ? basarisiz(sonuc.ilkHata)
            : {
                tur: 'hata',
                metin: `${t('hesap.gruplar.uyeler.cikarilamadi', { n: sonuc.hata })} ${hataMesaji(sonuc.ilkHata)}`,
              },
        );
      } else {
        setBildirim(basari(t('hesap.gruplar.uyeler.cikarildi', { n: sonuc.toplam })));
      }
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['hesap', kurumId, 'gruplar'] });
    },
  });

  function degistir(id: string, isaretli: boolean) {
    setSecili((onceki) => {
      const yeni = new Set(onceki);
      if (isaretli) yeni.add(id);
      else yeni.delete(id);
      return yeni;
    });
  }
  const hepsiSecili = uyeler.length > 0 && secili.size === uyeler.length;

  return (
    <Bolum
      baslik={t('hesap.gruplar.uyeler.baslik')}
      eylemler={
        yazabilir && !arsivde ? (
          <div className="flex flex-wrap gap-2">
            {secili.size > 0 ? (
              <Dugme
                gorunum="ikincil"
                boyut="sm"
                onClick={() => {
                  setCikarOnay(true);
                }}
              >
                {t('hesap.gruplar.uyeler.cikar')} ({secili.size})
              </Dugme>
            ) : null}
            <Dugme
              boyut="sm"
              onClick={() => {
                setEkleAcik(true);
              }}
            >
              <UserPlus aria-hidden />
              {t('hesap.gruplar.uyeler.ekle')}
            </Dugme>
          </div>
        ) : undefined
      }
    >
      <div className="px-4 pt-3 empty:hidden">
        <BildirimKutusu bildirim={bildirim} />
      </div>
      {sorgu.isPending ? (
        <ListeIskeleti />
      ) : sorgu.isError ? (
        <HataDurumu
          baslik={t('hesap.ortak.listeYuklenemedi')}
          aciklama={hataMesaji(sorgu.error)}
          tekrarDene={() => void sorgu.refetch()}
          className="py-8"
        />
      ) : uyeler.length === 0 ? (
        <BosDurum className="py-8" ikon={UserRound} baslik={t('hesap.gruplar.uyeler.bos')} />
      ) : (
        <ul className="divide-y divide-kenar">
          {yazabilir && !arsivde ? (
            <li className="flex items-center gap-3 px-4 py-2 text-sm text-metin-ikincil">
              <OnayKutusu
                aria-label={t('hesap.gruplar.uyeler.tumunuSec')}
                checked={hepsiSecili}
                onCheckedChange={(c) => {
                  setSecili(c === true ? new Set(uyeler.map((u) => u.ogrenci_id)) : new Set());
                }}
              />
              <span aria-live="polite">
                {secili.size > 0
                  ? t('hesap.gruplar.uyeler.secili', { n: secili.size })
                  : t('hesap.gruplar.uyeler.tumunuSec')}
              </span>
            </li>
          ) : null}
          {uyeler.map((u) => (
            <li key={u.id} className="flex items-center gap-3 px-4 py-3">
              {yazabilir && !arsivde ? (
                <OnayKutusu
                  aria-label={t('hesap.gruplar.uyeler.sec', {
                    ad: u.gorunen_ad ?? t('hesap.uye.adsiz'),
                  })}
                  checked={secili.has(u.ogrenci_id)}
                  onCheckedChange={(c) => {
                    degistir(u.ogrenci_id, c === true);
                  }}
                />
              ) : null}
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{u.gorunen_ad ?? t('hesap.uye.adsiz')}</p>
                <p className="text-sm text-metin-ikincil">
                  {t('hesap.gruplar.uyeler.katildi', { tarih: tarihYaz(u.baslangic_tarihi) })} ·{' '}
                  {t(`hesap.gruplar.uyeler.yol.${u.katilim_yolu}`)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}

      <OgrenciEkle
        acik={ekleAcik}
        degisti={setEkleAcik}
        kurumId={kurumId}
        grupId={grup.id}
        mevcut={new Set((sorgu.data?.uyeler ?? []).map((u) => u.ogrenci_id))}
        bitti={(b) => {
          setBildirim(b);
        }}
      />

      <OnayPenceresi
        acik={cikarOnay}
        degisti={setCikarOnay}
        baslik={t('hesap.gruplar.uyeler.cikarBaslik', { n: secili.size })}
        aciklama={t('hesap.gruplar.uyeler.cikarAciklama')}
        onayEtiketi={t('hesap.gruplar.uyeler.cikarOnay')}
        tehlikeli
        bekliyor={cikar.isPending}
        onay={() => {
          cikar.mutate([...secili]);
        }}
      />
    </Bolum>
  );
}

function OgrenciEkle({
  acik,
  degisti,
  kurumId,
  grupId,
  mevcut,
  bitti,
}: {
  acik: boolean;
  degisti: (a: boolean) => void;
  kurumId: string;
  grupId: string;
  mevcut: ReadonlySet<string>;
  bitti: (b: Bildirim) => void;
}) {
  const qc = useQueryClient();
  const kimlik = useId();
  const [ara, setAra] = useState('');
  const [secili, setSecili] = useState<ReadonlySet<string>>(new Set());
  const [hata, setHata] = useState<string | null>(null);

  const ogrenciler = useSayfaliSorgu({
    anahtar: ['hesap', kurumId, 'uyelikler'],
    yol: `kurumlar/${kurumId}/uyelikler`,
    sema: UyeListeYanitSema,
    sorgu: { rol: 'ogrenci' },
    etkin: acik,
  });
  const adaylar = useMemo(() => {
    const kucuk = ara.trim().toLocaleLowerCase('tr');
    return (ogrenciler.data?.pages.flatMap((s) => s.uyeler) ?? [])
      .filter((u) => u.durum === 'aktif' && !mevcut.has(u.uyelik_id))
      .filter((u) => kucuk === '' || (u.gorunen_ad ?? '').toLocaleLowerCase('tr').includes(kucuk))
      .sort((a, b) => trKarsilastir(a.gorunen_ad, b.gorunen_ad));
  }, [ogrenciler.data, mevcut, ara]);

  const ekle = useMutation({
    mutationFn: (idler: string[]) =>
      hesapIstek(`kurumlar/${kurumId}/gruplar/${grupId}/uyeler`, {
        govde: { ogrenci_idleri: idler },
        sema: GrupUyeEkleYanitSema,
      }),
    onSuccess: (sonuc) => {
      void qc.invalidateQueries({ queryKey: ['hesap', kurumId, 'gruplar'] });
      const parcalar = [t('hesap.gruplar.uyeler.eklendi', { n: sonuc.eklenenler.length })];
      if (sonuc.zaten_uye.length > 0) {
        parcalar.push(t('hesap.gruplar.uyeler.zatenUye', { n: sonuc.zaten_uye.length }));
      }
      bitti(basari(parcalar.join(' ')));
      setSecili(new Set());
      setAra('');
      degisti(false);
    },
    onError: (e) => {
      setHata(hataMesaji(e));
    },
  });

  return (
    <Pencere
      acik={acik}
      degisti={(a) => {
        if (!a) setHata(null);
        degisti(a);
      }}
      baslik={t('hesap.gruplar.uyeler.ekleBaslik')}
      aciklama={t('hesap.gruplar.uyeler.ekleAciklama')}
    >
      <div className="flex flex-col gap-3">
        {hata ? (
          <p role="alert" className="rounded-orta bg-hata-yumusak px-3 py-2 text-sm text-hata">
            {hata}
          </p>
        ) : null}
        <div className="flex flex-col gap-1.5">
          <Etiket htmlFor={`${kimlik}-ara`}>{t('hesap.gruplar.uyeler.ara')}</Etiket>
          <Girdi
            id={`${kimlik}-ara`}
            type="search"
            value={ara}
            onChange={(e) => {
              setAra(e.target.value);
            }}
          />
        </div>
        {ogrenciler.isPending ? (
          <ListeIskeleti satir={3} />
        ) : ogrenciler.isError ? (
          <HataDurumu
            baslik={t('hesap.ortak.listeYuklenemedi')}
            aciklama={hataMesaji(ogrenciler.error)}
            tekrarDene={() => void ogrenciler.refetch()}
            className="py-6"
          />
        ) : adaylar.length === 0 ? (
          <p className="py-4 text-center text-sm text-metin-ikincil">
            {t('hesap.gruplar.uyeler.eklenecekYok')}
          </p>
        ) : (
          <ul className="max-h-72 divide-y divide-kenar overflow-y-auto rounded-orta border border-kenar">
            {adaylar.map((u) => {
              const ad = u.gorunen_ad ?? t('hesap.uye.adsiz');
              return (
                <li key={u.uyelik_id} className="flex items-center gap-3 px-3 py-2.5">
                  <OnayKutusu
                    id={`${kimlik}-${u.uyelik_id}`}
                    checked={secili.has(u.uyelik_id)}
                    onCheckedChange={(c) => {
                      setSecili((onceki) => {
                        const yeni = new Set(onceki);
                        if (c === true) yeni.add(u.uyelik_id);
                        else yeni.delete(u.uyelik_id);
                        return yeni;
                      });
                    }}
                  />
                  <label htmlFor={`${kimlik}-${u.uyelik_id}`} className="flex-1 cursor-pointer">
                    {ad}
                  </label>
                </li>
              );
            })}
          </ul>
        )}
        <DahaFazla
          daha={ogrenciler.hasNextPage}
          yukleniyor={ogrenciler.isFetchingNextPage}
          yukle={() => void ogrenciler.fetchNextPage()}
        />
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Dugme
            gorunum="ikincil"
            onClick={() => {
              degisti(false);
            }}
          >
            {t('hesap.ortak.vazgec')}
          </Dugme>
          <Dugme
            disabled={secili.size === 0 || ekle.isPending}
            onClick={() => {
              setHata(null);
              ekle.mutate([...secili]);
            }}
          >
            {ekle.isPending
              ? t('hesap.ortak.kaydediliyor')
              : t('hesap.gruplar.uyeler.eklenecekSayisi', { n: secili.size })}
          </Dugme>
        </div>
      </div>
    </Pencere>
  );
}
