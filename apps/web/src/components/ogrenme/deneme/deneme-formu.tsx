'use client';

import { DenemeSema } from '@kopru/contracts';
import { t } from '@kopru/i18n';
import { useMutation } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import { OgrenciSecimi } from '@/components/ogrenme/ortak';
import { Alan } from '@/components/operasyon/ortak';
import { Dugme } from '@/components/ui/button';
import { Girdi } from '@/components/ui/input';
import { Secim } from '@/components/ui/secim';
import { hataMesaji } from '@/lib/api';
import { ogrenmeIstek } from '@/lib/hesap-istek';
import { bolumDogrula, bosHesapla, netHesapla, netMetni } from '@/lib/ogrenme/net';
import { useDenemeKurallari, useOgrenciler, useOgrenmeYenile } from '@/lib/ogrenme/veri';
import { useSaatDilimi } from '@/lib/operasyon-verisi';
import { bugunYerel } from '@/lib/saat';

interface Hucre {
  dogru: string;
  yanlis: string;
  bos: string;
}

const BOS: Hucre = { dogru: '', yanlis: '', bos: '' };

/**
 * Tek ogrenci deneme girisi (ogretmen) ya da kendi sonucunu girme (ogrenci). Tur sec, bolum
 * dogru/yanlis/bos gir; net aninda gosterilir (yalniz onizleme; kayitli net sunucudan gelir).
 * `dogru + yanlis + bos = soru sayisi` alan bazinda dogrulanir; bos verilmezse hesaplanir.
 */
export function DenemeFormu({
  kurumId,
  ogrenciModu,
  bitti,
}: {
  kurumId: string;
  /** `true`: ogrenci kendi sonucunu girer (ogretmen onayina duser, ogrenci secimi yok). */
  ogrenciModu: boolean;
  bitti: (mesaj: string) => void;
}) {
  const kurallar = useDenemeKurallari(kurumId);
  const ogrenciler = useOgrenciler(kurumId, !ogrenciModu);
  const { saatDilimi } = useSaatDilimi(kurumId);
  const yenile = useOgrenmeYenile(kurumId);

  const [ogrenciId, setOgrenciId] = useState('');
  const [kod, setKod] = useState('');
  const [ad, setAd] = useState('');
  const [tarih, setTarih] = useState(() => bugunYerel(saatDilimi));
  const [yayinevi, setYayinevi] = useState('');
  const [hucreler, setHucreler] = useState<Record<string, Hucre>>({});
  const [hatalar, setHatalar] = useState<Record<string, string>>({});
  const [genelHata, setGenelHata] = useState<string | null>(null);

  const liste = useMemo(() => kurallar.data?.kurallar ?? [], [kurallar.data]);
  const kural = liste.find((k) => k.kod === (kod || liste[0]?.kod));
  const aktifKod = kural?.kod ?? '';

  const satirlar = useMemo(
    () =>
      (kural?.bolumler ?? []).map((b) => {
        const h = hucreler[`${aktifKod}:${b.bolum_kodu}`] ?? BOS;
        const hata = bolumDogrula(b.soru_sayisi, h.dogru, h.yanlis, h.bos);
        const bos = bosHesapla(b.soru_sayisi, h.dogru, h.yanlis);
        const net =
          hata === null && kural
            ? netHesapla(Number(h.dogru || 0), Number(h.yanlis || 0), kural.yanlis_katsayisi)
            : null;
        return { bolum: b, h, hata, bos, net };
      }),
    [kural, hucreler, aktifKod],
  );
  const toplam = satirlar.every((s) => s.net !== null)
    ? Math.round(satirlar.reduce((tt, s) => tt + (s.net ?? 0), 0) * 100) / 100
    : null;

  const guncelle = (bolumKodu: string, parca: Partial<Hucre>) => {
    setHucreler((o) => ({
      ...o,
      [`${aktifKod}:${bolumKodu}`]: { ...(o[`${aktifKod}:${bolumKodu}`] ?? BOS), ...parca },
    }));
  };

  const kaydet = useMutation({
    mutationFn: () =>
      ogrenmeIstek(`kurumlar/${kurumId}/denemeler`, {
        govde: {
          kural_kodu: aktifKod,
          ...(ogrenciModu ? {} : { ogrenci_id: ogrenciId }),
          ad: ad.trim(),
          sinav_tarihi: tarih,
          ...(yayinevi.trim() ? { yayinevi: yayinevi.trim() } : {}),
          bolumler: satirlar.map((s) => ({
            bolum_kodu: s.bolum.bolum_kodu,
            dogru: Number(s.h.dogru || 0),
            yanlis: Number(s.h.yanlis || 0),
            ...(s.h.bos.trim() === '' ? {} : { bos: Number(s.h.bos) }),
          })),
        },
        sema: DenemeSema,
      }),
    onSuccess: async (d) => {
      await yenile();
      setHucreler({});
      setAd('');
      bitti(
        ogrenciModu
          ? t('ogrenme.deneme.ogrenciGonderildi')
          : t('ogrenme.deneme.kaydedildi', { net: netMetni(d.toplam_net) }),
      );
    },
    onError: (h) => {
      setGenelHata(hataMesaji(h));
    },
  });

  const gonder = () => {
    setGenelHata(null);
    const h: Record<string, string> = {};
    if (!ogrenciModu && !ogrenciId) h.ogrenci = t('ogrenme.deneme.hata.ogrenci');
    if (!ad.trim()) h.ad = t('ogrenme.deneme.hata.ad');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(tarih)) h.tarih = t('ogrenme.deneme.hata.tarih');
    setHatalar(h);
    if (Object.keys(h).length > 0 || satirlar.some((s) => s.hata !== null)) return;
    kaydet.mutate();
  };

  return (
    <form
      noValidate
      aria-label={ogrenciModu ? t('ogrenme.deneme.sonucGir') : t('ogrenme.deneme.tekGiris')}
      onSubmit={(e) => {
        e.preventDefault();
        gonder();
      }}
      className="flex flex-col gap-4 rounded-buyuk border border-kenar bg-yuzey p-4"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {!ogrenciModu ? (
          <OgrenciSecimi
            deger={ogrenciId}
            degisti={setOgrenciId}
            ogrenciler={ogrenciler.liste}
            hata={hatalar.ogrenci}
          />
        ) : null}
        <Alan etiket={t('ogrenme.deneme.tur')}>
          {(o) => (
            <Secim
              {...o}
              value={aktifKod}
              onChange={(e) => {
                setKod(e.target.value);
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
        <Alan etiket={t('ogrenme.deneme.ad')} hata={hatalar.ad}>
          {(o) => (
            <Girdi
              {...o}
              value={ad}
              maxLength={200}
              placeholder={t('ogrenme.deneme.adYer')}
              onChange={(e) => {
                setAd(e.target.value);
              }}
            />
          )}
        </Alan>
        <Alan etiket={t('ogrenme.deneme.tarih')} hata={hatalar.tarih}>
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
        <Alan etiket={t('ogrenme.deneme.yayinevi')}>
          {(o) => (
            <Girdi
              {...o}
              value={yayinevi}
              maxLength={200}
              onChange={(e) => {
                setYayinevi(e.target.value);
              }}
            />
          )}
        </Alan>
      </div>

      {kural ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] text-left text-sm">
            <caption className="mb-2 text-left text-sm text-metin-ikincil">
              {t('ogrenme.deneme.bolumlerAciklama', {
                katsayi: String(kural.yanlis_katsayisi).replace('.', ','),
              })}
            </caption>
            <thead className="text-xs uppercase tracking-wide text-metin-ikincil">
              <tr>
                <th scope="col" className="py-2 pr-3 font-medium">
                  {t('ogrenme.deneme.bolum')}
                </th>
                <th scope="col" className="py-2 pr-3 font-medium">
                  {t('ogrenme.deneme.dogru')}
                </th>
                <th scope="col" className="py-2 pr-3 font-medium">
                  {t('ogrenme.deneme.yanlis')}
                </th>
                <th scope="col" className="py-2 pr-3 font-medium">
                  {t('ogrenme.deneme.bos')}
                </th>
                <th scope="col" className="py-2 font-medium">
                  {t('ogrenme.deneme.net')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-kenar">
              {satirlar.map((s) => {
                const b = s.bolum;
                const hataId = `hata-${b.bolum_kodu}`;
                const alan = (anahtar: keyof Hucre, etiket: string, yer?: string) => (
                  <Girdi
                    inputMode="numeric"
                    className="h-10 w-20"
                    aria-label={`${b.ad} ${etiket}`}
                    aria-invalid={s.hata ? true : undefined}
                    aria-describedby={s.hata ? hataId : undefined}
                    value={s.h[anahtar]}
                    {...(yer ? { placeholder: yer } : {})}
                    onChange={(e) => {
                      guncelle(b.bolum_kodu, { [anahtar]: e.target.value });
                    }}
                  />
                );
                return (
                  <tr key={b.bolum_kodu} className="align-top">
                    <th scope="row" className="py-2 pr-3 font-medium">
                      {b.ad}
                      <span className="block text-xs font-normal text-metin-ikincil">
                        {t('ogrenme.deneme.soruSayisi', { n: b.soru_sayisi })}
                      </span>
                      {s.hata ? (
                        <span
                          id={hataId}
                          role="alert"
                          className="block text-xs font-normal text-hata"
                        >
                          {t(`ogrenme.deneme.bolumHata.${s.hata}`, { n: b.soru_sayisi })}
                        </span>
                      ) : null}
                    </th>
                    <td className="py-2 pr-3">{alan('dogru', t('ogrenme.deneme.dogru'))}</td>
                    <td className="py-2 pr-3">{alan('yanlis', t('ogrenme.deneme.yanlis'))}</td>
                    <td className="py-2 pr-3">
                      {alan('bos', t('ogrenme.deneme.bos'), s.bos === null ? '' : String(s.bos))}
                    </td>
                    <td className="py-2.5 font-medium" aria-live="polite">
                      {s.net === null ? '-' : netMetni(s.net)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="border-t border-kenar">
              <tr className="font-semibold">
                <th scope="row" className="py-2.5 pr-3" colSpan={4}>
                  {t('ogrenme.deneme.toplamNet')}
                </th>
                <td className="py-2.5" data-testid="toplam-net" aria-live="polite">
                  {toplam === null ? '-' : netMetni(toplam)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : null}

      {genelHata ? (
        <p role="alert" className="text-sm text-hata">
          {genelHata}
        </p>
      ) : null}
      <div className="flex justify-end">
        <Dugme type="submit" disabled={kaydet.isPending || !kural}>
          {kaydet.isPending
            ? t('ortak.yukleniyor')
            : ogrenciModu
              ? t('ogrenme.deneme.onayaGonder')
              : t('ogrenme.deneme.kaydet')}
        </Dugme>
      </div>
    </form>
  );
}
