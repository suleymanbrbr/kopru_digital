'use client';

import { t } from '@kopru/i18n';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';

import { AnalizPaneli } from './analiz-paneli';
import { KayitFormu } from './kayit-formu';
import { KayitListesi } from './kayit-listesi';
import { OgrenciKitaplari } from './kitap-ekranlari';

import { BolumKapisi } from '@/components/kabuk/bolum-yer-tutucu';
import { SayfaBasligi } from '@/components/kabuk/sayfa-basligi';
import { OgretmenimSekmesi } from '@/components/kocluk/ogrenci-tarafi';
import { Sekmeler } from '@/components/ogrenme/ortak';
import { dugmeStili } from '@/components/ui/button';
import { Kart } from '@/components/ui/kart';
import { useKurum } from '@/kurum/baglam';

/** Ogrenci: "Soru cozdum" hizli giris sayfasi (plan gorevinden `?gorev=&brans=&konu=&miktar=` ile gelinebilir). */
export function SoruCozdumEkrani() {
  return (
    <BolumKapisi bolum="gunluk-soru">
      <SoruCozdumIcerigi />
    </BolumKapisi>
  );
}

function SoruCozdumIcerigi() {
  const { uyelik } = useKurum();
  const params = useSearchParams();
  const gorev = params.get('gorev');
  const miktar = Number(params.get('miktar'));
  return (
    <>
      <SayfaBasligi baslik={t('gunlukSoru.form.baslik')} aciklama={t('gunlukSoru.form.aciklama')} />
      <Kart className="max-w-2xl p-5">
        <KayitFormu
          baslangic={{
            ...(params.get('brans') ? { brans: params.get('brans') ?? '' } : {}),
            ...(params.get('konu') ? { konuId: params.get('konu') ?? '' } : {}),
            // Ogretmen onerisinden gelindiyse kaynak on secilir (`kitap`, `test` ya da serbest `metin`).
            ...(params.get('kitap') ? { kitapId: params.get('kitap') ?? '' } : {}),
            ...(params.get('test') ? { testId: params.get('test') ?? '' } : {}),
            ...(params.get('metin') ? { kaynakMetin: params.get('metin') ?? '' } : {}),
            ...(gorev ? { gorevId: gorev } : {}),
            ...(Number.isInteger(miktar) && miktar > 0 ? { gorevMiktar: miktar } : {}),
          }}
          {...(gorev ? { plana: `/${uyelik.kurumId}/planlar` } : {})}
        />
      </Kart>
    </>
  );
}

/** Ogrenci: kayitlarim, kendi konu analizim (oneri yok) ve kitaplarim. */
export function GunlukSoruEkrani() {
  return (
    <BolumKapisi bolum="gunluk-soru">
      <GunlukSoruIcerigi />
    </BolumKapisi>
  );
}

const SEKMELER = ['kayitlar', 'analiz', 'kitaplar', 'ogretmenim'] as const;

function GunlukSoruIcerigi() {
  const { uyelik } = useKurum();
  const params = useSearchParams();
  const ilk = params.get('sekme');
  const [sekme, setSekme] = useState<string>(SEKMELER.find((s) => s === ilk) ?? 'kayitlar');
  return (
    <>
      <SayfaBasligi baslik={t('gunlukSoru.ekran.baslik')} aciklama={t('gunlukSoru.ekran.aciklama')}>
        <Link href={`/${uyelik.kurumId}/soru-cozdum`} className={dugmeStili({ boyut: 'lg' })}>
          <Plus aria-hidden />
          {t('gunlukSoru.ekran.yeniKayit')}
        </Link>
      </SayfaBasligi>
      <Sekmeler
        deger={sekme}
        degisti={setSekme}
        etiket={t('gunlukSoru.ekran.sekmeler')}
        sekmeler={[
          { anahtar: 'kayitlar', etiket: t('gunlukSoru.ekran.kayitlar'), icerik: <KayitListesi /> },
          {
            anahtar: 'analiz',
            etiket: t('gunlukSoru.ekran.analiz'),
            icerik: (
              <>
                <p className="mb-4 text-sm text-metin-ikincil">
                  {t('gunlukSoru.analiz.kendiAciklama')}
                </p>
                <AnalizPaneli />
              </>
            ),
          },
          {
            anahtar: 'kitaplar',
            etiket: t('gunlukSoru.ekran.kitaplar'),
            icerik: <OgrenciKitaplari />,
          },
          {
            anahtar: 'ogretmenim',
            etiket: t('kocluk.ogrenci.sekme'),
            icerik: <OgretmenimSekmesi />,
          },
        ]}
      />
    </>
  );
}
