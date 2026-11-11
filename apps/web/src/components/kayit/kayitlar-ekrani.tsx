'use client';

import { t } from '@kopru/i18n';
import { Files } from 'lucide-react';
import { useState } from 'react';

import { BOS_SUZGEC, KayitSuzgecleri, aralikGecersiz, suzgecSayisi } from './kayit-suzgecleri';
import { KaynakKarti } from './kaynak-karti';

import { BosDurum } from '@/components/bos-durum';
import { HataDurumu } from '@/components/hata-durumu';
import {
  BildirimKutusu,
  DahaFazla,
  ListeIskeleti,
  basari,
  type Bildirim,
} from '@/components/hesap/ortak';
import { BolumKapisi } from '@/components/kabuk/bolum-yer-tutucu';
import { SayfaBasligi } from '@/components/kabuk/sayfa-basligi';
import { useKurum } from '@/kurum/baglam';
import { hataMesaji } from '@/lib/api';
import { useKaynaklar, type KaynakSuzgeci } from '@/lib/kayit/veri';
import { useGruplar } from '@/lib/operasyon-verisi';

/** Personel: kurumun (ogretmen icin kapsamindaki) tum kayit ve materyalleri, suzgeclerle. */
export function KayitlarEkrani() {
  return (
    <BolumKapisi bolum="kayitlar">
      <KayitlarIcerigi />
    </BolumKapisi>
  );
}

function KayitlarIcerigi() {
  const { uyelik } = useKurum();
  const kurumId = uyelik.kurumId;
  const [suzgec, setSuzgec] = useState<KaynakSuzgeci>(BOS_SUZGEC);
  const [bildirim, setBildirim] = useState<Bildirim>(null);
  const gruplar = useGruplar(kurumId);
  const gecersiz = aralikGecersiz(suzgec);
  const q = useKaynaklar(kurumId, suzgec, { etkin: !gecersiz });
  const suzuldu = suzgecSayisi(suzgec) > 0;

  return (
    <>
      <SayfaBasligi
        baslik={t('nav.kayitlar')}
        aciklama={t('kayitGeriBildirim.kayitlar.aciklama')}
      />
      <div className="mb-4 empty:hidden">
        <BildirimKutusu bildirim={bildirim} />
      </div>
      <section
        aria-label={t('kayitGeriBildirim.kayitlar.liste')}
        className="rounded-buyuk border border-kenar bg-yuzey"
      >
        <KayitSuzgecleri
          kurumId={kurumId}
          deger={suzgec}
          degisti={setSuzgec}
          gruplar={gruplar.secenekler}
          durumlar
        />
        {gecersiz ? (
          <BosDurum
            className="py-12"
            ikon={Files}
            baslik={t('kayitGeriBildirim.suzgec.aralikHata')}
            aciklama={t('kayitGeriBildirim.suzgec.aralikHataAciklama')}
          />
        ) : q.isPending ? (
          <ListeIskeleti satir={4} />
        ) : q.isError ? (
          <HataDurumu
            baslik={t('kayitGeriBildirim.kayitlar.yuklenemedi')}
            aciklama={hataMesaji(q.error)}
            tekrarDene={() => void q.refetch()}
          />
        ) : q.kaynaklar.length === 0 ? (
          <BosDurum
            className="py-14"
            ikon={Files}
            baslik={
              suzuldu
                ? t('kayitGeriBildirim.kayitlar.bosSuzgec')
                : t('kayitGeriBildirim.kayitlar.bos')
            }
            aciklama={
              suzuldu
                ? t('kayitGeriBildirim.kayitlar.bosSuzgecAciklama')
                : t('kayitGeriBildirim.kayitlar.bosAciklama')
            }
          />
        ) : (
          <ul className="divide-y divide-kenar" aria-busy={q.isFetching}>
            {q.kaynaklar.map((k) => (
              <KaynakKarti
                key={k.id}
                kurumId={kurumId}
                kaynak={k}
                grupAdi={gruplar.adlar.get(k.grup_id)?.etiket}
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
      </section>
    </>
  );
}
