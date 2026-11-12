'use client';

import {
  KarakterYanitiSema,
  KARAKTER_AD_AZAMI,
  type MotivasyonOgrenciDurumu,
} from '@kopru/contracts';
import { t, type MessageKey } from '@kopru/i18n';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Pencil, Star, Zap } from 'lucide-react';
import { useId, useState, type SyntheticEvent } from 'react';

import { KarakterSecimi } from './karakter-secimi';
import { KozmetikDolabi } from './kozmetik-dolabi';
import { Ilerleme, KarakterGorseli } from './ortak';
import { RadarGrafigi } from './radar-grafigi';
import { RozetlerKarti } from './rozetler';
import { SeriKarti } from './seri-karti';

import { BosDurum } from '@/components/bos-durum';
import { HataDurumu } from '@/components/hata-durumu';
import { tarihYaz } from '@/components/hesap/ortak';
import { BolumKapisi } from '@/components/kabuk/bolum-yer-tutucu';
import { SayfaBasligi } from '@/components/kabuk/sayfa-basligi';
import { Dugme } from '@/components/ui/button';
import { Etiket, Girdi } from '@/components/ui/input';
import { Iskelet, Kart } from '@/components/ui/kart';
import { Pencere } from '@/components/ui/pencere';
import { Uyari } from '@/components/ui/uyari';
import { useKurum } from '@/kurum/baglam';
import { hataMesaji } from '@/lib/api';
import { motivasyonIstek } from '@/lib/hesap-istek';
import { motivasyonHataMesaji } from '@/lib/motivasyon/hata';
import {
  motivasyonAnahtari,
  useAldigiYildizlar,
  useBenim,
  useKarakterim,
  useKozmetikler,
  useSeri,
} from '@/lib/motivasyon/veri';
import { seviyeIlerlemesi } from '@/lib/motivasyon/xp';

export function YuvaEkrani() {
  return (
    <BolumKapisi bolum="karakterim">
      <YuvaIcerigi />
    </BolumKapisi>
  );
}

function Iskeletler() {
  return (
    <div role="status" aria-label={t('ortak.yukleniyor')} className="flex flex-col gap-4">
      <Iskelet className="h-10 w-1/3" />
      <Iskelet className="h-48 w-full" />
      <Iskelet className="h-64 w-full" />
    </div>
  );
}

function YuvaIcerigi() {
  const { uyelik } = useKurum();
  const kurumId = uyelik.kurumId;
  const benim = useBenim(kurumId);
  const karakter = useKarakterim(kurumId);
  const durum = benim.data;

  const hata = benim.error ?? karakter.error;
  if (hata) {
    return (
      <>
        <SayfaBasligi baslik={t('motivasyon.yuva.baslik')} />
        <HataDurumu
          aciklama={hataMesaji(hata)}
          tekrarDene={() => {
            void benim.refetch();
            void karakter.refetch();
          }}
        />
      </>
    );
  }
  if (!durum || karakter.isPending) {
    return (
      <>
        <SayfaBasligi baslik={t('motivasyon.yuva.baslik')} />
        <Iskeletler />
      </>
    );
  }

  if (!karakter.data?.karakter) {
    return (
      <>
        <SayfaBasligi
          baslik={t('motivasyon.secim.baslik')}
          aciklama={t('motivasyon.secim.aciklama')}
        />
        <KarakterSecimi kurumId={kurumId} />
      </>
    );
  }

  return (
    <>
      <SayfaBasligi baslik={t('motivasyon.yuva.baslik')} aciklama={t('motivasyon.yuva.aciklama')} />
      <div className="flex flex-col gap-4">
        <SeviyeKarti kurumId={kurumId} durum={durum} />
        <div className="grid gap-4 lg:grid-cols-2">
          <Kart aria-labelledby="radar-baslik" className="p-5">
            <h2 id="radar-baslik" className="text-base font-semibold">
              {t('motivasyon.radar.baslik')}
            </h2>
            <p className="mb-3 text-sm text-metin-ikincil">{t('motivasyon.radar.aciklama')}</p>
            <RadarGrafigi beceriler={durum.beceriler} />
          </Kart>
          <SeriBolumu kurumId={kurumId} />
        </div>
        <RozetlerKarti rozetler={durum.rozetler} />
        <KozmetikDolabi kurumId={kurumId} />
        <div className="grid gap-4 lg:grid-cols-2">
          <HareketlerKarti hareketler={durum.son_hareketler} />
          <YildizlarKarti kurumId={kurumId} ogrenciId={uyelik.id} />
        </div>
      </div>
    </>
  );
}

function SeriBolumu({ kurumId }: { kurumId: string }) {
  const seri = useSeri(kurumId);
  if (seri.isPending) return <Iskelet className="h-80 w-full" />;
  if (seri.isError) {
    return (
      <Kart>
        <HataDurumu aciklama={hataMesaji(seri.error)} tekrarDene={() => void seri.refetch()} />
      </Kart>
    );
  }
  return <SeriKarti seri={seri.data} />;
}

function SeviyeKarti({ kurumId, durum }: { kurumId: string; durum: MotivasyonOgrenciDurumu }) {
  const karakter = useKarakterim(kurumId).data?.karakter;
  const kozmetikler = useKozmetikler(kurumId).data?.kozmetikler;
  const [adAcik, setAdAcik] = useState(false);
  if (!karakter) return null;
  const adlar = Object.fromEntries((kozmetikler ?? []).map((k) => [k.kod, k.ad]));
  const ilerleme = seviyeIlerlemesi(durum);
  const kusananAdlari = karakter.kusanilanlar.map((k) => adlar[k.kozmetik_kodu] ?? k.kozmetik_kodu);

  return (
    <Kart
      aria-labelledby="karakter-kart-baslik"
      className="flex flex-col items-center gap-5 bg-vurgu-yumusak p-5 text-center sm:flex-row sm:text-left"
    >
      <div className="rounded-full bg-yuzey p-3">
        <KarakterGorseli
          turKodu={karakter.tur_kodu}
          asama={karakter.asama}
          boyut={152}
          oncelikli
          kusanilanlar={karakter.kusanilanlar}
          adlar={adlar}
        />
      </div>
      <div className="flex w-full min-w-0 flex-col gap-3">
        <div>
          <h2 id="karakter-kart-baslik" className="text-xl font-semibold">
            {karakter.ad}
          </h2>
          <p className="text-sm text-metin-ikincil">
            {t('motivasyon.yuva.turAsama', { tur: karakter.tur_adi, asama: karakter.asama_adi })}
            {kusananAdlari.length > 0
              ? ` · ${t('motivasyon.yuva.kusanilan', { liste: kusananAdlari.join(', ') })}`
              : ''}
          </p>
          <Dugme
            gorunum="hayalet"
            boyut="sm"
            className="-ml-3 mt-1"
            onClick={() => {
              setAdAcik(true);
            }}
          >
            <Pencil aria-hidden />
            {t('motivasyon.yuva.adDegistir')}
          </Dugme>
        </div>
        <div>
          <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-2xl font-semibold" data-testid="seviye">
              {t('motivasyon.yuva.seviye', { n: durum.seviye })}
            </span>
            <span className="flex items-center gap-1 text-sm text-metin-ikincil">
              <Zap className="size-4" aria-hidden />
              <span data-testid="toplam-xp">
                {t('motivasyon.yuva.toplamXp', { n: durum.toplam_xp })}
              </span>
            </span>
          </p>
          <Ilerleme
            className="mt-2"
            deger={durum.toplam_xp - durum.seviye_baslangic_xp}
            ust={Math.max(
              1,
              (durum.sonraki_seviye_xp ?? durum.toplam_xp) - durum.seviye_baslangic_xp,
            )}
            etiket={t('motivasyon.yuva.seviyeIlerlemesi')}
            metin={
              ilerleme.tamam
                ? t('motivasyon.yuva.sonSeviye')
                : t('motivasyon.yuva.sonrakiSeviye', {
                    kalan: ilerleme.kalan ?? 0,
                    n: durum.seviye + 1,
                  })
            }
          />
        </div>
        <p className="text-sm text-metin-ikincil">
          {t('motivasyon.yuva.bugunHafta', { bugun: durum.bugun.xp, hafta: durum.bu_hafta_xp })}
        </p>
        {karakter.sonraki_asama_seviyesi !== null ? (
          <p className="text-sm text-metin-ikincil">
            {t('motivasyon.yuva.sonrakiAsama', { n: karakter.sonraki_asama_seviyesi })}
          </p>
        ) : null}
      </div>
      <AdPenceresi kurumId={kurumId} acik={adAcik} degisti={setAdAcik} mevcut={karakter.ad} />
    </Kart>
  );
}

function AdPenceresi({
  kurumId,
  acik,
  degisti,
  mevcut,
}: {
  kurumId: string;
  acik: boolean;
  degisti: (a: boolean) => void;
  mevcut: string;
}) {
  const qc = useQueryClient();
  const [ad, setAd] = useState(mevcut);
  const id = useId();
  const degistir = useMutation({
    mutationFn: () =>
      motivasyonIstek(`kurumlar/${kurumId}/karakter/ad`, {
        yontem: 'PATCH',
        govde: { ad: ad.trim() },
        sema: KarakterYanitiSema,
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: motivasyonAnahtari(kurumId) });
      degisti(false);
    },
  });
  const gonder = (e: SyntheticEvent) => {
    e.preventDefault();
    if (ad.trim().length > 0 && !degistir.isPending) degistir.mutate();
  };
  return (
    <Pencere
      acik={acik}
      degisti={(a) => {
        degisti(a);
        if (a) {
          setAd(mevcut);
          degistir.reset();
        }
      }}
      baslik={t('motivasyon.yuva.adDegistir')}
    >
      <form onSubmit={gonder} className="flex flex-col gap-3" noValidate>
        <div className="flex flex-col gap-1.5">
          <Etiket htmlFor={id}>{t('motivasyon.secim.adEtiketi')}</Etiket>
          <Girdi
            id={id}
            value={ad}
            maxLength={KARAKTER_AD_AZAMI}
            autoComplete="off"
            onChange={(e) => {
              setAd(e.target.value);
            }}
          />
        </div>
        {degistir.isError ? <Uyari>{motivasyonHataMesaji(degistir.error)}</Uyari> : null}
        <div className="flex justify-end gap-2">
          <Dugme
            type="button"
            gorunum="ikincil"
            onClick={() => {
              degisti(false);
            }}
          >
            {t('ortak.vazgec')}
          </Dugme>
          <Dugme type="submit" disabled={ad.trim().length === 0 || degistir.isPending}>
            {t('motivasyon.yuva.kaydet')}
          </Dugme>
        </div>
      </form>
    </Pencere>
  );
}

function hareketAdi(kod: string): string {
  const anahtar = `motivasyon.hareket.${kod}` as MessageKey;
  const metin = t(anahtar);
  return metin === anahtar ? t('motivasyon.hareket.genel') : metin;
}

function HareketlerKarti({
  hareketler,
}: {
  hareketler: MotivasyonOgrenciDurumu['son_hareketler'];
}) {
  return (
    <Kart aria-labelledby="hareket-baslik" className="p-5">
      <h2 id="hareket-baslik" className="text-base font-semibold">
        {t('motivasyon.hareket.baslik')}
      </h2>
      {hareketler.length === 0 ? (
        <BosDurum
          ikon={Zap}
          baslik={t('motivasyon.hareket.bos')}
          aciklama={t('motivasyon.hareket.bosAciklama')}
          className="py-6"
        />
      ) : (
        <ul className="mt-2 divide-y divide-kenar" data-testid="hareketler">
          {hareketler.map((h) => (
            <li key={h.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <span className="min-w-0">
                <span className="block truncate font-medium">
                  {h.xp < 0 ? t('motivasyon.hareket.duzeltme') : hareketAdi(h.kural_kodu)}
                </span>
                <span className="text-metin-ikincil">{tarihYaz(h.created_at)}</span>
              </span>
              <span className="shrink-0 font-semibold tabular-nums">
                {t('motivasyon.hareket.xp', { n: h.xp > 0 ? `+${String(h.xp)}` : String(h.xp) })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Kart>
  );
}

function YildizlarKarti({ kurumId, ogrenciId }: { kurumId: string; ogrenciId: string }) {
  const q = useAldigiYildizlar(kurumId, ogrenciId);
  return (
    <Kart aria-labelledby="yildiz-baslik" className="p-5">
      <h2 id="yildiz-baslik" className="text-base font-semibold">
        {t('motivasyon.yildiz.baslik')}
      </h2>
      {q.isPending ? (
        <Iskelet className="mt-3 h-12 w-full" />
      ) : q.isError ? (
        <HataDurumu
          aciklama={hataMesaji(q.error)}
          tekrarDene={() => void q.refetch()}
          className="py-6"
        />
      ) : q.data.yildizlar.length === 0 ? (
        <BosDurum
          ikon={Star}
          baslik={t('motivasyon.yildiz.bos')}
          aciklama={t('motivasyon.yildiz.bosAciklama')}
          className="py-6"
        />
      ) : (
        <ul className="mt-2 divide-y divide-kenar" data-testid="yildizlarim">
          {q.data.yildizlar.map((y) => (
            <li key={y.id} className="flex items-start gap-3 py-2.5 text-sm">
              <Star className="mt-0.5 size-4 shrink-0 text-uyari" aria-hidden />
              <span>
                <span className="block font-medium">
                  {t('motivasyon.yildiz.hafta', {
                    tarih: tarihYaz(`${y.hafta_baslangic}T12:00:00Z`),
                  })}
                </span>
                {y.gerekce ? (
                  <span className="text-metin-ikincil">
                    {t('motivasyon.yildiz.ogretmenNotu', { not: y.gerekce })}
                  </span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Kart>
  );
}
