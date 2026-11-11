'use client';

import { DersIslemYanitSema, type DersDetaySema } from '@kopru/contracts';
import { t } from '@kopru/i18n';
import { useMutation } from '@tanstack/react-query';
import { CalendarClock, ExternalLink, MapPin, RefreshCw, Repeat } from 'lucide-react';
import { useState, type SyntheticEvent } from 'react';
import type { z } from 'zod';

import type { TelafiKaynagi } from './ders-formu';
import { cakisanlariOku, useDersDetayi, useDersYenile, type CakisanDers } from './ders-verisi';

import { DersGeriBildirimi } from '@/components/geri-bildirim/ders-geri-bildirimi';
import { HataDurumu } from '@/components/hata-durumu';
import { basari, type Bildirim } from '@/components/hesap/ortak';
import { DersKayitlari } from '@/components/kayit/ders-kayitlari';
import { Alan, KapsamSecimi, Satir, type Kapsam } from '@/components/operasyon/ortak';
import { Dugme } from '@/components/ui/button';
import { Girdi } from '@/components/ui/input';
import { Iskelet } from '@/components/ui/kart';
import { Pencere } from '@/components/ui/pencere';
import { Rozet } from '@/components/ui/rozet';
import { Secim } from '@/components/ui/secim';
import { Uyari } from '@/components/ui/uyari';
import { useKurum } from '@/kurum/baglam';
import { hataMesaji, UygulamaHatasi } from '@/lib/api';
import { bransAdi } from '@/lib/bransler';
import { dersIstek } from '@/lib/hesap-istek';
import type { GrupSecenegi } from '@/lib/operasyon-verisi';
import { gunEtiketi, saatAraligi, yerelSaat, yerelTarih } from '@/lib/saat';

type Gorunum = 'ozet' | 'tasi' | 'duzenle' | 'iptal';
type DersDetayi = z.infer<typeof DersDetaySema>;

export interface AyrintiOrtak {
  kurumId: string;
  saatDilimi: string;
  grupAdlari: ReadonlyMap<string, GrupSecenegi>;
  ogretmenAdlari: ReadonlyMap<string, string>;
  /** Yazma yetkisi (ogrenci salt okunur). */
  yazabilir: boolean;
  yonetim: boolean;
  yoklamaAcik: boolean;
}

export function DersAyrintisi({
  dersId,
  kapat,
  yoklamaAl,
  telafiEkle,
  bildir,
  ...ortak
}: AyrintiOrtak & {
  dersId: string | null;
  kapat: () => void;
  yoklamaAl: (dersId: string) => void;
  telafiEkle: (kaynak: TelafiKaynagi) => void;
  bildir: (b: Bildirim) => void;
}) {
  return (
    <Pencere
      acik={dersId !== null}
      degisti={(a) => {
        if (!a) kapat();
      }}
      genis
      baslik={t('operasyon.takvim.ayrinti.baslik')}
    >
      {dersId ? (
        <Icerik
          {...ortak}
          dersId={dersId}
          kapat={kapat}
          yoklamaAl={yoklamaAl}
          telafiEkle={telafiEkle}
          bildir={bildir}
        />
      ) : null}
    </Pencere>
  );
}

function guvenliBaglanti(url: string | null): string | null {
  return url && /^https?:\/\//i.test(url) ? url : null;
}

function Icerik({
  dersId,
  kapat,
  yoklamaAl,
  telafiEkle,
  bildir,
  ...ortak
}: AyrintiOrtak & {
  dersId: string;
  kapat: () => void;
  yoklamaAl: (dersId: string) => void;
  telafiEkle: (kaynak: TelafiKaynagi) => void;
  bildir: (b: Bildirim) => void;
}) {
  const [gorunum, setGorunum] = useState<Gorunum>('ozet');
  const q = useDersDetayi(ortak.kurumId, dersId);

  if (q.isPending) {
    return (
      <div
        role="status"
        aria-label={t('operasyon.ortak.yukleniyor')}
        className="flex flex-col gap-3"
      >
        <Iskelet className="h-6 w-2/3" />
        <Iskelet className="h-6 w-1/2" />
        <Iskelet className="h-24 w-full" />
      </div>
    );
  }
  if (q.isError) {
    return (
      <HataDurumu
        baslik={t('operasyon.takvim.ayrinti.yuklenemedi')}
        aciklama={hataMesaji(q.error)}
        tekrarDene={() => void q.refetch()}
        className="py-6"
      />
    );
  }
  const ders = q.data;
  const bitir = (b: Bildirim) => {
    bildir(b);
    kapat();
  };
  if (gorunum === 'ozet') {
    return (
      <Ozet
        ders={ders}
        {...ortak}
        git={setGorunum}
        yoklamaAl={() => {
          kapat();
          yoklamaAl(ders.id);
        }}
        telafiEkle={() => {
          kapat();
          telafiEkle({
            dersId: ders.id,
            grupId: ders.grup_id,
            brans: ders.brans_kodu,
            ogretmenId: ders.ogretmen_id,
          });
        }}
      />
    );
  }
  const geri = () => {
    setGorunum('ozet');
  };
  if (gorunum === 'tasi') return <TasiFormu ders={ders} {...ortak} geri={geri} bitti={bitir} />;
  if (gorunum === 'duzenle')
    return <DuzenleFormu ders={ders} {...ortak} geri={geri} bitti={bitir} />;
  return <IptalFormu ders={ders} {...ortak} geri={geri} bitti={bitir} />;
}

function Ozet({
  ders,
  kurumId,
  saatDilimi,
  grupAdlari,
  ogretmenAdlari,
  yazabilir,
  yoklamaAcik,
  git,
  yoklamaAl,
  telafiEkle,
}: AyrintiOrtak & {
  ders: DersDetayi;
  git: (g: Gorunum) => void;
  yoklamaAl: () => void;
  telafiEkle: () => void;
}) {
  const { rol, acikModuller } = useKurum();
  const [simdi] = useState(() => Date.now());
  const personel = rol !== 'ogrenci';
  const gun = yerelTarih(ders.baslangic_at, saatDilimi);
  const baglanti = guvenliBaglanti(ders.online_baglanti);
  const grup = grupAdlari.get(ders.grup_id);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Rozet
          ton={ders.durum === 'iptal' ? 'notr' : ders.durum === 'tamamlandi' ? 'basari' : 'bilgi'}
        >
          {t(`operasyon.takvim.durum.${ders.durum}`)}
        </Rozet>
        {ders.telafi ? <Rozet ton="notr">{t('operasyon.takvim.rozet.telafi')}</Rozet> : null}
        {ders.gec_iptal ? <Rozet ton="uyari">{t('operasyon.takvim.rozet.gecIptal')}</Rozet> : null}
      </div>
      <dl className="flex flex-col gap-2.5">
        <Satir etiket={t('operasyon.takvim.ayrinti.tarih')}>
          <span className="flex items-center gap-2">
            <CalendarClock className="size-4 shrink-0" aria-hidden />
            {gunEtiketi(gun)}, {saatAraligi(ders.baslangic_at, ders.bitis_at, saatDilimi)}
          </span>
        </Satir>
        <Satir etiket={t('operasyon.takvim.ayrinti.grup')}>
          {grup?.etiket ?? bransAdi(ders.brans_kodu)}
        </Satir>
        {ders.baslik ? <Satir etiket={t('operasyon.takvim.form.konu')}>{ders.baslik}</Satir> : null}
        <Satir etiket={t('operasyon.takvim.ayrinti.brans')}>{bransAdi(ders.brans_kodu)}</Satir>
        {ogretmenAdlari.get(ders.ogretmen_id) ? (
          <Satir etiket={t('operasyon.takvim.ayrinti.ogretmen')}>
            {ogretmenAdlari.get(ders.ogretmen_id)}
          </Satir>
        ) : null}
        {baglanti ? (
          <Satir etiket={t('operasyon.takvim.ayrinti.online')}>
            <a
              href={baglanti}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-birincil underline underline-offset-2"
            >
              {t('operasyon.takvim.ayrinti.baglantiAc')}
              <ExternalLink className="size-3.5" aria-hidden />
            </a>
          </Satir>
        ) : null}
        {ders.yer ? (
          <Satir etiket={t('operasyon.takvim.ayrinti.yer')}>
            <span className="flex items-center gap-1.5">
              <MapPin className="size-4 shrink-0" aria-hidden />
              {ders.yer}
            </span>
          </Satir>
        ) : null}
        {ders.katilimcilar.length > 0 ? (
          <Satir etiket={t('operasyon.takvim.ayrinti.katilimci')}>
            {ders.katilimcilar.map((k) => k.gorunen_ad ?? t('operasyon.ortak.adsiz')).join(', ')}
          </Satir>
        ) : null}
      </dl>
      {ders.durum === 'iptal' ? (
        <p className="text-sm text-metin-ikincil">
          {ders.iptal_kaynagi
            ? t(`operasyon.takvim.ayrinti.iptalKaynagi.${ders.iptal_kaynagi}`)
            : null}
          {ders.iptal_nedeni
            ? ` · ${t('operasyon.takvim.ayrinti.iptalNedeni', { neden: ders.iptal_nedeni })}`
            : ''}
        </p>
      ) : null}
      {ders.seri_id ? (
        <p className="flex items-center gap-2 text-sm text-metin-ikincil">
          <Repeat className="size-4" aria-hidden />
          {t('operasyon.takvim.ayrinti.seri')}
        </p>
      ) : null}

      {yazabilir ? (
        <div className="flex flex-wrap gap-2 border-t border-kenar pt-4">
          {ders.durum !== 'iptal' && yoklamaAcik ? (
            <Dugme onClick={yoklamaAl}>
              {ders.durum === 'tamamlandi'
                ? t('operasyon.takvim.ayrinti.yoklamayiDuzelt')
                : t('operasyon.takvim.ayrinti.yoklamaAl')}
            </Dugme>
          ) : null}
          {ders.durum === 'planli' ? (
            <>
              <Dugme
                gorunum="ikincil"
                onClick={() => {
                  git('tasi');
                }}
              >
                {t('operasyon.takvim.ayrinti.tasi')}
              </Dugme>
              <Dugme
                gorunum="ikincil"
                onClick={() => {
                  git('duzenle');
                }}
              >
                {t('operasyon.takvim.ayrinti.duzenle')}
              </Dugme>
            </>
          ) : null}
          {ders.durum !== 'iptal' ? (
            <Dugme
              gorunum="ikincil"
              onClick={() => {
                git('iptal');
              }}
            >
              {t('operasyon.takvim.ayrinti.iptalEt')}
            </Dugme>
          ) : (
            <Dugme gorunum="ikincil" onClick={telafiEkle}>
              {t('operasyon.takvim.ayrinti.telafiEkle')}
            </Dugme>
          )}
        </div>
      ) : null}
      {personel && acikModuller.includes('kayitlar') ? (
        <DersKayitlari
          kurumId={kurumId}
          dersId={ders.id}
          brans={ders.brans_kodu}
          katilimcilar={ders.katilimcilar}
          iptal={ders.durum === 'iptal'}
        />
      ) : null}
      {personel &&
      acikModuller.includes('geri_bildirim') &&
      ders.durum !== 'iptal' &&
      Date.parse(ders.bitis_at) <= simdi ? (
        <DersGeriBildirimi kurumId={kurumId} dersId={ders.id} />
      ) : null}
    </div>
  );
}

// --- Ortak islem govdesi ------------------------------------------------------------------------

function SurumUyarisi({ hata, yenile }: { hata: unknown; yenile: () => void }) {
  if (!(hata instanceof UygulamaHatasi) || hata.kod !== 'surum_cakismasi') return null;
  return (
    <div role="alert" className="flex flex-col gap-2 rounded-orta bg-uyari-yumusak p-3 text-sm">
      <p>{t('operasyon.takvim.ayrinti.degismis')}</p>
      <Dugme type="button" boyut="sm" gorunum="ikincil" className="self-start" onClick={yenile}>
        <RefreshCw aria-hidden />
        {t('operasyon.takvim.ayrinti.yenile')}
      </Dugme>
    </div>
  );
}

function useIslem({
  kurumId,
  dersId,
  yol,
  yontem,
  bitti,
  mesaj,
}: {
  kurumId: string;
  dersId: string;
  yol: string;
  yontem: 'POST' | 'PATCH';
  bitti: (b: Bildirim) => void;
  mesaj: (etkilenen: number) => string;
}) {
  const yenile = useDersYenile(kurumId);
  const [cakisma, setCakisma] = useState<CakisanDers[] | null>(null);
  const mut = useMutation({
    mutationFn: (govde: Record<string, unknown>) =>
      dersIstek(`kurumlar/${kurumId}/dersler/${dersId}${yol}`, {
        yontem,
        govde,
        sema: DersIslemYanitSema,
      }),
    onSuccess: (s) => {
      void yenile();
      bitti(basari(mesaj(s.etkilenen_ders_idleri.length)));
    },
    onError: (hata) => {
      setCakisma(cakisanlariOku(hata));
    },
  });
  return { mut, cakisma, sifirlaCakisma: () => setCakisma(null), yenile };
}

function Dugmeler({
  geri,
  bekliyor,
  etiket,
  tehlikeli = false,
}: {
  geri: () => void;
  bekliyor: boolean;
  etiket: string;
  tehlikeli?: boolean;
}) {
  return (
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <Dugme type="button" gorunum="ikincil" onClick={geri} disabled={bekliyor}>
        {t('operasyon.ortak.geri')}
      </Dugme>
      <Dugme type="submit" gorunum={tehlikeli ? 'tehlike' : 'birincil'} disabled={bekliyor}>
        {bekliyor ? t('operasyon.ortak.kaydediliyor') : etiket}
      </Dugme>
    </div>
  );
}

function CakismaKutusu({ cakisma, saatDilimi }: { cakisma: CakisanDers[]; saatDilimi: string }) {
  return (
    <div role="alert" className="rounded-orta border border-uyari bg-uyari-yumusak p-3 text-sm">
      <p className="font-semibold">{t('operasyon.takvim.cakisma.baslik')}</p>
      <p>{t('operasyon.takvim.cakisma.aciklama')}</p>
      <ul className="mt-1 list-disc pl-5">
        {cakisma.map((c) => (
          <li key={c.id}>
            {t('operasyon.takvim.cakisma.satir', {
              tarih: gunEtiketi(yerelTarih(c.baslangic_at, saatDilimi)),
              saat: saatAraligi(c.baslangic_at, c.bitis_at, saatDilimi),
            })}
          </li>
        ))}
      </ul>
    </div>
  );
}

// --- Tasi --------------------------------------------------------------------------------------

function TasiFormu({
  ders,
  kurumId,
  saatDilimi,
  geri,
  bitti,
}: AyrintiOrtak & { ders: DersDetayi; geri: () => void; bitti: (b: Bildirim) => void }) {
  const [kapsam, setKapsam] = useState<Kapsam>('yalniz_bu');
  const ilkTarih = yerelTarih(ders.baslangic_at, saatDilimi);
  const ilkSaat = yerelSaat(ders.baslangic_at, saatDilimi);
  const [tarih, setTarih] = useState(ilkTarih);
  const [saat, setSaat] = useState(ilkSaat);
  const [hata, setHata] = useState<string | null>(null);
  const { mut, cakisma, sifirlaCakisma, yenile } = useIslem({
    kurumId,
    dersId: ders.id,
    yol: '/tasi',
    yontem: 'POST',
    bitti,
    mesaj: (n) =>
      n > 1
        ? t('operasyon.takvim.tasi.seriTasindi', { sayi: n })
        : t('operasyon.takvim.tasi.tasindi'),
  });
  const seriKapsami = kapsam === 'bu_ve_sonrakiler';

  const gonder = (e: SyntheticEvent) => {
    e.preventDefault();
    const tarihDegisti = !seriKapsami && tarih !== ilkTarih;
    const saatDegisti = saat !== ilkSaat;
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(saat)) {
      setHata(t('operasyon.takvim.hata.saat'));
      return;
    }
    if (!tarih) {
      setHata(t('operasyon.takvim.hata.tarih'));
      return;
    }
    if (!tarihDegisti && !saatDegisti) {
      setHata(t('operasyon.takvim.tasi.gunKapali'));
      return;
    }
    setHata(null);
    mut.mutate({
      surum: ders.surum,
      kapsam,
      ...(tarihDegisti ? { yeni_tarih: tarih } : {}),
      ...(saatDegisti ? { yeni_saat: saat } : {}),
      cakisma_onayli: cakisma !== null,
    });
  };

  return (
    <form onSubmit={gonder} noValidate className="flex flex-col gap-4">
      <h3 className="text-base font-semibold">{t('operasyon.takvim.tasi.baslik')}</h3>
      {ders.seri_id ? (
        <KapsamSecimi
          deger={kapsam}
          degisti={(k) => {
            setKapsam(k);
            if (k === 'bu_ve_sonrakiler') setTarih(ilkTarih);
            sifirlaCakisma();
          }}
          sonrakilerEtiketi={t('operasyon.takvim.kapsam.buVeSonrakilerTasi')}
        />
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Alan
          etiket={t('operasyon.takvim.tasi.tarih')}
          yardim={seriKapsami ? t('operasyon.takvim.tasi.gunKapali') : undefined}
        >
          {(o) => (
            <Girdi
              {...o}
              type="date"
              value={tarih}
              disabled={seriKapsami}
              onChange={(e) => {
                setTarih(e.target.value);
                sifirlaCakisma();
              }}
            />
          )}
        </Alan>
        <Alan etiket={t('operasyon.takvim.tasi.saat')}>
          {(o) => (
            <Girdi
              {...o}
              type="time"
              value={saat}
              onChange={(e) => {
                setSaat(e.target.value);
                sifirlaCakisma();
              }}
            />
          )}
        </Alan>
      </div>
      {cakisma ? <CakismaKutusu cakisma={cakisma} saatDilimi={saatDilimi} /> : null}
      {hata ? <Uyari>{hata}</Uyari> : null}
      {mut.isError && cakisma === null ? <Uyari>{hataMesaji(mut.error)}</Uyari> : null}
      <SurumUyarisi
        hata={mut.error}
        yenile={() => {
          void yenile();
          geri();
        }}
      />
      <Dugmeler
        geri={geri}
        bekliyor={mut.isPending}
        etiket={cakisma ? t('operasyon.takvim.cakisma.yineTasi') : t('operasyon.takvim.tasi.tasi')}
      />
    </form>
  );
}

// --- Duzenle -----------------------------------------------------------------------------------

function DuzenleFormu({
  ders,
  kurumId,
  geri,
  bitti,
}: AyrintiOrtak & { ders: DersDetayi; geri: () => void; bitti: (b: Bildirim) => void }) {
  const [kapsam, setKapsam] = useState<Kapsam>('yalniz_bu');
  const [baslik, setBaslik] = useState(ders.baslik ?? '');
  const [online, setOnline] = useState(ders.online_baglanti ?? '');
  const [yer, setYer] = useState(ders.yer ?? '');
  const [hata, setHata] = useState<string | null>(null);
  const { mut, yenile } = useIslem({
    kurumId,
    dersId: ders.id,
    yol: '',
    yontem: 'PATCH',
    bitti,
    mesaj: () => t('operasyon.takvim.duzenle.guncellendi'),
  });

  const gonder = (e: SyntheticEvent) => {
    e.preventDefault();
    if (online.trim() && !/^https?:\/\/\S+$/i.test(online.trim())) {
      setHata(t('operasyon.takvim.hata.online'));
      return;
    }
    const alan = (yeni: string, eski: string | null) => {
      const temiz = yeni.trim();
      if (temiz === (eski ?? '')) return {};
      return { value: temiz.length > 0 ? temiz : null };
    };
    const b = alan(baslik, ders.baslik);
    const o = alan(online, ders.online_baglanti);
    const y = alan(yer, ders.yer);
    if (!('value' in b) && !('value' in o) && !('value' in y)) {
      geri();
      return;
    }
    setHata(null);
    mut.mutate({
      surum: ders.surum,
      kapsam,
      ...('value' in b ? { baslik: b.value } : {}),
      ...('value' in o ? { online_baglanti: o.value } : {}),
      ...('value' in y ? { yer: y.value } : {}),
    });
  };

  return (
    <form onSubmit={gonder} noValidate className="flex flex-col gap-4">
      <h3 className="text-base font-semibold">{t('operasyon.takvim.duzenle.baslik')}</h3>
      {ders.seri_id ? <KapsamSecimi deger={kapsam} degisti={setKapsam} /> : null}
      <Alan etiket={t('operasyon.takvim.form.konu')}>
        {(a) => (
          <Girdi
            {...a}
            maxLength={200}
            value={baslik}
            onChange={(e) => {
              setBaslik(e.target.value);
            }}
          />
        )}
      </Alan>
      <Alan etiket={t('operasyon.takvim.form.online')}>
        {(a) => (
          <Girdi
            {...a}
            type="url"
            placeholder="https://"
            value={online}
            onChange={(e) => {
              setOnline(e.target.value);
            }}
          />
        )}
      </Alan>
      <Alan etiket={t('operasyon.takvim.form.yer')}>
        {(a) => (
          <Girdi
            {...a}
            maxLength={500}
            value={yer}
            onChange={(e) => {
              setYer(e.target.value);
            }}
          />
        )}
      </Alan>
      {hata ? <Uyari>{hata}</Uyari> : null}
      {mut.isError ? <Uyari>{hataMesaji(mut.error)}</Uyari> : null}
      <SurumUyarisi
        hata={mut.error}
        yenile={() => {
          void yenile();
          geri();
        }}
      />
      <Dugmeler
        geri={geri}
        bekliyor={mut.isPending}
        etiket={t('operasyon.takvim.duzenle.kaydet')}
      />
    </form>
  );
}

// --- Iptal -------------------------------------------------------------------------------------

function IptalFormu({
  ders,
  kurumId,
  grupAdlari,
  yonetim,
  geri,
  bitti,
}: AyrintiOrtak & { ders: DersDetayi; geri: () => void; bitti: (b: Bildirim) => void }) {
  const birebir = grupAdlari.get(ders.grup_id)?.tur === 'birebir';
  const [kapsam, setKapsam] = useState<Kapsam>('yalniz_bu');
  const [kaynak, setKaynak] = useState<'ogretmen' | 'ogrenci' | 'yonetici'>(
    yonetim ? 'yonetici' : 'ogretmen',
  );
  const [neden, setNeden] = useState('');
  const { mut, yenile } = useIslem({
    kurumId,
    dersId: ders.id,
    yol: '/iptal',
    yontem: 'POST',
    bitti,
    mesaj: (n) =>
      n > 1
        ? t('operasyon.takvim.iptal.seriIptal', { sayi: n })
        : t('operasyon.takvim.iptal.iptalEdildi'),
  });
  // Yoklamasi alinmis ders yalniz tek basina iptal edilir.
  const seriSecilebilir = ders.seri_id !== null && ders.durum === 'planli';

  const gonder = (e: SyntheticEvent) => {
    e.preventDefault();
    mut.mutate({
      surum: ders.surum,
      kapsam: seriSecilebilir ? kapsam : 'yalniz_bu',
      iptal_kaynagi: kaynak,
      ...(neden.trim() ? { iptal_nedeni: neden.trim() } : {}),
    });
  };

  return (
    <form onSubmit={gonder} noValidate className="flex flex-col gap-4">
      <h3 className="text-base font-semibold">{t('operasyon.takvim.iptal.baslik')}</h3>
      {seriSecilebilir ? <KapsamSecimi deger={kapsam} degisti={setKapsam} /> : null}
      <Alan etiket={t('operasyon.takvim.iptal.kaynak')}>
        {(a) => (
          <Secim
            {...a}
            value={kaynak}
            onChange={(e) => {
              setKaynak(e.target.value as typeof kaynak);
            }}
          >
            <option value="ogretmen">{t('operasyon.takvim.iptal.kaynaklar.ogretmen')}</option>
            {birebir ? (
              <option value="ogrenci">{t('operasyon.takvim.iptal.kaynaklar.ogrenci')}</option>
            ) : null}
            <option value="yonetici">{t('operasyon.takvim.iptal.kaynaklar.yonetici')}</option>
          </Secim>
        )}
      </Alan>
      <Alan etiket={t('operasyon.takvim.iptal.neden')}>
        {(a) => (
          <Girdi
            {...a}
            maxLength={500}
            value={neden}
            onChange={(e) => {
              setNeden(e.target.value);
            }}
          />
        )}
      </Alan>
      <p className="text-sm text-metin-ikincil">{t('operasyon.takvim.iptal.uyari')}</p>
      {mut.isError ? <Uyari>{hataMesaji(mut.error)}</Uyari> : null}
      <SurumUyarisi
        hata={mut.error}
        yenile={() => {
          void yenile();
          geri();
        }}
      />
      <Dugmeler
        geri={geri}
        bekliyor={mut.isPending}
        etiket={t('operasyon.takvim.iptal.onayla')}
        tehlikeli
      />
    </form>
  );
}
