'use client';

import {
  IptalYanitSema,
  OdemeBaslatYanitSema,
  PlanDegistirYanitSema,
  type AbonelikPlanTipi,
  type Periyot,
} from '@kopru/contracts';
import { t } from '@kopru/i18n';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CreditCard } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { DurumKarti, KullanimKarti } from './durum-ve-kullanim';
import { FaturaFormu } from './fatura-formu';
import { FaturaGecmisi, OdemeGecmisi } from './gecmis';
import { PlanKartlari } from './plan-kartlari';

import { BosDurum } from '@/components/bos-durum';
import { HataDurumu } from '@/components/hata-durumu';
import {
  BildirimKutusu,
  basari,
  basarisiz,
  ListeIskeleti,
  tarihYaz,
  type Bildirim,
} from '@/components/hesap/ortak';
import { BolumKapisi } from '@/components/kabuk/bolum-yer-tutucu';
import { SayfaBasligi } from '@/components/kabuk/sayfa-basligi';
import { Dugme } from '@/components/ui/button';
import { Kart } from '@/components/ui/kart';
import { OnayPenceresi, Pencere } from '@/components/ui/pencere';
import { useKurum } from '@/kurum/baglam';
import {
  aktivasyonTamam,
  guvenliYonlendirme,
  odemeSonucuCoz,
  type OdemeSonucu,
} from '@/lib/abonelik/bicim';
import { KURUM_ANAHTARI } from '@/lib/abonelik/donus';
import {
  abonelikAnahtari,
  faturalarAnahtari,
  faturaBilgisiAnahtari,
  odemelerAnahtari,
  planlarAnahtari,
  useAbonelik,
  useFaturaBilgisi,
  useFaturalar,
  useOdemeler,
  usePlanlar,
} from '@/lib/abonelik/veri';
import { UygulamaHatasi, hataMesaji } from '@/lib/api';
import { abonelikIstek } from '@/lib/hesap-istek';
import { useSimdi } from '@/lib/simdi';

/** Aktivasyon yoklamasi: webhook/donus sonrasi birkac saniye surebilir. */
const YOKLAMA_ARALIGI_MS = 2000;
const YOKLAMA_SURESI_MS = 30_000;

/** Yalniz sahip: abonelik ozeti, kullanim, planlar, fatura bilgisi, odeme ve fatura gecmisi. */
export function AbonelikEkrani() {
  return (
    <BolumKapisi bolum="abonelik">
      <AbonelikIcerigi />
    </BolumKapisi>
  );
}

function AbonelikIcerigi() {
  const { uyelik } = useKurum();
  const kurumId = uyelik.kurumId;
  const qc = useQueryClient();
  const yonlendirici = useRouter();
  const yol = usePathname();
  const arama = useSearchParams();
  const formKutusu = useRef<HTMLElement>(null);
  const simdi = useSimdi();

  const [odemeSonucu] = useState<OdemeSonucu | null>(() => odemeSonucuCoz(arama.get('odeme')));
  // Odeme donusunde (basarili/bekliyor) aktivasyon icin kisa yoklama yapilir.
  const [yoklamaBasladi] = useState(odemeSonucu === 'basarili' || odemeSonucu === 'bekliyor');
  const [sureDoldu, setSureDoldu] = useState(false);
  const [faturaUyarisi, setFaturaUyarisi] = useState<string | null>(null);
  const [iptalAcik, setIptalAcik] = useState(false);
  const [formIcerigi, setFormIcerigi] = useState<string | null>(null);

  // `?odeme=` bir kez okunur; adres temizlenir (yenilemede mesaj tekrar etmesin).
  const odemeParametresi = arama.get('odeme');
  useEffect(() => {
    if (odemeParametresi) yonlendirici.replace(yol);
  }, [odemeParametresi, yol, yonlendirici]);

  const [bildirim, setBildirim] = useState<Bildirim>(null);
  const abonelik = useAbonelik(
    kurumId,
    true,
    yoklamaBasladi && !sureDoldu ? YOKLAMA_ARALIGI_MS : false,
  );
  const planlar = usePlanlar(kurumId);
  const fatura = useFaturaBilgisi(kurumId);
  const odemeler = useOdemeler(kurumId);
  const faturalar = useFaturalar(kurumId);

  const tamam = aktivasyonTamam(abonelik.data?.abonelik ?? null);
  const yoklama = yoklamaBasladi && !sureDoldu && !tamam;
  useEffect(() => {
    if (!yoklamaBasladi) return;
    const zamanlayici = setTimeout(() => {
      setSureDoldu(true);
    }, YOKLAMA_SURESI_MS);
    return () => {
      clearTimeout(zamanlayici);
    };
  }, [yoklamaBasladi]);
  useEffect(() => {
    if (yoklamaBasladi && tamam) {
      void qc.invalidateQueries({ queryKey: odemelerAnahtari(kurumId) });
      void qc.invalidateQueries({ queryKey: faturalarAnahtari(kurumId) });
      void qc.invalidateQueries({ queryKey: planlarAnahtari(kurumId) });
    }
  }, [yoklamaBasladi, tamam, qc, kurumId]);

  const yenile = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: abonelikAnahtari(kurumId) }),
      qc.invalidateQueries({ queryKey: faturaBilgisiAnahtari(kurumId) }),
    ]);

  const odemeBaslat = useMutation({
    mutationFn: (g: { plan: AbonelikPlanTipi; periyot: Periyot }) =>
      abonelikIstek(`kurumlar/${kurumId}/odeme/baslat`, {
        yontem: 'POST',
        govde: { plan_kodu: g.plan.kod, periyot: g.periyot },
        sema: OdemeBaslatYanitSema,
      }),
    onSuccess: (yanit) => {
      const url = guvenliYonlendirme(yanit.yonlendirme_url);
      if (url) {
        try {
          window.localStorage.setItem(KURUM_ANAHTARI, kurumId);
        } catch {
          // Depolama yok: donus sayfasi tek sahip kurumundan cozulur.
        }
        window.location.assign(url);
      } else if (yanit.form_icerigi) {
        setFormIcerigi(yanit.form_icerigi);
      } else {
        setBildirim(basarisiz(new UygulamaHatasi(0, 'odeme_kanali_kapali', '')));
      }
    },
    onError: (hata) => {
      if (hata instanceof UygulamaHatasi && hata.kod === 'fatura_bilgisi_gerekli') {
        setFaturaUyarisi(t('abonelik.odeme.faturaOnce'));
        formKutusu.current?.focus();
        formKutusu.current?.scrollIntoView({ block: 'center' });
        return;
      }
      setBildirim(basarisiz(hata));
    },
  });

  const planDegistir = useMutation({
    mutationFn: (g: { plan: AbonelikPlanTipi; periyot: Periyot }) =>
      abonelikIstek(`kurumlar/${kurumId}/abonelik/plan-degistir`, {
        yontem: 'POST',
        govde: { plan_kodu: g.plan.kod, periyot: g.periyot },
        sema: PlanDegistirYanitSema,
      }).then((yanit) => ({ yanit, plan: g.plan })),
    onSuccess: async ({ yanit, plan }) => {
      const ana =
        yanit.uygulama === 'hemen'
          ? t('abonelik.plan.degisiklikHemen', { plan: plan.ad })
          : t('abonelik.plan.degisiklikDonemSonu', {
              plan: plan.ad,
              tarih: tarihYaz(yanit.abonelik.donem_bitis_at),
            });
      const asimlar = yanit.limit_asimlari.map((a) =>
        t('abonelik.plan.limitAsimi', {
          limit: t(`abonelik.limit.${a.limit}`),
          ust_sinir: a.ust_sinir,
          mevcut: a.mevcut,
        }),
      );
      setBildirim(basari([ana, ...asimlar].join(' ')));
      await yenile();
    },
    onError: (hata) => {
      setBildirim(basarisiz(hata));
    },
  });

  const iptal = useMutation({
    mutationFn: () =>
      abonelikIstek(`kurumlar/${kurumId}/abonelik/iptal`, {
        yontem: 'POST',
        sema: IptalYanitSema,
      }),
    onSuccess: async () => {
      setIptalAcik(false);
      setBildirim(basari(t('abonelik.iptal.tamam')));
      await yenile();
    },
    onError: (hata) => {
      setIptalAcik(false);
      setBildirim(basarisiz(hata));
    },
  });

  const yanit = abonelik.data;
  const planListe = planlar.data;
  const a = yanit?.abonelik ?? null;
  const iptalEdilebilir =
    a !== null &&
    a.kaynak === 'iyzico' &&
    ['aktif', 'odeme_bekliyor', 'ek_sure'].includes(a.durum) &&
    a.otomatik_yenileme &&
    a.iptal_istendi_at === null;

  return (
    <>
      <SayfaBasligi baslik={t('abonelik.baslik')} aciklama={t('abonelik.aciklama')} />
      <div className="flex flex-col gap-6">
        <OdemeMesaji sonuc={odemeSonucu} yoklama={yoklama} tamam={tamam} />
        <BildirimKutusu bildirim={bildirim} />

        {abonelik.isPending || planlar.isPending ? (
          <Kart>
            <ListeIskeleti satir={5} />
          </Kart>
        ) : abonelik.isError || planlar.isError || !yanit || !planListe ? (
          <Kart>
            <HataDurumu
              baslik={t('abonelik.yuklenemedi')}
              aciklama={hataMesaji(abonelik.error ?? planlar.error)}
              tekrarDene={() => {
                void abonelik.refetch();
                void planlar.refetch();
              }}
            />
          </Kart>
        ) : (
          <>
            <DurumKarti yanit={yanit} planlar={planListe.planlar} simdi={simdi} />
            {iptalEdilebilir ? (
              <div>
                <Dugme
                  gorunum="ikincil"
                  onClick={() => {
                    setIptalAcik(true);
                  }}
                >
                  {t('abonelik.iptal.dugme')}
                </Dugme>
              </div>
            ) : null}
            <KullanimKarti yanit={yanit} />
            <PlanKartlari
              yanit={yanit}
              planlar={planListe.planlar}
              bekliyor={odemeBaslat.isPending || planDegistir.isPending}
              odemeBaslat={(plan, periyot) => {
                setBildirim(null);
                if (fatura.data?.fatura_bilgisi === null) {
                  setFaturaUyarisi(t('abonelik.odeme.faturaOnce'));
                  formKutusu.current?.focus();
                  formKutusu.current?.scrollIntoView({ block: 'center' });
                  return;
                }
                setFaturaUyarisi(null);
                odemeBaslat.mutate({ plan, periyot });
              }}
              planDegistir={(plan, periyot) => {
                setBildirim(null);
                planDegistir.mutate({ plan, periyot });
              }}
            />
            {odemeBaslat.isPending ? (
              <p role="status" className="text-sm text-metin-ikincil">
                {t('abonelik.odeme.baslatiliyor')}
              </p>
            ) : null}
          </>
        )}

        {fatura.isPending ? (
          <Kart>
            <ListeIskeleti satir={3} />
          </Kart>
        ) : fatura.isError ? (
          <Kart>
            <HataDurumu
              baslik={t('abonelik.fatura.baslik')}
              aciklama={hataMesaji(fatura.error)}
              tekrarDene={() => void fatura.refetch()}
            />
          </Kart>
        ) : (
          <FaturaFormu
            kurumId={kurumId}
            kayitli={fatura.data.fatura_bilgisi}
            formRef={formKutusu}
            uyari={faturaUyarisi}
          />
        )}

        {odemeler.data ? <OdemeGecmisi odemeler={odemeler.data.odemeler} /> : null}
        {faturalar.data ? <FaturaGecmisi faturalar={faturalar.data.faturalar} /> : null}
        {odemeler.isError || faturalar.isError ? (
          <Kart>
            <BosDurum
              ikon={CreditCard}
              baslik={t('abonelik.gecmis.odemeBaslik')}
              aciklama={hataMesaji(odemeler.error ?? faturalar.error)}
            />
          </Kart>
        ) : null}
      </div>

      <OnayPenceresi
        acik={iptalAcik}
        degisti={setIptalAcik}
        baslik={t('abonelik.iptal.baslik')}
        aciklama={t('abonelik.iptal.aciklama', {
          tarih: a ? tarihYaz(a.donem_bitis_at) : '',
        })}
        onayEtiketi={t('abonelik.iptal.onay')}
        tehlikeli
        bekliyor={iptal.isPending}
        onay={() => {
          iptal.mutate();
        }}
      />

      <Pencere
        acik={formIcerigi !== null}
        degisti={(acik) => {
          if (!acik) setFormIcerigi(null);
        }}
        baslik={t('abonelik.odeme.formBaslik')}
        genis
      >
        {formIcerigi ? (
          <iframe
            title={t('abonelik.odeme.formBaslik')}
            srcDoc={formIcerigi}
            sandbox="allow-scripts allow-forms allow-popups allow-top-navigation"
            className="h-[70dvh] w-full rounded-orta border border-kenar"
          />
        ) : null}
      </Pencere>
    </>
  );
}

/** `?odeme=` sonucu: basari, hata ve "aktivasyon bekleniyor" durumlari. */
function OdemeMesaji({
  sonuc,
  yoklama,
  tamam,
}: {
  sonuc: OdemeSonucu | null;
  yoklama: boolean;
  tamam: boolean;
}) {
  if (!sonuc) return null;
  if (sonuc === 'basarili' || sonuc === 'bekliyor') {
    const metin = tamam
      ? t('abonelik.odeme.etkinlesti')
      : yoklama
        ? t(sonuc === 'basarili' ? 'abonelik.odeme.basarili' : 'abonelik.odeme.bekliyor')
        : t('abonelik.odeme.bekliyorUzadi');
    return (
      <div
        role="status"
        data-testid="odeme-sonucu"
        className="rounded-orta bg-basari-yumusak px-3 py-2.5 text-sm text-metin"
      >
        {metin}
      </div>
    );
  }
  return <BildirimKutusu bildirim={{ tur: 'hata', metin: t(`abonelik.odeme.${sonuc}`) }} />;
}
