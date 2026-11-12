'use client';

import { SoruBildirimSema } from '@kopru/contracts';
import { t } from '@kopru/i18n';
import { useMutation } from '@tanstack/react-query';
import { ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import type { z } from 'zod';

import { BosDurum } from '@/components/bos-durum';
import { HataDurumu } from '@/components/hata-durumu';
import {
  BildirimKutusu,
  DahaFazla,
  ListeIskeleti,
  basari,
  zamanYaz,
  type Bildirim,
} from '@/components/hesap/ortak';
import { Alan } from '@/components/operasyon/ortak';
import { Dugme, dugmeStili } from '@/components/ui/button';
import { MetinAlani } from '@/components/ui/metin-alani';
import { Pencere } from '@/components/ui/pencere';
import { Rozet } from '@/components/ui/rozet';
import { Secim } from '@/components/ui/secim';
import { Uyari } from '@/components/ui/uyari';
import { useKurum } from '@/kurum/baglam';
import { hataMesaji } from '@/lib/api';
import { bransAdi } from '@/lib/bransler';
import { ogrenmeIstek } from '@/lib/hesap-istek';
import { useSoruBildirimleri, useSoruYenile } from '@/lib/soru/veri';

type SoruBildirimi = z.output<typeof SoruBildirimSema>;

/** Uygunsuz icerik bildirimleri: acik/kapali liste, soruya git, kapatma (not istege bagli). */
export function YonetimBildirimler() {
  const { uyelik } = useKurum();
  const kurumId = uyelik.kurumId;
  const [durum, setDurum] = useState<'acik' | 'kapandi'>('acik');
  const veri = useSoruBildirimleri(kurumId, durum);
  const yenile = useSoruYenile(kurumId);
  const [bildirim, setBildirim] = useState<Bildirim>(null);
  const [kapatilacak, setKapatilacak] = useState<SoruBildirimi | null>(null);
  const [not, setNot] = useState('');

  const kapat = useMutation({
    mutationFn: (b: SoruBildirimi) =>
      ogrenmeIstek(`kurumlar/${kurumId}/soru-bildirimleri/${b.id}/kapat`, {
        yontem: 'POST',
        govde: not.trim() ? { not: not.trim() } : {},
        sema: SoruBildirimSema,
      }),
    onSuccess: () => {
      setKapatilacak(null);
      setNot('');
      setBildirim(basari(t('soruSor.bildirimler.kapatildi')));
      void yenile();
    },
  });

  return (
    <section
      aria-label={t('soruSor.bildirimler.baslik')}
      className="rounded-buyuk border border-kenar bg-yuzey"
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-kenar px-4 py-3">
        <div>
          <h2 className="text-base font-semibold">{t('soruSor.bildirimler.baslik')}</h2>
          <p className="mt-0.5 text-sm text-metin-ikincil">{t('soruSor.bildirimler.aciklama')}</p>
        </div>
        <div className="w-44">
          <Alan etiket={t('soruSor.bildirimler.durum')}>
            {(o) => (
              <Secim
                {...o}
                value={durum}
                onChange={(e) => {
                  setDurum(e.target.value as 'acik' | 'kapandi');
                }}
              >
                <option value="acik">{t('soruSor.bildirimler.acik')}</option>
                <option value="kapandi">{t('soruSor.bildirimler.kapali')}</option>
              </Secim>
            )}
          </Alan>
        </div>
      </header>
      <div className="px-4 pt-4 empty:hidden">
        <BildirimKutusu bildirim={bildirim} />
      </div>
      {veri.isPending ? (
        <ListeIskeleti satir={2} />
      ) : veri.isError ? (
        <HataDurumu aciklama={hataMesaji(veri.error)} tekrarDene={() => void veri.refetch()} />
      ) : veri.bildirimler.length === 0 ? (
        <BosDurum
          className="py-12"
          ikon={ShieldCheck}
          baslik={t('soruSor.bildirimler.bos')}
          aciklama={t('soruSor.bildirimler.bosAciklama')}
        />
      ) : (
        <ul className="divide-y divide-kenar" data-testid="bildirim-listesi">
          {veri.bildirimler.map((b) => (
            <li key={b.id} className="flex flex-col gap-2 px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <Rozet ton="uyari">{t(`soruSor.bildir.nedenler.${b.neden}`)}</Rozet>
                <Rozet>{bransAdi(b.brans_kodu)}</Rozet>
                <Rozet ton={b.durum === 'acik' ? 'hata' : 'notr'}>
                  {b.durum === 'acik'
                    ? t('soruSor.bildirimler.acik')
                    : t('soruSor.bildirimler.kapali')}
                </Rozet>
              </div>
              <p className="text-sm">
                <span className="font-medium">{b.bildiren_adi ?? t('soruSor.masa.adsiz')}</span>
                {' · '}
                {zamanYaz(b.created_at)}
              </p>
              {b.aciklama ? <p className="text-sm text-metin-ikincil">{b.aciklama}</p> : null}
              {b.kapatma_notu ? (
                <p className="text-sm text-metin-ikincil">
                  {t('soruSor.bildirimler.kapatmaNotu', { not: b.kapatma_notu })}
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Link
                  href={`/${kurumId}/sorular/${b.soru_id}`}
                  className={dugmeStili({ gorunum: 'ikincil', boyut: 'sm' })}
                >
                  {t('soruSor.bildirimler.soruyuGor')}
                </Link>
                {b.durum === 'acik' ? (
                  <Dugme
                    type="button"
                    boyut="sm"
                    onClick={() => {
                      setKapatilacak(b);
                    }}
                  >
                    {t('soruSor.bildirimler.kapat')}
                  </Dugme>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
      <DahaFazla
        daha={veri.hasNextPage}
        yukleniyor={veri.isFetchingNextPage}
        yukle={() => void veri.fetchNextPage()}
      />

      <Pencere
        acik={kapatilacak !== null}
        degisti={(a) => {
          if (!a) setKapatilacak(null);
        }}
        baslik={t('soruSor.bildirimler.kapatBaslik')}
        aciklama={t('soruSor.bildirimler.kapatAciklama')}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (kapatilacak) kapat.mutate(kapatilacak);
          }}
          className="flex flex-col gap-4"
        >
          <Alan etiket={t('soruSor.bildirimler.not')}>
            {(o) => (
              <MetinAlani
                {...o}
                rows={3}
                maxLength={500}
                value={not}
                onChange={(e) => {
                  setNot(e.target.value);
                }}
              />
            )}
          </Alan>
          {kapat.isError ? <Uyari>{hataMesaji(kapat.error)}</Uyari> : null}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Dugme
              type="button"
              gorunum="ikincil"
              onClick={() => {
                setKapatilacak(null);
              }}
            >
              {t('ortak.vazgec')}
            </Dugme>
            <Dugme type="submit" disabled={kapat.isPending}>
              {kapat.isPending ? t('ortak.yukleniyor') : t('soruSor.bildirimler.kapat')}
            </Dugme>
          </div>
        </form>
      </Pencere>
    </section>
  );
}
