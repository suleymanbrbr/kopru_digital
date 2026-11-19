'use client';

import { kurusBicimle, t, tlMetniniKurusaCevir } from '@kopru/i18n';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { Alan, Secim } from '../ui/alan';
import { Dugme } from '../ui/dugme';
import { SorguHatasi, Yukleniyor } from '../ui/durum-gosterimi';
import { Kart, KartBasligi } from '../ui/kart';
import { OnayPenceresi } from '../ui/onay-penceresi';
import { Rozet, type RozetTonu } from '../ui/rozet';
import { Tablo, Td, Th } from '../ui/tablo';
import { Uyari } from '../ui/uyari';

import { platform } from '@/lib/api';
import { tarih, tarihSaat } from '@/lib/bicim';
import type {
  AbonelikKaydi,
  AbonelikYaniti,
  AskiYaniti,
  KurumDetayi,
  PlatformAski,
} from '@/lib/tipler';

export const PLAN_KODLARI = ['baslangic', 'koc', 'ekip', 'kurum'] as const;
const PLAN_ADI: Record<string, string> = {
  baslangic: 'Başlangıç',
  koc: 'Koç',
  ekip: 'Ekip',
  kurum: 'Kurum',
};

const DURUM_TONU: Record<AbonelikKaydi['durum'], RozetTonu> = {
  deneme: 'bilgi',
  aktif: 'basari',
  odeme_bekliyor: 'uyari',
  ek_sure: 'uyari',
  askida: 'hata',
  iptal: 'notr',
  sona_erdi: 'hata',
};

type EylemTuru =
  'deneme-uzat' | 'ek-sure' | 'kurumsal-aktivasyon' | 'plan-degistir' | 'iptal' | 'askiya-al';

const EYLEM_ETIKETI: Record<EylemTuru, Parameters<typeof t>[0]> = {
  'deneme-uzat': 'yonetim.abonelik.denemeUzat',
  'ek-sure': 'yonetim.abonelik.ekSure',
  'kurumsal-aktivasyon': 'yonetim.abonelik.kurumsal',
  'plan-degistir': 'yonetim.abonelik.planDegistir',
  iptal: 'yonetim.abonelik.iptal',
  'askiya-al': 'yonetim.abonelik.askiyaAl',
};
const EYLEM_ACIKLAMA: Record<EylemTuru, Parameters<typeof t>[0]> = {
  'deneme-uzat': 'yonetim.abonelik.onayAciklama.denemeUzat',
  'ek-sure': 'yonetim.abonelik.onayAciklama.ekSure',
  'kurumsal-aktivasyon': 'yonetim.abonelik.onayAciklama.kurumsal',
  'plan-degistir': 'yonetim.abonelik.onayAciklama.planDegistir',
  iptal: 'yonetim.abonelik.onayAciklama.iptal',
  'askiya-al': 'yonetim.abonelik.onayAciklama.askiyaAl',
};

const abonelikAnahtari = (id: string) => ['abonelik', id] as const;

/** Abonelik eylem penceresi: her eylem zorunlu neden ister; alanlar eyleme gore degisir. */
function EylemPenceresi({
  kurumId,
  eylem,
  mevcutPlan,
  onKapat,
  onBasari,
}: {
  kurumId: string;
  eylem: EylemTuru | null;
  mevcutPlan: string;
  onKapat: () => void;
  onBasari: () => void;
}) {
  const [gun, setGun] = useState('7');
  const [plan, setPlan] = useState(mevcutPlan === '' ? 'kurum' : mevcutPlan);
  const [periyot, setPeriyot] = useState<'aylik' | 'yillik'>('aylik');
  const [sozlesme, setSozlesme] = useState('');
  const [fiyat, setFiyat] = useState('');
  const [hemen, setHemen] = useState(false);

  const en = eylem === 'deneme-uzat' ? 90 : 60;
  const gunSayi = Number(gun);
  const gunGecerli = Number.isInteger(gunSayi) && gunSayi >= 1 && gunSayi <= en;
  const fiyatKurus = fiyat.trim() === '' ? undefined : tlMetniniKurusaCevir(fiyat);
  const fiyatGecerli = fiyat.trim() === '' || fiyatKurus !== null;

  const gonder = useMutation({
    mutationFn: (neden: string) => {
      const yol = `kurumlar/${kurumId}/abonelik/${eylem ?? ''}`;
      switch (eylem) {
        case 'deneme-uzat':
        case 'ek-sure':
          return platform.yolla(yol, { gun: gunSayi, neden });
        case 'kurumsal-aktivasyon':
          return platform.yolla(yol, {
            plan_kodu: plan,
            sozlesme_no: sozlesme.trim(),
            periyot,
            neden,
            ...(typeof fiyatKurus === 'number' ? { fiyat_kurus: fiyatKurus } : {}),
          });
        case 'plan-degistir':
          return platform.yolla(yol, { plan_kodu: plan, periyot, hemen, neden });
        case 'iptal':
          return platform.yolla(yol, { hemen, neden });
        default:
          return platform.yolla(yol, { neden });
      }
    },
    onSuccess: onBasari,
  });

  const gecerli =
    eylem === 'deneme-uzat' || eylem === 'ek-sure'
      ? gunGecerli
      : eylem === 'kurumsal-aktivasyon'
        ? sozlesme.trim().length > 0 && fiyatGecerli
        : true;

  const periyotSecimi = (
    <Secim
      etiket={t('yonetim.abonelik.periyotSec')}
      value={periyot}
      onChange={(e) => {
        setPeriyot(e.target.value as 'aylik' | 'yillik');
      }}
    >
      <option value="aylik">{t('yonetim.abonelik.periyotAylik')}</option>
      <option value="yillik">{t('yonetim.abonelik.periyotYillik')}</option>
    </Secim>
  );
  const planSecimi = (
    <Secim
      etiket={t('yonetim.abonelik.planSec')}
      value={plan}
      onChange={(e) => {
        setPlan(e.target.value);
      }}
    >
      {PLAN_KODLARI.map((k) => (
        <option key={k} value={k}>
          {PLAN_ADI[k]}
        </option>
      ))}
    </Secim>
  );

  return (
    <OnayPenceresi
      acik={eylem !== null}
      onKapat={() => {
        gonder.reset();
        onKapat();
      }}
      baslik={eylem ? t(EYLEM_ETIKETI[eylem]) : ''}
      aciklama={eylem ? t(EYLEM_ACIKLAMA[eylem]) : undefined}
      neden={{ min: 10 }}
      onayEtiketi={eylem ? t(EYLEM_ETIKETI[eylem]) : ''}
      tehlike={eylem === 'iptal' || eylem === 'askiya-al'}
      bekliyor={gonder.isPending}
      hata={gonder.error}
      gecerli={gecerli}
      onOnayla={(neden) => {
        gonder.mutate(neden);
      }}
    >
      {eylem === 'deneme-uzat' || eylem === 'ek-sure' ? (
        <Alan
          etiket={t('yonetim.abonelik.gun')}
          yardim={t('yonetim.abonelik.gunYardim', { en })}
          type="number"
          min={1}
          max={en}
          value={gun}
          onChange={(e) => {
            setGun(e.target.value);
          }}
        />
      ) : null}
      {eylem === 'kurumsal-aktivasyon' ? (
        <>
          {planSecimi}
          {periyotSecimi}
          <Alan
            etiket={t('yonetim.abonelik.sozlesme')}
            maxLength={100}
            value={sozlesme}
            onChange={(e) => {
              setSozlesme(e.target.value);
            }}
            required
          />
          <Alan
            etiket={t('yonetim.abonelik.fiyatTl')}
            inputMode="decimal"
            value={fiyat}
            hata={fiyatGecerli ? undefined : t('yonetim.abonelik.fiyatGecersiz')}
            onChange={(e) => {
              setFiyat(e.target.value);
            }}
          />
        </>
      ) : null}
      {eylem === 'plan-degistir' ? (
        <>
          {planSecimi}
          {periyotSecimi}
        </>
      ) : null}
      {eylem === 'plan-degistir' || eylem === 'iptal' ? (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4"
            checked={hemen}
            onChange={(e) => {
              setHemen(e.target.checked);
            }}
          />
          {t('yonetim.abonelik.hemen')}
        </label>
      ) : null}
    </OnayPenceresi>
  );
}

function Ozet({ a, kilitli }: { a: AbonelikKaydi; kilitli: boolean }) {
  return (
    <>
      {kilitli ? (
        <Uyari ton="uyari" className="mb-4">
          {t('yonetim.abonelik.kilitli')}
        </Uyari>
      ) : null}
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        <dt className="text-metin-ikincil">{t('yonetim.abonelik.durumEtiketi')}</dt>
        <dd>
          <Rozet ton={DURUM_TONU[a.durum]}>{t(`yonetim.abonelik.durum.${a.durum}`)}</Rozet>
        </dd>
        <dt className="text-metin-ikincil">{t('yonetim.abonelik.plan')}</dt>
        <dd>{a.plan.ad}</dd>
        <dt className="text-metin-ikincil">{t('yonetim.abonelik.periyot')}</dt>
        <dd>
          {a.periyot === 'yillik'
            ? t('yonetim.abonelik.periyotYillik')
            : t('yonetim.abonelik.periyotAylik')}
        </dd>
        <dt className="text-metin-ikincil">{t('yonetim.abonelik.kaynakEtiketi')}</dt>
        <dd>{t(`yonetim.abonelik.kaynak.${a.kaynak}`)}</dd>
        <dt className="text-metin-ikincil">{t('yonetim.abonelik.fiyat')}</dt>
        <dd>{kurusBicimle(a.fiyat_kurus)}</dd>
        <dt className="text-metin-ikincil">{t('yonetim.abonelik.donem')}</dt>
        <dd>
          {tarih(a.donem_baslangic_at)} – {tarih(a.donem_bitis_at)}
        </dd>
        {a.deneme_bitis_at ? (
          <>
            <dt className="text-metin-ikincil">{t('yonetim.abonelik.denemeBitis')}</dt>
            <dd>{tarihSaat(a.deneme_bitis_at)}</dd>
          </>
        ) : null}
        {a.ek_sure_bitis_at ? (
          <>
            <dt className="text-metin-ikincil">{t('yonetim.abonelik.ekSureBitis')}</dt>
            <dd>{tarihSaat(a.ek_sure_bitis_at)}</dd>
          </>
        ) : null}
        {a.iptal_istendi_at ? (
          <>
            <dt className="text-metin-ikincil">{t('yonetim.abonelik.iptalIstendi')}</dt>
            <dd>{tarihSaat(a.iptal_istendi_at)}</dd>
          </>
        ) : null}
        {a.bekleyen_plan_kodu ? (
          <>
            <dt className="text-metin-ikincil">{t('yonetim.abonelik.bekleyenPlan')}</dt>
            <dd>{PLAN_ADI[a.bekleyen_plan_kodu] ?? a.bekleyen_plan_kodu}</dd>
          </>
        ) : null}
      </dl>
    </>
  );
}

function Gecmis({ veri }: { veri: AbonelikYaniti }) {
  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-2">
      <section aria-labelledby="abonelik-gecmis">
        <h3 id="abonelik-gecmis" className="mb-2 text-sm font-semibold">
          {t('yonetim.abonelik.gecmis')}
        </h3>
        {veri.gecmis.length === 0 ? (
          <p className="text-sm text-metin-ikincil">{t('yonetim.abonelik.gecmisYok')}</p>
        ) : (
          <Tablo etiket={t('yonetim.abonelik.gecmis')}>
            <thead>
              <tr>
                <Th>{t('yonetim.abonelik.plan')}</Th>
                <Th>{t('yonetim.abonelik.durumEtiketi')}</Th>
                <Th>{t('yonetim.abonelik.donem')}</Th>
              </tr>
            </thead>
            <tbody>
              {veri.gecmis.map((g) => (
                <tr key={g.id}>
                  <Td>{g.plan.ad}</Td>
                  <Td>{t(`yonetim.abonelik.durum.${g.durum}`)}</Td>
                  <Td className="whitespace-nowrap">
                    {tarih(g.donem_baslangic_at)} – {tarih(g.donem_bitis_at)}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Tablo>
        )}
      </section>
      <section aria-labelledby="abonelik-odemeler">
        <h3 id="abonelik-odemeler" className="mb-2 text-sm font-semibold">
          {t('yonetim.abonelik.odemeler')}
        </h3>
        {veri.odemeler.length === 0 ? (
          <p className="text-sm text-metin-ikincil">{t('yonetim.abonelik.odemeYok')}</p>
        ) : (
          <Tablo etiket={t('yonetim.abonelik.odemeler')}>
            <thead>
              <tr>
                <Th>{t('yonetim.abonelik.odemeTarih')}</Th>
                <Th>{t('yonetim.abonelik.odemeTutar')}</Th>
                <Th>{t('yonetim.abonelik.odemeKdv')}</Th>
                <Th>{t('yonetim.abonelik.odemeDurum')}</Th>
              </tr>
            </thead>
            <tbody>
              {veri.odemeler.map((o) => (
                <tr key={o.id}>
                  <Td className="whitespace-nowrap">{tarih(o.odeme_at)}</Td>
                  <Td>{kurusBicimle(o.tutar_kurus)}</Td>
                  <Td>{kurusBicimle(o.kdv_kurus)}</Td>
                  <Td>
                    {t(`yonetim.abonelik.odemeDurumlari.${o.durum}`)}
                    {o.hata_kodu ? (
                      <span className="ml-1 text-xs text-metin-ikincil">({o.hata_kodu})</span>
                    ) : null}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Tablo>
        )}
      </section>
    </div>
  );
}

export function AbonelikKarti({ kurum, yonetici }: { kurum: KurumDetayi; yonetici: boolean }) {
  const istemci = useQueryClient();
  const [eylem, setEylem] = useState<EylemTuru | null>(null);
  const [sayac, setSayac] = useState(0);
  const [basari, setBasari] = useState(false);

  const ozet = kurum.abonelik.abonelik;
  const detay = useQuery({
    queryKey: abonelikAnahtari(kurum.id),
    enabled: yonetici,
    queryFn: () => platform.al<AbonelikYaniti>(`kurumlar/${kurum.id}/abonelik`),
  });

  const ac = (e: EylemTuru) => {
    setBasari(false);
    setSayac((s) => s + 1);
    setEylem(e);
  };
  const eylemler: { tur: EylemTuru; goster: boolean }[] = [
    { tur: 'deneme-uzat', goster: ozet?.durum === 'deneme' },
    { tur: 'ek-sure', goster: true },
    { tur: 'kurumsal-aktivasyon', goster: true },
    { tur: 'plan-degistir', goster: ozet !== null },
    { tur: 'iptal', goster: ozet !== null && ozet.durum !== 'iptal' },
    { tur: 'askiya-al', goster: ozet !== null && ozet.durum !== 'askida' },
  ];

  return (
    <Kart aria-labelledby="abonelik-baslik" className="lg:col-span-2">
      <KartBasligi
        id="abonelik-baslik"
        baslik={t('yonetim.abonelik.baslik')}
        aciklama={yonetici ? t('yonetim.abonelik.aciklama') : undefined}
      />
      {basari ? (
        <Uyari ton="basari" className="mb-4">
          {t('yonetim.abonelik.tamam')}
        </Uyari>
      ) : null}
      {ozet ? (
        <Ozet a={ozet} kilitli={kurum.abonelik.yazma_kilitli} />
      ) : (
        <p className="text-sm text-metin-ikincil">{t('yonetim.abonelik.yok')}</p>
      )}

      {yonetici ? (
        <>
          <div
            role="group"
            aria-label={t('yonetim.abonelik.eylemler')}
            className="mt-5 flex flex-wrap gap-2 border-t border-kenar pt-4"
          >
            {eylemler
              .filter((e) => e.goster)
              .map((e) => (
                <Dugme
                  key={e.tur}
                  gorunum={e.tur === 'iptal' || e.tur === 'askiya-al' ? 'hayalet' : 'ikincil'}
                  boyut="sm"
                  onClick={() => {
                    ac(e.tur);
                  }}
                >
                  {t(EYLEM_ETIKETI[e.tur])}
                </Dugme>
              ))}
          </div>
          {detay.isPending ? (
            <Yukleniyor />
          ) : detay.error ? (
            <SorguHatasi
              hata={detay.error}
              onTekrar={() => {
                void detay.refetch();
              }}
            />
          ) : (
            <Gecmis veri={detay.data} />
          )}
          <EylemPenceresi
            key={sayac}
            kurumId={kurum.id}
            eylem={eylem}
            mevcutPlan={ozet?.plan.kod ?? ''}
            onKapat={() => {
              setEylem(null);
            }}
            onBasari={() => {
              setEylem(null);
              setBasari(true);
              void istemci.invalidateQueries({ queryKey: ['kurum', kurum.id] });
              void istemci.invalidateQueries({ queryKey: abonelikAnahtari(kurum.id) });
            }}
          />
        </>
      ) : null}
    </Kart>
  );
}

/** Platform askisi: kurumu elle askiya alir / acar; abonelik kilidi uyarisi gosterilir. */
export function AskiKarti({ kurum, yonetici }: { kurum: KurumDetayi; yonetici: boolean }) {
  const istemci = useQueryClient();
  const aski: PlatformAski = kurum.platform_aski;
  const askida = aski.askida;
  const [onay, setOnay] = useState(false);
  const [sonuc, setSonuc] = useState<AskiYaniti | null>(null);

  const degistir = useMutation({
    mutationFn: (neden: string) =>
      platform.yolla<AskiYaniti>(`kurumlar/${kurum.id}/${askida ? 'ac' : 'askiya-al'}`, { neden }),
    onSuccess: async (s) => {
      setOnay(false);
      setSonuc(s);
      await istemci.invalidateQueries({ queryKey: ['kurum', kurum.id] });
    },
  });

  return (
    <Kart aria-labelledby="aski-baslik">
      <KartBasligi
        id="aski-baslik"
        baslik={t('yonetim.aski.baslik')}
        aciklama={t('yonetim.aski.aciklama')}
      />
      {askida ? (
        <Uyari ton="uyari" baslik={t('yonetim.aski.askida')} className="mb-3">
          <p>
            {t('yonetim.aski.askidaAt')}: {tarihSaat(aski.askida_at)}
          </p>
          <p>
            {t('yonetim.aski.neden')}: {aski.neden}
          </p>
        </Uyari>
      ) : (
        <p className="mb-3 text-sm text-metin-ikincil">{t('yonetim.aski.askidaDegil')}</p>
      )}
      {sonuc ? (
        <div className="mb-3 flex flex-col gap-2">
          <Uyari ton="basari">
            {!sonuc.degisti
              ? t('yonetim.aski.degismedi')
              : sonuc.platform_aski.askida
                ? t('yonetim.aski.alindi')
                : t('yonetim.aski.acildi')}
          </Uyari>
          {sonuc.abonelik_kilitli && !sonuc.platform_aski.askida ? (
            <Uyari ton="uyari">{t('yonetim.aski.kilitliUyari')}</Uyari>
          ) : null}
        </div>
      ) : null}
      {yonetici ? (
        <Dugme
          gorunum={askida ? 'ikincil' : 'tehlike'}
          onClick={() => {
            degistir.reset();
            setSonuc(null);
            setOnay(true);
          }}
        >
          {askida ? t('yonetim.aski.ac') : t('yonetim.aski.al')}
        </Dugme>
      ) : null}
      <OnayPenceresi
        acik={onay}
        onKapat={() => {
          degistir.reset();
          setOnay(false);
        }}
        baslik={askida ? t('yonetim.aski.acBaslik') : t('yonetim.aski.alBaslik')}
        aciklama={
          askida
            ? t('yonetim.aski.acAciklama', { kurum: kurum.ad })
            : t('yonetim.aski.alAciklama', { kurum: kurum.ad })
        }
        neden={{ min: 10 }}
        onayEtiketi={askida ? t('yonetim.aski.ac') : t('yonetim.aski.al')}
        tehlike={!askida}
        bekliyor={degistir.isPending}
        hata={degistir.error}
        onOnayla={(neden) => {
          degistir.mutate(neden);
        }}
      />
    </Kart>
  );
}
