'use client';

import { DenemeTopluYanitSema, type DenemeSatirHatasi } from '@kopru/contracts';
import { t } from '@kopru/i18n';
import { useMutation } from '@tanstack/react-query';
import { Users } from 'lucide-react';
import { useMemo, useState } from 'react';

import { BosDurum } from '@/components/bos-durum';
import { Alan } from '@/components/operasyon/ortak';
import { Dugme } from '@/components/ui/button';
import { Girdi } from '@/components/ui/input';
import { Secim } from '@/components/ui/secim';
import { UygulamaHatasi, hataMesaji } from '@/lib/api';
import { ogrenmeIstek } from '@/lib/hesap-istek';
import {
  bosHucre,
  hucreHareketi,
  satirDolu,
  satirHatalari,
  satirNeti,
  tabloGonderimi,
  type TabloSatiri,
} from '@/lib/ogrenme/deneme-tablo';
import { netMetni } from '@/lib/ogrenme/net';
import { useDenemeKurallari, useGrupOgrencileri, useOgrenmeYenile } from '@/lib/ogrenme/veri';
import { useGruplar, useSaatDilimi } from '@/lib/operasyon-verisi';
import { bugunYerel } from '@/lib/saat';

/** Sunucunun satir hatalari (`details.hatalar`) ya da bos dizi. */
export function satirHatalariniCoz(hata: unknown): DenemeSatirHatasi[] {
  if (!(hata instanceof UygulamaHatasi) || hata.kod !== 'toplu_giris_hatali') return [];
  const d = hata.detaylar as { hatalar?: DenemeSatirHatasi[] } | undefined;
  return Array.isArray(d?.hatalar) ? d.hatalar : [];
}

/**
 * Grup icin tablo gorunumunde hizli giris: satir = ogrenci, sutun = bolum dogru/yanlis. Klavye ile
 * hucre gezinme (oklar, Enter asagi, Shift+Enter yukari, Tab sagdaki hucre). Bos satirlar atlanir;
 * dolu satirlar tek istekte, hepsi ya da hic kaydedilir.
 */
export function TabloGiris({
  kurumId,
  bitti,
}: {
  kurumId: string;
  bitti: (mesaj: string) => void;
}) {
  const gruplar = useGruplar(kurumId);
  const kurallar = useDenemeKurallari(kurumId);
  const { saatDilimi } = useSaatDilimi(kurumId);
  const yenile = useOgrenmeYenile(kurumId);
  const [grupId, setGrupId] = useState('');
  const [kod, setKod] = useState('');
  const [ad, setAd] = useState('');
  const [tarih, setTarih] = useState(() => bugunYerel(saatDilimi));
  const uyeler = useGrupOgrencileri(kurumId, grupId);
  const [veri, setVeri] = useState<Record<string, TabloSatiri>>({});
  const [adHatasi, setAdHatasi] = useState<string | undefined>();
  const [genelHata, setGenelHata] = useState<string | null>(null);
  const [sunucuHatalari, setSunucuHatalari] = useState<DenemeSatirHatasi[]>([]);

  const liste = useMemo(() => kurallar.data?.kurallar ?? [], [kurallar.data]);
  const kural = liste.find((k) => k.kod === (kod || liste[0]?.kod));
  const ogrenciler = useMemo(() => uyeler.data?.uyeler ?? [], [uyeler.data]);
  const bolumler = kural?.bolumler ?? [];
  const sutunSayisi = bolumler.length * 2;

  const hucre = (ogrenciId: string, bolumKodu: string) => veri[ogrenciId]?.[bolumKodu] ?? bosHucre;
  const yaz = (ogrenciId: string, bolumKodu: string, alan: 'dogru' | 'yanlis', deger: string) => {
    setVeri((o) => ({
      ...o,
      [ogrenciId]: {
        ...(o[ogrenciId] ?? {}),
        [bolumKodu]: { ...(o[ogrenciId]?.[bolumKodu] ?? bosHucre), [alan]: deger },
      },
    }));
  };

  const gonderim = kural ? tabloGonderimi(kural, veri) : { satirlar: [], hatali: [] };
  const doluSayisi = Object.values(veri).filter(satirDolu).length;

  const kaydet = useMutation({
    mutationFn: () =>
      ogrenmeIstek(`kurumlar/${kurumId}/denemeler/toplu`, {
        govde: {
          kural_kodu: kural?.kod,
          ad: ad.trim(),
          sinav_tarihi: tarih,
          satirlar: gonderim.satirlar,
        },
        sema: DenemeTopluYanitSema,
      }),
    onSuccess: async (r) => {
      await yenile();
      setVeri({});
      setSunucuHatalari([]);
      bitti(t('ogrenme.deneme.topluKaydedildi', { n: r.olusturulan_sayisi }));
    },
    onError: (h) => {
      const satir = satirHatalariniCoz(h);
      setSunucuHatalari(satir);
      setGenelHata(satir.length > 0 ? t('ogrenme.deneme.topluHatali') : hataMesaji(h));
    },
  });

  const gonder = () => {
    setGenelHata(null);
    setSunucuHatalari([]);
    if (!ad.trim()) {
      setAdHatasi(t('ogrenme.deneme.hata.ad'));
      return;
    }
    setAdHatasi(undefined);
    if (gonderim.hatali.length > 0) {
      setGenelHata(t('ogrenme.deneme.topluYerelHata', { n: gonderim.hatali.length }));
      return;
    }
    if (gonderim.satirlar.length === 0) {
      setGenelHata(t('ogrenme.deneme.topluBos'));
      return;
    }
    kaydet.mutate();
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 rounded-buyuk border border-kenar bg-yuzey p-4 sm:grid-cols-2 lg:grid-cols-4">
        <Alan etiket={t('ogrenme.odev.grup')}>
          {(o) => (
            <Secim
              {...o}
              value={grupId}
              onChange={(e) => {
                setGrupId(e.target.value);
                setVeri({});
                setSunucuHatalari([]);
              }}
            >
              <option value="">{t('ogrenme.odev.grupSec')}</option>
              {gruplar.secenekler.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.etiket}
                </option>
              ))}
            </Secim>
          )}
        </Alan>
        <Alan etiket={t('ogrenme.deneme.tur')}>
          {(o) => (
            <Secim
              {...o}
              value={kural?.kod ?? ''}
              onChange={(e) => {
                setKod(e.target.value);
                setVeri({});
              }}
            >
              {liste.map((k) => (
                <option key={k.id} value={k.kod}>
                  {k.ad}
                </option>
              ))}
            </Secim>
          )}
        </Alan>
        <Alan etiket={t('ogrenme.deneme.ad')} hata={adHatasi}>
          {(o) => (
            <Girdi
              {...o}
              value={ad}
              maxLength={200}
              onChange={(e) => {
                setAd(e.target.value);
              }}
            />
          )}
        </Alan>
        <Alan etiket={t('ogrenme.deneme.tarih')}>
          {(o) => (
            <Girdi
              {...o}
              type="date"
              value={tarih}
              onChange={(e) => {
                setTarih(e.target.value);
              }}
            />
          )}
        </Alan>
      </div>

      {grupId === '' ? (
        <section className="rounded-buyuk border border-kenar bg-yuzey">
          <BosDurum
            className="py-14"
            ikon={Users}
            baslik={t('ogrenme.deneme.grupSec')}
            aciklama={t('ogrenme.deneme.grupSecAciklama')}
          />
        </section>
      ) : uyeler.isPending ? (
        <p role="status" className="text-sm text-metin-ikincil">
          {t('ortak.yukleniyor')}
        </p>
      ) : uyeler.isError ? (
        <p role="alert" className="text-sm text-hata">
          {hataMesaji(uyeler.error)}
        </p>
      ) : ogrenciler.length === 0 ? (
        <section className="rounded-buyuk border border-kenar bg-yuzey">
          <BosDurum
            className="py-14"
            ikon={Users}
            baslik={t('ogrenme.deneme.grupBos')}
            aciklama={t('ogrenme.deneme.grupBosAciklama')}
          />
        </section>
      ) : (
        <div className="overflow-x-auto rounded-buyuk border border-kenar bg-yuzey">
          <table className="w-full border-collapse text-left text-sm">
            <caption className="p-3 text-left text-sm text-metin-ikincil">
              {t('ogrenme.deneme.tabloAciklama')}
            </caption>
            <thead className="text-xs uppercase tracking-wide text-metin-ikincil">
              <tr>
                <th
                  scope="col"
                  rowSpan={2}
                  className="sticky left-0 z-10 min-w-40 bg-yuzey px-3 py-2 font-medium"
                >
                  {t('ogrenme.ortak.ogrenci')}
                </th>
                {bolumler.map((b) => (
                  <th
                    key={b.bolum_kodu}
                    scope="colgroup"
                    colSpan={2}
                    className="border-l border-kenar px-2 py-2 text-center font-medium"
                  >
                    {b.ad}
                    <span className="block text-[0.7rem] normal-case">
                      {t('ogrenme.deneme.soruSayisi', { n: b.soru_sayisi })}
                    </span>
                  </th>
                ))}
                <th scope="col" rowSpan={2} className="border-l border-kenar px-3 py-2 font-medium">
                  {t('ogrenme.deneme.toplamNet')}
                </th>
              </tr>
              <tr>
                {bolumler.flatMap((b) => [
                  <th
                    key={`${b.bolum_kodu}-d`}
                    scope="col"
                    className="border-l border-kenar px-2 py-1 text-center font-medium"
                  >
                    {t('ogrenme.deneme.dogruKisa')}
                  </th>,
                  <th
                    key={`${b.bolum_kodu}-y`}
                    scope="col"
                    className="px-2 py-1 text-center font-medium"
                  >
                    {t('ogrenme.deneme.yanlisKisa')}
                  </th>,
                ])}
              </tr>
            </thead>
            <tbody className="divide-y divide-kenar">
              {ogrenciler.map((u, satir) => {
                const s = veri[u.ogrenci_id] ?? {};
                const hatalar = kural ? satirHatalari(kural, s) : {};
                const sunucu = sunucuHatalari.find((h) => h.ogrenci_id === u.ogrenci_id);
                const net = kural ? satirNeti(kural, s) : null;
                return (
                  <tr
                    key={u.ogrenci_id}
                    aria-invalid={Object.keys(hatalar).length > 0 || sunucu ? true : undefined}
                  >
                    <th scope="row" className="sticky left-0 z-10 bg-yuzey px-3 py-1.5 font-medium">
                      {u.gorunen_ad ?? '-'}
                      {sunucu ? (
                        <span role="alert" className="block text-xs font-normal text-hata">
                          {sunucu.mesaj}
                        </span>
                      ) : null}
                    </th>
                    {bolumler.flatMap((b, bi) =>
                      (['dogru', 'yanlis'] as const).map((alan, ai) => {
                        const sutun = bi * 2 + ai;
                        const hata = hatalar[b.bolum_kodu];
                        return (
                          <td
                            key={`${b.bolum_kodu}-${alan}`}
                            className={`px-1 py-1 ${ai === 0 ? 'border-l border-kenar' : ''}`}
                          >
                            <Girdi
                              inputMode="numeric"
                              className="h-9 w-14 px-2 text-center"
                              data-satir={satir}
                              data-sutun={sutun}
                              aria-label={t('ogrenme.deneme.hucreEtiket', {
                                ad: u.gorunen_ad ?? '',
                                bolum: b.ad,
                                alan: t(
                                  alan === 'dogru'
                                    ? 'ogrenme.deneme.dogru'
                                    : 'ogrenme.deneme.yanlis',
                                ),
                              })}
                              aria-invalid={hata ? true : undefined}
                              title={
                                hata
                                  ? t(`ogrenme.deneme.bolumHata.${hata}`, { n: b.soru_sayisi })
                                  : undefined
                              }
                              value={hucre(u.ogrenci_id, b.bolum_kodu)[alan]}
                              onChange={(e) => {
                                yaz(u.ogrenci_id, b.bolum_kodu, alan, e.target.value);
                              }}
                              onKeyDown={(e) => {
                                if (
                                  ![
                                    'ArrowDown',
                                    'ArrowUp',
                                    'ArrowLeft',
                                    'ArrowRight',
                                    'Enter',
                                  ].includes(e.key)
                                )
                                  return;
                                const girdi = e.currentTarget;
                                // Yatay oklar yalniz imlec metnin ucundaysa hucre degistirir.
                                if (
                                  (e.key === 'ArrowLeft' && girdi.selectionStart !== 0) ||
                                  (e.key === 'ArrowRight' &&
                                    girdi.selectionEnd !== girdi.value.length)
                                ) {
                                  return;
                                }
                                e.preventDefault();
                                const yeni = hucreHareketi(
                                  { satir, sutun },
                                  e.key,
                                  ogrenciler.length,
                                  sutunSayisi,
                                  e.shiftKey,
                                );
                                girdi
                                  .closest('table')
                                  ?.querySelector<HTMLInputElement>(
                                    `input[data-satir="${String(yeni.satir)}"][data-sutun="${String(yeni.sutun)}"]`,
                                  )
                                  ?.focus();
                              }}
                            />
                          </td>
                        );
                      }),
                    )}
                    <td
                      className="border-l border-kenar px-3 py-1.5 font-medium"
                      aria-live="polite"
                    >
                      {net === null ? '-' : netMetni(net)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {genelHata ? (
        <div
          role="alert"
          className="flex flex-col gap-2 rounded-orta bg-hata-yumusak px-3 py-2.5 text-sm text-hata"
        >
          <p>{genelHata}</p>
          {sunucuHatalari.length > 0 ? (
            <ul className="list-disc pl-5">
              {sunucuHatalari.map((h, i) => (
                <li key={`${String(h.satir)}-${String(i)}`}>
                  {t('ogrenme.deneme.satirHatasi', {
                    ad:
                      ogrenciler.find((u) => u.ogrenci_id === h.ogrenci_id)?.gorunen_ad ??
                      String(h.satir + 1),
                    mesaj: h.mesaj,
                  })}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {grupId !== '' && ogrenciler.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-metin-ikincil" aria-live="polite">
            {t('ogrenme.deneme.doluSatir', { n: doluSayisi, toplam: ogrenciler.length })}
          </p>
          <Dugme disabled={kaydet.isPending || !kural} onClick={gonder}>
            {kaydet.isPending ? t('ortak.yukleniyor') : t('ogrenme.deneme.topluKaydet')}
          </Dugme>
        </div>
      ) : null}
    </div>
  );
}
