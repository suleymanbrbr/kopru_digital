'use client';

import { t } from '@kopru/i18n';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, UserCog } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Alan, Secim } from '../ui/alan';
import { Dugme } from '../ui/dugme';
import { SorguHatasi, Yukleniyor } from '../ui/durum-gosterimi';
import { Kart, KartBasligi } from '../ui/kart';
import { OnayPenceresi } from '../ui/onay-penceresi';
import { Rozet } from '../ui/rozet';
import { Tablo, Td, Th } from '../ui/tablo';
import { Uyari } from '../ui/uyari';
import { AbonelikKarti, AskiKarti } from './abonelik';
import { DURUM_TONU } from './kurum-listesi';

import { platform } from '@/lib/api';
import { sahipMetni, tarih, uuidMi } from '@/lib/bicim';
import { useYonetici, TAKLIT_ANAHTARI } from '@/lib/oturum';
import type { KurumDetayi, ModulDurumu, TaklitSonuc } from '@/lib/tipler';

type ModulKodu = ModulDurumu['modul_kodu'];

interface ModulIslemi {
  kod: ModulKodu;
  /** `null`: kurum ayarini sil (varsayilana don). */
  acik: boolean | null;
}
interface BetaIslemi {
  kod: string;
  acik: boolean | null;
}

const kurumAnahtari = (id: string) => ['kurum', id] as const;

function TaklitBaslatPenceresi({
  kurum,
  acik,
  onKapat,
}: {
  kurum: KurumDetayi;
  acik: boolean;
  onKapat: () => void;
}) {
  const router = useRouter();
  const istemci = useQueryClient();
  const [secim, setSecim] = useState(kurum.sahipler[0]?.kullanici_id ?? 'diger');
  const [kimlik, setKimlik] = useState('');
  const hedef = secim === 'diger' ? kimlik.trim() : secim;
  const kimlikGecerli = uuidMi(hedef);

  const baslat = useMutation({
    mutationFn: (neden: string) =>
      platform.yolla<TaklitSonuc>('taklit', {
        hedef_kullanici_id: hedef,
        kurum_id: kurum.id,
        neden,
      }),
    onSuccess: async () => {
      await istemci.invalidateQueries({ queryKey: TAKLIT_ANAHTARI });
      onKapat();
      router.push('/taklit');
    },
  });

  return (
    <OnayPenceresi
      acik={acik}
      onKapat={() => {
        baslat.reset();
        onKapat();
      }}
      baslik={t('yonetim.taklitBaslat.baslik')}
      aciklama={t('yonetim.taklitBaslat.aciklama')}
      neden={{ min: 10 }}
      onayEtiketi={t('yonetim.taklitBaslat.baslat')}
      bekliyor={baslat.isPending}
      hata={baslat.error}
      gecerli={kimlikGecerli}
      onOnayla={(neden) => {
        baslat.mutate(neden);
      }}
    >
      <Secim
        etiket={t('yonetim.taklitBaslat.hedef')}
        value={secim}
        onChange={(e) => {
          setSecim(e.target.value);
        }}
      >
        {kurum.sahipler.map((s) => (
          <option key={s.kullanici_id} value={s.kullanici_id}>
            {t('yonetim.taklitBaslat.hedefSahip', {
              ad: sahipMetni(s),
            })}
          </option>
        ))}
        <option value="diger">{t('yonetim.taklitBaslat.hedefDiger')}</option>
      </Secim>
      {secim === 'diger' ? (
        <Alan
          etiket={t('yonetim.taklitBaslat.hedefKimlik')}
          yardim={t('yonetim.taklitBaslat.hedefKimlikYardim')}
          hata={kimlik && !kimlikGecerli ? t('yonetim.taklitBaslat.gecersizKimlik') : undefined}
          value={kimlik}
          onChange={(e) => {
            setKimlik(e.target.value);
          }}
          spellCheck={false}
        />
      ) : null}
    </OnayPenceresi>
  );
}

function ModullerKarti({ kurum, yonetici }: { kurum: KurumDetayi; yonetici: boolean }) {
  const istemci = useQueryClient();
  const [islem, setIslem] = useState<ModulIslemi | null>(null);
  const [basari, setBasari] = useState('');

  const kaydet = useMutation({
    mutationFn: ({ kod, acik, neden }: ModulIslemi & { neden: string }) =>
      platform.koy(`kurumlar/${kurum.id}/moduller/${kod}`, { acik, neden }),
    onSuccess: async () => {
      setBasari(t('yonetim.ortak.kaydedildi'));
      setIslem(null);
      await istemci.invalidateQueries({ queryKey: kurumAnahtari(kurum.id) });
    },
  });

  const ac = (kod: ModulKodu, acik: boolean | null) => {
    kaydet.reset();
    setBasari('');
    setIslem({ kod, acik });
  };
  const modulAdi = islem ? t(`modul.${islem.kod}`) : '';
  const islemMetni =
    islem?.acik === true
      ? t('yonetim.kurum.modulOnayAcik')
      : islem?.acik === false
        ? t('yonetim.kurum.modulOnayKapali')
        : t('yonetim.kurum.modulOnayMiras');

  return (
    <Kart aria-labelledby="moduller-baslik">
      <KartBasligi
        id="moduller-baslik"
        baslik={t('yonetim.kurum.moduller')}
        aciklama={t('yonetim.kurum.modullerAciklama')}
      />
      {basari ? (
        <Uyari ton="basari" className="mb-3">
          {basari}
        </Uyari>
      ) : null}
      <Tablo etiket={t('yonetim.kurum.moduller')}>
        <thead>
          <tr>
            <Th>{t('yonetim.kurum.modulSutun')}</Th>
            <Th>{t('yonetim.kurum.modulDurum')}</Th>
            {yonetici ? <Th className="text-right">{t('yonetim.ortak.islem')}</Th> : null}
          </tr>
        </thead>
        <tbody>
          {kurum.moduller.map((m) => (
            <tr key={m.modul_kodu}>
              <Td className="font-medium">{t(`modul.${m.modul_kodu}`)}</Td>
              <Td>
                <div className="flex flex-wrap items-center gap-2">
                  <Rozet ton={m.kurum_acik ? 'basari' : 'hata'}>
                    {m.kurum_acik ? t('yonetim.ortak.acik') : t('yonetim.ortak.kapali')}
                  </Rozet>
                  {!m.kurum_ayari_var ? (
                    <span className="text-xs text-metin-ikincil">
                      {t('yonetim.kurum.modulAyarYok')}
                    </span>
                  ) : null}
                  {m.alt_duzey_kapali_sayisi > 0 ? (
                    <Rozet ton="uyari">
                      {t('yonetim.kurum.modulAltKapali', { n: m.alt_duzey_kapali_sayisi })}
                    </Rozet>
                  ) : null}
                </div>
              </Td>
              {yonetici ? (
                <Td>
                  <div className="flex flex-wrap justify-end gap-2">
                    <Dugme
                      gorunum="ikincil"
                      boyut="sm"
                      aria-label={`${m.kurum_acik ? t('yonetim.kurum.modulKapat') : t('yonetim.kurum.modulAc')}: ${t(`modul.${m.modul_kodu}`)}`}
                      onClick={() => {
                        ac(m.modul_kodu, !m.kurum_acik);
                      }}
                    >
                      {m.kurum_acik ? t('yonetim.kurum.modulKapat') : t('yonetim.kurum.modulAc')}
                    </Dugme>
                    {m.kurum_ayari_var ? (
                      <Dugme
                        gorunum="hayalet"
                        boyut="sm"
                        aria-label={`${t('yonetim.kurum.modulMirasa')}: ${t(`modul.${m.modul_kodu}`)}`}
                        onClick={() => {
                          ac(m.modul_kodu, null);
                        }}
                      >
                        {t('yonetim.kurum.modulMirasa')}
                      </Dugme>
                    ) : null}
                  </div>
                </Td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </Tablo>

      <OnayPenceresi
        acik={islem !== null}
        onKapat={() => {
          kaydet.reset();
          setIslem(null);
        }}
        baslik={t('yonetim.kurum.modulOnayBaslik', { modul: modulAdi, islem: islemMetni })}
        aciklama={t('yonetim.kurum.modulOnayMetin', {
          kurum: kurum.ad,
          modul: modulAdi,
          islem: islemMetni,
        })}
        neden={{ min: 10 }}
        onayEtiketi={t('yonetim.ortak.onayla')}
        tehlike={islem?.acik === false}
        bekliyor={kaydet.isPending}
        hata={kaydet.error}
        onOnayla={(neden) => {
          if (islem) kaydet.mutate({ ...islem, neden });
        }}
      />
    </Kart>
  );
}

function BetaKarti({ kurum, yonetici }: { kurum: KurumDetayi; yonetici: boolean }) {
  const istemci = useQueryClient();
  const [islem, setIslem] = useState<BetaIslemi | null>(null);
  const [yeniKod, setYeniKod] = useState('');
  const yeniGecerli = /^[a-z][a-z0-9_]{1,39}$/.test(yeniKod);

  const kaydet = useMutation({
    mutationFn: ({ kod, acik, neden }: BetaIslemi & { neden: string }) =>
      platform.koy(`kurumlar/${kurum.id}/beta/${kod}`, { acik, neden }),
    onSuccess: async () => {
      setIslem(null);
      setYeniKod('');
      await istemci.invalidateQueries({ queryKey: kurumAnahtari(kurum.id) });
    },
  });

  const ac = (kod: string, acik: boolean | null) => {
    kaydet.reset();
    setIslem({ kod, acik });
  };
  const islemMetni =
    islem?.acik === true
      ? t('yonetim.kurum.betaIslemAc')
      : islem?.acik === false
        ? t('yonetim.kurum.betaIslemKapat')
        : t('yonetim.kurum.betaIslemSil');

  return (
    <Kart aria-labelledby="beta-baslik">
      <KartBasligi
        id="beta-baslik"
        baslik={t('yonetim.kurum.beta')}
        aciklama={t('yonetim.kurum.betaAciklama')}
      />
      {kurum.beta_ozellikleri.length === 0 ? (
        <p className="text-sm text-metin-ikincil">{t('yonetim.kurum.betaYok')}</p>
      ) : (
        <ul className="divide-y divide-kenar">
          {kurum.beta_ozellikleri.map((b) => (
            <li
              key={b.ozellik_kodu}
              className="flex flex-wrap items-center justify-between gap-2 py-2"
            >
              <div className="flex items-center gap-2">
                <code className="text-sm">{b.ozellik_kodu}</code>
                <Rozet ton={b.acik ? 'basari' : 'notr'}>
                  {b.acik ? t('yonetim.ortak.acik') : t('yonetim.ortak.kapali')}
                </Rozet>
              </div>
              {yonetici ? (
                <div className="flex gap-2">
                  <Dugme
                    gorunum="ikincil"
                    boyut="sm"
                    aria-label={`${b.acik ? t('yonetim.kurum.betaKapat') : t('yonetim.kurum.betaAc')}: ${b.ozellik_kodu}`}
                    onClick={() => {
                      ac(b.ozellik_kodu, !b.acik);
                    }}
                  >
                    {b.acik ? t('yonetim.kurum.betaKapat') : t('yonetim.kurum.betaAc')}
                  </Dugme>
                  <Dugme
                    gorunum="hayalet"
                    boyut="sm"
                    aria-label={`${t('yonetim.kurum.betaSil')}: ${b.ozellik_kodu}`}
                    onClick={() => {
                      ac(b.ozellik_kodu, null);
                    }}
                  >
                    {t('yonetim.kurum.betaSil')}
                  </Dugme>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {yonetici ? (
        <form
          className="mt-4 flex flex-wrap items-end gap-3 border-t border-kenar pt-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (yeniGecerli) ac(yeniKod, true);
          }}
        >
          <Alan
            etiket={t('yonetim.kurum.betaKod')}
            yardim={t('yonetim.kurum.betaKodYardim')}
            value={yeniKod}
            onChange={(e) => {
              setYeniKod(e.target.value);
            }}
            spellCheck={false}
            kapsayiciSinifi="min-w-0 flex-1 basis-56"
          />
          <Dugme type="submit" gorunum="ikincil" disabled={!yeniGecerli}>
            {t('yonetim.kurum.betaEkle')}
          </Dugme>
        </form>
      ) : null}

      <OnayPenceresi
        acik={islem !== null}
        onKapat={() => {
          kaydet.reset();
          setIslem(null);
        }}
        baslik={t('yonetim.kurum.betaOnayBaslik', { kod: islem?.kod ?? '' })}
        aciklama={t('yonetim.kurum.betaOnayMetin', {
          kurum: kurum.ad,
          kod: islem?.kod ?? '',
          islem: islemMetni,
        })}
        neden={{ min: 10 }}
        onayEtiketi={t('yonetim.ortak.onayla')}
        tehlike={islem?.acik === null}
        bekliyor={kaydet.isPending}
        hata={kaydet.error}
        onOnayla={(neden) => {
          if (islem) kaydet.mutate({ ...islem, neden });
        }}
      />
    </Kart>
  );
}

export function KurumDetaySayfasi({ id }: { id: string }) {
  const yonetici = useYonetici();
  const [taklitAcik, setTaklitAcik] = useState(false);
  const sorgu = useQuery({
    queryKey: kurumAnahtari(id),
    queryFn: () => platform.al<KurumDetayi>(`kurumlar/${id}`),
  });

  const geri = (
    <Link
      href="/kurumlar"
      className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-metin-ikincil hover:text-metin"
    >
      <ArrowLeft className="size-4" aria-hidden />
      {t('yonetim.kurum.kurumlaraDon')}
    </Link>
  );

  if (sorgu.isPending) {
    return (
      <>
        {geri}
        <Yukleniyor />
      </>
    );
  }
  if (sorgu.error) {
    return (
      <>
        {geri}
        <SorguHatasi
          hata={sorgu.error}
          onTekrar={() => {
            void sorgu.refetch();
          }}
        />
      </>
    );
  }

  const k = sorgu.data;
  const roller = Object.entries(k.uye_sayilari.rollere_gore);

  return (
    <>
      {geri}
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{k.ad}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Rozet>{t(`yonetim.tur.${k.tur}`)}</Rozet>
            <Rozet ton={DURUM_TONU[k.durum]}>{t(`yonetim.kurumDurum.${k.durum}`)}</Rozet>
          </div>
        </div>
        <Dugme
          onClick={() => {
            setTaklitAcik(true);
          }}
        >
          <UserCog aria-hidden />
          {t('yonetim.kurum.taklitBaslat')}
        </Dugme>
      </header>

      {!yonetici ? (
        <Uyari ton="bilgi" className="mb-4">
          {t('yonetim.kurum.yazmaYok')}
        </Uyari>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Kart aria-labelledby="genel-baslik">
          <KartBasligi id="genel-baslik" baslik={t('yonetim.kurumlar.sutunKurum')} />
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-metin-ikincil">{t('yonetim.kurum.kimlik')}</dt>
            <dd className="font-mono text-xs break-all">{k.id}</dd>
            <dt className="text-metin-ikincil">{t('yonetim.kurum.saatDilimi')}</dt>
            <dd>{k.saat_dilimi}</dd>
            <dt className="text-metin-ikincil">{t('yonetim.kurum.olusturma')}</dt>
            <dd>{tarih(k.created_at)}</dd>
          </dl>
        </Kart>

        <Kart aria-labelledby="uyeler-baslik">
          <KartBasligi id="uyeler-baslik" baslik={t('yonetim.kurum.uyeler')} />
          <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 text-sm">
            <dt className="text-metin-ikincil">{t('yonetim.kurum.aktifToplam')}</dt>
            <dd className="font-semibold">{k.uye_sayilari.aktif_toplam}</dd>
            {roller.map(([rol, n]) => (
              <div key={rol} className="col-span-2 grid grid-cols-subgrid">
                <dt className="pl-3 text-metin-ikincil">{t(`roller.${rol as 'sahip'}`)}</dt>
                <dd>{n}</dd>
              </div>
            ))}
            <dt className="text-metin-ikincil">{t('yonetim.kurum.digerDurumlar')}</dt>
            <dd>{k.uye_sayilari.diger_durumlar}</dd>
          </dl>
        </Kart>

        <Kart aria-labelledby="sahipler-baslik">
          <KartBasligi
            id="sahipler-baslik"
            baslik={t('yonetim.kurum.sahipler')}
            aciklama={t('yonetim.kurum.sahipNotu')}
          />
          {k.sahipler.length === 0 ? (
            <p className="text-sm text-metin-ikincil">{t('yonetim.kurum.sahipYok')}</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {k.sahipler.map((s) => (
                <li key={s.kullanici_id}>{sahipMetni(s)}</li>
              ))}
            </ul>
          )}
        </Kart>

        <AskiKarti kurum={k} yonetici={yonetici} />
      </div>

      <div className="mt-4 flex flex-col gap-4">
        <AbonelikKarti kurum={k} yonetici={yonetici} />
        <ModullerKarti kurum={k} yonetici={yonetici} />
        <BetaKarti kurum={k} yonetici={yonetici} />
      </div>

      <TaklitBaslatPenceresi
        kurum={k}
        acik={taklitAcik}
        onKapat={() => {
          setTaklitAcik(false);
        }}
      />
    </>
  );
}
