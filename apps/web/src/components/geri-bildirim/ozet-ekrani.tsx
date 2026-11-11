'use client';

import { GERI_BILDIRIM_OZET_MAKS_GUN, type GeriBildirimOranSema } from '@kopru/contracts';
import { t } from '@kopru/i18n';
import { SmilePlus } from 'lucide-react';
import { useState } from 'react';
import type { z } from 'zod';

import { SayilarOzeti } from './ders-geri-bildirimi';

import { BosDurum } from '@/components/bos-durum';
import { HataDurumu } from '@/components/hata-durumu';
import { ListeIskeleti } from '@/components/hesap/ortak';
import { BolumKapisi } from '@/components/kabuk/bolum-yer-tutucu';
import { SayfaBasligi } from '@/components/kabuk/sayfa-basligi';
import { Alan } from '@/components/operasyon/ortak';
import { Dugme } from '@/components/ui/button';
import { Girdi } from '@/components/ui/input';
import { Kart } from '@/components/ui/kart';
import { useKurum } from '@/kurum/baglam';
import { hataMesaji } from '@/lib/api';
import { bransAdi } from '@/lib/bransler';
import { sonGunlerAraligi, yuzdeYaz } from '@/lib/kayit/geri-bildirim';
import { useGeriBildirimOzeti } from '@/lib/kayit/veri';
import { useSaatDilimi } from '@/lib/operasyon-verisi';

type Oran = z.infer<typeof GeriBildirimOranSema>;

const HAZIR = [7, 30, 90] as const;

/** Yonetici/sahip: tarih araliginda geri bildirim oranlari; ogretmen ve brans kirilimi. */
export function GeriBildirimOzetEkrani() {
  return (
    <BolumKapisi bolum="geri-bildirim">
      <OzetIcerigi />
    </BolumKapisi>
  );
}

function aralikHatasi(baslangic: string, bitis: string): string | undefined {
  if (!baslangic || !bitis) return t('kayitGeriBildirim.ozet.hata.bos');
  if (baslangic > bitis) return t('kayitGeriBildirim.suzgec.aralikHata');
  const gun =
    (Date.parse(`${bitis}T00:00:00Z`) - Date.parse(`${baslangic}T00:00:00Z`)) / 86_400_000;
  if (gun >= GERI_BILDIRIM_OZET_MAKS_GUN) {
    return t('kayitGeriBildirim.ozet.hata.uzun', { gun: GERI_BILDIRIM_OZET_MAKS_GUN });
  }
  return undefined;
}

function OzetIcerigi() {
  const { uyelik } = useKurum();
  const kurumId = uyelik.kurumId;
  const { saatDilimi } = useSaatDilimi(kurumId);
  const [aralik, setAralik] = useState<{ baslangic: string; bitis: string } | null>(null);
  const varsayilan = sonGunlerAraligi(30, saatDilimi);
  const { baslangic, bitis } = aralik ?? varsayilan;
  const hata = aralikHatasi(baslangic, bitis);
  const q = useGeriBildirimOzeti(kurumId, { baslangic, bitis }, hata === undefined);

  return (
    <>
      <SayfaBasligi
        baslik={t('kayitGeriBildirim.ozet.baslik')}
        aciklama={t('kayitGeriBildirim.ozet.aciklama')}
      />
      <Kart className="mb-4">
        <form
          role="search"
          aria-label={t('kayitGeriBildirim.ozet.aralik')}
          onSubmit={(e) => {
            e.preventDefault();
          }}
          className="flex flex-wrap items-end gap-3 p-4"
        >
          <Alan etiket={t('kayitGeriBildirim.suzgec.baslangic')} className="w-44">
            {(o) => (
              <Girdi
                {...o}
                type="date"
                value={baslangic}
                onChange={(e) => {
                  setAralik({ baslangic: e.target.value, bitis });
                }}
              />
            )}
          </Alan>
          <Alan etiket={t('kayitGeriBildirim.suzgec.bitis')} hata={hata} className="w-44">
            {(o) => (
              <Girdi
                {...o}
                type="date"
                value={bitis}
                onChange={(e) => {
                  setAralik({ baslangic, bitis: e.target.value });
                }}
              />
            )}
          </Alan>
          <div
            className="flex flex-wrap gap-2"
            role="group"
            aria-label={t('kayitGeriBildirim.ozet.hazir')}
          >
            {HAZIR.map((g) => (
              <Dugme
                key={g}
                type="button"
                gorunum="ikincil"
                onClick={() => {
                  setAralik(sonGunlerAraligi(g, saatDilimi));
                }}
              >
                {t('kayitGeriBildirim.ozet.sonGun', { n: g })}
              </Dugme>
            ))}
          </div>
        </form>
      </Kart>

      {hata ? null : q.isPending ? (
        <Kart>
          <ListeIskeleti satir={3} />
        </Kart>
      ) : q.isError ? (
        <Kart>
          <HataDurumu
            baslik={t('kayitGeriBildirim.ozet.yuklenemedi')}
            aciklama={hataMesaji(q.error)}
            tekrarDene={() => void q.refetch()}
          />
        </Kart>
      ) : q.data.toplam.toplam === 0 ? (
        <Kart>
          <BosDurum
            className="py-14"
            ikon={SmilePlus}
            baslik={t('kayitGeriBildirim.ozet.bos')}
            aciklama={t('kayitGeriBildirim.ozet.bosAciklama')}
          />
        </Kart>
      ) : (
        <div className="flex flex-col gap-4">
          <Kart aria-labelledby="ozet-toplam" className="p-4">
            <h2 id="ozet-toplam" className="mb-3 text-base font-semibold">
              {t('kayitGeriBildirim.ozet.toplam', { n: q.data.toplam.toplam })}
            </h2>
            <SayilarOzeti sayilar={q.data.toplam} />
          </Kart>
          <Kirilim
            baslik={t('kayitGeriBildirim.ozet.ogretmenler')}
            ilkSutun={t('kayitGeriBildirim.ozet.ogretmen')}
            satirlar={q.data.ogretmenler.map((o) => ({
              anahtar: o.ogretmen_id,
              ad: o.gorunen_ad ?? t('operasyon.ortak.adsiz'),
              oran: o,
            }))}
          />
          <Kirilim
            baslik={t('kayitGeriBildirim.ozet.branslar')}
            ilkSutun={t('kayitGeriBildirim.ozet.brans')}
            satirlar={q.data.branslar.map((b) => ({
              anahtar: b.brans_kodu,
              ad: bransAdi(b.brans_kodu),
              oran: b,
            }))}
          />
        </div>
      )}
    </>
  );
}

function Kirilim({
  baslik,
  ilkSutun,
  satirlar,
}: {
  baslik: string;
  ilkSutun: string;
  satirlar: { anahtar: string; ad: string; oran: Oran }[];
}) {
  return (
    <Kart className="overflow-hidden">
      <h2 className="border-b border-kenar px-4 py-3 text-base font-semibold">{baslik}</h2>
      {satirlar.length === 0 ? (
        <p className="px-4 py-5 text-sm text-metin-ikincil">
          {t('kayitGeriBildirim.ozet.kirilimBos')}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[32rem] text-left text-sm">
            <caption className="sr-only">{baslik}</caption>
            <thead className="text-metin-ikincil">
              <tr className="border-b border-kenar">
                <th scope="col" className="px-4 py-2 font-medium">
                  {ilkSutun}
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  {t('kayitGeriBildirim.ozet.cevap')}
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  {t('kayitGeriBildirim.geriBildirim.deger.anladim')}
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  {t('kayitGeriBildirim.geriBildirim.deger.kismen')}
                </th>
                <th scope="col" className="px-4 py-2 text-right font-medium">
                  {t('kayitGeriBildirim.geriBildirim.deger.anlamadim')}
                </th>
              </tr>
            </thead>
            <tbody>
              {satirlar.map((s) => (
                <tr key={s.anahtar} className="border-b border-kenar last:border-0">
                  <th scope="row" className="px-4 py-2.5 font-medium">
                    {s.ad}
                  </th>
                  <td className="px-3 py-2.5 text-right tabular-nums">{s.oran.toplam}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {yuzdeYaz(s.oran.oran.anladim)}
                    <span className="ml-1 text-metin-ikincil">({s.oran.anladim})</span>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {yuzdeYaz(s.oran.oran.kismen)}
                    <span className="ml-1 text-metin-ikincil">({s.oran.kismen})</span>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {yuzdeYaz(s.oran.oran.anlamadim)}
                    <span className="ml-1 text-metin-ikincil">({s.oran.anlamadim})</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Kart>
  );
}
