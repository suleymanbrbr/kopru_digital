'use client';

import { t } from '@kopru/i18n';
import { Eraser, Pencil, Redo2, Trash2, Undo2 } from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState, type PointerEvent } from 'react';

import { Dugme } from '@/components/ui/button';
import { Pencere } from '@/components/ui/pencere';
import { Uyari } from '@/components/ui/uyari';
import { cn } from '@/lib/cn';
import {
  CIZIM_RENKLERI,
  KALEM_KALINLIGI,
  SILGI_KALINLIGI,
  cizgiEkle,
  cizgileriCiz,
  cizimBos,
  cizimGeriAl,
  cizimVarMi,
  cizimVerisiYap,
  cizimYinele,
  geriAlinabilir,
  yinelenebilir,
  type CizimAraci,
  type CizimGecmisi,
  type CizimRengi,
  type CizimVerisi,
  type Cizgi,
} from '@/lib/soru/cizim';
import { canvasBlob } from '@/lib/soru/gorsel';

export interface CizimSonucu {
  /** Duzlestirilmis (gorsel + cizim) PNG. */
  png: Blob;
  veri: CizimVerisi;
  /** Gorunur (kalem) cizgi var mi; yoksa cagiran isareti hic eklemez. */
  cizimVar: boolean;
}

const PNG_EN_FAZLA_BAYT = 9 * 1024 * 1024;
const GORUNTU_UZUN_KENAR = 2000;

/** Gorseli yukler. Uzak adreslerde `crossOrigin` gerekir ki canvas "kirlenmesin" (PNG disa aktarilabilsin). */
function gorselYukle(url: string): Promise<HTMLImageElement> {
  return new Promise((coz, reddet) => {
    const img = new Image();
    if (!url.startsWith('blob:') && !url.startsWith('data:')) img.crossOrigin = 'anonymous';
    img.onload = () => {
      coz(img);
    };
    img.onerror = () => {
      reddet(new Error('gorsel'));
    };
    img.src = url;
  });
}

async function duzlestir(
  img: HTMLImageElement,
  gecmis: CizimGecmisi,
): Promise<{ png: Blob; genislik: number; yukseklik: number }> {
  const uzun = Math.max(img.naturalWidth, img.naturalHeight);
  for (const kenar of [GORUNTU_UZUN_KENAR, 1400, 1000]) {
    const olcek = Math.min(1, kenar / uzun);
    const g = Math.max(1, Math.round(img.naturalWidth * olcek));
    const y = Math.max(1, Math.round(img.naturalHeight * olcek));
    const cikti = document.createElement('canvas');
    cikti.width = g;
    cikti.height = y;
    const ctx = cikti.getContext('2d');
    if (!ctx) throw new Error('canvas');
    ctx.drawImage(img, 0, 0, g, y);
    const katman = document.createElement('canvas');
    katman.width = g;
    katman.height = y;
    const kctx = katman.getContext('2d');
    if (!kctx) throw new Error('canvas');
    cizgileriCiz(kctx, gecmis.cizgiler, g, y);
    ctx.drawImage(katman, 0, 0);
    const png = await canvasBlob(cikti, 'image/png');
    if (png.size <= PNG_EN_FAZLA_BAYT || kenar === 1000) return { png, genislik: g, yukseklik: y };
  }
  throw new Error('png');
}

/**
 * Fotograf uzerine cizim penceresi. Kalem (ve `silgi` aciksa silgi), 3 renk, geri al/yinele/temizle.
 * Tamamlaninca duzlestirilmis PNG ve vektor cizgi verisi (`cizim_verisi`) doner. Imlec/dokunma ile cizilir;
 * cizim istege baglidir, klavye kullanicilari fotografi cizimsiz da gonderebilir.
 */
export function CizimTuvali({
  acik,
  kapat,
  gorselUrl,
  baslik,
  silgi,
  tamam,
}: {
  acik: boolean;
  kapat: () => void;
  gorselUrl: string;
  baslik: string;
  silgi: boolean;
  tamam: (sonuc: CizimSonucu) => void;
}) {
  const kimlik = useId();
  const tuval = useRef<HTMLCanvasElement>(null);
  const katman = useRef<HTMLCanvasElement | null>(null);
  const resim = useRef<HTMLImageElement | null>(null);
  const aktif = useRef<Cizgi | null>(null);
  const [gecmis, setGecmis] = useState<CizimGecmisi>(cizimBos);
  const gecmisRef = useRef(gecmis);
  useEffect(() => {
    gecmisRef.current = gecmis;
  });
  const [arac, setArac] = useState<CizimAraci>('kalem');
  const [renk, setRenk] = useState<CizimRengi>('kirmizi');
  const [durum, setDurum] = useState<'yukleniyor' | 'hazir' | 'hata' | 'kaydediyor' | 'kayit-hata'>(
    'yukleniyor',
  );

  const ciz = useCallback(() => {
    const c = tuval.current;
    const img = resim.current;
    const k = katman.current;
    if (!c || !img || !k) return;
    const ctx = c.getContext('2d');
    const kctx = k.getContext('2d');
    if (!ctx || !kctx) return;
    kctx.clearRect(0, 0, k.width, k.height);
    const cizgiler = aktif.current
      ? [...gecmisRef.current.cizgiler, aktif.current]
      : gecmisRef.current.cizgiler;
    cizgileriCiz(kctx, cizgiler, k.width, k.height);
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    ctx.drawImage(k, 0, 0);
  }, []);

  useEffect(() => {
    if (!acik) return;
    let iptal = false;
    gorselYukle(gorselUrl).then(
      (img) => {
        if (iptal) return;
        resim.current = img;
        const olcek = Math.min(
          1,
          GORUNTU_UZUN_KENAR / Math.max(img.naturalWidth, img.naturalHeight),
        );
        // Gorunen tuval ekran icin yeterli cozunurluktedir; disa aktarimda tam boyut yeniden cizilir.
        const g = Math.max(
          1,
          Math.round(img.naturalWidth * Math.min(olcek, 1200 / img.naturalWidth)),
        );
        const y = Math.max(1, Math.round((g * img.naturalHeight) / img.naturalWidth));
        const k = document.createElement('canvas');
        k.width = g;
        k.height = y;
        katman.current = k;
        setDurum('hazir');
      },
      () => {
        if (!iptal) setDurum('hata');
      },
    );
    return () => {
      iptal = true;
    };
  }, [acik, gorselUrl]);

  useEffect(() => {
    const c = tuval.current;
    const k = katman.current;
    if (durum !== 'hazir' || !c || !k) return;
    c.width = k.width;
    c.height = k.height;
    ciz();
  }, [durum, ciz]);

  useEffect(() => {
    ciz();
  }, [gecmis, ciz]);

  const nokta = (e: PointerEvent<HTMLCanvasElement>): [number, number] => {
    const r = e.currentTarget.getBoundingClientRect();
    const sinir = (v: number) => Math.min(1, Math.max(0, v));
    return [sinir((e.clientX - r.left) / r.width), sinir((e.clientY - r.top) / r.height)];
  };

  const baslat = (e: PointerEvent<HTMLCanvasElement>) => {
    if (durum !== 'hazir' || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const [x, y] = nokta(e);
    aktif.current = {
      arac,
      renk: CIZIM_RENKLERI.find((r) => r.kod === renk)?.hex ?? '#dc2626',
      kalinlik: arac === 'silgi' ? SILGI_KALINLIGI : KALEM_KALINLIGI,
      noktalar: [x, y],
    };
    ciz();
  };
  const surdur = (e: PointerEvent<HTMLCanvasElement>) => {
    if (!aktif.current) return;
    const [x, y] = nokta(e);
    aktif.current.noktalar.push(x, y);
    ciz();
  };
  const bitir = () => {
    const c = aktif.current;
    if (!c) return;
    aktif.current = null;
    setGecmis((g) => cizgiEkle(g, c));
  };

  const kaydet = async () => {
    const img = resim.current;
    if (!img) return;
    setDurum('kaydediyor');
    try {
      const sonuc = await duzlestir(img, gecmis);
      tamam({
        png: sonuc.png,
        veri: cizimVerisiYap(gecmis, sonuc.genislik, sonuc.yukseklik),
        cizimVar: cizimVarMi(gecmis),
      });
      setDurum('hazir');
    } catch {
      setDurum('kayit-hata');
    }
  };

  const arac_dugmesi = (a: CizimAraci, ad: string, Ikon: typeof Pencil) => (
    <Dugme
      type="button"
      gorunum={arac === a ? 'birincil' : 'ikincil'}
      boyut="sm"
      aria-pressed={arac === a}
      onClick={() => {
        setArac(a);
      }}
    >
      <Ikon aria-hidden />
      {ad}
    </Dugme>
  );

  return (
    <Pencere
      acik={acik}
      degisti={(a) => {
        if (!a) kapat();
      }}
      baslik={baslik}
      aciklama={t('soruSor.cizim.aciklama')}
      genis
    >
      <div className="flex flex-col gap-3">
        <div
          role="toolbar"
          aria-label={t('soruSor.cizim.araclar')}
          className="flex flex-wrap items-center gap-2"
        >
          {arac_dugmesi('kalem', t('soruSor.cizim.kalem'), Pencil)}
          {silgi ? arac_dugmesi('silgi', t('soruSor.cizim.silgi'), Eraser) : null}
          <div
            role="radiogroup"
            aria-label={t('soruSor.cizim.renk')}
            className="flex items-center gap-1.5"
          >
            {CIZIM_RENKLERI.map((r) => (
              <label key={r.kod} className="cursor-pointer">
                <input
                  type="radio"
                  name={`${kimlik}-renk`}
                  value={r.kod}
                  checked={renk === r.kod}
                  onChange={() => {
                    setRenk(r.kod);
                    setArac('kalem');
                  }}
                  className="peer sr-only"
                />
                <span
                  className={cn(
                    'flex h-9 min-w-9 items-center justify-center gap-1.5 rounded-orta border-2 border-kenar px-2 text-xs font-medium',
                    'peer-checked:border-birincil peer-checked:bg-birincil-yumusak peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2',
                  )}
                >
                  <span
                    aria-hidden
                    className="size-4 rounded-full border border-notr-1000/20"
                    style={{ backgroundColor: r.hex }}
                  />
                  {t(`soruSor.cizim.renkler.${r.kod}`)}
                </span>
              </label>
            ))}
          </div>
          <div className="ml-auto flex gap-1.5">
            <Dugme
              type="button"
              gorunum="ikincil"
              boyut="sm"
              disabled={!geriAlinabilir(gecmis)}
              onClick={() => {
                setGecmis(cizimGeriAl);
              }}
            >
              <Undo2 aria-hidden />
              {t('soruSor.cizim.geriAl')}
            </Dugme>
            <Dugme
              type="button"
              gorunum="ikincil"
              boyut="sm"
              disabled={!yinelenebilir(gecmis)}
              onClick={() => {
                setGecmis(cizimYinele);
              }}
            >
              <Redo2 aria-hidden />
              {t('soruSor.cizim.yinele')}
            </Dugme>
            <Dugme
              type="button"
              gorunum="hayalet"
              boyut="sm"
              disabled={!geriAlinabilir(gecmis)}
              onClick={() => {
                setGecmis(cizimBos());
              }}
            >
              <Trash2 aria-hidden />
              {t('soruSor.cizim.temizle')}
            </Dugme>
          </div>
        </div>

        {durum === 'hata' ? (
          <Uyari>{t('soruSor.cizim.gorselYuklenemedi')}</Uyari>
        ) : durum === 'yukleniyor' ? (
          <p role="status" className="py-10 text-center text-sm text-metin-ikincil">
            {t('ortak.yukleniyor')}
          </p>
        ) : null}
        {durum === 'kayit-hata' ? <Uyari>{t('soruSor.cizim.kaydedilemedi')}</Uyari> : null}

        <canvas
          ref={tuval}
          role="img"
          aria-label={t('soruSor.cizim.alan')}
          data-testid="cizim-tuvali"
          onPointerDown={baslat}
          onPointerMove={surdur}
          onPointerUp={bitir}
          onPointerCancel={bitir}
          className={cn(
            'max-h-[60dvh] w-full touch-none cursor-crosshair rounded-orta border border-kenar bg-yuzey-ikincil object-contain',
            durum === 'hazir' || durum === 'kaydediyor' || durum === 'kayit-hata' ? '' : 'hidden',
          )}
        />

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Dugme type="button" gorunum="ikincil" onClick={kapat}>
            {t('ortak.vazgec')}
          </Dugme>
          <Dugme
            type="button"
            disabled={durum !== 'hazir' && durum !== 'kayit-hata'}
            onClick={() => void kaydet()}
          >
            {durum === 'kaydediyor'
              ? t('ortak.yukleniyor')
              : cizimVarMi(gecmis)
                ? t('soruSor.cizim.tamam')
                : t('soruSor.cizim.cizimsizTamam')}
          </Dugme>
        </div>
      </div>
    </Pencere>
  );
}
