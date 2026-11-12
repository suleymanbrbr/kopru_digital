'use client';

import { SORU_MESAJ_EN_FAZLA_EK, SoruDetaySema, type SoruEkGirdi } from '@kopru/contracts';
import { t } from '@kopru/i18n';
import { useMutation } from '@tanstack/react-query';
import { Camera, PenLine, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState, type SyntheticEvent } from 'react';
import type { z } from 'zod';

import { CizimTuvali } from './cizim-tuvali';
import { SesKaydedici, type SesKaydi } from './ses-kaydedici';
import { YuklemeSatiri } from './yukleme-satiri';

import { Alan } from '@/components/operasyon/ortak';
import { Dugme } from '@/components/ui/button';
import { MetinAlani } from '@/components/ui/metin-alani';
import { Uyari } from '@/components/ui/uyari';
import { useKurum } from '@/kurum/baglam';
import { hataMesaji } from '@/lib/api';
import { ogrenmeIstek } from '@/lib/hesap-istek';
import type { CizimVerisi } from '@/lib/soru/cizim';
import { KIRPMA_YOK, bitmapAc, dosyaSorunu, GorselHatasi, jpegeCevir } from '@/lib/soru/gorsel';
import { useSoruYenile } from '@/lib/soru/veri';
import { bekleMs, dosyaHazirDegilDene } from '@/lib/soru/yukleme';

type Detay = z.output<typeof SoruDetaySema>;

interface Ek {
  anahtar: string;
  tur: 'foto' | 'cizim';
  blob: Blob;
  onizleme: string;
  dosyaId: string | null;
  kaynakDosyaId?: string;
  veri?: CizimVerisi;
}

/**
 * Ogretmen cevap formu: metin, kendi cozumunun fotografi, fotograf uzerine cizim, sesli anlatim ve
 * "derste konusalim". En cok 4 ek. Ekler secilir secilmez yuklenir; hepsi `hazir` olunca gonderilir.
 */
export function CevapFormu({
  soru,
  cevaplandi,
  yenileAdres,
}: {
  soru: Detay;
  cevaplandi: () => void;
  yenileAdres: () => void;
}) {
  const { uyelik } = useKurum();
  const kurumId = uyelik.kurumId;
  const yenile = useSoruYenile(kurumId);
  const [metin, setMetin] = useState('');
  const [derste, setDerste] = useState(false);
  const [ekler, setEkler] = useState<Ek[]>([]);
  const [ses, setSes] = useState<SesKaydi | null>(null);
  const [cizimKaynagi, setCizimKaynagi] = useState<string | null>(null);
  const [fotoHata, setFotoHata] = useState<string | null>(null);
  const istekId = useRef(crypto.randomUUID());
  const fotoGirdisi = useRef<HTMLInputElement>(null);
  const ekRef = useRef(ekler);
  useEffect(() => {
    ekRef.current = ekler;
  });

  useEffect(
    () => () => {
      for (const e of ekRef.current) URL.revokeObjectURL(e.onizleme);
    },
    [],
  );

  const adetSayisi = ekler.length + (ses ? 1 : 0);
  const yerVar = adetSayisi < SORU_MESAJ_EN_FAZLA_EK;
  const yuklemeBitti = ekler.every((e) => e.dosyaId !== null) && ses?.dosyaId !== null;
  const bos = metin.trim() === '' && !derste && adetSayisi === 0;

  const ekGirdileri = (): SoruEkGirdi[] => {
    const liste: SoruEkGirdi[] = [];
    for (const e of ekler) {
      if (!e.dosyaId) continue;
      if (e.tur === 'foto') liste.push({ tur: 'fotograf', medya_dosya_id: e.dosyaId });
      else if (e.kaynakDosyaId) {
        liste.push({
          tur: 'cizimli_fotograf',
          medya_dosya_id: e.dosyaId,
          kaynak_dosya_id: e.kaynakDosyaId,
          ...(e.veri ? { cizim_verisi: e.veri as unknown as Record<string, unknown> } : {}),
        });
      }
    }
    if (ses?.dosyaId) liste.push({ tur: 'ses', medya_dosya_id: ses.dosyaId, sure_sn: ses.sureSn });
    return liste;
  };

  const gonder = useMutation({
    mutationFn: () =>
      dosyaHazirDegilDene(
        () =>
          ogrenmeIstek(`kurumlar/${kurumId}/sorular/${soru.id}/cevap`, {
            yontem: 'POST',
            sema: SoruDetaySema,
            govde: {
              ...(metin.trim() ? { metin: metin.trim() } : {}),
              derste_konusalim: derste,
              ...(adetSayisi > 0 ? { ekler: ekGirdileri() } : {}),
              istek_id: istekId.current,
            },
          }),
        bekleMs,
      ),
    onSuccess: () => {
      istekId.current = crypto.randomUUID();
      void yenile();
      cevaplandi();
    },
  });

  const fotoEkle = async (liste: FileList | null) => {
    setFotoHata(null);
    for (const dosya of Array.from(liste ?? []).slice(0, SORU_MESAJ_EN_FAZLA_EK - adetSayisi)) {
      try {
        const sorun = dosyaSorunu(dosya);
        if (sorun) throw new GorselHatasi(sorun);
        const bitmap = await bitmapAc(dosya);
        const { blob } = await jpegeCevir(bitmap, { derece: 0, kirpma: KIRPMA_YOK });
        bitmap.close();
        setEkler((o) => [
          ...o,
          {
            anahtar: crypto.randomUUID(),
            tur: 'foto',
            blob,
            onizleme: URL.createObjectURL(blob),
            dosyaId: null,
          },
        ]);
      } catch (hata) {
        const kod = hata instanceof GorselHatasi ? hata.kod : 'cozulemedi';
        setFotoHata(`${dosya.name}: ${t(`soruSor.foto.hata.${kod}`)}`);
      }
    }
  };

  const ekiKaldir = (anahtar: string) => {
    const e = ekler.find((x) => x.anahtar === anahtar);
    if (e) URL.revokeObjectURL(e.onizleme);
    setEkler((o) => o.filter((x) => x.anahtar !== anahtar));
  };

  const gonderildi = (e: SyntheticEvent) => {
    e.preventDefault();
    if (!bos && yuklemeBitti && !gonder.isPending) gonder.mutate();
  };

  const kaynakFoto = soru.fotograflar.find((f) => f.medya_dosya_id === cizimKaynagi);

  return (
    <form
      onSubmit={gonderildi}
      aria-label={t('soruSor.cevap.baslik')}
      className="flex flex-col gap-4 rounded-buyuk border border-kenar bg-yuzey p-4 sm:p-5"
    >
      <h2 className="text-base font-semibold">{t('soruSor.cevap.baslik')}</h2>
      <Alan etiket={t('soruSor.cevap.metin')}>
        {(o) => (
          <MetinAlani
            {...o}
            rows={4}
            maxLength={4000}
            value={metin}
            onChange={(e) => {
              setMetin(e.target.value);
            }}
          />
        )}
      </Alan>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-sm font-medium">
          {t('soruSor.cevap.ekler', { n: adetSayisi, enFazla: SORU_MESAJ_EN_FAZLA_EK })}
        </legend>
        <div className="flex flex-wrap gap-2">
          <Dugme
            type="button"
            gorunum="ikincil"
            disabled={!yerVar}
            onClick={() => fotoGirdisi.current?.click()}
          >
            <Camera aria-hidden />
            {t('soruSor.cevap.fotograf')}
          </Dugme>
          <input
            ref={fotoGirdisi}
            type="file"
            accept="image/*,.heic,.heif"
            multiple
            className="sr-only"
            tabIndex={-1}
            aria-label={t('soruSor.cevap.fotografGirdisi')}
            data-testid="cevap-foto-girdisi"
            onChange={(e) => {
              void fotoEkle(e.target.files);
              e.target.value = '';
            }}
          />
          {soru.fotograflar.map((f, i) => (
            <Dugme
              key={f.medya_dosya_id}
              type="button"
              gorunum="ikincil"
              disabled={!yerVar || f.adres === null}
              onClick={() => {
                setCizimKaynagi(f.medya_dosya_id);
              }}
            >
              <PenLine aria-hidden />
              {soru.fotograflar.length > 1
                ? t('soruSor.cevap.ciz.numarali', { sira: i + 1 })
                : t('soruSor.cevap.ciz.tek')}
            </Dugme>
          ))}
        </div>
        {soru.adres_alinamadi ? (
          <p className="text-sm text-metin-ikincil">
            {t('soruSor.cevap.cizimAdresYok')}{' '}
            <button type="button" onClick={yenileAdres} className="underline underline-offset-2">
              {t('soruSor.ek.yenile')}
            </button>
          </p>
        ) : null}
        {fotoHata ? <Uyari>{fotoHata}</Uyari> : null}

        {ekler.length > 0 ? (
          <ul className="grid gap-3 sm:grid-cols-2">
            {ekler.map((e, i) => (
              <li
                key={e.anahtar}
                data-testid="cevap-eki"
                className="flex flex-col gap-2 rounded-orta border border-kenar p-2"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- yerel nesne adresi */}
                <img
                  src={e.onizleme}
                  alt={
                    e.tur === 'cizim'
                      ? t('soruSor.cevap.cizimOnizleme', { sira: i + 1 })
                      : t('soruSor.cevap.fotoOnizleme', { sira: i + 1 })
                  }
                  className="aspect-[4/3] w-full rounded-kucuk bg-yuzey-ikincil object-contain"
                />
                <YuklemeSatiri
                  blob={e.blob}
                  tur={e.tur === 'cizim' ? 'soru_cizim' : 'soru_cevap_fotografi'}
                  mime={e.tur === 'cizim' ? 'image/png' : 'image/jpeg'}
                  etiket={t('soruSor.cevap.ekYuklemeEtiketi', { sira: i + 1 })}
                  hazirOldu={(id) => {
                    setEkler((o) =>
                      o.map((x) => (x.anahtar === e.anahtar ? { ...x, dosyaId: id } : x)),
                    );
                  }}
                />
                <Dugme
                  type="button"
                  gorunum="hayalet"
                  boyut="sm"
                  className="self-start"
                  onClick={() => {
                    ekiKaldir(e.anahtar);
                  }}
                >
                  <Trash2 aria-hidden />
                  {t('soruSor.cevap.ekiKaldir', { sira: i + 1 })}
                </Dugme>
              </li>
            ))}
          </ul>
        ) : null}

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">{t('soruSor.cevap.ses')}</span>
          {ses === null && !yerVar ? (
            <p className="text-sm text-metin-ikincil">{t('soruSor.cevap.ekDolu')}</p>
          ) : (
            <SesKaydedici degisti={setSes} />
          )}
        </div>
      </fieldset>

      <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
        <input
          type="checkbox"
          checked={derste}
          onChange={(e) => {
            setDerste(e.target.checked);
          }}
          className="size-5 accent-[var(--birincil)]"
        />
        {t('soruSor.cevap.derste')}
      </label>

      {gonder.isError ? <Uyari>{hataMesaji(gonder.error)}</Uyari> : null}

      <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p role="status" className="text-sm text-metin-ikincil">
          {bos
            ? t('soruSor.cevap.bosUyari')
            : !yuklemeBitti
              ? t('soruSor.form.yuklemeBekleniyor')
              : ''}
        </p>
        <Dugme type="submit" boyut="lg" disabled={bos || !yuklemeBitti || gonder.isPending}>
          {gonder.isPending ? t('soruSor.form.gonderiliyor') : t('soruSor.cevap.gonder')}
        </Dugme>
      </div>

      {cizimKaynagi && kaynakFoto?.adres ? (
        <CizimTuvali
          acik
          kapat={() => {
            setCizimKaynagi(null);
          }}
          gorselUrl={kaynakFoto.adres.asil_url}
          baslik={t('soruSor.cevap.cizBaslik')}
          silgi
          tamam={(s) => {
            const kaynak = cizimKaynagi;
            setCizimKaynagi(null);
            if (!s.cizimVar) return;
            setEkler((o) => [
              ...o,
              {
                anahtar: crypto.randomUUID(),
                tur: 'cizim',
                blob: s.png,
                onizleme: URL.createObjectURL(s.png),
                dosyaId: null,
                kaynakDosyaId: kaynak,
                veri: s.veri,
              },
            ]);
          }}
        />
      ) : null}
    </form>
  );
}
