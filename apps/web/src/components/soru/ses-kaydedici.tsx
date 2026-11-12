'use client';

import { t } from '@kopru/i18n';
import { Mic, RotateCcw, Square, Trash2 } from 'lucide-react';
import { useEffect, useReducer, useRef, useState } from 'react';

import { YuklemeSatiri } from './yukleme-satiri';

import { Dugme } from '@/components/ui/button';
import { Uyari } from '@/components/ui/uyari';
import {
  KAYIT_BASLANGIC,
  SES_EN_FAZLA_SN,
  kayitIlerlet,
  sureBicimle,
  sureSaniyeYap,
  tarayicidaSesBicimi,
  type SesBicimi,
} from '@/lib/soru/ses';

export interface SesKaydi {
  sureSn: number;
  /** Yukleme tamamlaninca dolar. */
  dosyaId: string | null;
}

interface Kayit {
  blob: Blob;
  url: string;
  sureSn: number;
  bicim: SesBicimi;
}

/**
 * Sesli anlatim kaydi (`MediaRecorder`): en cok 180 sn, sure gostergesi, dinle ve yeniden kaydet. Tarayici
 * `audio/mp4` destekliyorsa onu, degilse `audio/webm;codecs=opus` kullanir. Bitince kendiliginden yuklenir.
 */
export function SesKaydedici({ degisti }: { degisti: (kayit: SesKaydi | null) => void }) {
  const [durum, olay] = useReducer(
    (d: typeof KAYIT_BASLANGIC, o: Parameters<typeof kayitIlerlet>[1]) => kayitIlerlet(d, o),
    KAYIT_BASLANGIC,
  );
  const [kayit, setKayit] = useState<Kayit | null>(null);
  const [hata, setHata] = useState<'destek' | 'izin' | 'genel' | null>(null);
  const kaydedici = useRef<MediaRecorder | null>(null);
  const akis = useRef<MediaStream | null>(null);
  const parcalar = useRef<Blob[]>([]);
  const baslangic = useRef(0);
  const sayac = useRef<ReturnType<typeof setInterval> | null>(null);
  const bicim = useRef<SesBicimi | null>(null);
  const degistiRef = useRef(degisti);
  useEffect(() => {
    degistiRef.current = degisti;
  });

  const sayaciDurdur = () => {
    if (sayac.current) clearInterval(sayac.current);
    sayac.current = null;
  };
  const akisiKapat = () => {
    akis.current?.getTracks().forEach((iz) => {
      iz.stop();
    });
    akis.current = null;
  };

  // Sayfadan ayrilirken mikrofonu birak.
  useEffect(
    () => () => {
      sayaciDurdur();
      if (kaydedici.current?.state === 'recording') kaydedici.current.stop();
      akisiKapat();
    },
    [],
  );

  // Sure siniri dolunca kayit kendiliginden biter.
  useEffect(() => {
    if (durum.siniraUlasti && kaydedici.current?.state === 'recording') kaydedici.current.stop();
  }, [durum.siniraUlasti]);

  useEffect(() => {
    return () => {
      if (kayit) URL.revokeObjectURL(kayit.url);
    };
  }, [kayit]);

  const basla = async () => {
    setHata(null);
    const b = tarayicidaSesBicimi();
    const aygitlar = navigator.mediaDevices as MediaDevices | undefined;
    if (!b || !aygitlar) {
      setHata('destek');
      return;
    }
    let stream: MediaStream;
    try {
      stream = await aygitlar.getUserMedia({ audio: true });
    } catch {
      setHata('izin');
      return;
    }
    bicim.current = b;
    akis.current = stream;
    parcalar.current = [];
    const k = new MediaRecorder(stream, { mimeType: b.kayitTuru });
    kaydedici.current = k;
    k.ondataavailable = (e) => {
      if (e.data.size > 0) parcalar.current.push(e.data);
    };
    k.onerror = () => {
      sayaciDurdur();
      akisiKapat();
      olay({ tur: 'hata' });
      setHata('genel');
    };
    k.onstop = () => {
      sayaciDurdur();
      akisiKapat();
      const ms = performance.now() - baslangic.current;
      const blob = new Blob(parcalar.current, { type: b.kayitTuru });
      if (blob.size === 0) {
        olay({ tur: 'hata' });
        setHata('genel');
        return;
      }
      const sureSn = sureSaniyeYap(ms);
      olay({ tur: 'bitir' });
      setKayit({ blob, url: URL.createObjectURL(blob), sureSn, bicim: b });
      degistiRef.current({ sureSn, dosyaId: null });
    };
    olay({ tur: 'basla' });
    baslangic.current = performance.now();
    k.start(1000);
    sayac.current = setInterval(() => {
      olay({ tur: 'tik', gecenMs: performance.now() - baslangic.current });
    }, 250);
  };

  const durdur = () => {
    if (kaydedici.current?.state === 'recording') kaydedici.current.stop();
  };

  const sil = () => {
    setKayit(null);
    olay({ tur: 'sifirla' });
    degistiRef.current(null);
  };

  return (
    <div className="flex flex-col gap-3" data-testid="ses-kaydedici">
      {hata ? <Uyari>{t(`soruSor.ses.hata.${hata}`)}</Uyari> : null}
      {durum.asama === 'kaydediyor' ? (
        <div
          className="flex flex-col gap-2"
          role="group"
          aria-label={t('soruSor.ses.kaydediliyor')}
        >
          <p className="flex items-center gap-2 text-sm font-medium">
            <span aria-hidden className="size-2.5 animate-pulse rounded-full bg-hata" />
            {t('soruSor.ses.kaydediliyor')}
            <span data-testid="ses-suresi" aria-live="off">
              {sureBicimle(durum.gecenMs / 1000)} / {sureBicimle(SES_EN_FAZLA_SN)}
            </span>
          </p>
          <progress
            max={SES_EN_FAZLA_SN}
            value={Math.min(SES_EN_FAZLA_SN, durum.gecenMs / 1000)}
            aria-label={t('soruSor.ses.ilerleme')}
            className="h-1.5 w-full overflow-hidden rounded-full [&::-moz-progress-bar]:bg-birincil [&::-webkit-progress-bar]:bg-yuzey-ikincil [&::-webkit-progress-value]:bg-birincil"
          />
          <Dugme type="button" gorunum="ikincil" onClick={durdur} className="self-start">
            <Square aria-hidden />
            {t('soruSor.ses.durdur')}
          </Dugme>
        </div>
      ) : kayit ? (
        <div className="flex flex-col gap-2">
          {durum.siniraUlasti ? (
            <p role="status" className="text-sm text-metin-ikincil">
              {t('soruSor.ses.sinirDoldu', { sure: sureBicimle(SES_EN_FAZLA_SN) })}
            </p>
          ) : null}
          <audio controls src={kayit.url} aria-label={t('soruSor.ses.dinle')} className="w-full" />
          <p className="text-xs text-metin-ikincil">
            {t('soruSor.ek.sure', { sure: sureBicimle(kayit.sureSn) })}
          </p>
          <YuklemeSatiri
            blob={kayit.blob}
            tur="soru_ses"
            mime={kayit.bicim.mime}
            etiket={t('soruSor.ses.yuklemeEtiketi')}
            hazirOldu={(id) => {
              degistiRef.current({ sureSn: kayit.sureSn, dosyaId: id });
            }}
          />
          <div className="flex flex-wrap gap-2">
            <Dugme
              type="button"
              gorunum="ikincil"
              boyut="sm"
              onClick={() => {
                sil();
                void basla();
              }}
            >
              <RotateCcw aria-hidden />
              {t('soruSor.ses.yenidenKaydet')}
            </Dugme>
            <Dugme type="button" gorunum="hayalet" boyut="sm" onClick={sil}>
              <Trash2 aria-hidden />
              {t('soruSor.ses.sil')}
            </Dugme>
          </div>
        </div>
      ) : (
        <Dugme type="button" gorunum="ikincil" onClick={() => void basla()} className="self-start">
          <Mic aria-hidden />
          {t('soruSor.ses.kaydet')}
        </Dugme>
      )}
    </div>
  );
}
