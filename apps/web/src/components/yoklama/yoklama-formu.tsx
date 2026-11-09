'use client';

import { YoklamaKaydetYanitSema, YoklamaListeYanitSema } from '@kopru/contracts';
import { t } from '@kopru/i18n';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageSquarePlus } from 'lucide-react';
import { useRef, useState } from 'react';
import type { z } from 'zod';

import { dersAnahtari } from '@/components/takvim/ders-verisi';
import { basari, type Bildirim } from '@/components/hesap/ortak';
import { HataDurumu } from '@/components/hata-durumu';
import { Dugme } from '@/components/ui/button';
import { Girdi } from '@/components/ui/input';
import { Iskelet } from '@/components/ui/kart';
import { Pencere } from '@/components/ui/pencere';
import { Secim } from '@/components/ui/secim';
import { Uyari } from '@/components/ui/uyari';
import { hataMesaji } from '@/lib/api';
import { cn } from '@/lib/cn';
import { dersIstek } from '@/lib/hesap-istek';
import {
  gecDakikaHatasi,
  yoklamaSatirlari,
  type YoklamaDurumu,
  type YoklamaGirdisi,
} from '@/lib/operasyon';
import type { GrupSecenegi } from '@/lib/operasyon-verisi';
import { gunEtiketi, saatAraligi, yerelTarih } from '@/lib/saat';
import { yenidenDene } from '@/lib/sayfali-sorgu';

type Liste = z.infer<typeof YoklamaListeYanitSema>;
type Sonuc = z.infer<typeof YoklamaKaydetYanitSema>;

const DURUMLAR: readonly YoklamaDurumu[] = ['geldi', 'gelmedi', 'izinli', 'gec'];

export const yoklamaAnahtari = (kurumId: string, dersId: string) =>
  [...dersAnahtari(kurumId), 'yoklama', dersId] as const;

/** Sunucu yanitindan kullaniciya gosterilecek ozet (kalan ders, atlanan kayit, tarife uyarisi). */
export function yoklamaOzeti(sonuc: Sonuc, adlar: ReadonlyMap<string, string>): string {
  const parcalar = [t('operasyon.yoklama.form.kaydedildi')];
  const kredi = sonuc.sonuclar.filter((s) => s.kalan_kredi !== null);
  for (const s of kredi.slice(0, 5)) {
    parcalar.push(
      t('operasyon.yoklama.form.kalanKredi', {
        ad: adlar.get(s.ogrenci_id) ?? t('operasyon.ortak.adsiz'),
        sayi: s.kalan_kredi ?? 0,
      }),
    );
  }
  const eski = sonuc.sonuclar.filter((s) => s.sonuc === 'eski').length;
  if (eski > 0) parcalar.push(t('operasyon.yoklama.form.eski', { sayi: eski }));
  if (sonuc.sonuclar.some((s) => s.uyari === 'ucret_tarifesi_yok')) {
    parcalar.push(t('operasyon.yoklama.form.tarifeYok'));
  }
  return parcalar.join(' ');
}

export function YoklamaFormu({
  kurumId,
  dersId,
  saatDilimi,
  grupAdlari,
  kapat,
  bildir,
}: {
  kurumId: string;
  dersId: string | null;
  saatDilimi: string;
  grupAdlari: ReadonlyMap<string, GrupSecenegi>;
  kapat: () => void;
  bildir: (b: Bildirim) => void;
}) {
  return (
    <Pencere
      acik={dersId !== null}
      degisti={(a) => {
        if (!a) kapat();
      }}
      genis
      baslik={t('operasyon.yoklama.form.baslik')}
    >
      {dersId ? (
        <Yukleyici
          kurumId={kurumId}
          dersId={dersId}
          saatDilimi={saatDilimi}
          grupAdlari={grupAdlari}
          kapat={kapat}
          bildir={bildir}
        />
      ) : null}
    </Pencere>
  );
}

function Yukleyici(props: {
  kurumId: string;
  dersId: string;
  saatDilimi: string;
  grupAdlari: ReadonlyMap<string, GrupSecenegi>;
  kapat: () => void;
  bildir: (b: Bildirim) => void;
}) {
  const q = useQuery({
    queryKey: yoklamaAnahtari(props.kurumId, props.dersId),
    retry: yenidenDene,
    gcTime: 0,
    queryFn: () =>
      dersIstek(`kurumlar/${props.kurumId}/dersler/${props.dersId}/yoklamalar`, {
        sema: YoklamaListeYanitSema,
      }),
  });
  if (q.isPending) {
    return (
      <div
        role="status"
        aria-label={t('operasyon.yoklama.form.yukleniyor')}
        className="flex flex-col gap-3"
      >
        <Iskelet className="h-14 w-full" />
        <Iskelet className="h-14 w-full" />
        <Iskelet className="h-14 w-full" />
      </div>
    );
  }
  if (q.isError) {
    return (
      <HataDurumu
        baslik={t('operasyon.yoklama.form.yuklenemedi')}
        aciklama={hataMesaji(q.error)}
        tekrarDene={() => void q.refetch()}
        className="py-6"
      />
    );
  }
  return <Form {...props} liste={q.data} />;
}

function ilkGirdiler(liste: Liste): Record<string, YoklamaGirdisi> {
  return Object.fromEntries(
    liste.katilimcilar.map((k) => [
      k.ogrenci_id,
      {
        durum: k.yoklama?.durum ?? 'geldi',
        gecDakika: k.yoklama?.gec_dakika ? String(k.yoklama.gec_dakika) : '10',
        not: k.yoklama?.not ?? '',
        ogrenciyeGorunsun: k.yoklama?.not_gorunurluk === 'ogrenciye',
      } satisfies YoklamaGirdisi,
    ]),
  );
}

function Form({
  kurumId,
  dersId,
  saatDilimi,
  grupAdlari,
  kapat,
  bildir,
  liste,
}: {
  kurumId: string;
  dersId: string;
  saatDilimi: string;
  grupAdlari: ReadonlyMap<string, GrupSecenegi>;
  kapat: () => void;
  bildir: (b: Bildirim) => void;
  liste: Liste;
}) {
  const qc = useQueryClient();
  const [girdiler, setGirdiler] = useState(() => ilkGirdiler(liste));
  const [notAcik, setNotAcik] = useState<ReadonlySet<string>>(
    () => new Set(liste.katilimcilar.filter((k) => k.yoklama?.not).map((k) => k.ogrenci_id)),
  );
  const [hataGoster, setHataGoster] = useState(false);
  // Ayni govde = ayni Idempotency-Key ve ayni isaretlenme zamani (tekrar deneme guvenli); govde degisince yenisi.
  const anahtar = useRef<{ imza: string; key: string; zaman: string } | null>(null);

  const adlar = new Map(liste.katilimcilar.map((k) => [k.ogrenci_id, k.gorunen_ad ?? '']));
  const duzeltme = liste.katilimcilar.some((k) => k.yoklama !== null);
  const birebir =
    liste.katilimcilar.length === 1 || grupAdlari.get(liste.ders.grup_id)?.tur === 'birebir';
  const grup = grupAdlari.get(liste.ders.grup_id);
  const gun = yerelTarih(liste.ders.baslangic_at, saatDilimi);

  const kaydet = useMutation({
    mutationFn: (g: Record<string, YoklamaGirdisi>) => {
      const imza = JSON.stringify(g);
      if (anahtar.current?.imza !== imza) {
        anahtar.current = { imza, key: crypto.randomUUID(), zaman: new Date().toISOString() };
      }
      const { key, zaman } = anahtar.current;
      return dersIstek(`kurumlar/${kurumId}/dersler/${dersId}/yoklamalar`, {
        yontem: 'PUT',
        sema: YoklamaKaydetYanitSema,
        basliklar: { 'Idempotency-Key': key },
        govde: { yoklamalar: yoklamaSatirlari(g, zaman) },
      });
    },
    onSuccess: (s) => {
      void qc.invalidateQueries({ queryKey: dersAnahtari(kurumId) });
      void qc.invalidateQueries({ queryKey: ['finans', kurumId] });
      bildir(basari(yoklamaOzeti(s, adlar)));
      kapat();
    },
  });

  const gec = (ogrenciId: string, ek: Partial<YoklamaGirdisi>) => {
    setGirdiler((o) => {
      const mevcut = o[ogrenciId];
      return mevcut ? { ...o, [ogrenciId]: { ...mevcut, ...ek } } : o;
    });
  };

  const gonder = (g: Record<string, YoklamaGirdisi> = girdiler) => {
    setHataGoster(true);
    if (Object.values(g).some((x) => gecDakikaHatasi(x) !== null)) return;
    kaydet.mutate(g);
  };

  if (liste.katilimcilar.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-metin-ikincil">
        {t('operasyon.yoklama.form.katilimciYok')}
      </p>
    );
  }

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        gonder();
      }}
      className="flex flex-col gap-4"
    >
      <div className="text-sm text-metin-ikincil">
        <p className="font-medium text-metin">
          {grup?.etiket ?? ''} · {gunEtiketi(gun)},{' '}
          {saatAraligi(liste.ders.baslangic_at, liste.ders.bitis_at, saatDilimi)}
        </p>
        <p>
          {duzeltme
            ? t('operasyon.yoklama.form.gecmisDers')
            : birebir
              ? t('operasyon.yoklama.form.birebirAciklama')
              : t('operasyon.yoklama.form.aciklama')}
        </p>
      </div>

      <ul className="flex flex-col gap-3">
        {liste.katilimcilar.map((k) => {
          const g = girdiler[k.ogrenci_id];
          if (!g) return null;
          const ad = k.gorunen_ad ?? t('operasyon.ortak.adsiz');
          const dakikaHata = hataGoster ? gecDakikaHatasi(g) : null;
          return (
            <li
              key={k.ogrenci_id}
              className="flex flex-col gap-3 rounded-orta border border-kenar p-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="min-w-0 font-medium">{ad}</p>
                <div
                  role="radiogroup"
                  aria-label={t('operasyon.yoklama.form.durumSecimi', { ad })}
                  className="flex flex-wrap gap-1.5"
                >
                  {DURUMLAR.map((d) => (
                    <label
                      key={d}
                      className={cn(
                        'flex min-h-11 min-w-20 cursor-pointer items-center justify-center rounded-orta border px-3 text-sm font-medium transition-colors focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--birincil)]',
                        g.durum === d
                          ? d === 'geldi'
                            ? 'border-basari bg-basari-yumusak'
                            : d === 'gelmedi'
                              ? 'border-hata bg-hata-yumusak text-hata'
                              : 'border-uyari bg-uyari-yumusak'
                          : 'border-kenar bg-yuzey hover:bg-yuzey-ikincil',
                      )}
                    >
                      <input
                        type="radio"
                        name={`durum-${k.ogrenci_id}`}
                        value={d}
                        checked={g.durum === d}
                        className="sr-only"
                        onChange={() => {
                          gec(k.ogrenci_id, { durum: d });
                        }}
                        onClick={() => {
                          // Birebirde ilk yoklamada tek dokunusla "Geldi": hemen kaydedilir.
                          if (birebir && d === 'geldi' && !duzeltme) {
                            gonder({ ...girdiler, [k.ogrenci_id]: { ...g, durum: 'geldi' } });
                          }
                        }}
                      />
                      {t(`operasyon.yoklama.form.${d}`)}
                    </label>
                  ))}
                </div>
              </div>

              {g.durum === 'gec' ? (
                <div className="flex flex-col gap-1.5 sm:max-w-48">
                  <label htmlFor={`gec-${k.ogrenci_id}`} className="text-sm font-medium">
                    {t('operasyon.yoklama.form.gecDakika')}
                  </label>
                  <Girdi
                    id={`gec-${k.ogrenci_id}`}
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={240}
                    value={g.gecDakika}
                    aria-invalid={dakikaHata ? true : undefined}
                    aria-describedby={dakikaHata ? `gec-hata-${k.ogrenci_id}` : undefined}
                    onChange={(e) => {
                      gec(k.ogrenci_id, { gecDakika: e.target.value });
                    }}
                  />
                  {dakikaHata ? (
                    <p id={`gec-hata-${k.ogrenci_id}`} className="text-sm text-hata">
                      {dakikaHata}
                    </p>
                  ) : null}
                </div>
              ) : null}

              {notAcik.has(k.ogrenci_id) ? (
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_14rem]">
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor={`not-${k.ogrenci_id}`} className="text-sm font-medium">
                      {t('operasyon.yoklama.form.not')}
                    </label>
                    <Girdi
                      id={`not-${k.ogrenci_id}`}
                      maxLength={500}
                      value={g.not}
                      onChange={(e) => {
                        gec(k.ogrenci_id, { not: e.target.value });
                      }}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor={`gorunur-${k.ogrenci_id}`} className="text-sm font-medium">
                      {t('operasyon.yoklama.form.gorunurluk')}
                    </label>
                    <Secim
                      id={`gorunur-${k.ogrenci_id}`}
                      value={g.ogrenciyeGorunsun ? 'ogrenciye' : 'ozel'}
                      onChange={(e) => {
                        gec(k.ogrenci_id, { ogrenciyeGorunsun: e.target.value === 'ogrenciye' });
                      }}
                    >
                      <option value="ozel">{t('operasyon.yoklama.form.ozel')}</option>
                      <option value="ogrenciye">
                        {t('operasyon.yoklama.form.ogrenciyeGorunsun')}
                      </option>
                    </Secim>
                  </div>
                </div>
              ) : (
                <Dugme
                  type="button"
                  gorunum="hayalet"
                  boyut="sm"
                  className="self-start"
                  onClick={() => {
                    setNotAcik((o) => new Set(o).add(k.ogrenci_id));
                  }}
                >
                  <MessageSquarePlus aria-hidden />
                  {t('operasyon.yoklama.form.notEkle')}
                </Dugme>
              )}
            </li>
          );
        })}
      </ul>

      {kaydet.isError ? <Uyari>{hataMesaji(kaydet.error)}</Uyari> : null}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Dugme type="button" gorunum="ikincil" onClick={kapat} disabled={kaydet.isPending}>
          {t('operasyon.ortak.vazgec')}
        </Dugme>
        <Dugme type="submit" disabled={kaydet.isPending}>
          {kaydet.isPending
            ? t('operasyon.yoklama.form.kaydediliyor')
            : duzeltme
              ? t('operasyon.yoklama.form.duzelt')
              : t('operasyon.yoklama.form.kaydet')}
        </Dugme>
      </div>
    </form>
  );
}
