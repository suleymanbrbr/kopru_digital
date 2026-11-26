'use client';

import type { GorevVerYanitiSema, Oneri } from '@kopru/contracts';
import { t } from '@kopru/i18n';
import Link from 'next/link';
import { useState, type SyntheticEvent } from 'react';
import type { z } from 'zod';

import { Alan } from '@/components/operasyon/ortak';
import { Dugme, dugmeStili } from '@/components/ui/button';
import { Girdi } from '@/components/ui/input';
import { Pencere } from '@/components/ui/pencere';
import { Uyari } from '@/components/ui/uyari';
import { useKurum } from '@/kurum/baglam';
import { hataMesaji } from '@/lib/api';
import { cn } from '@/lib/cn';
import { zorlukAdi } from '@/lib/gunluk-soru/analiz';
import { useGorevVer } from '@/lib/gunluk-soru/veri';
import { bugunYerel, tarihEkle, yerelUtc, gunEtiketi } from '@/lib/saat';
import { izinli } from '@/lib/yetki';

type GorevOnerisi = Extract<Oneri, { tur: 'gorev_oner' }>;
type Sonuc = z.output<typeof GorevVerYanitiSema>;
type Tur = 'plan_gorevi' | 'odev';

const SAAT_DILIMI = 'Europe/Istanbul';

/**
 * "Gorev ver": oneriyi ogretmen onayiyla haftalik plana gorev ya da tek ogrencilik odev yapar. Hicbir sey
 * onay olmadan ogrenciye gitmez; yalniz yetkili ve modulu acik hedefler sunulur (`plan.gorev.yaz`, `odev.ver`).
 */
export function GorevVerPenceresi({
  ogrenciId,
  oneri,
  kapat,
}: {
  ogrenciId: string;
  oneri: GorevOnerisi | null;
  kapat: () => void;
}) {
  return (
    <Pencere
      acik={oneri !== null}
      degisti={(a) => {
        if (!a) kapat();
      }}
      baslik={t('gunlukSoru.gorevVer.baslik')}
      aciklama={
        oneri
          ? t('gunlukSoru.gorevVer.aciklama', {
              konu: oneri.konu_ad ?? '',
              zorluk: zorlukAdi(oneri.zorluk),
            })
          : undefined
      }
    >
      {oneri ? (
        <GorevVerFormu key={oneri.konu_id} ogrenciId={ogrenciId} oneri={oneri} kapat={kapat} />
      ) : null}
    </Pencere>
  );
}

function GorevVerFormu({
  ogrenciId,
  oneri,
  kapat,
}: {
  ogrenciId: string;
  oneri: GorevOnerisi;
  kapat: () => void;
}) {
  const { uyelik, rol, acikModuller } = useKurum();
  const kurumId = uyelik.kurumId;
  const mutasyon = useGorevVer(kurumId, ogrenciId);
  const planVar = izinli(rol, 'plan.gorev.yaz') && acikModuller.includes('haftalik_plan');
  const odevVar = izinli(rol, 'odev.ver') && acikModuller.includes('odev');
  const [tur, setTur] = useState<Tur>(planVar ? 'plan_gorevi' : 'odev');
  const [soru, setSoru] = useState(String(oneri.soru_sayisi));
  const bugun = bugunYerel(SAAT_DILIMI);
  const [gun, setGun] = useState(tarihEkle(bugun, 1));
  const [sonTeslim, setSonTeslim] = useState(tarihEkle(bugun, 3));
  const [hata, setHata] = useState<Record<string, string>>({});
  const [sonuc, setSonuc] = useState<Sonuc | null>(null);

  const gonder = async (e: SyntheticEvent) => {
    e.preventDefault();
    const n = Number(soru);
    const h: Record<string, string> = {};
    if (!Number.isInteger(n) || n < 1 || n > 500) h.soru = t('gunlukSoru.gorevVer.hata.soru');
    const secilenGun = tur === 'plan_gorevi' ? gun : sonTeslim;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(secilenGun)) h.gun = t('gunlukSoru.gorevVer.hata.gun');
    setHata(h);
    if (Object.keys(h).length > 0) return;
    try {
      const yanit = await mutasyon.mutateAsync({
        tur,
        brans_kodu: oneri.brans_kodu,
        konu_id: oneri.konu_id,
        zorluk: oneri.zorluk,
        soru_sayisi: n,
        ...(tur === 'plan_gorevi'
          ? { gun }
          : { son_teslim_at: yerelUtc(sonTeslim, '23:59', SAAT_DILIMI) }),
      });
      setSonuc(yanit);
    } catch {
      /* hata `mutasyon.error` uzerinden gosterilir */
    }
  };

  if (sonuc) {
    const kok = `/${kurumId}`;
    return (
      <div role="status" className="flex flex-col gap-3" data-testid="gorev-verildi">
        <p className="font-medium">
          {sonuc.tur === 'plan_gorevi'
            ? t('gunlukSoru.gorevVer.planVerildi', {
                konu: oneri.konu_ad ?? '',
                gun: gunEtiketi(sonuc.gun),
              })
            : t('gunlukSoru.gorevVer.odevVerildi', {
                konu: oneri.konu_ad ?? '',
                tarih: gunEtiketi(sonTeslim),
              })}
        </p>
        {sonuc.tur === 'plan_gorevi' && sonuc.plan_durum === 'taslak' ? (
          <Uyari>{t('gunlukSoru.gorevVer.planTaslak')}</Uyari>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Link
            href={sonuc.tur === 'plan_gorevi' ? `${kok}/planlar` : `${kok}/odevler`}
            className={dugmeStili({ gorunum: 'ikincil' })}
          >
            {sonuc.tur === 'plan_gorevi'
              ? t('gunlukSoru.gorevVer.planaGit')
              : t('gunlukSoru.gorevVer.odevlereGit')}
          </Link>
          <Dugme type="button" gorunum="hayalet" onClick={kapat}>
            {t('ortak.kapat')}
          </Dugme>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={(e) => void gonder(e)} noValidate className="flex flex-col gap-4">
      {planVar && odevVar ? (
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1 text-sm font-medium">{t('gunlukSoru.gorevVer.tur')}</legend>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ['plan_gorevi', t('gunlukSoru.gorevVer.plan')],
                ['odev', t('gunlukSoru.gorevVer.odev')],
              ] as const
            ).map(([deger, etiket]) => (
              <label
                key={deger}
                className={cn(
                  'flex min-h-11 cursor-pointer items-center justify-center rounded-orta border border-kenar px-3 text-sm has-[:focus-visible]:outline has-[:focus-visible]:outline-2',
                  tur === deger
                    ? 'border-birincil bg-birincil-yumusak font-semibold'
                    : 'bg-yuzey hover:bg-yuzey-ikincil',
                )}
              >
                <input
                  type="radio"
                  name="gorev-turu"
                  value={deger}
                  checked={tur === deger}
                  onChange={() => {
                    setTur(deger);
                  }}
                  className="sr-only"
                />
                {etiket}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}
      <Alan etiket={t('gunlukSoru.gorevVer.soruSayisi')} hata={hata.soru}>
        {(o) => (
          <Girdi
            {...o}
            inputMode="numeric"
            value={soru}
            onChange={(e) => {
              setSoru(e.target.value.replace(/\D/g, '').slice(0, 3));
            }}
          />
        )}
      </Alan>
      {tur === 'plan_gorevi' ? (
        <Alan etiket={t('gunlukSoru.gorevVer.gun')} hata={hata.gun}>
          {(o) => (
            <Girdi
              {...o}
              type="date"
              value={gun}
              min={bugun}
              onChange={(e) => {
                setGun(e.target.value);
              }}
            />
          )}
        </Alan>
      ) : (
        <Alan etiket={t('gunlukSoru.gorevVer.sonTeslim')} hata={hata.gun}>
          {(o) => (
            <Girdi
              {...o}
              type="date"
              value={sonTeslim}
              min={bugun}
              onChange={(e) => {
                setSonTeslim(e.target.value);
              }}
            />
          )}
        </Alan>
      )}
      {mutasyon.error ? <Uyari>{hataMesaji(mutasyon.error)}</Uyari> : null}
      {!planVar && !odevVar ? <Uyari>{t('yerTutucu.yetkisizAciklama')}</Uyari> : null}
      <div className="flex flex-wrap gap-2">
        <Dugme type="submit" disabled={mutasyon.isPending || (!planVar && !odevVar)}>
          {mutasyon.isPending ? t('gunlukSoru.gorevVer.veriliyor') : t('gunlukSoru.gorevVer.onay')}
        </Dugme>
        <Dugme type="button" gorunum="ikincil" onClick={kapat}>
          {t('ortak.vazgec')}
        </Dugme>
      </div>
    </form>
  );
}
