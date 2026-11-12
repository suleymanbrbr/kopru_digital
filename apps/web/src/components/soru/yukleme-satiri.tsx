'use client';

import {
  medyaDosyaDurumYanitiSema,
  medyaYuklemeYanitiSema,
  type MedyaDosyaTuru,
} from '@kopru/contracts';
import { t, type MessageKey } from '@kopru/i18n';
import { CircleCheck, RotateCw } from 'lucide-react';
import { useCallback, useEffect, useReducer, useRef } from 'react';

import { Dugme } from '@/components/ui/button';
import { medyaIstek } from '@/lib/hesap-istek';
import {
  YUKLEME_BASLANGIC,
  bekleMs,
  dosyaYukle,
  putIlerlemeli,
  sha256Hex,
  yenidenDenenebilir,
  yuklemeHataKodu,
  yuklemeIlerlet,
  type YuklemeBagimliliklari,
  type YuklemeDurumu,
} from '@/lib/soru/yukleme';

/** Gercek bagimliliklar: BFF `/api/medya/*` + dogrudan presigned PUT. */
export const medyaBagimliliklari: YuklemeBagimliliklari = {
  ozet: sha256Hex,
  izinIste: (govde) =>
    medyaIstek('dosyalar', { yontem: 'POST', govde, sema: medyaYuklemeYanitiSema }),
  put: putIlerlemeli,
  tamam: (id) =>
    medyaIstek(`dosyalar/${id}/tamam`, { yontem: 'POST', sema: medyaDosyaDurumYanitiSema }),
  durum: (id) => medyaIstek(`dosyalar/${id}`, { sema: medyaDosyaDurumYanitiSema }),
  bekle: bekleMs,
};

/**
 * Tek dosyanin yukleme durumu: baglandiginda kendiliginden baslar, `yenidenDene` ayni
 * `istemci_anahtari` ile bastan calistirir (medya ayni kaydi dondurur, yinelenen dosya olusmaz).
 */
export function useDosyaYukleme({
  blob,
  tur,
  mime,
  hazirOldu,
}: {
  blob: Blob;
  tur: MedyaDosyaTuru;
  mime: string;
  hazirOldu: (dosyaId: string) => void;
}) {
  const [durum, olay] = useReducer(yuklemeIlerlet, YUKLEME_BASLANGIC);
  const anahtar = useRef(crypto.randomUUID());
  const hazirRef = useRef(hazirOldu);
  useEffect(() => {
    hazirRef.current = hazirOldu;
  });
  const sinyalRef = useRef<AbortController | null>(null);

  const calistir = useCallback(() => {
    sinyalRef.current?.abort();
    const iptal = new AbortController();
    sinyalRef.current = iptal;
    dosyaYukle(
      { tur, blob, mime, istemciAnahtari: anahtar.current, sinyal: iptal.signal },
      medyaBagimliliklari,
      (o) => {
        if (!iptal.signal.aborted) olay(o);
      },
    )
      .then((sonuc) => {
        if (!iptal.signal.aborted) hazirRef.current(sonuc.dosyaId);
      })
      .catch((hata: unknown) => {
        if (!iptal.signal.aborted) olay({ tur: 'hata', kod: yuklemeHataKodu(hata) });
      });
  }, [blob, mime, tur]);

  useEffect(() => {
    calistir();
    return () => {
      sinyalRef.current?.abort();
    };
  }, [calistir]);

  return { durum, yenidenDene: calistir };
}

/** Yukleme durumu: ilerleme cubugu, hata ve "Yeniden dene". Renge dayanmaz: her durum metinle soylenir. */
export function YuklemeDurumuGostergesi({
  durum,
  yenidenDene,
  etiket,
}: {
  durum: YuklemeDurumu;
  yenidenDene: () => void;
  etiket: string;
}) {
  const yuzde = Math.round(durum.ilerleme * 100);
  if (durum.asama === 'hata') {
    const kod = durum.hata ?? 'genel';
    const tekrar = yenidenDenenebilir(kod);
    return (
      <div role="alert" className="flex flex-col gap-1.5 text-sm text-hata">
        <span>{t(`soruSor.yukleme.hata.${kod}` as MessageKey)}</span>
        {tekrar ? (
          <Dugme
            type="button"
            gorunum="ikincil"
            boyut="sm"
            onClick={yenidenDene}
            className="self-start"
          >
            <RotateCw aria-hidden />
            {t('soruSor.yukleme.yenidenDene')}
          </Dugme>
        ) : null}
      </div>
    );
  }
  if (durum.asama === 'hazir') {
    return (
      <p role="status" className="flex items-center gap-1.5 text-sm text-metin-ikincil">
        <CircleCheck className="size-4 text-basari" aria-hidden />
        {t('soruSor.yukleme.hazir')}
      </p>
    );
  }
  const metin =
    durum.asama === 'yukleniyor'
      ? t('soruSor.yukleme.yukleniyor', { yuzde })
      : durum.asama === 'isleniyor'
        ? t('soruSor.yukleme.isleniyor')
        : t('soruSor.yukleme.hazirlaniyor');
  return (
    <div role="status" className="flex flex-col gap-1">
      <span className="text-sm text-metin-ikincil">{metin}</span>
      <progress
        aria-label={etiket}
        max={100}
        value={durum.asama === 'yukleniyor' ? yuzde : undefined}
        className="h-1.5 w-full overflow-hidden rounded-full [&::-moz-progress-bar]:bg-birincil [&::-webkit-progress-bar]:bg-yuzey-ikincil [&::-webkit-progress-value]:bg-birincil"
      />
    </div>
  );
}

/** Yukleyen ve durumunu gosteren tek parca (ses, cevap fotografi, cizim). */
export function YuklemeSatiri({
  blob,
  tur,
  mime,
  etiket,
  hazirOldu,
}: {
  blob: Blob;
  tur: MedyaDosyaTuru;
  mime: string;
  etiket: string;
  hazirOldu: (dosyaId: string) => void;
}) {
  const { durum, yenidenDene } = useDosyaYukleme({ blob, tur, mime, hazirOldu });
  return <YuklemeDurumuGostergesi durum={durum} yenidenDene={yenidenDene} etiket={etiket} />;
}
