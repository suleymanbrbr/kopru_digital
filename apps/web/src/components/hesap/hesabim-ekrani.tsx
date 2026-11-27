'use client';

import {
  BenGuncelleYanitSema,
  SilmeDurumYanitSema,
  SilmeGeriAlYanitSema,
  SilmeKoduGonderYanitSema,
  SilmeTalebiYanitSema,
  VerilerimYanitSema,
} from '@kopru/contracts';
import { t } from '@kopru/i18n';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { basari, basarisiz, BildirimKutusu, tarihYaz, type Bildirim } from './ortak';

import { HataDurumu } from '@/components/hata-durumu';
import { SayfaBasligi } from '@/components/kabuk/sayfa-basligi';
import { Dugme } from '@/components/ui/button';
import { Etiket, Girdi } from '@/components/ui/input';
import { Kart } from '@/components/ui/kart';
import { Pencere } from '@/components/ui/pencere';
import { Uyari } from '@/components/ui/uyari';
import { useKurum } from '@/kurum/baglam';
import { hataMesaji, UygulamaHatasi } from '@/lib/api';
import { hesapIstek } from '@/lib/hesap-istek';
import { yenidenDene } from '@/lib/sayfali-sorgu';
import { useOturum } from '@/oturum/saglayici';

const ANAHTAR = ['hesap', 'silme-talebi'] as const;
type Yontem = 'otp' | 'parola';

/** Profilim: gorunen ad. Adi bos hesaplarda (OTP ile acilan) girmeye yonlendirir. */
function ProfilKarti({ bildir }: { bildir: (b: Bildirim) => void }) {
  const { kullaniciAd } = useKurum();
  const { durum, yenile } = useOturum();
  const aktifUyelikId = durum.tur === 'hazir' ? durum.oturum.aktifUyelikId : undefined;
  const [ad, setAd] = useState(kullaniciAd);
  const [hata, setHata] = useState<string | null>(null);
  const kaydet = useMutation({
    mutationFn: (yeni: string) =>
      hesapIstek('ben', {
        yontem: 'PATCH',
        govde: { gorunen_ad: yeni },
        sema: BenGuncelleYanitSema,
      }),
    onSuccess: () => {
      bildir(basari(t('hesap.profil.kaydedildi')));
      // Ad istemci oturum durumunda tutulur (kabuk, Bugun); oturum yeniden okunur.
      yenile(aktifUyelikId ? { uyelikId: aktifUyelikId } : {}).catch(() => undefined);
    },
    onError: (e) => {
      setHata(hataMesaji(e));
    },
  });
  const adsiz = kullaniciAd.trim() === '';
  return (
    <Kart className="p-5" id="profil">
      <h2 className="text-lg font-semibold">{t('hesap.profil.baslik')}</h2>
      <p className="mt-1 text-sm text-metin-ikincil">
        {adsiz ? t('hesap.profil.adUyari') : t('hesap.profil.aciklama')}
      </p>
      <form
        className="mt-4 flex max-w-md flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (ad.trim().length < 2) {
            setHata(t('hesap.profil.adKisa'));
            return;
          }
          setHata(null);
          kaydet.mutate(ad.trim());
        }}
      >
        <Etiket htmlFor="profil-ad">{t('hesap.profil.adEtiketi')}</Etiket>
        <Girdi
          id="profil-ad"
          value={ad}
          maxLength={100}
          autoComplete="name"
          placeholder={t('hesap.profil.adIpucu')}
          aria-invalid={hata !== null}
          onChange={(e) => {
            setAd(e.target.value);
            setHata(null);
          }}
        />
        {hata ? (
          <p role="alert" className="text-sm text-hata">
            {hata}
          </p>
        ) : null}
        <Dugme type="submit" className="self-start" disabled={kaydet.isPending}>
          {kaydet.isPending ? t('hesap.profil.kaydediliyor') : t('hesap.profil.kaydet')}
        </Dugme>
      </form>
    </Kart>
  );
}

/** Hesabim: kisisel veri indirme ve hesap silme (KVKK). */
export function HesabimEkrani() {
  const qc = useQueryClient();
  const [bildirim, setBildirim] = useState<Bildirim>(null);
  const [pencere, setPencere] = useState(false);
  const [yontem, setYontem] = useState<Yontem>('otp');
  const [kod, setKod] = useState('');
  const [parola, setParola] = useState('');
  const [kodGitti, setKodGitti] = useState(false);
  const [pencereHata, setPencereHata] = useState<string | null>(null);

  const sorgu = useQuery({
    queryKey: ANAHTAR,
    retry: yenidenDene,
    queryFn: () => hesapIstek('ben/silme-talebi', { sema: SilmeDurumYanitSema }),
  });
  const durum = sorgu.data;
  const talep = durum?.talep?.durum === 'beklemede' ? durum.talep : null;
  const engellendi = durum?.talep?.durum === 'engellendi';
  const yontemler = durum?.dogrulama_yontemleri ?? [];
  const aktifYontem: Yontem = yontemler.includes(yontem) ? yontem : (yontemler[0] ?? 'otp');

  const indir = useMutation({
    mutationFn: () => hesapIstek('ben/verilerim', { sema: VerilerimYanitSema }),
    onSuccess: (veri) => {
      const blob = new Blob([JSON.stringify(veri, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'verilerim.json';
      a.click();
      URL.revokeObjectURL(url);
      setBildirim(
        veri.eksik_servisler.length > 0
          ? {
              tur: 'hata',
              metin: t('hesap.kvkk.indirEksik', { servisler: veri.eksik_servisler.join(', ') }),
            }
          : basari(t('hesap.kvkk.indirildi')),
      );
    },
    onError: (e) => {
      setBildirim(basarisiz(e));
    },
  });

  const kodGonder = useMutation({
    mutationFn: () =>
      hesapIstek('ben/silme-talebi/kod-gonder', { yontem: 'POST', sema: SilmeKoduGonderYanitSema }),
    onSuccess: () => {
      setKodGitti(true);
      setPencereHata(null);
    },
    onError: (e) => {
      setPencereHata(hataMesaji(e));
    },
  });

  const talepEt = useMutation({
    mutationFn: () =>
      hesapIstek('ben/silme-talebi', {
        yontem: 'POST',
        govde: {
          dogrulama: aktifYontem === 'otp' ? { yontem: 'otp', kod } : { yontem: 'parola', parola },
          kaynak: 'web',
        },
        sema: SilmeTalebiYanitSema,
      }),
    onSuccess: async () => {
      setPencere(false);
      setKod('');
      setParola('');
      setKodGitti(false);
      setBildirim(basari(t('hesap.kvkk.talepEdildi', { gun: durum?.soguma_gun ?? 30 })));
      await qc.invalidateQueries({ queryKey: ANAHTAR });
    },
    onError: (e) => {
      setPencereHata(
        e instanceof UygulamaHatasi && e.kod === 'kod_gecersiz'
          ? t('hesap.kvkk.kodHata')
          : hataMesaji(e),
      );
    },
  });

  const geriAl = useMutation({
    mutationFn: () =>
      hesapIstek('ben/silme-talebi', { yontem: 'DELETE', sema: SilmeGeriAlYanitSema }),
    onSuccess: async () => {
      setBildirim(basari(t('hesap.kvkk.geriAlindi')));
      await qc.invalidateQueries({ queryKey: ANAHTAR });
    },
    onError: (e) => {
      setBildirim(basarisiz(e));
    },
  });

  const tekHata = sorgu.error instanceof UygulamaHatasi ? sorgu.error.istekId : undefined;
  const engeller = durum?.engeller ?? [];

  return (
    <>
      <SayfaBasligi baslik={t('hesap.kvkk.baslik')} aciklama={t('hesap.kvkk.aciklama')} />
      <div className="mb-4 empty:hidden">
        <BildirimKutusu bildirim={bildirim} />
      </div>

      <div className="flex flex-col gap-4">
        <ProfilKarti bildir={setBildirim} />
        <Kart className="p-5">
          <h2 className="text-lg font-semibold">{t('hesap.kvkk.indirBaslik')}</h2>
          <p className="mt-1 text-sm text-metin-ikincil">{t('hesap.kvkk.indirAciklama')}</p>
          <Dugme
            className="mt-4"
            gorunum="ikincil"
            disabled={indir.isPending}
            onClick={() => {
              indir.mutate();
            }}
          >
            <Download className="size-4" aria-hidden />
            {indir.isPending ? t('hesap.kvkk.indiriliyor') : t('hesap.kvkk.indir')}
          </Dugme>
        </Kart>

        <Kart className="p-5">
          <h2 className="text-lg font-semibold">{t('hesap.kvkk.silBaslik')}</h2>
          <p className="mt-1 text-sm text-metin-ikincil">{t('hesap.kvkk.silAciklama')}</p>
          {sorgu.isPending ? (
            <p role="status" className="mt-4 text-sm text-metin-ikincil">
              {t('hesap.ortak.yukleniyor')}
            </p>
          ) : sorgu.isError ? (
            <HataDurumu
              baslik={t('hesap.kvkk.yuklenemedi')}
              aciklama={hataMesaji(sorgu.error)}
              istekNo={tekHata}
              tekrarDene={() => void sorgu.refetch()}
            />
          ) : talep ? (
            <div
              className="mt-4 rounded-orta border border-kenar bg-yuzey-ikincil p-4"
              data-testid="silme-bekleyen"
            >
              <p className="font-medium">{t('hesap.kvkk.bekleyenBaslik')}</p>
              <p className="mt-1 text-sm text-metin-ikincil">
                {t('hesap.kvkk.bekleyenAciklama', { tarih: tarihYaz(talep.planlanan_at) })}
              </p>
              <Dugme
                className="mt-3"
                gorunum="ikincil"
                disabled={geriAl.isPending}
                onClick={() => {
                  geriAl.mutate();
                }}
              >
                {t('hesap.kvkk.geriAl')}
              </Dugme>
            </div>
          ) : engeller.length > 0 ? (
            <div className="mt-4" data-testid="silme-engel">
              <Uyari>
                <strong className="block">{t('hesap.kvkk.engelBaslik')}</strong>
                {engeller.map((e) => (
                  <span key={e.kurum_id} className="block">
                    {t('hesap.kvkk.engelAciklama', { kurum: e.kurum_ad, n: e.diger_uye_sayisi })}
                  </span>
                ))}
              </Uyari>
            </div>
          ) : (
            <>
              {engellendi ? (
                <div className="mt-4">
                  <Uyari>
                    <strong className="block">{t('hesap.kvkk.engellendiBaslik')}</strong>
                    {t('hesap.kvkk.engellendiAciklama')}
                  </Uyari>
                </div>
              ) : null}
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-metin-ikincil">
                <li>{t('hesap.kvkk.silBilgi1', { gun: durum?.soguma_gun ?? 30 })}</li>
                <li>{t('hesap.kvkk.silBilgi2')}</li>
                <li>{t('hesap.kvkk.silBilgi3')}</li>
                <li>{t('hesap.kvkk.silBilgi4')}</li>
              </ul>
              <Dugme
                className="mt-4 border-hata text-hata"
                gorunum="ikincil"
                onClick={() => {
                  setPencereHata(null);
                  setPencere(true);
                }}
              >
                <Trash2 className="size-4" aria-hidden />
                {t('hesap.kvkk.sil')}
              </Dugme>
            </>
          )}
        </Kart>
      </div>

      <Pencere
        acik={pencere}
        degisti={setPencere}
        baslik={t('hesap.kvkk.pencereBaslik')}
        aciklama={t('hesap.kvkk.pencereAciklama')}
      >
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            talepEt.mutate();
          }}
        >
          {yontemler.length > 1 ? (
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-medium">{t('hesap.kvkk.yontem')}</legend>
              {yontemler.map((y) => (
                <label key={y} className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="yontem"
                    checked={aktifYontem === y}
                    onChange={() => {
                      setYontem(y);
                      setPencereHata(null);
                    }}
                  />
                  {y === 'otp' ? t('hesap.kvkk.yontemOtp') : t('hesap.kvkk.yontemParola')}
                </label>
              ))}
            </fieldset>
          ) : null}

          {aktifYontem === 'otp' ? (
            <div className="flex flex-col gap-2">
              <Dugme
                type="button"
                gorunum="ikincil"
                disabled={kodGonder.isPending}
                onClick={() => {
                  kodGonder.mutate();
                }}
              >
                {t('hesap.kvkk.kodGonder')}
              </Dugme>
              {kodGitti ? (
                <p role="status" className="text-sm text-metin-ikincil">
                  {t('hesap.kvkk.kodGonderildi')}
                </p>
              ) : null}
              <Etiket htmlFor="silme-kod">{t('hesap.kvkk.kod')}</Etiket>
              <Girdi
                id="silme-kod"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={kod}
                onChange={(e) => {
                  setKod(e.target.value.replace(/\D/g, ''));
                }}
              />
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <Etiket htmlFor="silme-parola">{t('hesap.kvkk.parola')}</Etiket>
              <Girdi
                id="silme-parola"
                type="password"
                autoComplete="current-password"
                value={parola}
                onChange={(e) => {
                  setParola(e.target.value);
                }}
              />
            </div>
          )}

          {pencereHata ? <Uyari>{pencereHata}</Uyari> : null}
          <div className="flex justify-end gap-2">
            <Dugme
              type="button"
              gorunum="ikincil"
              onClick={() => {
                setPencere(false);
              }}
            >
              {t('hesap.kvkk.vazgec')}
            </Dugme>
            <Dugme
              type="submit"
              className="bg-hata"
              disabled={
                talepEt.isPending ||
                (aktifYontem === 'otp' ? kod.length !== 6 : parola.length === 0)
              }
            >
              {t('hesap.kvkk.talepEt')}
            </Dugme>
          </div>
        </form>
      </Pencere>
    </>
  );
}
