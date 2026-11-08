'use client';

import { DAVET_TOPLU_AZAMI, DavetTopluYanitSema, GrupListeYanitSema } from '@kopru/contracts';
import { t, type MessageKey } from '@kopru/i18n';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useId, useMemo, useState } from 'react';
import type { z } from 'zod';

import { KopyalaDugmesi } from '../ortak';
import { davetBaglantisi, type DavetKanali, type DavetRolu } from './davet-formu';

import { Dugme } from '@/components/ui/button';
import { Etiket } from '@/components/ui/input';
import { Pencere } from '@/components/ui/pencere';
import { Rozet } from '@/components/ui/rozet';
import { Secim } from '@/components/ui/secim';
import { Uyari } from '@/components/ui/uyari';
import { hataMesaji } from '@/lib/api';
import { hesapIstek } from '@/lib/hesap-istek';
import { useSayfaliSorgu } from '@/lib/sayfali-sorgu';
import { trSirala } from '@/lib/sirala';

export interface TopluSatir {
  ad: string;
  telefon: string;
}

/**
 * Yapistirilan metni satirlara ayirir: her satir "ad, telefon" (virgul, noktali virgul ya da sekme).
 * Telefon, satirdaki son parcadir; bos satirlar atlanir. Hata ayiklama `api`ya birakilir.
 */
export function topluSatirlariAyir(metin: string): TopluSatir[] {
  return metin
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((satir) => {
      const parcalar = satir
        .split(/[,;\t]/)
        .map((p) => p.trim())
        .filter(Boolean);
      const son = parcalar.at(-1) ?? '';
      if (parcalar.length > 1 && /\d{7,}/.test(son.replace(/\D/g, ''))) {
        return { ad: parcalar.slice(0, -1).join(' '), telefon: son };
      }
      // Tek parca: yalniz rakamlardan olusuyorsa telefon, degilse ad kabul edilir.
      return /^[\d\s()+-]{7,}$/.test(satir)
        ? { ad: '', telefon: satir }
        : { ad: satir, telefon: '' };
    });
}

type TopluYanit = z.output<typeof DavetTopluYanitSema>;

export function TopluDavet({
  acik,
  degisti,
  kurumId,
  roller,
  grupSecilebilir,
}: {
  acik: boolean;
  degisti: (a: boolean) => void;
  kurumId: string;
  roller: readonly DavetRolu[];
  grupSecilebilir: boolean;
}) {
  // Pencere kapaninca icerik kaldirilir; alanlar her acilista yeniden kurulur.
  return (
    <Pencere
      acik={acik}
      degisti={degisti}
      genis
      baslik={t('hesap.davet.topluForm.baslik')}
      aciklama={t('hesap.davet.topluForm.aciklama', { azami: DAVET_TOPLU_AZAMI })}
    >
      <TopluIcerik
        degisti={degisti}
        kurumId={kurumId}
        roller={roller}
        grupSecilebilir={grupSecilebilir}
      />
    </Pencere>
  );
}

function TopluIcerik({
  degisti,
  kurumId,
  roller,
  grupSecilebilir,
}: {
  degisti: (a: boolean) => void;
  kurumId: string;
  roller: readonly DavetRolu[];
  grupSecilebilir: boolean;
}) {
  const qc = useQueryClient();
  const kimlik = useId();
  const [metin, setMetin] = useState('');
  const [kanal, setKanal] = useState<Extract<DavetKanali, 'sms' | 'baglanti'>>('sms');
  const [rol, setRol] = useState<DavetRolu>(roller[0] ?? 'ogrenci');
  const [grupId, setGrupId] = useState('');
  const [yerel, setYerel] = useState<string | null>(null);
  const [sonuc, setSonuc] = useState<{ satirlar: TopluSatir[]; yanit: TopluYanit } | null>(null);

  const satirlar = useMemo(() => topluSatirlariAyir(metin), [metin]);

  const gruplar = useSayfaliSorgu({
    anahtar: ['hesap', kurumId, 'gruplar'],
    yol: `kurumlar/${kurumId}/gruplar`,
    sema: GrupListeYanitSema,
    sorgu: { durum: 'aktif' },
    etkin: grupSecilebilir && rol === 'ogrenci',
  });
  const grupListesi = useMemo(
    () => trSirala(gruplar.data?.pages.flatMap((s) => s.gruplar) ?? [], (g) => g.ad),
    [gruplar.data],
  );

  const gonder = useMutation({
    mutationFn: (gonderilen: TopluSatir[]) =>
      hesapIstek(`kurumlar/${kurumId}/davetler/toplu`, {
        sema: DavetTopluYanitSema,
        govde: {
          davetler: gonderilen.map((s) => ({
            kanal,
            rol,
            ...(kanal === 'sms' ? { telefon: s.telefon } : {}),
            ...(s.ad ? { hedef_ad: s.ad } : {}),
            ...(rol === 'ogrenci' && grupId ? { grup_id: grupId } : {}),
          })),
        },
      }),
    onSuccess: (yanit, gonderilen) => {
      void qc.invalidateQueries({ queryKey: ['hesap', kurumId, 'davetler'] });
      setSonuc({ satirlar: gonderilen, yanit });
    },
    onError: (e) => {
      setYerel(hataMesaji(e));
    },
  });

  function onayla(olay: React.SyntheticEvent) {
    olay.preventDefault();
    setYerel(null);
    if (satirlar.length === 0) {
      setYerel(t('hesap.davet.topluForm.bosSatir'));
      return;
    }
    if (satirlar.length > DAVET_TOPLU_AZAMI) {
      setYerel(t('hesap.davet.topluForm.cokSatir', { azami: DAVET_TOPLU_AZAMI }));
      return;
    }
    gonder.mutate(satirlar);
  }

  return (
    <>
      {sonuc ? (
        <TopluSonuc
          sonuc={sonuc}
          kapat={() => {
            degisti(false);
          }}
          yeniden={() => {
            setSonuc(null);
            setMetin('');
          }}
        />
      ) : (
        <form onSubmit={onayla} noValidate className="flex flex-col gap-4">
          {yerel ? <Uyari>{yerel}</Uyari> : null}
          <div className="flex flex-col gap-1.5">
            <Etiket htmlFor={`${kimlik}-metin`}>{t('hesap.davet.topluForm.satirlar')}</Etiket>
            <textarea
              id={`${kimlik}-metin`}
              rows={8}
              value={metin}
              placeholder={t('hesap.davet.topluForm.satirlarYer')}
              spellCheck={false}
              onChange={(e) => {
                setMetin(e.target.value);
              }}
              className="w-full rounded-orta border border-kenar bg-yuzey px-3 py-2 font-mono text-sm text-metin placeholder:text-metin-ikincil/70"
            />
            <p className="text-sm text-metin-ikincil" aria-live="polite">
              {t('hesap.davet.topluForm.satirSayisi', { n: satirlar.length })}
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <Etiket htmlFor={`${kimlik}-kanal`}>{t('hesap.davet.topluForm.kanal')}</Etiket>
              <Secim
                id={`${kimlik}-kanal`}
                value={kanal}
                onChange={(e) => {
                  setKanal(e.target.value as 'sms' | 'baglanti');
                }}
              >
                <option value="sms">{t('hesap.davet.kanal.sms')}</option>
                <option value="baglanti">{t('hesap.davet.kanal.baglanti')}</option>
              </Secim>
            </div>
            {roller.length > 1 ? (
              <div className="flex flex-col gap-1.5">
                <Etiket htmlFor={`${kimlik}-rol`}>{t('hesap.davet.form.rol')}</Etiket>
                <Secim
                  id={`${kimlik}-rol`}
                  value={rol}
                  onChange={(e) => {
                    setRol(e.target.value as DavetRolu);
                  }}
                >
                  {roller.map((r) => (
                    <option key={r} value={r}>
                      {t(`hesap.davet.rol.${r}`)}
                    </option>
                  ))}
                </Secim>
              </div>
            ) : null}
            {grupSecilebilir && rol === 'ogrenci' ? (
              <div className="flex flex-col gap-1.5">
                <Etiket htmlFor={`${kimlik}-grup`}>{t('hesap.davet.form.grup')}</Etiket>
                <Secim
                  id={`${kimlik}-grup`}
                  value={grupId}
                  onChange={(e) => {
                    setGrupId(e.target.value);
                  }}
                >
                  <option value="">{t('hesap.davet.form.grupYok')}</option>
                  {grupListesi.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.ad}
                    </option>
                  ))}
                </Secim>
              </div>
            ) : null}
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Dugme
              type="button"
              gorunum="ikincil"
              onClick={() => {
                degisti(false);
              }}
            >
              {t('hesap.ortak.vazgec')}
            </Dugme>
            <Dugme type="submit" disabled={gonder.isPending || satirlar.length === 0}>
              {gonder.isPending
                ? t('hesap.davet.topluForm.gonderiliyor')
                : t('hesap.davet.topluForm.gonder', { n: satirlar.length })}
            </Dugme>
          </div>
        </form>
      )}
    </>
  );
}

function adVeyaYok(ad: string | undefined, yedek: string): string {
  return ad === undefined || ad === '' ? yedek : ad;
}

function hataMetni(kod: string | null, mesaj: string | null): string {
  if (kod) {
    const anahtar = `hesap.davet.topluForm.hataKodu.${kod}`;
    const metin = t(anahtar as MessageKey);
    if (metin !== anahtar) return metin;
  }
  return mesaj ?? t('ortak.hataGenel');
}

function TopluSonuc({
  sonuc,
  kapat,
  yeniden,
}: {
  sonuc: { satirlar: TopluSatir[]; yanit: TopluYanit };
  kapat: () => void;
  yeniden: () => void;
}) {
  const { yanit, satirlar } = sonuc;
  const hepsi = yanit.sonuclar
    .filter((s) => s.durum === 'basarili' && s.belirtec)
    .map((s) => {
      const satir = satirlar[s.sira];
      return `${adVeyaYok(satir?.ad, t('hesap.davet.topluForm.satirNo', { n: s.sira + 1 }))}\t${davetBaglantisi(s.belirtec ?? '')}`;
    })
    .join('\n');

  return (
    <div className="flex flex-col gap-4">
      <p role="status" className="text-sm font-medium">
        {t('hesap.davet.topluForm.ozet', {
          basarili: yanit.basarili_sayisi,
          hata: yanit.hata_sayisi,
        })}
      </p>
      <div className="rounded-orta border border-kenar">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">{t('hesap.davet.topluForm.sonucBaslik')}</caption>
          <thead className="border-b border-kenar bg-yuzey-ikincil text-metin-ikincil">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">
                #
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                {t('hesap.davet.form.hedefAd')}
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                {t('hesap.ortak.durum')}
              </th>
              <th scope="col" className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-kenar">
            {yanit.sonuclar.map((s) => {
              const satir = satirlar[s.sira];
              return (
                <tr key={s.sira}>
                  <td className="px-3 py-2 text-metin-ikincil">{s.sira + 1}</td>
                  <td className="px-3 py-2">
                    <span className="block">{adVeyaYok(satir?.ad, '—')}</span>
                    <span className="block text-xs text-metin-ikincil">{satir?.telefon}</span>
                  </td>
                  <td className="px-3 py-2">
                    {s.durum === 'basarili' ? (
                      <Rozet ton="basari">{t('hesap.davet.topluForm.basarili')}</Rozet>
                    ) : (
                      <>
                        <Rozet ton="hata">{t('hesap.davet.topluForm.hataSatiri')}</Rozet>
                        <span className="mt-1 block text-xs text-hata">
                          {hataMetni(s.hata_kodu, s.hata_mesaji)}
                        </span>
                      </>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {s.durum === 'basarili' && s.belirtec ? (
                      <KopyalaDugmesi
                        metin={davetBaglantisi(s.belirtec)}
                        etiket={t('hesap.davet.sonuc.baglantiKopyala')}
                        gorunum="hayalet"
                      />
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-sm text-metin-ikincil">{t('hesap.davet.sonuc.baglantiUyari')}</p>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Dugme gorunum="hayalet" onClick={yeniden}>
          {t('hesap.davet.topluForm.yeniden')}
        </Dugme>
        <Dugme gorunum="ikincil" onClick={kapat}>
          {t('hesap.davet.sonuc.tamam')}
        </Dugme>
        {hepsi ? (
          <KopyalaDugmesi
            metin={hepsi}
            etiket={t('hesap.davet.topluForm.tumBaglantilar')}
            gorunum="birincil"
            boyut="md"
          />
        ) : null}
      </div>
    </div>
  );
}
