'use client';

import { SoruBildirimSema, SoruDetaySema, type SoruBildirimNedeniSema } from '@kopru/contracts';
import { t } from '@kopru/i18n';
import { useMutation } from '@tanstack/react-query';
import { ArrowLeft, CircleCheck, Flag, MessageCircleQuestion, RotateCw } from 'lucide-react';
import Link from 'next/link';
import { useState, type SyntheticEvent } from 'react';
import type { z } from 'zod';

import { CevapFormu } from './cevap-formu';
import { EkGosterimi, SoruGorseli } from './ekler';
import { DurumRozeti } from './soru-arsivi';

import { HataDurumu } from '@/components/hata-durumu';
import {
  BildirimKutusu,
  ListeIskeleti,
  basari,
  basarisiz,
  zamanYaz,
  type Bildirim,
} from '@/components/hesap/ortak';
import { Alan } from '@/components/operasyon/ortak';
import { Dugme } from '@/components/ui/button';
import { MetinAlani } from '@/components/ui/metin-alani';
import { Pencere } from '@/components/ui/pencere';
import { Rozet } from '@/components/ui/rozet';
import { Secim } from '@/components/ui/secim';
import { Uyari } from '@/components/ui/uyari';
import { useKurum } from '@/kurum/baglam';
import { hataMesaji } from '@/lib/api';
import { bransAdi } from '@/lib/bransler';
import { ogrenmeIstek } from '@/lib/hesap-istek';
import { useKonular } from '@/lib/ogrenme/veri';
import { bekliyorMu } from '@/lib/soru/soru';
import { useSoruDetayi, useSoruYenile } from '@/lib/soru/veri';

type Detay = z.output<typeof SoruDetaySema>;
type BildirimNedeni = z.infer<typeof SoruBildirimNedeniSema>;
const NEDENLER: readonly BildirimNedeni[] = ['uygunsuz', 'kisisel_bilgi', 'diger'];

/** Soru detayi: ileti dizisi, ekler, ogrenci eylemleri (anladim / takip / yeniden ac), ogretmen cevap formu, bildirme. */
export function SoruDetayEkrani({
  soruId,
  geriHref,
  geriEtiket,
}: {
  soruId: string;
  geriHref: string;
  geriEtiket: string;
}) {
  const { uyelik, rol } = useKurum();
  const kurumId = uyelik.kurumId;
  const q = useSoruDetayi(kurumId, soruId);
  const konular = useKonular(kurumId);
  const [bildirim, setBildirim] = useState<Bildirim>(null);
  const [bildirAcik, setBildirAcik] = useState(false);
  const ogrenci = rol === 'ogrenci';

  const geri = (
    <Link
      href={geriHref}
      className="mb-4 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-metin-ikincil hover:text-metin"
    >
      <ArrowLeft className="size-4" aria-hidden />
      {geriEtiket}
    </Link>
  );

  if (q.isPending) {
    return (
      <>
        {geri}
        <ListeIskeleti satir={4} />
      </>
    );
  }
  if (q.isError) {
    return (
      <>
        {geri}
        <HataDurumu
          baslik={t('soruSor.detay.yuklenemedi')}
          aciklama={hataMesaji(q.error)}
          tekrarDene={() => void q.refetch()}
        />
      </>
    );
  }
  const s = q.data;
  const konu = s.konu_id ? konular.data?.find((k) => k.id === s.konu_id)?.ad : undefined;
  const yenileAdres = () => void q.refetch();
  const personelCevaplayabilir = !ogrenci && bekliyorMu(s.durum);

  return (
    <>
      {geri}
      <article aria-labelledby="soru-baslik" className="flex flex-col gap-5">
        <header className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <DurumRozeti durum={s.durum} />
            <Rozet>{bransAdi(s.brans_kodu)}</Rozet>
            {konu ? <Rozet>{konu}</Rozet> : null}
            {s.yeniden_acilma_sayisi > 0 ? (
              <Rozet ton="uyari">
                {t('soruSor.detay.yenidenAcildi', { n: s.yeniden_acilma_sayisi })}
              </Rozet>
            ) : null}
          </div>
          <h1 id="soru-baslik" className="text-2xl font-semibold leading-tight">
            {s.baslik ?? s.metin_onizleme ?? t('soruSor.arsiv.basliksiz')}
          </h1>
          <p className="text-sm text-metin-ikincil">
            {!ogrenci && s.ogrenci_adi ? `${s.ogrenci_adi} · ` : ''}
            {zamanYaz(s.created_at)}
          </p>
        </header>

        <BildirimKutusu bildirim={bildirim} />

        {s.adres_alinamadi ? (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-2 rounded-orta bg-uyari-yumusak px-3.5 py-3 text-sm"
          >
            <span>{t('soruSor.ek.yuklenemedi')}</span>
            <Dugme type="button" gorunum="ikincil" boyut="sm" onClick={yenileAdres}>
              <RotateCw aria-hidden />
              {t('soruSor.ek.yenile')}
            </Dugme>
          </div>
        ) : null}

        {s.fotograflar.length > 0 ? (
          <section aria-label={t('soruSor.detay.fotograflar')}>
            <h2 className="mb-2 text-base font-semibold">{t('soruSor.detay.fotograflar')}</h2>
            <ul className="grid gap-3 sm:grid-cols-3" data-testid="soru-fotograflari">
              {s.fotograflar.map((f, i) => (
                <li key={f.medya_dosya_id}>
                  <SoruGorseli
                    adres={f.adres}
                    alt={t('soruSor.ek.fotografAlt', { sira: i + 1 })}
                    yenile={yenileAdres}
                  />
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section aria-label={t('soruSor.detay.yazisma')} className="flex flex-col gap-3">
          <h2 className="text-base font-semibold">{t('soruSor.detay.yazisma')}</h2>
          <ol className="flex flex-col gap-3" data-testid="ileti-dizisi">
            {s.mesajlar.map((m) => (
              <MesajKarti
                key={m.id}
                mesaj={m}
                benimki={ogrenci ? m.yazar_rolu === 'ogrenci' : m.yazar_rolu !== 'ogrenci'}
                yenileAdres={yenileAdres}
              />
            ))}
          </ol>
        </section>

        {ogrenci ? <OgrenciEylemleri soru={s} bildirimGoster={setBildirim} /> : null}

        {personelCevaplayabilir ? (
          <CevapFormu
            soru={s}
            yenileAdres={yenileAdres}
            cevaplandi={() => {
              setBildirim(basari(t('soruSor.cevap.gonderildi')));
            }}
          />
        ) : null}

        <div className="flex">
          <Dugme
            type="button"
            gorunum="hayalet"
            boyut="sm"
            onClick={() => {
              setBildirAcik(true);
            }}
          >
            <Flag aria-hidden />
            {t('soruSor.bildir.dugme')}
          </Dugme>
        </div>
      </article>

      <BildirPenceresi
        soru={s}
        acik={bildirAcik}
        kapat={() => {
          setBildirAcik(false);
        }}
        bitti={() => {
          setBildirAcik(false);
          setBildirim(basari(t('soruSor.bildir.gonderildi')));
        }}
      />
    </>
  );
}

function MesajKarti({
  mesaj: m,
  benimki,
  yenileAdres,
}: {
  mesaj: Detay['mesajlar'][number];
  benimki: boolean;
  yenileAdres: () => void;
}) {
  const turEtiketi = t(`soruSor.mesaj.tur.${m.tur}`);
  return (
    <li
      data-testid="mesaj"
      className={`flex flex-col gap-2 rounded-buyuk border p-4 ${benimki ? 'border-birincil/40 bg-birincil-yumusak' : 'border-kenar bg-yuzey'}`}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
        <span className="font-semibold">{m.yazar_adi ?? t(`roller.${m.yazar_rolu}`)}</span>
        <Rozet>{turEtiketi}</Rozet>
        <span className="text-metin-ikincil">{zamanYaz(m.created_at)}</span>
      </div>
      {m.metin ? <p className="whitespace-pre-wrap break-words text-base">{m.metin}</p> : null}
      {m.derste_konusalim ? (
        <p className="flex items-center gap-1.5 text-sm font-medium">
          <MessageCircleQuestion className="size-4" aria-hidden />
          {t('soruSor.mesaj.derste')}
        </p>
      ) : null}
      {m.ekler.length > 0 ? (
        <ul className="grid gap-3 sm:grid-cols-2">
          {m.ekler.map((e, i) => (
            <li key={e.id}>
              <EkGosterimi ek={e} sira={i + 1} yenile={yenileAdres} />
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function OgrenciEylemleri({
  soru: s,
  bildirimGoster,
}: {
  soru: Detay;
  bildirimGoster: (b: Bildirim) => void;
}) {
  const { uyelik } = useKurum();
  const kurumId = uyelik.kurumId;
  const yenile = useSoruYenile(kurumId);
  const [takipAcik, setTakipAcik] = useState(false);
  const [metin, setMetin] = useState('');
  const [istekId, setIstekId] = useState(() => crypto.randomUUID());
  const kok = `kurumlar/${kurumId}/sorular/${s.id}`;

  const anladim = useMutation({
    mutationFn: () => ogrenmeIstek(`${kok}/anladim`, { yontem: 'POST', sema: SoruDetaySema }),
    onSuccess: () => {
      bildirimGoster(basari(t('soruSor.eylem.anladimTamam')));
      void yenile();
    },
    onError: (h) => {
      bildirimGoster(basarisiz(h));
    },
  });
  const takip = useMutation({
    mutationFn: () =>
      ogrenmeIstek(`${kok}/takip`, {
        yontem: 'POST',
        sema: SoruDetaySema,
        govde: { metin: metin.trim(), istek_id: istekId },
      }),
    onSuccess: () => {
      setTakipAcik(false);
      setMetin('');
      setIstekId(crypto.randomUUID());
      bildirimGoster(
        basari(
          s.durum === 'cozuldu'
            ? t('soruSor.eylem.yenidenAcildi')
            : t('soruSor.eylem.takipGonderildi'),
        ),
      );
      void yenile();
    },
  });

  const takipGonder = (e: SyntheticEvent) => {
    e.preventDefault();
    if (metin.trim()) takip.mutate();
  };

  if (s.durum === 'acik' || s.durum === 'takip_bekliyor') {
    return (
      <p
        role="status"
        className="rounded-orta bg-yuzey-ikincil px-3.5 py-3 text-sm text-metin-ikincil"
      >
        {t('soruSor.eylem.bekleniyor')}
      </p>
    );
  }
  if (s.durum === 'kapandi') return null;

  const hakVar = s.kalan_takip_hakki > 0;
  const cozuldu = s.durum === 'cozuldu';

  return (
    <section
      aria-label={t('soruSor.eylem.baslik')}
      className="flex flex-col gap-3 rounded-buyuk border border-kenar bg-yuzey p-4"
    >
      <h2 className="text-base font-semibold">
        {cozuldu ? t('soruSor.eylem.cozuldu') : t('soruSor.eylem.anladinMi')}
      </h2>
      <div className="flex flex-wrap gap-2">
        {!cozuldu ? (
          <Dugme
            type="button"
            disabled={anladim.isPending}
            onClick={() => {
              anladim.mutate();
            }}
          >
            <CircleCheck aria-hidden />
            {t('soruSor.eylem.anladim')}
          </Dugme>
        ) : null}
        <Dugme
          type="button"
          gorunum="ikincil"
          disabled={!hakVar || takipAcik}
          aria-expanded={takipAcik}
          onClick={() => {
            setTakipAcik(true);
          }}
        >
          {cozuldu ? t('soruSor.eylem.yenidenAc') : t('soruSor.eylem.halaAnlamadim')}
        </Dugme>
      </div>
      <p className="text-sm text-metin-ikincil">
        {hakVar
          ? t('soruSor.eylem.kalanTakip', { n: s.kalan_takip_hakki })
          : t('soruSor.eylem.takipBitti')}
      </p>
      {takipAcik ? (
        <form
          onSubmit={takipGonder}
          aria-label={t('soruSor.eylem.takipForm')}
          className="flex flex-col gap-3"
        >
          <Alan etiket={t('soruSor.eylem.takipMetin')} yardim={t('soruSor.eylem.takipYardim')}>
            {(o) => (
              <MetinAlani
                {...o}
                rows={3}
                maxLength={4000}
                required
                value={metin}
                onChange={(e) => {
                  setMetin(e.target.value);
                }}
              />
            )}
          </Alan>
          {takip.isError ? <Uyari>{hataMesaji(takip.error)}</Uyari> : null}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Dugme
              type="button"
              gorunum="ikincil"
              onClick={() => {
                setTakipAcik(false);
              }}
            >
              {t('ortak.vazgec')}
            </Dugme>
            <Dugme type="submit" disabled={metin.trim() === '' || takip.isPending}>
              {takip.isPending ? t('soruSor.form.gonderiliyor') : t('soruSor.eylem.takipGonder')}
            </Dugme>
          </div>
        </form>
      ) : null}
    </section>
  );
}

function BildirPenceresi({
  soru,
  acik,
  kapat,
  bitti,
}: {
  soru: Detay;
  acik: boolean;
  kapat: () => void;
  bitti: () => void;
}) {
  const { uyelik } = useKurum();
  const kurumId = uyelik.kurumId;
  const qc = useSoruYenile(kurumId);
  const [neden, setNeden] = useState<BildirimNedeni>('uygunsuz');
  const [aciklama, setAciklama] = useState('');
  const gonder = useMutation({
    mutationFn: () =>
      ogrenmeIstek(`kurumlar/${kurumId}/sorular/${soru.id}/bildir`, {
        yontem: 'POST',
        sema: SoruBildirimSema,
        govde: { neden, ...(aciklama.trim() ? { aciklama: aciklama.trim() } : {}) },
      }),
    onSuccess: () => {
      setAciklama('');
      void qc();
      bitti();
    },
  });
  return (
    <Pencere
      acik={acik}
      degisti={(a) => {
        if (!a) kapat();
      }}
      baslik={t('soruSor.bildir.baslik')}
      aciklama={t('soruSor.bildir.aciklama')}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          gonder.mutate();
        }}
        className="flex flex-col gap-4"
      >
        <Alan etiket={t('soruSor.bildir.neden')}>
          {(o) => (
            <Secim
              {...o}
              value={neden}
              onChange={(e) => {
                setNeden(e.target.value as BildirimNedeni);
              }}
            >
              {NEDENLER.map((n) => (
                <option key={n} value={n}>
                  {t(`soruSor.bildir.nedenler.${n}`)}
                </option>
              ))}
            </Secim>
          )}
        </Alan>
        <Alan etiket={t('soruSor.bildir.not')}>
          {(o) => (
            <MetinAlani
              {...o}
              rows={3}
              maxLength={500}
              value={aciklama}
              onChange={(e) => {
                setAciklama(e.target.value);
              }}
            />
          )}
        </Alan>
        {gonder.isError ? <Uyari>{hataMesaji(gonder.error)}</Uyari> : null}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Dugme type="button" gorunum="ikincil" onClick={kapat}>
            {t('ortak.vazgec')}
          </Dugme>
          <Dugme type="submit" disabled={gonder.isPending}>
            {gonder.isPending ? t('soruSor.form.gonderiliyor') : t('soruSor.bildir.gonder')}
          </Dugme>
        </div>
      </form>
    </Pencere>
  );
}
