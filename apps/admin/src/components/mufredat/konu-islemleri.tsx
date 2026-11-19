'use client';

import { t } from '@kopru/i18n';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';

import { Alan, Secim } from '../ui/alan';
import { OnayPenceresi } from '../ui/onay-penceresi';

import { platform } from '@/lib/api';
import { eklemeUstleri, uygunHedefler, uygunUstler, type Seviye } from '@/lib/mufredat';
import type { Konu, KatalogKodu } from '@/lib/tipler';

export type KonuIslemi =
  | { tur: 'ekle'; ust?: Konu | undefined }
  | { tur: 'adlandir' | 'tasi' | 'birlestir' | 'kaldir'; konu: Konu };

const SEVIYELER: Seviye[] = ['unite', 'konu', 'alt_konu'];

/** Eklenen konunun varsayilan seviyesi: ustunun bir alti. */
function altSeviye(ust: Seviye): Seviye {
  return ust === 'unite' ? 'konu' : 'alt_konu';
}

const BASLIK = {
  ekle: 'yonetim.mufredat.ekleBaslik',
  adlandir: 'yonetim.mufredat.adlandirBaslik',
  tasi: 'yonetim.mufredat.tasiBaslik',
  birlestir: 'yonetim.mufredat.birlestirBaslik',
  kaldir: 'yonetim.mufredat.kaldirBaslik',
} as const;

const ACIKLAMA = {
  birlestir: 'yonetim.mufredat.birlestirAciklama',
  kaldir: 'yonetim.mufredat.kaldirAciklama',
} as const;

/**
 * Taslak konu islemlerinin ortak penceresi (ekle / adlandir / tasi / birlestir / kaldir). Her islem
 * zorunlu degisiklik notuyla gonderilir. Ust bilesen her acilista `key` degistirerek formu sifirlar.
 */
export function KonuIslemPenceresi({
  kod,
  islem,
  konular,
  onKapat,
  onBasari,
}: {
  kod: KatalogKodu;
  islem: KonuIslemi | null;
  konular: readonly Konu[];
  onKapat: () => void;
  onBasari: () => void;
}) {
  const konu = islem && islem.tur !== 'ekle' ? islem.konu : undefined;
  const ekleUst = islem?.tur === 'ekle' ? islem.ust : undefined;

  const [ad, setAd] = useState(islem?.tur === 'adlandir' ? islem.konu.ad : '');
  const [seviye, setSeviye] = useState<Seviye>(ekleUst ? altSeviye(ekleUst.seviye) : 'unite');
  const [brans, setBrans] = useState(ekleUst?.brans_kodu ?? '');
  const [kazanim, setKazanim] = useState('');
  const [sinif, setSinif] = useState('');
  const [ustId, setUstId] = useState(ekleUst?.id ?? '');
  const [hedefId, setHedefId] = useState('');

  const yol = `mufredat/kataloglar/${kod}/taslak/konular`;
  const kaydet = useMutation({
    mutationFn: (not: string) => {
      if (!islem) throw new Error('islem yok');
      if (islem.tur === 'ekle') {
        return platform.yolla(yol, {
          ad: ad.trim(),
          brans_kodu: brans.trim(),
          seviye,
          not,
          ...(ustId ? { ust_id: ustId } : {}),
          ...(kazanim.trim() ? { kazanim_kodu: kazanim.trim() } : {}),
          ...(sinif ? { sinif_seviyesi: Number(sinif) } : {}),
        });
      }
      const adres = `${yol}/${islem.konu.id}/${islem.tur}`;
      if (islem.tur === 'adlandir') return platform.yolla(adres, { ad: ad.trim(), not });
      if (islem.tur === 'tasi') return platform.yolla(adres, { ust_id: ustId, not });
      if (islem.tur === 'birlestir') return platform.yolla(adres, { hedef_id: hedefId, not });
      return platform.yolla(adres, { not, ...(hedefId ? { yerine_gecen_id: hedefId } : {}) });
    },
    onSuccess: onBasari,
  });

  const tur = islem?.tur ?? 'ekle';
  const ustler =
    islem?.tur === 'ekle'
      ? eklemeUstleri(konular, seviye, brans.trim())
      : konu && tur === 'tasi'
        ? uygunUstler(konular, konu)
        : [];
  const hedefler = konu && tur === 'birlestir' ? uygunHedefler(konular, konu) : [];
  const oneriler = konu && tur === 'kaldir' ? konular.filter((k) => k.id !== konu.id) : [];

  const sinifGecerli = sinif === '' || (Number(sinif) >= 5 && Number(sinif) <= 12);
  const gecerli =
    tur === 'ekle'
      ? ad.trim().length > 0 &&
        brans.trim().length > 0 &&
        sinifGecerli &&
        (seviye === 'unite' || ustId !== '')
      : tur === 'adlandir'
        ? ad.trim().length > 0 && ad.trim() !== konu?.ad
        : tur === 'tasi'
          ? ustId !== ''
          : tur === 'birlestir'
            ? hedefId !== ''
            : true;

  const aciklamaAnahtari = tur === 'birlestir' || tur === 'kaldir' ? ACIKLAMA[tur] : undefined;

  return (
    <OnayPenceresi
      acik={islem !== null}
      onKapat={() => {
        kaydet.reset();
        onKapat();
      }}
      baslik={konu ? `${t(BASLIK[tur])}: ${konu.ad}` : t(BASLIK[tur])}
      aciklama={aciklamaAnahtari ? t(aciklamaAnahtari) : undefined}
      neden={{ min: 1, etiket: t('yonetim.mufredat.not'), yardim: t('yonetim.mufredat.notYardim') }}
      onayEtiketi={t(BASLIK[tur])}
      tehlike={tur === 'kaldir'}
      bekliyor={kaydet.isPending}
      hata={kaydet.error}
      gecerli={gecerli}
      genis
      onOnayla={(not) => {
        kaydet.mutate(not);
      }}
    >
      {tur === 'ekle' || tur === 'adlandir' ? (
        <Alan
          etiket={tur === 'ekle' ? t('yonetim.mufredat.ad') : t('yonetim.mufredat.yeniAd')}
          maxLength={200}
          value={ad}
          onChange={(e) => {
            setAd(e.target.value);
          }}
          required
        />
      ) : null}

      {tur === 'ekle' ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Secim
            etiket={t('yonetim.mufredat.seviyeEtiketi')}
            value={seviye}
            onChange={(e) => {
              setSeviye(e.target.value as Seviye);
              setUstId('');
            }}
          >
            {SEVIYELER.map((s) => (
              <option key={s} value={s}>
                {t(`yonetim.mufredat.seviye.${s}`)}
              </option>
            ))}
          </Secim>
          <Alan
            etiket={t('yonetim.mufredat.bransKodu')}
            maxLength={50}
            value={brans}
            onChange={(e) => {
              setBrans(e.target.value);
              setUstId('');
            }}
            required
          />
          <Alan
            etiket={t('yonetim.mufredat.kazanimKodu')}
            maxLength={50}
            value={kazanim}
            onChange={(e) => {
              setKazanim(e.target.value);
            }}
          />
          <Alan
            etiket={t('yonetim.mufredat.sinifSeviyesi')}
            type="number"
            min={5}
            max={12}
            value={sinif}
            onChange={(e) => {
              setSinif(e.target.value);
            }}
            hata={sinifGecerli ? undefined : t('yonetim.mufredat.sinifAralik')}
          />
        </div>
      ) : null}

      {tur === 'ekle' || tur === 'tasi' ? (
        <Secim
          etiket={tur === 'ekle' ? t('yonetim.mufredat.ust') : t('yonetim.mufredat.yeniUst')}
          value={ustId}
          onChange={(e) => {
            setUstId(e.target.value);
          }}
        >
          <option value="">
            {tur === 'ekle' ? t('yonetim.mufredat.ustYok') : t('yonetim.ortak.sec')}
          </option>
          {ustler.map((k) => (
            <option key={k.id} value={k.id}>
              {`${t(`yonetim.mufredat.seviye.${k.seviye}`)}: ${k.ad}`}
            </option>
          ))}
        </Secim>
      ) : null}

      {tur === 'birlestir' || tur === 'kaldir' ? (
        <Secim
          etiket={
            tur === 'birlestir' ? t('yonetim.mufredat.hedefKonu') : t('yonetim.mufredat.oneri')
          }
          value={hedefId}
          onChange={(e) => {
            setHedefId(e.target.value);
          }}
        >
          <option value="">{tur === 'birlestir' ? t('yonetim.ortak.sec') : '—'}</option>
          {(tur === 'birlestir' ? hedefler : oneriler).map((k) => (
            <option key={k.id} value={k.id}>
              {k.ad}
            </option>
          ))}
        </Secim>
      ) : null}
    </OnayPenceresi>
  );
}
