'use client';

import type { OdevOgrenciSatiriSema } from '@kopru/contracts';
import { t } from '@kopru/i18n';
import { useMutation } from '@tanstack/react-query';
import { ArrowLeft, UserPlus } from 'lucide-react';
import { useState } from 'react';
import type { z } from 'zod';

import { HataDurumu } from '@/components/hata-durumu';
import {
  BildirimKutusu,
  ListeIskeleti,
  basari,
  basarisiz,
  zamanYaz,
  type Bildirim,
} from '@/components/hesap/ortak';
import { yuzdeMetni } from '@/components/ogrenme/ortak';
import { Alan } from '@/components/operasyon/ortak';
import { Dugme } from '@/components/ui/button';
import { Pencere } from '@/components/ui/pencere';
import { Rozet } from '@/components/ui/rozet';
import { hataMesaji } from '@/lib/api';
import { bransAdi } from '@/lib/bransler';
import { ogrenmeIstek } from '@/lib/hesap-istek';
import { ogrenciOdevDurumu } from '@/lib/ogrenme/odev';
import { useOdevOzeti, useOgrenmeYenile } from '@/lib/ogrenme/veri';

type Satir = z.infer<typeof OdevOgrenciSatiriSema>;

/**
 * Odev ozeti: 30 kisilik sinifin teslim durumu tek ekranda (ad, durum, dogru orani, gecikme);
 * satirdan inceleme (tamam / eksik / tekrar + kisa not); "sonradan katilanlari ekle".
 */
export function OdevOzeti({
  kurumId,
  odevId,
  geri,
}: {
  kurumId: string;
  odevId: string;
  geri: () => void;
}) {
  const ozet = useOdevOzeti(kurumId, odevId);
  const yenile = useOgrenmeYenile(kurumId);
  const [bildirim, setBildirim] = useState<Bildirim>(null);
  const [incelenen, setIncelenen] = useState<Satir | null>(null);

  const esitle = useMutation({
    mutationFn: () =>
      ogrenmeIstek(`kurumlar/${kurumId}/odevler/${odevId}/atama-esitle`, { yontem: 'POST' }),
    onSuccess: async (r) => {
      await yenile();
      const sayi = (r as { eklenen: number } | undefined)?.eklenen ?? 0;
      setBildirim(
        basari(
          sayi > 0 ? t('ogrenme.odev.esitlendi', { n: sayi }) : t('ogrenme.odev.esitlenecekYok'),
        ),
      );
    },
    onError: (h) => {
      setBildirim(basarisiz(h));
    },
  });
  const yayinla = useMutation({
    mutationFn: () =>
      ogrenmeIstek(`kurumlar/${kurumId}/odevler/${odevId}/yayinla`, { yontem: 'POST' }),
    onSuccess: async () => {
      await yenile();
      setBildirim(basari(t('ogrenme.odev.yayinlandi')));
    },
    onError: (h) => {
      setBildirim(basarisiz(h));
    },
  });
  const kapat = useMutation({
    mutationFn: () =>
      ogrenmeIstek(`kurumlar/${kurumId}/odevler/${odevId}/kapat`, { yontem: 'POST' }),
    onSuccess: async () => {
      await yenile();
      setBildirim(basari(t('ogrenme.odev.kapatildi')));
    },
    onError: (h) => {
      setBildirim(basarisiz(h));
    },
  });

  if (ozet.isPending) return <ListeIskeleti satir={6} />;
  if (ozet.isError) {
    return (
      <HataDurumu
        baslik={t('ogrenme.odev.ozetYuklenemedi')}
        aciklama={hataMesaji(ozet.error)}
        tekrarDene={() => void ozet.refetch()}
      />
    );
  }
  const { odev, sayilar, ogrenciler } = ozet.data;
  const taslak = odev.durum === 'taslak';

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Dugme gorunum="ikincil" boyut="sm" onClick={geri}>
          <ArrowLeft aria-hidden />
          {t('ogrenme.odev.listeyeDon')}
        </Dugme>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-semibold">{odev.baslik}</h2>
          <p className="text-sm text-metin-ikincil">
            {bransAdi(odev.brans_kodu)}
            {odev.son_teslim_at
              ? ` · ${t('ogrenme.odev.sonTeslimGoster', { tarih: zamanYaz(odev.son_teslim_at) })}`
              : ''}
          </p>
        </div>
        <Rozet ton={odev.durum === 'yayinda' ? 'basari' : 'notr'}>
          {t(`ogrenme.odev.odevDurum.${odev.durum}`)}
        </Rozet>
        {taslak ? (
          <Dugme
            disabled={yayinla.isPending}
            onClick={() => {
              yayinla.mutate();
            }}
          >
            {t('ogrenme.odev.yayinla')}
          </Dugme>
        ) : null}
        {odev.durum === 'yayinda' ? (
          <>
            <Dugme
              gorunum="ikincil"
              disabled={esitle.isPending}
              onClick={() => {
                esitle.mutate();
              }}
            >
              <UserPlus aria-hidden />
              {t('ogrenme.odev.sonradanKatilanlar')}
            </Dugme>
            <Dugme
              gorunum="ikincil"
              disabled={kapat.isPending}
              onClick={() => {
                kapat.mutate();
              }}
            >
              {t('ogrenme.odev.kapat')}
            </Dugme>
          </>
        ) : null}
      </div>
      <BildirimKutusu bildirim={bildirim} />

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5" aria-label={t('ogrenme.odev.sayilar')}>
        <Sayi etiket={t('ogrenme.odev.sayi.atanan')} deger={String(sayilar.atanan)} />
        <Sayi
          etiket={t('ogrenme.odev.sayi.teslim')}
          deger={String(sayilar.teslim_edildi + sayilar.incelendi + sayilar.tekrar_istendi)}
        />
        <Sayi etiket={t('ogrenme.odev.sayi.bekleyen')} deger={String(sayilar.teslim_edildi)} />
        <Sayi etiket={t('ogrenme.odev.sayi.gec')} deger={String(sayilar.gec_teslim)} />
        <Sayi
          etiket={t('ogrenme.odev.sayi.ortalama')}
          deger={yuzdeMetni(sayilar.ortalama_dogru_orani)}
        />
      </dl>

      {ogrenciler.length === 0 ? (
        <p className="rounded-buyuk border border-kenar bg-yuzey p-6 text-center text-sm text-metin-ikincil">
          {taslak ? t('ogrenme.odev.taslakOzet') : t('ogrenme.odev.atananYok')}
        </p>
      ) : (
        <div
          tabIndex={0}
          role="region"
          aria-label={t('ogrenme.odev.sayilar')}
          className="overflow-x-auto rounded-buyuk border border-kenar bg-yuzey"
        >
          <table className="w-full min-w-[40rem] text-left text-sm">
            <caption className="sr-only">
              {t('ogrenme.odev.ozetTablo', { baslik: odev.baslik })}
            </caption>
            <thead className="border-b border-kenar text-xs uppercase tracking-wide text-metin-ikincil">
              <tr>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  {t('ogrenme.ortak.ogrenci')}
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  {t('ogrenme.odev.durumBaslik')}
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  {t('ogrenme.odev.dogruOrani')}
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  {t('ogrenme.odev.gecikme')}
                </th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium">
                  <span className="sr-only">{t('ogrenme.odev.islem')}</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-kenar">
              {ogrenciler.map((o) => {
                const d = ogrenciOdevDurumu(o.durum);
                const gecikme = o.gec_teslim;
                return (
                  <tr key={o.ogrenci_odev_id}>
                    <th scope="row" className="px-4 py-2.5 font-medium">
                      {o.gorunen_ad ?? '-'}
                    </th>
                    <td className="px-4 py-2.5">
                      <Rozet ton={d.ton}>{d.etiket}</Rozet>
                      {o.inceleme_sonucu ? (
                        <span className="ml-2 text-xs text-metin-ikincil">
                          {t(`ogrenme.odev.sonuc.${o.inceleme_sonucu}`)}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-2.5">{yuzdeMetni(o.dogru_orani)}</td>
                    <td className="px-4 py-2.5">
                      {gecikme ? <Rozet ton="hata">{t('ogrenme.odev.gecikti')}</Rozet> : '-'}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Dugme
                        boyut="sm"
                        gorunum="ikincil"
                        disabled={!o.teslim_edildi}
                        aria-label={t('ogrenme.odev.incele', { ad: o.gorunen_ad ?? '' })}
                        onClick={() => {
                          setIncelenen(o);
                        }}
                      >
                        {t('ogrenme.odev.inceleEylem')}
                      </Dugme>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {incelenen ? (
        <IncelemeFormu
          kurumId={kurumId}
          satir={incelenen}
          kapat={() => {
            setIncelenen(null);
          }}
          bitti={(m) => {
            setIncelenen(null);
            setBildirim(basari(m));
          }}
        />
      ) : null}
    </div>
  );
}

function Sayi({ etiket, deger }: { etiket: string; deger: string }) {
  return (
    <div className="rounded-buyuk border border-kenar bg-yuzey px-4 py-3">
      <dt className="text-xs text-metin-ikincil">{etiket}</dt>
      <dd className="mt-0.5 text-xl font-semibold">{deger}</dd>
    </div>
  );
}

const SONUCLAR = ['tamam', 'eksik', 'tekrar'] as const;

function IncelemeFormu({
  kurumId,
  satir,
  kapat,
  bitti,
}: {
  kurumId: string;
  satir: Satir;
  kapat: () => void;
  bitti: (mesaj: string) => void;
}) {
  const yenile = useOgrenmeYenile(kurumId);
  const [sonuc, setSonuc] = useState<(typeof SONUCLAR)[number]>(satir.inceleme_sonucu ?? 'tamam');
  const [not, setNot] = useState(satir.inceleme_notu ?? '');
  const [hata, setHata] = useState<string | null>(null);
  const kaydet = useMutation({
    mutationFn: () =>
      ogrenmeIstek(`kurumlar/${kurumId}/ogrenci-odevleri/${satir.ogrenci_odev_id}/inceleme`, {
        govde: { sonuc, ...(not.trim() ? { not: not.trim() } : {}) },
      }),
    onSuccess: async () => {
      await yenile();
      bitti(t('ogrenme.odev.incelendiMesaj'));
    },
    onError: (h) => {
      setHata(hataMesaji(h));
    },
  });
  return (
    <Pencere
      acik
      degisti={(a) => {
        if (!a) kapat();
      }}
      baslik={t('ogrenme.odev.incelemeBaslik', { ad: satir.gorunen_ad ?? '' })}
      aciklama={t('ogrenme.odev.incelemeAciklama')}
    >
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          setHata(null);
          kaydet.mutate();
        }}
        className="flex flex-col gap-4"
      >
        <dl className="grid grid-cols-2 gap-2 rounded-orta bg-yuzey-ikincil p-3 text-sm">
          <Sayi
            etiket={t('ogrenme.odev.yapilan')}
            deger={String(satir.yapilan_soru_sayisi ?? '-')}
          />
          <Sayi etiket={t('ogrenme.odev.dogru')} deger={String(satir.dogru_sayisi ?? '-')} />
          <Sayi etiket={t('ogrenme.odev.yanlis')} deger={String(satir.yanlis_sayisi ?? '-')} />
          <Sayi etiket={t('ogrenme.odev.bosSayi')} deger={String(satir.bos_sayisi ?? '-')} />
        </dl>
        {satir.ogrenci_notu ? (
          <p className="rounded-orta border border-kenar px-3 py-2 text-sm">
            <span className="font-medium">{t('ogrenme.odev.ogrenciNotu')}: </span>
            {satir.ogrenci_notu}
          </p>
        ) : null}
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">{t('ogrenme.odev.sonucBaslik')}</legend>
          {SONUCLAR.map((s) => (
            <label
              key={s}
              className="flex min-h-11 cursor-pointer items-center gap-3 rounded-orta border border-kenar px-3 text-sm has-[:checked]:border-birincil has-[:checked]:bg-birincil-yumusak"
            >
              <input
                type="radio"
                name="inceleme-sonuc"
                value={s}
                checked={sonuc === s}
                onChange={() => {
                  setSonuc(s);
                }}
                className="size-4 accent-[var(--birincil)]"
              />
              {t(`ogrenme.odev.sonucEtiket.${s}`)}
            </label>
          ))}
        </fieldset>
        <Alan etiket={t('ogrenme.odev.incelemeNotu')} yardim={t('ogrenme.odev.incelemeNotuYardim')}>
          {(o) => (
            <textarea
              {...o}
              value={not}
              maxLength={1000}
              rows={3}
              onChange={(e) => {
                setNot(e.target.value);
              }}
              className="w-full rounded-orta border border-kenar bg-yuzey px-3 py-2 text-base"
            />
          )}
        </Alan>
        {hata ? (
          <p role="alert" className="text-sm text-hata">
            {hata}
          </p>
        ) : null}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Dugme type="button" gorunum="ikincil" onClick={kapat}>
            {t('ortak.vazgec')}
          </Dugme>
          <Dugme type="submit" disabled={kaydet.isPending}>
            {kaydet.isPending ? t('ortak.yukleniyor') : t('ogrenme.odev.incelemeKaydet')}
          </Dugme>
        </div>
      </form>
    </Pencere>
  );
}
