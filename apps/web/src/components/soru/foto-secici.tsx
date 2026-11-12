'use client';

import { SORU_EN_FAZLA_FOTOGRAF } from '@kopru/contracts';
import { t } from '@kopru/i18n';
import { Camera, ImagePlus, PenLine, SlidersHorizontal, Trash2, Upload } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react';

import { CizimTuvali } from './cizim-tuvali';
import { GorselDuzenleyici } from './gorsel-duzenleyici';
import { YuklemeSatiri } from './yukleme-satiri';

import { Dugme } from '@/components/ui/button';
import { Uyari } from '@/components/ui/uyari';
import { cn } from '@/lib/cn';
import type { CizimVerisi } from '@/lib/soru/cizim';
import {
  GorselHatasi,
  KIRPMA_YOK,
  bitmapAc,
  jpegeCevir,
  type Derece,
  type Kirpma,
} from '@/lib/soru/gorsel';

export interface Foto {
  anahtar: string;
  dosyaAdi: string;
  bitmap: ImageBitmap;
  derece: Derece;
  kirpma: Kirpma;
  /** Yuklenecek JPEG (dondurulmus, kirpilmis, uzun kenar <= 2000 px). */
  blob: Blob;
  onizleme: string;
  /** Duzenleme sayaci: degisince yukleme yeni bir kayitla bastan baslar. */
  surum: number;
  dosyaId: string | null;
  isaret: { png: Blob; veri: CizimVerisi; onizleme: string; dosyaId: string | null } | null;
}

/** Secilen fotograflarin durumu: isleme (JPEG), yukleme sonucu (`dosyaId`) ve isaretler. */
export function useFotograflar(enFazla = SORU_EN_FAZLA_FOTOGRAF) {
  const [fotograflar, setFotograflar] = useState<Foto[]>([]);
  const [hatalar, setHatalar] = useState<string[]>([]);
  const [isleniyor, setIsleniyor] = useState(false);
  const ref = useRef(fotograflar);
  useEffect(() => {
    ref.current = fotograflar;
  });

  // Sayfadan ayrilirken nesne adreslerini ve bitmap'leri serbest birak.
  useEffect(
    () => () => {
      for (const f of ref.current) {
        URL.revokeObjectURL(f.onizleme);
        if (f.isaret) URL.revokeObjectURL(f.isaret.onizleme);
        f.bitmap.close();
      }
    },
    [],
  );

  const ekle = useCallback(
    async (dosyalar: readonly File[]) => {
      const yer = Math.max(0, enFazla - ref.current.length);
      const alinacak = dosyalar.slice(0, yer);
      const yeniHatalar: string[] = [];
      if (dosyalar.length > yer) {
        yeniHatalar.push(t('soruSor.foto.hata.fazla', { n: enFazla }));
      }
      setIsleniyor(true);
      const eklenen: Foto[] = [];
      for (const dosya of alinacak) {
        try {
          const bitmap = await bitmapAc(dosya);
          const { blob } = await jpegeCevir(bitmap, { derece: 0, kirpma: KIRPMA_YOK });
          eklenen.push({
            anahtar: crypto.randomUUID(),
            dosyaAdi: dosya.name,
            bitmap,
            derece: 0,
            kirpma: KIRPMA_YOK,
            blob,
            onizleme: URL.createObjectURL(blob),
            surum: 0,
            dosyaId: null,
            isaret: null,
          });
        } catch (hata) {
          const kod = hata instanceof GorselHatasi ? hata.kod : 'cozulemedi';
          yeniHatalar.push(`${dosya.name}: ${t(`soruSor.foto.hata.${kod}`)}`);
        }
      }
      setFotograflar((onceki) => [...onceki, ...eklenen].slice(0, enFazla));
      setHatalar(yeniHatalar);
      setIsleniyor(false);
    },
    [enFazla],
  );

  const guncelle = useCallback((anahtar: string, yama: (f: Foto) => Partial<Foto>) => {
    setFotograflar((onceki) =>
      onceki.map((f) => (f.anahtar === anahtar ? { ...f, ...yama(f) } : f)),
    );
  }, []);

  const kaldir = useCallback((anahtar: string) => {
    const f = ref.current.find((x) => x.anahtar === anahtar);
    if (f) {
      URL.revokeObjectURL(f.onizleme);
      if (f.isaret) URL.revokeObjectURL(f.isaret.onizleme);
      f.bitmap.close();
    }
    setFotograflar((onceki) => onceki.filter((x) => x.anahtar !== anahtar));
  }, []);

  const hazirMi =
    fotograflar.length > 0 &&
    fotograflar.every((f) => f.dosyaId !== null && f.isaret?.dosyaId !== null);

  const temizle = useCallback(() => {
    for (const f of ref.current) {
      URL.revokeObjectURL(f.onizleme);
      if (f.isaret) URL.revokeObjectURL(f.isaret.onizleme);
      f.bitmap.close();
    }
    setFotograflar([]);
    setHatalar([]);
  }, []);

  return { fotograflar, hatalar, isleniyor, ekle, guncelle, kaldir, temizle, hazirMi, enFazla };
}

export type FotoDeposu = ReturnType<typeof useFotograflar>;

/**
 * Fotograf secimi: dosya sec, surukle-birak, mobil tarayicida kamera (`capture`). Secilen her fotograf
 * hemen JPEG'e cevrilir ve yuklenir (ilerleme, hata, yeniden dene); kirp/dondur ve isaret ekleme buradadir.
 */
export function FotoSecici({ depo }: { depo: FotoDeposu }) {
  const dosyaGirdisi = useRef<HTMLInputElement>(null);
  const kameraGirdisi = useRef<HTMLInputElement>(null);
  const [surukleniyor, setSurukleniyor] = useState(false);
  const dolu = depo.fotograflar.length >= depo.enFazla;

  const sec = (liste: FileList | null) => {
    if (liste && liste.length > 0) void depo.ekle(Array.from(liste));
  };
  const birak = (e: DragEvent) => {
    e.preventDefault();
    setSurukleniyor(false);
    if (!dolu) sec(e.dataTransfer.files);
  };

  return (
    <div className="flex flex-col gap-3">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setSurukleniyor(true);
        }}
        onDragLeave={() => {
          setSurukleniyor(false);
        }}
        onDrop={birak}
        data-testid="foto-birakma-alani"
        className={cn(
          'flex flex-col items-center gap-3 rounded-buyuk border-2 border-dashed border-kenar px-4 py-6 text-center',
          surukleniyor && 'border-birincil bg-birincil-yumusak',
          dolu && 'opacity-60',
        )}
      >
        <Upload className="size-7 text-metin-ikincil" aria-hidden />
        <p className="text-sm text-metin-ikincil">
          {t('soruSor.foto.surukle', { n: depo.enFazla })}
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <Dugme
            type="button"
            gorunum="ikincil"
            disabled={dolu || depo.isleniyor}
            onClick={() => dosyaGirdisi.current?.click()}
          >
            <ImagePlus aria-hidden />
            {t('soruSor.foto.sec')}
          </Dugme>
          <Dugme
            type="button"
            gorunum="ikincil"
            disabled={dolu || depo.isleniyor}
            onClick={() => kameraGirdisi.current?.click()}
          >
            <Camera aria-hidden />
            {t('soruSor.foto.kamera')}
          </Dugme>
        </div>
        <input
          ref={dosyaGirdisi}
          type="file"
          accept="image/*,.heic,.heif"
          multiple
          className="sr-only"
          tabIndex={-1}
          aria-label={t('soruSor.foto.dosyaGirdisi')}
          data-testid="foto-girdisi"
          onChange={(e) => {
            sec(e.target.files);
            e.target.value = '';
          }}
        />
        <input
          ref={kameraGirdisi}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          tabIndex={-1}
          aria-label={t('soruSor.foto.kameraGirdisi')}
          onChange={(e) => {
            sec(e.target.files);
            e.target.value = '';
          }}
        />
      </div>

      {depo.isleniyor ? (
        <p role="status" className="text-sm text-metin-ikincil">
          {t('soruSor.foto.isleniyor')}
        </p>
      ) : null}
      {depo.hatalar.map((h) => (
        <Uyari key={h}>{h}</Uyari>
      ))}

      {depo.fotograflar.length > 0 ? (
        <ul className="grid gap-3 sm:grid-cols-3" aria-label={t('soruSor.foto.liste')}>
          {depo.fotograflar.map((f, i) => (
            <FotografOgesi key={f.anahtar} foto={f} sira={i + 1} depo={depo} />
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function FotografOgesi({ foto, sira, depo }: { foto: Foto; sira: number; depo: FotoDeposu }) {
  const [duzenle, setDuzenle] = useState(false);
  const [isaretAc, setIsaretAc] = useState(false);
  const [hata, setHata] = useState(false);
  const goster = foto.isaret?.onizleme ?? foto.onizleme;

  return (
    <li
      data-testid="foto-ogesi"
      className="flex flex-col gap-2 rounded-orta border border-kenar bg-yuzey p-2"
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- yerel nesne adresi, Image optimizasyonu gerekmez */}
      <img
        src={goster}
        alt={t('soruSor.foto.onizlemeAlt', { sira })}
        className="aspect-[4/3] w-full rounded-kucuk bg-yuzey-ikincil object-contain"
      />
      {foto.isaret ? (
        <p className="text-xs font-medium text-metin-ikincil">{t('soruSor.foto.isaretli')}</p>
      ) : null}
      <YuklemeSatiri
        key={`${foto.anahtar}-${String(foto.surum)}`}
        blob={foto.blob}
        tur="soru_fotografi"
        mime="image/jpeg"
        etiket={t('soruSor.foto.yuklemeEtiketi', { sira })}
        hazirOldu={(id) => {
          depo.guncelle(foto.anahtar, () => ({ dosyaId: id }));
        }}
      />
      {foto.isaret ? (
        <YuklemeSatiri
          key={`${foto.anahtar}-${String(foto.surum)}-isaret`}
          blob={foto.isaret.png}
          tur="soru_cizim"
          mime="image/png"
          etiket={t('soruSor.foto.isaretYuklemeEtiketi', { sira })}
          hazirOldu={(id) => {
            depo.guncelle(foto.anahtar, (f) =>
              f.isaret ? { isaret: { ...f.isaret, dosyaId: id } } : {},
            );
          }}
        />
      ) : null}
      {hata ? <Uyari>{t('soruSor.foto.hata.cozulemedi')}</Uyari> : null}
      <div className="flex flex-wrap gap-1.5">
        <Dugme
          type="button"
          gorunum="ikincil"
          boyut="sm"
          onClick={() => {
            setDuzenle(true);
          }}
        >
          <SlidersHorizontal aria-hidden />
          {t('soruSor.foto.duzenle')}
          <span className="sr-only"> {sira}</span>
        </Dugme>
        <Dugme
          type="button"
          gorunum="ikincil"
          boyut="sm"
          disabled={foto.dosyaId === null}
          onClick={() => {
            setIsaretAc(true);
          }}
        >
          <PenLine aria-hidden />
          {foto.isaret ? t('soruSor.foto.isaretiDegistir') : t('soruSor.foto.isaretEkle')}
          <span className="sr-only"> {sira}</span>
        </Dugme>
        <Dugme
          type="button"
          gorunum="hayalet"
          boyut="sm"
          onClick={() => {
            depo.kaldir(foto.anahtar);
          }}
        >
          <Trash2 aria-hidden />
          {t('soruSor.foto.kaldir')}
          <span className="sr-only"> {sira}</span>
        </Dugme>
      </div>

      {duzenle ? (
        <GorselDuzenleyici
          acik
          kapat={() => {
            setDuzenle(false);
          }}
          bitmap={foto.bitmap}
          baslangic={{ derece: foto.derece, kirpma: foto.kirpma }}
          tamam={(s) => {
            setDuzenle(false);
            void jpegeCevir(foto.bitmap, s).then(
              ({ blob }) => {
                URL.revokeObjectURL(foto.onizleme);
                if (foto.isaret) URL.revokeObjectURL(foto.isaret.onizleme);
                setHata(false);
                depo.guncelle(foto.anahtar, (f) => ({
                  ...s,
                  blob,
                  onizleme: URL.createObjectURL(blob),
                  surum: f.surum + 1,
                  dosyaId: null,
                  isaret: null,
                }));
              },
              () => {
                setHata(true);
              },
            );
          }}
        />
      ) : null}
      {isaretAc ? (
        <CizimTuvali
          acik
          kapat={() => {
            setIsaretAc(false);
          }}
          gorselUrl={foto.onizleme}
          baslik={t('soruSor.foto.isaretBaslik', { sira })}
          silgi={false}
          tamam={(s) => {
            setIsaretAc(false);
            if (foto.isaret) URL.revokeObjectURL(foto.isaret.onizleme);
            depo.guncelle(foto.anahtar, () => ({
              isaret: s.cizimVar
                ? { png: s.png, veri: s.veri, onizleme: URL.createObjectURL(s.png), dosyaId: null }
                : null,
            }));
          }}
        />
      ) : null}
    </li>
  );
}
