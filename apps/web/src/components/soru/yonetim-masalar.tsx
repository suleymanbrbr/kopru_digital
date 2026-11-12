'use client';

import { SoruMasasiSema, type SoruMasasiOlusturGirdiSema } from '@kopru/contracts';
import { t } from '@kopru/i18n';
import { useMutation } from '@tanstack/react-query';
import { Plus, Table2, Trash2, UserPlus, X } from 'lucide-react';
import { useState, type SyntheticEvent } from 'react';
import type { z } from 'zod';

import { BosDurum } from '@/components/bos-durum';
import { HataDurumu } from '@/components/hata-durumu';
import {
  BildirimKutusu,
  ListeIskeleti,
  basari,
  basarisiz,
  type Bildirim,
} from '@/components/hesap/ortak';
import { Alan } from '@/components/operasyon/ortak';
import { Dugme } from '@/components/ui/button';
import { Girdi } from '@/components/ui/input';
import { OnayPenceresi, Pencere } from '@/components/ui/pencere';
import { Rozet } from '@/components/ui/rozet';
import { Secim } from '@/components/ui/secim';
import { Uyari } from '@/components/ui/uyari';
import { useKurum } from '@/kurum/baglam';
import { hataMesaji } from '@/lib/api';
import { bransAdi, siraliBransler } from '@/lib/bransler';
import { ogrenmeIstek } from '@/lib/hesap-istek';
import { useOgretmenler } from '@/lib/operasyon-verisi';
import { useSoruMasalari, useSoruYenile } from '@/lib/soru/veri';

type Masa = z.output<typeof SoruMasasiSema>;
type Olustur = z.input<typeof SoruMasasiOlusturGirdiSema>;

/** Soru masalari: brans bazli ortak havuz. Olusturma, ad/aktiflik, uye ekleme-cikarma ve arsivleme. */
export function YonetimMasalar() {
  const { uyelik } = useKurum();
  const kurumId = uyelik.kurumId;
  const masalar = useSoruMasalari(kurumId);
  const ogretmenler = useOgretmenler(kurumId);
  const yenile = useSoruYenile(kurumId);
  const [bildirim, setBildirim] = useState<Bildirim>(null);
  const [olusturAcik, setOlusturAcik] = useState(false);
  const [silinecek, setSilinecek] = useState<Masa | null>(null);
  const kok = `kurumlar/${kurumId}/soru-masalari`;

  const sil = useMutation({
    mutationFn: (m: Masa) => ogrenmeIstek(`${kok}/${m.id}`, { yontem: 'DELETE' }),
    onSuccess: () => {
      setSilinecek(null);
      setBildirim(basari(t('soruSor.masa.silindi')));
      void yenile();
    },
    onError: (h) => {
      setSilinecek(null);
      setBildirim(basarisiz(h));
    },
  });

  return (
    <section
      aria-label={t('soruSor.masa.baslik')}
      className="rounded-buyuk border border-kenar bg-yuzey"
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-kenar px-4 py-3">
        <div>
          <h2 className="text-base font-semibold">{t('soruSor.masa.baslik')}</h2>
          <p className="mt-0.5 text-sm text-metin-ikincil">{t('soruSor.masa.aciklama')}</p>
        </div>
        <Dugme
          type="button"
          onClick={() => {
            setOlusturAcik(true);
          }}
        >
          <Plus aria-hidden />
          {t('soruSor.masa.yeni')}
        </Dugme>
      </header>
      <div className="p-4">
        <BildirimKutusu bildirim={bildirim} />
      </div>
      {masalar.isPending ? (
        <ListeIskeleti satir={2} />
      ) : masalar.isError ? (
        <HataDurumu
          aciklama={hataMesaji(masalar.error)}
          tekrarDene={() => void masalar.refetch()}
        />
      ) : masalar.data.masalar.length === 0 ? (
        <BosDurum
          className="py-12"
          ikon={Table2}
          baslik={t('soruSor.masa.bos')}
          aciklama={t('soruSor.masa.bosAciklama')}
        />
      ) : (
        <ul className="grid gap-3 p-4 pt-0 md:grid-cols-2" data-testid="masa-listesi">
          {masalar.data.masalar.map((m) => (
            <MasaKarti
              key={m.id}
              masa={m}
              kok={kok}
              ogretmenler={ogretmenler.liste}
              yenile={() => void yenile()}
              bildir={setBildirim}
              silIste={() => {
                setSilinecek(m);
              }}
            />
          ))}
        </ul>
      )}

      <MasaOlusturPenceresi
        acik={olusturAcik}
        kapat={() => {
          setOlusturAcik(false);
        }}
        kok={kok}
        bitti={() => {
          setOlusturAcik(false);
          setBildirim(basari(t('soruSor.masa.olusturuldu')));
          void yenile();
        }}
      />
      <OnayPenceresi
        acik={silinecek !== null}
        degisti={(a) => {
          if (!a) setSilinecek(null);
        }}
        baslik={t('soruSor.masa.silBaslik', { ad: silinecek?.ad ?? '' })}
        aciklama={t('soruSor.masa.silAciklama')}
        onayEtiketi={t('soruSor.masa.sil')}
        tehlikeli
        bekliyor={sil.isPending}
        onay={() => {
          if (silinecek) sil.mutate(silinecek);
        }}
      />
    </section>
  );
}

function MasaKarti({
  masa: m,
  kok,
  ogretmenler,
  yenile,
  bildir,
  silIste,
}: {
  masa: Masa;
  kok: string;
  ogretmenler: readonly { id: string; ad: string }[];
  yenile: () => void;
  bildir: (b: Bildirim) => void;
  silIste: () => void;
}) {
  const [secilen, setSecilen] = useState('');
  const uyeIdleri = new Set(m.uyeler.map((u) => u.ogretmen_id));
  const eklenebilir = ogretmenler.filter((o) => !uyeIdleri.has(o.id));

  const uyeEkle = useMutation({
    mutationFn: (id: string) =>
      ogrenmeIstek(`${kok}/${m.id}/uyeler`, {
        yontem: 'POST',
        govde: { ogretmen_id: id },
        sema: SoruMasasiSema,
      }),
    onSuccess: () => {
      setSecilen('');
      bildir(basari(t('soruSor.masa.uyeEklendi')));
      yenile();
    },
    onError: (h) => {
      bildir(basarisiz(h));
    },
  });
  const uyeCikar = useMutation({
    mutationFn: (id: string) => ogrenmeIstek(`${kok}/${m.id}/uyeler/${id}`, { yontem: 'DELETE' }),
    onSuccess: () => {
      bildir(basari(t('soruSor.masa.uyeCikarildi')));
      yenile();
    },
    onError: (h) => {
      bildir(basarisiz(h));
    },
  });
  const aktiflik = useMutation({
    mutationFn: () =>
      ogrenmeIstek(`${kok}/${m.id}`, {
        yontem: 'PATCH',
        govde: { aktif: !m.aktif, surum: m.surum },
        sema: SoruMasasiSema,
      }),
    onSuccess: (yeni) => {
      bildir(basari(yeni.aktif ? t('soruSor.masa.aktiflesti') : t('soruSor.masa.pasiflesti')));
      yenile();
    },
    onError: (h) => {
      bildir(basarisiz(h));
      yenile();
    },
  });

  return (
    <li
      data-testid="masa-karti"
      className="flex flex-col gap-3 rounded-orta border border-kenar p-4"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-base font-semibold">{m.ad}</h3>
        <Rozet>{bransAdi(m.brans_kodu)}</Rozet>
        <Rozet ton={m.aktif ? 'basari' : 'notr'}>
          {m.aktif ? t('soruSor.masa.aktif') : t('soruSor.masa.pasif')}
        </Rozet>
      </div>
      <div>
        <h4 className="mb-1.5 text-sm font-medium">
          {t('soruSor.masa.uyeler', { n: m.uyeler.length })}
        </h4>
        {m.uyeler.length === 0 ? (
          <p className="text-sm text-metin-ikincil">{t('soruSor.masa.uyeYok')}</p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {m.uyeler.map((u) => (
              <li
                key={u.ogretmen_id}
                className="flex items-center gap-1 rounded-full bg-yuzey-ikincil py-0.5 pl-3 pr-1 text-sm"
              >
                {u.gorunen_ad ?? t('soruSor.masa.adsiz')}
                <button
                  type="button"
                  aria-label={t('soruSor.masa.uyeCikar', { ad: u.gorunen_ad ?? '' })}
                  disabled={uyeCikar.isPending}
                  onClick={() => {
                    uyeCikar.mutate(u.ogretmen_id);
                  }}
                  className="flex size-8 items-center justify-center rounded-full hover:bg-kenar"
                >
                  <X className="size-4" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="flex items-end gap-2">
        <Alan etiket={t('soruSor.masa.uyeEkle')} className="min-w-0 flex-1">
          {(o) => (
            <Secim
              {...o}
              value={secilen}
              onChange={(e) => {
                setSecilen(e.target.value);
              }}
            >
              <option value="">{t('soruSor.masa.ogretmenSec')}</option>
              {eklenebilir.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.ad}
                </option>
              ))}
            </Secim>
          )}
        </Alan>
        <Dugme
          type="button"
          gorunum="ikincil"
          disabled={secilen === '' || uyeEkle.isPending}
          onClick={() => {
            uyeEkle.mutate(secilen);
          }}
        >
          <UserPlus aria-hidden />
          {t('soruSor.masa.ekle')}
        </Dugme>
      </div>
      <div className="flex flex-wrap gap-2 border-t border-kenar pt-3">
        <Dugme
          type="button"
          gorunum="ikincil"
          boyut="sm"
          disabled={aktiflik.isPending}
          onClick={() => {
            aktiflik.mutate();
          }}
        >
          {m.aktif ? t('soruSor.masa.pasifeAl') : t('soruSor.masa.aktiflestir')}
        </Dugme>
        <Dugme type="button" gorunum="hayalet" boyut="sm" onClick={silIste}>
          <Trash2 aria-hidden />
          {t('soruSor.masa.sil')}
        </Dugme>
      </div>
    </li>
  );
}

function MasaOlusturPenceresi({
  acik,
  kapat,
  kok,
  bitti,
}: {
  acik: boolean;
  kapat: () => void;
  kok: string;
  bitti: () => void;
}) {
  const [ad, setAd] = useState('');
  const [brans, setBrans] = useState('');
  const olustur = useMutation({
    mutationFn: () => {
      const govde: Olustur = { brans_kodu: brans, ad: ad.trim(), aktif: true };
      return ogrenmeIstek(kok, { yontem: 'POST', govde, sema: SoruMasasiSema });
    },
    onSuccess: () => {
      setAd('');
      setBrans('');
      bitti();
    },
  });
  const gonder = (e: SyntheticEvent) => {
    e.preventDefault();
    if (ad.trim() && brans) olustur.mutate();
  };
  return (
    <Pencere
      acik={acik}
      degisti={(a) => {
        if (!a) kapat();
      }}
      baslik={t('soruSor.masa.yeni')}
      aciklama={t('soruSor.masa.olusturAciklama')}
    >
      <form onSubmit={gonder} className="flex flex-col gap-4" aria-label={t('soruSor.masa.yeni')}>
        <Alan etiket={t('soruSor.masa.ad')}>
          {(o) => (
            <Girdi
              {...o}
              required
              maxLength={100}
              value={ad}
              onChange={(e) => {
                setAd(e.target.value);
              }}
            />
          )}
        </Alan>
        <Alan etiket={t('soruSor.masa.brans')}>
          {(o) => (
            <Secim
              {...o}
              required
              value={brans}
              onChange={(e) => {
                setBrans(e.target.value);
              }}
            >
              <option value="">{t('soruSor.form.bransSec')}</option>
              {siraliBransler().map((b) => (
                <option key={b.kod} value={b.kod}>
                  {b.ad}
                </option>
              ))}
            </Secim>
          )}
        </Alan>
        {olustur.isError ? <Uyari>{hataMesaji(olustur.error)}</Uyari> : null}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Dugme type="button" gorunum="ikincil" onClick={kapat}>
            {t('ortak.vazgec')}
          </Dugme>
          <Dugme type="submit" disabled={!ad.trim() || !brans || olustur.isPending}>
            {olustur.isPending ? t('ortak.yukleniyor') : t('soruSor.masa.olustur')}
          </Dugme>
        </div>
      </form>
    </Pencere>
  );
}
