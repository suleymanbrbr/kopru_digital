'use client';

import type { DenemeTipi } from '@kopru/contracts';
import { t } from '@kopru/i18n';
import { useMutation } from '@tanstack/react-query';
import { CircleCheck } from 'lucide-react';
import { useState } from 'react';

import { BosDurum } from '@/components/bos-durum';
import { HataDurumu } from '@/components/hata-durumu';
import {
  DahaFazla,
  ListeIskeleti,
  basari,
  basarisiz,
  type Bildirim,
} from '@/components/hesap/ortak';
import { Dugme } from '@/components/ui/button';
import { OnayPenceresi } from '@/components/ui/pencere';
import { hataMesaji } from '@/lib/api';
import { ogrenmeIstek } from '@/lib/hesap-istek';
import { netMetni } from '@/lib/ogrenme/net';
import { useDenemeler, useOgrenmeYenile } from '@/lib/ogrenme/veri';
import { gunEtiketi } from '@/lib/saat';

/** Ogrencinin girdigi, onay bekleyen denemeler: onayla ya da neden belirterek reddet. */
export function OnayKuyrugu({
  kurumId,
  bildirim,
}: {
  kurumId: string;
  bildirim: (b: Bildirim) => void;
}) {
  const veri = useDenemeler(kurumId, { onay: 'bekliyor' });
  const yenile = useOgrenmeYenile(kurumId);
  const [reddedilen, setReddedilen] = useState<DenemeTipi | null>(null);
  const [neden, setNeden] = useState('');
  const [nedenHatasi, setNedenHatasi] = useState<string | null>(null);

  const onayla = useMutation({
    mutationFn: (d: DenemeTipi) =>
      ogrenmeIstek(`kurumlar/${kurumId}/denemeler/${d.id}/onay`, { yontem: 'POST' }),
    onSuccess: async () => {
      await yenile();
      bildirim(basari(t('ogrenme.deneme.onaylandi')));
    },
    onError: (h) => {
      bildirim(basarisiz(h));
    },
  });
  const reddet = useMutation({
    mutationFn: (d: DenemeTipi) =>
      ogrenmeIstek(`kurumlar/${kurumId}/denemeler/${d.id}/red`, {
        govde: { red_nedeni: neden.trim() },
      }),
    onSuccess: async () => {
      await yenile();
      setReddedilen(null);
      setNeden('');
      bildirim(basari(t('ogrenme.deneme.reddedildi')));
    },
    onError: (h) => {
      setNedenHatasi(hataMesaji(h));
    },
  });

  if (veri.isPending) return <ListeIskeleti satir={3} />;
  if (veri.isError) {
    return (
      <HataDurumu
        baslik={t('ogrenme.deneme.yuklenemedi')}
        aciklama={hataMesaji(veri.error)}
        tekrarDene={() => void veri.refetch()}
      />
    );
  }

  return (
    <section
      aria-label={t('ogrenme.deneme.sekme.onay')}
      className="rounded-buyuk border border-kenar bg-yuzey"
    >
      {veri.denemeler.length === 0 ? (
        <BosDurum
          className="py-14"
          ikon={CircleCheck}
          baslik={t('ogrenme.deneme.onayBos')}
          aciklama={t('ogrenme.deneme.onayBosAciklama')}
        />
      ) : (
        <ul className="divide-y divide-kenar">
          {veri.denemeler.map((d) => (
            <li key={d.id} className="flex flex-col gap-2 px-4 py-3">
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {d.gorunen_ad ?? '-'} · {d.ad}
                  </p>
                  <p className="text-sm text-metin-ikincil">
                    {d.kural_kodu.toUpperCase()} · {gunEtiketi(d.sinav_tarihi)} ·{' '}
                    {t('ogrenme.deneme.toplamNetDeger', { net: netMetni(d.toplam_net) })}
                  </p>
                </div>
                <Dugme
                  boyut="sm"
                  disabled={onayla.isPending}
                  aria-label={t('ogrenme.deneme.onaylaEtiket', {
                    ad: d.gorunen_ad ?? '',
                    deneme: d.ad,
                  })}
                  onClick={() => {
                    onayla.mutate(d);
                  }}
                >
                  {t('ogrenme.deneme.onayla')}
                </Dugme>
                <Dugme
                  boyut="sm"
                  gorunum="ikincil"
                  aria-label={t('ogrenme.deneme.reddetEtiket', {
                    ad: d.gorunen_ad ?? '',
                    deneme: d.ad,
                  })}
                  onClick={() => {
                    setNeden('');
                    setNedenHatasi(null);
                    setReddedilen(d);
                  }}
                >
                  {t('ogrenme.deneme.reddet')}
                </Dugme>
              </div>
              <p className="text-sm text-metin-ikincil">
                {d.bolumler
                  .map((b) => `${b.bolum_kodu}: ${b.dogru}/${b.yanlis}/${b.bos}`)
                  .join(' · ')}
              </p>
            </li>
          ))}
        </ul>
      )}
      <DahaFazla
        daha={veri.hasNextPage}
        yukleniyor={veri.isFetchingNextPage}
        yukle={() => void veri.fetchNextPage()}
      />
      <OnayPenceresi
        acik={reddedilen !== null}
        degisti={(a) => {
          if (!a) setReddedilen(null);
        }}
        baslik={t('ogrenme.deneme.redBaslik')}
        aciklama={t('ogrenme.deneme.redAciklama', { ad: reddedilen?.gorunen_ad ?? '' })}
        onayEtiketi={t('ogrenme.deneme.reddet')}
        tehlikeli
        bekliyor={reddet.isPending}
        onay={() => {
          if (!neden.trim()) {
            setNedenHatasi(t('ogrenme.deneme.redNedeniGerekli'));
            return;
          }
          if (reddedilen) reddet.mutate(reddedilen);
        }}
        icerik={
          <div className="mt-3 flex flex-col gap-1.5">
            <label htmlFor="red-nedeni" className="text-sm font-medium">
              {t('ogrenme.deneme.redNedeni')}
            </label>
            <textarea
              id="red-nedeni"
              value={neden}
              rows={3}
              maxLength={500}
              aria-invalid={nedenHatasi ? true : undefined}
              onChange={(e) => {
                setNeden(e.target.value);
              }}
              className="w-full rounded-orta border border-kenar bg-yuzey px-3 py-2 text-base"
            />
            {nedenHatasi ? (
              <p role="alert" className="text-sm text-hata">
                {nedenHatasi}
              </p>
            ) : null}
          </div>
        }
      />
    </section>
  );
}
