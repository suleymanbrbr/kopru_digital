'use client';

import { t } from '@kopru/i18n';
import { RotateCcw, RotateCw } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';

import { Dugme } from '@/components/ui/button';
import { Pencere } from '@/components/ui/pencere';
import {
  KIRPMA_YOK,
  dondurulmusCanvas,
  kirpmaKenariAyarla,
  kirpmaVarMi,
  sonrakiDerece,
  type Derece,
  type Kirpma,
} from '@/lib/soru/gorsel';

export interface DuzenlemeSonucu {
  derece: Derece;
  kirpma: Kirpma;
}

const KENARLAR = ['sol', 'ust', 'sag', 'alt'] as const;
const ONIZLEME_UZUN_KENAR = 720;

/**
 * Basit kirp/dondur: 90 derece donusler ve her kenardan icerye cekilen kirpma cercevesi (kaydirgac).
 * Onizleme, cercevenin disini koyulastirir. Sonuc `jpegeCevir`e verilir.
 */
export function GorselDuzenleyici({
  acik,
  kapat,
  bitmap,
  baslangic,
  tamam,
}: {
  acik: boolean;
  kapat: () => void;
  bitmap: ImageBitmap;
  baslangic: DuzenlemeSonucu;
  tamam: (sonuc: DuzenlemeSonucu) => void;
}) {
  const kimlik = useId();
  // Tuval pencerenin portalinda sonradan baglanir: ref yerine state ile efekt tetiklenir.
  const tuval = useRef<HTMLCanvasElement | null>(null);
  const [tuvalHazir, setTuvalHazir] = useState(false);
  const [derece, setDerece] = useState<Derece>(baslangic.derece);
  const [kirpma, setKirpma] = useState<Kirpma>(baslangic.kirpma);

  useEffect(() => {
    const c = tuval.current;
    if (!acik || !c) return;
    const donuk = dondurulmusCanvas(bitmap, derece);
    const olcek = Math.min(1, ONIZLEME_UZUN_KENAR / Math.max(donuk.width, donuk.height));
    c.width = Math.max(1, Math.round(donuk.width * olcek));
    c.height = Math.max(1, Math.round(donuk.height * olcek));
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(donuk, 0, 0, c.width, c.height);
    // Cercevenin disini koyulastir, cerceveyi ciz.
    const x = kirpma.sol * c.width;
    const y = kirpma.ust * c.height;
    const g = (1 - kirpma.sol - kirpma.sag) * c.width;
    const h = (1 - kirpma.ust - kirpma.alt) * c.height;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, 0, c.width, y);
    ctx.fillRect(0, y + h, c.width, c.height - y - h);
    ctx.fillRect(0, y, x, h);
    ctx.fillRect(x + g, y, c.width - x - g, h);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, Math.max(1, g - 2), Math.max(1, h - 2));
  }, [acik, bitmap, derece, kirpma, tuvalHazir]);

  const donder = (yon: 1 | -1) => {
    setDerece((d) => sonrakiDerece(d, yon));
    // Donus eksenleri degistirir: kirpma cercevesi sifirlanir.
    setKirpma(KIRPMA_YOK);
  };

  return (
    <Pencere
      acik={acik}
      degisti={(a) => {
        if (!a) kapat();
      }}
      baslik={t('soruSor.duzenle.baslik')}
      aciklama={t('soruSor.duzenle.aciklama')}
      genis
    >
      <div className="flex flex-col gap-4">
        <canvas
          ref={(el) => {
            tuval.current = el;
            setTuvalHazir(el !== null);
          }}
          role="img"
          aria-label={t('soruSor.duzenle.onizleme')}
          className="mx-auto max-h-[50dvh] max-w-full rounded-orta border border-kenar"
        />
        <div className="flex flex-wrap gap-2">
          <Dugme
            type="button"
            gorunum="ikincil"
            boyut="sm"
            onClick={() => {
              donder(-1);
            }}
          >
            <RotateCcw aria-hidden />
            {t('soruSor.duzenle.solaDondur')}
          </Dugme>
          <Dugme
            type="button"
            gorunum="ikincil"
            boyut="sm"
            onClick={() => {
              donder(1);
            }}
          >
            <RotateCw aria-hidden />
            {t('soruSor.duzenle.sagaDondur')}
          </Dugme>
          <Dugme
            type="button"
            gorunum="hayalet"
            boyut="sm"
            disabled={!kirpmaVarMi(kirpma)}
            onClick={() => {
              setKirpma(KIRPMA_YOK);
            }}
          >
            {t('soruSor.duzenle.kirpmayiSifirla')}
          </Dugme>
        </div>
        <fieldset className="grid grid-cols-2 gap-x-4 gap-y-3">
          <legend className="mb-2 text-sm font-medium">{t('soruSor.duzenle.kirpma')}</legend>
          {KENARLAR.map((k) => (
            <label key={k} htmlFor={`${kimlik}-${k}`} className="flex flex-col gap-1 text-sm">
              <span className="flex justify-between">
                {t(`soruSor.duzenle.kenar.${k}`)}
                <span className="text-metin-ikincil">%{Math.round(kirpma[k] * 100)}</span>
              </span>
              <input
                id={`${kimlik}-${k}`}
                type="range"
                min={0}
                max={80}
                step={1}
                value={Math.round(kirpma[k] * 100)}
                onChange={(e) => {
                  setKirpma((onceki) =>
                    kirpmaKenariAyarla(onceki, k, Number(e.target.value) / 100),
                  );
                }}
                className="h-6 w-full accent-[var(--birincil)]"
              />
            </label>
          ))}
        </fieldset>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Dugme type="button" gorunum="ikincil" onClick={kapat}>
            {t('ortak.vazgec')}
          </Dugme>
          <Dugme
            type="button"
            onClick={() => {
              tamam({ derece, kirpma });
            }}
          >
            {t('soruSor.duzenle.uygula')}
          </Dugme>
        </div>
      </div>
    </Pencere>
  );
}
