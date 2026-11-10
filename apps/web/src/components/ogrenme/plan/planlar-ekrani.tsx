'use client';

import { PlanDetaySema, type PlanDetayi, type PlanGorevi } from '@kopru/contracts';
import { t } from '@kopru/i18n';
import { useMutation } from '@tanstack/react-query';
import { CalendarPlus, Copy, Lock, Plus, Send, Users } from 'lucide-react';
import { useMemo, useState } from 'react';

import { GorevFormu } from './gorev-formu';
import { HaftaGezgini } from './hafta-gezgini';
import { PlanOgrenci } from './plan-ogrenci';
import { PlanOzeti } from './plan-ozeti';
import { TopluPlan } from './toplu-plan';

import { BosDurum } from '@/components/bos-durum';
import { HataDurumu } from '@/components/hata-durumu';
import {
  BildirimKutusu,
  ListeIskeleti,
  basari,
  basarisiz,
  type Bildirim,
} from '@/components/hesap/ortak';
import { BolumKapisi } from '@/components/kabuk/bolum-yer-tutucu';
import { SayfaBasligi } from '@/components/kabuk/sayfa-basligi';
import { OgrenciSecimi } from '@/components/ogrenme/ortak';
import { Alan } from '@/components/operasyon/ortak';
import { Dugme } from '@/components/ui/button';
import { OnayPenceresi } from '@/components/ui/pencere';
import { Rozet } from '@/components/ui/rozet';
import { Secim } from '@/components/ui/secim';
import { useKurum } from '@/kurum/baglam';
import { hataMesaji } from '@/lib/api';
import { bransAdi } from '@/lib/bransler';
import { ogrenmeIstek } from '@/lib/hesap-istek';
import {
  devralindiMi,
  devredilmisMi,
  gorevDurumTonu,
  gunlereBol,
  ilerlemeEtiketi,
  miktarEtiketi,
} from '@/lib/ogrenme/plan';
import { ogrenmeYetkileri } from '@/lib/ogrenme/rol';
import {
  useKonular,
  useOgrenciler,
  useOgrenmeYenile,
  usePlanDetayi,
  usePlanSablonlari,
} from '@/lib/ogrenme/veri';
import { useSaatDilimi } from '@/lib/operasyon-verisi';
import { bugunYerel, gunEtiketi, haftaBasi, tarihEkle } from '@/lib/saat';

export function PlanlarEkrani() {
  return (
    <BolumKapisi bolum="planlar">
      <PlanlarYonlendir />
    </BolumKapisi>
  );
}

function PlanlarYonlendir() {
  const { rol } = useKurum();
  return ogrenmeYetkileri(rol).personel ? <PersonelPlan /> : <PlanOgrenci />;
}

function PersonelPlan() {
  const { uyelik, rol } = useKurum();
  const kurumId = uyelik.kurumId;
  const yetki = ogrenmeYetkileri(rol);
  const { saatDilimi } = useSaatDilimi(kurumId);
  const bugun = bugunYerel(saatDilimi);
  const ogrenciler = useOgrenciler(kurumId);
  const [ogrenciId, setOgrenciId] = useState('');
  const [secilenHafta, setHafta] = useState<string | null>(null);
  const hafta = secilenHafta ?? haftaBasi(bugun);
  const plan = usePlanDetayi(kurumId, ogrenciId, hafta);
  const oncekiPlan = usePlanDetayi(kurumId, ogrenciId, tarihEkle(hafta, -7));
  const sablonlar = usePlanSablonlari(kurumId);
  const konular = useKonular(kurumId);
  const yenile = useOgrenmeYenile(kurumId);

  const [bildirim, setBildirim] = useState<Bildirim>(null);
  const [gorevFormu, setGorevFormu] = useState<{ gun: string; duzenle: PlanGorevi | null } | null>(
    null,
  );
  const [topluAcik, setTopluAcik] = useState(false);
  const [silinecek, setSilinecek] = useState<PlanGorevi | null>(null);
  const [sablonId, setSablonId] = useState('');

  const konuAdlari = useMemo(
    () => new Map((konular.data ?? []).map((k) => [k.id, k.ad])),
    [konular.data],
  );
  const detay: PlanDetayi | undefined = plan.data;
  const planId = detay?.plan?.id ?? null;
  const kilitli = detay?.kilitli ?? false;
  const taslak = detay?.plan?.durum === 'taslak';

  const hata = (h: unknown) => {
    setBildirim(basarisiz(h));
  };
  const tamam = async (mesaj: string) => {
    await yenile();
    setBildirim(basari(mesaj));
  };

  const olustur = useMutation({
    mutationFn: () =>
      ogrenmeIstek(`kurumlar/${kurumId}/planlar`, {
        govde: { ogrenci_id: ogrenciId, hafta_baslangic: hafta },
        sema: PlanDetaySema,
      }),
    onSuccess: () => tamam(t('ogrenme.plan.olusturuldu')),
    onError: hata,
  });
  const sablondanKur = useMutation({
    mutationFn: (id: string) =>
      ogrenmeIstek(`kurumlar/${kurumId}/plan-sablonlari/${id}/uygula`, {
        govde: { ogrenci_id: ogrenciId, hafta_baslangic: hafta },
        sema: PlanDetaySema,
      }),
    onSuccess: () => tamam(t('ogrenme.plan.sablondanKuruldu')),
    onError: hata,
  });
  const kopyala = useMutation({
    mutationFn: (kaynakPlanId: string) =>
      ogrenmeIstek(`kurumlar/${kurumId}/planlar/${kaynakPlanId}/kopyala`, {
        govde: { hedef_hafta_baslangic: hafta },
        sema: PlanDetaySema,
      }),
    onSuccess: () => tamam(t('ogrenme.plan.kopyalandi')),
    onError: hata,
  });
  const yayinla = useMutation({
    mutationFn: () =>
      ogrenmeIstek(`kurumlar/${kurumId}/planlar/${String(planId)}/yayinla`, {
        yontem: 'POST',
        sema: PlanDetaySema,
      }),
    onSuccess: () => tamam(t('ogrenme.plan.yayinlandi')),
    onError: hata,
  });
  const sil = useMutation({
    mutationFn: (id: string) =>
      ogrenmeIstek(`kurumlar/${kurumId}/gorevler/${id}`, { yontem: 'DELETE' }),
    onSuccess: async () => {
      setSilinecek(null);
      await tamam(t('ogrenme.plan.gorevSilindi'));
    },
    onError: (h) => {
      setSilinecek(null);
      hata(h);
    },
  });
  const sablonKaydet = useMutation({
    mutationFn: () =>
      ogrenmeIstek(`kurumlar/${kurumId}/plan-sablonlari`, {
        govde: {
          ad: t('ogrenme.plan.sablonAdi', { hafta: hafta }),
          gorevler: (detay?.gorevler ?? [])
            .filter((g) => !devredilmisMi(g))
            .map((g) => ({
              gun_sirasi: (new Date(`${g.gun}T00:00:00Z`).getUTCDay() + 6) % 7,
              brans_kodu: g.brans_kodu,
              ...(g.konu_id ? { konu_id: g.konu_id } : {}),
              hedef_turu: g.hedef_turu,
              hedef_miktar: g.hedef_miktar,
              sira: g.sira,
            })),
        },
      }),
    onSuccess: () => tamam(t('ogrenme.plan.sablonKaydedildi')),
    onError: hata,
  });
  const notKaydet = useMutation({
    mutationFn: (metin: string) =>
      ogrenmeIstek(`kurumlar/${kurumId}/planlar/${String(planId)}/not`, {
        yontem: 'PUT',
        govde: {
          not: metin.trim() === '' ? null : metin.trim(),
          ...(detay?.plan ? { surum: detay.plan.surum } : {}),
        },
        sema: PlanDetaySema,
      }),
    onSuccess: () => tamam(t('ogrenme.plan.notKaydedildi')),
    onError: hata,
  });

  const gunler = useMemo(() => (detay ? gunlereBol(detay.gorevler, hafta) : null), [detay, hafta]);
  const planBos = detay?.plan === null;
  const gorevsiz = detay?.gorevler.length === 0;

  return (
    <>
      <SayfaBasligi baslik={t('nav.planlar')} aciklama={t('ogrenme.plan.aciklama')}>
        {yetki.yazabilir ? (
          <Dugme
            gorunum="ikincil"
            onClick={() => {
              setTopluAcik(true);
            }}
          >
            <Users aria-hidden />
            {t('ogrenme.plan.topluPlan')}
          </Dugme>
        ) : null}
      </SayfaBasligi>

      <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="w-full sm:max-w-xs">
          <OgrenciSecimi
            deger={ogrenciId}
            degisti={(id) => {
              setOgrenciId(id);
              setBildirim(null);
            }}
            ogrenciler={ogrenciler.liste}
          />
        </div>
        <HaftaGezgini hafta={hafta} bugun={bugun} degisti={setHafta} />
      </div>
      <div className="mb-4">
        <BildirimKutusu bildirim={bildirim} />
      </div>

      {ogrenciId === '' ? (
        <section className="rounded-buyuk border border-kenar bg-yuzey">
          <BosDurum
            className="py-16"
            ikon={CalendarPlus}
            baslik={t('ogrenme.plan.ogrenciSec')}
            aciklama={t('ogrenme.plan.ogrenciSecAciklama')}
          />
        </section>
      ) : plan.isPending ? (
        <ListeIskeleti satir={5} />
      ) : plan.isError ? (
        <HataDurumu
          baslik={t('ogrenme.plan.yuklenemedi')}
          aciklama={hataMesaji(plan.error)}
          tekrarDene={() => void plan.refetch()}
        />
      ) : (
        <div className="flex flex-col gap-4">
          <section
            aria-label={t('ogrenme.plan.hafta')}
            className="flex flex-wrap items-center gap-3 rounded-buyuk border border-kenar bg-yuzey px-4 py-3"
          >
            {detay?.plan ? (
              <Rozet ton={taslak ? 'uyari' : 'basari'}>
                {t(taslak ? 'ogrenme.plan.taslak' : 'ogrenme.plan.yayinda')}
              </Rozet>
            ) : (
              <Rozet>{t('ogrenme.plan.planYok')}</Rozet>
            )}
            {kilitli ? (
              <Rozet ton="hata">
                <Lock className="mr-1 size-3" aria-hidden />
                {t('ogrenme.plan.kilitli')}
              </Rozet>
            ) : null}
            <div className="ml-auto flex flex-wrap gap-2">
              {!kilitli && planId && taslak ? (
                <Dugme
                  disabled={yayinla.isPending || gorevsiz}
                  onClick={() => {
                    yayinla.mutate();
                  }}
                >
                  <Send aria-hidden />
                  {t('ogrenme.plan.yayinla')}
                </Dugme>
              ) : null}
              {!kilitli && planId && !gorevsiz ? (
                <Dugme
                  gorunum="ikincil"
                  disabled={sablonKaydet.isPending}
                  onClick={() => {
                    sablonKaydet.mutate();
                  }}
                >
                  {t('ogrenme.plan.sablonOlarakKaydet')}
                </Dugme>
              ) : null}
            </div>
          </section>

          {kilitli ? (
            <p
              role="note"
              className="rounded-orta bg-yuzey-ikincil px-3 py-2 text-sm text-metin-ikincil"
            >
              {t('ogrenme.plan.kilitliAciklama')}
            </p>
          ) : null}

          {!kilitli && (planBos || gorevsiz) ? (
            <section
              className="rounded-buyuk border border-kenar bg-yuzey p-4"
              aria-label={t('ogrenme.plan.hizliKur')}
            >
              <h2 className="text-base font-semibold">{t('ogrenme.plan.hizliKur')}</h2>
              <p className="mt-1 text-sm text-metin-ikincil">
                {t('ogrenme.plan.hizliKurAciklama')}
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
                <Alan etiket={t('ogrenme.plan.sablondanKur')}>
                  {(o) => (
                    <Secim
                      {...o}
                      value={sablonId}
                      onChange={(e) => {
                        setSablonId(e.target.value);
                      }}
                    >
                      <option value="">{t('ogrenme.plan.sablonSec')}</option>
                      {sablonlar.data?.sablonlar.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.ad}
                        </option>
                      ))}
                    </Secim>
                  )}
                </Alan>
                <Dugme
                  disabled={sablonId === '' || sablondanKur.isPending}
                  onClick={() => {
                    sablondanKur.mutate(sablonId);
                  }}
                >
                  <CalendarPlus aria-hidden />
                  {t('ogrenme.plan.sablondanKurDugme')}
                </Dugme>
                <Dugme
                  gorunum="ikincil"
                  disabled={!oncekiPlan.data?.plan || kopyala.isPending}
                  onClick={() => {
                    const kaynak = oncekiPlan.data?.plan;
                    if (kaynak) kopyala.mutate(kaynak.id);
                  }}
                >
                  <Copy aria-hidden />
                  {t('ogrenme.plan.gecenHaftayiKopyala')}
                </Dugme>
              </div>
              {(sablonlar.data?.sablonlar.length ?? 0) === 0 ? (
                <p className="mt-2 text-xs text-metin-ikincil">{t('ogrenme.plan.sablonYok')}</p>
              ) : null}
              {!oncekiPlan.data?.plan ? (
                <p className="mt-1 text-xs text-metin-ikincil">{t('ogrenme.plan.gecenHaftaYok')}</p>
              ) : null}
              {planBos ? (
                <div className="mt-3">
                  <Dugme
                    gorunum="ikincil"
                    disabled={olustur.isPending}
                    onClick={() => {
                      olustur.mutate();
                    }}
                  >
                    <Plus aria-hidden />
                    {t('ogrenme.plan.bosPlanOlustur')}
                  </Dugme>
                </div>
              ) : null}
            </section>
          ) : null}

          {gunler && planId ? (
            <ol
              aria-label={t('ogrenme.plan.gunler')}
              className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
            >
              {[...gunler.entries()].map(([gun, gorevler]) => (
                <li
                  key={gun}
                  className="flex flex-col rounded-buyuk border border-kenar bg-yuzey"
                  aria-label={gunEtiketi(gun)}
                >
                  <h3
                    className={`border-b border-kenar px-3 py-2 text-sm font-semibold ${gun === bugun ? 'bg-birincil-yumusak' : ''}`}
                  >
                    {gunEtiketi(gun)}
                    {gun === bugun ? (
                      <span className="ml-2 text-xs font-normal">({t('ogrenme.plan.bugun')})</span>
                    ) : null}
                  </h3>
                  <ul className="flex flex-1 flex-col gap-2 p-3">
                    {gorevler.length === 0 ? (
                      <li className="text-xs text-metin-ikincil">{t('ogrenme.plan.gunBos')}</li>
                    ) : null}
                    {gorevler.map((g) => (
                      <li
                        key={g.id}
                        className="rounded-orta border border-kenar px-2.5 py-2 text-sm"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p
                              className={
                                devredilmisMi(g) ? 'font-medium line-through' : 'font-medium'
                              }
                            >
                              {bransAdi(g.brans_kodu)}
                            </p>
                            {g.konu_id && konuAdlari.get(g.konu_id) ? (
                              <p className="truncate text-xs text-metin-ikincil">
                                {konuAdlari.get(g.konu_id)}
                              </p>
                            ) : null}
                          </div>
                          <Rozet ton={gorevDurumTonu(g)}>
                            {t(`ogrenme.plan.gorevDurum.${g.durum}`)}
                          </Rozet>
                        </div>
                        <p className="mt-1 text-xs">
                          {g.gerceklesen_miktar !== null
                            ? ilerlemeEtiketi(g)
                            : miktarEtiketi(g.hedef_turu, g.hedef_miktar)}
                        </p>
                        {devralindiMi(g) ? (
                          <p className="mt-1">
                            <Rozet ton="bilgi">{t('ogrenme.plan.devralindi')}</Rozet>
                          </p>
                        ) : null}
                        {!kilitli && !devredilmisMi(g) ? (
                          <div className="mt-1.5 flex gap-1">
                            <Dugme
                              boyut="sm"
                              gorunum="hayalet"
                              aria-label={t('ogrenme.plan.gorevDuzenleEtiket', {
                                brans: bransAdi(g.brans_kodu),
                                gun: gunEtiketi(gun),
                              })}
                              onClick={() => {
                                setGorevFormu({ gun, duzenle: g });
                              }}
                            >
                              {t('ogrenme.ortak.duzenle')}
                            </Dugme>
                            <Dugme
                              boyut="sm"
                              gorunum="hayalet"
                              aria-label={t('ogrenme.plan.gorevSilEtiket', {
                                brans: bransAdi(g.brans_kodu),
                                gun: gunEtiketi(gun),
                              })}
                              onClick={() => {
                                setSilinecek(g);
                              }}
                            >
                              {t('ogrenme.ortak.sil')}
                            </Dugme>
                          </div>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                  {!kilitli ? (
                    <div className="border-t border-kenar p-2">
                      <Dugme
                        boyut="sm"
                        gorunum="hayalet"
                        className="w-full"
                        aria-label={t('ogrenme.plan.gunaEkleEtiket', { gun: gunEtiketi(gun) })}
                        onClick={() => {
                          setGorevFormu({ gun, duzenle: null });
                        }}
                      >
                        <Plus aria-hidden />
                        {t('ogrenme.plan.gorevEkle')}
                      </Dugme>
                    </div>
                  ) : null}
                </li>
              ))}
            </ol>
          ) : null}

          {planId && detay?.plan ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <NotKutusu
                anahtar={`${planId}-${String(detay.plan.surum)}`}
                baslangic={detay.plan.not ?? ''}
                salt={kilitli}
                kaydediliyor={notKaydet.isPending}
                kaydet={(m) => {
                  notKaydet.mutate(m);
                }}
              />
              <section
                aria-label={t('ogrenme.plan.ozet')}
                className="rounded-buyuk border border-kenar bg-yuzey p-4"
              >
                <h2 className="mb-3 text-base font-semibold">{t('ogrenme.plan.ozet')}</h2>
                <PlanOzeti kurumId={kurumId} planId={planId} />
              </section>
            </div>
          ) : null}
        </div>
      )}

      {gorevFormu && planId ? (
        <GorevFormu
          kurumId={kurumId}
          planId={planId}
          hafta={hafta}
          gun={gorevFormu.gun}
          duzenle={gorevFormu.duzenle}
          kapat={() => {
            setGorevFormu(null);
          }}
          bitti={(m) => {
            setGorevFormu(null);
            setBildirim(basari(m));
          }}
        />
      ) : null}
      {topluAcik ? (
        <TopluPlan
          kurumId={kurumId}
          hafta={hafta}
          kapat={() => {
            setTopluAcik(false);
          }}
          bitti={(m) => {
            setTopluAcik(false);
            setBildirim(basari(m));
          }}
        />
      ) : null}
      <OnayPenceresi
        acik={silinecek !== null}
        degisti={(a) => {
          if (!a) setSilinecek(null);
        }}
        baslik={t('ogrenme.plan.gorevSilBaslik')}
        aciklama={t('ogrenme.plan.gorevSilAciklama')}
        onayEtiketi={t('ogrenme.ortak.sil')}
        tehlikeli
        bekliyor={sil.isPending}
        onay={() => {
          if (silinecek) sil.mutate(silinecek.id);
        }}
      />
    </>
  );
}

function NotKutusu({
  anahtar,
  baslangic,
  salt,
  kaydediliyor,
  kaydet,
}: {
  anahtar: string;
  baslangic: string;
  salt: boolean;
  kaydediliyor: boolean;
  kaydet: (metin: string) => void;
}) {
  return (
    <NotAlani
      key={anahtar}
      baslangic={baslangic}
      salt={salt}
      kaydediliyor={kaydediliyor}
      kaydet={kaydet}
    />
  );
}

function NotAlani({
  baslangic,
  salt,
  kaydediliyor,
  kaydet,
}: {
  baslangic: string;
  salt: boolean;
  kaydediliyor: boolean;
  kaydet: (metin: string) => void;
}) {
  const [metin, setMetin] = useState(baslangic);
  return (
    <section
      aria-label={t('ogrenme.plan.ogretmenNotu')}
      className="rounded-buyuk border border-kenar bg-yuzey p-4"
    >
      <h2 className="mb-3 text-base font-semibold">{t('ogrenme.plan.ogretmenNotu')}</h2>
      <Alan etiket={t('ogrenme.plan.notEtiket')} yardim={t('ogrenme.plan.notYardim')}>
        {(o) => (
          <textarea
            {...o}
            value={metin}
            rows={4}
            maxLength={2000}
            readOnly={salt}
            onChange={(e) => {
              setMetin(e.target.value);
            }}
            className="w-full rounded-orta border border-kenar bg-yuzey px-3 py-2 text-base read-only:bg-yuzey-ikincil"
          />
        )}
      </Alan>
      {!salt ? (
        <div className="mt-3 flex justify-end">
          <Dugme
            gorunum="ikincil"
            disabled={kaydediliyor || metin === baslangic}
            onClick={() => {
              kaydet(metin);
            }}
          >
            {t('ogrenme.plan.notKaydet')}
          </Dugme>
        </div>
      ) : null}
    </section>
  );
}
