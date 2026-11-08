'use client';

import { OturumListeYanitSema, OturumlariKapatYanitSema } from '@kopru/contracts';
import { t } from '@kopru/i18n';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Laptop, MonitorSmartphone } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { z } from 'zod';

import { basari, basarisiz, BildirimKutusu, tarihYaz, zamanYaz, type Bildirim } from './ortak';

import { BosDurum } from '@/components/bos-durum';
import { HataDurumu } from '@/components/hata-durumu';
import { SayfaBasligi } from '@/components/kabuk/sayfa-basligi';
import { Dugme } from '@/components/ui/button';
import { Kart } from '@/components/ui/kart';
import { OnayPenceresi } from '@/components/ui/pencere';
import { Rozet } from '@/components/ui/rozet';
import { hataMesaji, UygulamaHatasi } from '@/lib/api';
import { hesapIstek } from '@/lib/hesap-istek';
import { yenidenDene } from '@/lib/sayfali-sorgu';
import { useOturum } from '@/oturum/saglayici';

type Liste = z.output<typeof OturumListeYanitSema>;
type Onay = { tur: 'tek'; id: string; cihaz: string } | { tur: 'diger' } | { tur: 'hepsi' } | null;

const ANAHTAR = ['hesap', 'oturumlar'] as const;

export function OturumlarEkrani() {
  const qc = useQueryClient();
  const router = useRouter();
  const { cikis } = useOturum();
  const [onay, setOnay] = useState<Onay>(null);
  const [bildirim, setBildirim] = useState<Bildirim>(null);

  const sorgu = useQuery({
    queryKey: ANAHTAR,
    retry: yenidenDene,
    queryFn: () => hesapIstek('oturumlar', { sema: OturumListeYanitSema }),
  });
  const oturumlar = [...(sorgu.data?.oturumlar ?? [])].sort(
    (a, b) =>
      Number(b.bu_oturum) - Number(a.bu_oturum) ||
      b.son_kullanim_at.localeCompare(a.son_kullanim_at),
  );
  const digerVar = oturumlar.some((o) => !o.bu_oturum);

  // Tek oturum: iyimser; satir aninda kalkar, hata olursa geri gelir.
  const sonlandir = useMutation({
    mutationFn: (id: string) => hesapIstek(`oturumlar/${id}`, { yontem: 'DELETE' }),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: ANAHTAR });
      const onceki = qc.getQueryData<Liste>(ANAHTAR);
      qc.setQueryData<Liste>(ANAHTAR, (v) =>
        v ? { oturumlar: v.oturumlar.filter((o) => o.id !== id) } : v,
      );
      setOnay(null);
      return { onceki };
    },
    onError: (e, _id, baglam) => {
      qc.setQueryData(ANAHTAR, baglam?.onceki);
      setBildirim(basarisiz(e));
    },
    onSuccess: () => {
      setBildirim(basari(t('hesap.oturumlar.sonlandirildi')));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ANAHTAR }),
  });

  const kapat = useMutation({
    mutationFn: (mevcutHaric: boolean) =>
      hesapIstek('oturumlar/tumunu-kapat', {
        govde: { mevcut_haric: mevcutHaric },
        sema: OturumlariKapatYanitSema,
      }),
    onSuccess: async (sonuc, mevcutHaric) => {
      setOnay(null);
      if (mevcutHaric) {
        setBildirim(basari(t('hesap.oturumlar.digerleriKapandi', { n: sonuc.kapatilan })));
        void qc.invalidateQueries({ queryKey: ANAHTAR });
        return;
      }
      // Kendi oturumumuz da kapandi: yerel durum temizlenir ve girise donulur.
      await cikis();
      router.replace('/giris');
    },
    onError: (e) => {
      setOnay(null);
      setBildirim(basarisiz(e));
    },
  });

  const tekHata = sorgu.error instanceof UygulamaHatasi ? sorgu.error.istekId : undefined;

  return (
    <>
      <SayfaBasligi baslik={t('hesap.oturumlar.baslik')} aciklama={t('hesap.oturumlar.aciklama')}>
        <div className="flex flex-wrap gap-2">
          <Dugme
            gorunum="ikincil"
            disabled={!digerVar}
            title={digerVar ? undefined : t('hesap.oturumlar.digerYok')}
            onClick={() => {
              setOnay({ tur: 'diger' });
            }}
          >
            {t('hesap.oturumlar.digerleriniKapat')}
          </Dugme>
          <Dugme
            gorunum="tehlike"
            onClick={() => {
              setOnay({ tur: 'hepsi' });
            }}
          >
            {t('hesap.oturumlar.hepsiniKapat')}
          </Dugme>
        </div>
      </SayfaBasligi>

      <div className="mb-4 empty:hidden">
        <BildirimKutusu bildirim={bildirim} />
      </div>

      <Kart>
        {sorgu.isPending ? (
          <div role="status" className="p-6 text-sm text-metin-ikincil">
            {t('hesap.ortak.yukleniyor')}
          </div>
        ) : sorgu.isError ? (
          <HataDurumu
            baslik={t('hesap.oturumlar.yuklenemedi')}
            aciklama={hataMesaji(sorgu.error)}
            istekNo={tekHata}
            tekrarDene={() => void sorgu.refetch()}
          />
        ) : oturumlar.length === 0 ? (
          <BosDurum className="py-14" ikon={MonitorSmartphone} baslik={t('hesap.oturumlar.bos')} />
        ) : (
          <ul className="divide-y divide-kenar">
            {oturumlar.map((o) => {
              const cihaz = o.cihaz ?? t('hesap.oturumlar.cihazBilinmiyor');
              return (
                <li key={o.id} className="flex flex-wrap items-center gap-4 px-4 py-4">
                  <span
                    aria-hidden
                    className="flex size-10 shrink-0 items-center justify-center rounded-orta bg-yuzey-ikincil text-metin-ikincil"
                  >
                    <Laptop className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 font-medium">
                      <span className="truncate">{cihaz}</span>
                      {o.bu_oturum ? (
                        <Rozet ton="basari">{t('hesap.oturumlar.buOturum')}</Rozet>
                      ) : null}
                    </p>
                    <p className="mt-0.5 text-sm text-metin-ikincil">
                      {t('hesap.oturumlar.sonKullanim', { zaman: zamanYaz(o.son_kullanim_at) })} ·{' '}
                      {t('hesap.oturumlar.acildi', { tarih: tarihYaz(o.created_at) })}
                      {o.ip_maskeli ? ` · ${t('hesap.oturumlar.ip', { ip: o.ip_maskeli })}` : ''}
                    </p>
                  </div>
                  {!o.bu_oturum ? (
                    <Dugme
                      gorunum="ikincil"
                      boyut="sm"
                      aria-label={t('hesap.oturumlar.sonlandirAria', { cihaz })}
                      onClick={() => {
                        setOnay({ tur: 'tek', id: o.id, cihaz });
                      }}
                    >
                      {t('hesap.oturumlar.sonlandir')}
                    </Dugme>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </Kart>

      <OnayPenceresi
        acik={onay !== null}
        degisti={(a) => {
          if (!a) setOnay(null);
        }}
        baslik={
          onay?.tur === 'tek'
            ? t('hesap.oturumlar.sonlandirBaslik')
            : onay?.tur === 'diger'
              ? t('hesap.oturumlar.digerleriBaslik')
              : t('hesap.oturumlar.hepsiBaslik')
        }
        aciklama={
          onay?.tur === 'tek'
            ? t('hesap.oturumlar.sonlandirAciklama', { cihaz: onay.cihaz })
            : onay?.tur === 'diger'
              ? t('hesap.oturumlar.digerleriAciklama')
              : t('hesap.oturumlar.hepsiAciklama')
        }
        onayEtiketi={
          onay?.tur === 'tek'
            ? t('hesap.oturumlar.sonlandirOnay')
            : onay?.tur === 'diger'
              ? t('hesap.oturumlar.digerleriOnay')
              : t('hesap.oturumlar.hepsiOnay')
        }
        tehlikeli
        bekliyor={sonlandir.isPending || kapat.isPending}
        onay={() => {
          if (onay?.tur === 'tek') sonlandir.mutate(onay.id);
          else if (onay?.tur === 'diger') kapat.mutate(true);
          else if (onay?.tur === 'hepsi') kapat.mutate(false);
        }}
      />
    </>
  );
}
