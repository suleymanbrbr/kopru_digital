'use client';

import { t } from '@kopru/i18n';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';

import { Dugme } from '../ui/dugme';
import { BosDurum, SorguHatasi, Yukleniyor } from '../ui/durum-gosterimi';
import { Kart, KartBasligi, SayfaBasligi } from '../ui/kart';
import { OnayPenceresi } from '../ui/onay-penceresi';
import { Rozet } from '../ui/rozet';
import { Uyari } from '../ui/uyari';

import { bff, platform } from '@/lib/api';
import { dakikaSaniye, tarihSaat } from '@/lib/bicim';
import { hataMetni } from '@/lib/hata';
import { useKalanSure } from '@/lib/kalan-sure';
import { TAKLIT_ANAHTARI, useTaklit } from '@/lib/oturum';
import type { KurumDetayi, TaklitOzeti } from '@/lib/tipler';

const OKUMALAR = [
  { yol: 'hesap/ben', etiket: 'yonetim.taklit.okumaBen' },
  { yol: 'hesap/modul-ayarlari/etkin-tumu', etiket: 'yonetim.taklit.okumaModuller' },
  { yol: 'KURUM', etiket: 'yonetim.taklit.okumaKurum' },
] as const;

function Okumalar({ taklit }: { taklit: TaklitOzeti }) {
  const [calisan, setCalisan] = useState<string | null>(null);
  const [sonuc, setSonuc] = useState<{ etiket: string; metin: string } | null>(null);

  const oku = useMutation({
    mutationFn: async (o: (typeof OKUMALAR)[number]) => {
      const yol = o.yol === 'KURUM' ? `hesap/kurumlar/${taklit.kurum_id}` : o.yol;
      return { etiket: t(o.etiket), veri: await bff.al<unknown>(`taklit/okuma/${yol}`) };
    },
    onSuccess: ({ etiket, veri }) => {
      setSonuc({ etiket, metin: JSON.stringify(veri, null, 2) });
    },
  });

  return (
    <Kart aria-labelledby="okuma-baslik">
      <KartBasligi
        id="okuma-baslik"
        baslik={t('yonetim.taklit.okumalar')}
        aciklama={t('yonetim.taklit.okumaAciklama')}
      />
      <div className="flex flex-wrap gap-2">
        {OKUMALAR.map((o) => (
          <Dugme
            key={o.yol}
            gorunum="ikincil"
            disabled={oku.isPending}
            onClick={() => {
              setCalisan(o.yol);
              setSonuc(null);
              oku.mutate(o);
            }}
          >
            {t(o.etiket)}
          </Dugme>
        ))}
      </div>
      {oku.error ? <Uyari ton="hata" className="mt-3" baslik={hataMetni(oku.error)} /> : null}
      {sonuc ? (
        <div className="mt-4">
          <h3 className="mb-1 text-sm font-medium">
            {t('yonetim.taklit.sonuc')}: {sonuc.etiket}
          </h3>
          <pre
            tabIndex={0}
            aria-label={t('yonetim.taklit.sonuc')}
            className="max-h-80 overflow-auto rounded-orta border border-kenar bg-yuzey-ikincil p-3 text-xs"
          >
            {sonuc.metin}
          </pre>
        </div>
      ) : calisan && oku.isPending ? (
        <Yukleniyor />
      ) : null}
    </Kart>
  );
}

function EtkinTaklit({ taklit, onSonlandi }: { taklit: TaklitOzeti; onSonlandi: () => void }) {
  const istemci = useQueryClient();
  const kalan = useKalanSure(taklit.bitis_at);
  const [onay, setOnay] = useState(false);
  const kurum = useQuery({
    queryKey: ['kurum', taklit.kurum_id],
    queryFn: () => platform.al<KurumDetayi>(`kurumlar/${taklit.kurum_id}`),
  });

  const sonlandir = useMutation({
    mutationFn: () => platform.yolla(`taklit/${taklit.taklit_id}/sonlandir`),
    onSuccess: async () => {
      setOnay(false);
      onSonlandi();
      await istemci.invalidateQueries({ queryKey: TAKLIT_ANAHTARI });
    },
  });

  const { dk, sn } = dakikaSaniye(kalan);
  const sureDoldu = kalan <= 0;

  return (
    <div className="flex flex-col gap-4">
      <Kart aria-labelledby="taklit-baslik">
        <KartBasligi
          id="taklit-baslik"
          baslik={sureDoldu ? t('yonetim.taklit.bitti') : t('yonetim.taklit.basladi')}
          aciklama={sureDoldu ? t('yonetim.taklit.bittiAciklama') : undefined}
          sag={<Rozet ton="uyari">{t('yonetim.taklit.saltOkunur')}</Rozet>}
        />
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-metin-ikincil">{t('yonetim.taklit.kurum')}</dt>
          <dd>
            <Link
              href={`/kurumlar/${taklit.kurum_id}`}
              className="font-medium text-birincil underline-offset-2 hover:underline"
            >
              {kurum.data?.ad ?? taklit.kurum_id}
            </Link>
          </dd>
          <dt className="text-metin-ikincil">{t('yonetim.taklit.hedef')}</dt>
          <dd className="font-mono text-xs break-all">{taklit.hedef_kullanici_id}</dd>
          <dt className="text-metin-ikincil">{t('yonetim.taklit.rol')}</dt>
          <dd>{t(`roller.${taklit.rol as 'sahip'}`)}</dd>
          <dt className="text-metin-ikincil">{t('yonetim.taklit.bitis')}</dt>
          <dd>{tarihSaat(taklit.bitis_at)}</dd>
          <dt className="text-metin-ikincil">{t('yonetim.taklit.kalan')}</dt>
          <dd>
            <span role="timer" aria-live="off" className="text-lg font-semibold tabular-nums">
              {t('yonetim.taklit.kalanDeger', { dk, sn })}
            </span>
          </dd>
        </dl>
        <div className="mt-4">
          <Dugme
            gorunum="tehlike"
            onClick={() => {
              sonlandir.reset();
              setOnay(true);
            }}
          >
            {t('yonetim.taklit.sonlandir')}
          </Dugme>
        </div>
      </Kart>

      {!sureDoldu ? <Okumalar taklit={taklit} /> : null}
      <p className="text-xs text-metin-ikincil">{t('yonetim.taklit.webNotu')}</p>

      <OnayPenceresi
        acik={onay}
        onKapat={() => {
          sonlandir.reset();
          setOnay(false);
        }}
        baslik={t('yonetim.taklit.sonlandir')}
        aciklama={t('yonetim.taklit.sonlandirOnay')}
        onayEtiketi={t('yonetim.taklit.sonlandir')}
        tehlike
        bekliyor={sonlandir.isPending}
        hata={sonlandir.error}
        onOnayla={() => {
          sonlandir.mutate();
        }}
      />
    </div>
  );
}

export function TaklitSayfasi() {
  const taklit = useTaklit();
  const [sonlandi, setSonlandi] = useState(false);
  return (
    <>
      <SayfaBasligi
        baslik={t('yonetim.taklit.baslik')}
        aciklama={t('yonetim.taklitBaslat.aciklama')}
      />
      {taklit.isPending ? (
        <Yukleniyor />
      ) : taklit.error ? (
        <SorguHatasi
          hata={taklit.error}
          onTekrar={() => {
            void taklit.refetch();
          }}
        />
      ) : taklit.data ? (
        <EtkinTaklit
          key={taklit.data.taklit_id}
          taklit={taklit.data}
          onSonlandi={() => {
            setSonlandi(true);
          }}
        />
      ) : (
        <>
          {sonlandi ? <Uyari ton="basari">{t('yonetim.taklit.sonlandi')}</Uyari> : null}
          <BosDurum>{t('yonetim.taklit.yok')}</BosDurum>
          <p className="-mt-4 text-center text-sm text-metin-ikincil">
            {t('yonetim.taklit.yokAciklama')}{' '}
            <Link href="/kurumlar" className="font-medium text-birincil underline">
              {t('yonetim.nav.kurumlar')}
            </Link>
          </p>
        </>
      )}
    </>
  );
}
