'use client';

import type { Degerlendirme } from '@kopru/contracts';
import { t } from '@kopru/i18n';
import { Eye, EyeOff, MessageSquareText, Pencil, Undo2 } from 'lucide-react';
import { useState } from 'react';

import { DegerlendirmeFormu } from './degerlendirme-formu';

import { BosDurum } from '@/components/bos-durum';
import { tarihYaz, zamanYaz } from '@/components/hesap/ortak';
import { Dugme } from '@/components/ui/button';
import { OnayPenceresi } from '@/components/ui/pencere';
import { Rozet } from '@/components/ui/rozet';
import { useKurum } from '@/kurum/baglam';
import { hataMesaji } from '@/lib/api';
import { bransAdi } from '@/lib/bransler';
import { OLCEKLER, donemEtiketi, olcekAdi } from '@/lib/degerlendirme/model';
import { degerlendirmeDevami, useDegerlendirmeGeriCek } from '@/lib/degerlendirme/veri';

interface Devam {
  /** Hangi koçluk yanıtının (`dataUpdatedAt`) devamı; yanıt yenilenince devam geçersiz sayılır. */
  zaman: number;
  liste: Degerlendirme[];
  imlec: string | null;
}

/**
 * Koçluk: öğrencinin tüm öğretmenlerinin değerlendirmeleri (en yeni önce). İlk sayfa koçluk yanıtındandır;
 * devamı sayfalı liste ucundan gelir. Yazar 7 gün içinde düzenler; yazar ya da sahip/yönetici geri çeker.
 */
export function ZamanCizelgesi({
  ogrenciId,
  ogrenciAd,
  ilk,
  yanitZamani,
  bildir,
}: {
  ogrenciId: string;
  ogrenciAd: string;
  ilk: { degerlendirmeler: Degerlendirme[]; sonraki_imlec: string | null };
  yanitZamani: number;
  bildir: (mesaj: string) => void;
}) {
  const { uyelik, rol, kullaniciAd } = useKurum();
  const kurumId = uyelik.kurumId;
  const yonetim = rol === 'sahip' || rol === 'yonetici';
  const [devam, setDevam] = useState<Devam | null>(null);
  const [yukleniyor, setYukleniyor] = useState(false);
  const [devamHatasi, setDevamHatasi] = useState<unknown>(null);
  const [duzenlenen, setDuzenlenen] = useState<Degerlendirme | undefined>(undefined);
  const [geriCekilecek, setGeriCekilecek] = useState<string | null>(null);
  const geriCek = useDegerlendirmeGeriCek(kurumId);

  const gecerli = devam?.zaman === yanitZamani ? devam : null;
  const liste = [...ilk.degerlendirmeler, ...(gecerli?.liste ?? [])];
  const imlec = gecerli ? gecerli.imlec : ilk.sonraki_imlec;

  const dahaFazla = async () => {
    if (!imlec || yukleniyor) return;
    setYukleniyor(true);
    setDevamHatasi(null);
    try {
      const yanit = await degerlendirmeDevami(kurumId, ogrenciId, imlec);
      setDevam({
        zaman: yanitZamani,
        liste: [...(gecerli?.liste ?? []), ...yanit.degerlendirmeler],
        imlec: yanit.sonraki_imlec,
      });
    } catch (hata) {
      setDevamHatasi(hata);
    } finally {
      setYukleniyor(false);
    }
  };

  if (liste.length === 0) {
    return (
      <BosDurum
        ikon={MessageSquareText}
        baslik={t('kocluk.zaman.bos')}
        aciklama={t('kocluk.zaman.bosAciklama')}
      />
    );
  }

  return (
    <>
      <ul className="divide-y divide-kenar" data-testid="degerlendirme-listesi">
        {liste.map((d) => (
          <li
            key={d.id}
            data-testid="degerlendirme-satiri"
            className="flex flex-col gap-2 px-5 py-4"
          >
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="font-medium">
                {d.benim
                  ? t('kocluk.zaman.sen', { ad: d.yazar_ad ?? kullaniciAd })
                  : (d.yazar_ad ?? t('kocluk.zaman.yazarYok'))}
              </span>
              <span className="text-sm text-metin-ikincil">
                {donemEtiketi(d.donem_baslangic, d.donem_bitis)}
              </span>
              <Rozet ton="notr">
                {d.brans_kodu ? bransAdi(d.brans_kodu) : t('kocluk.zaman.genel')}
              </Rozet>
              {d.ogrenci_gorur ? (
                <Rozet ton="bilgi">
                  <Eye className="mr-1 size-3" aria-hidden />
                  {t('kocluk.zaman.ogrenciGoruyor')}
                </Rozet>
              ) : (
                <Rozet ton="notr">
                  <EyeOff className="mr-1 size-3" aria-hidden />
                  {t('kocluk.zaman.ogrenciGormuyor')}
                </Rozet>
              )}
            </div>
            <Olcekler d={d} />
            {d.yorum ? <p className="whitespace-pre-line text-sm">{d.yorum}</p> : null}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-metin-ikincil">
                {t('kocluk.zaman.yazildi', { tarih: zamanYaz(d.created_at) })}
                {d.duzenlenebilir
                  ? ` · ${t('kocluk.zaman.duzenlenebilirSon', { tarih: tarihYaz(d.duzenleme_son_at) })}`
                  : ''}
              </p>
              <div className="flex gap-1">
                {d.duzenlenebilir ? (
                  <Dugme
                    type="button"
                    gorunum="hayalet"
                    boyut="sm"
                    onClick={() => {
                      setDuzenlenen(d);
                    }}
                  >
                    <Pencil aria-hidden />
                    {t('kocluk.zaman.duzenle')}
                  </Dugme>
                ) : null}
                {d.benim || yonetim ? (
                  <Dugme
                    type="button"
                    gorunum="hayalet"
                    boyut="sm"
                    onClick={() => {
                      setGeriCekilecek(d.id);
                    }}
                  >
                    <Undo2 aria-hidden />
                    {t('kocluk.zaman.geriCek')}
                  </Dugme>
                ) : null}
              </div>
            </div>
          </li>
        ))}
      </ul>
      {imlec || devamHatasi ? (
        <div className="flex flex-col gap-2 border-t border-kenar p-3">
          {devamHatasi ? (
            <p role="alert" className="text-sm text-hata">
              {hataMesaji(devamHatasi)}
            </p>
          ) : null}
          <Dugme
            type="button"
            gorunum="ikincil"
            className="self-start"
            disabled={yukleniyor}
            onClick={() => void dahaFazla()}
          >
            {yukleniyor ? t('ortak.yukleniyor') : t('kocluk.zaman.dahaFazla')}
          </Dugme>
        </div>
      ) : null}

      {duzenlenen ? (
        <DegerlendirmeFormu
          acik
          degisti={(a) => {
            if (!a) setDuzenlenen(undefined);
          }}
          ogrenciId={ogrenciId}
          ogrenciAd={ogrenciAd}
          duzelt={duzenlenen}
          bitti={bildir}
        />
      ) : null}
      <OnayPenceresi
        acik={geriCekilecek !== null}
        degisti={(a) => {
          if (!a) {
            setGeriCekilecek(null);
            geriCek.reset();
          }
        }}
        baslik={t('kocluk.geriCekOnay.baslik')}
        aciklama={geriCek.error ? hataMesaji(geriCek.error) : t('kocluk.geriCekOnay.aciklama')}
        onayEtiketi={t('kocluk.geriCekOnay.onay')}
        tehlikeli
        bekliyor={geriCek.isPending}
        onay={() => {
          if (!geriCekilecek) return;
          geriCek.mutate(geriCekilecek, {
            onSuccess: () => {
              setGeriCekilecek(null);
              bildir(t('kocluk.geriCekildi'));
            },
          });
        }}
      />
    </>
  );
}

function Olcekler({ d }: { d: Degerlendirme }) {
  const dolu = OLCEKLER.filter((o) => d[o] !== null);
  if (dolu.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-2" aria-label={t('degerlendirme.form.olcekler')}>
      {dolu.map((o) => (
        <li key={o}>
          <Rozet ton="bilgi" className="text-sm">
            {t('kocluk.zaman.olcekDegeri', { olcek: olcekAdi(o), puan: d[o] ?? 0 })}
          </Rozet>
        </li>
      ))}
    </ul>
  );
}
