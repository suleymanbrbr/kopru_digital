'use client';

import { SoruOlusturYanitSema } from '@kopru/contracts';
import { t } from '@kopru/i18n';
import { useMutation } from '@tanstack/react-query';
import { CircleCheck } from 'lucide-react';
import Link from 'next/link';
import { useRef, useState, type SyntheticEvent } from 'react';
import type { z } from 'zod';

import { FotoSecici, useFotograflar } from './foto-secici';
import { KotaBilgisi } from './kota-bilgisi';

import { zamanYaz } from '@/components/hesap/ortak';
import { KonuSecici } from '@/components/ogrenme/konu-secici';
import { Alan } from '@/components/operasyon/ortak';
import { Dugme, dugmeStili } from '@/components/ui/button';
import { Girdi } from '@/components/ui/input';
import { MetinAlani } from '@/components/ui/metin-alani';
import { Secim } from '@/components/ui/secim';
import { Uyari } from '@/components/ui/uyari';
import { useKurum } from '@/kurum/baglam';
import { hataMesaji } from '@/lib/api';
import { siraliBransler } from '@/lib/bransler';
import { ogrenmeIstek } from '@/lib/hesap-istek';
import { kotaHatasi, sonSecimiOku, sonSecimiYaz, sureMetni } from '@/lib/soru/soru';
import { useSoruKotam, useSoruYenile } from '@/lib/soru/veri';
import { bekleMs, dosyaHazirDegilDene } from '@/lib/soru/yukleme';

type Gonderilen = z.output<typeof SoruOlusturYanitSema>;

/** Ogrenci "yeni soru" formu: fotograflar, brans/konu, "burada takildim" notu, gonderim ve tahmini sure. */
export function SoruFormu({ sorularimaGit }: { sorularimaGit?: () => void }) {
  const { uyelik } = useKurum();
  const kurumId = uyelik.kurumId;
  const yenile = useSoruYenile(kurumId);
  const kota = useSoruKotam(kurumId);
  const depo = useFotograflar();
  // Son secilen brans/konu onerilir (form yalniz oturum acildiktan sonra, istemcide cizilir).
  const [brans, setBrans] = useState(() => sonSecimiOku(kurumId)?.brans ?? '');
  const [konuId, setKonuId] = useState<string | null>(() => sonSecimiOku(kurumId)?.konuId ?? null);
  const [baslik, setBaslik] = useState('');
  const [not, setNot] = useState('');
  const [gonderilen, setGonderilen] = useState<Gonderilen | null>(null);
  /** Ayni istek yeniden denendiginde ayni kayit doner (soru cogalmaz); basarida yenilenir. */
  const istekId = useRef(crypto.randomUUID());
  const bransSecenekleri = siraliBransler();

  const gonder = useMutation({
    mutationFn: () =>
      dosyaHazirDegilDene(
        () =>
          ogrenmeIstek(`kurumlar/${kurumId}/sorular`, {
            yontem: 'POST',
            sema: SoruOlusturYanitSema,
            govde: {
              brans_kodu: brans,
              ...(konuId ? { konu_id: konuId } : {}),
              ...(baslik.trim() ? { baslik: baslik.trim() } : {}),
              ...(not.trim() ? { metin: not.trim() } : {}),
              fotograflar: depo.fotograflar.map((f) => f.dosyaId ?? ''),
              ...(depo.fotograflar.some((f) => f.isaret)
                ? {
                    isaretler: depo.fotograflar.flatMap((f) =>
                      f.isaret && f.dosyaId && f.isaret.dosyaId
                        ? [
                            {
                              medya_dosya_id: f.isaret.dosyaId,
                              kaynak_dosya_id: f.dosyaId,
                              cizim_verisi: f.isaret.veri,
                            },
                          ]
                        : [],
                    ),
                  }
                : {}),
              istek_id: istekId.current,
            },
          }),
        bekleMs,
      ),
    onSuccess: (sonuc) => {
      sonSecimiYaz(kurumId, { brans, konuId });
      setGonderilen(sonuc);
      istekId.current = crypto.randomUUID();
      depo.temizle();
      setBaslik('');
      setNot('');
      void yenile();
    },
    onError: () => {
      // Kota hatasinda guncel hak gosterilsin.
      void kota.refetch();
    },
  });

  const kotaDoldu = kota.data ? kota.data.gunluk_kalan === 0 || kota.data.aylik_kalan === 0 : false;
  const gonderebilir = depo.hazirMi && brans !== '' && !kotaDoldu && !gonder.isPending;
  const kotaHata = gonder.isError ? kotaHatasi(gonder.error) : null;

  const gonderildi = (e: SyntheticEvent) => {
    e.preventDefault();
    if (gonderebilir) gonder.mutate();
  };

  if (gonderilen) {
    return (
      <GonderimOzeti
        sonuc={gonderilen}
        kurumId={kurumId}
        yeniSoru={() => {
          setGonderilen(null);
          gonder.reset();
        }}
        sorularimaGit={sorularimaGit}
      />
    );
  }

  return (
    <form
      onSubmit={gonderildi}
      aria-label={t('soruSor.form.baslik')}
      className="flex flex-col gap-5 rounded-buyuk border border-kenar bg-yuzey p-4 sm:p-5"
    >
      <KotaBilgisi kota={kota.data} />

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-base font-semibold">{t('soruSor.form.fotograflar')}</legend>
        <FotoSecici depo={depo} />
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <Alan etiket={t('soruSor.form.brans')}>
          {(o) => (
            <Secim
              {...o}
              value={brans}
              onChange={(e) => {
                setBrans(e.target.value);
                setKonuId(null);
              }}
            >
              <option value="">{t('soruSor.form.bransSec')}</option>
              {bransSecenekleri.map((b) => (
                <option key={b.kod} value={b.kod}>
                  {b.ad}
                </option>
              ))}
            </Secim>
          )}
        </Alan>
        <KonuSecici
          kurumId={kurumId}
          deger={konuId}
          {...(brans ? { brans } : {})}
          etiket={t('soruSor.form.konu')}
          degisti={(k) => {
            setKonuId(k?.id ?? null);
          }}
        />
      </div>

      <Alan etiket={t('soruSor.form.baslikEtiketi')}>
        {(o) => (
          <Girdi
            {...o}
            maxLength={200}
            value={baslik}
            placeholder={t('soruSor.form.baslikOrnek')}
            onChange={(e) => {
              setBaslik(e.target.value);
            }}
          />
        )}
      </Alan>

      <Alan etiket={t('soruSor.form.not')} yardim={t('soruSor.form.notYardim')}>
        {(o) => (
          <MetinAlani
            {...o}
            rows={4}
            maxLength={4000}
            value={not}
            onChange={(e) => {
              setNot(e.target.value);
            }}
          />
        )}
      </Alan>

      {kotaHata ? (
        <Uyari>
          {t(kotaHata.tur === 'aylik' ? 'soruSor.kota.aylikDoldu' : 'soruSor.kota.gunlukDoldu')}
          {kotaHata.sifirlanma
            ? ` ${t('soruSor.kota.sifirlanma', { zaman: zamanYaz(kotaHata.sifirlanma) })}`
            : ''}
        </Uyari>
      ) : gonder.isError ? (
        <Uyari>{hataMesaji(gonder.error)}</Uyari>
      ) : null}

      <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-metin-ikincil" role="status">
          {depo.fotograflar.length === 0
            ? t('soruSor.form.fotoGerekli')
            : !depo.hazirMi
              ? t('soruSor.form.yuklemeBekleniyor')
              : ''}
        </p>
        <Dugme type="submit" boyut="lg" disabled={!gonderebilir}>
          {gonder.isPending ? t('soruSor.form.gonderiliyor') : t('soruSor.form.gonder')}
        </Dugme>
      </div>
    </form>
  );
}

function GonderimOzeti({
  sonuc,
  kurumId,
  yeniSoru,
  sorularimaGit,
}: {
  sonuc: Gonderilen;
  kurumId: string;
  yeniSoru: () => void;
  sorularimaGit: (() => void) | undefined;
}) {
  const { tahmini_cevap: tahmin, kota } = sonuc;
  const sure = tahmin.sure_sn === null ? null : sureMetni(tahmin.sure_sn);
  return (
    <section
      aria-label={t('soruSor.gonderildi.baslik')}
      className="flex flex-col gap-4 rounded-buyuk border border-kenar bg-yuzey p-5"
    >
      <div role="status" className="flex items-start gap-3">
        <CircleCheck className="mt-0.5 size-6 shrink-0 text-basari" aria-hidden />
        <div>
          <h2 className="text-lg font-semibold">{t('soruSor.gonderildi.baslik')}</h2>
          <p className="mt-1 text-sm text-metin-ikincil" data-testid="tahmini-sure">
            {tahmin.hedef_musait === false
              ? t('soruSor.gonderildi.musaitDegil')
              : sure
                ? t('soruSor.gonderildi.tahmin', {
                    sure: t(`soruSor.sure.${sure.birim}`, { n: sure.n }),
                  })
                : t('soruSor.gonderildi.tahminYok')}
          </p>
          {kota.gunluk_kalan !== null ? (
            <p className="mt-1 text-sm text-metin-ikincil">
              {t('soruSor.kota.gunlukKalan', { n: kota.gunluk_kalan })}
            </p>
          ) : null}
        </div>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Link href={`/${kurumId}/soru-sor/${sonuc.id}`} className={dugmeStili({})}>
          {t('soruSor.gonderildi.soruyaGit')}
        </Link>
        <Dugme type="button" gorunum="ikincil" onClick={yeniSoru}>
          {t('soruSor.gonderildi.yeniSoru')}
        </Dugme>
        {sorularimaGit ? (
          <Dugme type="button" gorunum="hayalet" onClick={sorularimaGit}>
            {t('soruSor.gonderildi.sorularim')}
          </Dugme>
        ) : null}
      </div>
    </section>
  );
}
