'use client';

import { t } from '@kopru/i18n';
import { useMemo } from 'react';

import { DegerRozeti } from './deger-rozeti';

import { HataDurumu } from '@/components/hata-durumu';
import { DahaFazla, ListeIskeleti, zamanYaz } from '@/components/hesap/ortak';
import { Kart } from '@/components/ui/kart';
import { useKurum } from '@/kurum/baglam';
import { UygulamaHatasi, hataMesaji } from '@/lib/api';
import { bransAdi } from '@/lib/bransler';
import { useOgrenciGeriBildirimleri } from '@/lib/kayit/veri';
import { useKonular } from '@/lib/ogrenme/veri';

/** Ogrenci kartinda son geri bildirimler (personel; `geri_bildirim` modulu aciksa). */
export function OgrenciGeriBildirimleri({ ogrenciId }: { ogrenciId: string }) {
  const { uyelik, acikModuller, rol } = useKurum();
  const kurumId = uyelik.kurumId;
  const etkin = acikModuller.includes('geri_bildirim') && rol !== 'ogrenci';
  const q = useOgrenciGeriBildirimleri(kurumId, ogrenciId, etkin);
  const konular = useKonular(kurumId);
  const konuAdlari = useMemo(
    () => new Map((konular.data ?? []).map((k) => [k.id, k.ad])),
    [konular.data],
  );
  if (!etkin) return null;
  if (q.error instanceof UygulamaHatasi && q.error.durum === 403) return null;

  return (
    <Kart aria-labelledby="ogr-geri-bildirim" className="mt-4">
      <h2
        id="ogr-geri-bildirim"
        className="border-b border-kenar px-4 py-3 text-base font-semibold"
      >
        {t('kayitGeriBildirim.geriBildirim.ogrenciBaslik')}
      </h2>
      {q.isPending ? (
        <ListeIskeleti satir={2} />
      ) : q.isError ? (
        <HataDurumu
          baslik={t('kayitGeriBildirim.geriBildirim.yuklenemedi')}
          aciklama={hataMesaji(q.error)}
          tekrarDene={() => void q.refetch()}
          className="py-6"
        />
      ) : q.satirlar.length === 0 ? (
        <p className="px-4 py-5 text-sm text-metin-ikincil">
          {t('kayitGeriBildirim.geriBildirim.ogrenciBos')}
        </p>
      ) : (
        <ul className="divide-y divide-kenar">
          {q.satirlar.map((g) => (
            <li key={g.id} className="flex flex-col gap-1 px-4 py-3 text-sm">
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{bransAdi(g.brans_kodu)}</span>
                <DegerRozeti deger={g.deger} />
                <span className="text-metin-ikincil">{zamanYaz(g.ders_bitis_at)}</span>
              </span>
              {g.konu_id ? (
                <span className="text-metin-ikincil">
                  {t('kayitGeriBildirim.geriBildirim.zorlandi', {
                    konu: konuAdlari.get(g.konu_id) ?? t('kayitGeriBildirim.geriBildirim.konuYok'),
                  })}
                </span>
              ) : null}
              {g.not ? <span>{g.not}</span> : null}
            </li>
          ))}
        </ul>
      )}
      <DahaFazla
        daha={q.hasNextPage}
        yukleniyor={q.isFetchingNextPage}
        yukle={() => void q.fetchNextPage()}
      />
    </Kart>
  );
}
