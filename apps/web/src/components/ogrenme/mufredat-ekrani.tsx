'use client';

import type { Konu, KonuSeviye } from '@kopru/contracts';
import { t } from '@kopru/i18n';
import { useMutation } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Library, Plus, Search } from 'lucide-react';
import { useMemo, useState } from 'react';

import { BosDurum } from '@/components/bos-durum';
import { HataDurumu } from '@/components/hata-durumu';
import {
  BildirimKutusu,
  ListeIskeleti,
  basari,
  basarisiz,
  type Bildirim,
} from '@/components/hesap/ortak';
import { BolumKapisi } from '@/components/kabuk/bolum-yer-tutucu';
import { SayfaBasligi } from '@/components/kabuk/sayfa-basligi';
import { Alan } from '@/components/operasyon/ortak';
import { Dugme } from '@/components/ui/button';
import { Girdi } from '@/components/ui/input';
import { Pencere } from '@/components/ui/pencere';
import { Rozet } from '@/components/ui/rozet';
import { Secim } from '@/components/ui/secim';
import { useKurum } from '@/kurum/baglam';
import { hataMesaji } from '@/lib/api';
import { bransAdi, siraliBransler } from '@/lib/bransler';
import { ogrenmeIstek } from '@/lib/hesap-istek';
import { agaciSuz, konuAgaci, type KonuDugumu } from '@/lib/ogrenme/konu';
import { ogrenmeYetkileri } from '@/lib/ogrenme/rol';
import { useKonular, useOgrenmeYenile } from '@/lib/ogrenme/veri';

export function MufredatEkrani() {
  return (
    <BolumKapisi bolum="mufredat">
      <MufredatIcerigi />
    </BolumKapisi>
  );
}

const SEVIYELER: readonly KonuSeviye[] = ['unite', 'konu', 'alt_konu'];

function MufredatIcerigi() {
  const { uyelik, rol } = useKurum();
  const kurumId = uyelik.kurumId;
  const yetki = ogrenmeYetkileri(rol);
  const konular = useKonular(kurumId);
  const [arama, setArama] = useState('');
  const [brans, setBrans] = useState('');
  const [katalog, setKatalog] = useState('');
  const [acik, setAcik] = useState<ReadonlySet<string>>(new Set());
  const [bildirim, setBildirim] = useState<Bildirim>(null);
  const [form, setForm] = useState<{ duzenle: Konu | null; ust: Konu | null } | null>(null);
  const yenile = useOgrenmeYenile(kurumId);

  const arsivle = useMutation({
    mutationFn: ({ konu, arsiv }: { konu: Konu; arsiv: boolean }) =>
      ogrenmeIstek(
        `kurumlar/${kurumId}/konular/${konu.id}/${arsiv ? 'arsivle' : 'arsivden-cikar'}`,
        {
          yontem: 'POST',
        },
      ),
    onSuccess: async (_, v) => {
      await yenile();
      setBildirim(
        basari(t(v.arsiv ? 'ogrenme.mufredat.arsivlendi' : 'ogrenme.mufredat.arsivdenCikti')),
      );
    },
    onError: (h) => {
      setBildirim(basarisiz(h));
    },
  });

  const tum = useMemo(() => konular.data ?? [], [konular.data]);
  const agac = useMemo(
    () =>
      agaciSuz(konuAgaci(tum), {
        ...(katalog ? { katalog } : {}),
        ...(brans ? { brans } : {}),
        arama,
        kalkanlariGoster: true,
      }),
    [tum, katalog, brans, arama],
  );
  const kataloglar = useMemo(
    () => [...new Set(tum.map((k) => k.katalog_kodu).filter((x) => x !== null))],
    [tum],
  );
  const aramaVar = arama.trim() !== '';

  const ac = (id: string) => {
    setAcik((onceki) => {
      const yeni = new Set(onceki);
      if (yeni.has(id)) yeni.delete(id);
      else yeni.add(id);
      return yeni;
    });
  };

  return (
    <>
      <SayfaBasligi baslik={t('ogrenme.mufredat.baslik')} aciklama={t('ogrenme.mufredat.aciklama')}>
        {yetki.konuYonetebilir ? (
          <Dugme
            onClick={() => {
              setForm({ duzenle: null, ust: null });
            }}
          >
            <Plus aria-hidden />
            {t('ogrenme.mufredat.konuEkle')}
          </Dugme>
        ) : null}
      </SayfaBasligi>
      <div className="mb-4 flex flex-col gap-3">
        <BildirimKutusu bildirim={bildirim} />
      </div>

      <section
        aria-label={t('ogrenme.mufredat.liste')}
        className="rounded-buyuk border border-kenar bg-yuzey"
      >
        <div className="grid gap-3 border-b border-kenar p-4 sm:grid-cols-[1fr_12rem_10rem]">
          <div className="relative">
            <label htmlFor="mufredat-ara" className="sr-only">
              {t('ogrenme.konu.ara')}
            </label>
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-metin-ikincil"
              aria-hidden
            />
            <Girdi
              id="mufredat-ara"
              type="search"
              className="pl-9"
              placeholder={t('ogrenme.konu.araYer')}
              value={arama}
              onChange={(e) => {
                setArama(e.target.value);
              }}
            />
          </div>
          <div>
            <label htmlFor="mufredat-brans" className="sr-only">
              {t('ogrenme.konu.brans')}
            </label>
            <Secim
              id="mufredat-brans"
              value={brans}
              onChange={(e) => {
                setBrans(e.target.value);
              }}
            >
              <option value="">{t('ogrenme.konu.tumBranslar')}</option>
              {siraliBransler().map((b) => (
                <option key={b.kod} value={b.kod}>
                  {b.ad}
                </option>
              ))}
            </Secim>
          </div>
          <div>
            <label htmlFor="mufredat-katalog" className="sr-only">
              {t('ogrenme.konu.katalog')}
            </label>
            <Secim
              id="mufredat-katalog"
              value={katalog}
              onChange={(e) => {
                setKatalog(e.target.value);
              }}
            >
              <option value="">{t('ogrenme.konu.tumKataloglar')}</option>
              {kataloglar.map((k) => (
                <option key={k} value={k}>
                  {k.toUpperCase()}
                </option>
              ))}
            </Secim>
          </div>
        </div>

        {konular.isPending ? (
          <ListeIskeleti satir={6} />
        ) : konular.isError ? (
          <HataDurumu
            baslik={t('ogrenme.mufredat.yuklenemedi')}
            aciklama={hataMesaji(konular.error)}
            tekrarDene={() => void konular.refetch()}
          />
        ) : agac.length === 0 ? (
          <BosDurum
            className="py-14"
            ikon={Library}
            baslik={
              aramaVar || brans || katalog
                ? t('ogrenme.mufredat.bosSuzgec')
                : t('ogrenme.mufredat.bos')
            }
            aciklama={
              aramaVar || brans || katalog
                ? t('ogrenme.mufredat.bosSuzgecAciklama')
                : t('ogrenme.mufredat.bosAciklama')
            }
          >
            {yetki.konuYonetebilir && !aramaVar && !brans && !katalog ? (
              <Dugme
                onClick={() => {
                  setForm({ duzenle: null, ust: null });
                }}
              >
                {t('ogrenme.mufredat.konuEkle')}
              </Dugme>
            ) : null}
          </BosDurum>
        ) : (
          <ul className="divide-y divide-kenar">
            {agac.map((d) => (
              <DugumSatiri
                key={d.konu.id}
                dugum={d}
                derinlik={0}
                acik={acik}
                aramaVar={aramaVar}
                ac={ac}
                yonetebilir={yetki.konuYonetebilir}
                duzenle={(k) => {
                  setForm({ duzenle: k, ust: null });
                }}
                altEkle={(k) => {
                  setForm({ duzenle: null, ust: k });
                }}
                arsivle={(konu, arsiv) => {
                  arsivle.mutate({ konu, arsiv });
                }}
              />
            ))}
          </ul>
        )}
      </section>

      {form ? (
        <KonuFormu
          kurumId={kurumId}
          tum={tum}
          duzenle={form.duzenle}
          ust={form.ust}
          kapat={() => {
            setForm(null);
          }}
          bitti={(m) => {
            setForm(null);
            setBildirim(basari(m));
          }}
        />
      ) : null}
    </>
  );
}

function DugumSatiri({
  dugum,
  derinlik,
  acik,
  aramaVar,
  ac,
  yonetebilir,
  duzenle,
  altEkle,
  arsivle,
}: {
  dugum: KonuDugumu;
  derinlik: number;
  acik: ReadonlySet<string>;
  aramaVar: boolean;
  ac: (id: string) => void;
  yonetebilir: boolean;
  duzenle: (k: Konu) => void;
  altEkle: (k: Konu) => void;
  arsivle: (k: Konu, arsiv: boolean) => void;
}) {
  const k = dugum.konu;
  const cocukVar = dugum.cocuklar.length > 0;
  const genis = aramaVar || acik.has(k.id);
  const kurumKonusu = k.katalog_kodu === null;
  return (
    <li>
      <div
        className="flex flex-wrap items-center gap-2 py-2 pr-3"
        style={{ paddingLeft: `${String(0.75 + derinlik * 1.5)}rem` }}
      >
        {cocukVar ? (
          <button
            type="button"
            aria-expanded={genis}
            aria-label={t(genis ? 'ogrenme.mufredat.daralt' : 'ogrenme.mufredat.genislet', {
              ad: k.ad,
            })}
            onClick={() => {
              ac(k.id);
            }}
            className="flex size-9 shrink-0 items-center justify-center rounded-orta text-metin-ikincil hover:bg-yuzey-ikincil"
          >
            {genis ? (
              <ChevronDown className="size-4" aria-hidden />
            ) : (
              <ChevronRight className="size-4" aria-hidden />
            )}
          </button>
        ) : (
          <span className="size-9 shrink-0" aria-hidden />
        )}
        <div className="min-w-0 flex-1">
          <p className={k.seviye === 'unite' ? 'font-semibold' : 'text-sm'}>{k.ad}</p>
          <p className="text-xs text-metin-ikincil">
            {bransAdi(k.brans_kodu)}
            {k.katalog_kodu ? ` · ${k.katalog_kodu.toUpperCase()}` : ''}
          </p>
        </div>
        {kurumKonusu ? <Rozet ton="bilgi">{t('ogrenme.mufredat.kurumKonusu')}</Rozet> : null}
        {k.kullanimdan_kalkti ? (
          <Rozet ton="uyari">
            {kurumKonusu ? t('ogrenme.mufredat.arsivde') : t('ogrenme.konu.kullanimdanKalkti')}
          </Rozet>
        ) : null}
        {yonetebilir && kurumKonusu ? (
          <div className="flex gap-1">
            {k.seviye !== 'alt_konu' && !k.kullanimdan_kalkti ? (
              <Dugme
                boyut="sm"
                gorunum="hayalet"
                aria-label={t('ogrenme.mufredat.altEkleEtiket', { ad: k.ad })}
                onClick={() => {
                  altEkle(k);
                }}
              >
                {t('ogrenme.mufredat.altEkle')}
              </Dugme>
            ) : null}
            <Dugme
              boyut="sm"
              gorunum="hayalet"
              aria-label={t('ogrenme.mufredat.duzenleEtiket', { ad: k.ad })}
              onClick={() => {
                duzenle(k);
              }}
            >
              {t('ogrenme.ortak.duzenle')}
            </Dugme>
            <Dugme
              boyut="sm"
              gorunum="hayalet"
              aria-label={t(
                k.kullanimdan_kalkti
                  ? 'ogrenme.mufredat.arsivdenCikarEtiket'
                  : 'ogrenme.mufredat.arsivleEtiket',
                { ad: k.ad },
              )}
              onClick={() => {
                arsivle(k, !k.kullanimdan_kalkti);
              }}
            >
              {t(
                k.kullanimdan_kalkti
                  ? 'ogrenme.mufredat.arsivdenCikar'
                  : 'ogrenme.mufredat.arsivle',
              )}
            </Dugme>
          </div>
        ) : null}
      </div>
      {cocukVar && genis ? (
        <ul>
          {dugum.cocuklar.map((c) => (
            <DugumSatiri
              key={c.konu.id}
              dugum={c}
              derinlik={derinlik + 1}
              acik={acik}
              aramaVar={aramaVar}
              ac={ac}
              yonetebilir={yonetebilir}
              duzenle={duzenle}
              altEkle={altEkle}
              arsivle={arsivle}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function KonuFormu({
  kurumId,
  tum,
  duzenle,
  ust,
  kapat,
  bitti,
}: {
  kurumId: string;
  tum: readonly Konu[];
  duzenle: Konu | null;
  ust: Konu | null;
  kapat: () => void;
  bitti: (mesaj: string) => void;
}) {
  const yenile = useOgrenmeYenile(kurumId);
  const [ad, setAd] = useState(duzenle?.ad ?? '');
  const [brans, setBrans] = useState(duzenle?.brans_kodu ?? ust?.brans_kodu ?? '');
  const [seviye, setSeviye] = useState<KonuSeviye>(
    duzenle?.seviye ?? (ust ? (ust.seviye === 'unite' ? 'konu' : 'alt_konu') : 'unite'),
  );
  const [ustId, setUstId] = useState(duzenle?.ust_id ?? ust?.id ?? '');
  const [hata, setHata] = useState<string | undefined>();
  const [adHata, setAdHata] = useState<string | undefined>();

  const ustSecenekleri = tum.filter(
    (k) =>
      !k.kullanimdan_kalkti &&
      k.brans_kodu === brans &&
      k.seviye === (seviye === 'konu' ? 'unite' : seviye === 'alt_konu' ? 'konu' : '__yok__'),
  );

  const kaydet = useMutation({
    mutationFn: () =>
      duzenle
        ? ogrenmeIstek(`kurumlar/${kurumId}/konular/${duzenle.id}`, {
            yontem: 'PATCH',
            govde: { ad: ad.trim() },
          })
        : ogrenmeIstek(`kurumlar/${kurumId}/konular`, {
            yontem: 'POST',
            govde: {
              brans_kodu: brans,
              seviye,
              ad: ad.trim(),
              ...(seviye !== 'unite' && ustId ? { ust_id: ustId } : {}),
            },
          }),
    onSuccess: async () => {
      await yenile();
      bitti(t(duzenle ? 'ogrenme.mufredat.guncellendi' : 'ogrenme.mufredat.eklendi'));
    },
    onError: (h) => {
      setHata(hataMesaji(h));
    },
  });

  const gonder = (e: { preventDefault: () => void }) => {
    e.preventDefault();
    setHata(undefined);
    if (!ad.trim()) {
      setAdHata(t('ogrenme.mufredat.hata.ad'));
      return;
    }
    setAdHata(undefined);
    if (!duzenle && (!brans || (seviye !== 'unite' && !ustId))) {
      setHata(t('ogrenme.mufredat.hata.ust'));
      return;
    }
    kaydet.mutate();
  };

  return (
    <Pencere
      acik
      degisti={(a) => {
        if (!a) kapat();
      }}
      baslik={t(duzenle ? 'ogrenme.mufredat.duzenleBaslik' : 'ogrenme.mufredat.eklePenceresi')}
      aciklama={t('ogrenme.mufredat.formAciklama')}
    >
      <form onSubmit={gonder} noValidate className="flex flex-col gap-4">
        {!duzenle ? (
          <>
            <Alan etiket={t('ogrenme.konu.brans')}>
              {(o) => (
                <Secim
                  {...o}
                  value={brans}
                  onChange={(e) => {
                    setBrans(e.target.value);
                    setUstId('');
                  }}
                >
                  <option value="">{t('ogrenme.mufredat.bransSec')}</option>
                  {siraliBransler().map((b) => (
                    <option key={b.kod} value={b.kod}>
                      {b.ad}
                    </option>
                  ))}
                </Secim>
              )}
            </Alan>
            <Alan etiket={t('ogrenme.mufredat.seviye')}>
              {(o) => (
                <Secim
                  {...o}
                  value={seviye}
                  onChange={(e) => {
                    setSeviye(e.target.value as KonuSeviye);
                    setUstId('');
                  }}
                >
                  {SEVIYELER.map((s) => (
                    <option key={s} value={s}>
                      {t(`ogrenme.mufredat.seviyeAd.${s}`)}
                    </option>
                  ))}
                </Secim>
              )}
            </Alan>
            {seviye !== 'unite' ? (
              <Alan etiket={t('ogrenme.mufredat.ust')}>
                {(o) => (
                  <Secim
                    {...o}
                    value={ustId}
                    onChange={(e) => {
                      setUstId(e.target.value);
                    }}
                  >
                    <option value="">{t('ogrenme.mufredat.ustSec')}</option>
                    {ustSecenekleri.map((k) => (
                      <option key={k.id} value={k.id}>
                        {k.ad}
                      </option>
                    ))}
                  </Secim>
                )}
              </Alan>
            ) : null}
          </>
        ) : null}
        <Alan etiket={t('ogrenme.mufredat.ad')} hata={adHata}>
          {(o) => (
            <Girdi
              {...o}
              value={ad}
              maxLength={200}
              onChange={(e) => {
                setAd(e.target.value);
              }}
            />
          )}
        </Alan>
        {hata ? (
          <p role="alert" className="text-sm text-hata">
            {hata}
          </p>
        ) : null}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Dugme type="button" gorunum="ikincil" onClick={kapat}>
            {t('ortak.vazgec')}
          </Dugme>
          <Dugme type="submit" disabled={kaydet.isPending}>
            {kaydet.isPending
              ? t('ortak.yukleniyor')
              : t(duzenle ? 'ogrenme.ortak.kaydet' : 'ogrenme.mufredat.ekle')}
          </Dugme>
        </div>
      </form>
    </Pencere>
  );
}
