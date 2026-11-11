'use client';

import { DenemeTopluYanitSema, type DenemeSatirHatasi } from '@kopru/contracts';
import { t } from '@kopru/i18n';
import { useMutation } from '@tanstack/react-query';
import { Download, Upload } from 'lucide-react';
import { useRef, useState } from 'react';

import { satirHatalariniCoz } from './tablo-giris';

import { Alan } from '@/components/operasyon/ortak';
import { Dugme } from '@/components/ui/button';
import { Girdi } from '@/components/ui/input';
import { Secim } from '@/components/ui/secim';
import { UygulamaHatasi, hataMesaji } from '@/lib/api';
import { servisDosyaAl, servisDosyaYukle, sorguDizgesi } from '@/lib/hesap-istek';
import { useDenemeKurallari, useOgrenmeYenile } from '@/lib/ogrenme/veri';
import { useGruplar, useSaatDilimi } from '@/lib/operasyon-verisi';
import { bugunYerel } from '@/lib/saat';

/** Excel sablonunu indirir, doldurulmus dosyayi yukler; satir hatalari tek tek gosterilir (hicbiri kaydedilmez). */
export function ExcelYukle({
  kurumId,
  bitti,
}: {
  kurumId: string;
  bitti: (mesaj: string) => void;
}) {
  const kurallar = useDenemeKurallari(kurumId);
  const gruplar = useGruplar(kurumId);
  const { saatDilimi } = useSaatDilimi(kurumId);
  const yenile = useOgrenmeYenile(kurumId);
  const [kod, setKod] = useState('');
  const [grupId, setGrupId] = useState('');
  const [ad, setAd] = useState('');
  const [tarih, setTarih] = useState(() => bugunYerel(saatDilimi));
  const [dosya, setDosya] = useState<File | null>(null);
  const [adHatasi, setAdHatasi] = useState<string | undefined>();
  const [hata, setHata] = useState<string | null>(null);
  const [satirHatalari, setSatirHatalari] = useState<DenemeSatirHatasi[]>([]);
  const [indirildi, setIndirildi] = useState(false);
  const girdi = useRef<HTMLInputElement>(null);

  const liste = kurallar.data?.kurallar ?? [];
  const aktifKod = kod === '' ? (liste[0]?.kod ?? '') : kod;

  const indir = useMutation({
    mutationFn: async () => {
      const { blob, dosyaAdi } = await servisDosyaAl(
        'ogrenme',
        `kurumlar/${kurumId}/denemeler/sablon.xlsx${sorguDizgesi({ kural: aktifKod, grup_id: grupId })}`,
        `deneme-sablonu-${aktifKod}.xlsx`,
      );
      const adres = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = adres;
      a.download = dosyaAdi;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => {
        URL.revokeObjectURL(adres);
      }, 1000);
    },
    onSuccess: () => {
      setIndirildi(true);
      setHata(null);
    },
    onError: (h) => {
      setHata(hataMesaji(h));
    },
  });

  const yukle = useMutation({
    mutationFn: (secilen: File) =>
      servisDosyaYukle(
        'ogrenme',
        `kurumlar/${kurumId}/denemeler/excel${sorguDizgesi({
          kural: aktifKod,
          ad: ad.trim(),
          sinav_tarihi: tarih,
          grup_id: grupId,
        })}`,
        secilen,
        DenemeTopluYanitSema,
      ),
    onSuccess: async (r) => {
      await yenile();
      setDosya(null);
      if (girdi.current) girdi.current.value = '';
      setSatirHatalari([]);
      bitti(
        t('ogrenme.deneme.excelYuklendi', {
          n: r.olusturulan_sayisi,
          atlanan: r.atlanan_satir_sayisi,
        }),
      );
    },
    onError: (h) => {
      const satirlar = satirHatalariniCoz(h);
      setSatirHatalari(satirlar);
      setHata(
        satirlar.length > 0
          ? t('ogrenme.deneme.excelSatirHatasi', { n: satirlar.length })
          : h instanceof UygulamaHatasi && h.kod === 'excel_gecersiz'
            ? t('ogrenme.deneme.excelGecersiz')
            : hataMesaji(h),
      );
    },
  });

  const gonder = () => {
    setHata(null);
    setSatirHatalari([]);
    if (!ad.trim()) {
      setAdHatasi(t('ogrenme.deneme.hata.ad'));
      return;
    }
    setAdHatasi(undefined);
    if (!dosya) {
      setHata(t('ogrenme.deneme.excelDosyaSec'));
      return;
    }
    yukle.mutate(dosya);
  };

  return (
    <div className="flex flex-col gap-4 rounded-buyuk border border-kenar bg-yuzey p-4">
      <p className="text-sm text-metin-ikincil">{t('ogrenme.deneme.excelAciklama')}</p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Alan etiket={t('ogrenme.deneme.tur')}>
          {(o) => (
            <Secim
              {...o}
              value={aktifKod}
              onChange={(e) => {
                setKod(e.target.value);
              }}
            >
              {liste.map((k) => (
                <option key={k.id} value={k.kod}>
                  {k.ad}
                </option>
              ))}
            </Secim>
          )}
        </Alan>
        <Alan etiket={t('ogrenme.odev.grup')} yardim={t('ogrenme.deneme.excelGrupYardim')}>
          {(o) => (
            <Secim
              {...o}
              value={grupId}
              onChange={(e) => {
                setGrupId(e.target.value);
              }}
            >
              <option value="">{t('ogrenme.deneme.tumOgrenciler')}</option>
              {gruplar.secenekler.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.etiket}
                </option>
              ))}
            </Secim>
          )}
        </Alan>
        <Alan etiket={t('ogrenme.deneme.ad')} hata={adHatasi}>
          {(o) => (
            <Girdi
              {...o}
              value={ad}
              maxLength={200}
              onChange={(e) => {
                setAd(e.target.value);
              }}
            />
          )}
        </Alan>
        <Alan etiket={t('ogrenme.deneme.tarih')}>
          {(o) => (
            <Girdi
              {...o}
              type="date"
              value={tarih}
              onChange={(e) => {
                setTarih(e.target.value);
              }}
            />
          )}
        </Alan>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <Dugme
          gorunum="ikincil"
          disabled={indir.isPending || aktifKod === ''}
          onClick={() => {
            indir.mutate();
          }}
        >
          <Download aria-hidden />
          {t('ogrenme.deneme.sablonIndir')}
        </Dugme>
        <div className="min-w-60 flex-1">
          <Alan etiket={t('ogrenme.deneme.excelDosya')}>
            {(o) => (
              <input
                {...o}
                ref={girdi}
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={(e) => {
                  setDosya(e.target.files?.[0] ?? null);
                }}
                className="min-h-11 w-full rounded-orta border border-kenar bg-yuzey px-3 py-2 text-sm file:mr-3 file:rounded-orta file:border-0 file:bg-yuzey-ikincil file:px-3 file:py-1.5 file:text-sm"
              />
            )}
          </Alan>
        </div>
        <Dugme disabled={yukle.isPending} onClick={gonder}>
          <Upload aria-hidden />
          {yukle.isPending ? t('ortak.yukleniyor') : t('ogrenme.deneme.excelYukle')}
        </Dugme>
      </div>
      {indirildi ? (
        <p role="status" className="text-sm text-metin-ikincil">
          {t('ogrenme.deneme.sablonIndirildi')}
        </p>
      ) : null}
      {hata ? (
        <div
          role="alert"
          className="flex flex-col gap-2 rounded-orta bg-hata-yumusak px-3 py-2.5 text-sm text-hata"
        >
          <p>{hata}</p>
          {satirHatalari.length > 0 ? (
            <div
              tabIndex={0}
              role="region"
              aria-label={t('ogrenme.deneme.excelHataTablo')}
              className="overflow-x-auto"
            >
              <table className="w-full min-w-[20rem] text-left">
                <caption className="sr-only">{t('ogrenme.deneme.excelHataTablo')}</caption>
                <thead>
                  <tr>
                    <th scope="col" className="py-1 pr-3 font-medium">
                      {t('ogrenme.deneme.excelSatir')}
                    </th>
                    <th scope="col" className="py-1 font-medium">
                      {t('ogrenme.deneme.excelSorun')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {satirHatalari.map((s, i) => (
                    <tr key={`${String(s.satir)}-${String(i)}`}>
                      <th scope="row" className="py-1 pr-3 font-medium">
                        {s.satir}
                      </th>
                      <td className="py-1">{s.mesaj}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
