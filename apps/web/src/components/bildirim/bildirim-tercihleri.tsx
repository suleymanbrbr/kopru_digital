'use client';

import {
  BILDIRIM_DERS_HATIRLATMA_DK,
  BILDIRIM_KATEGORILERI,
  type BildirimAyarlari,
  type BildirimKanal,
  type BildirimKategori,
} from '@kopru/contracts';
import { t, type MessageKey } from '@kopru/i18n';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useId, useState } from 'react';

import { KATEGORI_IKONU } from './kategori-ikon';

import { HataDurumu } from '@/components/hata-durumu';
import { SayfaBasligi } from '@/components/kabuk/sayfa-basligi';
import { dugmeStili } from '@/components/ui/button';
import { OnayKutusu } from '@/components/ui/checkbox';
import { Etiket, Girdi } from '@/components/ui/input';
import { Iskelet, Kart } from '@/components/ui/kart';
import { Secim } from '@/components/ui/secim';
import { Uyari } from '@/components/ui/uyari';
import { useKurum } from '@/kurum/baglam';
import { hataMesaji } from '@/lib/api';
import {
  useAyarlar,
  useAyarlarGuncelle,
  useTercihGuncelle,
  useTercihler,
} from '@/lib/bildirim/veri';
import { cn } from '@/lib/cn';

/** Web'de gosterilen kanallar: gelen kutusu (kilitli), anlik bildirim (mobilde gelir) ve e-posta (yalniz hesap/abonelik). */
const KANALLAR = ['kutu', 'push', 'eposta'] as const satisfies readonly BildirimKanal[];
/** E-posta yalniz hesap ve abonelik bildirimleri icindir (sartname "Bildirimler"); diger kategorilerde gosterilmez. */
const EPOSTALI: readonly BildirimKategori[] = ['abonelik', 'sistem'];
const GUNLER = [1, 2, 3, 4, 5, 6, 7] as const;
const gunAnahtari = (g: number) => `g${String(g)}`;

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export function BildirimTercihleri() {
  const { uyelik } = useKurum();
  const kurumId = uyelik.kurumId;
  return (
    <>
      <SayfaBasligi baslik={t('bildirim.ayarlar.baslik')} aciklama={t('bildirim.ayarlar.aciklama')}>
        <Link href={`/${kurumId}/bildirimler`} className={dugmeStili({ gorunum: 'ikincil' })}>
          <ArrowLeft aria-hidden />
          {t('bildirim.ayarlar.geri')}
        </Link>
      </SayfaBasligi>
      <div className="flex flex-col gap-6">
        <TercihMatrisi kurumId={kurumId} />
        <SessizSaatler kurumId={kurumId} />
        <DersHatirlatma kurumId={kurumId} />
      </div>
    </>
  );
}

function BolumBasligi({ id, baslik, aciklama }: { id: string; baslik: string; aciklama?: string }) {
  return (
    <div className="mb-3">
      <h2 id={id} className="text-lg font-semibold">
        {baslik}
      </h2>
      {aciklama ? <p className="mt-1 text-sm text-metin-ikincil">{aciklama}</p> : null}
    </div>
  );
}

// --- Kategori x kanal matrisi ---------------------------------------------------------------------

function TercihMatrisi({ kurumId }: { kurumId: string }) {
  const sorgu = useTercihler(kurumId);
  const yaz = useTercihGuncelle(kurumId);
  const baslikId = useId();

  if (sorgu.isPending) {
    return (
      <Kart className="p-5" aria-labelledby={baslikId}>
        <div role="status" aria-label={t('ortak.yukleniyor')} className="flex flex-col gap-3">
          <Iskelet className="h-6 w-1/3" />
          {Array.from({ length: 6 }, (_, i) => (
            <Iskelet key={i} className="h-10 w-full" />
          ))}
        </div>
      </Kart>
    );
  }
  if (sorgu.isError) {
    return (
      <Kart>
        <HataDurumu
          baslik={t('bildirim.ayarlar.yuklenemedi')}
          aciklama={hataMesaji(sorgu.error)}
          tekrarDene={() => {
            void sorgu.refetch();
          }}
        />
      </Kart>
    );
  }

  const hucre = (kategori: BildirimKategori, kanal: BildirimKanal) =>
    sorgu.data.tercihler.find((x) => x.kategori === kategori && x.kanal === kanal);

  return (
    <Kart className="p-5" aria-labelledby={baslikId}>
      <BolumBasligi id={baslikId} baslik={t('bildirim.ayarlar.matris')} />
      {yaz.isError ? <Uyari className="mb-3">{t('bildirim.ayarlar.kaydedilemedi')}</Uyari> : null}
      <div className="-mx-2 overflow-x-auto px-2">
        <table className="w-full min-w-[19rem] border-collapse text-sm">
          <caption className="sr-only">{t('bildirim.ayarlar.matris')}</caption>
          <thead>
            <tr className="text-left align-bottom">
              <th scope="col" className="pb-2 pr-2 font-medium text-metin-ikincil">
                {t('bildirim.ayarlar.kategori')}
              </th>
              {KANALLAR.map((kanal) => (
                <th key={kanal} scope="col" className="w-20 px-1 pb-2 text-center font-medium">
                  <span className="block">{t(`bildirim.kanal.${kanal}`)}</span>
                  <span className="block text-xs font-normal text-metin-ikincil">
                    {t(`bildirim.ayarlar.${kanal}Aciklama` as MessageKey)}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {BILDIRIM_KATEGORILERI.map((kategori) => {
              const Ikon = KATEGORI_IKONU[kategori];
              return (
                <tr key={kategori} className="border-t border-kenar">
                  <th scope="row" className="py-1 pr-2 text-left font-medium">
                    <span className="flex items-center gap-2.5">
                      <Ikon className="size-4 shrink-0 text-metin-ikincil" aria-hidden />
                      {t(`bildirim.kategori.${kategori}`)}
                    </span>
                  </th>
                  {KANALLAR.map((kanal) => {
                    const h = hucre(kategori, kanal);
                    const uygulanir = kanal !== 'eposta' || EPOSTALI.includes(kategori);
                    return (
                      <td key={kanal} className="px-1 py-1 text-center">
                        {h && uygulanir ? (
                          <span className="inline-flex size-11 items-center justify-center">
                            <OnayKutusu
                              checked={h.acik}
                              disabled={h.kilitli}
                              data-testid={`tercih-${kategori}-${kanal}`}
                              aria-label={t('bildirim.ayarlar.anahtarEtiketi', {
                                kategori: t(`bildirim.kategori.${kategori}`),
                                kanal: t(`bildirim.kanal.${kanal}`),
                              })}
                              title={h.kilitli ? t('bildirim.ayarlar.kilitliAciklama') : undefined}
                              onCheckedChange={(deger) => {
                                yaz.mutate({ kategori, kanal, acik: deger === true });
                              }}
                              className={cn(h.kilitli && 'cursor-not-allowed opacity-60')}
                            />
                          </span>
                        ) : (
                          <span
                            aria-label={t('bildirim.ayarlar.uygulanmaz')}
                            className="text-metin-ikincil"
                          >
                            —
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-sm text-metin-ikincil">{t('bildirim.ayarlar.webdeYok')}</p>
    </Kart>
  );
}

// --- Sessiz saatler -------------------------------------------------------------------------------

function SessizSaatler({ kurumId }: { kurumId: string }) {
  const sorgu = useAyarlar(kurumId);
  const yaz = useAyarlarGuncelle(kurumId);
  const baslikId = useId();

  if (sorgu.isPending) {
    return (
      <Kart className="p-5" aria-labelledby={baslikId}>
        <div role="status" aria-label={t('ortak.yukleniyor')} className="flex flex-col gap-3">
          <Iskelet className="h-6 w-1/3" />
          <Iskelet className="h-11 w-full" />
        </div>
      </Kart>
    );
  }
  if (sorgu.isError) {
    return (
      <Kart>
        <HataDurumu
          baslik={t('bildirim.ayarlar.yuklenemedi')}
          aciklama={hataMesaji(sorgu.error)}
          tekrarDene={() => {
            void sorgu.refetch();
          }}
        />
      </Kart>
    );
  }
  return (
    <SessizSaatForm
      ayar={sorgu.data}
      baslikId={baslikId}
      hata={yaz.isError}
      kaydet={(d) => {
        yaz.mutate(d);
      }}
    />
  );
}

function SessizSaatForm({
  ayar,
  baslikId,
  hata,
  kaydet,
}: {
  ayar: BildirimAyarlari;
  baslikId: string;
  hata: boolean;
  kaydet: (d: Partial<BildirimAyarlari>) => void;
}) {
  const acik = ayar.sessiz_gunler.length > 0;
  const [baslangic, setBaslangic] = useState(ayar.sessiz_baslangic);
  const [bitis, setBitis] = useState(ayar.sessiz_bitis);
  // Sunucudaki (iyimser ya da geri alinmis) deger degisince taslak saatler ona esitlenir.
  const sunucuSaatleri = `${ayar.sessiz_baslangic}|${ayar.sessiz_bitis}`;
  const [gorulenSaatler, setGorulenSaatler] = useState(sunucuSaatleri);
  if (gorulenSaatler !== sunucuSaatleri) {
    setGorulenSaatler(sunucuSaatleri);
    setBaslangic(ayar.sessiz_baslangic);
    setBitis(ayar.sessiz_bitis);
  }
  const ayni = HHMM.test(baslangic) && baslangic === bitis;
  const baslangicId = useId();
  const bitisId = useId();
  const anahtarId = useId();

  const saatiKaydet = (b: string, s: string) => {
    if (!HHMM.test(b) || !HHMM.test(s) || b === s) return;
    if (b === ayar.sessiz_baslangic && s === ayar.sessiz_bitis) return;
    kaydet({ sessiz_baslangic: b, sessiz_bitis: s });
  };

  return (
    <Kart className="p-5" aria-labelledby={baslikId}>
      <BolumBasligi
        id={baslikId}
        baslik={t('bildirim.ayarlar.sessiz.baslik')}
        aciklama={t('bildirim.ayarlar.sessiz.aciklama')}
      />
      {hata ? <Uyari className="mb-3">{t('bildirim.ayarlar.kaydedilemedi')}</Uyari> : null}
      <div className="flex items-center gap-3">
        <OnayKutusu
          id={anahtarId}
          checked={acik}
          data-testid="sessiz-acik"
          onCheckedChange={(deger) => {
            kaydet({ sessiz_gunler: deger === true ? [...GUNLER] : [] });
          }}
        />
        <Etiket htmlFor={anahtarId} className="text-base">
          {t('bildirim.ayarlar.sessiz.baslik')}
        </Etiket>
      </div>

      <div
        className={cn(
          'mt-4 grid max-w-sm grid-cols-2 gap-3',
          !acik && 'pointer-events-none opacity-50',
        )}
      >
        <div className="flex flex-col gap-1.5">
          <Etiket htmlFor={baslangicId}>{t('bildirim.ayarlar.sessiz.baslangic')}</Etiket>
          <Girdi
            id={baslangicId}
            type="time"
            disabled={!acik}
            value={baslangic}
            aria-invalid={ayni || undefined}
            onChange={(e) => {
              setBaslangic(e.target.value);
              saatiKaydet(e.target.value, bitis);
            }}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Etiket htmlFor={bitisId}>{t('bildirim.ayarlar.sessiz.bitis')}</Etiket>
          <Girdi
            id={bitisId}
            type="time"
            disabled={!acik}
            value={bitis}
            aria-invalid={ayni || undefined}
            onChange={(e) => {
              setBitis(e.target.value);
              saatiKaydet(baslangic, e.target.value);
            }}
          />
        </div>
      </div>
      {ayni ? (
        <p role="alert" className="mt-2 text-sm text-hata">
          {t('bildirim.ayarlar.sessiz.ayniOlamaz')}
        </p>
      ) : null}

      <fieldset className={cn('mt-4', !acik && 'opacity-50')} disabled={!acik}>
        <legend className="text-sm font-medium">{t('bildirim.ayarlar.sessiz.gunler')}</legend>
        <p className="mt-0.5 text-sm text-metin-ikincil">
          {t('bildirim.ayarlar.sessiz.gunlerAciklama')}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {GUNLER.map((gun) => {
            const secili = ayar.sessiz_gunler.includes(gun);
            return (
              <button
                key={gun}
                type="button"
                aria-pressed={secili}
                aria-label={t(`bildirim.ayarlar.sessiz.gun.${gunAnahtari(gun)}` as MessageKey)}
                data-testid={`sessiz-gun-${String(gun)}`}
                onClick={() => {
                  kaydet({
                    sessiz_gunler: secili
                      ? ayar.sessiz_gunler.filter((g) => g !== gun)
                      : [...ayar.sessiz_gunler, gun].sort((a, b) => a - b),
                  });
                }}
                className={cn(
                  'flex size-11 items-center justify-center rounded-full border text-sm font-medium transition-colors',
                  secili
                    ? 'border-birincil bg-birincil-yumusak text-metin'
                    : 'border-kenar bg-yuzey text-metin-ikincil hover:bg-yuzey-ikincil',
                )}
              >
                {t(`bildirim.ayarlar.sessiz.gunKisa.${gunAnahtari(gun)}` as MessageKey)}
              </button>
            );
          })}
        </div>
      </fieldset>
      <p className="mt-4 text-sm text-metin-ikincil">
        {t('bildirim.ayarlar.sessiz.saatDilimi', { dilim: ayar.saat_dilimi })}
      </p>
    </Kart>
  );
}

// --- Ders hatirlatma ------------------------------------------------------------------------------

function DersHatirlatma({ kurumId }: { kurumId: string }) {
  const sorgu = useAyarlar(kurumId);
  const yaz = useAyarlarGuncelle(kurumId);
  const baslikId = useId();
  const secimId = useId();
  if (!sorgu.data) return null;
  const secenek = (dk: number): string =>
    dk === 0
      ? t('bildirim.ayarlar.hatirlatma.kapali')
      : t(`bildirim.ayarlar.hatirlatma.dk${String(dk)}` as MessageKey);
  return (
    <Kart className="p-5" aria-labelledby={baslikId}>
      <BolumBasligi
        id={baslikId}
        baslik={t('bildirim.ayarlar.hatirlatma.baslik')}
        aciklama={t('bildirim.ayarlar.hatirlatma.aciklama')}
      />
      {yaz.isError ? <Uyari className="mb-3">{t('bildirim.ayarlar.kaydedilemedi')}</Uyari> : null}
      <div className="flex max-w-xs flex-col gap-1.5">
        <Etiket htmlFor={secimId}>{t('bildirim.ayarlar.hatirlatma.etiket')}</Etiket>
        <Secim
          id={secimId}
          data-testid="ders-hatirlatma"
          value={String(sorgu.data.ders_hatirlatma_dk)}
          onChange={(e) => {
            const dk = Number(e.target.value);
            const gecerli = BILDIRIM_DERS_HATIRLATMA_DK.find((x) => x === dk);
            if (gecerli !== undefined) yaz.mutate({ ders_hatirlatma_dk: gecerli });
          }}
        >
          {BILDIRIM_DERS_HATIRLATMA_DK.map((dk) => (
            <option key={dk} value={dk}>
              {secenek(dk)}
            </option>
          ))}
        </Secim>
      </div>
    </Kart>
  );
}
