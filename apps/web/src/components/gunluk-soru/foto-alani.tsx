'use client';

import { GUNLUK_SORU_EN_FAZLA_FOTOGRAF } from '@kopru/contracts';
import { t } from '@kopru/i18n';
import { Camera, ImagePlus, Trash2 } from 'lucide-react';
import { useRef } from 'react';

import { useFotograflar } from '@/components/soru/foto-secici';
import { YuklemeSatiri } from '@/components/soru/yukleme-satiri';
import { Dugme } from '@/components/ui/button';
import { Uyari } from '@/components/ui/uyari';

export const useGunlukFotograflar = () => useFotograflar(GUNLUK_SORU_EN_FAZLA_FOTOGRAF);
export type GunlukFotoDeposu = ReturnType<typeof useGunlukFotograflar>;

/**
 * Yanlis sorularin fotografi (isteğe bagli, en cok 5): dosya sec ya da kamera. Secilen her fotograf JPEG'e
 * cevrilir ve mevcut medya yukleme hattiyla (`gunluk_soru_fotografi`) hemen yuklenir; kirp/isaretleme yoktur.
 */
export function FotoAlani({ depo }: { depo: GunlukFotoDeposu }) {
  const dosyaGirdisi = useRef<HTMLInputElement>(null);
  const kameraGirdisi = useRef<HTMLInputElement>(null);
  const dolu = depo.fotograflar.length >= depo.enFazla;
  const sec = (liste: FileList | null) => {
    if (liste && liste.length > 0) void depo.ekle(Array.from(liste));
  };
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Dugme
          type="button"
          gorunum="ikincil"
          disabled={dolu || depo.isleniyor}
          onClick={() => dosyaGirdisi.current?.click()}
        >
          <ImagePlus aria-hidden />
          {t('gunlukSoru.form.fotoEkle')}
        </Dugme>
        <Dugme
          type="button"
          gorunum="ikincil"
          disabled={dolu || depo.isleniyor}
          onClick={() => kameraGirdisi.current?.click()}
        >
          <Camera aria-hidden />
          {t('gunlukSoru.form.fotoKamera')}
        </Dugme>
        {depo.fotograflar.length === 0 ? (
          <span className="text-sm text-metin-ikincil">{t('gunlukSoru.form.fotoYok')}</span>
        ) : null}
        <input
          ref={dosyaGirdisi}
          type="file"
          accept="image/*,.heic,.heif"
          multiple
          className="sr-only"
          tabIndex={-1}
          aria-label={t('gunlukSoru.form.fotoDosyaGirdisi')}
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
          aria-label={t('gunlukSoru.form.fotoKameraGirdisi')}
          onChange={(e) => {
            sec(e.target.files);
            e.target.value = '';
          }}
        />
      </div>
      {depo.hatalar.map((h) => (
        <Uyari key={h}>{h}</Uyari>
      ))}
      {depo.fotograflar.length > 0 ? (
        <ul
          className="grid grid-cols-2 gap-3 sm:grid-cols-3"
          aria-label={t('gunlukSoru.form.foto')}
        >
          {depo.fotograflar.map((f, i) => (
            <li
              key={f.anahtar}
              data-testid="foto-ogesi"
              className="flex flex-col gap-2 rounded-orta border border-kenar bg-yuzey p-2"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- yerel nesne adresi, Image optimizasyonu gerekmez */}
              <img
                src={f.onizleme}
                alt={t('gunlukSoru.form.fotoOnizleme', { sira: i + 1 })}
                className="aspect-[4/3] w-full rounded-kucuk bg-yuzey-ikincil object-contain"
              />
              <YuklemeSatiri
                key={`${f.anahtar}-${String(f.surum)}`}
                blob={f.blob}
                tur="gunluk_soru_fotografi"
                mime="image/jpeg"
                etiket={t('gunlukSoru.form.fotoYuklemeEtiketi', { sira: i + 1 })}
                hazirOldu={(id) => {
                  depo.guncelle(f.anahtar, () => ({ dosyaId: id }));
                }}
              />
              <Dugme
                type="button"
                gorunum="hayalet"
                boyut="sm"
                onClick={() => {
                  depo.kaldir(f.anahtar);
                }}
              >
                <Trash2 aria-hidden />
                {t('gunlukSoru.form.fotoKaldir')}
                <span className="sr-only"> {i + 1}</span>
              </Dugme>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
