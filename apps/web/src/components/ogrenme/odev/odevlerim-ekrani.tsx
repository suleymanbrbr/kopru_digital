'use client';

import type { OgrenciOdeviTipi } from '@kopru/contracts';
import { t } from '@kopru/i18n';
import { useMutation } from '@tanstack/react-query';
import { NotebookPen } from 'lucide-react';
import { useState } from 'react';

import { BosDurum } from '@/components/bos-durum';
import { HataDurumu } from '@/components/hata-durumu';
import {
  BildirimKutusu,
  DahaFazla,
  ListeIskeleti,
  basari,
  zamanYaz,
  type Bildirim,
} from '@/components/hesap/ortak';
import { BolumKapisi } from '@/components/kabuk/bolum-yer-tutucu';
import { SayfaBasligi } from '@/components/kabuk/sayfa-basligi';
import { Alan } from '@/components/operasyon/ortak';
import { Dugme } from '@/components/ui/button';
import { Girdi } from '@/components/ui/input';
import { Pencere } from '@/components/ui/pencere';
import { Rozet } from '@/components/ui/rozet';
import { Secim } from '@/components/ui/secim';
import { useKurum } from '@/kurum/baglam';
import { hataMesaji } from '@/lib/api';
import { bransAdi } from '@/lib/bransler';
import { ogrenmeIstek } from '@/lib/hesap-istek';
import { gecikmisMi, ogrenciOdevDurumu, teslimDogrula } from '@/lib/ogrenme/odev';
import { useOdevlerim, useOgrenmeYenile } from '@/lib/ogrenme/veri';

export function OdevlerimEkrani() {
  return (
    <BolumKapisi bolum="odevlerim">
      <OdevlerimIcerigi />
    </BolumKapisi>
  );
}

const DURUMLAR = ['', 'atandi', 'teslim_edildi', 'incelendi', 'tekrar_istendi'] as const;

function OdevlerimIcerigi() {
  const { uyelik } = useKurum();
  const kurumId = uyelik.kurumId;
  const [durum, setDurum] = useState<(typeof DURUMLAR)[number]>('');
  const veri = useOdevlerim(kurumId, durum);
  const [teslim, setTeslim] = useState<OgrenciOdeviTipi | null>(null);
  const [bildirim, setBildirim] = useState<Bildirim>(null);

  return (
    <>
      <SayfaBasligi baslik={t('nav.odevlerim')} aciklama={t('ogrenme.odev.ogrenciAciklama')} />
      <div className="mb-4">
        <BildirimKutusu bildirim={bildirim} />
      </div>
      <section
        aria-label={t('ogrenme.odev.liste')}
        className="rounded-buyuk border border-kenar bg-yuzey"
      >
        <div className="flex flex-wrap items-center gap-3 border-b border-kenar p-4">
          <label htmlFor="odevlerim-durum" className="text-sm font-medium">
            {t('ogrenme.odev.durumSuzgeci')}
          </label>
          <div className="w-52">
            <Secim
              id="odevlerim-durum"
              value={durum}
              onChange={(e) => {
                setDurum(e.target.value as (typeof DURUMLAR)[number]);
              }}
            >
              {DURUMLAR.map((d) => (
                <option key={d || 'tumu'} value={d}>
                  {d ? t(`ogrenme.odev.durum.${d}`) : t('ogrenme.ortak.tumu')}
                </option>
              ))}
            </Secim>
          </div>
        </div>
        {veri.isPending ? (
          <ListeIskeleti satir={3} />
        ) : veri.isError ? (
          <HataDurumu
            baslik={t('ogrenme.odev.yuklenemedi')}
            aciklama={hataMesaji(veri.error)}
            tekrarDene={() => void veri.refetch()}
          />
        ) : veri.odevler.length === 0 ? (
          <BosDurum
            className="py-14"
            ikon={NotebookPen}
            baslik={durum ? t('ogrenme.odev.bosSuzgec') : t('ogrenme.odev.ogrenciBos')}
            aciklama={
              durum ? t('ogrenme.odev.bosSuzgecAciklama') : t('ogrenme.odev.ogrenciBosAciklama')
            }
          />
        ) : (
          <ul className="divide-y divide-kenar">
            {veri.odevler.map((o) => (
              <OdevKarti
                key={o.id}
                odev={o}
                teslimEt={() => {
                  setTeslim(o);
                }}
              />
            ))}
          </ul>
        )}
        <DahaFazla
          daha={veri.hasNextPage}
          yukleniyor={veri.isFetchingNextPage}
          yukle={() => void veri.fetchNextPage()}
        />
      </section>
      {teslim ? (
        <TeslimFormu
          kurumId={kurumId}
          odev={teslim}
          kapat={() => {
            setTeslim(null);
          }}
          bitti={() => {
            setTeslim(null);
            setBildirim(basari(t('ogrenme.odev.teslimEdildiMesaj')));
          }}
        />
      ) : null}
    </>
  );
}

function OdevKarti({ odev: o, teslimEt }: { odev: OgrenciOdeviTipi; teslimEt: () => void }) {
  const d = ogrenciOdevDurumu(o.durum);
  const gecikti = gecikmisMi(o.durum, o.son_teslim_at);
  const teslimEdilebilir =
    (o.durum === 'atandi' || o.durum === 'tekrar_istendi') && o.odev_durum === 'yayinda';
  return (
    <li className="flex flex-col gap-2 px-4 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-medium">{o.baslik}</p>
          <p className="text-sm text-metin-ikincil">
            {bransAdi(o.brans_kodu)}
            {o.kaynak ? ` · ${o.kaynak}` : ''}
            {o.hedef_soru_sayisi
              ? ` · ${t('ogrenme.odev.hedefSoru', { n: o.hedef_soru_sayisi })}`
              : ''}
            {o.son_teslim_at
              ? ` · ${t('ogrenme.odev.sonTeslimGoster', { tarih: zamanYaz(o.son_teslim_at) })}`
              : ''}
          </p>
        </div>
        {gecikti ? <Rozet ton="hata">{t('ogrenme.odev.gecikti')}</Rozet> : null}
        <Rozet ton={d.ton}>{d.etiket}</Rozet>
        {teslimEdilebilir ? (
          <Dugme
            boyut="sm"
            aria-label={t('ogrenme.odev.teslimEtEtiket', { baslik: o.baslik })}
            onClick={teslimEt}
          >
            {t(
              o.durum === 'tekrar_istendi' ? 'ogrenme.odev.tekrarTeslim' : 'ogrenme.odev.teslimEt',
            )}
          </Dugme>
        ) : null}
      </div>
      {o.teslim_at && o.yapilan_soru_sayisi !== null ? (
        <p className="text-sm text-metin-ikincil">
          {t('ogrenme.odev.teslimOzeti', {
            yapilan: o.yapilan_soru_sayisi,
            dogru: o.dogru_sayisi ?? '-',
            yanlis: o.yanlis_sayisi ?? '-',
            bos: o.bos_sayisi ?? '-',
          })}
        </p>
      ) : null}
      {o.inceleme_sonucu ? (
        <div className="rounded-orta bg-yuzey-ikincil px-3 py-2 text-sm">
          <p className="font-medium">
            {t('ogrenme.odev.incelemeSonucu')}: {t(`ogrenme.odev.sonuc.${o.inceleme_sonucu}`)}
          </p>
          {o.inceleme_notu ? <p className="mt-0.5">{o.inceleme_notu}</p> : null}
        </div>
      ) : null}
    </li>
  );
}

function TeslimFormu({
  kurumId,
  odev,
  kapat,
  bitti,
}: {
  kurumId: string;
  odev: OgrenciOdeviTipi;
  kapat: () => void;
  bitti: () => void;
}) {
  const yenile = useOgrenmeYenile(kurumId);
  const [yapilan, setYapilan] = useState(
    odev.hedef_soru_sayisi ? String(odev.hedef_soru_sayisi) : '',
  );
  const [dogru, setDogru] = useState('');
  const [yanlis, setYanlis] = useState('');
  const [bos, setBos] = useState('');
  const [not, setNot] = useState('');
  const [hata, setHata] = useState<string | null>(null);
  const [sayiHatasi, setSayiHatasi] = useState<string | undefined>();

  const kaydet = useMutation({
    mutationFn: () => {
      const sayi = (v: string) => (v.trim() === '' ? {} : Number(v));
      return ogrenmeIstek(`kurumlar/${kurumId}/ogrenci-odevleri/${odev.id}/teslim`, {
        govde: {
          yapilan_soru_sayisi: Number(yapilan),
          ...(dogru.trim() === '' ? {} : { dogru_sayisi: sayi(dogru) }),
          ...(yanlis.trim() === '' ? {} : { yanlis_sayisi: sayi(yanlis) }),
          ...(bos.trim() === '' ? {} : { bos_sayisi: sayi(bos) }),
          ...(not.trim() ? { ogrenci_notu: not.trim() } : {}),
        },
      });
    },
    onSuccess: async () => {
      await yenile();
      bitti();
    },
    onError: (h) => {
      setHata(hataMesaji(h));
    },
  });

  const sayiAlani = (etiket: string, deger: string, degis: (v: string) => void, hata?: string) => (
    <Alan etiket={etiket} hata={hata}>
      {(o) => (
        <Girdi
          {...o}
          inputMode="numeric"
          value={deger}
          onChange={(e) => {
            degis(e.target.value);
          }}
        />
      )}
    </Alan>
  );

  return (
    <Pencere
      acik
      degisti={(a) => {
        if (!a) kapat();
      }}
      baslik={t('ogrenme.odev.teslimBaslik', { baslik: odev.baslik })}
      aciklama={t('ogrenme.odev.teslimAciklama')}
    >
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          setHata(null);
          const h = teslimDogrula(yapilan, dogru, yanlis, bos);
          setSayiHatasi(h ? t(`ogrenme.odev.teslimHata.${h}`) : undefined);
          if (!h) kaydet.mutate();
        }}
        className="flex flex-col gap-4"
      >
        {sayiAlani(t('ogrenme.odev.yapilan'), yapilan, setYapilan, sayiHatasi)}
        <div className="grid grid-cols-3 gap-3">
          {sayiAlani(t('ogrenme.odev.dogru'), dogru, setDogru)}
          {sayiAlani(t('ogrenme.odev.yanlis'), yanlis, setYanlis)}
          {sayiAlani(t('ogrenme.odev.bosSayi'), bos, setBos)}
        </div>
        <Alan etiket={t('ogrenme.odev.ogrenciNotu')}>
          {(o) => (
            <textarea
              {...o}
              value={not}
              rows={3}
              maxLength={1000}
              onChange={(e) => {
                setNot(e.target.value);
              }}
              className="w-full rounded-orta border border-kenar bg-yuzey px-3 py-2 text-base"
            />
          )}
        </Alan>
        {hata ? (
          <p role="alert" className="text-sm text-hata">
            {hata}
          </p>
        ) : null}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Dugme type="button" gorunum="ikincil" onClick={kapat}>
            {t('ortak.vazgec')}
          </Dugme>
          <Dugme type="submit" disabled={kaydet.isPending}>
            {kaydet.isPending ? t('ortak.yukleniyor') : t('ogrenme.odev.teslimGonder')}
          </Dugme>
        </div>
      </form>
    </Pencere>
  );
}
