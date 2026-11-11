'use client';

import type { OdevTipi } from '@kopru/contracts';
import { t } from '@kopru/i18n';
import { useMutation } from '@tanstack/react-query';
import { ClipboardList, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';

import { OdevFormu } from './odev-formu';
import { OdevOzeti } from './odev-ozeti';

import { BosDurum } from '@/components/bos-durum';
import { HataDurumu } from '@/components/hata-durumu';
import {
  BildirimKutusu,
  DahaFazla,
  ListeIskeleti,
  basari,
  basarisiz,
  zamanYaz,
  type Bildirim,
} from '@/components/hesap/ortak';
import { BolumKapisi } from '@/components/kabuk/bolum-yer-tutucu';
import { SayfaBasligi } from '@/components/kabuk/sayfa-basligi';
import { Sekmeler } from '@/components/ogrenme/ortak';
import { Dugme } from '@/components/ui/button';
import { OnayPenceresi } from '@/components/ui/pencere';
import { Rozet } from '@/components/ui/rozet';
import { Secim } from '@/components/ui/secim';
import { useKurum } from '@/kurum/baglam';
import { hataMesaji } from '@/lib/api';
import { bransAdi } from '@/lib/bransler';
import { ogrenmeIstek } from '@/lib/hesap-istek';
import { ogrenmeYetkileri } from '@/lib/ogrenme/rol';
import { useOdevler, useOdevSablonlari, useOgrenciler, useOgrenmeYenile } from '@/lib/ogrenme/veri';
import { useGruplar } from '@/lib/operasyon-verisi';

export function OdevlerEkrani() {
  return (
    <BolumKapisi bolum="odevler">
      <OdevlerIcerigi />
    </BolumKapisi>
  );
}

const DURUMLAR = ['', 'taslak', 'yayinda', 'kapali'] as const;

function OdevlerIcerigi() {
  const { uyelik, rol } = useKurum();
  const kurumId = uyelik.kurumId;
  const yetki = ogrenmeYetkileri(rol);
  const [sekme, setSekme] = useState('odevler');
  const [form, setForm] = useState<{
    baslangic?: Parameters<typeof OdevFormu>[0]['baslangic'];
  } | null>(null);
  const [bildirim, setBildirim] = useState<Bildirim>(null);
  const [ozetId, setOzetId] = useState<string | null>(null);

  const formAc = (baslangic?: Parameters<typeof OdevFormu>[0]['baslangic']) => {
    setForm(baslangic ? { baslangic } : {});
  };

  return (
    <>
      <SayfaBasligi baslik={t('nav.odevler')} aciklama={t('ogrenme.odev.aciklama')}>
        {yetki.yazabilir ? (
          <Dugme
            onClick={() => {
              formAc();
            }}
          >
            <Plus aria-hidden />
            {t('ogrenme.odev.yeni')}
          </Dugme>
        ) : null}
      </SayfaBasligi>
      <div className="mb-4">
        <BildirimKutusu bildirim={bildirim} />
      </div>
      {ozetId ? (
        <OdevOzeti
          kurumId={kurumId}
          odevId={ozetId}
          geri={() => {
            setOzetId(null);
          }}
        />
      ) : (
        <Sekmeler
          deger={sekme}
          degisti={setSekme}
          etiket={t('nav.odevler')}
          sekmeler={[
            {
              anahtar: 'odevler',
              etiket: t('ogrenme.odev.sekme.odevler'),
              icerik: (
                <OdevListesi
                  kurumId={kurumId}
                  ozetAc={setOzetId}
                  yeniOdev={() => {
                    formAc();
                  }}
                  bildirim={setBildirim}
                />
              ),
            },
            {
              anahtar: 'sablonlar',
              etiket: t('ogrenme.odev.sekme.sablonlar'),
              icerik: (
                <SablonListesi
                  kurumId={kurumId}
                  kullan={(s) => {
                    formAc({
                      baslik: s.baslik,
                      baslikElle: true,
                      brans: s.brans_kodu,
                      konuId: s.konu_id,
                      tur: s.tur,
                      kaynak: s.kaynak ?? '',
                      hedefSayi: s.hedef_soru_sayisi ? String(s.hedef_soru_sayisi) : '',
                    });
                  }}
                  bildirim={setBildirim}
                />
              ),
            },
          ]}
        />
      )}
      {form ? (
        <OdevFormu
          kurumId={kurumId}
          genisHedef={yetki.genisHedef}
          {...(form.baslangic ? { baslangic: form.baslangic } : {})}
          kapat={() => {
            setForm(null);
          }}
          bitti={(m) => {
            setForm(null);
            setBildirim(basari(m));
            setSekme('odevler');
          }}
        />
      ) : null}
    </>
  );
}

function OdevListesi({
  kurumId,
  ozetAc,
  yeniOdev,
  bildirim,
}: {
  kurumId: string;
  ozetAc: (id: string) => void;
  yeniOdev: () => void;
  bildirim: (b: Bildirim) => void;
}) {
  const [durum, setDurum] = useState<(typeof DURUMLAR)[number]>('');
  const veri = useOdevler(kurumId, durum);
  const gruplar = useGruplar(kurumId);
  const ogrenciler = useOgrenciler(kurumId);
  const yenile = useOgrenmeYenile(kurumId);

  const yayinla = useMutation({
    mutationFn: (o: OdevTipi) =>
      ogrenmeIstek(`kurumlar/${kurumId}/odevler/${o.id}/yayinla`, { yontem: 'POST' }),
    onSuccess: async () => {
      await yenile();
      bildirim(basari(t('ogrenme.odev.yayinlandi')));
    },
    onError: (h) => {
      bildirim(basarisiz(h));
    },
  });

  const hedefAdi = (o: OdevTipi): string => {
    if (o.hedef_turu === 'kurum') return t('ogrenme.odev.hedefTuru.kurum');
    if (o.hedef_turu === 'grup')
      return gruplar.adlar.get(o.hedef_id)?.etiket ?? t('ogrenme.odev.hedefTuru.grup');
    if (o.hedef_turu === 'ogrenci')
      return ogrenciler.adlar.get(o.hedef_id) ?? t('ogrenme.odev.hedefTuru.ogrenci');
    return t('ogrenme.odev.hedefTuru.kademe');
  };

  return (
    <section
      aria-label={t('ogrenme.odev.liste')}
      className="rounded-buyuk border border-kenar bg-yuzey"
    >
      <div className="flex flex-wrap items-center gap-3 border-b border-kenar p-4">
        <label htmlFor="odev-durum" className="text-sm font-medium">
          {t('ogrenme.odev.durumSuzgeci')}
        </label>
        <div className="w-44">
          <Secim
            id="odev-durum"
            value={durum}
            onChange={(e) => {
              setDurum(e.target.value as (typeof DURUMLAR)[number]);
            }}
          >
            {DURUMLAR.map((d) => (
              <option key={d || 'tumu'} value={d}>
                {d ? t(`ogrenme.odev.odevDurum.${d}`) : t('ogrenme.ortak.tumu')}
              </option>
            ))}
          </Secim>
        </div>
      </div>
      {veri.isPending ? (
        <ListeIskeleti satir={4} />
      ) : veri.isError ? (
        <HataDurumu
          baslik={t('ogrenme.odev.yuklenemedi')}
          aciklama={hataMesaji(veri.error)}
          tekrarDene={() => void veri.refetch()}
        />
      ) : veri.odevler.length === 0 ? (
        <BosDurum
          className="py-14"
          ikon={ClipboardList}
          baslik={durum ? t('ogrenme.odev.bosSuzgec') : t('ogrenme.odev.bos')}
          aciklama={durum ? t('ogrenme.odev.bosSuzgecAciklama') : t('ogrenme.odev.bosAciklama')}
        >
          {durum ? null : <Dugme onClick={yeniOdev}>{t('ogrenme.odev.ilkOdev')}</Dugme>}
        </BosDurum>
      ) : (
        <ul className="divide-y divide-kenar">
          {veri.odevler.map((o) => (
            <li key={o.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{o.baslik}</p>
                <p className="text-sm text-metin-ikincil">
                  {bransAdi(o.brans_kodu)} · {hedefAdi(o)}
                  {o.son_teslim_at
                    ? ` · ${t('ogrenme.odev.sonTeslimGoster', { tarih: zamanYaz(o.son_teslim_at) })}`
                    : ''}
                </p>
              </div>
              <Rozet ton={o.durum === 'yayinda' ? 'basari' : 'notr'}>
                {t(`ogrenme.odev.odevDurum.${o.durum}`)}
              </Rozet>
              {o.durum !== 'taslak' ? (
                <span className="text-sm text-metin-ikincil">
                  {t('ogrenme.odev.atananSayisi', { n: o.atanan_sayisi })}
                </span>
              ) : null}
              {o.durum === 'taslak' ? (
                <Dugme
                  boyut="sm"
                  gorunum="ikincil"
                  disabled={yayinla.isPending}
                  aria-label={t('ogrenme.odev.yayinlaEtiket', { baslik: o.baslik })}
                  onClick={() => {
                    yayinla.mutate(o);
                  }}
                >
                  {t('ogrenme.odev.yayinla')}
                </Dugme>
              ) : null}
              <Dugme
                boyut="sm"
                gorunum="ikincil"
                aria-label={t('ogrenme.odev.ozetEtiket', { baslik: o.baslik })}
                onClick={() => {
                  ozetAc(o.id);
                }}
              >
                {t('ogrenme.odev.ozetEylem')}
              </Dugme>
            </li>
          ))}
        </ul>
      )}
      <DahaFazla
        daha={veri.hasNextPage}
        yukleniyor={veri.isFetchingNextPage}
        yukle={() => void veri.fetchNextPage()}
      />
    </section>
  );
}

function SablonListesi({
  kurumId,
  kullan,
  bildirim,
}: {
  kurumId: string;
  kullan: (s: {
    baslik: string;
    brans_kodu: string;
    konu_id: string | null;
    tur: 'soru' | 'sayfa' | 'serbest';
    kaynak: string | null;
    hedef_soru_sayisi: number | null;
  }) => void;
  bildirim: (b: Bildirim) => void;
}) {
  const sablonlar = useOdevSablonlari(kurumId);
  const yenile = useOgrenmeYenile(kurumId);
  const [silinecek, setSilinecek] = useState<{ id: string; baslik: string } | null>(null);
  const sil = useMutation({
    mutationFn: (id: string) =>
      ogrenmeIstek(`kurumlar/${kurumId}/odev-sablonlari/${id}`, { yontem: 'DELETE' }),
    onSuccess: async () => {
      await yenile();
      setSilinecek(null);
      bildirim(basari(t('ogrenme.odev.sablonSilindi')));
    },
    onError: (h) => {
      setSilinecek(null);
      bildirim(basarisiz(h));
    },
  });
  const liste = useMemo(() => sablonlar.data?.sablonlar ?? [], [sablonlar.data]);

  return (
    <section
      aria-label={t('ogrenme.odev.sekme.sablonlar')}
      className="rounded-buyuk border border-kenar bg-yuzey"
    >
      {sablonlar.isPending ? (
        <ListeIskeleti satir={3} />
      ) : sablonlar.isError ? (
        <HataDurumu
          baslik={t('ogrenme.odev.sablonYuklenemedi')}
          aciklama={hataMesaji(sablonlar.error)}
          tekrarDene={() => void sablonlar.refetch()}
        />
      ) : liste.length === 0 ? (
        <BosDurum
          className="py-14"
          ikon={ClipboardList}
          baslik={t('ogrenme.odev.sablonBos')}
          aciklama={t('ogrenme.odev.sablonBosAciklama')}
        />
      ) : (
        <ul className="divide-y divide-kenar">
          {liste.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{s.baslik}</p>
                <p className="text-sm text-metin-ikincil">
                  {bransAdi(s.brans_kodu)} · {t(`ogrenme.odev.turAd.${s.tur}`)}
                  {s.kaynak ? ` · ${s.kaynak}` : ''}
                </p>
              </div>
              <Dugme
                boyut="sm"
                aria-label={t('ogrenme.odev.sablonKullanEtiket', { baslik: s.baslik })}
                onClick={() => {
                  kullan(s);
                }}
              >
                {t('ogrenme.odev.sablonKullan')}
              </Dugme>
              <Dugme
                boyut="sm"
                gorunum="hayalet"
                aria-label={t('ogrenme.odev.sablonSilEtiket', { baslik: s.baslik })}
                onClick={() => {
                  setSilinecek({ id: s.id, baslik: s.baslik });
                }}
              >
                {t('ogrenme.ortak.sil')}
              </Dugme>
            </li>
          ))}
        </ul>
      )}
      <OnayPenceresi
        acik={silinecek !== null}
        degisti={(a) => {
          if (!a) setSilinecek(null);
        }}
        baslik={t('ogrenme.odev.sablonSilBaslik')}
        aciklama={t('ogrenme.odev.sablonSilAciklama', { baslik: silinecek?.baslik ?? '' })}
        onayEtiketi={t('ogrenme.ortak.sil')}
        tehlikeli
        bekliyor={sil.isPending}
        onay={() => {
          if (silinecek) sil.mutate(silinecek.id);
        }}
      />
    </section>
  );
}
