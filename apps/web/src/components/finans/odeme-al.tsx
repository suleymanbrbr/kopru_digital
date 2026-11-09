'use client';

import { TahsilatYanitSema } from '@kopru/contracts';
import { kurusBicimle, t } from '@kopru/i18n';
import { useMutation } from '@tanstack/react-query';
import { useRef, useState, type SyntheticEvent } from 'react';

import { useFinansYenile } from './finans-verisi';

import { basari, type Bildirim } from '@/components/hesap/ortak';
import { Alan } from '@/components/operasyon/ortak';
import { Dugme } from '@/components/ui/button';
import { Girdi } from '@/components/ui/input';
import { OnayPenceresi, Pencere } from '@/components/ui/pencere';
import { Secim } from '@/components/ui/secim';
import { Uyari } from '@/components/ui/uyari';
import { hataMesaji } from '@/lib/api';
import { finansIstek } from '@/lib/hesap-istek';
import { tutarCoz } from '@/lib/operasyon';
import { bugunYerel } from '@/lib/saat';

const YONTEMLER = ['nakit', 'havale', 'kart'] as const;

export function OdemeAl({
  acik,
  degisti,
  kurumId,
  ogrenciId,
  ogrenciAdi,
  saatDilimi,
  bitti,
}: {
  acik: boolean;
  degisti: (acik: boolean) => void;
  kurumId: string;
  ogrenciId: string;
  ogrenciAdi: string;
  saatDilimi: string;
  bitti: (b: Bildirim) => void;
}) {
  return (
    <Pencere
      acik={acik}
      degisti={degisti}
      baslik={t('operasyon.finans.odemeAl.baslik')}
      aciklama={t('operasyon.finans.odemeAl.aciklama', { ad: ogrenciAdi })}
    >
      <Icerik
        kurumId={kurumId}
        ogrenciId={ogrenciId}
        saatDilimi={saatDilimi}
        kapat={() => {
          degisti(false);
        }}
        bitti={bitti}
      />
    </Pencere>
  );
}

function Icerik({
  kurumId,
  ogrenciId,
  saatDilimi,
  kapat,
  bitti,
}: {
  kurumId: string;
  ogrenciId: string;
  saatDilimi: string;
  kapat: () => void;
  bitti: (b: Bildirim) => void;
}) {
  const yenile = useFinansYenile(kurumId);
  const bugun = bugunYerel(saatDilimi);
  const [tutar, setTutar] = useState('');
  const [yontem, setYontem] = useState<(typeof YONTEMLER)[number]>('nakit');
  const [tarih, setTarih] = useState(bugun);
  const [makbuz, setMakbuz] = useState('');
  const [hatalar, setHatalar] = useState<{ tutar?: string; tarih?: string }>({});
  // Ayni govde = ayni Idempotency-Key (tekrar deneme cift kayit uretmez); govde degisince yeni anahtar.
  const anahtar = useRef<{ imza: string; key: string } | null>(null);

  const kaydet = useMutation({
    mutationFn: (govde: Record<string, unknown>) => {
      const imza = JSON.stringify(govde);
      if (anahtar.current?.imza !== imza) anahtar.current = { imza, key: crypto.randomUUID() };
      return finansIstek(`kurumlar/${kurumId}/tahsilatlar`, {
        yontem: 'POST',
        govde,
        sema: TahsilatYanitSema,
        basliklar: { 'Idempotency-Key': anahtar.current.key },
      });
    },
    onSuccess: (s) => {
      void yenile();
      bitti(
        basari(
          s.tekrar
            ? t('operasyon.finans.odemeAl.tekrar')
            : t('operasyon.finans.odemeAl.kaydedildi', { tutar: kurusBicimle(s.tutar_kurus) }),
        ),
      );
      kapat();
    },
  });

  const gonder = (e: SyntheticEvent) => {
    e.preventDefault();
    const h: { tutar?: string; tarih?: string } = {};
    const c = tutarCoz(tutar);
    if (!c.ok) h.tutar = t('operasyon.finans.odemeAl.hata.tutar');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(tarih) || tarih > bugun) {
      h.tarih = t('operasyon.finans.odemeAl.hata.tarih');
    }
    setHatalar(h);
    if (!c.ok || Object.keys(h).length > 0) return;
    kaydet.mutate({
      ogrenci_id: ogrenciId,
      tutar_kurus: c.kurus,
      yontem,
      tahsilat_tarihi: tarih,
      ...(makbuz.trim() ? { makbuz_no: makbuz.trim() } : {}),
    });
  };

  return (
    <form onSubmit={gonder} noValidate className="flex flex-col gap-4">
      <Alan
        etiket={t('operasyon.finans.odemeAl.tutar')}
        yardim={t('operasyon.finans.odemeAl.tutarYardim')}
        hata={hatalar.tutar}
      >
        {(o) => (
          <Girdi
            {...o}
            inputMode="decimal"
            autoComplete="off"
            value={tutar}
            onChange={(e) => {
              setTutar(e.target.value);
            }}
          />
        )}
      </Alan>
      <div className="grid gap-4 sm:grid-cols-2">
        <Alan etiket={t('operasyon.finans.odemeAl.yontem')}>
          {(o) => (
            <Secim
              {...o}
              value={yontem}
              onChange={(e) => {
                setYontem(e.target.value as typeof yontem);
              }}
            >
              {YONTEMLER.map((y) => (
                <option key={y} value={y}>
                  {t(`operasyon.finans.yontem.${y}`)}
                </option>
              ))}
            </Secim>
          )}
        </Alan>
        <Alan etiket={t('operasyon.finans.odemeAl.tarih')} hata={hatalar.tarih}>
          {(o) => (
            <Girdi
              {...o}
              type="date"
              max={bugun}
              value={tarih}
              onChange={(e) => {
                setTarih(e.target.value);
              }}
            />
          )}
        </Alan>
      </div>
      <Alan etiket={t('operasyon.finans.odemeAl.makbuz')}>
        {(o) => (
          <Girdi
            {...o}
            maxLength={64}
            value={makbuz}
            onChange={(e) => {
              setMakbuz(e.target.value);
            }}
          />
        )}
      </Alan>
      {kaydet.isError ? <Uyari>{hataMesaji(kaydet.error)}</Uyari> : null}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Dugme type="button" gorunum="ikincil" onClick={kapat} disabled={kaydet.isPending}>
          {t('operasyon.ortak.vazgec')}
        </Dugme>
        <Dugme type="submit" disabled={kaydet.isPending}>
          {kaydet.isPending
            ? t('operasyon.finans.odemeAl.kaydediliyor')
            : t('operasyon.finans.odemeAl.kaydet')}
        </Dugme>
      </div>
    </form>
  );
}

/**
 * Odeme ya da paket satisi iptali: neden zorunlu, onayli. `yol` `tahsilatlar/<id>/iptal` ya da
 * `paket-satislari/<id>/iptal`.
 */
export function IptalPenceresi({
  acik,
  degisti,
  kurumId,
  yol,
  baslik,
  aciklama,
  onayEtiketi,
  basariMetni,
  bitti,
}: {
  acik: boolean;
  degisti: (acik: boolean) => void;
  kurumId: string;
  yol: string;
  baslik: string;
  aciklama: string;
  onayEtiketi: string;
  basariMetni: string;
  bitti: (b: Bildirim) => void;
}) {
  const yenile = useFinansYenile(kurumId);
  const [neden, setNeden] = useState('');
  const [hata, setHata] = useState(false);
  const iptal = useMutation({
    mutationFn: () =>
      finansIstek(`kurumlar/${kurumId}/${yol}`, { yontem: 'POST', govde: { neden: neden.trim() } }),
    onSuccess: () => {
      void yenile();
      bitti(basari(basariMetni));
      degisti(false);
      setNeden('');
    },
  });
  return (
    <OnayPenceresi
      acik={acik}
      degisti={degisti}
      baslik={baslik}
      aciklama={aciklama}
      onayEtiketi={onayEtiketi}
      tehlikeli
      bekliyor={iptal.isPending}
      onay={() => {
        if (!neden.trim()) {
          setHata(true);
          return;
        }
        setHata(false);
        iptal.mutate();
      }}
      icerik={
        <div className="mt-3 flex flex-col gap-2">
          <Alan
            etiket={t('operasyon.finans.odemeAl.iptalNeden')}
            hata={hata ? t('operasyon.finans.odemeAl.iptalNedenHata') : undefined}
          >
            {(o) => (
              <Girdi
                {...o}
                maxLength={500}
                value={neden}
                onChange={(e) => {
                  setNeden(e.target.value);
                }}
              />
            )}
          </Alan>
          {iptal.isError ? <Uyari>{hataMesaji(iptal.error)}</Uyari> : null}
        </div>
      }
    />
  );
}
