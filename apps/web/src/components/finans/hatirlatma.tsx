'use client';

import { kurusBicimle, t } from '@kopru/i18n';
import { ExternalLink } from 'lucide-react';
import { useState } from 'react';

import { dugmeStili } from '@/components/ui/button';
import { Pencere } from '@/components/ui/pencere';
import { whatsappBaglantisi } from '@/lib/operasyon';

/** Hazir hatirlatma metni: borc varsa borc, yoksa kalan ders uzerinden. Metin i18n'dedir. */
export function hatirlatmaMetni({
  odeyenAd,
  ogrenciAdi,
  bakiyeKurus,
  kalanKredi,
}: {
  odeyenAd: string | null;
  ogrenciAdi: string;
  bakiyeKurus: number;
  kalanKredi: number;
}): string {
  const ad = odeyenAd?.trim() || t('operasyon.finans.hatirlatma.genelAd');
  return bakiyeKurus < 0
    ? t('operasyon.finans.hatirlatma.sablon', {
        ad,
        ogrenci: ogrenciAdi,
        tutar: kurusBicimle(-bakiyeKurus),
      })
    : t('operasyon.finans.hatirlatma.sablonKredi', {
        ad,
        ogrenci: ogrenciAdi,
        sayi: Math.max(kalanKredi, 0),
      });
}

/**
 * Duzenlenebilir hazir WhatsApp metni. Baglanti yalniz kullanici tiklayinca acilir; uygulama hicbir
 * mesaj gondermez. Telefon yoksa baglanti yerine aciklama gosterilir.
 */
export function HatirlatmaPenceresi({
  acik,
  degisti,
  telefon,
  varsayilanMetin,
}: {
  acik: boolean;
  degisti: (acik: boolean) => void;
  telefon: string | null;
  varsayilanMetin: string;
}) {
  return (
    <Pencere
      acik={acik}
      degisti={degisti}
      baslik={t('operasyon.finans.hatirlatma.baslik')}
      aciklama={t('operasyon.finans.hatirlatma.aciklama')}
    >
      <Icerik telefon={telefon} varsayilanMetin={varsayilanMetin} />
    </Pencere>
  );
}

function Icerik({ telefon, varsayilanMetin }: { telefon: string | null; varsayilanMetin: string }) {
  const [metin, setMetin] = useState(varsayilanMetin);
  const baglanti = whatsappBaglantisi(telefon, metin);
  return (
    <div className="flex flex-col gap-3">
      <label htmlFor="hatirlatma-metni" className="text-sm font-medium">
        {t('operasyon.finans.hatirlatma.metin')}
      </label>
      <textarea
        id="hatirlatma-metni"
        rows={6}
        value={metin}
        onChange={(e) => {
          setMetin(e.target.value);
        }}
        className="w-full rounded-orta border border-kenar bg-yuzey p-3 text-base text-metin"
      />
      {baglanti ? (
        <a
          href={baglanti}
          target="_blank"
          rel="noopener noreferrer"
          className={dugmeStili({ className: 'self-end' })}
        >
          {t('operasyon.finans.hatirlatma.ac')}
          <ExternalLink aria-hidden />
        </a>
      ) : (
        <p className="text-sm text-metin-ikincil">{t('operasyon.finans.hatirlatma.telefonYok')}</p>
      )}
    </div>
  );
}
