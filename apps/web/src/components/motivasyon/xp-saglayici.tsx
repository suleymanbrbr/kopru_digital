'use client';

import { MotivasyonOgrenciDurumuSema, type MotivasyonOgrenciDurumu } from '@kopru/contracts';
import { t } from '@kopru/i18n';
import { useQueryClient } from '@tanstack/react-query';
import { Sparkles } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

import { KarakterGorseli } from './ortak';

import { Dugme } from '@/components/ui/button';
import { Pencere } from '@/components/ui/pencere';
import { useKurum } from '@/kurum/baglam';
import { motivasyonIstek } from '@/lib/hesap-istek';
import { benimAnahtari, motivasyonAnahtari, useBenim } from '@/lib/motivasyon/veri';
import { XP_OLAYI, XP_YENIDEN_CEKME_MS, xpFarki, type XpFarki } from '@/lib/motivasyon/xp';

const ROZET_SURESI_MS = 3600;

function hareketAzaltilmisMi(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

interface UcanRozet extends XpFarki {
  id: number;
}

/**
 * Merkezi XP geri bildirimi. Ogrenci bir eylem yaptiginda (`servisIstek` -> `XP_OLAYI`) `benim` kisa
 * gecikmeyle yeniden cekilir; onceki degerle fark "+N XP" olarak ucan bir rozet gosterilir, seviye
 * atlama ve evrimde kutlama penceresi acilir. Sunucu XP'yi olay tuketicisiyle gecikmeli yazabildigi icin
 * fark bulunana kadar birkac kez denenir. `prefers-reduced-motion` iken animasyon yoktur, yalniz metin.
 * Yalniz oyunlastirma acik ogrenci icin etkindir; diger rollerde cocuklari aynen gosterir.
 */
export function XpSaglayici({ children }: { children: ReactNode }) {
  const { rol, uyelik, acikModuller } = useKurum();
  const etkin = rol === 'ogrenci' && acikModuller.includes('oyunlastirma');
  return (
    <>
      {children}
      {etkin ? <XpDinleyici kurumId={uyelik.kurumId} /> : null}
    </>
  );
}

function XpDinleyici({ kurumId }: { kurumId: string }) {
  const qc = useQueryClient();
  const benim = useBenim(kurumId);
  const [rozet, setRozet] = useState<UcanRozet | null>(null);
  const [kutlama, setKutlama] = useState<XpFarki | null>(null);
  const sayac = useRef(0);
  const aktif = useRef(false);
  const rozetZamani = useRef<number | undefined>(undefined);

  const goster = useCallback((fark: XpFarki) => {
    sayac.current += 1;
    setRozet({ ...fark, id: sayac.current });
    window.clearTimeout(rozetZamani.current);
    rozetZamani.current = window.setTimeout(() => {
      setRozet(null);
    }, ROZET_SURESI_MS);
    if (fark.seviyeAtladi || fark.evrim) setKutlama(fark);
  }, []);

  useEffect(() => {
    let bitti = false;
    let zamanlayici: number | undefined;

    /** Sunucu XP'yi gecikmeli yazabilir: fark bulunana kadar artan araliklarla yeniden cek. */
    const kontrol = (taban: MotivasyonOgrenciDurumu, deneme: number) => {
      const bekle = XP_YENIDEN_CEKME_MS[deneme];
      if (bekle === undefined) {
        aktif.current = false;
        return;
      }
      zamanlayici = window.setTimeout(() => {
        void motivasyonIstek(`kurumlar/${kurumId}/benim`, { sema: MotivasyonOgrenciDurumuSema })
          .then((yeni) => {
            if (bitti) return;
            const fark = xpFarki(taban, yeni);
            if (!fark) {
              kontrol(taban, deneme + 1);
              return;
            }
            qc.setQueryData(benimAnahtari(kurumId), yeni);
            void qc.invalidateQueries({
              queryKey: motivasyonAnahtari(kurumId),
              predicate: (q) => q.queryKey[2] !== 'benim',
            });
            aktif.current = false;
            goster(fark);
          })
          .catch(() => {
            aktif.current = false;
          });
      }, bekle);
    };

    const dinle = () => {
      if (aktif.current) return;
      const taban = qc.getQueryData<MotivasyonOgrenciDurumu>(benimAnahtari(kurumId));
      if (!taban) return;
      aktif.current = true;
      kontrol(taban, 0);
    };
    window.addEventListener(XP_OLAYI, dinle);
    return () => {
      bitti = true;
      window.removeEventListener(XP_OLAYI, dinle);
      window.clearTimeout(zamanlayici);
      window.clearTimeout(rozetZamani.current);
      aktif.current = false;
    };
  }, [kurumId, qc, goster]);

  const hareketsiz = hareketAzaltilmisMi();
  const karakter = benim.data?.karakter;

  return (
    <>
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex justify-center lg:bottom-10 lg:left-64"
      >
        {rozet && rozet.xp > 0 ? (
          <span
            key={rozet.id}
            data-testid="xp-rozeti"
            className={
              hareketsiz
                ? 'rounded-full bg-birincil px-5 py-2.5 text-lg font-semibold text-birincil-uzeri shadow-lg'
                : 'xp-uc rounded-full bg-birincil px-5 py-2.5 text-lg font-semibold text-birincil-uzeri shadow-lg'
            }
          >
            <Sparkles className="mr-1.5 inline size-5 align-text-bottom" aria-hidden />
            {t('motivasyon.xp.kazandin', { n: rozet.xp })}
          </span>
        ) : null}
      </div>

      <Pencere
        acik={kutlama !== null}
        degisti={(a) => {
          if (!a) setKutlama(null);
        }}
        baslik={
          kutlama?.evrim
            ? t('motivasyon.kutlama.evrimBaslik', { ad: karakter?.ad ?? '' })
            : t('motivasyon.kutlama.seviyeBaslik', { n: kutlama?.yeniSeviye ?? 0 })
        }
        aciklama={
          kutlama?.evrim
            ? t('motivasyon.kutlama.evrimAciklama', { asama: kutlama.yeniAsama ?? 0 })
            : t('motivasyon.kutlama.seviyeAciklama')
        }
      >
        <div className="flex flex-col items-center gap-4 py-2">
          {karakter ? (
            <div className="rounded-full bg-vurgu-yumusak p-3">
              <KarakterGorseli turKodu={karakter.tur_kodu} asama={karakter.asama} boyut={140} />
            </div>
          ) : null}
          {kutlama && kutlama.xp > 0 ? (
            <p className="text-sm text-metin-ikincil">
              {t('motivasyon.xp.kazandinSr', { n: kutlama.xp })}
            </p>
          ) : null}
          <Dugme
            onClick={() => {
              setKutlama(null);
            }}
          >
            {t('motivasyon.kutlama.tamam')}
          </Dugme>
        </div>
      </Pencere>
    </>
  );
}
