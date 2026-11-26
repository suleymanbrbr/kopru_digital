'use client';

import { t } from '@kopru/i18n';

import { AnalizPaneli } from './analiz-paneli';

import { Iskelet, Kart } from '@/components/ui/kart';
import { useKurum } from '@/kurum/baglam';
import { bransAdi } from '@/lib/bransler';
import { yuzdeSayisi } from '@/lib/gunluk-soru/analiz';
import { useHaftalikOzet } from '@/lib/gunluk-soru/veri';

/**
 * Ogrenci kartinin "Konu analizi" sekmesi (ogretmen/yonetici): haftalik ozet karti + analiz paneli
 * (isi haritasi, hucre ayrintisi, oneriler, "Gorev ver").
 */
export function PersonelKonuAnalizi({ ogrenciId }: { ogrenciId: string }) {
  const { uyelik } = useKurum();
  const ozet = useHaftalikOzet(uyelik.kurumId, ogrenciId);
  const varsayilan = ozet.data?.en_zayif_konular[0]?.brans_kodu;
  return (
    <div className="flex flex-col gap-6" data-testid="konu-analizi">
      <p className="text-sm text-metin-ikincil">{t('gunlukSoru.personel.aciklama')}</p>
      <HaftalikOzetKarti ogrenciId={ogrenciId} />
      {/* Ders varsayilani haftalik ozetin en zayif konusunun dersidir (kullanici secmedikce). */}
      <AnalizPaneli ogrenciId={ogrenciId} varsayilanDers={varsayilan} />
    </div>
  );
}

function HaftalikOzetKarti({ ogrenciId }: { ogrenciId: string }) {
  const { uyelik } = useKurum();
  const q = useHaftalikOzet(uyelik.kurumId, ogrenciId);
  if (q.isPending) return <Iskelet className="h-28 w-full" />;
  if (q.isError) return null;
  const d = q.data;
  return (
    <Kart aria-labelledby="gs-haftalik-baslik" className="p-5" data-testid="haftalik-ozet">
      <h3 id="gs-haftalik-baslik" className="text-base font-semibold">
        {t('gunlukSoru.personel.haftalikBaslik')}
      </h3>
      {d.cozulen === 0 ? (
        <p className="mt-2 text-sm text-metin-ikincil">{t('gunlukSoru.personel.haftalikBos')}</p>
      ) : (
        <dl className="mt-3 grid gap-4 sm:grid-cols-4">
          <Olcu etiket={t('gunlukSoru.personel.haftalikCozulen')} deger={String(d.cozulen)} />
          <Olcu
            etiket={t('gunlukSoru.personel.haftalikBasari')}
            deger={d.basari === null ? '—' : `%${String(yuzdeSayisi(d.basari))}`}
          />
          <Olcu
            etiket={t('gunlukSoru.personel.haftalikBant')}
            deger={t(`gunlukSoru.degisim.${d.bant.degisim}`)}
          />
          <div>
            <dt className="text-sm text-metin-ikincil">{t('gunlukSoru.personel.haftalikZayif')}</dt>
            <dd>
              {d.en_zayif_konular.length === 0 ? (
                <span className="text-sm text-metin-ikincil">
                  {t('gunlukSoru.personel.haftalikZayifBos')}
                </span>
              ) : (
                <ol className="list-inside list-decimal text-sm">
                  {d.en_zayif_konular.map((k) => (
                    <li key={k.konu_id}>
                      {t('gunlukSoru.personel.haftalikSatir', {
                        konu: k.konu_ad ?? bransAdi(k.brans_kodu),
                        yuzde: yuzdeSayisi(k.basari),
                        n: k.cozulen,
                      })}
                    </li>
                  ))}
                </ol>
              )}
            </dd>
          </div>
        </dl>
      )}
    </Kart>
  );
}

function Olcu({ etiket, deger }: { etiket: string; deger: string }) {
  return (
    <div>
      <dt className="text-sm text-metin-ikincil">{etiket}</dt>
      <dd className="text-xl font-semibold tabular-nums">{deger}</dd>
    </div>
  );
}
