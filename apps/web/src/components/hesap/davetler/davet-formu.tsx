'use client';

import { DavetOlusturYanitSema, GrupListeYanitSema } from '@kopru/contracts';
import { t } from '@kopru/i18n';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useId, useMemo, useState } from 'react';
import { z } from 'zod';

import { KopyalaDugmesi } from '../ortak';

import { Dugme } from '@/components/ui/button';
import { Etiket, Girdi } from '@/components/ui/input';
import { Pencere } from '@/components/ui/pencere';
import { Secim } from '@/components/ui/secim';
import { Uyari } from '@/components/ui/uyari';
import { hataMesaji } from '@/lib/api';
import { hesapIstek } from '@/lib/hesap-istek';
import { useSayfaliSorgu } from '@/lib/sayfali-sorgu';
import { trSirala } from '@/lib/sirala';
import { telefonSema } from '@/oturum/tipler';

export type DavetKanali = 'baglanti' | 'sms' | 'eposta';
export type DavetRolu = 'yonetici' | 'ogretmen' | 'ogrenci';
export type DavetSonucu = z.output<typeof DavetOlusturYanitSema>;

/** Davet baglantisi: web adresi + belirtec. Belirtec yalniz URL'de bulunur, loga yazilmaz. */
export function davetBaglantisi(belirtec: string): string {
  return `${window.location.origin}/davet/${belirtec}`;
}

/**
 * Davet olustur penceresi (tekil). Basarida bagimlilik: baglanti yalniz bu yanitta doner,
 * bu yuzden sonuc ekraninda bir kez gosterilir ve kopyalama sunulur.
 */
export function DavetFormu({
  acik,
  degisti,
  kurumId,
  roller,
  grupSecilebilir,
  sonuc,
  sonucAyarla,
}: {
  acik: boolean;
  degisti: (acik: boolean) => void;
  kurumId: string;
  roller: readonly DavetRolu[];
  grupSecilebilir: boolean;
  /** Gosterilecek sonuc (olusturma ya da yeniden gonderme). Doluysa form yerine sonuc cizilir. */
  sonuc: { davet: DavetSonucu; baslik?: string } | null;
  sonucAyarla: (s: { davet: DavetSonucu; baslik?: string } | null) => void;
}) {
  const kapat = (a: boolean) => {
    if (!a) sonucAyarla(null);
    degisti(a);
  };
  // Pencere kapaninca icerik kaldirilir; form alanlari her acilista yeniden kurulur.
  return (
    <Pencere
      acik={acik}
      degisti={kapat}
      baslik={
        sonuc ? (sonuc.baslik ?? t('hesap.davet.sonuc.baslik')) : t('hesap.davet.form.baslik')
      }
    >
      {sonuc ? (
        <DavetSonucuGorunumu
          sonuc={sonuc.davet}
          kapat={() => {
            kapat(false);
          }}
          yeni={() => {
            sonucAyarla(null);
          }}
        />
      ) : (
        <DavetFormIcerigi
          kurumId={kurumId}
          roller={roller}
          grupSecilebilir={grupSecilebilir}
          sonucAyarla={sonucAyarla}
          kapat={() => {
            kapat(false);
          }}
        />
      )}
    </Pencere>
  );
}

function DavetFormIcerigi({
  kurumId,
  roller,
  grupSecilebilir,
  sonucAyarla,
  kapat,
}: {
  kurumId: string;
  roller: readonly DavetRolu[];
  grupSecilebilir: boolean;
  sonucAyarla: (s: { davet: DavetSonucu; baslik?: string } | null) => void;
  kapat: () => void;
}) {
  const qc = useQueryClient();
  const kimlik = useId();
  const [kanal, setKanal] = useState<DavetKanali>('baglanti');
  const [rol, setRol] = useState<DavetRolu>(roller[0] ?? 'ogrenci');
  const [telefon, setTelefon] = useState('');
  const [eposta, setEposta] = useState('');
  const [ad, setAd] = useState('');
  const [grupId, setGrupId] = useState('');
  const [azami, setAzami] = useState('1');
  const [gun, setGun] = useState('7');
  const [hatalar, setHatalar] = useState<Record<string, string>>({});
  const [genel, setGenel] = useState<string | null>(null);

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

  const olustur = useMutation({
    mutationFn: (govde: Record<string, unknown>) =>
      hesapIstek(`kurumlar/${kurumId}/davetler`, { govde, sema: DavetOlusturYanitSema }),
    onSuccess: (yanit) => {
      void qc.invalidateQueries({ queryKey: ['hesap', kurumId, 'davetler'] });
      sonucAyarla({ davet: yanit });
    },
    onError: (e) => {
      setGenel(hataMesaji(e));
    },
  });

  function gonder(olay: React.SyntheticEvent) {
    olay.preventDefault();
    setGenel(null);
    const yeni: Record<string, string> = {};
    const govde: Record<string, unknown> = { kanal, rol };

    if (kanal === 'sms') {
      const tel = telefonSema.safeParse(telefon);
      if (tel.success) govde.telefon = `+90${tel.data}`;
      else yeni.telefon = t('hesap.davet.form.telefonHata');
    }
    if (kanal === 'eposta') {
      if (z.email().safeParse(eposta.trim()).success) govde.eposta = eposta.trim();
      else yeni.eposta = t('hesap.davet.form.epostaHata');
    }
    if (ad.trim()) govde.hedef_ad = ad.trim();
    if (rol === 'ogrenci' && grupId) govde.grup_id = grupId;
    if (kanal === 'baglanti') {
      const a = Number(azami);
      if (!Number.isInteger(a) || a < 1 || a > 100) yeni.azami = t('hesap.davet.form.sayiHata');
      else govde.max_kullanim = a;
    }
    const g = Number(gun);
    if (!Number.isInteger(g) || g < 1 || g > 30) yeni.gun = t('hesap.davet.form.sayiHata');
    else govde.gecerlilik_gun = g;

    setHatalar(yeni);
    if (Object.keys(yeni).length > 0) return;
    olustur.mutate(govde);
  }

  return (
    <form onSubmit={gonder} noValidate className="flex flex-col gap-4">
      {genel ? <Uyari>{genel}</Uyari> : null}

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">{t('hesap.davet.form.kanal')}</legend>
        {(
          [
            ['baglanti', 'hesap.davet.form.kanalBaglanti'],
            ['sms', 'hesap.davet.form.kanalSms'],
            ['eposta', 'hesap.davet.form.kanalEposta'],
          ] as const
        ).map(([k, anahtar]) => (
          <label key={k} className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
            <input
              type="radio"
              name={`${kimlik}-kanal`}
              value={k}
              checked={kanal === k}
              className="size-5 accent-birincil"
              onChange={() => {
                setKanal(k);
              }}
            />
            {t(anahtar)}
          </label>
        ))}
      </fieldset>

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

      {kanal === 'sms' ? (
        <Alan
          kimlik={`${kimlik}-tel`}
          etiket={t('hesap.davet.form.telefon')}
          hata={hatalar.telefon}
        >
          <Girdi
            id={`${kimlik}-tel`}
            type="tel"
            inputMode="tel"
            autoComplete="off"
            value={telefon}
            placeholder={t('hesap.davet.form.telefonYer')}
            aria-invalid={hatalar.telefon ? true : undefined}
            aria-describedby={hatalar.telefon ? `${kimlik}-tel-hata` : undefined}
            onChange={(e) => {
              setTelefon(e.target.value);
            }}
          />
        </Alan>
      ) : null}
      {kanal === 'eposta' ? (
        <Alan kimlik={`${kimlik}-ep`} etiket={t('hesap.davet.form.eposta')} hata={hatalar.eposta}>
          <Girdi
            id={`${kimlik}-ep`}
            type="email"
            autoComplete="off"
            value={eposta}
            placeholder={t('hesap.davet.form.epostaYer')}
            aria-invalid={hatalar.eposta ? true : undefined}
            aria-describedby={hatalar.eposta ? `${kimlik}-ep-hata` : undefined}
            onChange={(e) => {
              setEposta(e.target.value);
            }}
          />
        </Alan>
      ) : null}

      <Alan kimlik={`${kimlik}-ad`} etiket={t('hesap.davet.form.hedefAd')}>
        <Girdi
          id={`${kimlik}-ad`}
          value={ad}
          maxLength={200}
          autoComplete="off"
          onChange={(e) => {
            setAd(e.target.value);
          }}
        />
      </Alan>

      {grupSecilebilir && rol === 'ogrenci' ? (
        <Alan kimlik={`${kimlik}-grup`} etiket={t('hesap.davet.form.grup')}>
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
        </Alan>
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        {kanal === 'baglanti' ? (
          <Alan
            kimlik={`${kimlik}-az`}
            etiket={t('hesap.davet.form.maxKullanim')}
            hata={hatalar.azami}
          >
            <Girdi
              id={`${kimlik}-az`}
              type="number"
              inputMode="numeric"
              min={1}
              max={100}
              value={azami}
              aria-invalid={hatalar.azami ? true : undefined}
              aria-describedby={hatalar.azami ? `${kimlik}-az-hata` : undefined}
              onChange={(e) => {
                setAzami(e.target.value);
              }}
            />
          </Alan>
        ) : null}
        <Alan kimlik={`${kimlik}-gun`} etiket={t('hesap.davet.form.gecerlilik')} hata={hatalar.gun}>
          <Girdi
            id={`${kimlik}-gun`}
            type="number"
            inputMode="numeric"
            min={1}
            max={30}
            value={gun}
            aria-invalid={hatalar.gun ? true : undefined}
            aria-describedby={hatalar.gun ? `${kimlik}-gun-hata` : undefined}
            onChange={(e) => {
              setGun(e.target.value);
            }}
          />
        </Alan>
      </div>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Dugme
          type="button"
          gorunum="ikincil"
          onClick={() => {
            kapat();
          }}
        >
          {t('hesap.ortak.vazgec')}
        </Dugme>
        <Dugme type="submit" disabled={olustur.isPending}>
          {olustur.isPending ? t('hesap.davet.form.olusturuluyor') : t('hesap.davet.form.olustur')}
        </Dugme>
      </div>
    </form>
  );
}

function Alan({
  kimlik,
  etiket,
  hata,
  children,
}: {
  kimlik: string;
  etiket: string;
  hata?: string | undefined;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Etiket htmlFor={kimlik}>{etiket}</Etiket>
      {children}
      {hata ? (
        <p id={`${kimlik}-hata`} className="text-sm text-hata">
          {hata}
        </p>
      ) : null}
    </div>
  );
}

function DavetSonucuGorunumu({
  sonuc,
  kapat,
  yeni,
}: {
  sonuc: DavetSonucu;
  kapat: () => void;
  yeni: () => void;
}) {
  const baglanti = davetBaglantisi(sonuc.belirtec);
  const kanal = sonuc.davet.kanal;
  return (
    <div className="flex flex-col gap-4">
      {kanal !== 'baglanti' ? (
        <p
          role="status"
          className={
            sonuc.gonderim === 'gonderildi'
              ? 'rounded-orta bg-basari-yumusak px-3 py-2.5 text-sm text-basari'
              : 'rounded-orta bg-uyari-yumusak px-3 py-2.5 text-sm text-uyari'
          }
        >
          {sonuc.gonderim === 'gonderildi'
            ? t('hesap.davet.sonuc.gonderildi', { kanal: t(`hesap.davet.kanal.${kanal}`) })
            : t('hesap.davet.sonuc.gonderilemedi')}
        </p>
      ) : null}
      <div className="flex flex-col gap-1.5">
        <Etiket htmlFor="davet-baglantisi">{t('hesap.davet.sonuc.baglanti')}</Etiket>
        <input
          id="davet-baglantisi"
          readOnly
          value={baglanti}
          onFocus={(e) => {
            e.currentTarget.select();
          }}
          className="h-11 w-full rounded-orta border border-kenar bg-yuzey-ikincil px-3 font-mono text-sm"
        />
        <p className="text-sm text-metin-ikincil">{t('hesap.davet.sonuc.baglantiUyari')}</p>
      </div>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Dugme gorunum="hayalet" onClick={yeni}>
          {t('hesap.davet.sonuc.yeniDavet')}
        </Dugme>
        <Dugme gorunum="ikincil" onClick={kapat}>
          {t('hesap.davet.sonuc.tamam')}
        </Dugme>
        <KopyalaDugmesi
          metin={baglanti}
          etiket={t('hesap.davet.sonuc.baglantiKopyala')}
          gorunum="birincil"
          boyut="md"
        />
      </div>
    </div>
  );
}
