'use client';

import { t } from '@kopru/i18n';
import { CalendarClock } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';

import { BolumKarti } from './bolum-karti';

import { BosDurum } from '@/components/bos-durum';
import { BildirimKutusu, type Bildirim } from '@/components/hesap/ortak';
import { useAralikDersleri } from '@/components/takvim/ders-verisi';
import { Dugme, dugmeStili } from '@/components/ui/button';
import { Rozet } from '@/components/ui/rozet';
import { useYoklamaBekleyen } from '@/components/yoklama/yoklama-ekrani';
import { YoklamaFormu } from '@/components/yoklama/yoklama-formu';
import { useKurum } from '@/kurum/baglam';
import { bransAdi } from '@/lib/bransler';
import { cn } from '@/lib/cn';
import { useGruplar, useOgretmenler, useSaatDilimi } from '@/lib/operasyon-verisi';
import { bugunYerel, gunEtiketi, saatAraligi, tarihEkle, yerelTarih, yerelUtc } from '@/lib/saat';
import { izinli } from '@/lib/yetki';

/**
 * "Bugun" ekraninin ders karti: kurumun saat dilimine gore bugunun dersleri (saat sirasiyla). Kapsami `api`
 * belirler (ogretmen kendi dersleri, ogrenci kendi dersleri, sahip/yonetici kurum). `takvim` modulu kapaliysa
 * kart hic cizilmez.
 *
 * - Personel: yoklamasi alinmamis dersler "Yoklama bekliyor" ile isaretlenir ve satirdaki "Yoklama al"
 *   tek tikla yoklama penceresini acar (`yoklama` modulu acik ve `yoklama.yaz` izni varsa).
 * - Ogrenci: bugunku dersler listelenir, siradaki ders "Siradaki" ile isaretlenir; bugun ders yoksa onumuzdeki
 *   gunlerin siradaki dersi "Siradaki ders" olarak gosterilir.
 */
export function BugunDersleriKarti({ genis = true }: { genis?: boolean }) {
  const { uyelik, acikModuller } = useKurum();
  if (!acikModuller.includes('takvim')) return null;
  return <Kart kurumId={uyelik.kurumId} genis={genis} />;
}

/** Henuz bitmemis ilk planli ders (listenin baslangic saatine gore sirali oldugu varsayilir). */
function siradakiDers<T extends { durum: string; bitis_at: string }>(dersler: readonly T[]) {
  const simdi = Date.now();
  return dersler.find((d) => d.durum === 'planli' && Date.parse(d.bitis_at) > simdi);
}

/** Ogrenci icin "siradaki ders" aramasinin ileriye bakis penceresi (gun). */
const SIRADAKI_PENCERE_GUN = 8;

function Kart({ kurumId, genis }: { kurumId: string; genis: boolean }) {
  const { rol, acikModuller } = useKurum();
  const personel = rol !== 'ogrenci';
  const yonetim = rol === 'sahip' || rol === 'yonetici';
  const yoklamaVar = personel && acikModuller.includes('yoklama') && izinli(rol, 'yoklama.yaz');
  const { saatDilimi, hazir } = useSaatDilimi(kurumId);
  const bugun = bugunYerel(saatDilimi);
  const veri = useAralikDersleri({
    kurumId,
    baslangic: yerelUtc(bugun, '00:00', saatDilimi),
    bitis: yerelUtc(tarihEkle(bugun, personel ? 1 : SIRADAKI_PENCERE_GUN), '00:00', saatDilimi),
    etkin: hazir,
  });
  const gruplar = useGruplar(kurumId, personel);
  const ogretmenler = useOgretmenler(kurumId, yonetim);
  const bekleyen = useYoklamaBekleyen(kurumId, yoklamaVar);
  const [yoklamaId, setYoklamaId] = useState<string | null>(null);
  const [bildirim, setBildirim] = useState<Bildirim>(null);

  const bekleyenIdleri = useMemo(
    () => new Set(bekleyen.dersler.map((d) => d.id)),
    [bekleyen.dersler],
  );
  const tumu = useMemo(
    () => [...veri.dersler].sort((a, b) => Date.parse(a.baslangic_at) - Date.parse(b.baslangic_at)),
    [veri.dersler],
  );
  const bugunku = useMemo(
    () => tumu.filter((d) => yerelTarih(d.baslangic_at, saatDilimi) === bugun),
    [tumu, bugun, saatDilimi],
  );
  const siradaki = siradakiDers(tumu);
  // Ogrenci: bugun ders yoksa yalniz siradaki dersi goster.
  const sadeceSiradaki = !personel && bugunku.length === 0 && siradaki !== undefined;
  const dersler = personel ? tumu : sadeceSiradaki ? [siradaki] : bugunku;
  const baslik = sadeceSiradaki ? t('bugun.siradakiDers') : t('bugun.dersler');

  return (
    <div className={genis ? 'md:col-span-2' : undefined}>
      <BolumKarti
        baslik={baslik}
        yukleniyor={veri.isPending}
        hata={veri.isError}
        tekrarDene={() => void veri.refetch()}
      >
        {bildirim ? (
          <div className="px-5 pt-3">
            <BildirimKutusu bildirim={bildirim} />
          </div>
        ) : null}
        {dersler.length === 0 ? (
          <BosDurum
            ikon={CalendarClock}
            baslik={personel ? t('bugun.dersBos') : t('bugun.siradakiDersBos')}
            aciklama={personel ? t('bugun.dersBosAciklama') : t('bugun.siradakiDersBosAciklama')}
          >
            {personel ? (
              <Link href={`/${kurumId}/takvim`} className={dugmeStili({ gorunum: 'ikincil' })}>
                {t('bugun.dersBosEylem')}
              </Link>
            ) : null}
          </BosDurum>
        ) : (
          <>
            <ul className="divide-y divide-kenar" data-testid="bugun-dersleri">
              {dersler.map((d) => {
                const ad = gruplar.adlar.get(d.grup_id)?.etiket ?? bransAdi(d.brans_kodu);
                const ogretmen = yonetim ? ogretmenler.adlar.get(d.ogretmen_id) : undefined;
                const yoklamaBekliyor = yoklamaVar && bekleyenIdleri.has(d.id);
                const buSiradaki = !personel && !sadeceSiradaki && siradaki?.id === d.id;
                const baskaGun = !personel && yerelTarih(d.baslangic_at, saatDilimi) !== bugun;
                return (
                  <li
                    key={d.id}
                    data-yoklama-bekliyor={yoklamaBekliyor ? 'true' : undefined}
                    className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3"
                  >
                    <p
                      className={cn(
                        'w-28 shrink-0 text-sm font-semibold tabular-nums',
                        d.durum === 'iptal' && 'line-through',
                      )}
                    >
                      {baskaGun ? (
                        <span className="block text-xs font-medium text-metin-ikincil">
                          {gunEtiketi(yerelTarih(d.baslangic_at, saatDilimi))}
                        </span>
                      ) : null}
                      {saatAraligi(d.baslangic_at, d.bitis_at, saatDilimi)}
                    </p>
                    <div className="min-w-0 flex-1 basis-40">
                      <p className="truncate font-medium">
                        {ad}
                        {d.baslik ? ` · ${d.baslik}` : ''}
                      </p>
                      {ogretmen ? (
                        <p className="truncate text-sm text-metin-ikincil">{ogretmen}</p>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2">
                      {buSiradaki ? <Rozet ton="bilgi">{t('bugun.siradakiEtiket')}</Rozet> : null}
                      {yoklamaBekliyor ? (
                        <>
                          <Rozet ton="uyari">{t('bugun.yoklamaBekliyor')}</Rozet>
                          <Dugme
                            boyut="sm"
                            aria-label={`${t('bugun.yoklamaAl')}: ${ad}`}
                            onClick={() => {
                              setYoklamaId(d.id);
                            }}
                          >
                            {t('bugun.yoklamaAl')}
                          </Dugme>
                        </>
                      ) : (
                        <Rozet
                          ton={
                            d.durum === 'tamamlandi'
                              ? 'basari'
                              : d.durum === 'iptal'
                                ? 'notr'
                                : 'bilgi'
                          }
                        >
                          {t(`operasyon.takvim.durum.${d.durum}`)}
                        </Rozet>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="border-t border-kenar px-5 py-3">
              <Link
                href={`/${kurumId}/takvim`}
                className="text-sm font-medium text-birincil underline underline-offset-2"
              >
                {t('bugun.dersBosEylem')}
              </Link>
            </div>
          </>
        )}
      </BolumKarti>
      {yoklamaVar ? (
        <YoklamaFormu
          kurumId={kurumId}
          dersId={yoklamaId}
          saatDilimi={saatDilimi}
          grupAdlari={gruplar.adlar}
          kapat={() => {
            setYoklamaId(null);
          }}
          bildir={setBildirim}
        />
      ) : null}
    </div>
  );
}
