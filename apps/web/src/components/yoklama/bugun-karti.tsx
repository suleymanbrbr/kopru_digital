'use client';

import { t } from '@kopru/i18n';
import { ClipboardCheck } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { useYoklamaBekleyen } from './yoklama-ekrani';
import { YoklamaFormu } from './yoklama-formu';

import { BolumKarti } from '@/components/bugun/bolum-karti';
import { BosDurum } from '@/components/bos-durum';
import { BildirimKutusu, type Bildirim } from '@/components/hesap/ortak';
import { Dugme } from '@/components/ui/button';
import { useKurum } from '@/kurum/baglam';
import { useGruplar, useSaatDilimi } from '@/lib/operasyon-verisi';
import { gunEtiketi, saatAraligi, yerelTarih } from '@/lib/saat';
import { izinli } from '@/lib/yetki';

/** "Bugun" ekraninda yoklamasi bekleyen dersler ve "Yoklama al" kisayolu. */
export function BugunYoklamaKarti() {
  const { uyelik, rol, acikModuller } = useKurum();
  if (!acikModuller.includes('yoklama') || !izinli(rol, 'yoklama.yaz')) return null;
  return <Kart kurumId={uyelik.kurumId} />;
}

function Kart({ kurumId }: { kurumId: string }) {
  const { saatDilimi } = useSaatDilimi(kurumId);
  const gruplar = useGruplar(kurumId);
  const veri = useYoklamaBekleyen(kurumId);
  const [acik, setAcik] = useState<string | null>(null);
  const [bildirim, setBildirim] = useState<Bildirim>(null);

  return (
    <div className="md:col-span-2">
      <BolumKarti
        baslik={t('operasyon.yoklama.bugunKart')}
        yukleniyor={veri.isPending}
        hata={veri.isError}
        tekrarDene={() => void veri.refetch()}
      >
        <BildirimKutusu bildirim={bildirim} />
        {veri.dersler.length === 0 ? (
          <BosDurum
            ikon={ClipboardCheck}
            baslik={t('operasyon.yoklama.bugunBos')}
            aciklama={t('operasyon.yoklama.bugunBosAciklama')}
          />
        ) : (
          <>
            <ul className="divide-y divide-kenar">
              {veri.dersler.slice(0, 4).map((d) => (
                <li key={d.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">
                      {gruplar.adlar.get(d.grup_id)?.etiket ?? '-'}
                    </p>
                    <p className="text-sm text-metin-ikincil">
                      {gunEtiketi(yerelTarih(d.baslangic_at, saatDilimi))},{' '}
                      {saatAraligi(d.baslangic_at, d.bitis_at, saatDilimi)}
                    </p>
                  </div>
                  <Dugme
                    boyut="sm"
                    onClick={() => {
                      setAcik(d.id);
                    }}
                  >
                    {t('operasyon.yoklama.yoklamaAl')}
                  </Dugme>
                </li>
              ))}
            </ul>
            <div className="border-t border-kenar px-5 py-3">
              <Link
                href={`/${kurumId}/yoklama`}
                className="text-sm font-medium text-birincil underline underline-offset-2"
              >
                {t('operasyon.yoklama.bugunTumu')}
              </Link>
            </div>
          </>
        )}
      </BolumKarti>
      <YoklamaFormu
        kurumId={kurumId}
        dersId={acik}
        saatDilimi={saatDilimi}
        grupAdlari={gruplar.adlar}
        kapat={() => {
          setAcik(null);
        }}
        bildir={setBildirim}
      />
    </div>
  );
}
