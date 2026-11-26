'use client';

import { t } from '@kopru/i18n';
import { ArrowLeft, Award, Flame, Puzzle, Star, Zap } from 'lucide-react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { useState } from 'react';

import { KarakterGorseli } from './ortak';
import { RadarGrafigi } from './radar-grafigi';

import { BosDurum } from '@/components/bos-durum';
import { PersonelKonuAnalizi } from '@/components/gunluk-soru/personel-analizi';
import { HataDurumu } from '@/components/hata-durumu';
import { tarihYaz } from '@/components/hesap/ortak';
import { SayfaBasligi } from '@/components/kabuk/sayfa-basligi';
import { Sekmeler } from '@/components/ogrenme/ortak';
import { dugmeStili } from '@/components/ui/button';
import { Iskelet, Kart } from '@/components/ui/kart';
import { useKurum } from '@/kurum/baglam';
import { UygulamaHatasi, hataMesaji } from '@/lib/api';
import { modulKapaliMi, useAldigiYildizlar, useOgrenciOzeti } from '@/lib/motivasyon/veri';
import { useOgrenciler } from '@/lib/ogrenme/veri';

/** Ogretmen/yonetici: bir ogrencinin motivasyon ozeti (seviye, beceri radari, seri, rozet sayisi). */
export function OgrenciProfili() {
  const { ogrenciId } = useParams<{ ogrenciId: string }>();
  const { uyelik, acikModuller } = useKurum();
  const kurumId = uyelik.kurumId;
  const kapali = !acikModuller.includes('oyunlastirma');
  const ogrenciler = useOgrenciler(kurumId);
  const ad = ogrenciler.liste.find((o) => o.id === ogrenciId)?.ad;
  const params = useSearchParams();
  const [sekme, setSekme] = useState(
    params.get('sekme') === 'konu-analizi' ? 'konu-analizi' : 'ozet',
  );
  const geri = (
    <Link
      href={`/${kurumId}/ogrenciler`}
      className={dugmeStili({ gorunum: 'hayalet', boyut: 'sm', className: '-ml-3 mb-3' })}
    >
      <ArrowLeft aria-hidden />
      {t('motivasyon.ozet.geri')}
    </Link>
  );
  return (
    <>
      {geri}
      <SayfaBasligi
        baslik={ad ?? t('motivasyon.ozet.baslik')}
        aciklama={t('motivasyon.ozet.aciklama')}
      />
      <Sekmeler
        deger={sekme}
        degisti={setSekme}
        etiket={t('motivasyon.ozet.sekmeler')}
        sekmeler={[
          {
            anahtar: 'ozet',
            etiket: t('motivasyon.ozet.sekmeOzet'),
            icerik: kapali ? (
              <Kart>
                <BosDurum
                  className="py-16"
                  ikon={Puzzle}
                  baslik={t('yerTutucu.modulKapali')}
                  aciklama={t('yerTutucu.modulKapaliAciklama')}
                />
              </Kart>
            ) : (
              <OzetIcerigi kurumId={kurumId} ogrenciId={ogrenciId} />
            ),
          },
          {
            anahtar: 'konu-analizi',
            etiket: t('gunlukSoru.personel.sekme'),
            icerik: <PersonelKonuAnalizi ogrenciId={ogrenciId} />,
          },
        ]}
      />
    </>
  );
}

function OzetIcerigi({ kurumId, ogrenciId }: { kurumId: string; ogrenciId: string }) {
  const q = useOgrenciOzeti(kurumId, ogrenciId);
  const yildizlar = useAldigiYildizlar(kurumId, ogrenciId);

  if (q.isPending) {
    return (
      <div role="status" aria-label={t('ortak.yukleniyor')} className="flex flex-col gap-4">
        <Iskelet className="h-32 w-full" />
        <Iskelet className="h-64 w-full" />
      </div>
    );
  }
  if (q.isError) {
    if (modulKapaliMi(q.error)) {
      return (
        <Kart>
          <BosDurum
            className="py-16"
            ikon={Puzzle}
            baslik={t('yerTutucu.modulKapali')}
            aciklama={t('yerTutucu.modulKapaliAciklama')}
          />
        </Kart>
      );
    }
    const yok = q.error instanceof UygulamaHatasi && q.error.durum === 404;
    return (
      <HataDurumu
        aciklama={yok ? t('motivasyon.ozet.bulunamadi') : hataMesaji(q.error)}
        tekrarDene={yok ? undefined : () => void q.refetch()}
      />
    );
  }

  const d = q.data;
  const k = d.karakter;
  return (
    <div className="flex flex-col gap-4" data-testid="ogrenci-ozeti">
      <Kart
        aria-labelledby="ozet-baslik"
        className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center"
      >
        {k ? (
          <div className="shrink-0 self-center rounded-full bg-vurgu-yumusak p-3">
            <KarakterGorseli turKodu={k.tur_kodu} asama={k.asama} boyut={112} />
          </div>
        ) : null}
        <div className="min-w-0 flex-1">
          <h2 id="ozet-baslik" className="text-base font-semibold">
            {k ? t('motivasyon.ozet.karakter', { ad: k.ad }) : t('motivasyon.ozet.karakterYok')}
          </h2>
          <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Olcu ikon={Zap} etiket={t('motivasyon.ozet.seviye')} deger={String(d.seviye)} />
            <Olcu ikon={Zap} etiket={t('motivasyon.ozet.toplamXp')} deger={String(d.toplam_xp)} />
            <Olcu
              ikon={Flame}
              etiket={t('motivasyon.ozet.seri')}
              deger={t('motivasyon.ozet.gun', { n: d.seri.mevcut_seri })}
              alt={t('motivasyon.ozet.rekor', { n: d.seri.en_uzun_seri })}
            />
            <Olcu
              ikon={Award}
              etiket={t('motivasyon.ozet.rozet')}
              deger={String(d.rozetler.kazanilan.length)}
            />
          </dl>
          <p className="mt-3 text-sm text-metin-ikincil">
            {t('motivasyon.yuva.bugunHafta', { bugun: d.bugun.xp, hafta: d.bu_hafta_xp })}
          </p>
        </div>
      </Kart>

      <div className="grid gap-4 lg:grid-cols-2">
        <Kart aria-labelledby="ozet-radar" className="p-5">
          <h2 id="ozet-radar" className="mb-3 text-base font-semibold">
            {t('motivasyon.radar.baslik')}
          </h2>
          <RadarGrafigi beceriler={d.beceriler} />
        </Kart>
        <Kart aria-labelledby="ozet-yildiz" className="p-5">
          <h2 id="ozet-yildiz" className="text-base font-semibold">
            {t('motivasyon.yildiz.baslik')}
          </h2>
          {yildizlar.data && yildizlar.data.yildizlar.length > 0 ? (
            <ul className="mt-2 divide-y divide-kenar">
              {yildizlar.data.yildizlar.map((y) => (
                <li key={y.id} className="flex items-start gap-3 py-2.5 text-sm">
                  <Star className="mt-0.5 size-4 shrink-0 text-uyari" aria-hidden />
                  <span>
                    <span className="block font-medium">
                      {t('motivasyon.yildiz.hafta', {
                        tarih: tarihYaz(`${y.hafta_baslangic}T12:00:00Z`),
                      })}
                    </span>
                    {y.gerekce ? <span className="text-metin-ikincil">{y.gerekce}</span> : null}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-metin-ikincil">{t('motivasyon.ozet.yildizYok')}</p>
          )}
        </Kart>
      </div>
    </div>
  );
}

function Olcu({
  ikon: Ikon,
  etiket,
  deger,
  alt,
}: {
  ikon: typeof Zap;
  etiket: string;
  deger: string;
  alt?: string;
}) {
  return (
    <div>
      <dt className="flex items-center gap-1.5 text-sm text-metin-ikincil">
        <Ikon className="size-4" aria-hidden />
        {etiket}
      </dt>
      <dd className="text-xl font-semibold tabular-nums">{deger}</dd>
      {alt ? <dd className="text-xs text-metin-ikincil">{alt}</dd> : null}
    </div>
  );
}
