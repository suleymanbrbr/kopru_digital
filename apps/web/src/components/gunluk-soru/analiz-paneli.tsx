'use client';

import type { Oneri } from '@kopru/contracts';
import { t } from '@kopru/i18n';
import { ChartColumn, TriangleAlert } from 'lucide-react';
import { useState } from 'react';

import { GorevVerPenceresi } from './gorev-ver';
import { HucreDetayPenceresi } from './hucre-detayi';
import { IsiHaritasi, type HucreSecimi } from './isi-haritasi';

import { BosDurum } from '@/components/bos-durum';
import { HataDurumu } from '@/components/hata-durumu';
import { Alan } from '@/components/operasyon/ortak';
import { Dugme } from '@/components/ui/button';
import { Iskelet, Kart } from '@/components/ui/kart';
import { Rozet } from '@/components/ui/rozet';
import { Secim } from '@/components/ui/secim';
import { useKurum } from '@/kurum/baglam';
import { hataMesaji, UygulamaHatasi } from '@/lib/api';
import { bransAdi, siraliBransler } from '@/lib/bransler';
import { DONEMLER, donemAdi, yuzdeSayisi, zorlukAdi } from '@/lib/gunluk-soru/analiz';
import { useAnaliz, type AnalizSorgusu } from '@/lib/gunluk-soru/veri';

type GorevOnerisi = Extract<Oneri, { tur: 'gorev_oner' }>;

const BRANS_ANAHTARI = (kurumId: string) => `kopru.gunlukSoru.analizDers.${kurumId}`;

function dersiOku(kurumId: string): string | null {
  try {
    return globalThis.localStorage.getItem(BRANS_ANAHTARI(kurumId));
  } catch {
    return null;
  }
}
function dersiYaz(kurumId: string, brans: string) {
  try {
    globalThis.localStorage.setItem(BRANS_ANAHTARI(kurumId), brans);
  } catch {
    /* depolama kapali */
  }
}

/**
 * Konu analizi: ders + tarih araligi secimi, konu x zorluk isi haritasi, hucre ayrintisi. Personel
 * (`ogrenciId` verilir) ayrica oneriler ve "Gorev ver" gorur; ogrencinin kendi gorunumunde (ogrenciId yok)
 * oneri yoktur (`api` zaten dondurmez).
 */
export function AnalizPaneli({
  ogrenciId,
  varsayilanDers,
}: {
  /** Personel: hedef ogrenci. Verilmezse ogrencinin kendi analizi. */
  ogrenciId?: string;
  varsayilanDers?: string | undefined;
}) {
  const { uyelik } = useKurum();
  const kurumId = uyelik.kurumId;
  const [dersSecimi, setDersSecimi] = useState<string | null>(null);
  const [donem, setDonem] = useState<AnalizSorgusu['donem']>('30');
  const [hucre, setHucre] = useState<HucreSecimi | null>(null);
  const [gorev, setGorev] = useState<GorevOnerisi | null>(null);
  const brans = dersSecimi ?? dersiOku(kurumId) ?? varsayilanDers ?? 'matematik';
  const sorgu: AnalizSorgusu = { brans, donem };
  const q = useAnaliz(kurumId, ogrenciId, sorgu);
  const personel = ogrenciId !== undefined;
  const bransSecenekleri = siraliBransler();

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2 sm:max-w-xl">
        <Alan etiket={t('gunlukSoru.analiz.ders')}>
          {(o) => (
            <Secim
              {...o}
              value={brans}
              onChange={(e) => {
                setDersSecimi(e.target.value);
                dersiYaz(kurumId, e.target.value);
              }}
            >
              {bransSecenekleri.map((b) => (
                <option key={b.kod} value={b.kod}>
                  {b.ad}
                </option>
              ))}
            </Secim>
          )}
        </Alan>
        <Alan etiket={t('gunlukSoru.analiz.donem')}>
          {(o) => (
            <Secim
              {...o}
              value={donem}
              onChange={(e) => {
                setDonem(e.target.value as AnalizSorgusu['donem']);
              }}
            >
              {DONEMLER.map((d) => (
                <option key={d} value={d}>
                  {donemAdi(d)}
                </option>
              ))}
            </Secim>
          )}
        </Alan>
      </div>

      {q.isPending ? (
        <div role="status" aria-label={t('ortak.yukleniyor')} className="flex flex-col gap-2">
          <Iskelet className="h-14 w-full" />
          <Iskelet className="h-14 w-full" />
          <Iskelet className="h-14 w-full" />
        </div>
      ) : q.isError ? (
        <HataDurumu
          baslik={t('gunlukSoru.analiz.yuklenemedi')}
          aciklama={hataMesaji(q.error)}
          istekNo={q.error instanceof UygulamaHatasi ? q.error.istekId : undefined}
          tekrarDene={() => void q.refetch()}
        />
      ) : q.data.konular.length === 0 ? (
        <Kart>
          <BosDurum
            ikon={ChartColumn}
            baslik={t('gunlukSoru.analiz.bos')}
            aciklama={t('gunlukSoru.analiz.bosAciklama')}
          />
        </Kart>
      ) : (
        <>
          <p className="text-sm text-metin-ikincil" data-testid="analiz-toplam">
            {bransAdi(brans)} ·{' '}
            {t('gunlukSoru.analiz.toplam', {
              cozulen: q.data.toplam.cozulen,
              yuzde: yuzdeSayisi(q.data.toplam.basari),
            })}
          </p>
          <IsiHaritasi konular={q.data.konular} oneriler={q.data.oneriler} sec={setHucre} />
          {personel ? <Oneriler oneriler={q.data.oneriler ?? []} gorevVer={setGorev} /> : null}
        </>
      )}

      <HucreDetayPenceresi
        kurumId={kurumId}
        ogrenciId={ogrenciId}
        secim={hucre}
        sorgu={sorgu}
        kapat={() => {
          setHucre(null);
        }}
      />
      {personel ? (
        <GorevVerPenceresi
          ogrenciId={ogrenciId}
          oneri={gorev}
          kapat={() => {
            setGorev(null);
          }}
        />
      ) : null}
    </div>
  );
}

function Oneriler({
  oneriler,
  gorevVer,
}: {
  oneriler: readonly Oneri[];
  gorevVer: (o: GorevOnerisi) => void;
}) {
  return (
    <section aria-labelledby="gs-oneri-baslik" className="flex flex-col gap-3">
      <h3 id="gs-oneri-baslik" className="text-base font-semibold">
        {t('gunlukSoru.personel.onerilerBaslik')}
      </h3>
      {oneriler.length === 0 ? (
        <p className="text-sm text-metin-ikincil">{t('gunlukSoru.personel.onerilerBos')}</p>
      ) : (
        <ul className="flex flex-col gap-2" data-testid="oneriler">
          {oneriler.map((o) =>
            o.tur === 'gorev_oner' ? (
              <li
                key={`g-${o.konu_id}`}
                className="flex flex-wrap items-center justify-between gap-3 rounded-orta border border-kenar bg-yuzey p-3"
              >
                <span className="min-w-0 text-sm">
                  {t('gunlukSoru.oneri.gorevOner', {
                    konu: o.konu_ad ?? '',
                    zorluk: zorlukAdi(o.zorluk).toLocaleLowerCase('tr'),
                    sayi: o.soru_sayisi,
                  })}
                </span>
                <Dugme
                  type="button"
                  boyut="sm"
                  aria-label={t('gunlukSoru.personel.gorevVerEtiket', { konu: o.konu_ad ?? '' })}
                  onClick={() => {
                    gorevVer(o);
                  }}
                >
                  {t('gunlukSoru.personel.gorevVer')}
                </Dugme>
              </li>
            ) : (
              <li
                key={`b-${o.konu_id}`}
                className="flex flex-col gap-1 rounded-orta border border-uyari bg-uyari-yumusak p-3 text-sm"
              >
                <span className="flex flex-wrap items-center gap-2 font-medium">
                  <TriangleAlert className="size-4 shrink-0" aria-hidden />
                  {o.konu_ad ?? ''}
                  <Rozet ton="uyari">{t('gunlukSoru.analiz.birebir')}</Rozet>
                </span>
                <span>
                  {t('gunlukSoru.personel.birebirNot', { basari: yuzdeSayisi(o.zor_basari) })}
                  {o.onceki_hafta_basari !== null && o.son_hafta_basari !== null
                    ? ` ${t('gunlukSoru.personel.birebirKarsilastirma', {
                        onceki: yuzdeSayisi(o.onceki_hafta_basari),
                        son: yuzdeSayisi(o.son_hafta_basari),
                      })}`
                    : ''}
                </span>
              </li>
            ),
          )}
        </ul>
      )}
    </section>
  );
}
