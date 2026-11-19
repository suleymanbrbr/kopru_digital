'use client';

import { t } from '@kopru/i18n';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { Alan, MetinAlani, Secim } from '../ui/alan';
import { Dugme } from '../ui/dugme';
import { BosDurum, SorguHatasi, Yukleniyor } from '../ui/durum-gosterimi';
import { Kart, KartBasligi, SayfaBasligi } from '../ui/kart';
import { OnayPenceresi } from '../ui/onay-penceresi';
import { Rozet, type RozetTonu } from '../ui/rozet';
import { Tablo, Td, Th } from '../ui/tablo';
import { Uyari } from '../ui/uyari';

import { platform } from '@/lib/api';
import { tarihSaat, yerelIso } from '@/lib/bicim';
import { useYonetici } from '@/lib/oturum';
import type { Mesaj, MesajGovde, MesajListesi } from '@/lib/tipler';

const ANAHTAR = ['mesajlar'] as const;
type Onem = Mesaj['onem'];
const ONEM_TONU: Record<Onem, RozetTonu> = { bilgi: 'bilgi', uyari: 'uyari', kritik: 'hata' };

/** Mesajin gosterim durumu (yayinda / planli / bitti / iptal). */
export function mesajDurumu(
  m: Pick<Mesaj, 'baslangic_at' | 'bitis_at' | 'iptal_at'>,
  simdi = Date.now(),
) {
  if (m.iptal_at) return 'iptal' as const;
  if (Date.parse(m.bitis_at) <= simdi) return 'bitti' as const;
  if (Date.parse(m.baslangic_at) > simdi) return 'planli' as const;
  return 'yayinda' as const;
}
const DURUM_ETIKET = {
  yayinda: 'yonetim.mesajlar.durumYayinda',
  planli: 'yonetim.mesajlar.durumPlanli',
  bitti: 'yonetim.mesajlar.durumBitti',
  iptal: 'yonetim.mesajlar.durumIptal',
} as const;
const DURUM_TONU: Record<keyof typeof DURUM_ETIKET, RozetTonu> = {
  yayinda: 'basari',
  planli: 'bilgi',
  bitti: 'notr',
  iptal: 'notr',
};

function YeniMesaj() {
  const istemci = useQueryClient();
  const [baslik, setBaslik] = useState('');
  const [metin, setMetin] = useState('');
  const [onem, setOnem] = useState<Onem>('bilgi');
  const [baslangic, setBaslangic] = useState('');
  const [bitis, setBitis] = useState('');
  const [onay, setOnay] = useState(false);
  const [basari, setBasari] = useState(false);

  const bitisIso = yerelIso(bitis);
  const baslangicIso = yerelIso(baslangic);
  const bitisHata =
    bitis && baslangicIso && bitisIso && Date.parse(bitisIso) <= Date.parse(baslangicIso)
      ? t('yonetim.mesajlar.bitisGecmis')
      : undefined;
  const gecerli =
    baslik.trim().length > 0 && metin.trim().length > 0 && Boolean(bitisIso) && !bitisHata;

  const yayinla = useMutation({
    mutationFn: () => {
      const govde: MesajGovde = {
        baslik: baslik.trim(),
        metin: metin.trim(),
        onem,
        bitis_at: bitisIso ?? '',
        ...(baslangicIso ? { baslangic_at: baslangicIso } : {}),
      };
      return platform.yolla('mesajlar', govde);
    },
    onSuccess: async () => {
      setOnay(false);
      setBasari(true);
      setBaslik('');
      setMetin('');
      setBaslangic('');
      setBitis('');
      await istemci.invalidateQueries({ queryKey: ANAHTAR });
    },
  });

  const gonder = (e: { preventDefault: () => void }) => {
    e.preventDefault();
    if (!gecerli) return;
    yayinla.reset();
    setBasari(false);
    setOnay(true);
  };

  return (
    <Kart aria-labelledby="yeni-mesaj">
      <KartBasligi id="yeni-mesaj" baslik={t('yonetim.mesajlar.yeni')} />
      {basari ? (
        <Uyari ton="basari" className="mb-3">
          {t('yonetim.mesajlar.yayinlandi')}
        </Uyari>
      ) : null}
      <form onSubmit={gonder} className="grid gap-4 sm:grid-cols-2">
        <Alan
          etiket={t('yonetim.mesajlar.mesajBaslik')}
          maxLength={120}
          value={baslik}
          onChange={(e) => {
            setBaslik(e.target.value);
          }}
          kapsayiciSinifi="sm:col-span-2"
          required
        />
        <MetinAlani
          etiket={t('yonetim.mesajlar.metin')}
          maxLength={2000}
          value={metin}
          onChange={(e) => {
            setMetin(e.target.value);
          }}
          kapsayiciSinifi="sm:col-span-2"
          required
        />
        <Secim
          etiket={t('yonetim.mesajlar.onem')}
          value={onem}
          onChange={(e) => {
            setOnem(e.target.value as Onem);
          }}
        >
          <option value="bilgi">{t('platform.mesajOnem.bilgi')}</option>
          <option value="uyari">{t('platform.mesajOnem.uyari')}</option>
          <option value="kritik">{t('platform.mesajOnem.kritik')}</option>
        </Secim>
        <div className="hidden sm:block" />
        <Alan
          etiket={t('yonetim.mesajlar.baslangic')}
          type="datetime-local"
          value={baslangic}
          onChange={(e) => {
            setBaslangic(e.target.value);
          }}
        />
        <Alan
          etiket={t('yonetim.mesajlar.bitis')}
          type="datetime-local"
          value={bitis}
          hata={bitisHata}
          onChange={(e) => {
            setBitis(e.target.value);
          }}
          required
        />
        <div className="sm:col-span-2">
          <Dugme type="submit" disabled={!gecerli}>
            {t('yonetim.mesajlar.yayinla')}
          </Dugme>
        </div>
      </form>

      <OnayPenceresi
        acik={onay}
        onKapat={() => {
          yayinla.reset();
          setOnay(false);
        }}
        baslik={t('yonetim.mesajlar.yayinOnayBaslik')}
        aciklama={t('yonetim.mesajlar.yayinOnayMetin', { baslik: baslik.trim() })}
        onayEtiketi={t('yonetim.mesajlar.yayinla')}
        bekliyor={yayinla.isPending}
        hata={yayinla.error}
        onOnayla={() => {
          yayinla.mutate();
        }}
      />
    </Kart>
  );
}

export function MesajlarSayfasi() {
  const yonetici = useYonetici();
  const istemci = useQueryClient();
  const [iptalMesaj, setIptalMesaj] = useState<Mesaj | null>(null);
  const [iptalEdildi, setIptalEdildi] = useState(false);

  const sorgu = useQuery({
    queryKey: ANAHTAR,
    queryFn: () => platform.al<MesajListesi>('mesajlar'),
  });
  const iptal = useMutation({
    mutationFn: (id: string) => platform.yolla(`mesajlar/${id}/iptal`),
    onSuccess: async () => {
      setIptalMesaj(null);
      setIptalEdildi(true);
      await istemci.invalidateQueries({ queryKey: ANAHTAR });
    },
  });

  return (
    <>
      <SayfaBasligi
        baslik={t('yonetim.mesajlar.baslik')}
        aciklama={t('yonetim.mesajlar.aciklama')}
      />
      <div className="flex flex-col gap-4">
        {yonetici ? <YeniMesaj /> : <Uyari ton="bilgi">{t('yonetim.kurum.yazmaYok')}</Uyari>}

        <Kart aria-labelledby="mesaj-liste">
          <KartBasligi id="mesaj-liste" baslik={t('yonetim.mesajlar.liste')} />
          {iptalEdildi ? (
            <Uyari ton="basari" className="mb-3">
              {t('yonetim.mesajlar.iptalEdildi')}
            </Uyari>
          ) : null}
          {sorgu.isPending ? (
            <Yukleniyor />
          ) : sorgu.error ? (
            <SorguHatasi
              hata={sorgu.error}
              onTekrar={() => {
                void sorgu.refetch();
              }}
            />
          ) : sorgu.data.mesajlar.length === 0 ? (
            <BosDurum>{t('yonetim.mesajlar.bos')}</BosDurum>
          ) : (
            <Tablo etiket={t('yonetim.mesajlar.listeTablo')}>
              <thead>
                <tr>
                  <Th>{t('yonetim.mesajlar.mesajBaslik')}</Th>
                  <Th>{t('yonetim.mesajlar.onem')}</Th>
                  <Th>{t('yonetim.denetim.sutunZaman')}</Th>
                  <Th>{t('yonetim.kurumlar.sutunDurum')}</Th>
                  {yonetici ? <Th className="text-right">{t('yonetim.ortak.islem')}</Th> : null}
                </tr>
              </thead>
              <tbody>
                {sorgu.data.mesajlar.map((m) => {
                  const d = mesajDurumu(m);
                  return (
                    <tr key={m.id}>
                      <Td className="min-w-48">
                        <p className="font-medium">{m.baslik}</p>
                        <p className="mt-0.5 text-xs text-metin-ikincil">{m.metin}</p>
                      </Td>
                      <Td>
                        <Rozet ton={ONEM_TONU[m.onem]}>{t(`platform.mesajOnem.${m.onem}`)}</Rozet>
                      </Td>
                      <Td className="text-xs whitespace-nowrap">
                        {t('yonetim.mesajlar.aralik', {
                          bas: tarihSaat(m.baslangic_at),
                          bit: tarihSaat(m.bitis_at),
                        })}
                      </Td>
                      <Td>
                        <Rozet ton={DURUM_TONU[d]}>{t(DURUM_ETIKET[d])}</Rozet>
                      </Td>
                      {yonetici ? (
                        <Td className="text-right">
                          {d === 'yayinda' || d === 'planli' ? (
                            <Dugme
                              gorunum="ikincil"
                              boyut="sm"
                              aria-label={`${t('yonetim.mesajlar.iptal')}: ${m.baslik}`}
                              onClick={() => {
                                iptal.reset();
                                setIptalEdildi(false);
                                setIptalMesaj(m);
                              }}
                            >
                              {t('yonetim.mesajlar.iptal')}
                            </Dugme>
                          ) : null}
                        </Td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </Tablo>
          )}
        </Kart>
      </div>

      <OnayPenceresi
        acik={iptalMesaj !== null}
        onKapat={() => {
          iptal.reset();
          setIptalMesaj(null);
        }}
        baslik={t('yonetim.mesajlar.iptalOnayBaslik')}
        aciklama={t('yonetim.mesajlar.iptalOnayMetin', { baslik: iptalMesaj?.baslik ?? '' })}
        onayEtiketi={t('yonetim.mesajlar.iptal')}
        tehlike
        bekliyor={iptal.isPending}
        hata={iptal.error}
        onOnayla={() => {
          if (iptalMesaj) iptal.mutate(iptalMesaj.id);
        }}
      />
    </>
  );
}
