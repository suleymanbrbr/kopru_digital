'use client';

import type { KaynakOnerisi, KoclukYaniti } from '@kopru/contracts';
import { t } from '@kopru/i18n';
import { BookMarked, ExternalLink, Undo2 } from 'lucide-react';
import { useState } from 'react';

import { BosDurum } from '@/components/bos-durum';
import { tarihYaz } from '@/components/hesap/ortak';
import { kisaTarih } from '@/components/ogrenme/ortak';
import { Dugme } from '@/components/ui/button';
import { OnayPenceresi } from '@/components/ui/pencere';
import { Rozet } from '@/components/ui/rozet';
import { useKurum } from '@/kurum/baglam';
import { hataMesaji } from '@/lib/api';
import { bransAdi } from '@/lib/bransler';
import { guvenliBaglanti, oneriBasligi } from '@/lib/degerlendirme/model';
import { useOneriGeriCek } from '@/lib/degerlendirme/veri';

type Kullanilan = KoclukYaniti['kullanilan_kaynaklar'];

/** Öğrencinin günlük kayıtlarda ve ödevlerde kullandığı kaynaklar (kitap/test ilerlemesi, son kullanım). */
export function KullanilanKaynaklar({ kaynaklar }: { kaynaklar: Kullanilan }) {
  const { kitaplar, serbest, odevler } = kaynaklar;
  if (kitaplar.length + serbest.length + odevler.length === 0) {
    return (
      <BosDurum
        ikon={BookMarked}
        baslik={t('kocluk.kaynaklar.bos')}
        aciklama={t('kocluk.kaynaklar.bosAciklama')}
      />
    );
  }
  return (
    <div className="flex flex-col gap-4 p-5" data-testid="kullanilan-kaynaklar">
      {kitaplar.length > 0 ? (
        <section aria-labelledby="kk-kitaplar">
          <h4 id="kk-kitaplar" className="mb-2 text-sm font-medium text-metin-ikincil">
            {t('kocluk.kaynaklar.kitaplar')}
          </h4>
          <ul className="flex flex-col gap-3">
            {kitaplar.map((k) => (
              <li key={k.kaynak_kitap_id} data-testid="kullanilan-kitap">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium">
                    {k.ad}{' '}
                    <span className="text-sm text-metin-ikincil">· {bransAdi(k.brans_kodu)}</span>
                  </span>
                  <span className="text-sm text-metin-ikincil">
                    {t('kocluk.kaynaklar.sonKullanim', { tarih: kisaTarih(k.son_kullanim_gun) })}
                  </span>
                </div>
                <div
                  role="progressbar"
                  aria-label={k.ad}
                  aria-valuemin={0}
                  aria-valuemax={Math.max(k.toplam_test, 1)}
                  aria-valuenow={k.cozulen_test}
                  aria-valuetext={t('kocluk.ilerleme', {
                    cozulen: k.cozulen_test,
                    toplam: k.toplam_test,
                  })}
                  className="mt-1.5 h-2 overflow-hidden rounded-full bg-yuzey-ikincil"
                >
                  <div
                    className="h-full rounded-full bg-birincil"
                    style={{
                      width: `${String(k.toplam_test === 0 ? 0 : Math.round((k.cozulen_test / k.toplam_test) * 100))}%`,
                    }}
                  />
                </div>
                <p className="mt-1 text-sm text-metin-ikincil">
                  {t('kocluk.ilerleme', { cozulen: k.cozulen_test, toplam: k.toplam_test })} ·{' '}
                  {t('kocluk.kaynaklar.cozulenSoru', { n: k.cozulen_soru })} ·{' '}
                  {t('kocluk.kaynaklar.kayitSayisi', { n: k.kayit_sayisi })}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {serbest.length > 0 ? (
        <section aria-labelledby="kk-serbest">
          <h4 id="kk-serbest" className="mb-2 text-sm font-medium text-metin-ikincil">
            {t('kocluk.kaynaklar.serbest')}
          </h4>
          <ul className="flex flex-col gap-1.5 text-sm">
            {serbest.map((s) => (
              <li key={s.ad} className="flex flex-wrap justify-between gap-2">
                <span className="font-medium">{s.ad}</span>
                <span className="text-metin-ikincil">
                  {t('kocluk.kaynaklar.kayitSayisi', { n: s.kayit_sayisi })} ·{' '}
                  {t('kocluk.kaynaklar.sonKullanim', { tarih: kisaTarih(s.son_kullanim_gun) })}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {odevler.length > 0 ? (
        <section aria-labelledby="kk-odevler">
          <h4 id="kk-odevler" className="mb-2 text-sm font-medium text-metin-ikincil">
            {t('kocluk.kaynaklar.odevler')}
          </h4>
          <ul className="flex flex-col gap-1.5 text-sm">
            {odevler.map((o) => (
              <li key={o.ad} className="flex flex-wrap justify-between gap-2">
                <span className="font-medium">{o.ad}</span>
                <span className="text-metin-ikincil">
                  {t('kocluk.kaynaklar.odevSayisi', { n: o.odev_sayisi })} ·{' '}
                  {t('kocluk.kaynaklar.sonKullanim', { tarih: kisaTarih(o.son_kullanim_gun) })}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

/** "Başladı" durumu rozeti: günlük kayıtta o kaynak kullanıldıysa başladı; bağlantıda ölçülemez. */
export function BasladiRozeti({ oneri }: { oneri: KaynakOnerisi }) {
  if (oneri.basladi === null) return <Rozet ton="notr">{t('kaynakOnerisi.olculemez')}</Rozet>;
  return oneri.basladi ? (
    <Rozet ton="basari">{t('kaynakOnerisi.basladi')}</Rozet>
  ) : (
    <Rozet ton="uyari">{t('kaynakOnerisi.baslamadi')}</Rozet>
  );
}

/** Öğretmenlerin önerdiği kaynaklar (kim, ne zaman, öğrenci başladı mı); öneren ya da yönetici geri çeker. */
export function OnerilenKaynaklar({
  oneriler,
  bildir,
}: {
  oneriler: KaynakOnerisi[];
  bildir: (mesaj: string) => void;
}) {
  const { uyelik, rol } = useKurum();
  const yonetim = rol === 'sahip' || rol === 'yonetici';
  const geriCek = useOneriGeriCek(uyelik.kurumId);
  const [secilen, setSecilen] = useState<string | null>(null);

  if (oneriler.length === 0) {
    return (
      <BosDurum
        ikon={BookMarked}
        baslik={t('kaynakOnerisi.liste.bos')}
        aciklama={t('kaynakOnerisi.liste.bosAciklama')}
      />
    );
  }
  return (
    <>
      <ul className="divide-y divide-kenar" data-testid="oneri-listesi">
        {oneriler.map((o) => {
          const adres = guvenliBaglanti(o.baglanti_url);
          return (
            <li key={o.id} data-testid="oneri-satiri" className="flex flex-col gap-1.5 px-5 py-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{oneriBasligi(o)}</span>
                <Rozet ton="notr">{t(`kaynakOnerisi.tur.${o.tur}`)}</Rozet>
                <BasladiRozeti oneri={o} />
              </div>
              <p className="text-sm text-metin-ikincil">
                {t('kaynakOnerisi.liste.oneren', {
                  ad: o.oneren_ad ?? t('kocluk.zaman.yazarYok'),
                  tarih: tarihYaz(o.created_at),
                })}
                {o.brans_kodu ? ` · ${bransAdi(o.brans_kodu)}` : ''}
                {o.konu_ad ? ` · ${t('kaynakOnerisi.liste.konu', { konu: o.konu_ad })}` : ''}
              </p>
              {o.not ? <p className="whitespace-pre-line text-sm">{o.not}</p> : null}
              {o.basladi && o.son_kullanim_gun ? (
                <p className="text-sm text-metin-ikincil">
                  {t('kaynakOnerisi.liste.kullanim', {
                    n: o.kayit_sayisi,
                    tarih: kisaTarih(o.son_kullanim_gun),
                  })}
                </p>
              ) : null}
              <div className="flex flex-wrap gap-1">
                {adres ? (
                  <a
                    href={adres}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-9 items-center gap-2 rounded-orta px-3 text-sm font-medium text-birincil hover:bg-yuzey-ikincil"
                  >
                    <ExternalLink className="size-4" aria-hidden />
                    {t('kaynakOnerisi.liste.linkAc')}
                  </a>
                ) : null}
                {o.benim || yonetim ? (
                  <Dugme
                    type="button"
                    gorunum="hayalet"
                    boyut="sm"
                    onClick={() => {
                      setSecilen(o.id);
                    }}
                  >
                    <Undo2 aria-hidden />
                    {t('kaynakOnerisi.liste.geriCek')}
                  </Dugme>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
      <OnayPenceresi
        acik={secilen !== null}
        degisti={(a) => {
          if (!a) {
            setSecilen(null);
            geriCek.reset();
          }
        }}
        baslik={t('kaynakOnerisi.liste.geriCekOnay.baslik')}
        aciklama={
          geriCek.error ? hataMesaji(geriCek.error) : t('kaynakOnerisi.liste.geriCekOnay.aciklama')
        }
        onayEtiketi={t('kaynakOnerisi.liste.geriCekOnay.onay')}
        tehlikeli
        bekliyor={geriCek.isPending}
        onay={() => {
          if (!secilen) return;
          geriCek.mutate(secilen, {
            onSuccess: () => {
              setSecilen(null);
              bildir(t('kocluk.oneriGeriCekildi'));
            },
          });
        }}
      />
    </>
  );
}
