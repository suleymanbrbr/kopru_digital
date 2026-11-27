'use client';

import {
  EkListesiSema,
  type EkListesi as EkListesiTipi,
  type EkTipi,
  type MedyaDosyaTuru,
} from '@kopru/contracts';
import { t } from '@kopru/i18n';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, FileText, Paperclip, RotateCw, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { YuklemeSatiri } from '@/components/soru/yukleme-satiri';
import { Dugme } from '@/components/ui/button';
import { Uyari } from '@/components/ui/uyari';
import { UygulamaHatasi, hataMesaji } from '@/lib/api';
import { ogrenmeIstek } from '@/lib/hesap-istek';
import {
  EK_ACCEPT,
  EK_EN_FAZLA_BAYT,
  EK_EN_FAZLA_DOSYA,
  dosyaBoyutuMetni,
  ekDosyasiniDenetle,
  ekPdfMi,
} from '@/lib/ogrenme/ek';
import { ogrenmeAnahtari } from '@/lib/ogrenme/veri';

const MB = 1024 * 1024;

// --- Salt okunur liste ------------------------------------------------------------------------

/** Bir ekin satiri: onizleme (gorsel) ya da PDF simgesi, tur ve boyut, "Ac / indir" baglantisi. */
function EkSatiri({ ek, kaldir }: { ek: EkTipi; kaldir?: () => void }) {
  const sira = ek.sira + 1;
  const pdf = ekPdfMi(ek.mime_tipi);
  const onizleme = ek.adres?.kucuk_url ?? null;
  return (
    <li
      data-testid="ek-ogesi"
      className="flex items-center gap-3 rounded-orta border border-kenar bg-yuzey p-2"
    >
      {onizleme ? (
        // eslint-disable-next-line @next/next/no-img-element -- imzali kisa omurlu adres, Image optimizasyonu gerekmez
        <img
          src={onizleme}
          alt={t('ogrenme.ek.onizleme', { sira })}
          className="size-12 shrink-0 rounded-kucuk bg-yuzey-ikincil object-cover"
        />
      ) : (
        <span className="flex size-12 shrink-0 items-center justify-center rounded-kucuk bg-yuzey-ikincil text-metin-ikincil">
          <FileText className="size-6" aria-hidden />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{t('ogrenme.ek.sira', { sira })}</p>
        <p className="text-xs text-metin-ikincil">
          {pdf ? t('ogrenme.ek.pdf') : t('ogrenme.ek.gorsel')} · {dosyaBoyutuMetni(ek.boyut_bayt)}
        </p>
      </div>
      {ek.adres ? (
        <a
          href={ek.adres.asil_url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={t('ogrenme.ek.acEtiket', { sira })}
          className="inline-flex h-9 items-center gap-2 rounded-orta border border-kenar bg-yuzey px-3 text-sm font-medium hover:bg-yuzey-ikincil"
        >
          <ExternalLink className="size-4" aria-hidden />
          {t('ogrenme.ek.ac')}
        </a>
      ) : (
        <span className="text-xs text-metin-ikincil">{t('ogrenme.ek.adresYok')}</span>
      )}
      {kaldir ? (
        <Dugme
          type="button"
          gorunum="hayalet"
          boyut="sm"
          aria-label={t('ogrenme.ek.kaldirEtiket', { sira })}
          onClick={kaldir}
        >
          <Trash2 aria-hidden />
          {t('ogrenme.ek.kaldir')}
        </Dugme>
      ) : null}
    </li>
  );
}

const ekAnahtari = (kurumId: string, yol: string) =>
  [...ogrenmeAnahtari(kurumId), 'ekler', yol] as const;

/** Ek listesi sorgusu; imzali adresler 10 dk gecerli oldugundan kisa tutulur. */
export function useEkListesi(kurumId: string, yol: string, etkin = true) {
  return useQuery({
    queryKey: ekAnahtari(kurumId, yol),
    enabled: etkin,
    staleTime: 60_000,
    queryFn: () => ogrenmeIstek(`kurumlar/${kurumId}/${yol}`, { sema: EkListesiSema }),
  });
}

/** Ek listesini (yukleniyor/hata/bos halleriyle) gosterir; ogrenci ve salt okunur kullanim. */
export function EkListesiGorunumu({
  kurumId,
  yol,
  baslik = true,
}: {
  kurumId: string;
  yol: string;
  baslik?: boolean;
}) {
  const sorgu = useEkListesi(kurumId, yol);
  return (
    <section aria-label={t('ogrenme.ek.baslik')} className="flex flex-col gap-2">
      {baslik ? (
        <h3 className="flex items-center gap-1.5 text-sm font-semibold">
          <Paperclip className="size-4" aria-hidden />
          {t('ogrenme.ek.baslik')}
        </h3>
      ) : null}
      {sorgu.isPending ? (
        <p role="status" className="text-sm text-metin-ikincil">
          {t('ortak.yukleniyor')}
        </p>
      ) : sorgu.isError ? (
        <div role="alert" className="flex flex-col items-start gap-2 text-sm text-hata">
          <span>{t('ogrenme.ek.yuklenemedi')}</span>
          <Dugme type="button" gorunum="ikincil" boyut="sm" onClick={() => void sorgu.refetch()}>
            <RotateCw aria-hidden />
            {t('ogrenme.ek.yenidenDene')}
          </Dugme>
        </div>
      ) : sorgu.data.ekler.length === 0 ? (
        <p className="text-sm text-metin-ikincil">{t('ogrenme.ek.yok')}</p>
      ) : (
        <>
          <ul className="flex flex-col gap-2">
            {sorgu.data.ekler.map((e) => (
              <EkSatiri key={e.medya_dosya_id} ek={e} />
            ))}
          </ul>
          {sorgu.data.adresler_alinamadi ? (
            <Dugme
              type="button"
              gorunum="ikincil"
              boyut="sm"
              className="self-start"
              onClick={() => void sorgu.refetch()}
            >
              <RotateCw aria-hidden />
              {t('ogrenme.ek.yenidenDene')}
            </Dugme>
          ) : null}
        </>
      )}
    </section>
  );
}

// --- Yukleme: secim deposu ----------------------------------------------------------------------

export interface EkSecimi {
  anahtar: string;
  dosya: File;
  /** Medyada hazir olunca dolar. */
  dosyaId: string | null;
}

/**
 * Yuklenecek ek dosyalarin yerel durumu: istemci on kontrolu (tur, boyut, adet), her dosyanin yukleme
 * sonucu (`dosyaId`). Yukleme `YuklemeSatiri` ile mevcut medya hattindan (presigned PUT) yapilir.
 */
export function useEkSecimi(mevcutSayisi = 0) {
  const [secimler, setSecimler] = useState<EkSecimi[]>([]);
  const [hatalar, setHatalar] = useState<string[]>([]);
  const ref = useRef(secimler);
  useEffect(() => {
    ref.current = secimler;
  });

  const ekle = useCallback(
    (dosyalar: readonly File[]) => {
      const yeniHatalar: string[] = [];
      const kabul: EkSecimi[] = [];
      const yer = Math.max(0, EK_EN_FAZLA_DOSYA - mevcutSayisi - ref.current.length);
      for (const dosya of dosyalar) {
        const hata = ekDosyasiniDenetle(dosya);
        if (hata) {
          yeniHatalar.push(
            t(`ogrenme.ek.hata.${hata}`, { ad: dosya.name, mb: EK_EN_FAZLA_BAYT / MB }),
          );
        } else if (kabul.length >= yer) {
          const fazla = t('ogrenme.ek.hata.fazla', { n: EK_EN_FAZLA_DOSYA });
          if (!yeniHatalar.includes(fazla)) yeniHatalar.push(fazla);
        } else {
          kabul.push({ anahtar: crypto.randomUUID(), dosya, dosyaId: null });
        }
      }
      setHatalar(yeniHatalar);
      if (kabul.length > 0) setSecimler((o) => [...o, ...kabul]);
    },
    [mevcutSayisi],
  );
  const kaldir = useCallback((anahtar: string) => {
    setSecimler((o) => o.filter((x) => x.anahtar !== anahtar));
  }, []);
  const hazirOldu = useCallback((anahtar: string, dosyaId: string) => {
    setSecimler((o) => o.map((x) => (x.anahtar === anahtar ? { ...x, dosyaId } : x)));
  }, []);
  const temizle = useCallback(() => {
    setSecimler([]);
    setHatalar([]);
  }, []);

  return {
    secimler,
    hatalar,
    ekle,
    kaldir,
    hazirOldu,
    temizle,
    /** Hazir dosyalarin kimlikleri (secim sirasiyla). */
    hazirIdler: secimler.flatMap((s) => (s.dosyaId ? [s.dosyaId] : [])),
    /** Henuz yuklenmekte olan dosya var mi (gonderim beklemeli). */
    yukleniyor: secimler.some((s) => s.dosyaId === null),
    dolu: mevcutSayisi + secimler.length >= EK_EN_FAZLA_DOSYA,
  };
}
export type EkSecimDeposu = ReturnType<typeof useEkSecimi>;

/** Dosya secici dugmesi + secilen dosyalarin yukleme satirlari. */
export function EkSecici({
  depo,
  tur,
  disabled = false,
}: {
  depo: EkSecimDeposu;
  tur: Extract<MedyaDosyaTuru, 'odev_eki' | 'plan_eki'>;
  disabled?: boolean;
}) {
  const girdi = useRef<HTMLInputElement>(null);
  return (
    <div className="flex flex-col gap-3">
      <div>
        <Dugme
          type="button"
          gorunum="ikincil"
          disabled={disabled || depo.dolu}
          onClick={() => girdi.current?.click()}
        >
          <Paperclip aria-hidden />
          {t('ogrenme.ek.ekle')}
        </Dugme>
        <input
          ref={girdi}
          type="file"
          accept={EK_ACCEPT}
          multiple
          className="sr-only"
          tabIndex={-1}
          aria-label={t('ogrenme.ek.dosyaGirdisi')}
          data-testid="ek-girdisi"
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) depo.ekle(Array.from(e.target.files));
            e.target.value = '';
          }}
        />
      </div>
      {depo.hatalar.map((h) => (
        <Uyari key={h}>{h}</Uyari>
      ))}
      {depo.secimler.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {depo.secimler.map((s) => (
            <li
              key={s.anahtar}
              data-testid="ek-yukleme-ogesi"
              className="flex flex-col gap-1.5 rounded-orta border border-kenar bg-yuzey p-2"
            >
              <div className="flex items-center gap-2">
                <FileText className="size-4 shrink-0 text-metin-ikincil" aria-hidden />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{s.dosya.name}</span>
                <span className="shrink-0 text-xs text-metin-ikincil">
                  {dosyaBoyutuMetni(s.dosya.size)}
                </span>
                <Dugme
                  type="button"
                  gorunum="hayalet"
                  boyut="sm"
                  aria-label={t('ogrenme.ek.kaldirEtiket', { sira: s.dosya.name })}
                  onClick={() => {
                    depo.kaldir(s.anahtar);
                  }}
                >
                  <Trash2 aria-hidden />
                </Dugme>
              </div>
              <YuklemeSatiri
                blob={s.dosya}
                tur={tur}
                mime={s.dosya.type}
                etiket={s.dosya.name}
                hazirOldu={(id) => {
                  depo.hazirOldu(s.anahtar, id);
                }}
              />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

// --- Mevcut kaydin eklerini duzenleme --------------------------------------------------------------

const EK_DOSYA_KODLARI = [
  'dosya_hazir_degil',
  'dosya_gecersiz',
  'dosya_islenemedi',
  'dosya_zaten_bagli',
] as const;

function ekHatasi(h: unknown): string {
  if (h instanceof UygulamaHatasi) {
    const kod = EK_DOSYA_KODLARI.find((k) => k === h.kod);
    if (kod) return t(`ogrenme.ek.hata.${kod}`);
  }
  return hataMesaji(h);
}

/**
 * Var olan odev/plan kaydinin ekleri: listeler, kaldirir ve yeni dosya yukler. Her degisiklik
 * `PUT .../ekler` ile tam kumeyi yazar (sunucu eksik/yeni farkini baglar/birakir). Eszamanli
 * degisiklikler sirayla yazilir; her yazimdan once guncel liste sunucudan alinir.
 */
export function EkDuzenleyici({
  kurumId,
  yol,
  tur,
  aciklama,
  salt = false,
  saltNedeni,
}: {
  kurumId: string;
  /** `odevler/<id>` ya da `planlar/<id>` (sonuna `/ekler` eklenir). */
  yol: string;
  tur: Extract<MedyaDosyaTuru, 'odev_eki' | 'plan_eki'>;
  aciklama: string;
  /** Yazma kapali (kapali odev, kilitli hafta): yalniz liste. */
  salt?: boolean;
  saltNedeni?: string;
}) {
  const ekYolu = `${yol}/ekler`;
  const qc = useQueryClient();
  const liste = useEkListesi(kurumId, ekYolu);
  const depo = useEkSecimi(liste.data?.ekler.length ?? 0);
  const kuyruk = useRef<Promise<unknown>>(Promise.resolve());
  const [hata, setHata] = useState<string | null>(null);
  const [tamam, setTamam] = useState(false);
  const [yaziliyor, setYaziliyor] = useState(0);

  const yaz = useCallback(
    (degistir: (mevcut: string[]) => string[]) => {
      setHata(null);
      setTamam(false);
      setYaziliyor((n) => n + 1);
      const is = kuyruk.current.then(async () => {
        const guncel = await ogrenmeIstek(`kurumlar/${kurumId}/${ekYolu}`, { sema: EkListesiSema });
        const yeni = degistir(guncel.ekler.map((e) => e.medya_dosya_id));
        const sonuc: EkListesiTipi = await ogrenmeIstek(`kurumlar/${kurumId}/${ekYolu}`, {
          yontem: 'PUT',
          govde: { medya_dosya_idleri: yeni },
          sema: EkListesiSema,
        });
        qc.setQueryData(ekAnahtari(kurumId, ekYolu), sonuc);
      });
      kuyruk.current = is.catch(() => undefined);
      return is
        .then(() => {
          setTamam(true);
        })
        .catch((h: unknown) => {
          setHata(ekHatasi(h));
          void qc.invalidateQueries({ queryKey: ekAnahtari(kurumId, ekYolu) });
        })
        .finally(() => {
          setYaziliyor((n) => n - 1);
        });
    },
    [ekYolu, kurumId, qc],
  );

  const { kaldir: secimdenKaldir } = depo;
  const yuklenenleriBagla = useCallback(
    (anahtar: string, dosyaId: string) => {
      secimdenKaldir(anahtar);
      void yaz((m) => [...m, dosyaId]);
    },
    [secimdenKaldir, yaz],
  );

  return (
    <section
      aria-label={t('ogrenme.ek.baslik')}
      className="flex flex-col gap-3 rounded-buyuk border border-kenar bg-yuzey p-4"
    >
      <div>
        <h2 className="flex items-center gap-1.5 text-base font-semibold">
          <Paperclip className="size-4" aria-hidden />
          {t('ogrenme.ek.baslik')}
        </h2>
        <p className="mt-0.5 text-sm text-metin-ikincil">{aciklama}</p>
      </div>
      {liste.isPending ? (
        <p role="status" className="text-sm text-metin-ikincil">
          {t('ortak.yukleniyor')}
        </p>
      ) : liste.isError ? (
        <div role="alert" className="flex flex-col items-start gap-2 text-sm text-hata">
          <span>{t('ogrenme.ek.yuklenemedi')}</span>
          <Dugme type="button" gorunum="ikincil" boyut="sm" onClick={() => void liste.refetch()}>
            <RotateCw aria-hidden />
            {t('ogrenme.ek.yenidenDene')}
          </Dugme>
        </div>
      ) : liste.data.ekler.length === 0 ? (
        <p className="text-sm text-metin-ikincil">{t('ogrenme.ek.yok')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {liste.data.ekler.map((e) => (
            <EkSatiri
              key={e.medya_dosya_id}
              ek={e}
              {...(salt
                ? {}
                : {
                    kaldir: () => {
                      void yaz((m) => m.filter((id) => id !== e.medya_dosya_id));
                    },
                  })}
            />
          ))}
        </ul>
      )}
      {liste.data?.adresler_alinamadi ? (
        <Dugme
          type="button"
          gorunum="ikincil"
          boyut="sm"
          className="self-start"
          onClick={() => void liste.refetch()}
        >
          <RotateCw aria-hidden />
          {t('ogrenme.ek.yenidenDene')}
        </Dugme>
      ) : null}
      {salt ? (
        saltNedeni ? (
          <p role="note" className="text-sm text-metin-ikincil">
            {saltNedeni}
          </p>
        ) : null
      ) : (
        <EkSeciciBagli
          depo={depo}
          tur={tur}
          yaziliyor={yaziliyor > 0}
          bagla={yuklenenleriBagla}
          dolu={(liste.data?.ekler.length ?? 0) >= EK_EN_FAZLA_DOSYA}
        />
      )}
      {hata ? <Uyari>{hata}</Uyari> : null}
      {tamam && !hata && yaziliyor === 0 ? (
        <p role="status" className="text-sm text-metin-ikincil">
          {t('ogrenme.ek.guncellendi')}
        </p>
      ) : null}
    </section>
  );
}

/** `EkSecici` + hazir olan dosyayi otomatik baglama (yukleme biter bitmez `bagla`). */
function EkSeciciBagli({
  depo,
  tur,
  yaziliyor,
  bagla,
  dolu,
}: {
  depo: EkSecimDeposu;
  tur: Extract<MedyaDosyaTuru, 'odev_eki' | 'plan_eki'>;
  yaziliyor: boolean;
  bagla: (anahtar: string, dosyaId: string) => void;
  dolu: boolean;
}) {
  // Yukleme tamamlanan her secim bir kez baglanir (baglaninca secimden kalkar).
  const baglanan = useRef(new Set<string>());
  const { secimler } = depo;
  useEffect(() => {
    for (const s of secimler) {
      if (s.dosyaId && !baglanan.current.has(s.anahtar)) {
        baglanan.current.add(s.anahtar);
        bagla(s.anahtar, s.dosyaId);
      }
    }
  }, [secimler, bagla]);
  return <EkSecici depo={depo} tur={tur} disabled={yaziliyor || dolu} />;
}
