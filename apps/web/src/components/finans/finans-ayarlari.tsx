'use client';

import {
  AylikOzetSema,
  FinansAyarSema,
  KrediPolitikasiSema,
  UcretTarifesiListeYanitSema,
} from '@kopru/contracts';
import { kurusBicimle, t } from '@kopru/i18n';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Download, Plus } from 'lucide-react';
import { useState, type SyntheticEvent } from 'react';

import { finansAnahtari, useFinansYenile, usePaketler } from './finans-verisi';

import { BosDurum } from '@/components/bos-durum';
import { HataDurumu } from '@/components/hata-durumu';
import {
  BildirimKutusu,
  basari,
  basarisiz,
  ListeIskeleti,
  tarihYaz,
  type Bildirim,
} from '@/components/hesap/ortak';
import { Alan } from '@/components/operasyon/ortak';
import { Dugme } from '@/components/ui/button';
import { OnayKutusu } from '@/components/ui/checkbox';
import { Girdi } from '@/components/ui/input';
import { Kart } from '@/components/ui/kart';
import { Pencere } from '@/components/ui/pencere';
import { Secim } from '@/components/ui/secim';
import { Uyari } from '@/components/ui/uyari';
import { useKurum } from '@/kurum/baglam';
import { hataMesaji } from '@/lib/api';
import { finansDosyaAl, finansIstek } from '@/lib/hesap-istek';
import { tutarCoz } from '@/lib/operasyon';
import { useGruplar, useSaatDilimi } from '@/lib/operasyon-verisi';
import { bugunYerel, yerelAy } from '@/lib/saat';
import { yenidenDene } from '@/lib/sayfali-sorgu';

/** Sahip/yonetici ayarlari: paket sablonlari, ucret tarifeleri, kredi politikasi, ozet ve Excel. */
export function FinansAyarlari() {
  const { uyelik } = useKurum();
  const kurumId = uyelik.kurumId;
  const [bildirim, setBildirim] = useState<Bildirim>(null);
  return (
    <div className="flex flex-col gap-6">
      <BildirimKutusu bildirim={bildirim} />
      <AylikOzet kurumId={kurumId} bildir={setBildirim} />
      <Paketler kurumId={kurumId} bildir={setBildirim} />
      <Tarifeler kurumId={kurumId} bildir={setBildirim} />
      <Politika kurumId={kurumId} bildir={setBildirim} />
    </div>
  );
}

function Bolum({
  baslik,
  aciklama,
  eylem,
  children,
}: {
  baslik: string;
  aciklama?: string;
  eylem?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Kart aria-label={baslik}>
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-kenar px-4 py-3">
        <div>
          <h2 className="text-base font-semibold">{baslik}</h2>
          {aciklama ? <p className="mt-0.5 text-sm text-metin-ikincil">{aciklama}</p> : null}
        </div>
        {eylem}
      </header>
      {children}
    </Kart>
  );
}

// --- Aylik ozet ve Excel ------------------------------------------------------------------------

function AylikOzet({ kurumId, bildir }: { kurumId: string; bildir: (b: Bildirim) => void }) {
  const { saatDilimi } = useSaatDilimi(kurumId);
  const [ay, setAy] = useState<string | null>(null);
  const secili = ay ?? yerelAy(saatDilimi);
  const q = useQuery({
    queryKey: [...finansAnahtari(kurumId), 'ozet', secili],
    retry: yenidenDene,
    queryFn: () =>
      finansIstek(`kurumlar/${kurumId}/ozet/aylik?ay=${secili}`, { sema: AylikOzetSema }),
  });
  const indir = useMutation({
    mutationFn: async () => {
      const { blob, dosyaAdi } = await finansDosyaAl(
        `kurumlar/${kurumId}/disa-aktar?ay=${secili}`,
        `finans-${secili}.xlsx`,
      );
      const adres = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = adres;
      a.download = dosyaAdi;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => {
        URL.revokeObjectURL(adres);
      }, 1000);
    },
    onSuccess: () => {
      bildir(basari(t('operasyon.finans.ayar.excelIndi')));
    },
    onError: (hata) => {
      bildir(basarisiz(hata));
    },
  });

  return (
    <Bolum
      baslik={t('operasyon.finans.ayar.ozet')}
      eylem={
        <Dugme
          gorunum="ikincil"
          disabled={indir.isPending}
          onClick={() => {
            indir.mutate();
          }}
        >
          <Download aria-hidden />
          {indir.isPending
            ? t('operasyon.finans.ayar.excelIniyor')
            : t('operasyon.finans.ayar.excel')}
        </Dugme>
      }
    >
      <div className="flex flex-col gap-4 p-4">
        <Alan etiket={t('operasyon.finans.ayar.ozetAy')} className="max-w-52">
          {(o) => (
            <Girdi
              {...o}
              type="month"
              value={secili}
              onChange={(e) => {
                if (/^\d{4}-\d{2}$/.test(e.target.value)) setAy(e.target.value);
              }}
            />
          )}
        </Alan>
        {q.isPending ? (
          <ListeIskeleti satir={2} />
        ) : q.isError ? (
          <HataDurumu
            aciklama={hataMesaji(q.error)}
            tekrarDene={() => void q.refetch()}
            className="py-6"
          />
        ) : q.data.tahsilat_sayisi === 0 ? (
          <BosDurum
            ikon={Download}
            className="py-6"
            baslik={t('operasyon.finans.ayar.ozetBos')}
            aciklama={t('operasyon.finans.ayar.ozetBosAciklama')}
          />
        ) : (
          <div>
            <p className="text-sm text-metin-ikincil">{t('operasyon.finans.ayar.ozetToplam')}</p>
            <p className="text-3xl font-semibold tabular-nums">
              {kurusBicimle(q.data.toplam_kurus)}
            </p>
            <p className="text-sm text-metin-ikincil">
              {t('operasyon.finans.ayar.ozetAdet', { sayi: q.data.tahsilat_sayisi })}
            </p>
            <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
              {q.data.yonteme_gore.map((y) => (
                <li key={y.yontem}>
                  {t(`operasyon.finans.yontem.${y.yontem}`)}:{' '}
                  <span className="font-medium tabular-nums">{kurusBicimle(y.toplam_kurus)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Bolum>
  );
}

// --- Paket sablonlari ---------------------------------------------------------------------------

function Paketler({ kurumId, bildir }: { kurumId: string; bildir: (b: Bildirim) => void }) {
  const yenile = useFinansYenile(kurumId);
  const q = usePaketler(kurumId);
  const [acik, setAcik] = useState(false);
  const arsivle = useMutation({
    mutationFn: (id: string) =>
      finansIstek(`kurumlar/${kurumId}/paketler/${id}/arsivle`, { yontem: 'POST' }),
    onSuccess: () => {
      void yenile();
      bildir(basari(t('operasyon.finans.ayar.paketArsivlendi')));
    },
    onError: (h) => {
      bildir(basarisiz(h));
    },
  });
  return (
    <Bolum
      baslik={t('operasyon.finans.ayar.paketler')}
      eylem={
        <Dugme
          boyut="sm"
          onClick={() => {
            setAcik(true);
          }}
        >
          <Plus aria-hidden />
          {t('operasyon.finans.ayar.paketEkle')}
        </Dugme>
      }
    >
      {q.isPending ? (
        <ListeIskeleti satir={2} />
      ) : q.isError ? (
        <HataDurumu
          aciklama={hataMesaji(q.error)}
          tekrarDene={() => void q.refetch()}
          className="py-6"
        />
      ) : q.data.paketler.length === 0 ? (
        <BosDurum
          ikon={Plus}
          className="py-8"
          baslik={t('operasyon.finans.ayar.paketBos')}
          aciklama={t('operasyon.finans.ayar.paketBosAciklama')}
        />
      ) : (
        <ul className="divide-y divide-kenar">
          {q.data.paketler.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{p.ad}</p>
                <p className="text-sm text-metin-ikincil">
                  {t('operasyon.finans.ayar.paketDetay', {
                    kredi: p.kredi_adedi,
                    fiyat: kurusBicimle(p.fiyat_kurus),
                  })}
                </p>
              </div>
              <Dugme
                gorunum="ikincil"
                boyut="sm"
                disabled={arsivle.isPending}
                onClick={() => {
                  arsivle.mutate(p.id);
                }}
              >
                {t('operasyon.finans.ayar.paketArsivle')}
              </Dugme>
            </li>
          ))}
        </ul>
      )}
      <Pencere acik={acik} degisti={setAcik} baslik={t('operasyon.finans.ayar.paketEkle')}>
        <PaketFormu
          kurumId={kurumId}
          kapat={() => {
            setAcik(false);
          }}
          bildir={bildir}
        />
      </Pencere>
    </Bolum>
  );
}

function PaketFormu({
  kurumId,
  kapat,
  bildir,
}: {
  kurumId: string;
  kapat: () => void;
  bildir: (b: Bildirim) => void;
}) {
  const yenile = useFinansYenile(kurumId);
  const [ad, setAd] = useState('');
  const [kredi, setKredi] = useState('8');
  const [fiyat, setFiyat] = useState('');
  const [gun, setGun] = useState('');
  const [h, setH] = useState<{ ad?: string; kredi?: string; fiyat?: string }>({});
  const kaydet = useMutation({
    mutationFn: (govde: Record<string, unknown>) =>
      finansIstek(`kurumlar/${kurumId}/paketler`, { yontem: 'POST', govde }),
    onSuccess: () => {
      void yenile();
      bildir(basari(t('operasyon.finans.ayar.paketEklendi')));
      kapat();
    },
  });
  const gonder = (e: SyntheticEvent) => {
    e.preventDefault();
    const hatalar: typeof h = {};
    const k = Number(kredi);
    if (!ad.trim()) hatalar.ad = t('operasyon.finans.ayar.paketHata.ad');
    if (!Number.isInteger(k) || k < 1 || k > 10_000) {
      hatalar.kredi = t('operasyon.finans.ayar.paketHata.kredi');
    }
    const f = fiyat.trim() === '0' ? { ok: true as const, kurus: 0 } : tutarCoz(fiyat);
    if (!f.ok) hatalar.fiyat = t('operasyon.finans.ayar.paketHata.fiyat');
    setH(hatalar);
    if (Object.keys(hatalar).length > 0 || !f.ok) return;
    const gunSayisi = Number(gun);
    kaydet.mutate({
      ad: ad.trim(),
      kredi_adedi: k,
      fiyat_kurus: f.kurus,
      ...(gun.trim() && Number.isInteger(gunSayisi) && gunSayisi > 0
        ? { gecerlilik_gun: gunSayisi }
        : {}),
    });
  };
  return (
    <form onSubmit={gonder} noValidate className="flex flex-col gap-4">
      <Alan etiket={t('operasyon.finans.ayar.paketAd')} hata={h.ad}>
        {(o) => (
          <Girdi
            {...o}
            maxLength={200}
            value={ad}
            onChange={(e) => {
              setAd(e.target.value);
            }}
          />
        )}
      </Alan>
      <div className="grid gap-4 sm:grid-cols-2">
        <Alan etiket={t('operasyon.finans.ayar.paketKredi')} hata={h.kredi}>
          {(o) => (
            <Girdi
              {...o}
              inputMode="numeric"
              value={kredi}
              onChange={(e) => {
                setKredi(e.target.value);
              }}
            />
          )}
        </Alan>
        <Alan etiket={t('operasyon.finans.ayar.paketFiyat')} hata={h.fiyat}>
          {(o) => (
            <Girdi
              {...o}
              inputMode="decimal"
              autoComplete="off"
              value={fiyat}
              onChange={(e) => {
                setFiyat(e.target.value);
              }}
            />
          )}
        </Alan>
      </div>
      <Alan etiket={t('operasyon.finans.ayar.paketGecerlilik')}>
        {(o) => (
          <Girdi
            {...o}
            inputMode="numeric"
            value={gun}
            onChange={(e) => {
              setGun(e.target.value);
            }}
          />
        )}
      </Alan>
      {kaydet.isError ? <Uyari>{hataMesaji(kaydet.error)}</Uyari> : null}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Dugme type="button" gorunum="ikincil" onClick={kapat} disabled={kaydet.isPending}>
          {t('operasyon.ortak.vazgec')}
        </Dugme>
        <Dugme type="submit" disabled={kaydet.isPending}>
          {t('operasyon.finans.ayar.paketKaydet')}
        </Dugme>
      </div>
    </form>
  );
}

// --- Ucret tarifeleri ---------------------------------------------------------------------------

function Tarifeler({ kurumId, bildir }: { kurumId: string; bildir: (b: Bildirim) => void }) {
  const yenile = useFinansYenile(kurumId);
  const gruplar = useGruplar(kurumId);
  const q = useQuery({
    queryKey: [...finansAnahtari(kurumId), 'tarifeler'],
    retry: yenidenDene,
    queryFn: () =>
      finansIstek(`kurumlar/${kurumId}/ucret-tarifeleri`, { sema: UcretTarifesiListeYanitSema }),
  });
  const [acik, setAcik] = useState(false);
  const sil = useMutation({
    mutationFn: (id: string) =>
      finansIstek(`kurumlar/${kurumId}/ucret-tarifeleri/${id}`, { yontem: 'DELETE' }),
    onSuccess: () => {
      void yenile();
      bildir(basari(t('operasyon.finans.ayar.tarifeSilindi')));
    },
    onError: (h) => {
      bildir(basarisiz(h));
    },
  });
  return (
    <Bolum
      baslik={t('operasyon.finans.ayar.tarifeler')}
      eylem={
        <Dugme
          boyut="sm"
          onClick={() => {
            setAcik(true);
          }}
        >
          <Plus aria-hidden />
          {t('operasyon.finans.ayar.tarifeEkle')}
        </Dugme>
      }
    >
      {q.isPending ? (
        <ListeIskeleti satir={2} />
      ) : q.isError ? (
        <HataDurumu
          aciklama={hataMesaji(q.error)}
          tekrarDene={() => void q.refetch()}
          className="py-6"
        />
      ) : q.data.tarifeler.length === 0 ? (
        <BosDurum
          ikon={Plus}
          className="py-8"
          baslik={t('operasyon.finans.ayar.tarifeBos')}
          aciklama={t('operasyon.finans.ayar.tarifeBosAciklama')}
        />
      ) : (
        <ul className="divide-y divide-kenar">
          {q.data.tarifeler.map((x) => (
            <li key={x.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  {x.grup_id
                    ? (gruplar.adlar.get(x.grup_id)?.etiket ?? '-')
                    : t('operasyon.finans.ayar.tarifeKapsam')}
                </p>
                <p className="text-sm text-metin-ikincil">
                  {t('operasyon.finans.ayar.tarifeDetay', {
                    ucret: kurusBicimle(x.ucret_kurus),
                    baslangic: tarihYaz(x.gecerlilik_baslangic),
                  })}
                </p>
              </div>
              <Dugme
                gorunum="ikincil"
                boyut="sm"
                disabled={sil.isPending}
                onClick={() => {
                  sil.mutate(x.id);
                }}
              >
                {t('operasyon.finans.ayar.tarifeSil')}
              </Dugme>
            </li>
          ))}
        </ul>
      )}
      <Pencere acik={acik} degisti={setAcik} baslik={t('operasyon.finans.ayar.tarifeEkle')}>
        <TarifeFormu
          kurumId={kurumId}
          gruplar={gruplar.secenekler}
          kapat={() => {
            setAcik(false);
          }}
          bildir={bildir}
        />
      </Pencere>
    </Bolum>
  );
}

function TarifeFormu({
  kurumId,
  gruplar,
  kapat,
  bildir,
}: {
  kurumId: string;
  gruplar: readonly { id: string; etiket: string }[];
  kapat: () => void;
  bildir: (b: Bildirim) => void;
}) {
  const yenile = useFinansYenile(kurumId);
  const { saatDilimi } = useSaatDilimi(kurumId);
  const [ucret, setUcret] = useState('');
  const [baslangic, setBaslangic] = useState(bugunYerel(saatDilimi));
  const [bitis, setBitis] = useState('');
  const [grupId, setGrupId] = useState('');
  const [h, setH] = useState<{ ucret?: string }>({});
  const kaydet = useMutation({
    mutationFn: (govde: Record<string, unknown>) =>
      finansIstek(`kurumlar/${kurumId}/ucret-tarifeleri`, { yontem: 'POST', govde }),
    onSuccess: () => {
      void yenile();
      bildir(basari(t('operasyon.finans.ayar.tarifeEklendi')));
      kapat();
    },
  });
  const gonder = (e: SyntheticEvent) => {
    e.preventDefault();
    const c = tutarCoz(ucret);
    setH(c.ok ? {} : { ucret: t('operasyon.finans.odemeAl.hata.tutar') });
    if (!c.ok) return;
    kaydet.mutate({
      ucret_kurus: c.kurus,
      gecerlilik_baslangic: baslangic,
      ...(bitis ? { gecerlilik_bitis: bitis } : {}),
      ...(grupId ? { grup_id: grupId } : {}),
    });
  };
  return (
    <form onSubmit={gonder} noValidate className="flex flex-col gap-4">
      <Alan etiket={t('operasyon.finans.ayar.tarifeUcret')} hata={h.ucret}>
        {(o) => (
          <Girdi
            {...o}
            inputMode="decimal"
            autoComplete="off"
            value={ucret}
            onChange={(e) => {
              setUcret(e.target.value);
            }}
          />
        )}
      </Alan>
      <Alan etiket={t('operasyon.takvim.form.grup')}>
        {(o) => (
          <Secim
            {...o}
            value={grupId}
            onChange={(e) => {
              setGrupId(e.target.value);
            }}
          >
            <option value="">{t('operasyon.finans.ayar.tarifeKapsam')}</option>
            {gruplar.map((g) => (
              <option key={g.id} value={g.id}>
                {g.etiket}
              </option>
            ))}
          </Secim>
        )}
      </Alan>
      <div className="grid gap-4 sm:grid-cols-2">
        <Alan etiket={t('operasyon.finans.ayar.tarifeBaslangic')}>
          {(o) => (
            <Girdi
              {...o}
              type="date"
              value={baslangic}
              onChange={(e) => {
                setBaslangic(e.target.value);
              }}
            />
          )}
        </Alan>
        <Alan etiket={t('operasyon.finans.ayar.tarifeBitis')}>
          {(o) => (
            <Girdi
              {...o}
              type="date"
              value={bitis}
              onChange={(e) => {
                setBitis(e.target.value);
              }}
            />
          )}
        </Alan>
      </div>
      {kaydet.isError ? <Uyari>{hataMesaji(kaydet.error)}</Uyari> : null}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Dugme type="button" gorunum="ikincil" onClick={kapat} disabled={kaydet.isPending}>
          {t('operasyon.ortak.vazgec')}
        </Dugme>
        <Dugme type="submit" disabled={kaydet.isPending}>
          {t('operasyon.finans.ayar.tarifeKaydet')}
        </Dugme>
      </div>
    </form>
  );
}

// --- Kredi politikasi ve ogrenci gorunurlugu ----------------------------------------------------

const POLITIKA_ANAHTARLARI = [
  ['geldi_dusurur', 'geldi'],
  ['gec_dusurur', 'gec'],
  ['gelmedi_dusurur', 'gelmedi'],
  ['izinli_dusurur', 'izinli'],
  ['ogrenci_gec_iptal_dusurur', 'ogrenciGecIptal'],
] as const;

function Politika({ kurumId, bildir }: { kurumId: string; bildir: (b: Bildirim) => void }) {
  const politika = useQuery({
    queryKey: [...finansAnahtari(kurumId), 'politika'],
    retry: yenidenDene,
    queryFn: () =>
      finansIstek(`kurumlar/${kurumId}/kredi-politikasi`, { sema: KrediPolitikasiSema }),
  });
  const ayar = useQuery({
    queryKey: [...finansAnahtari(kurumId), 'ayar'],
    retry: yenidenDene,
    queryFn: () => finansIstek(`kurumlar/${kurumId}/ayarlar`, { sema: FinansAyarSema }),
  });
  return (
    <Bolum
      baslik={t('operasyon.finans.ayar.politika')}
      aciklama={t('operasyon.finans.ayar.politikaAciklama')}
    >
      {politika.isPending || ayar.isPending ? (
        <ListeIskeleti satir={3} />
      ) : politika.isError || ayar.isError ? (
        <HataDurumu
          baslik={t('operasyon.finans.ayar.yuklenemedi')}
          aciklama={hataMesaji(politika.error ?? ayar.error)}
          tekrarDene={() => {
            void politika.refetch();
            void ayar.refetch();
          }}
          className="py-6"
        />
      ) : (
        <PolitikaFormu
          kurumId={kurumId}
          baslangic={politika.data}
          ogrenciGorur={ayar.data.ogrenci_kalan_ders_gorur}
          bildir={bildir}
        />
      )}
    </Bolum>
  );
}

function PolitikaFormu({
  kurumId,
  baslangic,
  ogrenciGorur,
  bildir,
}: {
  kurumId: string;
  baslangic: ReturnType<typeof KrediPolitikasiSema.parse>;
  ogrenciGorur: boolean;
  bildir: (b: Bildirim) => void;
}) {
  const yenile = useFinansYenile(kurumId);
  const [p, setP] = useState(baslangic);
  const [saat, setSaat] = useState(String(baslangic.gec_iptal_saat));
  const [esik, setEsik] = useState(String(baslangic.dusuk_kredi_esigi));
  const [hata, setHata] = useState<string | null>(null);
  const [gorur, setGorur] = useState(ogrenciGorur);

  const kaydet = useMutation({
    mutationFn: (govde: Record<string, unknown>) =>
      finansIstek(`kurumlar/${kurumId}/kredi-politikasi`, { yontem: 'PUT', govde }),
    onSuccess: () => {
      void yenile();
      bildir(basari(t('operasyon.finans.ayar.politikaKaydedildi')));
    },
    onError: (h) => {
      bildir(basarisiz(h));
    },
  });
  const gorunurluk = useMutation({
    mutationFn: (deger: boolean) =>
      finansIstek(`kurumlar/${kurumId}/ayarlar`, {
        yontem: 'PUT',
        govde: { ogrenci_kalan_ders_gorur: deger },
      }),
    onSuccess: (_s, deger) => {
      setGorur(deger);
      void yenile();
      bildir(basari(t('operasyon.finans.ayar.ayarKaydedildi')));
    },
    onError: (h) => {
      bildir(basarisiz(h));
    },
  });

  const gonder = (e: SyntheticEvent) => {
    e.preventDefault();
    const s = Number(saat);
    const k = Number(esik);
    if (!Number.isInteger(s) || s < 0 || s > 168 || !Number.isInteger(k) || k < 0 || k > 1000) {
      setHata(t('hata.dogrulama_hatasi'));
      return;
    }
    setHata(null);
    kaydet.mutate({
      geldi_dusurur: p.geldi_dusurur,
      gec_dusurur: p.gec_dusurur,
      gelmedi_dusurur: p.gelmedi_dusurur,
      izinli_dusurur: p.izinli_dusurur,
      ogrenci_gec_iptal_dusurur: p.ogrenci_gec_iptal_dusurur,
      gec_iptal_saat: s,
      dusuk_kredi_esigi: k,
    });
  };

  return (
    <div className="flex flex-col gap-5 p-4">
      <form onSubmit={gonder} noValidate className="flex flex-col gap-3">
        {POLITIKA_ANAHTARLARI.map(([anahtar, ad]) => (
          <label key={anahtar} className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
            <OnayKutusu
              checked={p[anahtar]}
              onCheckedChange={(v) => {
                setP((o) => ({ ...o, [anahtar]: v === true }));
              }}
            />
            {t(`operasyon.finans.ayar.${ad}`)}
          </label>
        ))}
        <div className="grid gap-4 sm:grid-cols-2">
          <Alan etiket={t('operasyon.finans.ayar.gecIptalSaat')}>
            {(o) => (
              <Girdi
                {...o}
                inputMode="numeric"
                value={saat}
                onChange={(e) => {
                  setSaat(e.target.value);
                }}
              />
            )}
          </Alan>
          <Alan
            etiket={t('operasyon.finans.ayar.dusukEsik')}
            yardim={t('operasyon.finans.ayar.dusukEsikYardim')}
          >
            {(o) => (
              <Girdi
                {...o}
                inputMode="numeric"
                value={esik}
                onChange={(e) => {
                  setEsik(e.target.value);
                }}
              />
            )}
          </Alan>
        </div>
        {hata ? <Uyari>{hata}</Uyari> : null}
        <Dugme type="submit" className="self-start" disabled={kaydet.isPending}>
          {t('operasyon.finans.ayar.politikaKaydet')}
        </Dugme>
      </form>

      <div className="border-t border-kenar pt-4">
        <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm">
          <OnayKutusu
            checked={gorur}
            disabled={gorunurluk.isPending}
            onCheckedChange={(v) => {
              gorunurluk.mutate(v === true);
            }}
          />
          <span>
            <span className="block font-medium">
              {t('operasyon.finans.ayar.ogrenciKalanGorsun')}
            </span>
            <span className="text-metin-ikincil">
              {t('operasyon.finans.ayar.ogrenciKalanYardim')}
            </span>
          </span>
        </label>
      </div>
    </div>
  );
}
