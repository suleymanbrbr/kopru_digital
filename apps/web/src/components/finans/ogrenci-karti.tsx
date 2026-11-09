'use client';

import type { OgrenciFinansTamSema, PaketSatisiSema, TahsilatSema } from '@kopru/contracts';
import { kurusBicimle, t } from '@kopru/i18n';
import { useMutation } from '@tanstack/react-query';
import { ArrowLeft, MessageCircle } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState, type SyntheticEvent } from 'react';
import type { z } from 'zod';

import { DefterPenceresi } from './defter';
import {
  useFinansYenile,
  useOgrenciAdi,
  useOgrenciKarti,
  useOgrenciOdemeleri,
} from './finans-verisi';
import { HatirlatmaPenceresi, hatirlatmaMetni } from './hatirlatma';
import { bakiyeMetni, KrediRozeti } from './kredi-rozeti';
import { IptalPenceresi, OdemeAl } from './odeme-al';
import { PaketSat } from './paket-sat';

import { HataDurumu } from '@/components/hata-durumu';
import {
  BildirimKutusu,
  basari,
  ListeIskeleti,
  tarihYaz,
  type Bildirim,
} from '@/components/hesap/ortak';
import { BolumKapisi } from '@/components/kabuk/bolum-yer-tutucu';
import { SayfaBasligi } from '@/components/kabuk/sayfa-basligi';
import { Alan } from '@/components/operasyon/ortak';
import { Dugme, dugmeStili } from '@/components/ui/button';
import { Girdi } from '@/components/ui/input';
import { Iskelet, Kart } from '@/components/ui/kart';
import { Pencere } from '@/components/ui/pencere';
import { Rozet } from '@/components/ui/rozet';
import { Secim } from '@/components/ui/secim';
import { Uyari } from '@/components/ui/uyari';
import { useKurum } from '@/kurum/baglam';
import { hataMesaji } from '@/lib/api';
import { finansIstek } from '@/lib/hesap-istek';
import { useSaatDilimi } from '@/lib/operasyon-verisi';

type Tam = z.infer<typeof OgrenciFinansTamSema>;
type Paket = z.infer<typeof PaketSatisiSema>;
type Odeme = z.infer<typeof TahsilatSema>;

export function OgrenciKarti() {
  return (
    <BolumKapisi bolum="finans">
      <KartYukleyici />
    </BolumKapisi>
  );
}

function KartYukleyici() {
  const { ogrenciId } = useParams<{ ogrenciId: string }>();
  const { uyelik } = useKurum();
  const kurumId = uyelik.kurumId;
  const ad = useOgrenciAdi(kurumId, ogrenciId);
  const q = useOgrenciKarti(kurumId, ogrenciId);

  return (
    <>
      <Link
        href={`/${kurumId}/finans`}
        className={dugmeStili({ gorunum: 'hayalet', boyut: 'sm', className: 'mb-3 -ml-3' })}
      >
        <ArrowLeft aria-hidden />
        {t('operasyon.finans.kart.geri')}
      </Link>
      <SayfaBasligi baslik={ad ?? t('operasyon.finans.kart.baslik')} />
      {q.isPending ? (
        <Kart>
          <ListeIskeleti satir={4} />
        </Kart>
      ) : q.isError ? (
        <Kart>
          <HataDurumu
            baslik={t('operasyon.finans.kart.yuklenemedi')}
            aciklama={hataMesaji(q.error)}
            tekrarDene={() => void q.refetch()}
          />
        </Kart>
      ) : q.data.gorunum === 'tam' ? (
        <KartIcerigi kurumId={kurumId} ogrenciId={ogrenciId} ad={ad ?? ''} kart={q.data} />
      ) : (
        <OgrenciGorunumu kalan={q.data.kalan_kredi} />
      )}
    </>
  );
}

/** Ogrenci rolunun gorebildigi tek sey: kalan ders. Fiyat, borc ve odeme bilgisi hic gosterilmez. */
export function OgrenciGorunumu({ kalan }: { kalan: number | null }) {
  if (kalan === null) return null;
  return (
    <Kart className="p-5">
      <p className="text-sm text-metin-ikincil">{t('operasyon.finans.kart.kalan')}</p>
      <p className="text-3xl font-semibold">{kalan}</p>
    </Kart>
  );
}

function KartIcerigi({
  kurumId,
  ogrenciId,
  ad,
  kart,
}: {
  kurumId: string;
  ogrenciId: string;
  ad: string;
  kart: Tam;
}) {
  const { saatDilimi } = useSaatDilimi(kurumId);
  const odemeler = useOgrenciOdemeleri(kurumId, ogrenciId);
  const [bildirim, setBildirim] = useState<Bildirim>(null);
  const [paketSatAcik, setPaketSatAcik] = useState(false);
  const [odemeAcik, setOdemeAcik] = useState(false);
  const [hatirlatAcik, setHatirlatAcik] = useState(false);
  const [defterAcik, setDefterAcik] = useState(false);
  const [profilAcik, setProfilAcik] = useState(false);
  const [paketIptal, setPaketIptal] = useState<Paket | null>(null);
  const [odemeIptal, setOdemeIptal] = useState<Odeme | null>(null);

  const adGoster = ad || t('operasyon.ortak.adsiz');
  const bakiye = bakiyeMetni(kart.bakiye_kurus);

  return (
    <div className="flex flex-col gap-4">
      <BildirimKutusu bildirim={bildirim} />

      <div className="grid gap-4 sm:grid-cols-3">
        <Kart className="p-4">
          <p className="text-sm text-metin-ikincil">{t('operasyon.finans.kart.kalan')}</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums">{kart.kalan_kredi}</p>
          <div className="mt-2">
            <KrediRozeti
              model={kart.model}
              kalan={kart.kalan_kredi}
              esik={kart.dusuk_kredi_esigi}
            />
          </div>
        </Kart>
        <Kart className="p-4">
          <p className="text-sm text-metin-ikincil">{t('operasyon.finans.kart.bakiye')}</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums" data-testid="bakiye">
            {kurusBicimle(kart.bakiye_kurus)}
          </p>
          <div className="mt-2 flex flex-col gap-1">
            <Rozet ton={kart.borclu ? 'hata' : 'basari'} className="self-start">
              {kart.borclu ? t('operasyon.finans.kart.bakiyeBorclu') : bakiye}
            </Rozet>
            <p className="text-xs text-metin-ikincil">
              {t('operasyon.finans.kart.bakiyeAciklama')}
            </p>
          </div>
        </Kart>
        <Kart className="p-4">
          <p className="text-sm text-metin-ikincil">{t('operasyon.finans.kart.model')}</p>
          <p className="mt-1 text-lg font-semibold">{t(`operasyon.finans.model.${kart.model}`)}</p>
          <p className="mt-2 text-sm">
            <span className="text-metin-ikincil">{t('operasyon.finans.kart.odeyen')}: </span>
            {kart.odeyen_ad ? (
              <>
                {kart.odeyen_ad}
                {kart.odeyen_telefon ? ` · ${kart.odeyen_telefon}` : ''}
              </>
            ) : (
              t('operasyon.finans.kart.odeyenYok')
            )}
          </p>
          <Dugme
            gorunum="hayalet"
            boyut="sm"
            className="-ml-3 mt-1"
            onClick={() => {
              setProfilAcik(true);
            }}
          >
            {t('operasyon.finans.kart.modelDegistir')}
          </Dugme>
        </Kart>
      </div>

      <div className="flex flex-wrap gap-2">
        <Dugme
          onClick={() => {
            setPaketSatAcik(true);
          }}
        >
          {t('operasyon.finans.kart.paketSat')}
        </Dugme>
        <Dugme
          gorunum="ikincil"
          onClick={() => {
            setOdemeAcik(true);
          }}
        >
          {t('operasyon.finans.kart.odemeAl')}
        </Dugme>
        <Dugme
          gorunum="ikincil"
          onClick={() => {
            setHatirlatAcik(true);
          }}
        >
          <MessageCircle aria-hidden />
          {t('operasyon.finans.kart.hatirlat')}
        </Dugme>
      </div>

      <Kart aria-label={t('operasyon.finans.kart.paketler')}>
        <h2 className="border-b border-kenar px-4 py-3 text-base font-semibold">
          {t('operasyon.finans.kart.paketler')}
        </h2>
        {kart.etkin_paketler.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-metin-ikincil">
            <span className="block font-medium text-metin">
              {t('operasyon.finans.kart.paketBos')}
            </span>
            {t('operasyon.finans.kart.paketBosAciklama')}
          </p>
        ) : (
          <ul className="divide-y divide-kenar">
            {kart.etkin_paketler.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{p.ad}</p>
                  <p className="text-sm text-metin-ikincil">
                    {t('operasyon.finans.kart.paketKalan', {
                      kalan: p.kalan_kredi,
                      toplam: p.toplam_kredi,
                    })}{' '}
                    · {kurusBicimle(p.fiyat_kurus)} · {tarihYaz(p.baslangic_tarihi)}
                  </p>
                </div>
                <Dugme
                  gorunum="ikincil"
                  boyut="sm"
                  onClick={() => {
                    setPaketIptal(p);
                  }}
                >
                  {t('operasyon.finans.paketSat.iptalEt')}
                </Dugme>
              </li>
            ))}
          </ul>
        )}
      </Kart>

      <Kart aria-label={t('operasyon.finans.kart.hareketler')}>
        <div className="flex items-center justify-between gap-3 border-b border-kenar px-4 py-3">
          <h2 className="text-base font-semibold">{t('operasyon.finans.kart.hareketler')}</h2>
          <Dugme
            gorunum="ikincil"
            boyut="sm"
            onClick={() => {
              setDefterAcik(true);
            }}
          >
            {t('operasyon.finans.kart.hepsiniGor')}
          </Dugme>
        </div>
        {kart.son_kredi_hareketleri.length === 0 && kart.son_bakiye_hareketleri.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-metin-ikincil">
            {t('operasyon.finans.kart.hareketBos')}
          </p>
        ) : (
          <ul className="divide-y divide-kenar">
            {kart.son_kredi_hareketleri.slice(0, 5).map((h) => (
              <li
                key={h.id}
                className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"
              >
                <span>
                  {t(`operasyon.finans.kredi.${h.tur}`)}
                  <span className="ml-2 text-xs text-metin-ikincil">{tarihYaz(h.created_at)}</span>
                </span>
                <span className="font-semibold tabular-nums">
                  {t('operasyon.finans.kredi.miktar', {
                    isaret: h.miktar > 0 ? '+' : '',
                    sayi: h.miktar,
                  })}
                </span>
              </li>
            ))}
            {kart.son_bakiye_hareketleri.slice(0, 5).map((h) => (
              <li
                key={h.id}
                className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"
              >
                <span>
                  {t(`operasyon.finans.bakiyeTur.${h.tur}`)}
                  <span className="ml-2 text-xs text-metin-ikincil">{tarihYaz(h.created_at)}</span>
                </span>
                <span className="font-semibold tabular-nums">{kurusBicimle(h.tutar_kurus)}</span>
              </li>
            ))}
          </ul>
        )}
      </Kart>

      <Kart aria-label={t('operasyon.finans.odemeAl.odemeler')}>
        <h2 className="border-b border-kenar px-4 py-3 text-base font-semibold">
          {t('operasyon.finans.odemeAl.odemeler')}
        </h2>
        {odemeler.isPending ? (
          <Iskelet className="m-4 h-10" />
        ) : odemeler.isError ? (
          <HataDurumu
            aciklama={hataMesaji(odemeler.error)}
            tekrarDene={() => void odemeler.refetch()}
            className="py-6"
          />
        ) : odemeler.data.tahsilatlar.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-metin-ikincil">
            {t('operasyon.finans.odemeAl.odemeBos')}
          </p>
        ) : (
          <ul className="divide-y divide-kenar">
            {odemeler.data.tahsilatlar.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className={o.durum === 'iptal' ? 'font-medium line-through' : 'font-medium'}>
                    {kurusBicimle(o.tutar_kurus)} · {t(`operasyon.finans.yontem.${o.yontem}`)}
                  </p>
                  <p className="text-sm text-metin-ikincil">{tarihYaz(o.tahsilat_tarihi)}</p>
                </div>
                {o.durum === 'iptal' ? (
                  <Rozet ton="hata">{t('operasyon.finans.odemeAl.iptalDurum')}</Rozet>
                ) : (
                  <Dugme
                    gorunum="ikincil"
                    boyut="sm"
                    onClick={() => {
                      setOdemeIptal(o);
                    }}
                  >
                    {t('operasyon.finans.odemeAl.iptalEt')}
                  </Dugme>
                )}
              </li>
            ))}
          </ul>
        )}
      </Kart>

      <PaketSat
        acik={paketSatAcik}
        degisti={setPaketSatAcik}
        kurumId={kurumId}
        ogrenciId={ogrenciId}
        ogrenciAdi={adGoster}
        bitti={setBildirim}
      />
      <OdemeAl
        acik={odemeAcik}
        degisti={setOdemeAcik}
        kurumId={kurumId}
        ogrenciId={ogrenciId}
        ogrenciAdi={adGoster}
        saatDilimi={saatDilimi}
        bitti={setBildirim}
      />
      <HatirlatmaPenceresi
        acik={hatirlatAcik}
        degisti={setHatirlatAcik}
        telefon={kart.odeyen_telefon}
        varsayilanMetin={hatirlatmaMetni({
          odeyenAd: kart.odeyen_ad,
          ogrenciAdi: adGoster,
          bakiyeKurus: kart.bakiye_kurus,
          kalanKredi: kart.kalan_kredi,
        })}
      />
      <DefterPenceresi
        acik={defterAcik}
        degisti={setDefterAcik}
        kurumId={kurumId}
        ogrenciId={ogrenciId}
      />
      <ProfilPenceresi
        acik={profilAcik}
        degisti={setProfilAcik}
        kurumId={kurumId}
        ogrenciId={ogrenciId}
        kart={kart}
        bitti={setBildirim}
      />
      <IptalPenceresi
        acik={paketIptal !== null}
        degisti={(a) => {
          if (!a) setPaketIptal(null);
        }}
        kurumId={kurumId}
        yol={`paket-satislari/${paketIptal?.id ?? ''}/iptal`}
        baslik={t('operasyon.finans.paketSat.iptalBaslik')}
        aciklama={t('operasyon.finans.paketSat.iptalAciklama')}
        onayEtiketi={t('operasyon.finans.paketSat.iptalEt')}
        basariMetni={t('operasyon.finans.paketSat.iptalEdildi')}
        bitti={setBildirim}
      />
      <IptalPenceresi
        acik={odemeIptal !== null}
        degisti={(a) => {
          if (!a) setOdemeIptal(null);
        }}
        kurumId={kurumId}
        yol={`tahsilatlar/${odemeIptal?.id ?? ''}/iptal`}
        baslik={t('operasyon.finans.odemeAl.iptalBaslik')}
        aciklama={t('operasyon.finans.odemeAl.iptalAciklama', {
          tutar: kurusBicimle(odemeIptal?.tutar_kurus ?? 0),
        })}
        onayEtiketi={t('operasyon.finans.odemeAl.iptalEt')}
        basariMetni={t('operasyon.finans.odemeAl.iptalEdildi')}
        bitti={setBildirim}
      />
    </div>
  );
}

function ProfilPenceresi({
  acik,
  degisti,
  kurumId,
  ogrenciId,
  kart,
  bitti,
}: {
  acik: boolean;
  degisti: (acik: boolean) => void;
  kurumId: string;
  ogrenciId: string;
  kart: Tam;
  bitti: (b: Bildirim) => void;
}) {
  return (
    <Pencere acik={acik} degisti={degisti} baslik={t('operasyon.finans.kart.profil')}>
      <ProfilFormu
        kurumId={kurumId}
        ogrenciId={ogrenciId}
        kart={kart}
        kapat={() => {
          degisti(false);
        }}
        bitti={bitti}
      />
    </Pencere>
  );
}

function ProfilFormu({
  kurumId,
  ogrenciId,
  kart,
  kapat,
  bitti,
}: {
  kurumId: string;
  ogrenciId: string;
  kart: Tam;
  kapat: () => void;
  bitti: (b: Bildirim) => void;
}) {
  const yenile = useFinansYenile(kurumId);
  const [model, setModel] = useState(kart.model);
  const [odeyenAd, setOdeyenAd] = useState(kart.odeyen_ad ?? '');
  const [telefon, setTelefon] = useState(kart.odeyen_telefon ?? '');
  const kaydet = useMutation({
    mutationFn: () =>
      finansIstek(`kurumlar/${kurumId}/ogrenciler/${ogrenciId}/finans-profili`, {
        yontem: 'PUT',
        govde: {
          model,
          odeyen_ad: odeyenAd.trim() || null,
          odeyen_telefon: telefon.trim() || null,
        },
      }),
    onSuccess: () => {
      void yenile();
      bitti(basari(t('operasyon.finans.kart.profilKaydedildi')));
      kapat();
    },
  });
  const gonder = (e: SyntheticEvent) => {
    e.preventDefault();
    kaydet.mutate();
  };
  return (
    <form onSubmit={gonder} className="flex flex-col gap-4">
      <Alan etiket={t('operasyon.finans.kart.model')}>
        {(o) => (
          <Secim
            {...o}
            value={model}
            onChange={(e) => {
              setModel(e.target.value as typeof model);
            }}
          >
            {(['paket', 'ders_basi', 'yok'] as const).map((m) => (
              <option key={m} value={m}>
                {t(`operasyon.finans.model.${m}`)}
              </option>
            ))}
          </Secim>
        )}
      </Alan>
      <Alan etiket={t('operasyon.finans.kart.odeyenAd')}>
        {(o) => (
          <Girdi
            {...o}
            maxLength={200}
            value={odeyenAd}
            onChange={(e) => {
              setOdeyenAd(e.target.value);
            }}
          />
        )}
      </Alan>
      <Alan etiket={t('operasyon.finans.kart.odeyenTelefon')}>
        {(o) => (
          <Girdi
            {...o}
            type="tel"
            inputMode="tel"
            maxLength={32}
            value={telefon}
            onChange={(e) => {
              setTelefon(e.target.value);
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
          {t('operasyon.finans.kart.profilKaydet')}
        </Dugme>
      </div>
    </form>
  );
}
