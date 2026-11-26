'use client';

import { t } from '@kopru/i18n';
import { ImageIcon, Link2, NotebookPen, Pencil, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { KayitFormu } from './kayit-formu';

import { BosDurum } from '@/components/bos-durum';
import { HataDurumu } from '@/components/hata-durumu';
import {
  BildirimKutusu,
  basari,
  basarisiz,
  DahaFazla,
  type Bildirim,
} from '@/components/hesap/ortak';
import { kisaTarih } from '@/components/ogrenme/ortak';
import { Dugme, dugmeStili } from '@/components/ui/button';
import { Iskelet } from '@/components/ui/kart';
import { OnayPenceresi, Pencere } from '@/components/ui/pencere';
import { Rozet } from '@/components/ui/rozet';
import { useKurum } from '@/kurum/baglam';
import { hataMesaji } from '@/lib/api';
import { bransAdi } from '@/lib/bransler';
import { zorlukAdi } from '@/lib/gunluk-soru/analiz';
import { useKayitlarim, useKayitSil, type Kayit } from '@/lib/gunluk-soru/veri';
import { useKonular } from '@/lib/ogrenme/veri';

/** Ogrencinin kendi kayitlari (yeniden eskiye, gun gun); ayni gun duzelt/sil. */
export function KayitListesi() {
  const { uyelik } = useKurum();
  const kurumId = uyelik.kurumId;
  const q = useKayitlarim(kurumId);
  const konular = useKonular(kurumId);
  const sil = useKayitSil(kurumId);
  const [duzelt, setDuzelt] = useState<Kayit | null>(null);
  const [silinecek, setSilinecek] = useState<Kayit | null>(null);
  const [bildirim, setBildirim] = useState<Bildirim>(null);
  const kayitlar = q.data?.pages.flatMap((s) => s.kayitlar) ?? [];
  const konuAdi = (k: Kayit) =>
    k.konu_ad ?? konular.data?.find((x) => x.id === k.konu_id)?.ad ?? '';

  if (q.isPending) {
    return (
      <div role="status" aria-label={t('ortak.yukleniyor')} className="flex flex-col gap-3">
        <Iskelet className="h-16 w-full" />
        <Iskelet className="h-16 w-full" />
      </div>
    );
  }
  if (q.isError) {
    return (
      <HataDurumu
        baslik={t('gunlukSoru.liste.yuklenemedi')}
        aciklama={hataMesaji(q.error)}
        tekrarDene={() => void q.refetch()}
      />
    );
  }

  const gunler = [...new Set(kayitlar.map((k) => k.gun))];
  return (
    <div className="flex flex-col gap-4">
      <BildirimKutusu bildirim={bildirim} />
      {kayitlar.length === 0 ? (
        <BosDurum
          ikon={NotebookPen}
          baslik={t('gunlukSoru.liste.bos')}
          aciklama={t('gunlukSoru.liste.bosAciklama')}
        >
          <Link href={`/${kurumId}/soru-cozdum`} className={dugmeStili({})}>
            {t('gunlukSoru.ekran.yeniKayit')}
          </Link>
        </BosDurum>
      ) : (
        gunler.map((gun) => (
          <section key={gun} aria-labelledby={`gs-gun-${gun}`}>
            <h3 id={`gs-gun-${gun}`} className="mb-1 text-sm font-semibold text-metin-ikincil">
              {kisaTarih(gun)}
            </h3>
            <ul className="divide-y divide-kenar rounded-buyuk border border-kenar bg-yuzey">
              {kayitlar
                .filter((k) => k.gun === gun)
                .map((k) => (
                  <li
                    key={k.id}
                    data-testid="kayit-satiri"
                    className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="font-medium">
                        {bransAdi(k.brans_kodu)} ·{' '}
                        {t('gunlukSoru.liste.satir', {
                          konu: konuAdi(k),
                          zorluk: zorlukAdi(k.zorluk),
                        })}
                      </p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-metin-ikincil">
                        <span className="tabular-nums">
                          {t('gunlukSoru.liste.sayilar', {
                            dogru: k.dogru,
                            yanlis: k.yanlis,
                            bos: k.bos,
                          })}
                        </span>
                        {k.dosyalar.length > 0 ? (
                          <span className="inline-flex items-center gap-1">
                            <ImageIcon className="size-3.5" aria-hidden />
                            {t('gunlukSoru.liste.fotoSayisi', { n: k.dosyalar.length })}
                          </span>
                        ) : null}
                        {k.plan_gorev_id ? (
                          <span className="inline-flex items-center gap-1">
                            <Link2 className="size-3.5" aria-hidden />
                            {t('gunlukSoru.liste.gorevli')}
                          </span>
                        ) : null}
                      </p>
                    </div>
                    {k.duzenlenebilir ? (
                      <div className="flex gap-1">
                        <Dugme
                          type="button"
                          gorunum="ikincil"
                          boyut="sm"
                          aria-label={t('gunlukSoru.liste.duzeltEtiket', { konu: konuAdi(k) })}
                          onClick={() => {
                            setDuzelt(k);
                          }}
                        >
                          <Pencil aria-hidden />
                          {t('gunlukSoru.liste.duzelt')}
                        </Dugme>
                        <Dugme
                          type="button"
                          gorunum="hayalet"
                          boyut="sm"
                          aria-label={t('gunlukSoru.liste.silEtiket', { konu: konuAdi(k) })}
                          onClick={() => {
                            setSilinecek(k);
                          }}
                        >
                          <Trash2 aria-hidden />
                          {t('gunlukSoru.liste.sil')}
                        </Dugme>
                      </div>
                    ) : (
                      <Rozet>{t('gunlukSoru.liste.kilitli')}</Rozet>
                    )}
                  </li>
                ))}
            </ul>
          </section>
        ))
      )}
      <DahaFazla
        daha={q.hasNextPage}
        yukleniyor={q.isFetchingNextPage}
        yukle={() => void q.fetchNextPage()}
      />

      <Pencere
        acik={duzelt !== null}
        degisti={(a) => {
          if (!a) setDuzelt(null);
        }}
        baslik={t('gunlukSoru.form.duzeltBaslik')}
        genis
      >
        {duzelt ? (
          <KayitFormu
            duzelt={duzelt}
            vazgec={() => {
              setDuzelt(null);
            }}
            bitti={() => {
              setDuzelt(null);
              setBildirim(basari(t('gunlukSoru.liste.guncellendi')));
            }}
          />
        ) : null}
      </Pencere>
      <OnayPenceresi
        acik={silinecek !== null}
        degisti={(a) => {
          if (!a) setSilinecek(null);
        }}
        baslik={t('gunlukSoru.liste.silBaslik')}
        aciklama={t('gunlukSoru.liste.silAciklama')}
        onayEtiketi={t('gunlukSoru.liste.silOnay')}
        tehlikeli
        bekliyor={sil.isPending}
        onay={() => {
          if (!silinecek) return;
          sil.mutate(silinecek.id, {
            onSuccess: () => {
              setBildirim(basari(t('gunlukSoru.liste.silindi')));
            },
            onError: (e) => {
              setBildirim(basarisiz(e));
            },
            onSettled: () => {
              setSilinecek(null);
            },
          });
        }}
      />
    </div>
  );
}
