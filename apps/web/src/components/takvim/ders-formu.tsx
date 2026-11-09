'use client';

import { DersOlusturYanitSema, SeriOlusturYanitSema } from '@kopru/contracts';
import { t } from '@kopru/i18n';
import { useMutation } from '@tanstack/react-query';
import { TriangleAlert } from 'lucide-react';
import { useState, type FormEvent } from 'react';

import { cakisanlariOku, useDersYenile, type CakisanDers } from './ders-verisi';

import { Alan } from '@/components/operasyon/ortak';
import { basari, type Bildirim } from '@/components/hesap/ortak';
import { Dugme } from '@/components/ui/button';
import { OnayKutusu } from '@/components/ui/checkbox';
import { Girdi } from '@/components/ui/input';
import { Pencere } from '@/components/ui/pencere';
import { Secim } from '@/components/ui/secim';
import { Uyari } from '@/components/ui/uyari';
import { hataMesaji } from '@/lib/api';
import { dersIstek } from '@/lib/hesap-istek';
import { siraliBransler } from '@/lib/bransler';
import {
  dersFormunuDogrula,
  haftalikKural,
  type DersFormHatalari,
  type DersFormu as FormDurumu,
} from '@/lib/operasyon';
import type { GrupSecenegi } from '@/lib/operasyon-verisi';
import { haftaninGunu, yerelSaat, yerelTarih } from '@/lib/saat';

export interface TelafiKaynagi {
  dersId: string;
  grupId: string;
  brans: string;
  ogretmenId: string;
}

interface Ortak {
  kurumId: string;
  saatDilimi: string;
  gruplar: readonly GrupSecenegi[];
  ogretmenler: readonly { id: string; ad: string }[];
  /** Sahip/yonetici ogretmen secebilir; ogretmen kendi adina acar. */
  ogretmenSecilebilir: boolean;
}

/**
 * Ders ekle penceresi. Pencere kapaninca icerik kaldirilir; her acilista alanlar `varsayilanTarih`
 * ve makul degerlerle (16:00, 60 dk) yeniden kurulur.
 */
export function DersFormu({
  acik,
  degisti,
  varsayilanTarih,
  telafi,
  bitti,
  ...ortak
}: Ortak & {
  acik: boolean;
  degisti: (acik: boolean) => void;
  varsayilanTarih: string;
  telafi?: TelafiKaynagi | null;
  bitti: (bildirim: Bildirim) => void;
}) {
  return (
    <Pencere
      acik={acik}
      degisti={degisti}
      genis
      baslik={telafi ? t('operasyon.takvim.ayrinti.telafi') : t('operasyon.takvim.form.baslik')}
      aciklama={
        telafi ? t('operasyon.takvim.ayrinti.telafiAciklama') : t('operasyon.takvim.form.aciklama')
      }
    >
      <FormIcerigi
        {...ortak}
        varsayilanTarih={varsayilanTarih}
        telafi={telafi ?? null}
        kapat={() => {
          degisti(false);
        }}
        bitti={bitti}
      />
    </Pencere>
  );
}

function FormIcerigi({
  kurumId,
  saatDilimi,
  gruplar,
  ogretmenler,
  ogretmenSecilebilir,
  varsayilanTarih,
  telafi,
  kapat,
  bitti,
}: Ortak & {
  varsayilanTarih: string;
  telafi: TelafiKaynagi | null;
  kapat: () => void;
  bitti: (bildirim: Bildirim) => void;
}) {
  const yenile = useDersYenile(kurumId);
  const [f, setF] = useState<FormDurumu>({
    grupId: telafi?.grupId ?? '',
    tarih: varsayilanTarih,
    saat: '16:00',
    sureDk: '60',
    brans: telafi?.brans ?? '',
    tekrarla: false,
    bitisTarihi: '',
    online: '',
    yer: '',
  });
  const [ogretmenId, setOgretmenId] = useState(telafi?.ogretmenId ?? '');
  const [baslik, setBaslik] = useState('');
  const [hatalar, setHatalar] = useState<DersFormHatalari>({});
  const [cakisma, setCakisma] = useState<CakisanDers[] | null>(null);
  const guncelle = <K extends keyof FormDurumu>(k: K, v: FormDurumu[K]) => {
    setF((o) => ({ ...o, [k]: v }));
    setCakisma(null);
  };

  const kaydet = useMutation({
    mutationFn: async (onayli: boolean) => {
      const ortakGovde = {
        grup_id: f.grupId,
        baslangic_saati: f.saat,
        sure_dk: Number(f.sureDk),
        ...(ogretmenId ? { ogretmen_id: ogretmenId } : {}),
        ...(f.brans ? { brans_kodu: f.brans } : {}),
        ...(baslik.trim() ? { baslik: baslik.trim() } : {}),
        ...(f.online.trim() ? { online_baglanti: f.online.trim() } : {}),
        ...(f.yer.trim() ? { yer: f.yer.trim() } : {}),
        cakisma_onayli: onayli,
      };
      if (f.tekrarla && !telafi) {
        const sonuc = await dersIstek(`kurumlar/${kurumId}/seriler`, {
          yontem: 'POST',
          sema: SeriOlusturYanitSema,
          govde: {
            ...ortakGovde,
            tekrar_kurali: haftalikKural(haftaninGunu(f.tarih)),
            baslangic_tarihi: f.tarih,
            ...(f.bitisTarihi ? { bitis_tarihi: f.bitisTarihi } : {}),
          },
        });
        return {
          mesaj: t('operasyon.takvim.form.seriEklendi', { sayi: sonuc.dersler.length }),
          atlanan: sonuc.atlanan.length,
          ogrenciUyarisi: sonuc.uyari.length,
        };
      }
      const sonuc = await dersIstek(`kurumlar/${kurumId}/dersler`, {
        yontem: 'POST',
        sema: DersOlusturYanitSema,
        govde: {
          ...ortakGovde,
          tarih: f.tarih,
          ...(telafi ? { telafi: true, telafi_kaynak_ders_id: telafi.dersId } : {}),
        },
      });
      return {
        mesaj: t('operasyon.takvim.form.eklendi'),
        atlanan: 0,
        ogrenciUyarisi: sonuc.uyari.length,
      };
    },
    onSuccess: (s) => {
      void yenile();
      const ek = [
        s.atlanan > 0 ? t('operasyon.takvim.form.seriAtlanan', { sayi: s.atlanan }) : null,
        s.ogrenciUyarisi > 0
          ? t('operasyon.takvim.uyari.ogrenciCakismasi', { sayi: s.ogrenciUyarisi })
          : null,
      ]
        .filter(Boolean)
        .join(' ');
      bitti(basari(ek ? `${s.mesaj} ${ek}` : s.mesaj));
      kapat();
    },
    onError: (hata) => {
      const cak = cakisanlariOku(hata);
      if (cak) setCakisma(cak);
    },
  });

  const gonder = (e: FormEvent) => {
    e.preventDefault();
    const h = dersFormunuDogrula(f);
    setHatalar(h);
    if (Object.keys(h).length > 0) return;
    kaydet.mutate(cakisma !== null);
  };

  const hataMetni = kaydet.isError && cakisma === null ? hataMesaji(kaydet.error) : null;
  const tarihBicim = new Intl.DateTimeFormat('tr-TR', {
    timeZone: saatDilimi,
    day: 'numeric',
    month: 'long',
    weekday: 'short',
  });

  return (
    <form onSubmit={gonder} noValidate className="flex flex-col gap-4">
      <Alan etiket={t('operasyon.takvim.form.grup')} hata={hatalar.grup}>
        {(o) => (
          <Secim
            {...o}
            value={f.grupId}
            disabled={telafi !== null}
            onChange={(e) => {
              guncelle('grupId', e.target.value);
            }}
          >
            <option value="">{t('operasyon.takvim.form.grupSec')}</option>
            {gruplar.map((g) => (
              <option key={g.id} value={g.id}>
                {g.etiket}
              </option>
            ))}
          </Secim>
        )}
      </Alan>
      {gruplar.length === 0 ? (
        <p className="text-sm text-metin-ikincil">{t('operasyon.takvim.form.grupBos')}</p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <Alan etiket={t('operasyon.takvim.form.tarih')} hata={hatalar.tarih}>
          {(o) => (
            <Girdi
              {...o}
              type="date"
              value={f.tarih}
              onChange={(e) => {
                guncelle('tarih', e.target.value);
              }}
            />
          )}
        </Alan>
        <Alan etiket={t('operasyon.takvim.form.saat')} hata={hatalar.saat}>
          {(o) => (
            <Girdi
              {...o}
              type="time"
              value={f.saat}
              onChange={(e) => {
                guncelle('saat', e.target.value);
              }}
            />
          )}
        </Alan>
        <Alan etiket={t('operasyon.takvim.form.sure')} hata={hatalar.sure}>
          {(o) => (
            <Girdi
              {...o}
              type="number"
              inputMode="numeric"
              min={10}
              max={480}
              step={5}
              value={f.sureDk}
              onChange={(e) => {
                guncelle('sureDk', e.target.value);
              }}
            />
          )}
        </Alan>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {ogretmenSecilebilir ? (
          <Alan etiket={t('operasyon.takvim.form.ogretmen')}>
            {(o) => (
              <Secim
                {...o}
                value={ogretmenId}
                onChange={(e) => {
                  setOgretmenId(e.target.value);
                  setCakisma(null);
                }}
              >
                <option value="">{t('operasyon.takvim.form.ogretmenKendim')}</option>
                {ogretmenler.map((o2) => (
                  <option key={o2.id} value={o2.id}>
                    {o2.ad || t('operasyon.ortak.adsiz')}
                  </option>
                ))}
              </Secim>
            )}
          </Alan>
        ) : null}
        <Alan etiket={t('operasyon.takvim.form.brans')}>
          {(o) => (
            <Secim
              {...o}
              value={f.brans}
              onChange={(e) => {
                guncelle('brans', e.target.value);
              }}
            >
              <option value="">{t('operasyon.takvim.form.bransAtamadan')}</option>
              {siraliBransler().map((b) => (
                <option key={b.kod} value={b.kod}>
                  {b.ad}
                </option>
              ))}
            </Secim>
          )}
        </Alan>
      </div>

      {telafi ? null : (
        <div className="flex flex-col gap-3 rounded-orta border border-kenar p-3">
          <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-medium">
            <OnayKutusu
              checked={f.tekrarla}
              onCheckedChange={(v) => {
                guncelle('tekrarla', v === true);
              }}
            />
            {t('operasyon.takvim.form.tekrarla')}
          </label>
          {f.tekrarla ? (
            <Alan
              etiket={t('operasyon.takvim.form.bitis')}
              yardim={t('operasyon.takvim.form.bitisYardim')}
              hata={hatalar.bitis}
            >
              {(o) => (
                <Girdi
                  {...o}
                  type="date"
                  min={f.tarih}
                  value={f.bitisTarihi}
                  onChange={(e) => {
                    guncelle('bitisTarihi', e.target.value);
                  }}
                />
              )}
            </Alan>
          ) : null}
        </div>
      )}

      <Alan etiket={t('operasyon.takvim.form.konu')}>
        {(o) => (
          <Girdi
            {...o}
            maxLength={200}
            value={baslik}
            onChange={(e) => {
              setBaslik(e.target.value);
            }}
          />
        )}
      </Alan>
      <div className="grid gap-4 sm:grid-cols-2">
        <Alan etiket={t('operasyon.takvim.form.online')} hata={hatalar.online}>
          {(o) => (
            <Girdi
              {...o}
              type="url"
              inputMode="url"
              placeholder="https://"
              value={f.online}
              onChange={(e) => {
                guncelle('online', e.target.value);
              }}
            />
          )}
        </Alan>
        <Alan etiket={t('operasyon.takvim.form.yer')} yardim={t('operasyon.takvim.form.yerYardim')}>
          {(o) => (
            <Girdi
              {...o}
              maxLength={500}
              value={f.yer}
              onChange={(e) => {
                guncelle('yer', e.target.value);
              }}
            />
          )}
        </Alan>
      </div>

      {cakisma ? (
        <div
          role="alert"
          className="flex flex-col gap-2 rounded-orta border border-uyari bg-uyari-yumusak p-3 text-sm"
        >
          <p className="flex items-center gap-2 font-semibold">
            <TriangleAlert className="size-4" aria-hidden />
            {t('operasyon.takvim.cakisma.baslik')}
          </p>
          <p>{t('operasyon.takvim.cakisma.aciklama')}</p>
          {cakisma.length > 0 ? (
            <ul className="list-disc pl-5">
              {cakisma.map((c) => (
                <li key={c.id}>
                  {t('operasyon.takvim.cakisma.satir', {
                    tarih: tarihBicim.format(new Date(c.baslangic_at)),
                    saat: `${yerelSaat(c.baslangic_at, saatDilimi)}-${yerelSaat(c.bitis_at, saatDilimi)}`,
                  })}
                  {c.baslik ? ` · ${c.baslik}` : ''}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      {hataMetni ? <Uyari>{hataMetni}</Uyari> : null}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Dugme type="button" gorunum="ikincil" onClick={kapat} disabled={kaydet.isPending}>
          {t('operasyon.ortak.vazgec')}
        </Dugme>
        <Dugme type="submit" disabled={kaydet.isPending}>
          {kaydet.isPending
            ? t('operasyon.takvim.form.ekleniyor')
            : cakisma
              ? t('operasyon.takvim.cakisma.yineEkle')
              : t('operasyon.takvim.form.ekle')}
        </Dugme>
      </div>
    </form>
  );
}

/** Bugunun yerel tarihini (kurum saat diliminde) formun varsayilani yapmak icin. */
export function varsayilanTarihi(saatDilimi: string): string {
  return yerelTarih(new Date(), saatDilimi);
}
