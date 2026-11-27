import type { KoclukYaniti } from '@kopru/contracts';
import { t } from '@kopru/i18n';
import Link from 'next/link';

import { kisaTarih } from '@/components/ogrenme/ortak';
import { Dugme, dugmeStili } from '@/components/ui/button';
import { bransAdi } from '@/lib/bransler';
import { yuzdeSayisi, zorlukAdi } from '@/lib/gunluk-soru/analiz';

type KonuAnalizi = KoclukYaniti['konu_analizi'];
type PlanOdev = KoclukYaniti['plan_odev'];

const yuzde = (oran: number | null) => (oran === null ? '–' : `%${String(yuzdeSayisi(oran))}`);

function Olcu({ etiket, deger }: { etiket: string; deger: string }) {
  return (
    <div>
      <dt className="text-sm text-metin-ikincil">{etiket}</dt>
      <dd className="text-xl font-semibold tabular-nums">{deger}</dd>
    </div>
  );
}

/** Son 30 günün konu analizi özeti: zayıf konular ve sistem önerileri; ayrıntı "Konu analizi" sekmesindedir. */
export function KonuAnaliziOzeti({
  analiz,
  analizeGec,
}: {
  analiz: KonuAnalizi;
  analizeGec: () => void;
}) {
  const oneriler = analiz.bransler.flatMap((b) => b.oneriler);
  const zayiflar = analiz.bransler.flatMap((b) =>
    b.zayif_konular.map((k) => ({ ...k, brans: b.brans_kodu })),
  );
  return (
    <div className="flex flex-col gap-4 p-5" data-testid="kocluk-konu-ozeti">
      <p className="text-xs text-metin-ikincil">
        {t('kocluk.konu.donem', { bas: kisaTarih(analiz.bas), bit: kisaTarih(analiz.bit) })}
      </p>
      {analiz.toplam.cozulen === 0 ? (
        <p className="text-sm text-metin-ikincil">{t('kocluk.konu.bos')}</p>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Olcu etiket={t('kocluk.konu.cozulen')} deger={String(analiz.toplam.cozulen)} />
            <Olcu etiket={t('kocluk.konu.basari')} deger={yuzde(analiz.toplam.basari)} />
            <Olcu
              etiket={t('kocluk.konu.bant')}
              deger={t(`gunlukSoru.degisim.${analiz.haftalik_ozet.bant.degisim}`)}
            />
          </dl>
          <section aria-labelledby="kk-zayif">
            <h4 id="kk-zayif" className="mb-1.5 text-sm font-medium text-metin-ikincil">
              {t('kocluk.konu.zayif')}
            </h4>
            {zayiflar.length === 0 ? (
              <p className="text-sm text-metin-ikincil">{t('kocluk.konu.zayifBos')}</p>
            ) : (
              <ul className="flex flex-col gap-1 text-sm">
                {zayiflar.map((k) => (
                  <li key={`${k.brans}-${k.konu_id}`}>
                    {t('gunlukSoru.personel.haftalikSatir', {
                      konu: k.konu_ad ?? bransAdi(k.brans),
                      yuzde: yuzdeSayisi(k.toplam.basari),
                      n: k.toplam.cozulen,
                    })}
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section aria-labelledby="kk-oneri">
            <h4 id="kk-oneri" className="mb-1.5 text-sm font-medium text-metin-ikincil">
              {t('kocluk.konu.oneriler')}
            </h4>
            {oneriler.length === 0 ? (
              <p className="text-sm text-metin-ikincil">{t('kocluk.konu.oneriBos')}</p>
            ) : (
              <ul className="flex flex-col gap-1 text-sm" data-testid="kocluk-oneriler">
                {oneriler.map((o) => (
                  <li key={`${o.tur}-${o.konu_id}`}>
                    {o.tur === 'gorev_oner'
                      ? t('gunlukSoru.oneri.gorevOner', {
                          konu: o.konu_ad ?? bransAdi(o.brans_kodu),
                          zorluk: zorlukAdi(o.zorluk),
                          sayi: o.soru_sayisi,
                        })
                      : t('gunlukSoru.oneri.birebirDers', {
                          konu: o.konu_ad ?? bransAdi(o.brans_kodu),
                          basari: yuzdeSayisi(o.zor_basari),
                        })}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
      <Dugme type="button" gorunum="ikincil" className="self-start" onClick={analizeGec}>
        {t('kocluk.konu.analizeGec')}
      </Dugme>
    </div>
  );
}

/** Bu haftanın planı ve ödev durumu (bağlantılar kendi sayfalarına). */
export function PlanOdevOzeti({ ozet, kok }: { ozet: PlanOdev; kok: string }) {
  const { plan, odev } = ozet;
  return (
    <div className="flex flex-col gap-4 p-5" data-testid="kocluk-plan-odev">
      {plan ? (
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Olcu
            etiket={t('kocluk.plan.gorev')}
            deger={t('kocluk.plan.gorevDeger', {
              tamam: plan.tamam_sayisi,
              toplam: plan.gorev_sayisi,
            })}
          />
          <Olcu
            etiket={t('kocluk.plan.soru')}
            deger={t('kocluk.plan.hedefDeger', {
              gerceklesen: plan.soru.gerceklesen,
              planlanan: plan.soru.planlanan,
            })}
          />
          <Olcu
            etiket={t('kocluk.plan.dakika')}
            deger={t('kocluk.plan.hedefDeger', {
              gerceklesen: plan.dakika.gerceklesen,
              planlanan: plan.dakika.planlanan,
            })}
          />
        </dl>
      ) : (
        <p className="text-sm text-metin-ikincil">{t('kocluk.plan.yok')}</p>
      )}
      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Olcu etiket={t('kocluk.odev.acik')} deger={String(odev.acik)} />
        <Olcu etiket={t('kocluk.odev.geciken')} deger={String(odev.geciken)} />
        <Olcu etiket={t('kocluk.odev.teslim')} deger={String(odev.teslim_edildi)} />
        <Olcu etiket={t('kocluk.odev.inceleme')} deger={String(odev.inceleme_bekleyen)} />
      </dl>
      <div className="flex flex-wrap gap-2">
        <Link href={`${kok}/planlar`} className={dugmeStili({ gorunum: 'ikincil' })}>
          {t('kocluk.plan.planlara')}
        </Link>
        <Link href={`${kok}/odevler`} className={dugmeStili({ gorunum: 'ikincil' })}>
          {t('kocluk.plan.odevlere')}
        </Link>
      </div>
    </div>
  );
}
