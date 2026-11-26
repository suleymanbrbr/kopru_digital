'use client';

import type { KaynakOnerisiOlusturGirdi, KaynakOnerisiTuru } from '@kopru/contracts';
import { t } from '@kopru/i18n';
import { useState, type SyntheticEvent } from 'react';

import { KonuSecici } from '@/components/ogrenme/konu-secici';
import { Alan } from '@/components/operasyon/ortak';
import { Dugme } from '@/components/ui/button';
import { Girdi } from '@/components/ui/input';
import { MetinAlani } from '@/components/ui/metin-alani';
import { Pencere } from '@/components/ui/pencere';
import { Secim } from '@/components/ui/secim';
import { Uyari } from '@/components/ui/uyari';
import { useKurum } from '@/kurum/baglam';
import { hataMesaji } from '@/lib/api';
import { siraliBransler } from '@/lib/bransler';
import { guvenliBaglanti } from '@/lib/degerlendirme/model';
import { useOneriYap } from '@/lib/degerlendirme/veri';
import { useKaynakKitapDetayi, useKaynakKitaplar } from '@/lib/gunluk-soru/veri';

const TURLER: readonly KaynakOnerisiTuru[] = [
  'kaynak_kitap',
  'kaynak_kitap_testi',
  'link',
  'serbest',
];

/**
 * Kaynak öner penceresi: kurumun kaynak kitaplarından kitap/test, bağlantı (http/https) ya da serbest metin;
 * isteğe bağlı konu ve not. Öneri öğrenciye bildirim olarak gider (içeriği olaya girmez).
 */
export function OneriFormu({
  acik,
  degisti,
  ogrenciId,
  ogrenciAd,
  bitti,
}: {
  acik: boolean;
  degisti: (acik: boolean) => void;
  ogrenciId: string;
  ogrenciAd: string;
  bitti: (mesaj: string) => void;
}) {
  return (
    <Pencere
      acik={acik}
      degisti={degisti}
      genis
      baslik={t('kaynakOnerisi.baslik')}
      aciklama={t('kaynakOnerisi.form.aciklama', {
        ad: ogrenciAd || t('ogrenme.ortak.ogrenci'),
      })}
    >
      <FormIcerigi
        ogrenciId={ogrenciId}
        vazgec={() => {
          degisti(false);
        }}
        bitti={(mesaj) => {
          degisti(false);
          bitti(mesaj);
        }}
      />
    </Pencere>
  );
}

function FormIcerigi({
  ogrenciId,
  vazgec,
  bitti,
}: {
  ogrenciId: string;
  vazgec: () => void;
  bitti: (mesaj: string) => void;
}) {
  const { uyelik } = useKurum();
  const kurumId = uyelik.kurumId;
  const oner = useOneriYap(kurumId, ogrenciId);
  const [tur, setTur] = useState<KaynakOnerisiTuru>('kaynak_kitap');
  const [kitapId, setKitapId] = useState('');
  const [testId, setTestId] = useState('');
  const [baglanti, setBaglanti] = useState('');
  const [baslik, setBaslik] = useState('');
  const [brans, setBrans] = useState('');
  const [konuId, setKonuId] = useState<string | null>(null);
  const [notMetni, setNotMetni] = useState('');
  const [hatalar, setHatalar] = useState<Record<string, string>>({});

  const kitapTuru = tur === 'kaynak_kitap' || tur === 'kaynak_kitap_testi';
  const kitaplar = useKaynakKitaplar(kurumId, {}, kitapTuru);
  const kitap = useKaynakKitapDetayi(
    kurumId,
    tur === 'kaynak_kitap_testi' && kitapId ? kitapId : null,
  );
  const seciliKitap = (kitaplar.data?.kitaplar ?? []).find((k) => k.id === kitapId);
  // Kitap/test onerisinde konunun dersi kitabin dersidir; link/serbestte ders ayrica secilir.
  const konuBransi = kitapTuru ? (seciliKitap?.brans_kodu ?? '') : brans;

  const gonder = async (e: SyntheticEvent) => {
    e.preventDefault();
    if (oner.isPending) return;
    const h: Record<string, string> = {};
    if (kitapTuru && !kitapId) h.kitap = t('kaynakOnerisi.form.hata.kitap');
    if (tur === 'kaynak_kitap_testi' && kitapId && !testId) {
      h.test = t('kaynakOnerisi.form.hata.test');
    }
    if (tur === 'link' && !guvenliBaglanti(baglanti.trim())) {
      h.baglanti = t('kaynakOnerisi.form.hata.baglanti');
    }
    if ((tur === 'link' || tur === 'serbest') && baslik.trim() === '') {
      h.baslik = t('kaynakOnerisi.form.hata.baslik');
    }
    if (konuId && konuBransi === '') h.ders = t('kaynakOnerisi.form.hata.ders');
    setHatalar(h);
    if (Object.keys(h).length > 0) return;

    const ortak = {
      ...(konuId ? { konu_id: konuId } : {}),
      ...(notMetni.trim() !== '' ? { not: notMetni.trim() } : {}),
    };
    const govde: KaynakOnerisiOlusturGirdi =
      tur === 'kaynak_kitap'
        ? { tur, kaynak_kitap_id: kitapId, ...ortak }
        : tur === 'kaynak_kitap_testi'
          ? { tur, kaynak_test_id: testId, ...ortak }
          : tur === 'link'
            ? {
                tur,
                baglanti_url: baglanti.trim(),
                baslik: baslik.trim(),
                ...(brans !== '' ? { brans_kodu: brans } : {}),
                ...ortak,
              }
            : {
                tur,
                baslik: baslik.trim(),
                ...(brans !== '' ? { brans_kodu: brans } : {}),
                ...ortak,
              };
    try {
      await oner.mutateAsync(govde);
      bitti(t('kocluk.onerildi'));
    } catch {
      /* hata `oner.error` uzerinden gosterilir */
    }
  };

  return (
    <form onSubmit={(e) => void gonder(e)} noValidate className="flex flex-col gap-4">
      <Alan etiket={t('kaynakOnerisi.form.tur')} className="max-w-xs">
        {(o) => (
          <Secim
            {...o}
            value={tur}
            onChange={(e) => {
              setTur(e.target.value as KaynakOnerisiTuru);
              setKonuId(null);
              setHatalar({});
            }}
          >
            {TURLER.map((x) => (
              <option key={x} value={x}>
                {t(`kaynakOnerisi.tur.${x}`)}
              </option>
            ))}
          </Secim>
        )}
      </Alan>

      {kitapTuru ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Alan etiket={t('kaynakOnerisi.form.kitap')} hata={hatalar.kitap}>
            {(o) => (
              <Secim
                {...o}
                value={kitapId}
                onChange={(e) => {
                  setKitapId(e.target.value);
                  setTestId('');
                  setKonuId(null);
                }}
              >
                <option value="">
                  {(kitaplar.data?.kitaplar.length ?? 1) === 0
                    ? t('kaynakOnerisi.form.kitapYok')
                    : t('kaynakOnerisi.form.kitapSec')}
                </option>
                {(kitaplar.data?.kitaplar ?? []).map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.ad}
                  </option>
                ))}
              </Secim>
            )}
          </Alan>
          {tur === 'kaynak_kitap_testi' ? (
            <Alan etiket={t('kaynakOnerisi.form.test')} hata={hatalar.test}>
              {(o) => (
                <Secim
                  {...o}
                  value={testId}
                  disabled={!kitapId}
                  onChange={(e) => {
                    setTestId(e.target.value);
                  }}
                >
                  <option value="">{t('kaynakOnerisi.form.testSec')}</option>
                  {(kitap.data?.testler ?? []).map((x) => (
                    <option key={x.id} value={x.id}>
                      {t('kaynakOnerisi.form.testSoru', { ad: x.ad, n: x.soru_sayisi })}
                    </option>
                  ))}
                </Secim>
              )}
            </Alan>
          ) : null}
        </div>
      ) : (
        <>
          {tur === 'link' ? (
            <Alan etiket={t('kaynakOnerisi.form.baglanti')} hata={hatalar.baglanti}>
              {(o) => (
                <Girdi
                  {...o}
                  type="url"
                  inputMode="url"
                  autoComplete="off"
                  maxLength={2000}
                  value={baglanti}
                  placeholder={t('kaynakOnerisi.form.baglantiYer')}
                  onChange={(e) => {
                    setBaglanti(e.target.value);
                  }}
                />
              )}
            </Alan>
          ) : null}
          <Alan etiket={t('kaynakOnerisi.form.baslik')} hata={hatalar.baslik}>
            {(o) => (
              <Girdi
                {...o}
                maxLength={200}
                value={baslik}
                placeholder={t('kaynakOnerisi.form.baslikYer')}
                onChange={(e) => {
                  setBaslik(e.target.value);
                }}
              />
            )}
          </Alan>
          <Alan etiket={t('kaynakOnerisi.form.ders')} hata={hatalar.ders} className="max-w-xs">
            {(o) => (
              <Secim
                {...o}
                value={brans}
                onChange={(e) => {
                  setBrans(e.target.value);
                  setKonuId(null);
                }}
              >
                <option value="">{t('kaynakOnerisi.form.dersSec')}</option>
                {siraliBransler().map((b) => (
                  <option key={b.kod} value={b.kod}>
                    {b.ad}
                  </option>
                ))}
              </Secim>
            )}
          </Alan>
        </>
      )}

      {konuBransi !== '' ? (
        <KonuSecici
          kurumId={kurumId}
          deger={konuId}
          brans={konuBransi}
          degisti={(k) => {
            setKonuId(k?.id ?? null);
          }}
          etiket={t('kaynakOnerisi.form.konu')}
        />
      ) : null}

      <Alan etiket={t('kaynakOnerisi.form.not')}>
        {(o) => (
          <MetinAlani
            {...o}
            rows={2}
            maxLength={1000}
            value={notMetni}
            placeholder={t('kaynakOnerisi.form.notYer')}
            onChange={(e) => {
              setNotMetni(e.target.value);
            }}
          />
        )}
      </Alan>

      {oner.error ? <Uyari>{hataMesaji(oner.error)}</Uyari> : null}

      <div className="flex flex-wrap items-center gap-3">
        <Dugme type="submit" boyut="lg" disabled={oner.isPending}>
          {oner.isPending ? t('kaynakOnerisi.form.oneriliyor') : t('kaynakOnerisi.form.oner')}
        </Dugme>
        <Dugme type="button" gorunum="ikincil" boyut="lg" onClick={vazgec}>
          {t('kaynakOnerisi.form.vazgec')}
        </Dugme>
      </div>
    </form>
  );
}
