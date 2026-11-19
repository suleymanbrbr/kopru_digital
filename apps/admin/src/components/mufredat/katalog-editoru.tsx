'use client';

import { t } from '@kopru/i18n';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Plus } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';

import { Alan, MetinAlani, Secim } from '../ui/alan';
import { Dugme } from '../ui/dugme';
import { SorguHatasi, Yukleniyor } from '../ui/durum-gosterimi';
import { Kart, KartBasligi, SayfaBasligi } from '../ui/kart';
import { OnayPenceresi } from '../ui/onay-penceresi';
import { Rozet } from '../ui/rozet';
import { Uyari } from '../ui/uyari';
import { FarkGorunumu } from './fark-gorunumu';
import { KATALOG_ANAHTARI } from './katalog-listesi';
import { KonuIslemPenceresi, type KonuIslemi } from './konu-islemleri';

import { platform } from '@/lib/api';
import { agacKur, bransGrupla, type AgacDugumu } from '@/lib/mufredat';
import { useYonetici } from '@/lib/oturum';
import type { Agac, Fark, KatalogKodu, KatalogListesi, Konu, YayinSonucu } from '@/lib/tipler';

const katla = (s: string) => s.toLocaleLowerCase('tr').replace(/ı/g, 'i');

/** Aramaya uyan konular ve onlari tasiyan ata yollari kalir. */
function filtrele(dugumler: readonly AgacDugumu[], q: string): AgacDugumu[] {
  if (!q) return [...dugumler];
  return dugumler.flatMap((d) => {
    const cocuklar = filtrele(d.cocuklar, q);
    return katla(d.konu.ad).includes(q) || cocuklar.length > 0 ? [{ ...d, cocuklar }] : [];
  });
}

function KonuSatiri({
  dugum,
  duzenlenebilir,
  onIslem,
}: {
  dugum: AgacDugumu;
  duzenlenebilir: boolean;
  onIslem: (islem: KonuIslemi) => void;
}) {
  const k = dugum.konu;
  const adlar = k.ad;
  return (
    <li>
      <div
        className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-kenar py-2"
        style={{ paddingLeft: `${String(dugum.derinlik * 1.25)}rem` }}
      >
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="font-medium">{k.ad}</span>
          <Rozet>{t(`yonetim.mufredat.seviye.${k.seviye}`)}</Rozet>
          {k.yeni ? <Rozet ton="bilgi">{t('yonetim.mufredat.yeni')}</Rozet> : null}
          {k.sinif_seviyesi ? (
            <span className="text-xs text-metin-ikincil">
              {t('yonetim.mufredat.sinif', { n: k.sinif_seviyesi })}
            </span>
          ) : null}
          {k.kazanim_kodu ? (
            <span className="text-xs text-metin-ikincil">
              {t('yonetim.mufredat.kazanim', { kod: k.kazanim_kodu })}
            </span>
          ) : null}
        </div>
        {duzenlenebilir ? (
          <div
            role="group"
            aria-label={t('yonetim.mufredat.islemlerKonu', { ad: adlar })}
            className="flex flex-wrap gap-1"
          >
            {k.seviye !== 'alt_konu' ? (
              <Dugme
                gorunum="hayalet"
                boyut="sm"
                aria-label={`${t('yonetim.mufredat.konuEkle')}: ${adlar}`}
                onClick={() => {
                  onIslem({ tur: 'ekle', ust: k });
                }}
              >
                <Plus aria-hidden />
              </Dugme>
            ) : null}
            {(['adlandir', 'tasi', 'birlestir', 'kaldir'] as const).map((tur) => (
              <Dugme
                key={tur}
                gorunum="hayalet"
                boyut="sm"
                aria-label={`${t(`yonetim.mufredat.${tur}`)}: ${adlar}`}
                onClick={() => {
                  onIslem({ tur, konu: k });
                }}
              >
                {t(`yonetim.mufredat.${tur}`)}
              </Dugme>
            ))}
          </div>
        ) : null}
      </div>
      {dugum.cocuklar.length > 0 ? (
        <ul>
          {dugum.cocuklar.map((c) => (
            <KonuSatiri
              key={c.konu.id}
              dugum={c}
              duzenlenebilir={duzenlenebilir}
              onIslem={onIslem}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function AgacGorunumu({
  konular,
  duzenlenebilir,
  onIslem,
}: {
  konular: readonly Konu[];
  duzenlenebilir: boolean;
  onIslem: (islem: KonuIslemi) => void;
}) {
  const [ara, setAra] = useState('');
  const kokler = useMemo(() => agacKur(konular), [konular]);
  const gorunen = filtrele(kokler, katla(ara.trim()));
  const gruplar = bransGrupla(gorunen);

  return (
    <div className="flex flex-col gap-4">
      <Alan
        etiket={t('yonetim.mufredat.agacAra')}
        type="search"
        value={ara}
        onChange={(e) => {
          setAra(e.target.value);
        }}
        kapsayiciSinifi="max-w-md"
      />
      {gruplar.length === 0 ? (
        <p className="py-6 text-center text-sm text-metin-ikincil">
          {t('yonetim.mufredat.agacBos')}
        </p>
      ) : (
        gruplar.map(([brans, dugumler]) => (
          <section key={brans} aria-labelledby={`brans-${brans}`}>
            <h3 id={`brans-${brans}`} className="mb-1 text-sm font-semibold text-metin-ikincil">
              {t('yonetim.mufredat.agacBransi', { kod: brans })}
            </h3>
            <ul>
              {dugumler.map((d) => (
                <KonuSatiri
                  key={d.konu.id}
                  dugum={d}
                  duzenlenebilir={duzenlenebilir}
                  onIslem={onIslem}
                />
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}

function TaslakAcPenceresi({
  kod,
  acik,
  onKapat,
  onBasari,
}: {
  kod: KatalogKodu;
  acik: boolean;
  onKapat: () => void;
  onBasari: () => void;
}) {
  const [ad, setAd] = useState('');
  const [aciklama, setAciklama] = useState('');
  const ac = useMutation({
    mutationFn: () =>
      platform.yolla(`mufredat/kataloglar/${kod}/taslak`, {
        ad: ad.trim(),
        ...(aciklama.trim() ? { aciklama: aciklama.trim() } : {}),
      }),
    onSuccess: onBasari,
  });
  return (
    <OnayPenceresi
      acik={acik}
      onKapat={() => {
        ac.reset();
        onKapat();
      }}
      baslik={t('yonetim.mufredat.taslakAcBaslik')}
      aciklama={t('yonetim.mufredat.taslakAcAciklama')}
      onayEtiketi={t('yonetim.mufredat.taslakAc')}
      bekliyor={ac.isPending}
      hata={ac.error}
      gecerli={ad.trim().length > 0}
      onOnayla={() => {
        ac.mutate();
      }}
    >
      <Alan
        etiket={t('yonetim.mufredat.taslakAd')}
        maxLength={200}
        value={ad}
        onChange={(e) => {
          setAd(e.target.value);
        }}
        required
      />
      <MetinAlani
        etiket={t('yonetim.mufredat.taslakAciklama')}
        maxLength={4000}
        value={aciklama}
        onChange={(e) => {
          setAciklama(e.target.value);
        }}
        rows={2}
      />
    </OnayPenceresi>
  );
}

function YayinPenceresi({
  kod,
  acik,
  fark,
  onKapat,
  onBasari,
}: {
  kod: KatalogKodu;
  acik: boolean;
  fark: Fark | undefined;
  onKapat: () => void;
  onBasari: (s: YayinSonucu) => void;
}) {
  const yayinla = useMutation({
    mutationFn: () => platform.yolla<YayinSonucu>(`mufredat/kataloglar/${kod}/taslak/yayinla`),
    onSuccess: onBasari,
  });
  const o = fark?.ozet;
  const toplam = o ? o.eklenen + o.yeniden_adlandirilan + o.tasinan + o.birlesen + o.kaldirilan : 0;
  return (
    <OnayPenceresi
      acik={acik}
      onKapat={() => {
        yayinla.reset();
        onKapat();
      }}
      baslik={t('yonetim.mufredat.yayinBaslik')}
      aciklama={t('yonetim.mufredat.yayinAciklama')}
      onayEtiketi={t('yonetim.mufredat.yayinla')}
      onayKutusu={t('yonetim.mufredat.yayinOnay')}
      bekliyor={yayinla.isPending}
      hata={yayinla.error}
      gecerli={toplam > 0}
      onOnayla={() => {
        yayinla.mutate();
      }}
    >
      <p className="text-sm font-medium">{t('yonetim.mufredat.yayinOzet', { n: toplam })}</p>
    </OnayPenceresi>
  );
}

export function KatalogEditoru({ kod }: { kod: KatalogKodu }) {
  const yonetici = useYonetici();
  const istemci = useQueryClient();
  const [secilen, setSecilen] = useState<number | null>(null);
  const [sekme, setSekme] = useState<'agac' | 'fark'>('agac');
  const [islem, setIslem] = useState<KonuIslemi | null>(null);
  const [islemSayaci, setIslemSayaci] = useState(0);
  const [taslakAcik, setTaslakAcik] = useState(false);
  const [yayinAcik, setYayinAcik] = useState(false);
  const [bildirim, setBildirim] = useState<{ ton: 'basari'; metin: string } | null>(null);

  const katalogSorgusu = useQuery({
    queryKey: KATALOG_ANAHTARI,
    enabled: yonetici,
    queryFn: () => platform.al<KatalogListesi>('mufredat/kataloglar'),
  });
  const katalog = katalogSorgusu.data?.kataloglar.find((k) => k.katalog_kodu === kod);
  const taslak = katalog?.surumler.find((s) => s.taslak);
  const surumNo =
    secilen ??
    katalog?.taslak_surum_no ??
    (katalog && (katalog.en_yuksek_yayinlanmis ?? 0) > 0 ? katalog.en_yuksek_yayinlanmis : null);
  const surum = katalog?.surumler.find((s) => s.surum_no === surumNo);

  const agac = useQuery({
    queryKey: ['mufredat', kod, 'agac', surumNo],
    enabled: surumNo !== null,
    queryFn: () => platform.al<Agac>(`mufredat/kataloglar/${kod}/surumler/${String(surumNo)}/agac`),
  });
  const fark = useQuery({
    queryKey: ['mufredat', kod, 'fark', surumNo],
    enabled: surumNo !== null && (sekme === 'fark' || yayinAcik),
    queryFn: () => platform.al<Fark>(`mufredat/kataloglar/${kod}/surumler/${String(surumNo)}/fark`),
  });

  const yenile = () => istemci.invalidateQueries({ queryKey: ['mufredat'] });

  if (!yonetici) {
    return (
      <>
        <SayfaBasligi baslik={t('yonetim.mufredat.baslik')} />
        <Uyari ton="uyari">{t('yonetim.ortak.yalnizYonetici')}</Uyari>
      </>
    );
  }

  const geri = (
    <Link
      href="/mufredat"
      className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-metin-ikincil hover:text-metin"
    >
      <ArrowLeft className="size-4" aria-hidden />
      {t('yonetim.mufredat.kataloglaraDon')}
    </Link>
  );

  if (katalogSorgusu.isPending) {
    return (
      <>
        {geri}
        <Yukleniyor />
      </>
    );
  }
  if (katalogSorgusu.error || !katalog) {
    return (
      <>
        {geri}
        <SorguHatasi
          hata={katalogSorgusu.error}
          onTekrar={() => {
            void katalogSorgusu.refetch();
          }}
        />
      </>
    );
  }

  const taslakSurumu = surum?.taslak === true;
  const islemAc = (i: KonuIslemi) => {
    setBildirim(null);
    setIslemSayaci((s) => s + 1);
    setIslem(i);
  };

  return (
    <>
      {geri}
      <SayfaBasligi
        baslik={t(`yonetim.mufredat.katalog.${kod}`)}
        aciklama={t('yonetim.mufredat.aciklama')}
        sag={
          taslakSurumu ? (
            <div className="flex flex-wrap gap-2">
              <Dugme
                gorunum="ikincil"
                onClick={() => {
                  islemAc({ tur: 'ekle' });
                }}
              >
                <Plus aria-hidden />
                {t('yonetim.mufredat.konuEkle')}
              </Dugme>
              <Dugme
                onClick={() => {
                  setBildirim(null);
                  setYayinAcik(true);
                }}
              >
                {t('yonetim.mufredat.yayinla')}
              </Dugme>
            </div>
          ) : !taslak ? (
            <Dugme
              onClick={() => {
                setBildirim(null);
                setTaslakAcik(true);
              }}
            >
              {t('yonetim.mufredat.taslakAc')}
            </Dugme>
          ) : undefined
        }
      />

      {bildirim ? (
        <Uyari ton={bildirim.ton} className="mb-4">
          {bildirim.metin}
        </Uyari>
      ) : null}

      <Kart aria-labelledby="surum-baslik">
        <KartBasligi
          id="surum-baslik"
          baslik={t('yonetim.mufredat.surum')}
          sag={
            surum ? (
              <Rozet ton={surum.taslak ? 'uyari' : 'basari'}>
                {surum.taslak
                  ? t('yonetim.mufredat.taslakEtiket')
                  : t('yonetim.mufredat.yayinliEtiket')}
              </Rozet>
            ) : undefined
          }
        />
        {katalog.surumler.length === 0 ? (
          <p className="text-sm text-metin-ikincil">{t('yonetim.mufredat.yayinYok')}</p>
        ) : (
          <Secim
            etiket={t('yonetim.mufredat.surumSec')}
            value={surumNo ?? ''}
            onChange={(e) => {
              setSecilen(Number(e.target.value));
            }}
            kapsayiciSinifi="max-w-md"
          >
            {katalog.surumler.map((s) => (
              <option key={s.surum_no} value={s.surum_no}>
                {t('yonetim.mufredat.surumEtiket', { n: s.surum_no, ad: s.ad })}
                {s.taslak ? ` (${t('yonetim.mufredat.taslakEtiket')})` : ''}
              </option>
            ))}
          </Secim>
        )}
        {surum && !surum.taslak ? (
          <p className="mt-3 text-sm text-metin-ikincil">{t('yonetim.mufredat.salt')}</p>
        ) : null}

        {surumNo !== null ? (
          <>
            <div
              role="tablist"
              aria-label={t('yonetim.mufredat.sekmeler')}
              className="mt-5 inline-flex gap-1 rounded-orta border border-kenar bg-yuzey-ikincil p-0.5"
            >
              {(['agac', 'fark'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  role="tab"
                  id={`sekme-${s}`}
                  aria-selected={sekme === s}
                  aria-controls="sekme-paneli"
                  onClick={() => {
                    setSekme(s);
                  }}
                  className={`h-9 rounded-kucuk px-4 text-sm font-medium ${sekme === s ? 'bg-yuzey text-metin' : 'text-metin-ikincil hover:text-metin'}`}
                >
                  {s === 'agac' ? t('yonetim.mufredat.sekmeAgac') : t('yonetim.mufredat.sekmeFark')}
                </button>
              ))}
            </div>

            <div
              id="sekme-paneli"
              role="tabpanel"
              aria-labelledby={`sekme-${sekme}`}
              className="mt-4"
            >
              {sekme === 'agac' ? (
                agac.isPending ? (
                  <Yukleniyor />
                ) : agac.error ? (
                  <SorguHatasi
                    hata={agac.error}
                    onTekrar={() => {
                      void agac.refetch();
                    }}
                  />
                ) : (
                  <AgacGorunumu
                    konular={agac.data.konular}
                    duzenlenebilir={taslakSurumu}
                    onIslem={islemAc}
                  />
                )
              ) : fark.isPending ? (
                <Yukleniyor />
              ) : fark.error ? (
                <SorguHatasi
                  hata={fark.error}
                  onTekrar={() => {
                    void fark.refetch();
                  }}
                />
              ) : (
                <FarkGorunumu fark={fark.data} konular={agac.data?.konular ?? []} />
              )}
            </div>
          </>
        ) : null}
      </Kart>

      <KonuIslemPenceresi
        key={islemSayaci}
        kod={kod}
        islem={islem}
        konular={agac.data?.konular ?? []}
        onKapat={() => {
          setIslem(null);
        }}
        onBasari={() => {
          setIslem(null);
          setBildirim({ ton: 'basari', metin: t('yonetim.mufredat.islemTamam') });
          void yenile();
        }}
      />
      <TaslakAcPenceresi
        kod={kod}
        acik={taslakAcik}
        onKapat={() => {
          setTaslakAcik(false);
        }}
        onBasari={() => {
          setTaslakAcik(false);
          setSecilen(null);
          setBildirim({ ton: 'basari', metin: t('yonetim.mufredat.taslakAcildi') });
          void yenile();
        }}
      />
      <YayinPenceresi
        kod={kod}
        acik={yayinAcik}
        fark={fark.data}
        onKapat={() => {
          setYayinAcik(false);
        }}
        onBasari={(s) => {
          setYayinAcik(false);
          setSecilen(null);
          setBildirim({
            ton: 'basari',
            metin: t('yonetim.mufredat.yayinlandi', {
              kurum: s.bildirilen_kurum_sayisi,
              baglanan: s.yeniden_baglanan_kurum_konusu,
            }),
          });
          void yenile();
        }}
      />
    </>
  );
}
