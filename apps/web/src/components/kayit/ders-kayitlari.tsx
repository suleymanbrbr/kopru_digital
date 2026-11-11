'use client';

import { t } from '@kopru/i18n';
import { Plus } from 'lucide-react';
import { useMemo, useState } from 'react';

import { KayitFormu, type OgrenciAdayi } from './kayit-formu';
import { KaynakKarti } from './kaynak-karti';

import { HataDurumu } from '@/components/hata-durumu';
import {
  BildirimKutusu,
  basari,
  DahaFazla,
  ListeIskeleti,
  type Bildirim,
} from '@/components/hesap/ortak';
import { Dugme } from '@/components/ui/button';
import { hataMesaji } from '@/lib/api';
import { useKaynaklar } from '@/lib/kayit/veri';

/**
 * Ders ayrintisinda "Kayitlar" bolumu (personel): kayit ekle formu ve dersin kayit listesi.
 * Iptal derse kayit eklenmez (sunucu 409 verir), mevcutlar yine yonetilir.
 */
export function DersKayitlari({
  kurumId,
  dersId,
  brans,
  katilimcilar,
  iptal,
}: {
  kurumId: string;
  dersId: string;
  brans: string;
  katilimcilar: readonly { ogrenci_id: string; gorunen_ad: string | null }[];
  iptal: boolean;
}) {
  const q = useKaynaklar(kurumId, { ders_id: dersId }, { sayfaBoyutu: 50 });
  const [formAcik, setFormAcik] = useState(false);
  const [bildirim, setBildirim] = useState<Bildirim>(null);
  const adaylar = useMemo<OgrenciAdayi[]>(
    () => katilimcilar.map((k) => ({ id: k.ogrenci_id, ad: k.gorunen_ad ?? '' })),
    [katilimcilar],
  );

  return (
    <section aria-label={t('kayitGeriBildirim.ders.baslik')} className="border-t border-kenar pt-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-semibold">{t('kayitGeriBildirim.ders.baslik')}</h3>
        {!iptal && !formAcik ? (
          <Dugme
            type="button"
            boyut="sm"
            onClick={() => {
              setFormAcik(true);
              setBildirim(null);
            }}
          >
            <Plus aria-hidden />
            {t('kayitGeriBildirim.form.kayitEkle')}
          </Dugme>
        ) : null}
      </div>
      <div className="mb-3 empty:hidden">
        <BildirimKutusu bildirim={bildirim} />
      </div>
      {formAcik ? (
        <div className="mb-3">
          <KayitFormu
            kurumId={kurumId}
            hedef={{ tur: 'ders', dersId }}
            brans={brans}
            adaylar={adaylar}
            vazgec={() => {
              setFormAcik(false);
            }}
            bitti={(adet) => {
              setFormAcik(false);
              setBildirim(basari(t('kayitGeriBildirim.form.eklendi', { n: adet })));
            }}
          />
        </div>
      ) : null}
      {q.isPending ? (
        <ListeIskeleti satir={2} />
      ) : q.isError ? (
        <HataDurumu
          baslik={t('kayitGeriBildirim.ders.yuklenemedi')}
          aciklama={hataMesaji(q.error)}
          tekrarDene={() => void q.refetch()}
          className="py-6"
        />
      ) : q.kaynaklar.length === 0 ? (
        <p className="rounded-orta border border-dashed border-kenar px-4 py-5 text-center text-sm text-metin-ikincil">
          {iptal ? t('kayitGeriBildirim.ders.bosIptal') : t('kayitGeriBildirim.ders.bos')}
        </p>
      ) : (
        <ul className="divide-y divide-kenar rounded-orta border border-kenar">
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
    </section>
  );
}
