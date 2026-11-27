'use client';

import type { Degerlendirme } from '@kopru/contracts';
import { t } from '@kopru/i18n';
import { useId, useState, type SyntheticEvent } from 'react';

import { Alan } from '@/components/operasyon/ortak';
import { Dugme } from '@/components/ui/button';
import { Girdi } from '@/components/ui/input';
import { MetinAlani } from '@/components/ui/metin-alani';
import { Pencere } from '@/components/ui/pencere';
import { Secim } from '@/components/ui/secim';
import { Uyari } from '@/components/ui/uyari';
import { useKurum } from '@/kurum/baglam';
import { hataMesaji } from '@/lib/api';
import { siraliBransler } from '@/lib/bransler';
import { cn } from '@/lib/cn';
import {
  OLCEKLER,
  OLCEK_PUANLARI,
  buHafta,
  donemCoz,
  donemEtiketi,
  donemTuru,
  olcekAdi,
  type DonemTuru,
  type OlcekAdi,
} from '@/lib/degerlendirme/model';
import { useDegerlendirmeGuncelle, useDegerlendirmeYaz } from '@/lib/degerlendirme/veri';
import { bugunYerel } from '@/lib/saat';

type Puan = number | null;

/**
 * Degerlendirme yaz/duzenle penceresi (30 sn hedefi): donem bu hafta on secili, ders istege bagli, dort olcek
 * (1-5, hepsi istege bagli; erisilebilir radyo), yorum ve "Ogrenci gorsun" anahtari (varsayilan kapali).
 * `duzelt` verilirse yazar kendi kaydini (7 gun icinde) duzenler.
 */
export function DegerlendirmeFormu({
  acik,
  degisti,
  ogrenciId,
  ogrenciAd,
  duzelt,
  bitti,
}: {
  acik: boolean;
  degisti: (acik: boolean) => void;
  ogrenciId: string;
  ogrenciAd: string;
  duzelt?: Degerlendirme | undefined;
  bitti: (mesaj: string) => void;
}) {
  return (
    <Pencere
      acik={acik}
      degisti={degisti}
      genis
      baslik={duzelt ? t('degerlendirme.form.baslikDuzenle') : t('degerlendirme.form.baslikYeni')}
      aciklama={t('degerlendirme.form.aciklama', { ad: ogrenciAd || t('ogrenme.ortak.ogrenci') })}
    >
      <FormIcerigi
        ogrenciId={ogrenciId}
        duzelt={duzelt}
        vazgec={() => {
          degisti(false);
        }}
        bitti={(mesaj) => {
          degisti(false);
          bitti(mesaj);
        }}
      />
    </Pencere>
  );
}

function FormIcerigi({
  ogrenciId,
  duzelt,
  vazgec,
  bitti,
}: {
  ogrenciId: string;
  duzelt: Degerlendirme | undefined;
  vazgec: () => void;
  bitti: (mesaj: string) => void;
}) {
  const { uyelik } = useKurum();
  const kurumId = uyelik.kurumId;
  const duzenleme = duzelt !== undefined;
  const bugun = bugunYerel('Europe/Istanbul');
  const hafta = buHafta(bugun);
  const ozelAralik = duzelt ? donemTuru(duzelt, bugun) === 'aralik' : false;
  const yaz = useDegerlendirmeYaz(kurumId, ogrenciId);
  const guncelle = useDegerlendirmeGuncelle(kurumId, duzelt?.id ?? '');

  const [tur, setTur] = useState<DonemTuru>(duzelt ? donemTuru(duzelt, bugun) : 'hafta');
  const [gun, setGun] = useState(
    duzelt && duzelt.donem_baslangic === duzelt.donem_bitis ? duzelt.donem_baslangic : bugun,
  );
  const [brans, setBrans] = useState(duzelt?.brans_kodu ?? '');
  const [olcekler, setOlcekler] = useState<Record<OlcekAdi, Puan>>({
    calisma_duzeni: duzelt?.calisma_duzeni ?? null,
    derse_katilim: duzelt?.derse_katilim ?? null,
    odev_disiplini: duzelt?.odev_disiplini ?? null,
    anlama_duzeyi: duzelt?.anlama_duzeyi ?? null,
  });
  const [yorum, setYorum] = useState(duzelt?.yorum ?? '');
  const [gorunur, setGorunur] = useState(duzelt?.ogrenci_gorur ?? false);
  const [hata, setHata] = useState<{ yorum?: string; gun?: string; aralik?: string }>({});
  const gorunurAd = useId();
  const gorunurYardim = useId();
  const bekliyor = yaz.isPending || guncelle.isPending;
  const sunucuHatasi = yaz.error ?? guncelle.error;

  const gonder = async (e: SyntheticEvent) => {
    e.preventDefault();
    if (bekliyor) return;
    const donem = donemCoz({
      tur,
      gun,
      bugun,
      ...(duzelt && ozelAralik
        ? { aralik: { baslangic: duzelt.donem_baslangic, bitis: duzelt.donem_bitis } }
        : {}),
    });
    const h: typeof hata = {};
    if (!donem.tamam) h[donem.hata] = t(`degerlendirme.form.hata.${donem.hata}`);
    const temizYorum = yorum.trim();
    if (temizYorum === '' && OLCEKLER.every((o) => olcekler[o] === null)) {
      h.yorum = t('degerlendirme.form.hata.bos');
    }
    setHata(h);
    if (!donem.tamam || Object.keys(h).length > 0) return;
    try {
      if (duzenleme) {
        await guncelle.mutateAsync({
          donem_baslangic: donem.baslangic,
          donem_bitis: donem.bitis,
          brans_kodu: brans === '' ? null : brans,
          ...Object.fromEntries(OLCEKLER.map((o) => [o, olcekler[o]])),
          yorum: temizYorum === '' ? null : temizYorum,
          ogrenci_gorur: gorunur,
          surum: duzelt.surum,
        });
        bitti(t('kocluk.guncellendi'));
        return;
      }
      await yaz.mutateAsync({
        donem_baslangic: donem.baslangic,
        ...(donem.bitis !== donem.baslangic ? { donem_bitis: donem.bitis } : {}),
        ...(brans !== '' ? { brans_kodu: brans } : {}),
        ...Object.fromEntries(
          OLCEKLER.flatMap((o) => (olcekler[o] === null ? [] : [[o, olcekler[o]]])),
        ),
        ...(temizYorum !== '' ? { yorum: temizYorum } : {}),
        ogrenci_gorur: gorunur,
      });
      bitti(t('kocluk.yazildi'));
    } catch {
      /* hata `yaz.error` / `guncelle.error` uzerinden gosterilir */
    }
  };

  return (
    <form onSubmit={(e) => void gonder(e)} noValidate className="flex flex-col gap-5">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">{t('degerlendirme.form.donem')}</legend>
        <div className="flex flex-wrap gap-2">
          <DonemSecenegi
            deger="hafta"
            secili={tur === 'hafta'}
            sec={setTur}
            etiket={t('degerlendirme.form.donemHafta', {
              aralik: donemEtiketi(hafta.baslangic, hafta.bitis),
            })}
          />
          <DonemSecenegi
            deger="gun"
            secili={tur === 'gun'}
            sec={setTur}
            etiket={t('degerlendirme.form.donemGun')}
          />
          {ozelAralik && duzelt ? (
            <DonemSecenegi
              deger="aralik"
              secili={tur === 'aralik'}
              sec={setTur}
              etiket={t('degerlendirme.form.donemAralik', {
                aralik: donemEtiketi(duzelt.donem_baslangic, duzelt.donem_bitis),
              })}
            />
          ) : null}
        </div>
        {tur === 'gun' ? (
          <Alan etiket={t('degerlendirme.form.gunEtiketi')} hata={hata.gun} className="max-w-xs">
            {(o) => (
              <Girdi
                {...o}
                type="date"
                max={bugun}
                value={gun}
                onChange={(e) => {
                  setGun(e.target.value);
                }}
              />
            )}
          </Alan>
        ) : null}
        {hata.aralik ? (
          <p role="alert" className="text-sm text-hata">
            {hata.aralik}
          </p>
        ) : null}
      </fieldset>

      <Alan etiket={t('degerlendirme.ders')} className="max-w-xs">
        {(o) => (
          <Secim
            {...o}
            value={brans}
            onChange={(e) => {
              setBrans(e.target.value);
            }}
          >
            <option value="">{t('degerlendirme.form.dersYok')}</option>
            {siraliBransler().map((b) => (
              <option key={b.kod} value={b.kod}>
                {b.ad}
              </option>
            ))}
          </Secim>
        )}
      </Alan>

      <div className="flex flex-col gap-3">
        <div>
          <h3 className="text-sm font-medium">{t('degerlendirme.form.olcekler')}</h3>
          <p className="text-xs text-metin-ikincil">{t('degerlendirme.olcek.yardim')}</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {OLCEKLER.map((o) => (
            <OlcekSecimi
              key={o}
              olcek={o}
              deger={olcekler[o]}
              degisti={(p) => {
                setOlcekler((onceki) => ({ ...onceki, [o]: p }));
              }}
            />
          ))}
        </div>
      </div>

      <Alan etiket={t('degerlendirme.yorum')} hata={hata.yorum}>
        {(o) => (
          <MetinAlani
            {...o}
            rows={4}
            maxLength={4000}
            value={yorum}
            placeholder={t('degerlendirme.form.yorumYer')}
            onChange={(e) => {
              setYorum(e.target.value);
            }}
          />
        )}
      </Alan>

      <div className="rounded-orta border border-kenar bg-yuzey-ikincil/40 p-3">
        <div className="flex items-start gap-3">
          <input
            type="checkbox"
            role="switch"
            checked={gorunur}
            aria-labelledby={gorunurAd}
            aria-describedby={gorunurYardim}
            onChange={(e) => {
              setGorunur(e.target.checked);
            }}
            className="mt-0.5 size-6 shrink-0 accent-[var(--birincil)]"
          />
          <div>
            <span id={gorunurAd} className="block text-sm font-medium">
              {t('degerlendirme.form.gorunurBaslik')}
            </span>
            <span id={gorunurYardim} className="block text-sm text-metin-ikincil">
              {gorunur
                ? t('degerlendirme.form.gorunurAcik')
                : t('degerlendirme.form.gorunurKapali')}
            </span>
          </div>
        </div>
      </div>

      {sunucuHatasi ? <Uyari>{hataMesaji(sunucuHatasi)}</Uyari> : null}
      {duzenleme ? (
        <p className="text-xs text-metin-ikincil">{t('degerlendirme.duzenlemeSuresi')}</p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Dugme type="submit" boyut="lg" disabled={bekliyor}>
          {bekliyor
            ? t('degerlendirme.form.kaydediliyor')
            : duzenleme
              ? t('degerlendirme.form.guncelle')
              : t('degerlendirme.form.kaydet')}
        </Dugme>
        <Dugme type="button" gorunum="ikincil" boyut="lg" onClick={vazgec}>
          {t('degerlendirme.form.vazgec')}
        </Dugme>
      </div>
    </form>
  );
}

function DonemSecenegi({
  deger,
  secili,
  sec,
  etiket,
}: {
  deger: DonemTuru;
  secili: boolean;
  sec: (d: DonemTuru) => void;
  etiket: string;
}) {
  return (
    <label
      className={cn(
        'flex min-h-11 cursor-pointer items-center rounded-orta border border-kenar px-3 text-sm has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2',
        secili
          ? 'border-birincil bg-birincil-yumusak font-semibold'
          : 'bg-yuzey hover:bg-yuzey-ikincil',
      )}
    >
      <input
        type="radio"
        name="donem"
        value={deger}
        checked={secili}
        onChange={() => {
          sec(deger);
        }}
        className="sr-only"
      />
      {etiket}
    </label>
  );
}

/** Bir ölçek: 1-5 radyo düğmeleri ve "boş" seçeneği (hepsi isteğe bağlıdır). */
function OlcekSecimi({
  olcek,
  deger,
  degisti,
}: {
  olcek: OlcekAdi;
  deger: Puan;
  degisti: (p: Puan) => void;
}) {
  const ad = olcekAdi(olcek);
  const secenekler: readonly Puan[] = [null, ...OLCEK_PUANLARI];
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1 text-sm font-medium">{ad}</legend>
      <div className="flex gap-1.5">
        {secenekler.map((p) => (
          <label
            key={p ?? 'bos'}
            title={p === null ? t('degerlendirme.form.olcekBos') : String(p)}
            className={cn(
              'flex size-11 cursor-pointer items-center justify-center rounded-orta border border-kenar text-base has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2',
              deger === p
                ? 'border-birincil bg-birincil-yumusak font-semibold'
                : 'bg-yuzey hover:bg-yuzey-ikincil',
            )}
          >
            <input
              type="radio"
              name={olcek}
              value={p ?? ''}
              checked={deger === p}
              aria-label={
                p === null
                  ? t('degerlendirme.form.olcekBosEtiket', { olcek: ad })
                  : t('degerlendirme.form.olcekEtiket', { olcek: ad, puan: p })
              }
              onChange={() => {
                degisti(p);
              }}
              className="sr-only"
            />
            <span aria-hidden>{p ?? '–'}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
