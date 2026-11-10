'use client';

import { OdevSema } from '@kopru/contracts';
import { t } from '@kopru/i18n';
import { useMutation } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import { KonuSecici } from '@/components/ogrenme/konu-secici';
import { OgrenciSecimi } from '@/components/ogrenme/ortak';
import { Alan } from '@/components/operasyon/ortak';
import { Dugme } from '@/components/ui/button';
import { Girdi } from '@/components/ui/input';
import { Pencere } from '@/components/ui/pencere';
import { Secim } from '@/components/ui/secim';
import { hataMesaji } from '@/lib/api';
import { bransAdi, siraliBransler } from '@/lib/bransler';
import { ogrenmeIstek } from '@/lib/hesap-istek';
import { odevFormunuDogrula, type OdevFormDegeri, type OdevHedefTuru } from '@/lib/ogrenme/odev';
import { useOdevSablonlari, useOgrenciler, useOgrenmeYenile } from '@/lib/ogrenme/veri';
import { useGruplar, useSaatDilimi } from '@/lib/operasyon-verisi';
import { bugunYerel, tarihEkle, yerelUtc } from '@/lib/saat';

const TURLER = ['soru', 'sayfa', 'serbest'] as const;

/**
 * Yeni odev formu: varsayilanlar dolu (grup, bir hafta sonrasi, soru turu); konu secici 2 etkilesim.
 * "Yayinla" odevi olusturup yayinlar, "Taslak kaydet" yalniz olusturur.
 */
export function OdevFormu({
  kurumId,
  genisHedef,
  baslangic,
  kapat,
  bitti,
}: {
  kurumId: string;
  /** Sahip/yonetici: tum kuruma verebilir. */
  genisHedef: boolean;
  /** Sablondan ya da kopyadan on dolum. */
  baslangic?: Partial<OdevFormDegeri>;
  kapat: () => void;
  bitti: (mesaj: string) => void;
}) {
  const { saatDilimi } = useSaatDilimi(kurumId);
  const gruplar = useGruplar(kurumId);
  const ogrenciler = useOgrenciler(kurumId);
  const sablonlar = useOdevSablonlari(kurumId);
  const yenile = useOgrenmeYenile(kurumId);
  const bugun = bugunYerel(saatDilimi);

  const ilkGrup = gruplar.secenekler.find((g) => g.tur !== 'birebir')?.id ?? '';
  const [f, setF] = useState<OdevFormDegeri>({
    hedefTuru: 'grup',
    hedefId: '',
    brans: 'matematik',
    konuId: null,
    baslik: '',
    baslikElle: false,
    tur: 'soru',
    kaynak: '',
    sonTeslim: tarihEkle(bugun, 7),
    hedefSayi: '20',
    ...baslangic,
  });
  const [hatalar, setHatalar] = useState<Record<string, string>>({});
  const [genelHata, setGenelHata] = useState<string | null>(null);
  const [sablonAdi, setSablonAdi] = useState<string | null>(null);

  const guncelle = (parca: Partial<OdevFormDegeri>) => {
    setF((o) => ({ ...o, ...parca }));
  };
  // Grup listesi yuklenince ilk grup varsayilan olur (kullanici baska bir sey secmediyse).
  const hedefId = f.hedefTuru === 'grup' && f.hedefId === '' ? ilkGrup : f.hedefId;
  const baslik = f.baslikElle
    ? f.baslik
    : f.baslik || t('ogrenme.odev.baslikOtomatik', { ders: bransAdi(f.brans) });

  const hedefSecenekleri: readonly OdevHedefTuru[] = genisHedef
    ? ['grup', 'ogrenci', 'kurum']
    : ['grup', 'ogrenci'];

  const gonderim = useMemo(
    () => ({
      baslik: baslik.trim(),
      brans_kodu: f.brans,
      tur: f.tur,
      hedef_turu: f.hedefTuru,
      ...(f.hedefTuru === 'kurum' ? {} : { hedef_id: hedefId }),
      ...(f.konuId ? { konu_id: f.konuId } : {}),
      ...(f.kaynak.trim() ? { kaynak: f.kaynak.trim() } : {}),
      ...(f.sonTeslim ? { son_teslim_at: yerelUtc(f.sonTeslim, '23:59', saatDilimi) } : {}),
      ...(f.tur === 'soru' && f.hedefSayi ? { hedef_soru_sayisi: Number(f.hedefSayi) } : {}),
    }),
    [baslik, f, hedefId, saatDilimi],
  );

  const kaydet = useMutation({
    mutationFn: async (yayinla: boolean) => {
      const odev = await ogrenmeIstek(`kurumlar/${kurumId}/odevler`, {
        govde: gonderim,
        sema: OdevSema,
      });
      if (yayinla) {
        await ogrenmeIstek(`kurumlar/${kurumId}/odevler/${odev.id}/yayinla`, { yontem: 'POST' });
      }
      return odev;
    },
    onSuccess: async (_, yayinla) => {
      await yenile();
      bitti(t(yayinla ? 'ogrenme.odev.yayinlandi' : 'ogrenme.odev.taslakKaydedildi'));
    },
    onError: (h) => {
      setGenelHata(hataMesaji(h));
    },
  });

  const sablonKaydet = useMutation({
    mutationFn: () =>
      ogrenmeIstek(`kurumlar/${kurumId}/odev-sablonlari`, {
        govde: {
          baslik: baslik.trim(),
          brans_kodu: f.brans,
          tur: f.tur,
          ...(f.konuId ? { konu_id: f.konuId } : {}),
          ...(f.kaynak.trim() ? { kaynak: f.kaynak.trim() } : {}),
          ...(f.tur === 'soru' && f.hedefSayi ? { hedef_soru_sayisi: Number(f.hedefSayi) } : {}),
        },
      }),
    onSuccess: async () => {
      await yenile();
      setSablonAdi(baslik.trim());
    },
    onError: (h) => {
      setGenelHata(hataMesaji(h));
    },
  });

  const dogrula = (): boolean => {
    const h = odevFormunuDogrula({ ...f, hedefId, baslik }, bugun);
    setHatalar(h);
    return Object.keys(h).length === 0;
  };

  const gonder = (yayinla: boolean) => {
    setGenelHata(null);
    if (dogrula()) kaydet.mutate(yayinla);
  };

  const sablonUygula = (id: string) => {
    const s = sablonlar.data?.sablonlar.find((x) => x.id === id);
    if (!s) return;
    guncelle({
      baslik: s.baslik,
      baslikElle: true,
      brans: s.brans_kodu,
      konuId: s.konu_id,
      tur: s.tur,
      kaynak: s.kaynak ?? '',
      hedefSayi: s.hedef_soru_sayisi ? String(s.hedef_soru_sayisi) : '',
    });
  };

  return (
    <Pencere
      acik
      genis
      degisti={(a) => {
        if (!a) kapat();
      }}
      baslik={t('ogrenme.odev.yeni')}
      aciklama={t('ogrenme.odev.formAciklama')}
    >
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          gonder(true);
        }}
        className="flex flex-col gap-4"
      >
        {(sablonlar.data?.sablonlar.length ?? 0) > 0 ? (
          <Alan etiket={t('ogrenme.odev.sablondanDoldur')}>
            {(o) => (
              <Secim
                {...o}
                value=""
                onChange={(e) => {
                  sablonUygula(e.target.value);
                }}
              >
                <option value="">{t('ogrenme.odev.sablonSec')}</option>
                {sablonlar.data?.sablonlar.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.baslik}
                  </option>
                ))}
              </Secim>
            )}
          </Alan>
        ) : null}

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">{t('ogrenme.odev.hedef')}</legend>
          <div className="flex flex-wrap gap-2">
            {hedefSecenekleri.map((h) => (
              <label
                key={h}
                className="flex min-h-11 cursor-pointer items-center gap-2 rounded-orta border border-kenar px-3 text-sm has-[:checked]:border-birincil has-[:checked]:bg-birincil-yumusak"
              >
                <input
                  type="radio"
                  name="hedef-turu"
                  value={h}
                  checked={f.hedefTuru === h}
                  onChange={() => {
                    guncelle({ hedefTuru: h, hedefId: '' });
                  }}
                  className="size-4 accent-[var(--birincil)]"
                />
                {t(`ogrenme.odev.hedefTuru.${h}`)}
              </label>
            ))}
          </div>
        </fieldset>
        {f.hedefTuru === 'grup' ? (
          <Alan etiket={t('ogrenme.odev.grup')} hata={hatalar.hedef}>
            {(o) => (
              <Secim
                {...o}
                value={hedefId}
                onChange={(e) => {
                  guncelle({ hedefId: e.target.value });
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
        ) : null}
        {f.hedefTuru === 'ogrenci' ? (
          <OgrenciSecimi
            deger={hedefId}
            degisti={(id) => {
              guncelle({ hedefId: id });
            }}
            ogrenciler={ogrenciler.liste}
            hata={hatalar.hedef}
          />
        ) : null}
        {f.hedefTuru === 'kurum' ? (
          <p className="rounded-orta bg-yuzey-ikincil px-3 py-2 text-sm text-metin-ikincil">
            {t('ogrenme.odev.kurumAciklama')}
          </p>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <Alan etiket={t('ogrenme.odev.ders')} hata={hatalar.brans}>
            {(o) => (
              <Secim
                {...o}
                value={f.brans}
                onChange={(e) => {
                  guncelle({ brans: e.target.value, konuId: null });
                }}
              >
                {siraliBransler().map((b) => (
                  <option key={b.kod} value={b.kod}>
                    {b.ad}
                  </option>
                ))}
              </Secim>
            )}
          </Alan>
          <KonuSecici
            kurumId={kurumId}
            deger={f.konuId}
            brans={f.brans}
            degisti={(k) => {
              guncelle({
                konuId: k?.id ?? null,
                ...(k && !f.baslikElle ? { baslik: k.ad } : {}),
              });
            }}
          />
        </div>

        <Alan etiket={t('ogrenme.odev.baslik')} hata={hatalar.baslik}>
          {(o) => (
            <Girdi
              {...o}
              value={baslik}
              maxLength={200}
              onChange={(e) => {
                guncelle({ baslik: e.target.value, baslikElle: true });
              }}
            />
          )}
        </Alan>

        <div className="grid gap-4 sm:grid-cols-3">
          <Alan etiket={t('ogrenme.odev.tur')}>
            {(o) => (
              <Secim
                {...o}
                value={f.tur}
                onChange={(e) => {
                  guncelle({ tur: e.target.value as (typeof TURLER)[number] });
                }}
              >
                {TURLER.map((x) => (
                  <option key={x} value={x}>
                    {t(`ogrenme.odev.turAd.${x}`)}
                  </option>
                ))}
              </Secim>
            )}
          </Alan>
          <Alan etiket={t('ogrenme.odev.sonTeslim')} hata={hatalar.sonTeslim}>
            {(o) => (
              <Girdi
                {...o}
                type="date"
                value={f.sonTeslim}
                onChange={(e) => {
                  guncelle({ sonTeslim: e.target.value });
                }}
              />
            )}
          </Alan>
          {f.tur === 'soru' ? (
            <Alan etiket={t('ogrenme.odev.hedefSayi')} hata={hatalar.hedefSayi}>
              {(o) => (
                <Girdi
                  {...o}
                  inputMode="numeric"
                  value={f.hedefSayi}
                  onChange={(e) => {
                    guncelle({ hedefSayi: e.target.value });
                  }}
                />
              )}
            </Alan>
          ) : null}
        </div>

        <Alan etiket={t('ogrenme.odev.kaynak')} yardim={t('ogrenme.odev.kaynakYardim')}>
          {(o) => (
            <Girdi
              {...o}
              value={f.kaynak}
              maxLength={200}
              onChange={(e) => {
                guncelle({ kaynak: e.target.value });
              }}
            />
          )}
        </Alan>

        {genelHata ? (
          <p role="alert" className="text-sm text-hata">
            {genelHata}
          </p>
        ) : null}
        {sablonAdi ? (
          <p role="status" className="text-sm text-metin-ikincil">
            {t('ogrenme.odev.sablonKaydedildi', { ad: sablonAdi })}
          </p>
        ) : null}

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
          <Dugme
            type="button"
            gorunum="hayalet"
            disabled={sablonKaydet.isPending}
            onClick={() => {
              setGenelHata(null);
              if (dogrula()) sablonKaydet.mutate();
            }}
          >
            {t('ogrenme.odev.sablonOlarakKaydet')}
          </Dugme>
          <Dugme type="button" gorunum="ikincil" onClick={kapat}>
            {t('ortak.vazgec')}
          </Dugme>
          <Dugme
            type="button"
            gorunum="ikincil"
            disabled={kaydet.isPending}
            onClick={() => {
              gonder(false);
            }}
          >
            {t('ogrenme.odev.taslakKaydet')}
          </Dugme>
          <Dugme type="submit" disabled={kaydet.isPending}>
            {kaydet.isPending ? t('ortak.yukleniyor') : t('ogrenme.odev.yayinla')}
          </Dugme>
        </div>
      </form>
    </Pencere>
  );
}
