'use client';

import type { RaporDonemi } from '@kopru/contracts';
import { kurusBicimle, t } from '@kopru/i18n';
import { useMutation } from '@tanstack/react-query';
import { Download, LayoutDashboard, Puzzle, Wallet } from 'lucide-react';
import Link from 'next/link';
import { useState, type ReactNode } from 'react';

import { AltListe, type AltListeSecimi } from './alt-liste';

import { BosDurum } from '@/components/bos-durum';
import { HataDurumu } from '@/components/hata-durumu';
import { BildirimKutusu, basari, basarisiz, type Bildirim } from '@/components/hesap/ortak';
import { BolumKapisi } from '@/components/kabuk/bolum-yer-tutucu';
import { SayfaBasligi } from '@/components/kabuk/sayfa-basligi';
import { Dugme, dugmeStili } from '@/components/ui/button';
import { Iskelet, Kart } from '@/components/ui/kart';
import { useKurum } from '@/kurum/baglam';
import { hataMesaji } from '@/lib/api';
import { cn } from '@/lib/cn';
import { ogrenmeDosyaAl } from '@/lib/hesap-istek';
import { useSaatDilimi } from '@/lib/operasyon-verisi';
import { satirlariBirlestir, sureYaz, yuzdeYaz, type GostergeSatiri } from '@/lib/rapor/model';
import { raporExcelYolu, useFinansOzeti, useRaporOzetleri, type Gosterge } from '@/lib/rapor/veri';
import { yerelAy } from '@/lib/saat';

/** Yonetici/sahip: kurum paneli; ogretmen: yalniz atandigi gruplar (kapsam sunucuda zorlanir). */
export function PanelEkrani() {
  return (
    <BolumKapisi bolum="panel">
      <PanelIcerigi />
    </BolumKapisi>
  );
}

const DONEMLER: readonly RaporDonemi[] = ['7', '30'];

type Durum = 'yukleniyor' | 'hata' | 'hazir';
const durumu = (q: { isPending: boolean; isError: boolean }): Durum =>
  q.isPending ? 'yukleniyor' : q.isError ? 'hata' : 'hazir';

function PanelIcerigi() {
  const { uyelik, rol, acikModuller } = useKurum();
  const kurumId = uyelik.kurumId;
  const yonetim = rol === 'sahip' || rol === 'yonetici';
  const [donem, setDonem] = useState<RaporDonemi>('7');
  const [secim, setSecim] = useState<AltListeSecimi | null>(null);
  const [bildirim, setBildirim] = useState<Bildirim>(null);
  const { saatDilimi } = useSaatDilimi(kurumId);
  const { hesap, ders, ogrenme } = useRaporOzetleri(kurumId, donem);
  const finansAcik = yonetim && acikModuller.includes('finans');
  const finans = useFinansOzeti(kurumId, yerelAy(saatDilimi), finansAcik);

  const indir = useMutation({
    mutationFn: async () => {
      const { blob, dosyaAdi } = await ogrenmeDosyaAl(
        raporExcelYolu(kurumId, donem),
        `panel-son-${donem}-gun.xlsx`,
      );
      const adres = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = adres;
      a.download = dosyaAdi;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => {
        URL.revokeObjectURL(adres);
      }, 1000);
    },
    onSuccess: () => {
      setBildirim(basari(t('rapor.excelIndi')));
    },
    onError: (hata) => {
      setBildirim(basarisiz(hata));
    },
  });

  const [tetikleyen, setTetikleyen] = useState<HTMLElement | null>(null);
  const ac = (s: AltListeSecimi, olay?: { currentTarget: HTMLElement }) => {
    setTetikleyen(olay?.currentTarget ?? null);
    setSecim(s);
  };
  const kapat = () => {
    setSecim(null);
    // Odak, listeyi acan sayiya doner (klavye kullanicisi yerini kaybetmez).
    tetikleyen?.focus();
  };

  const baslik = (
    <SayfaBasligi
      baslik={t('rapor.baslik')}
      aciklama={t(yonetim ? 'rapor.aciklamaYonetici' : 'rapor.aciklamaOgretmen')}
    >
      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label={t('rapor.donem')} className="flex gap-1">
          {DONEMLER.map((d) => (
            <Dugme
              key={d}
              type="button"
              boyut="sm"
              gorunum={d === donem ? 'birincil' : 'ikincil'}
              aria-pressed={d === donem}
              onClick={() => {
                setDonem(d);
              }}
            >
              {t(`rapor.donem${d}`)}
            </Dugme>
          ))}
        </div>
        <Dugme
          type="button"
          boyut="sm"
          gorunum="ikincil"
          disabled={indir.isPending}
          onClick={() => {
            indir.mutate();
          }}
        >
          <Download aria-hidden />
          {indir.isPending ? t('rapor.excelIniyor') : t('rapor.excel')}
        </Dugme>
        {yonetim ? (
          <Link
            href={`/${kurumId}/moduller`}
            className={dugmeStili({ gorunum: 'ikincil', boyut: 'sm' })}
          >
            <Puzzle aria-hidden />
            {t('rapor.modulAyarlari')}
          </Link>
        ) : null}
      </div>
    </SayfaBasligi>
  );

  if (hesap.isPending) {
    return (
      <>
        {baslik}
        <PanelIskeleti />
      </>
    );
  }
  if (hesap.isError) {
    return (
      <>
        {baslik}
        <Kart>
          <HataDurumu
            baslik={t('rapor.yuklenemedi')}
            aciklama={hataMesaji(hesap.error)}
            tekrarDene={() => void hesap.refetch()}
          />
        </Kart>
      </>
    );
  }

  const veri = satirlariBirlestir(hesap.data, ders.data, ogrenme.data);
  const dersDurumu = durumu(ders);
  const ogrenmeDurumu = durumu(ogrenme);
  const tarih = t('rapor.aralik', { baslangic: hesap.data.baslangic, bitis: hesap.data.bitis });
  const kapsamAdi = t(
    hesap.data.kapsam === 'kurum' ? 'rapor.altListe.kapsamKurum' : 'rapor.altListe.kapsamGruplarim',
  );

  if (hesap.data.gruplar.length === 0 && hesap.data.kurum.aktif_ogrenci === 0) {
    return (
      <>
        {baslik}
        <Kart>
          <BosDurum
            className="py-16"
            ikon={LayoutDashboard}
            baslik={t('rapor.bos')}
            aciklama={t('rapor.bosAciklama')}
          />
        </Kart>
      </>
    );
  }

  const kartAc = (gosterge: Gosterge) => (olay: { currentTarget: HTMLElement }) => {
    ac({ gosterge, kapsamAdi }, olay);
  };

  return (
    <>
      {baslik}
      <div className="mb-4">
        <BildirimKutusu bildirim={bildirim} />
      </div>
      <p className="mb-3 text-sm text-metin-ikincil">{tarih}</p>

      <section
        aria-label={t('rapor.gostergeler')}
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
      >
        <GostergeKarti
          etiket={t('rapor.kart.aktifOgrenci')}
          deger={String(hesap.data.kurum.aktif_ogrenci)}
          alt={t('rapor.kart.aktifAlt', {
            grup: hesap.data.kurum.grup_sayisi,
            ogretmen: hesap.data.kurum.ogretmen_sayisi,
          })}
          secili={secim?.gosterge === 'aktif' && !secim.grupId && !secim.ogretmenId}
          onClick={kartAc('aktif')}
        />
        <GostergeKarti
          etiket={t('rapor.kart.etkinOgrenci')}
          deger={veri.etkinOgrenci === undefined ? undefined : String(veri.etkinOgrenci)}
          durum={ogrenmeDurumu}
          alt={t('rapor.kart.etkinAlt')}
          yenile={() => void ogrenme.refetch()}
        />
        <OranKarti
          etiket={t('rapor.kart.odev')}
          oran={veri.kurum.odev}
          durum={ogrenmeDurumu}
          yenile={() => void ogrenme.refetch()}
          secili={secim?.gosterge === 'odev' && !secim.grupId && !secim.ogretmenId}
          onClick={kartAc('odev')}
        />
        <OranKarti
          etiket={t('rapor.kart.plan')}
          oran={veri.kurum.plan}
          durum={ogrenmeDurumu}
          yenile={() => void ogrenme.refetch()}
          secili={secim?.gosterge === 'plan' && !secim.grupId && !secim.ogretmenId}
          onClick={kartAc('plan')}
        />
        <SoruKarti
          soru={veri.kurum.soru}
          durum={ogrenmeDurumu}
          yenile={() => void ogrenme.refetch()}
          secili={secim?.gosterge === 'soru' && !secim.grupId && !secim.ogretmenId}
          onClick={kartAc('soru')}
        />
        <OranKarti
          etiket={t('rapor.kart.anladim')}
          oran={veri.kurum.anladim}
          durum={dersDurumu}
          yenile={() => void ders.refetch()}
          secili={secim?.gosterge === 'anladim' && !secim.grupId && !secim.ogretmenId}
          onClick={kartAc('anladim')}
        />
        <OranKarti
          etiket={t('rapor.kart.devam')}
          oran={veri.kurum.devam}
          durum={dersDurumu}
          yenile={() => void ders.refetch()}
          secili={secim?.gosterge === 'devam' && !secim.grupId && !secim.ogretmenId}
          onClick={kartAc('devam')}
        />
        {finansAcik ? <FinansKarti kurumId={kurumId} finans={finans} /> : null}
      </section>

      <KirilimTablosu
        id="grup"
        baslik={t('rapor.tablo.gruplar')}
        ilkSutun={t('rapor.tablo.grup')}
        bos={t('rapor.tablo.grupBos')}
        baglanti={
          yonetim
            ? { href: `/${kurumId}/gruplar`, metin: t('rapor.tablo.yonetimBaglantisi') }
            : undefined
        }
        satirlar={veri.gruplar.map((g) => ({
          id: g.id,
          ad: g.ad,
          aktif: g.aktifOgrenci,
          gostergeler: g,
        }))}
        dersDurumu={dersDurumu}
        ogrenmeDurumu={ogrenmeDurumu}
        sec={(gosterge, satir, olay) => {
          ac({ gosterge, grupId: satir.id, kapsamAdi: satir.ad }, olay);
        }}
        seciliAnahtar={secim?.grupId}
        seciliGosterge={secim?.gosterge}
      />
      {rol !== 'ogretmen' ? (
        <KirilimTablosu
          id="ogretmen"
          baslik={t('rapor.tablo.ogretmenler')}
          ilkSutun={t('rapor.tablo.ogretmen')}
          bos={t('rapor.tablo.ogretmenBos')}
          baglanti={
            yonetim
              ? {
                  href: `/${kurumId}/ogretmenler`,
                  metin: t('rapor.tablo.ogretmenYonetimBaglantisi'),
                }
              : undefined
          }
          satirlar={veri.ogretmenler.map((o) => ({
            id: o.id,
            ad: o.ad ?? t('operasyon.ortak.adsiz'),
            aktif: o.aktifOgrenci,
            gostergeler: o,
          }))}
          dersDurumu={dersDurumu}
          ogrenmeDurumu={ogrenmeDurumu}
          sec={(gosterge, satir, olay) => {
            ac({ gosterge, ogretmenId: satir.id, kapsamAdi: satir.ad }, olay);
          }}
          seciliAnahtar={secim?.ogretmenId}
          seciliGosterge={secim?.gosterge}
        />
      ) : null}

      {secim ? <AltListe kurumId={kurumId} donem={donem} secim={secim} kapat={kapat} /> : null}
    </>
  );
}

// --- Gosterge kartlari --------------------------------------------------------------------------

function KartIskeleti() {
  return (
    <div role="status" aria-label={t('ortak.yukleniyor')} className="flex flex-col gap-2">
      <Iskelet className="h-8 w-24" />
      <Iskelet className="h-4 w-40" />
    </div>
  );
}

function PanelIskeleti() {
  return (
    <div role="status" aria-label={t('ortak.yukleniyor')} className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <Kart key={i} className="p-4">
            <Iskelet className="mb-3 h-4 w-32" />
            <Iskelet className="mb-2 h-9 w-24" />
            <Iskelet className="h-4 w-40" />
          </Kart>
        ))}
      </div>
      <Kart className="p-4">
        <Iskelet className="mb-3 h-5 w-40" />
        <Iskelet className="h-32 w-full" />
      </Kart>
    </div>
  );
}

const kartTaban =
  'flex min-h-28 flex-col items-start gap-1 rounded-buyuk border border-kenar bg-yuzey p-4 text-left';

/** Tiklanabilir (alt listeye iner) ya da salt okunur gosterge karti. */
function GostergeKarti({
  etiket,
  deger,
  alt,
  durum = 'hazir',
  yenile,
  secili,
  onClick,
  children,
}: {
  etiket: string;
  deger?: string | undefined;
  alt?: string | undefined;
  durum?: Durum;
  yenile?: () => void;
  secili?: boolean;
  onClick?: (olay: { currentTarget: HTMLElement }) => void;
  children?: ReactNode;
}) {
  const icerik = (
    <>
      <span className="text-sm font-medium text-metin-ikincil">{etiket}</span>
      {durum === 'yukleniyor' ? (
        <KartIskeleti />
      ) : durum === 'hata' ? (
        <span className="flex flex-col items-start gap-1 text-sm">
          <span role="alert">{t('rapor.bolumYuklenemedi')}</span>
        </span>
      ) : (
        <>
          <span className="text-3xl font-semibold tabular-nums">{deger ?? '—'}</span>
          {alt ? <span className="text-sm text-metin-ikincil">{alt}</span> : null}
          {children}
        </>
      )}
    </>
  );
  if (durum === 'hata') {
    return (
      <div className={kartTaban}>
        {icerik}
        {yenile ? (
          <Dugme type="button" boyut="sm" gorunum="ikincil" onClick={yenile}>
            {t('ortak.tekrarDene')}
          </Dugme>
        ) : null}
      </div>
    );
  }
  if (!onClick || durum === 'yukleniyor') {
    return <div className={kartTaban}>{icerik}</div>;
  }
  return (
    <button
      type="button"
      aria-pressed={secili ?? false}
      onClick={onClick}
      className={cn(
        kartTaban,
        'transition-colors hover:bg-yuzey-ikincil focus-visible:outline-2',
        secili ? 'border-birincil ring-1 ring-birincil' : '',
      )}
    >
      {icerik}
    </button>
  );
}

function KapaliMetni() {
  return (
    <span className="text-sm text-metin-ikincil" title={t('rapor.kapaliAciklama')}>
      {t('rapor.kapali')}
    </span>
  );
}

function OranKarti({
  etiket,
  oran,
  durum,
  yenile,
  secili,
  onClick,
}: {
  etiket: string;
  oran: { pay: number; payda: number; oran: number | null } | null | undefined;
  durum: Durum;
  yenile: () => void;
  secili: boolean;
  onClick: (olay: { currentTarget: HTMLElement }) => void;
}) {
  if (oran === null) {
    return (
      <GostergeKarti etiket={etiket} deger="—">
        <KapaliMetni />
      </GostergeKarti>
    );
  }
  return (
    <GostergeKarti
      etiket={etiket}
      deger={oran ? yuzdeYaz(oran.oran) : undefined}
      alt={
        oran
          ? oran.payda === 0
            ? t('rapor.kart.veriYok')
            : t('rapor.kart.oranAlt', { pay: oran.pay, payda: oran.payda })
          : undefined
      }
      durum={durum}
      yenile={yenile}
      secili={secili}
      onClick={onClick}
    />
  );
}

function SoruKarti({
  soru,
  durum,
  yenile,
  secili,
  onClick,
}: {
  soru:
    | {
        soru_sayisi: number;
        cevaplanan: number;
        ortalama_ilk_cevap_sn: number | null;
        medyan_ilk_cevap_sn: number | null;
      }
    | null
    | undefined;
  durum: Durum;
  yenile: () => void;
  secili: boolean;
  onClick: (olay: { currentTarget: HTMLElement }) => void;
}) {
  const etiket = t('rapor.kart.soru');
  if (soru === null) {
    return (
      <GostergeKarti etiket={etiket} deger="—">
        <KapaliMetni />
      </GostergeKarti>
    );
  }
  return (
    <GostergeKarti
      etiket={etiket}
      deger={soru ? sureYaz(soru.ortalama_ilk_cevap_sn) : undefined}
      alt={
        soru
          ? soru.soru_sayisi === 0
            ? t('rapor.kart.veriYok')
            : t('rapor.kart.soruAlt', {
                cevaplanan: soru.cevaplanan,
                toplam: soru.soru_sayisi,
                medyan: sureYaz(soru.medyan_ilk_cevap_sn),
              })
          : undefined
      }
      durum={durum}
      yenile={yenile}
      secili={secili}
      onClick={onClick}
    />
  );
}

function FinansKarti({
  kurumId,
  finans,
}: {
  kurumId: string;
  finans: ReturnType<typeof useFinansOzeti>;
}) {
  const { aylik, borclular } = finans;
  const durum =
    aylik.isPending || borclular.isPending ? 'yukleniyor' : aylik.isError ? 'hata' : 'hazir';
  const acikBakiye = (borclular.data?.ogrenciler ?? []).reduce(
    (toplam, o) => toplam + Math.max(-o.bakiye_kurus, 0),
    0,
  );
  const borcluSayisi = borclular.data?.ogrenciler.length ?? 0;
  return (
    <GostergeKarti
      etiket={t('rapor.finans.baslik')}
      deger={aylik.data ? kurusBicimle(aylik.data.toplam_kurus) : undefined}
      alt={
        aylik.data
          ? `${t('rapor.finans.buAy')} · ${t('rapor.finans.tahsilatAdedi', { n: aylik.data.tahsilat_sayisi })}`
          : undefined
      }
      durum={durum}
      yenile={() => void aylik.refetch()}
    >
      {borclular.data ? (
        <span className="text-sm">
          {t('rapor.finans.acikBakiye', {
            tutar: kurusBicimle(acikBakiye),
            n: borcluSayisi,
          })}
        </span>
      ) : null}
      <Link
        href={`/${kurumId}/finans`}
        className="mt-1 inline-flex items-center gap-1 text-sm font-medium text-birincil hover:underline"
      >
        <Wallet className="size-4" aria-hidden />
        {t('rapor.finans.ayrinti')}
      </Link>
    </GostergeKarti>
  );
}

// --- Grup ve ogretmen kirilim tablolari -----------------------------------------------------------

interface KirilimSatiri {
  id: string;
  ad: string;
  aktif: number;
  gostergeler: GostergeSatiri;
}

const SUTUNLAR: { gosterge: Gosterge; baslik: string }[] = [
  { gosterge: 'devam', baslik: 'rapor.kart.devam' },
  { gosterge: 'anladim', baslik: 'rapor.kart.anladim' },
  { gosterge: 'odev', baslik: 'rapor.kart.odev' },
  { gosterge: 'plan', baslik: 'rapor.kart.plan' },
  { gosterge: 'soru', baslik: 'rapor.kart.soru' },
];

function KirilimTablosu({
  id,
  baslik,
  ilkSutun,
  bos,
  baglanti,
  satirlar,
  dersDurumu,
  ogrenmeDurumu,
  sec,
  seciliAnahtar,
  seciliGosterge,
}: {
  id: string;
  baslik: string;
  ilkSutun: string;
  bos: string;
  baglanti: { href: string; metin: string } | undefined;
  satirlar: KirilimSatiri[];
  dersDurumu: Durum;
  ogrenmeDurumu: Durum;
  sec: (gosterge: Gosterge, satir: KirilimSatiri, olay: { currentTarget: HTMLElement }) => void;
  seciliAnahtar: string | undefined;
  seciliGosterge: Gosterge | undefined;
}) {
  const baslikId = `kirilim-${id}`;
  return (
    <Kart aria-labelledby={baslikId} className="mt-6 overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-kenar px-4 py-3">
        <h2 id={baslikId} className="text-base font-semibold">
          {baslik}
        </h2>
        {baglanti ? (
          <Link href={baglanti.href} className="text-sm font-medium text-birincil hover:underline">
            {baglanti.metin}
          </Link>
        ) : null}
      </div>
      {satirlar.length === 0 ? (
        <p className="px-4 py-5 text-sm text-metin-ikincil">{bos}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[44rem] text-left text-sm">
            <caption className="sr-only">{baslik}</caption>
            <thead className="text-metin-ikincil">
              <tr className="border-b border-kenar">
                <th scope="col" className="px-4 py-2 font-medium">
                  {ilkSutun}
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  {t('rapor.kart.aktifOgrenci')}
                </th>
                {SUTUNLAR.map((s) => (
                  <th key={s.gosterge} scope="col" className="px-3 py-2 text-right font-medium">
                    {t(s.baslik as 'rapor.kart.devam')}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {satirlar.map((s) => {
                const seciliSatir = seciliAnahtar === s.id;
                const hucreler: { gosterge: Gosterge; metin: string | null; durum: Durum }[] = [
                  {
                    gosterge: 'devam',
                    metin: s.gostergeler.devam ? yuzdeYaz(s.gostergeler.devam.oran) : null,
                    durum: dersDurumu,
                  },
                  {
                    gosterge: 'anladim',
                    metin: s.gostergeler.anladim ? yuzdeYaz(s.gostergeler.anladim.oran) : null,
                    durum: dersDurumu,
                  },
                  {
                    gosterge: 'odev',
                    metin: s.gostergeler.odev ? yuzdeYaz(s.gostergeler.odev.oran) : null,
                    durum: ogrenmeDurumu,
                  },
                  {
                    gosterge: 'plan',
                    metin: s.gostergeler.plan ? yuzdeYaz(s.gostergeler.plan.oran) : null,
                    durum: ogrenmeDurumu,
                  },
                  {
                    gosterge: 'soru',
                    metin: s.gostergeler.soru
                      ? sureYaz(s.gostergeler.soru.ortalama_ilk_cevap_sn)
                      : null,
                    durum: ogrenmeDurumu,
                  },
                ];
                return (
                  <tr key={s.id} className="border-b border-kenar last:border-0">
                    <th scope="row" className="px-4 py-2.5 font-medium">
                      {s.ad}
                    </th>
                    <td className="px-3 py-2.5 text-right">
                      <SayiTusu
                        metin={String(s.aktif)}
                        etiket={`${t('rapor.kart.aktifOgrenci')}, ${s.ad}`}
                        secili={seciliSatir && seciliGosterge === 'aktif'}
                        onClick={(olay) => {
                          sec('aktif', s, olay);
                        }}
                      />
                    </td>
                    {hucreler.map((h) => (
                      <td key={h.gosterge} className="px-3 py-2.5 text-right">
                        {h.durum === 'yukleniyor' ? (
                          <Iskelet className="ml-auto h-5 w-10" />
                        ) : h.metin === null ? (
                          <span className="text-metin-ikincil">—</span>
                        ) : (
                          <SayiTusu
                            metin={h.metin}
                            etiket={`${t(`rapor.gosterge.${h.gosterge}`)}, ${s.ad}`}
                            secili={seciliSatir && seciliGosterge === h.gosterge}
                            onClick={(olay) => {
                              sec(h.gosterge, s, olay);
                            }}
                          />
                        )}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Kart>
  );
}

/** Tablodaki tiklanabilir sayi: altindaki listeyi acar. */
function SayiTusu({
  metin,
  etiket,
  secili,
  onClick,
}: {
  metin: string;
  etiket: string;
  secili: boolean;
  onClick: (olay: { currentTarget: HTMLElement }) => void;
}) {
  return (
    <button
      type="button"
      aria-label={`${etiket}: ${metin}`}
      aria-pressed={secili}
      onClick={onClick}
      className={cn(
        '-mx-2 inline-flex min-h-9 min-w-11 items-center justify-end rounded-orta px-2 font-medium tabular-nums underline decoration-dotted underline-offset-4 hover:bg-yuzey-ikincil',
        secili ? 'bg-birincil-yumusak' : '',
      )}
    >
      {metin}
    </button>
  );
}
