'use client';

import { t } from '@kopru/i18n';
import { BookPlus, PenLine } from 'lucide-react';
import type { ReactNode } from 'react';
import { useState } from 'react';

import { DegerlendirmeFormu } from './degerlendirme-formu';
import { KullanilanKaynaklar, OnerilenKaynaklar } from './kaynak-bolumleri';
import { OlcekEgilimi } from './olcek-egilimi';
import { OneriFormu } from './oneri-formu';
import { KonuAnaliziOzeti, PlanOdevOzeti } from './ozet-kartlari';
import { ZamanCizelgesi } from './zaman-cizelgesi';

import { HataDurumu } from '@/components/hata-durumu';
import { BildirimKutusu, basari, type Bildirim } from '@/components/hesap/ortak';
import { Dugme } from '@/components/ui/button';
import { Iskelet, Kart } from '@/components/ui/kart';
import { useKurum } from '@/kurum/baglam';
import { UygulamaHatasi, hataMesaji } from '@/lib/api';
import { useKocluk } from '@/lib/degerlendirme/veri';

/**
 * Öğrenci kartı "Koçluk" sekmesi (personel): tek istekle (`/kocluk`) değerlendirme zaman çizelgesi, son 4 haftanın
 * ölçek eğilimi, kullanılan ve önerilen kaynaklar, konu analizi özeti ve plan/ödev durumu. Üstten "Değerlendirme
 * yaz" ve "Kaynak öner" açılır; `yazAcik` Bugün kartından gelindiğinde pencereyi doğrudan açar.
 */
export function KoclukSekmesi({
  ogrenciId,
  ogrenciAd,
  yazAcik = false,
  analizeGec,
}: {
  ogrenciId: string;
  ogrenciAd: string;
  yazAcik?: boolean;
  analizeGec: () => void;
}) {
  const { uyelik } = useKurum();
  const kurumId = uyelik.kurumId;
  const q = useKocluk(kurumId, ogrenciId);
  const [yazPenceresi, setYazPenceresi] = useState(yazAcik);
  const [oneriPenceresi, setOneriPenceresi] = useState(false);
  const [sonuc, setSonuc] = useState<Bildirim>(null);
  const bildir = (mesaj: string) => {
    setSonuc(basari(mesaj));
  };

  if (q.isPending) {
    return (
      <div role="status" aria-label={t('ortak.yukleniyor')} className="flex flex-col gap-4">
        <Iskelet className="h-14 w-full" />
        <Iskelet className="h-48 w-full" />
        <Iskelet className="h-32 w-full" />
      </div>
    );
  }
  if (q.isError) {
    const yok =
      q.error instanceof UygulamaHatasi && (q.error.durum === 404 || q.error.durum === 403);
    return (
      <HataDurumu
        aciklama={yok ? t('kocluk.bulunamadi') : hataMesaji(q.error)}
        tekrarDene={yok ? undefined : () => void q.refetch()}
      />
    );
  }

  const d = q.data;
  const ad = d.ogrenci_ad ?? ogrenciAd;
  return (
    <div className="flex flex-col gap-4" data-testid="kocluk">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-metin-ikincil">{t('kocluk.aciklama')}</p>
        <div className="flex flex-wrap gap-2">
          <Dugme
            type="button"
            onClick={() => {
              setSonuc(null);
              setYazPenceresi(true);
            }}
          >
            <PenLine aria-hidden />
            {t('degerlendirme.yaz')}
          </Dugme>
          <Dugme
            type="button"
            gorunum="ikincil"
            onClick={() => {
              setSonuc(null);
              setOneriPenceresi(true);
            }}
          >
            <BookPlus aria-hidden />
            {t('kaynakOnerisi.baslik')}
          </Dugme>
        </div>
      </div>
      <BildirimKutusu bildirim={sonuc} />

      <Bolum baslik={t('kocluk.zamanCizelgesi')} id="kocluk-zaman">
        <ZamanCizelgesi
          ogrenciId={ogrenciId}
          ogrenciAd={ad}
          ilk={d.degerlendirmeler}
          yanitZamani={q.dataUpdatedAt}
          bildir={bildir}
        />
      </Bolum>
      <Bolum baslik={t('kocluk.olcekEgilimi')} id="kocluk-egilim">
        <OlcekEgilimi egilim={d.olcek_ortalamalari} />
      </Bolum>
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Bolum baslik={t('kocluk.onerilenKaynaklar')} id="kocluk-oneriler-baslik">
          <OnerilenKaynaklar oneriler={d.oneriler} bildir={bildir} />
        </Bolum>
        <Bolum baslik={t('kocluk.kullanilanKaynaklar')} id="kocluk-kullanilan">
          <KullanilanKaynaklar kaynaklar={d.kullanilan_kaynaklar} />
        </Bolum>
        <Bolum baslik={t('kocluk.konuAnalizi')} id="kocluk-konu">
          <KonuAnaliziOzeti analiz={d.konu_analizi} analizeGec={analizeGec} />
        </Bolum>
        <Bolum baslik={t('kocluk.planOdev')} id="kocluk-plan">
          <PlanOdevOzeti ozet={d.plan_odev} kok={`/${kurumId}`} />
        </Bolum>
      </div>

      {yazPenceresi ? (
        <DegerlendirmeFormu
          acik
          degisti={(acik) => {
            setYazPenceresi(acik);
            // Bugun kartindan gelen `?yaz=1` pencere kapaninca adresten kalkar (yenilemede yeniden acilmaz).
            if (!acik && yazAcik) {
              const adres = new URL(window.location.href);
              adres.searchParams.delete('yaz');
              window.history.replaceState(null, '', adres);
            }
          }}
          ogrenciId={ogrenciId}
          ogrenciAd={ad}
          bitti={bildir}
        />
      ) : null}
      {oneriPenceresi ? (
        <OneriFormu
          acik
          degisti={setOneriPenceresi}
          ogrenciId={ogrenciId}
          ogrenciAd={ad}
          bitti={bildir}
        />
      ) : null}
    </div>
  );
}

function Bolum({ baslik, id, children }: { baslik: string; id: string; children: ReactNode }) {
  return (
    <Kart aria-labelledby={id} className="flex flex-col">
      <h3 id={id} className="border-b border-kenar px-5 py-3 text-base font-semibold">
        {baslik}
      </h3>
      {children}
    </Kart>
  );
}
