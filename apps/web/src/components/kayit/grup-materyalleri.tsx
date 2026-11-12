'use client';

import type { GrupSema } from '@kopru/contracts';
import { t } from '@kopru/i18n';
import { Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { z } from 'zod';

import { KayitFormu, type OgrenciAdayi } from './kayit-formu';
import { KaynakKarti } from './kaynak-karti';

import { HataDurumu } from '@/components/hata-durumu';
import {
  Bolum,
  BildirimKutusu,
  basari,
  DahaFazla,
  ListeIskeleti,
  type Bildirim,
} from '@/components/hesap/ortak';
import { Dugme } from '@/components/ui/button';
import { useKurum } from '@/kurum/baglam';
import { hataMesaji } from '@/lib/api';
import { useGrupUyeleri, useKaynaklar } from '@/lib/kayit/veri';

type Grup = z.infer<typeof GrupSema>;

/** Grup sayfasinda dersten bagimsiz materyaller: ekleme formu ve liste (`kayitlar` modulu aciksa, personel). */
export function GrupMateryalleri({ grup }: { grup: Grup }) {
  const { uyelik, acikModuller, rol } = useKurum();
  const kurumId = uyelik.kurumId;
  const acik = acikModuller.includes('kayitlar') && rol !== 'ogrenci';
  const q = useKaynaklar(kurumId, { grup_id: grup.id, tur: 'materyal' }, { etkin: acik });
  const uyeler = useGrupUyeleri(kurumId, acik ? grup.id : null);
  const adaylar = useMemo<OgrenciAdayi[]>(
    () =>
      (uyeler.data?.uyeler ?? [])
        .filter((u) => u.bitis_tarihi === null)
        .map((u) => ({ id: u.ogrenci_id, ad: u.gorunen_ad ?? '' })),
    [uyeler.data],
  );
  const [formAcik, setFormAcik] = useState(false);
  const [bildirim, setBildirim] = useState<Bildirim>(null);
  if (!acik) return null;

  return (
    <Bolum
      baslik={t('kayitGeriBildirim.materyal.baslik')}
      aciklama={t('kayitGeriBildirim.materyal.aciklama')}
      eylemler={
        grup.durum === 'aktif' && !formAcik ? (
          <Dugme
            type="button"
            boyut="sm"
            onClick={() => {
              setFormAcik(true);
              setBildirim(null);
            }}
          >
            <Plus aria-hidden />
            {t('kayitGeriBildirim.form.materyalEkle')}
          </Dugme>
        ) : null
      }
    >
      <div className="flex flex-col gap-3 p-4 empty:hidden">
        <BildirimKutusu bildirim={bildirim} />
        {formAcik ? (
          <KayitFormu
            kurumId={kurumId}
            hedef={{ tur: 'materyal', grupId: grup.id }}
            adaylar={adaylar}
            vazgec={() => {
              setFormAcik(false);
            }}
            bitti={(adet) => {
              setFormAcik(false);
              setBildirim(basari(t('kayitGeriBildirim.form.materyalEklendi', { n: adet })));
            }}
          />
        ) : null}
      </div>
      {q.isPending ? (
        <ListeIskeleti satir={2} />
      ) : q.isError ? (
        <HataDurumu
          baslik={t('kayitGeriBildirim.materyal.yuklenemedi')}
          aciklama={hataMesaji(q.error)}
          tekrarDene={() => void q.refetch()}
        />
      ) : q.kaynaklar.length === 0 ? (
        <p className="px-4 pb-5 pt-1 text-sm text-metin-ikincil">
          {t('kayitGeriBildirim.materyal.bos')}
        </p>
      ) : (
        <ul className="divide-y divide-kenar border-t border-kenar">
          {q.kaynaklar.map((k) => (
            <KaynakKarti
              key={k.id}
              kurumId={kurumId}
              kaynak={k}
              bildir={(m) => {
                setBildirim(basari(m));
              }}
            />
          ))}
        </ul>
      )}
      <DahaFazla
        daha={q.hasNextPage}
        yukleniyor={q.isFetchingNextPage}
        yukle={() => void q.fetchNextPage()}
      />
    </Bolum>
  );
}
