'use client';

import {
  OdakAcikOturumHatasiSema,
  OdakBaslatYanitiSema,
  OdakBitirYanitiSema,
  type OdakModu,
  type OdakOturumu,
} from '@kopru/contracts';
import { t } from '@kopru/i18n';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CircleCheck, Play, Square, Timer } from 'lucide-react';
import { useEffect, useId, useReducer, useRef, useState, type SyntheticEvent } from 'react';

import { Ilerleme } from './ortak';

import { HataDurumu } from '@/components/hata-durumu';
import { tarihYaz } from '@/components/hesap/ortak';
import { BolumKapisi } from '@/components/kabuk/bolum-yer-tutucu';
import { SayfaBasligi } from '@/components/kabuk/sayfa-basligi';
import { Dugme } from '@/components/ui/button';
import { Etiket, Girdi } from '@/components/ui/input';
import { Iskelet, Kart } from '@/components/ui/kart';
import { Secim } from '@/components/ui/secim';
import { Uyari } from '@/components/ui/uyari';
import { useKurum } from '@/kurum/baglam';
import { UygulamaHatasi, hataMesaji } from '@/lib/api';
import { bransAdi, siraliBransler } from '@/lib/bransler';
import { cn } from '@/lib/cn';
import { motivasyonIstek } from '@/lib/hesap-istek';
import { acikOturumDetayi, motivasyonHataMesaji } from '@/lib/motivasyon/hata';
import {
  ODAK_MOD_SECENEKLERI,
  ODAK_SERBEST_EN_AZ,
  ODAK_SERBEST_EN_COK,
  gecenSaniye,
  kalanSaniye,
  odakGecis,
  planlananDk,
  serbestSureGecerliMi,
  sureBicimle,
  sureBittiMi,
  uuidv7Uret,
  type OdakDurumu,
} from '@/lib/motivasyon/odak';
import { motivasyonAnahtari, useAcikOdak, useOdakGecmisi } from '@/lib/motivasyon/veri';
import { miktarEtiketi } from '@/lib/ogrenme/plan';
import { useGorevlerim } from '@/lib/ogrenme/veri';

export function OdakEkrani() {
  return (
    <BolumKapisi bolum="odak">
      <OdakIcerigi />
    </BolumKapisi>
  );
}

function OdakIcerigi() {
  const { uyelik } = useKurum();
  const kurumId = uyelik.kurumId;
  const acik = useAcikOdak(kurumId);
  const [durum, dispatch] = useReducer(odakGecis, { tur: 'yukleniyor' } as OdakDurumu);

  useEffect(() => {
    if (acik.isSuccess) dispatch({ tur: 'acik_bulundu', oturum: acik.data.oturum });
  }, [acik.isSuccess, acik.data]);

  return (
    <>
      <SayfaBasligi baslik={t('motivasyon.odak.baslik')} aciklama={t('motivasyon.odak.aciklama')} />
      {acik.isError ? (
        <HataDurumu aciklama={hataMesaji(acik.error)} tekrarDene={() => void acik.refetch()} />
      ) : durum.tur === 'yukleniyor' ? (
        <div role="status" aria-label={t('ortak.yukleniyor')}>
          <Iskelet className="h-64 w-full" />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {durum.tur === 'hazir' || durum.tur === 'baslatiliyor' ? (
            <BaslatFormu kurumId={kurumId} durum={durum} dispatch={dispatch} />
          ) : null}
          {durum.tur === 'devam' || durum.tur === 'bitiriliyor' ? (
            <Sayac kurumId={kurumId} oturum={durum.oturum} durum={durum} dispatch={dispatch} />
          ) : null}
          {durum.tur === 'bitti' ? <Sonuc durum={durum} dispatch={dispatch} /> : null}
          <GecmisKarti kurumId={kurumId} />
        </div>
      )}
    </>
  );
}

type Gonder = (o: Parameters<typeof odakGecis>[1]) => void;

// --- Baslat -----------------------------------------------------------------------------------

function BaslatFormu({
  kurumId,
  durum,
  dispatch,
}: {
  kurumId: string;
  durum: Extract<OdakDurumu, { tur: 'hazir' | 'baslatiliyor' }>;
  dispatch: Gonder;
}) {
  const qc = useQueryClient();
  const { acikModuller } = useKurum();
  const [mod, setMod] = useState<OdakModu>('25_5');
  const [serbest, setSerbest] = useState('30');
  const [hedef, setHedef] = useState('');
  const istemciId = useRef(uuidv7Uret());
  const modId = useId();
  const sureId = useId();
  const hedefId = useId();
  const gorevler = useGorevlerim(kurumId, undefined, acikModuller.includes('haftalik_plan'));

  const serbestDk = Number(serbest);
  const serbestGecerli = mod !== 'serbest' || serbestSureGecerliMi(serbestDk);

  const baslat = useMutation({
    mutationFn: () => {
      const [tur, deger] = hedef.split(':');
      const gorev =
        tur === 'gorev' ? gorevler.data?.gorevler.find((g) => g.id === deger) : undefined;
      const brans = tur === 'brans' ? deger : gorev?.brans_kodu;
      return motivasyonIstek(`kurumlar/${kurumId}/odak-oturumlari`, {
        yontem: 'POST',
        govde: {
          istemci_id: istemciId.current,
          mod,
          ...(mod === 'serbest' ? { planlanan_dk: planlananDk(mod, serbestDk) } : {}),
          ...(brans ? { brans_kodu: brans } : {}),
          ...(gorev ? { plan_gorev_id: gorev.id } : {}),
          cihaz: 'web',
        },
        sema: OdakBaslatYanitiSema,
      });
    },
    onMutate: () => {
      dispatch({ tur: 'baslat', istemciId: istemciId.current });
    },
    onSuccess: (oturum) => {
      dispatch({ tur: 'baslatildi', oturum });
      void qc.invalidateQueries({ queryKey: [...motivasyonAnahtari(kurumId), 'odak'] });
    },
    onError: (hata) => {
      // Baska bir cihazda acik oturum varsa onu surdur.
      const ham = acikOturumDetayi(hata);
      const oturum = OdakAcikOturumHatasiSema.safeParse({ oturum: ham });
      if (oturum.success) dispatch({ tur: 'baslatildi', oturum: oturum.data.oturum });
      else dispatch({ tur: 'baslatilamadi' });
    },
  });

  const gonder = (e: SyntheticEvent) => {
    e.preventDefault();
    if (serbestGecerli && durum.tur === 'hazir') baslat.mutate();
  };
  const secimler = ODAK_MOD_SECENEKLERI;
  const hata =
    baslat.error instanceof UygulamaHatasi && baslat.error.kod === 'acik_oturum_var'
      ? null
      : baslat.error;

  return (
    <Kart aria-labelledby="odak-baslat-baslik" className="p-5">
      <h2 id="odak-baslat-baslik" className="text-base font-semibold">
        {t('motivasyon.odak.yeniBaslik')}
      </h2>
      <form onSubmit={gonder} className="mt-4 flex flex-col gap-5" noValidate>
        <fieldset>
          <legend id={modId} className="mb-2 text-sm font-medium">
            {t('motivasyon.odak.mod')}
          </legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {secimler.map((s) => (
              <label
                key={s.mod}
                className={cn(
                  'flex min-h-14 cursor-pointer flex-col justify-center rounded-orta border-2 px-3 py-2 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-birincil',
                  mod === s.mod ? 'border-birincil bg-birincil-yumusak' : 'border-kenar',
                )}
              >
                <input
                  type="radio"
                  name="odak-modu"
                  value={s.mod}
                  checked={mod === s.mod}
                  onChange={() => {
                    setMod(s.mod);
                  }}
                  className="sr-only"
                />
                <span className="font-semibold">{t(`motivasyon.odak.modAd.${s.mod}`)}</span>
                <span className="text-sm text-metin-ikincil">
                  {t(`motivasyon.odak.modAciklama.${s.mod}`)}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {mod === 'serbest' ? (
          <div className="flex max-w-xs flex-col gap-1.5">
            <Etiket htmlFor={sureId}>{t('motivasyon.odak.sureEtiketi')}</Etiket>
            <Girdi
              id={sureId}
              type="number"
              inputMode="numeric"
              min={ODAK_SERBEST_EN_AZ}
              max={ODAK_SERBEST_EN_COK}
              value={serbest}
              aria-invalid={!serbestGecerli || undefined}
              onChange={(e) => {
                setSerbest(e.target.value);
              }}
            />
            <p className={cn('text-sm', serbestGecerli ? 'text-metin-ikincil' : 'text-hata')}>
              {t('motivasyon.odak.sureYardim', {
                en_az: ODAK_SERBEST_EN_AZ,
                en_cok: ODAK_SERBEST_EN_COK,
              })}
            </p>
          </div>
        ) : null}

        <div className="flex max-w-md flex-col gap-1.5">
          <Etiket htmlFor={hedefId}>{t('motivasyon.odak.hedefEtiketi')}</Etiket>
          <Secim
            id={hedefId}
            value={hedef}
            onChange={(e) => {
              setHedef(e.target.value);
            }}
          >
            <option value="">{t('motivasyon.odak.hedefYok')}</option>
            {gorevler.data?.gorevler.length ? (
              <optgroup label={t('motivasyon.odak.planGorevleri')}>
                {gorevler.data.gorevler.map((g) => (
                  <option key={g.id} value={`gorev:${g.id}`}>
                    {bransAdi(g.brans_kodu)} · {miktarEtiketi(g.hedef_turu, g.hedef_miktar)}
                  </option>
                ))}
              </optgroup>
            ) : null}
            <optgroup label={t('motivasyon.odak.dersler')}>
              {siraliBransler().map((b) => (
                <option key={b.kod} value={`brans:${b.kod}`}>
                  {b.ad}
                </option>
              ))}
            </optgroup>
          </Secim>
        </div>

        {hata ? <Uyari>{motivasyonHataMesaji(hata)}</Uyari> : null}

        <div>
          <Dugme type="submit" disabled={!serbestGecerli || durum.tur === 'baslatiliyor'}>
            <Play aria-hidden />
            {durum.tur === 'baslatiliyor' ? t('ortak.yukleniyor') : t('motivasyon.odak.baslat')}
          </Dugme>
        </div>
      </form>
    </Kart>
  );
}

// --- Sayac ------------------------------------------------------------------------------------

function Sayac({
  kurumId,
  oturum,
  durum,
  dispatch,
}: {
  kurumId: string;
  oturum: OdakOturumu;
  durum: Extract<OdakDurumu, { tur: 'devam' | 'bitiriliyor' }>;
  dispatch: Gonder;
}) {
  const qc = useQueryClient();
  const [simdi, setSimdi] = useState(() => Date.now());
  const bitirDugmesi = useRef<HTMLButtonElement>(null);

  // Sayac duvar saatinden turetilir: sekme kapali/arka planda olsa da dogru deger gosterilir.
  useEffect(() => {
    const z = window.setInterval(() => {
      setSimdi(Date.now());
    }, 1000);
    const gorunur = () => {
      setSimdi(Date.now());
    };
    document.addEventListener('visibilitychange', gorunur);
    return () => {
      window.clearInterval(z);
      document.removeEventListener('visibilitychange', gorunur);
    };
  }, []);

  const bitti = sureBittiMi(oturum, simdi);
  const kalan = kalanSaniye(oturum, simdi);
  const toplam = oturum.planlanan_dk * 60;

  useEffect(() => {
    if (bitti) bitirDugmesi.current?.focus();
  }, [bitti]);

  const bitir = useMutation({
    mutationFn: (d: 'tamam' | 'yarida') =>
      motivasyonIstek(`kurumlar/${kurumId}/odak-oturumlari/${oturum.istemci_id}/bitir`, {
        yontem: 'POST',
        govde: { durum: d, bitis_at: new Date().toISOString() },
        sema: OdakBitirYanitiSema,
      }),
    onMutate: (d) => {
      dispatch({ tur: 'bitir', durum: d });
    },
    onSuccess: (yanit) => {
      dispatch({ tur: 'bitirildi', oturum: yanit.oturum, kazanim: yanit.kazanim });
      void qc.invalidateQueries({ queryKey: [...motivasyonAnahtari(kurumId), 'odak'] });
    },
    onError: () => {
      dispatch({ tur: 'bitirilemedi' });
    },
  });
  const bekliyor = durum.tur === 'bitiriliyor';
  const hedefMetni = oturum.brans_kodu ? bransAdi(oturum.brans_kodu) : null;

  return (
    <Kart
      aria-labelledby="odak-sayac-baslik"
      className="flex flex-col items-center gap-4 p-6 text-center"
    >
      <h2 id="odak-sayac-baslik" className="text-base font-semibold">
        {bitti ? t('motivasyon.odak.sureDoldu') : t('motivasyon.odak.devamEdiyor')}
      </h2>
      {hedefMetni ? <p className="text-sm text-metin-ikincil">{hedefMetni}</p> : null}
      <p
        role="timer"
        aria-live="off"
        aria-label={t('motivasyon.odak.kalanEtiketi')}
        className="text-6xl font-semibold tabular-nums tracking-tight sm:text-7xl"
        data-testid="odak-sayac"
      >
        {sureBicimle(kalan)}
      </p>
      <Ilerleme
        className="w-full max-w-md"
        deger={Math.min(gecenSaniye(oturum, simdi), toplam)}
        ust={toplam}
        etiket={t('motivasyon.odak.ilerleme')}
        metin={t('motivasyon.odak.planlanan', { dk: oturum.planlanan_dk })}
      />
      <p className="max-w-md text-sm text-metin-ikincil">{t('motivasyon.odak.sekmeNotu')}</p>
      {bitir.isError ? <Uyari>{motivasyonHataMesaji(bitir.error)}</Uyari> : null}
      <div className="flex flex-wrap justify-center gap-2">
        {bitti ? (
          <Dugme
            ref={bitirDugmesi}
            disabled={bekliyor}
            onClick={() => {
              bitir.mutate('tamam');
            }}
          >
            <CircleCheck aria-hidden />
            {t('motivasyon.odak.bitir')}
          </Dugme>
        ) : (
          <Dugme
            gorunum="ikincil"
            disabled={bekliyor}
            onClick={() => {
              bitir.mutate('yarida');
            }}
          >
            <Square aria-hidden />
            {t('motivasyon.odak.yaridaBirak')}
          </Dugme>
        )}
      </div>
    </Kart>
  );
}

// --- Sonuc ------------------------------------------------------------------------------------

function Sonuc({
  durum,
  dispatch,
}: {
  durum: Extract<OdakDurumu, { tur: 'bitti' }>;
  dispatch: Gonder;
}) {
  const { kazanim, oturum } = durum;
  const dk = Math.floor(oturum.gerceklesen_sn / 60);
  return (
    <Kart
      aria-labelledby="odak-sonuc-baslik"
      className="flex flex-col items-center gap-3 p-6 text-center"
    >
      <span className="flex size-12 items-center justify-center rounded-full bg-basari-yumusak">
        <CircleCheck className="size-7" aria-hidden />
      </span>
      <h2 id="odak-sonuc-baslik" className="text-lg font-semibold">
        {oturum.durum === 'tamam'
          ? t('motivasyon.odak.tamamlandi')
          : t('motivasyon.odak.yaridaBitti')}
      </h2>
      <p className="text-sm text-metin-ikincil" data-testid="odak-sonuc">
        {t('motivasyon.odak.sonuc', { dk, xp: kazanim.xp })}
      </p>
      {kazanim.dogrulanmamis_sayilmayan_sn > 0 ? (
        <p role="note" className="max-w-md rounded-orta bg-uyari-yumusak px-3 py-2 text-sm">
          {t('motivasyon.odak.dogrulanmamis')}
        </p>
      ) : null}
      {kazanim.seviye_atladi ? (
        <p className="text-sm font-medium">{t('motivasyon.odak.seviyeAtladi')}</p>
      ) : null}
      {kazanim.yeni_rozetler.length > 0 ? (
        <p className="text-sm font-medium">
          {t('motivasyon.odak.yeniRozet', { n: kazanim.yeni_rozetler.length })}
        </p>
      ) : null}
      <Dugme
        onClick={() => {
          dispatch({ tur: 'yeni' });
        }}
      >
        <Timer aria-hidden />
        {t('motivasyon.odak.yeniOturum')}
      </Dugme>
    </Kart>
  );
}

// --- Gecmis -----------------------------------------------------------------------------------

function GecmisKarti({ kurumId }: { kurumId: string }) {
  const q = useOdakGecmisi(kurumId);
  const liste = (q.data?.oturumlar ?? []).filter((o) => o.durum !== 'devam');
  if (liste.length === 0) return null;
  return (
    <Kart aria-labelledby="odak-gecmis-baslik" className="p-5">
      <h2 id="odak-gecmis-baslik" className="text-base font-semibold">
        {t('motivasyon.odak.gecmis')}
      </h2>
      <ul className="mt-2 divide-y divide-kenar" data-testid="odak-gecmis">
        {liste.map((o) => (
          <li key={o.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
            <span>
              <span className="block font-medium">
                {o.brans_kodu ? bransAdi(o.brans_kodu) : t('motivasyon.odak.hedefYok')}
              </span>
              <span className="text-metin-ikincil">{tarihYaz(o.baslangic_at)}</span>
            </span>
            <span className="shrink-0 tabular-nums">
              {t('motivasyon.odak.gecmisSure', { dk: Math.floor(o.gerceklesen_sn / 60) })}
              {o.durum === 'yarida' ? ` · ${t('motivasyon.odak.yarida')}` : ''}
            </span>
          </li>
        ))}
      </ul>
    </Kart>
  );
}
