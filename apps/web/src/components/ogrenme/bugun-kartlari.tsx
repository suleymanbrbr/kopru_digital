'use client';

import { OdevOzetSema } from '@kopru/contracts';
import { t } from '@kopru/i18n';
import { useQueries } from '@tanstack/react-query';
import { ClipboardCheck, NotebookPen, Sparkles } from 'lucide-react';
import Link from 'next/link';

import { BosDurum } from '@/components/bos-durum';
import { BolumKarti } from '@/components/bugun/bolum-karti';
import { zamanYaz } from '@/components/hesap/ortak';
import { dugmeStili } from '@/components/ui/button';
import { Rozet } from '@/components/ui/rozet';
import { useKurum } from '@/kurum/baglam';
import { bransAdi } from '@/lib/bransler';
import { ogrenmeIstek } from '@/lib/hesap-istek';
import { gecikmisMi } from '@/lib/ogrenme/odev';
import { miktarEtiketi } from '@/lib/ogrenme/plan';
import {
  ogrenmeAnahtari,
  useDenemeler,
  useGorevlerim,
  useOdevler,
  useOdevlerim,
} from '@/lib/ogrenme/veri';

/** Ogrenci Bugun: bugunku plan gorevleri (`haftalik_plan` acikken). */
export function BugunPlanKarti() {
  const { uyelik } = useKurum();
  const kok = `/${uyelik.kurumId}`;
  const q = useGorevlerim(uyelik.kurumId, undefined);
  const gorevler = q.data?.gorevler ?? [];
  return (
    <BolumKarti
      baslik={t('bugun.gorevler')}
      yukleniyor={q.isPending}
      hata={q.isError}
      tekrarDene={() => void q.refetch()}
    >
      {gorevler.length === 0 ? (
        <BosDurum
          ikon={Sparkles}
          baslik={t('bugun.gorevBos')}
          aciklama={t('bugun.gorevBosAciklama')}
        >
          <Link href={`${kok}/planlar`} className={dugmeStili({ gorunum: 'ikincil' })}>
            {t('ogrenme.bugun.planaGit')}
          </Link>
        </BosDurum>
      ) : (
        <>
          <ul className="divide-y divide-kenar">
            {gorevler.map((g) => (
              <li key={g.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                <span className="min-w-0 truncate font-medium">{bransAdi(g.brans_kodu)}</span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="text-metin-ikincil">
                    {miktarEtiketi(g.hedef_turu, g.hedef_miktar)}
                  </span>
                  {g.durum === 'tamam' ? (
                    <Rozet ton="basari">{t('ogrenme.plan.gorevDurum.tamam')}</Rozet>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
          <div className="border-t border-kenar p-3">
            <Link
              href={`${kok}/planlar`}
              className={dugmeStili({ gorunum: 'hayalet', boyut: 'sm' })}
            >
              {t('ogrenme.bugun.planaGit')}
            </Link>
          </div>
        </>
      )}
    </BolumKarti>
  );
}

/** Ogrenci Bugun: teslim bekleyen, yaklasan odevler (`odev` acikken). */
export function BugunOdevKarti() {
  const { uyelik } = useKurum();
  const kok = `/${uyelik.kurumId}`;
  const q = useOdevlerim(uyelik.kurumId, 'atandi');
  const liste = q.odevler
    .filter((o) => o.odev_durum === 'yayinda')
    .sort((a, b) => (a.son_teslim_at ?? '9999').localeCompare(b.son_teslim_at ?? '9999'))
    .slice(0, 4);
  return (
    <BolumKarti
      baslik={t('ogrenme.bugun.yaklasanOdevler')}
      yukleniyor={q.isPending}
      hata={q.isError}
      tekrarDene={() => void q.refetch()}
    >
      {liste.length === 0 ? (
        <BosDurum
          ikon={NotebookPen}
          baslik={t('ogrenme.bugun.odevBos')}
          aciklama={t('ogrenme.bugun.odevBosAciklama')}
        />
      ) : (
        <>
          <ul className="divide-y divide-kenar">
            {liste.map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{o.baslik}</span>
                  <span className="text-metin-ikincil">
                    {o.son_teslim_at
                      ? t('ogrenme.odev.sonTeslimGoster', { tarih: zamanYaz(o.son_teslim_at) })
                      : t('ogrenme.bugun.tarihsiz')}
                  </span>
                </span>
                {gecikmisMi(o.durum, o.son_teslim_at) ? (
                  <Rozet ton="hata">{t('ogrenme.odev.gecikti')}</Rozet>
                ) : null}
              </li>
            ))}
          </ul>
          <div className="border-t border-kenar p-3">
            <Link
              href={`${kok}/odevlerim`}
              className={dugmeStili({ gorunum: 'hayalet', boyut: 'sm' })}
            >
              {t('ogrenme.bugun.odevlereGit')}
            </Link>
          </div>
        </>
      )}
    </BolumKarti>
  );
}

/** Ogretmen Bugun: inceleme bekleyen teslimler ve onay bekleyen denemeler (acik moduller icin). */
export function BugunBekleyenKarti() {
  const { uyelik, acikModuller } = useKurum();
  const kurumId = uyelik.kurumId;
  const kok = `/${kurumId}`;
  const odevAcik = acikModuller.includes('odev');
  const denemeAcik = acikModuller.includes('deneme');
  const odevler = useOdevler(kurumId, 'yayinda', odevAcik);
  const ozetler = useQueries({
    queries: odevler.odevler.slice(0, 10).map((o) => ({
      queryKey: [...ogrenmeAnahtari(kurumId), 'odev-ozet', o.id],
      queryFn: () =>
        ogrenmeIstek(`kurumlar/${kurumId}/odevler/${o.id}/ozet`, { sema: OdevOzetSema }),
    })),
  });
  const denemeler = useDenemeler(kurumId, { onay: 'bekliyor' }, denemeAcik);

  if (!odevAcik && !denemeAcik) return null;
  const incelenecek = ozetler.reduce((t2, q) => t2 + (q.data?.sayilar.teslim_edildi ?? 0), 0);
  const yukleniyor = (odevAcik && odevler.isPending) || (denemeAcik && denemeler.isPending);
  const hata = (odevAcik && odevler.isError) || (denemeAcik && denemeler.isError);
  const onayBekleyen = denemeler.denemeler.length;
  const onayMetni = denemeler.hasNextPage ? `${String(onayBekleyen)}+` : String(onayBekleyen);

  return (
    <BolumKarti
      baslik={t('ogrenme.bugun.bekleyenler')}
      yukleniyor={yukleniyor}
      hata={hata}
      tekrarDene={() => {
        void odevler.refetch();
        void denemeler.refetch();
      }}
    >
      {incelenecek === 0 && onayBekleyen === 0 ? (
        <BosDurum
          ikon={ClipboardCheck}
          baslik={t('ogrenme.bugun.bekleyenBos')}
          aciklama={t('ogrenme.bugun.bekleyenBosAciklama')}
        />
      ) : (
        <ul className="divide-y divide-kenar">
          {odevAcik ? (
            <li className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
              <span>
                <span className="font-semibold" data-testid="bekleyen-teslim">
                  {incelenecek}
                </span>{' '}
                {t('ogrenme.bugun.incelenecekTeslim')}
              </span>
              <Link
                href={`${kok}/odevler`}
                className={dugmeStili({ gorunum: 'ikincil', boyut: 'sm' })}
              >
                {t('ogrenme.bugun.odevlereGit')}
              </Link>
            </li>
          ) : null}
          {denemeAcik ? (
            <li className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
              <span>
                <span className="font-semibold" data-testid="bekleyen-deneme">
                  {onayMetni}
                </span>{' '}
                {t('ogrenme.bugun.onayBekleyenDeneme')}
              </span>
              <Link
                href={`${kok}/denemeler`}
                className={dugmeStili({ gorunum: 'ikincil', boyut: 'sm' })}
              >
                {t('ogrenme.bugun.denemelereGit')}
              </Link>
            </li>
          ) : null}
        </ul>
      )}
    </BolumKarti>
  );
}
