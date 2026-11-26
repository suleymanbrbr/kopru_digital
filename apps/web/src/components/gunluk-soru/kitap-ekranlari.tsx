'use client';

import type { KaynakKitap } from '@kopru/contracts';
import { t } from '@kopru/i18n';
import { BookMarked, ChevronDown, Plus, Trash2 } from 'lucide-react';
import { useState, type SyntheticEvent } from 'react';

import { BosDurum } from '@/components/bos-durum';
import { HataDurumu } from '@/components/hata-durumu';
import { BildirimKutusu, basari, basarisiz, type Bildirim } from '@/components/hesap/ortak';
import { SayfaBasligi } from '@/components/kabuk/sayfa-basligi';
import { kisaTarih, OgrenciSecimi } from '@/components/ogrenme/ortak';
import { Alan } from '@/components/operasyon/ortak';
import { Dugme } from '@/components/ui/button';
import { Girdi } from '@/components/ui/input';
import { Iskelet, Kart } from '@/components/ui/kart';
import { MetinAlani } from '@/components/ui/metin-alani';
import { OnayPenceresi, Pencere } from '@/components/ui/pencere';
import { Rozet } from '@/components/ui/rozet';
import { Secim } from '@/components/ui/secim';
import { Uyari } from '@/components/ui/uyari';
import { useKurum } from '@/kurum/baglam';
import { hataMesaji } from '@/lib/api';
import { bransAdi, siraliBransler } from '@/lib/bransler';
import { testSatirlariniAyristir } from '@/lib/gunluk-soru/hatirla';
import {
  useKaynakKitapDetayi,
  useKaynakKitaplar,
  useKitapGuncelle,
  useKitapOlustur,
  useTestEkle,
  useTestSil,
} from '@/lib/gunluk-soru/veri';
import { useOgrenciler } from '@/lib/ogrenme/veri';

// --- Ogrenci: kitaplarim --------------------------------------------------------------------------

/** Ogrencinin kitaplari ve kendi ilerlemesi (cozulen test / toplam test). */
export function OgrenciKitaplari() {
  const { uyelik } = useKurum();
  const q = useKaynakKitaplar(uyelik.kurumId);
  if (q.isPending) return <Iskelet className="h-24 w-full" />;
  if (q.isError) {
    return (
      <HataDurumu
        baslik={t('gunlukSoru.kitap.yuklenemedi')}
        aciklama={hataMesaji(q.error)}
        tekrarDene={() => void q.refetch()}
      />
    );
  }
  if (q.data.kitaplar.length === 0) {
    return (
      <BosDurum
        ikon={BookMarked}
        baslik={t('gunlukSoru.kitap.bos')}
        aciklama={t('gunlukSoru.kitap.bosAciklama')}
      />
    );
  }
  return (
    <ul className="flex flex-col gap-3" aria-label={t('gunlukSoru.kitap.liste')}>
      {q.data.kitaplar.map((k) => (
        <KitapKarti
          key={k.id}
          kitap={k}
          yonetim={false}
          ogrenciId={undefined}
          bildir={() => undefined}
        />
      ))}
    </ul>
  );
}

// --- Personel: kaynak kitap yonetimi --------------------------------------------------------------

export function KaynakKitaplarEkrani() {
  const { uyelik } = useKurum();
  const kurumId = uyelik.kurumId;
  const [brans, setBrans] = useState('');
  const [pasifler, setPasifler] = useState(false);
  const [ogrenciId, setOgrenciId] = useState('');
  const [yeniAcik, setYeniAcik] = useState(false);
  const [bildirim, setBildirim] = useState<Bildirim>(null);
  const ogrenciler = useOgrenciler(kurumId);
  const q = useKaynakKitaplar(kurumId, {
    ...(brans ? { brans } : {}),
    pasifler,
    ...(ogrenciId ? { ogrenciId } : {}),
  });

  return (
    <>
      <SayfaBasligi baslik={t('gunlukSoru.kitap.baslik')} aciklama={t('gunlukSoru.kitap.aciklama')}>
        <Dugme
          onClick={() => {
            setYeniAcik(true);
          }}
        >
          <Plus aria-hidden />
          {t('gunlukSoru.kitap.ekle')}
        </Dugme>
      </SayfaBasligi>
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Alan etiket={t('gunlukSoru.kitap.ders')}>
          {(o) => (
            <Secim
              {...o}
              value={brans}
              onChange={(e) => {
                setBrans(e.target.value);
              }}
            >
              <option value="">{t('gunlukSoru.kitap.tumDersler')}</option>
              {siraliBransler().map((b) => (
                <option key={b.kod} value={b.kod}>
                  {b.ad}
                </option>
              ))}
            </Secim>
          )}
        </Alan>
        <OgrenciSecimi
          deger={ogrenciId}
          degisti={setOgrenciId}
          ogrenciler={ogrenciler.liste}
          etiket={t('gunlukSoru.kitap.ilerlemeOgrenci')}
          bosEtiket={t('gunlukSoru.kitap.ilerlemeOgrenciSec')}
        />
        <label className="flex items-center gap-2 self-end pb-3 text-sm">
          <input
            type="checkbox"
            checked={pasifler}
            onChange={(e) => {
              setPasifler(e.target.checked);
            }}
            className="size-5"
          />
          {t('gunlukSoru.kitap.pasifleriGoster')}
        </label>
      </div>
      <div className="mb-4">
        <BildirimKutusu bildirim={bildirim} />
      </div>
      {q.isPending ? (
        <div role="status" aria-label={t('ortak.yukleniyor')} className="flex flex-col gap-3">
          <Iskelet className="h-20 w-full" />
          <Iskelet className="h-20 w-full" />
        </div>
      ) : q.isError ? (
        <HataDurumu
          baslik={t('gunlukSoru.kitap.yuklenemedi')}
          aciklama={hataMesaji(q.error)}
          tekrarDene={() => void q.refetch()}
        />
      ) : q.data.kitaplar.length === 0 ? (
        <Kart>
          <BosDurum
            ikon={BookMarked}
            baslik={t('gunlukSoru.kitap.bos')}
            aciklama={t('gunlukSoru.kitap.bosAciklama')}
          />
        </Kart>
      ) : (
        <ul className="flex flex-col gap-3" aria-label={t('gunlukSoru.kitap.liste')}>
          {q.data.kitaplar.map((k) => (
            <KitapKarti
              key={k.id}
              kitap={k}
              yonetim
              ogrenciId={ogrenciId || undefined}
              bildir={setBildirim}
            />
          ))}
        </ul>
      )}
      <KitapFormu
        acik={yeniAcik}
        degisti={setYeniAcik}
        bitti={(ad) => {
          setBildirim(basari(t('gunlukSoru.kitap.eklendi', { ad })));
        }}
      />
    </>
  );
}

function KitapKarti({
  kitap,
  yonetim,
  ogrenciId,
  bildir,
}: {
  kitap: KaynakKitap;
  yonetim: boolean;
  ogrenciId: string | undefined;
  bildir: (b: Bildirim) => void;
}) {
  const { uyelik } = useKurum();
  const kurumId = uyelik.kurumId;
  const [acik, setAcik] = useState(false);
  const guncelle = useKitapGuncelle(kurumId);
  const kimlik = `kitap-${kitap.id}`;

  // `mutateAsync`: liste yenilenince (pasif kitap gizlenince) bu kart sokulur; sonuc yine bildirilir.
  const durumDegistir = async () => {
    try {
      await guncelle.mutateAsync({ id: kitap.id, aktif: !kitap.aktif, surum: kitap.surum });
      bildir(
        basari(
          kitap.aktif
            ? t('gunlukSoru.kitap.pasiflestirildi')
            : t('gunlukSoru.kitap.etkinlestirildi'),
        ),
      );
    } catch (e) {
      bildir(basarisiz(e));
    }
  };

  return (
    <li className="rounded-buyuk border border-kenar bg-yuzey" data-testid="kitap-karti">
      <div className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="min-w-0">
          <h2 className="flex flex-wrap items-center gap-2 text-base font-semibold">
            {kitap.ad}
            {!kitap.aktif ? <Rozet ton="uyari">{t('gunlukSoru.kitap.pasif')}</Rozet> : null}
          </h2>
          <p className="mt-0.5 text-sm text-metin-ikincil">
            {[
              bransAdi(kitap.brans_kodu),
              kitap.yayinevi,
              t('gunlukSoru.kitap.testSayisi', {
                test: kitap.test_sayisi,
                soru: kitap.toplam_soru,
              }),
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
          {kitap.ilerleme ? (
            <p className="mt-1 text-sm font-medium" data-testid="kitap-ilerleme">
              {t('gunlukSoru.kitap.ilerleme', {
                cozulen: kitap.ilerleme.cozulen_test,
                toplam: kitap.ilerleme.toplam_test,
              })}
              <progress
                className="ml-2 inline-block h-2 w-24 align-middle"
                max={Math.max(1, kitap.ilerleme.toplam_test)}
                value={kitap.ilerleme.cozulen_test}
                aria-hidden
              />
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {yonetim ? (
            <Dugme
              type="button"
              gorunum="ikincil"
              boyut="sm"
              disabled={guncelle.isPending}
              onClick={() => void durumDegistir()}
            >
              {kitap.aktif ? t('gunlukSoru.kitap.pasiflestir') : t('gunlukSoru.kitap.etkinlestir')}
            </Dugme>
          ) : null}
          <Dugme
            type="button"
            gorunum="hayalet"
            boyut="sm"
            aria-expanded={acik}
            aria-controls={kimlik}
            aria-label={t('gunlukSoru.kitap.testleriGoster', { ad: kitap.ad })}
            onClick={() => {
              setAcik((a) => !a);
            }}
          >
            {t('gunlukSoru.kitap.testler')}
            <ChevronDown className={acik ? 'rotate-180' : ''} aria-hidden />
          </Dugme>
        </div>
      </div>
      {acik ? (
        <div id={kimlik} className="border-t border-kenar p-4">
          <KitapTestleri
            kitapId={kitap.id}
            yonetim={yonetim}
            ogrenciId={ogrenciId}
            bildir={bildir}
          />
        </div>
      ) : null}
    </li>
  );
}

function KitapTestleri({
  kitapId,
  yonetim,
  ogrenciId,
  bildir,
}: {
  kitapId: string;
  yonetim: boolean;
  ogrenciId: string | undefined;
  bildir: (b: Bildirim) => void;
}) {
  const { uyelik } = useKurum();
  const kurumId = uyelik.kurumId;
  const q = useKaynakKitapDetayi(kurumId, kitapId, ogrenciId);
  const ekle = useTestEkle(kurumId);
  const sil = useTestSil(kurumId);
  const [metin, setMetin] = useState('');
  const [hata, setHata] = useState<string | null>(null);
  const [silinecek, setSilinecek] = useState<{ id: string; ad: string } | null>(null);

  if (q.isPending) return <Iskelet className="h-16 w-full" />;
  if (q.isError) {
    return <Uyari>{hataMesaji(q.error)}</Uyari>;
  }
  const testEkle = (e: SyntheticEvent) => {
    e.preventDefault();
    const s = testSatirlariniAyristir(metin);
    if ('hataliSatir' in s || s.testler.length === 0) {
      setHata(t('gunlukSoru.kitap.testHata', { satir: 'hataliSatir' in s ? s.hataliSatir : 1 }));
      return;
    }
    setHata(null);
    ekle.mutate(
      { kitapId, testler: s.testler },
      {
        onSuccess: () => {
          setMetin('');
          bildir(basari(t('gunlukSoru.kitap.testlerEklendi')));
        },
        onError: (er) => {
          bildir(basarisiz(er));
        },
      },
    );
  };

  return (
    <div className="flex flex-col gap-4">
      {q.data.testler.length === 0 ? (
        <p className="text-sm text-metin-ikincil">{t('gunlukSoru.kitap.testYok')}</p>
      ) : (
        <ul className="divide-y divide-kenar" data-testid="kitap-testleri">
          {q.data.testler.map((x) => (
            <li
              key={x.id}
              className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
            >
              <span>{t('gunlukSoru.kitap.testSatiri', { ad: x.ad, n: x.soru_sayisi })}</span>
              <span className="flex items-center gap-2">
                {x.cozuldu_gun !== undefined ? (
                  x.cozuldu_gun ? (
                    <Rozet ton="basari">
                      {t('gunlukSoru.kitap.cozuldu', { tarih: kisaTarih(x.cozuldu_gun) })}
                    </Rozet>
                  ) : (
                    <Rozet>{t('gunlukSoru.kitap.cozulmedi')}</Rozet>
                  )
                ) : null}
                {yonetim ? (
                  <Dugme
                    type="button"
                    gorunum="hayalet"
                    boyut="sm"
                    aria-label={t('gunlukSoru.kitap.testSilEtiket', { ad: x.ad })}
                    onClick={() => {
                      setSilinecek({ id: x.id, ad: x.ad });
                    }}
                  >
                    <Trash2 aria-hidden />
                  </Dugme>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      )}
      {yonetim ? (
        <form onSubmit={testEkle} noValidate className="flex flex-col gap-2">
          <Alan
            etiket={t('gunlukSoru.kitap.testEkle')}
            yardim={t('gunlukSoru.kitap.testlerYardim')}
            hata={hata ?? undefined}
          >
            {(o) => (
              <MetinAlani
                {...o}
                rows={3}
                value={metin}
                placeholder={t('gunlukSoru.kitap.testlerYer')}
                onChange={(e) => {
                  setMetin(e.target.value);
                }}
              />
            )}
          </Alan>
          <Dugme type="submit" gorunum="ikincil" className="self-start" disabled={ekle.isPending}>
            {t('gunlukSoru.kitap.testEkle')}
          </Dugme>
        </form>
      ) : null}
      <OnayPenceresi
        acik={silinecek !== null}
        degisti={(a) => {
          if (!a) setSilinecek(null);
        }}
        baslik={t('gunlukSoru.kitap.testSilBaslik')}
        aciklama={t('gunlukSoru.kitap.testSilAciklama')}
        onayEtiketi={t('gunlukSoru.kitap.testSilOnay')}
        tehlikeli
        bekliyor={sil.isPending}
        onay={() => {
          if (!silinecek) return;
          sil.mutate(
            { kitapId, testId: silinecek.id },
            {
              onSuccess: () => {
                bildir(basari(t('gunlukSoru.kitap.testSilindi')));
              },
              onError: (er) => {
                bildir(basarisiz(er));
              },
              onSettled: () => {
                setSilinecek(null);
              },
            },
          );
        }}
      />
    </div>
  );
}

function KitapFormu({
  acik,
  degisti,
  bitti,
}: {
  acik: boolean;
  degisti: (a: boolean) => void;
  bitti: (ad: string) => void;
}) {
  const { uyelik } = useKurum();
  const olustur = useKitapOlustur(uyelik.kurumId);
  const [ad, setAd] = useState('');
  const [yayinevi, setYayinevi] = useState('');
  const [brans, setBrans] = useState('matematik');
  const [testler, setTestler] = useState('');
  const [hatalar, setHatalar] = useState<Record<string, string>>({});

  const gonder = (e: SyntheticEvent) => {
    e.preventDefault();
    const h: Record<string, string> = {};
    if (ad.trim() === '') h.ad = t('gunlukSoru.kitap.adGerekli');
    const s = testSatirlariniAyristir(testler);
    if ('hataliSatir' in s) h.testler = t('gunlukSoru.kitap.testHata', { satir: s.hataliSatir });
    setHatalar(h);
    if (Object.keys(h).length > 0 || 'hataliSatir' in s) return;
    olustur.mutate(
      {
        ad: ad.trim(),
        ...(yayinevi.trim() ? { yayinevi: yayinevi.trim() } : {}),
        brans_kodu: brans,
        testler: s.testler,
      },
      {
        onSuccess: (k) => {
          setAd('');
          setYayinevi('');
          setTestler('');
          degisti(false);
          bitti(k.ad);
        },
      },
    );
  };

  return (
    <Pencere acik={acik} degisti={degisti} baslik={t('gunlukSoru.kitap.ekle')}>
      <form onSubmit={gonder} noValidate className="flex flex-col gap-4">
        <Alan etiket={t('gunlukSoru.kitap.ad')} hata={hatalar.ad}>
          {(o) => (
            <Girdi
              {...o}
              maxLength={200}
              value={ad}
              onChange={(e) => {
                setAd(e.target.value);
              }}
            />
          )}
        </Alan>
        <Alan etiket={t('gunlukSoru.kitap.yayinevi')}>
          {(o) => (
            <Girdi
              {...o}
              maxLength={200}
              value={yayinevi}
              onChange={(e) => {
                setYayinevi(e.target.value);
              }}
            />
          )}
        </Alan>
        <Alan etiket={t('gunlukSoru.kitap.ders')}>
          {(o) => (
            <Secim
              {...o}
              value={brans}
              onChange={(e) => {
                setBrans(e.target.value);
              }}
            >
              {siraliBransler().map((b) => (
                <option key={b.kod} value={b.kod}>
                  {b.ad}
                </option>
              ))}
            </Secim>
          )}
        </Alan>
        <Alan
          etiket={t('gunlukSoru.kitap.testler')}
          yardim={t('gunlukSoru.kitap.testlerYardim')}
          hata={hatalar.testler}
        >
          {(o) => (
            <MetinAlani
              {...o}
              rows={4}
              value={testler}
              placeholder={t('gunlukSoru.kitap.testlerYer')}
              onChange={(e) => {
                setTestler(e.target.value);
              }}
            />
          )}
        </Alan>
        {olustur.error ? <Uyari>{hataMesaji(olustur.error)}</Uyari> : null}
        <div className="flex flex-wrap gap-2">
          <Dugme type="submit" disabled={olustur.isPending}>
            {t('gunlukSoru.kitap.olustur')}
          </Dugme>
          <Dugme
            type="button"
            gorunum="ikincil"
            onClick={() => {
              degisti(false);
            }}
          >
            {t('ortak.vazgec')}
          </Dugme>
        </div>
      </form>
    </Pencere>
  );
}
