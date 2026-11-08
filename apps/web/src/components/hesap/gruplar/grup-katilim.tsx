'use client';

import { KatilimIstekListeYanitSema, KatilimKoduSema, type GrupTipi } from '@kopru/contracts';
import { t } from '@kopru/i18n';
import { useMutation, useQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { Check, KeyRound, RefreshCw, X } from 'lucide-react';
import { useId, useState } from 'react';
import type { z } from 'zod';

import {
  basari,
  basarisiz,
  BildirimKutusu,
  Bolum,
  DahaFazla,
  KopyalaDugmesi,
  ListeIskeleti,
  tarihYaz,
  zamanYaz,
  type Bildirim,
} from '../ortak';

import { BosDurum } from '@/components/bos-durum';
import { HataDurumu } from '@/components/hata-durumu';
import { Dugme } from '@/components/ui/button';
import { Etiket, Girdi } from '@/components/ui/input';
import { OnayPenceresi, Pencere } from '@/components/ui/pencere';
import { Rozet } from '@/components/ui/rozet';
import { Uyari } from '@/components/ui/uyari';
import { hataMesaji, UygulamaHatasi } from '@/lib/api';
import { hesapIstek } from '@/lib/hesap-istek';
import { useSayfaliSorgu, yenidenDene } from '@/lib/sayfali-sorgu';

type Kod = z.output<typeof KatilimKoduSema>;
type IstekListe = z.output<typeof KatilimIstekListeYanitSema>;

/** `ABCD2345` -> `ABCD 2345` (gosterim); kopyalanan deger bosluksuz koddur. */
const kodGrupla = (kod: string) => `${kod.slice(0, 4)} ${kod.slice(4)}`;

export function GrupKatilim({ kurumId, grup }: { kurumId: string; grup: GrupTipi }) {
  if (grup.tur !== 'sinif') return null;
  return (
    <>
      <KatilimKodu kurumId={kurumId} grup={grup} />
      <KatilimIstekleri kurumId={kurumId} grup={grup} />
    </>
  );
}

function KatilimKodu({ kurumId, grup }: { kurumId: string; grup: GrupTipi }) {
  const qc = useQueryClient();
  const anahtar = ['hesap', kurumId, 'gruplar', grup.id, 'kod'] as const;
  const yol = `kurumlar/${kurumId}/gruplar/${grup.id}/katilim-kodu`;
  const arsivde = grup.durum === 'arsiv';
  const [formAcik, setFormAcik] = useState(false);
  const [yenileOnay, setYenileOnay] = useState(false);
  const [kapatOnay, setKapatOnay] = useState(false);
  const [bildirim, setBildirim] = useState<Bildirim>(null);

  const sorgu = useQuery({
    queryKey: anahtar,
    retry: yenidenDene,
    // Etkin kod yoksa api 404 verir: bu bir hata degil, "kod yok" durumudur.
    queryFn: async (): Promise<Kod | null> => {
      try {
        return await hesapIstek(yol, { sema: KatilimKoduSema });
      } catch (e) {
        if (e instanceof UygulamaHatasi && e.durum === 404) return null;
        throw e;
      }
    },
  });
  const kod = sorgu.data?.aktif ? sorgu.data : null;

  const uret = useMutation({
    mutationFn: (govde: { gecerlilik_gun?: number; max_kullanim?: number }) =>
      hesapIstek(yol, { govde, sema: KatilimKoduSema }),
    onSuccess: (yeni) => {
      qc.setQueryData(anahtar, yeni);
      setFormAcik(false);
      setYenileOnay(false);
      setBildirim(basari(t('hesap.gruplar.kod.uretildi')));
    },
    onError: (e) => {
      setYenileOnay(false);
      setBildirim(basarisiz(e));
    },
  });

  const kapat = useMutation({
    mutationFn: () => hesapIstek(yol, { yontem: 'DELETE' }),
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: anahtar });
      const onceki = qc.getQueryData<Kod | null>(anahtar);
      qc.setQueryData<Kod | null>(anahtar, null);
      setKapatOnay(false);
      return { onceki };
    },
    onError: (e, _v, baglam) => {
      qc.setQueryData(anahtar, baglam?.onceki);
      setBildirim(basarisiz(e));
    },
    onSuccess: () => {
      setBildirim(basari(t('hesap.gruplar.kod.kapatildi')));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: anahtar }),
  });

  return (
    <Bolum baslik={t('hesap.gruplar.kod.baslik')} aciklama={t('hesap.gruplar.kod.aciklama')}>
      <div className="flex flex-col gap-4 p-4">
        <BildirimKutusu bildirim={bildirim} />
        {sorgu.isPending ? (
          <ListeIskeleti satir={1} />
        ) : sorgu.isError ? (
          <HataDurumu
            baslik={t('hesap.gruplar.kod.yuklenemedi')}
            aciklama={hataMesaji(sorgu.error)}
            tekrarDene={() => void sorgu.refetch()}
            className="py-4"
          />
        ) : kod ? (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <p
                aria-label={`${t('hesap.gruplar.kod.kod')}: ${kod.kod.split('').join(' ')}`}
                className="select-all rounded-orta bg-yuzey-ikincil px-4 py-3 font-mono text-3xl font-semibold tracking-[0.2em]"
                data-testid="katilim-kodu"
              >
                {kodGrupla(kod.kod)}
              </p>
              <KopyalaDugmesi metin={kod.kod} etiket={t('hesap.gruplar.kod.kopyala')} />
            </div>
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-metin-ikincil">
              <span>
                {kod.max_kullanim !== null
                  ? t('hesap.gruplar.kod.kullanim', {
                      n: kod.kullanim_sayisi,
                      azami: kod.max_kullanim,
                    })
                  : t('hesap.gruplar.kod.kullanimSinirsiz', { n: kod.kullanim_sayisi })}
              </span>
              <span>
                {kod.expires_at
                  ? t('hesap.gruplar.kod.gecerlilik', { tarih: tarihYaz(kod.expires_at) })
                  : t('hesap.gruplar.kod.suresiz')}
              </span>
            </p>
            {!arsivde ? (
              <div className="flex flex-wrap gap-2">
                <Dugme
                  gorunum="ikincil"
                  boyut="sm"
                  onClick={() => {
                    setYenileOnay(true);
                  }}
                >
                  <RefreshCw aria-hidden />
                  {t('hesap.gruplar.kod.yenile')}
                </Dugme>
                <Dugme
                  gorunum="hayalet"
                  boyut="sm"
                  onClick={() => {
                    setKapatOnay(true);
                  }}
                >
                  {t('hesap.gruplar.kod.kapat')}
                </Dugme>
              </div>
            ) : null}
          </div>
        ) : (
          <BosDurum
            className="py-4"
            ikon={KeyRound}
            baslik={t('hesap.gruplar.kod.yok')}
            aciklama={t('hesap.gruplar.kod.yokAciklama')}
          >
            {!arsivde ? (
              <Dugme
                onClick={() => {
                  setFormAcik(true);
                }}
              >
                {t('hesap.gruplar.kod.uret')}
              </Dugme>
            ) : null}
          </BosDurum>
        )}
      </div>

      <KodFormu
        acik={formAcik}
        degisti={setFormAcik}
        bekliyor={uret.isPending}
        gonder={(g) => {
          uret.mutate(g);
        }}
        hata={uret.error ? hataMesaji(uret.error) : null}
      />

      <OnayPenceresi
        acik={yenileOnay}
        degisti={setYenileOnay}
        baslik={t('hesap.gruplar.kod.yenileBaslik')}
        aciklama={t('hesap.gruplar.kod.yenileAciklama')}
        onayEtiketi={t('hesap.gruplar.kod.yenileOnay')}
        bekliyor={uret.isPending}
        onay={() => {
          uret.mutate({});
        }}
      />
      <OnayPenceresi
        acik={kapatOnay}
        degisti={setKapatOnay}
        baslik={t('hesap.gruplar.kod.kapatBaslik')}
        aciklama={t('hesap.gruplar.kod.kapatAciklama')}
        onayEtiketi={t('hesap.gruplar.kod.kapatOnay')}
        tehlikeli
        bekliyor={kapat.isPending}
        onay={() => {
          kapat.mutate();
        }}
      />
    </Bolum>
  );
}

function KodFormu({
  acik,
  degisti,
  bekliyor,
  gonder,
  hata,
}: {
  acik: boolean;
  degisti: (a: boolean) => void;
  bekliyor: boolean;
  gonder: (g: { gecerlilik_gun?: number; max_kullanim?: number }) => void;
  hata: string | null;
}) {
  const kimlik = useId();
  const [gun, setGun] = useState('');
  const [azami, setAzami] = useState('');
  const [yerel, setYerel] = useState<string | null>(null);

  function gonderildi(olay: React.SyntheticEvent) {
    olay.preventDefault();
    const g = gun.trim() === '' ? undefined : Number(gun);
    const a = azami.trim() === '' ? undefined : Number(azami);
    if (
      (g !== undefined && (!Number.isInteger(g) || g < 1 || g > 365)) ||
      (a !== undefined && (!Number.isInteger(a) || a < 1 || a > 10_000))
    ) {
      setYerel(t('hesap.davet.form.sayiHata'));
      return;
    }
    setYerel(null);
    gonder({
      ...(g !== undefined ? { gecerlilik_gun: g } : {}),
      ...(a !== undefined ? { max_kullanim: a } : {}),
    });
  }

  return (
    <Pencere acik={acik} degisti={degisti} baslik={t('hesap.gruplar.kod.uret')}>
      <form onSubmit={gonderildi} noValidate className="flex flex-col gap-4">
        {(yerel ?? hata) ? <Uyari>{yerel ?? hata}</Uyari> : null}
        <div className="flex flex-col gap-1.5">
          <Etiket htmlFor={`${kimlik}-gun`}>{t('hesap.gruplar.kod.gecerlilikGun')}</Etiket>
          <Girdi
            id={`${kimlik}-gun`}
            type="number"
            inputMode="numeric"
            min={1}
            max={365}
            value={gun}
            onChange={(e) => {
              setGun(e.target.value);
            }}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Etiket htmlFor={`${kimlik}-az`}>{t('hesap.gruplar.kod.maxKullanim')}</Etiket>
          <Girdi
            id={`${kimlik}-az`}
            type="number"
            inputMode="numeric"
            min={1}
            max={10000}
            value={azami}
            aria-describedby={`${kimlik}-yardim`}
            onChange={(e) => {
              setAzami(e.target.value);
            }}
          />
          <p id={`${kimlik}-yardim`} className="text-sm text-metin-ikincil">
            {t('hesap.gruplar.kod.yardim')}
          </p>
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
          <Dugme type="submit" disabled={bekliyor}>
            {bekliyor ? t('hesap.gruplar.kod.uretiliyor') : t('hesap.gruplar.kod.uret')}
          </Dugme>
        </div>
      </form>
    </Pencere>
  );
}

function KatilimIstekleri({ kurumId, grup }: { kurumId: string; grup: GrupTipi }) {
  const qc = useQueryClient();
  const taban = ['hesap', kurumId, 'gruplar', grup.id, 'istekler'] as const;
  const yol = `kurumlar/${kurumId}/gruplar/${grup.id}/katilim-istekleri`;
  const [bildirim, setBildirim] = useState<Bildirim>(null);

  const sorgu = useSayfaliSorgu({
    anahtar: taban,
    yol,
    sema: KatilimIstekListeYanitSema,
    sorgu: { durum: 'bekliyor' },
  });
  const istekler = sorgu.data?.pages.flatMap((s) => s.istekler) ?? [];

  const karar = useMutation({
    mutationFn: ({ id, eylem }: { id: string; eylem: 'onayla' | 'reddet'; ad: string }) =>
      hesapIstek(`${yol}/${id}/${eylem}`, { yontem: 'POST' }),
    onMutate: async ({ id }) => {
      await qc.cancelQueries({ queryKey: taban });
      const onceki = qc.getQueriesData<InfiniteData<IstekListe>>({ queryKey: taban });
      qc.setQueriesData<InfiniteData<IstekListe>>({ queryKey: taban }, (v) =>
        v
          ? {
              ...v,
              pages: v.pages.map((s) => ({
                ...s,
                istekler: s.istekler.filter((i) => i.id !== id),
              })),
            }
          : v,
      );
      return { onceki };
    },
    onError: (e, _v, baglam) => {
      for (const [anahtar, veri] of baglam?.onceki ?? []) qc.setQueryData(anahtar, veri);
      setBildirim(basarisiz(e));
    },
    onSuccess: (_s, { eylem, ad }) => {
      setBildirim(
        basari(
          eylem === 'onayla'
            ? t('hesap.gruplar.istekler.onaylandi', { ad })
            : t('hesap.gruplar.istekler.reddedildi', { ad }),
        ),
      );
      if (eylem === 'onayla') {
        // Onay uyeyi gruba ekler: uye sayisi, uye listesi ve kod kullanim sayaci degisir.
        void qc.invalidateQueries({ queryKey: ['hesap', kurumId, 'gruplar', grup.id] });
        void qc.invalidateQueries({ queryKey: ['hesap', kurumId, 'uyelikler'] });
      }
    },
    onSettled: () => qc.invalidateQueries({ queryKey: taban }),
  });

  return (
    <Bolum
      baslik={t('hesap.gruplar.istekler.baslik')}
      eylemler={
        istekler.length > 0 ? (
          <Rozet ton="uyari">{t('hesap.gruplar.istekler.sayi', { n: istekler.length })}</Rozet>
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
          baslik={t('hesap.gruplar.istekler.yuklenemedi')}
          aciklama={hataMesaji(sorgu.error)}
          tekrarDene={() => void sorgu.refetch()}
          className="py-8"
        />
      ) : istekler.length === 0 ? (
        <BosDurum
          className="py-8"
          ikon={Check}
          baslik={t('hesap.gruplar.istekler.bos')}
          aciklama={t('hesap.gruplar.istekler.bosAciklama')}
        />
      ) : (
        <>
          <ul className="divide-y divide-kenar" aria-label={t('hesap.gruplar.istekler.baslik')}>
            {istekler.map((i) => {
              const ad = i.gorunen_ad ?? t('hesap.gruplar.istekler.adsiz');
              return (
                <li key={i.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{ad}</p>
                    <p className="text-sm text-metin-ikincil">
                      {t('hesap.gruplar.istekler.gonderildi', { zaman: zamanYaz(i.created_at) })}
                    </p>
                  </div>
                  {grup.durum === 'aktif' ? (
                    <div className="flex gap-2">
                      <Dugme
                        boyut="sm"
                        aria-label={t('hesap.gruplar.istekler.onaylaAria', { ad })}
                        disabled={karar.isPending}
                        onClick={() => {
                          karar.mutate({ id: i.id, eylem: 'onayla', ad });
                        }}
                      >
                        <Check aria-hidden />
                        {t('hesap.ortak.onayla')}
                      </Dugme>
                      <Dugme
                        gorunum="ikincil"
                        boyut="sm"
                        aria-label={t('hesap.gruplar.istekler.reddetAria', { ad })}
                        disabled={karar.isPending}
                        onClick={() => {
                          karar.mutate({ id: i.id, eylem: 'reddet', ad });
                        }}
                      >
                        <X aria-hidden />
                        {t('hesap.ortak.reddet')}
                      </Dugme>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
          <DahaFazla
            daha={sorgu.hasNextPage}
            yukleniyor={sorgu.isFetchingNextPage}
            yukle={() => void sorgu.fetchNextPage()}
          />
        </>
      )}
    </Bolum>
  );
}
