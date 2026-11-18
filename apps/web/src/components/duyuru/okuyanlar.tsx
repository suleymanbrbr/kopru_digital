'use client';

import type { Duyuru } from '@kopru/contracts';
import { t } from '@kopru/i18n';
import { useState } from 'react';

import { HataDurumu } from '@/components/hata-durumu';
import { ListeIskeleti } from '@/components/hesap/ortak';
import { Dugme } from '@/components/ui/button';
import { Kart } from '@/components/ui/kart';
import { goreliZaman } from '@/lib/bildirim/zaman';
import { duyuruHataMesaji, useDuyuruOkuyanlari, useUyeAdlari } from '@/lib/duyuru/veri';

/**
 * Okuyanlar listesi (yazar/yonetici). Servis yalniz uyelik kimliklerini verir; adlar kurumun uye listesinden
 * (tek seferlik toplu cekim) cozulur. Liste acilmadan istek atilmaz.
 */
export function OkuyanlarBolumu({ kurumId, duyuru }: { kurumId: string; duyuru: Duyuru }) {
  const [acik, setAcik] = useState(false);
  const okuyanlar = useDuyuruOkuyanlari(kurumId, duyuru.id, acik);
  const adlar = useUyeAdlari(kurumId, acik);
  const liste = okuyanlar.data?.okuyanlar ?? [];
  const toplam = okuyanlar.data?.okunan_sayisi ?? 0;

  return (
    <Kart className="p-5" aria-labelledby="duyuru-okuyanlar-baslik">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="duyuru-okuyanlar-baslik" className="text-base font-semibold">
          {t('duyurular.okuyanlar')}{' '}
          <span className="font-normal tabular-nums text-metin-ikincil">
            (
            {t('duyurular.okunanSatir', {
              okunan: duyuru.okunan_sayisi,
              alici: duyuru.alici_sayisi,
            })}
            )
          </span>
        </h3>
        <Dugme
          gorunum="ikincil"
          aria-expanded={acik}
          aria-controls="duyuru-okuyanlar-liste"
          onClick={() => {
            setAcik((a) => !a);
          }}
        >
          {acik ? t('duyurular.okuyanlarGizle') : t('duyurular.okuyanlarGoster')}
        </Dugme>
      </div>
      <div id="duyuru-okuyanlar-liste" className="mt-3">
        {!acik ? null : okuyanlar.isPending ? (
          <ListeIskeleti satir={3} />
        ) : okuyanlar.isError ? (
          <HataDurumu
            baslik={t('duyurular.okuyanYuklenemedi')}
            aciklama={duyuruHataMesaji(okuyanlar.error)}
            tekrarDene={() => void okuyanlar.refetch()}
            className="py-6"
          />
        ) : liste.length === 0 ? (
          <p className="text-sm text-metin-ikincil">{t('duyurular.okuyanBos')}</p>
        ) : (
          <>
            <ul
              className="divide-y divide-kenar rounded-orta border border-kenar"
              data-testid="duyuru-okuyanlar"
            >
              {liste.map((o) => (
                <li
                  key={o.alici_id}
                  className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"
                >
                  <span className="min-w-0 truncate font-medium">
                    {adlar.data?.get(o.alici_id) ??
                      (adlar.isPending ? '…' : t('duyurular.okuyanBilinmiyor'))}
                  </span>
                  <time dateTime={o.okundu_at} className="shrink-0 text-metin-ikincil">
                    {goreliZaman(o.okundu_at)}
                  </time>
                </li>
              ))}
            </ul>
            {toplam > liste.length ? (
              <p className="mt-2 text-sm text-metin-ikincil">
                {t('duyurular.okuyanDaha', { n: toplam - liste.length })}
              </p>
            ) : null}
          </>
        )}
      </div>
    </Kart>
  );
}
