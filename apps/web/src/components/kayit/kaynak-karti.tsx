'use client';

import { KaynakSilYanitSema, KaynakSorunCozYanitSema, type KaynakSema } from '@kopru/contracts';
import { t } from '@kopru/i18n';
import { useMutation } from '@tanstack/react-query';
import {
  ExternalLink,
  Eye,
  EyeOff,
  MessageSquareWarning,
  Pencil,
  Trash2,
  Users,
} from 'lucide-react';
import { useState } from 'react';
import type { z } from 'zod';

import { KaynakDuzenle } from './kaynak-duzenle';
import { SaglayiciIkonu, SaglayiciEtiketi } from './saglayici-etiketi';

import { HataDurumu } from '@/components/hata-durumu';
import { tarihYaz, zamanYaz } from '@/components/hesap/ortak';
import { Dugme } from '@/components/ui/button';
import { Iskelet } from '@/components/ui/kart';
import { OnayPenceresi } from '@/components/ui/pencere';
import { Rozet } from '@/components/ui/rozet';
import { Uyari } from '@/components/ui/uyari';
import { hataMesaji } from '@/lib/api';
import { bransAdi } from '@/lib/bransler';
import { dersIstek } from '@/lib/hesap-istek';
import { guvenliAdres } from '@/lib/kayit/saglayici';
import { useIzlemeler, useKayitYenile, useSorunlar } from '@/lib/kayit/veri';

export type Kaynak = z.infer<typeof KaynakSema>;

type Panel = 'izleyenler' | 'sorunlar' | null;

/** Personel icin bir kayit/materyal satiri: izleyenler, "acilmiyor" bildirimleri ve yonetim eylemleri. */
export function KaynakKarti({
  kurumId,
  kaynak: k,
  grupAdi,
  bildir,
}: {
  kurumId: string;
  kaynak: Kaynak;
  grupAdi?: string | undefined;
  /** Eylem sonucu (ornegin "Kayit silindi") ust bilesende gosterilir. */
  bildir?: (metin: string) => void;
}) {
  const yenile = useKayitYenile(kurumId);
  const [panel, setPanel] = useState<Panel>(null);
  const [duzenle, setDuzenle] = useState(false);
  const [silOnay, setSilOnay] = useState(false);
  const adres = guvenliAdres(k.url);

  const gizle = useMutation({
    mutationFn: () =>
      dersIstek(`kurumlar/${kurumId}/kaynaklar/${k.id}`, {
        yontem: 'PATCH',
        govde: { durum: k.durum === 'gizli' ? 'aktif' : 'gizli' },
      }),
    onSuccess: async () => {
      await yenile();
      bildir?.(
        k.durum === 'gizli'
          ? t('kayitGeriBildirim.kart.gosterildi')
          : t('kayitGeriBildirim.kart.gizlendi'),
      );
    },
  });
  const sil = useMutation({
    mutationFn: () =>
      dersIstek(`kurumlar/${kurumId}/kaynaklar/${k.id}`, {
        yontem: 'DELETE',
        sema: KaynakSilYanitSema,
      }),
    onSuccess: async () => {
      setSilOnay(false);
      await yenile();
      bildir?.(t('kayitGeriBildirim.kart.silindi'));
    },
  });

  const [simdi] = useState(() => Date.now());
  const gecerlilikGecmis =
    k.gecerlilik_bitis_at !== null && Date.parse(k.gecerlilik_bitis_at) < simdi;
  const sec = (p: Exclude<Panel, null>) => {
    setPanel((onceki) => (onceki === p ? null : p));
  };

  return (
    <li className="flex flex-col gap-3 px-4 py-3" data-testid="kaynak-satiri">
      <div className="flex flex-wrap items-start gap-3">
        <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-orta bg-yuzey-ikincil">
          <SaglayiciIkonu saglayici={k.saglayici} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="break-words font-medium">{k.baslik}</p>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-metin-ikincil">
            <SaglayiciEtiketi saglayici={k.saglayici} />
            {k.tur === 'materyal' ? <span>{t('kayitGeriBildirim.tur.materyal')}</span> : null}
            {k.ders_baslangic_at ? <span>{tarihYaz(k.ders_baslangic_at)}</span> : null}
            {k.brans_kodu ? <span>{bransAdi(k.brans_kodu)}</span> : null}
            {grupAdi ? <span>{grupAdi}</span> : null}
            <span>{t(`kayitGeriBildirim.gorunurluk.${k.gorunurluk}`)}</span>
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm text-metin-ikincil">
            <span>{t('kayitGeriBildirim.kart.izleyen', { n: k.izleyen_sayisi })}</span>
            {k.gecerlilik_bitis_at ? (
              <span>
                {t('kayitGeriBildirim.kart.sonErisim', { tarih: tarihYaz(k.gecerlilik_bitis_at) })}
              </span>
            ) : null}
            {k.parola_var ? <span>{t('kayitGeriBildirim.kart.parolaVar')}</span> : null}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {k.durum === 'bozuk' ? (
            <Rozet ton="uyari">{t('kayitGeriBildirim.durum.bozuk')}</Rozet>
          ) : null}
          {k.durum === 'gizli' ? <Rozet>{t('kayitGeriBildirim.durum.gizli')}</Rozet> : null}
          {k.durum === 'suresi_doldu' || (gecerlilikGecmis && k.durum === 'aktif') ? (
            <Rozet ton="hata">{t('kayitGeriBildirim.durum.suresi_doldu')}</Rozet>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {adres ? (
          <a
            href={adres}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-9 items-center gap-2 rounded-orta border border-kenar bg-yuzey px-3 text-sm font-medium hover:bg-yuzey-ikincil"
          >
            {t('kayitGeriBildirim.kart.ac')}
            <ExternalLink className="size-4" aria-hidden />
            <span className="sr-only">{t('kayitGeriBildirim.kart.yeniSekme')}</span>
          </a>
        ) : null}
        <Dugme
          type="button"
          boyut="sm"
          gorunum={panel === 'izleyenler' ? 'birincil' : 'ikincil'}
          aria-expanded={panel === 'izleyenler'}
          onClick={() => {
            sec('izleyenler');
          }}
        >
          <Users aria-hidden />
          {t('kayitGeriBildirim.kart.izleyenler')}
        </Dugme>
        <Dugme
          type="button"
          boyut="sm"
          gorunum={panel === 'sorunlar' ? 'birincil' : 'ikincil'}
          aria-expanded={panel === 'sorunlar'}
          onClick={() => {
            sec('sorunlar');
          }}
        >
          <MessageSquareWarning aria-hidden />
          {k.acik_sorun_sayisi > 0
            ? t('kayitGeriBildirim.kart.acilmiyorSayili', { n: k.acik_sorun_sayisi })
            : t('kayitGeriBildirim.kart.acilmiyor')}
        </Dugme>
        <Dugme
          type="button"
          boyut="sm"
          gorunum="ikincil"
          onClick={() => {
            setDuzenle(true);
          }}
        >
          <Pencil aria-hidden />
          {t('kayitGeriBildirim.kart.duzenle')}
        </Dugme>
        <Dugme
          type="button"
          boyut="sm"
          gorunum="ikincil"
          disabled={gizle.isPending}
          onClick={() => {
            gizle.mutate();
          }}
        >
          {k.durum === 'gizli' ? <Eye aria-hidden /> : <EyeOff aria-hidden />}
          {k.durum === 'gizli'
            ? t('kayitGeriBildirim.kart.goster')
            : t('kayitGeriBildirim.kart.gizle')}
        </Dugme>
        <Dugme
          type="button"
          boyut="sm"
          gorunum="hayalet"
          onClick={() => {
            setSilOnay(true);
          }}
        >
          <Trash2 aria-hidden />
          {t('kayitGeriBildirim.kart.sil')}
        </Dugme>
      </div>

      {gizle.isError ? <Uyari>{hataMesaji(gizle.error)}</Uyari> : null}
      {panel === 'izleyenler' ? <Izleyenler kurumId={kurumId} kaynakId={k.id} /> : null}
      {panel === 'sorunlar' ? <Sorunlar kurumId={kurumId} kaynakId={k.id} /> : null}

      {duzenle ? (
        <KaynakDuzenle
          kurumId={kurumId}
          kaynak={k}
          kapat={() => {
            setDuzenle(false);
          }}
          bitti={() => {
            setDuzenle(false);
            bildir?.(t('kayitGeriBildirim.kart.guncellendi'));
          }}
        />
      ) : null}

      <OnayPenceresi
        acik={silOnay}
        degisti={(a) => {
          if (!sil.isPending) setSilOnay(a);
        }}
        baslik={t('kayitGeriBildirim.kart.silBaslik')}
        aciklama={t('kayitGeriBildirim.kart.silAciklama', { baslik: k.baslik })}
        onayEtiketi={t('kayitGeriBildirim.kart.silOnay')}
        tehlikeli
        bekliyor={sil.isPending}
        onay={() => {
          sil.mutate();
        }}
        icerik={sil.isError ? <Uyari className="mt-3">{hataMesaji(sil.error)}</Uyari> : null}
      />
    </li>
  );
}

function Yukleniyor() {
  return (
    <div role="status" aria-label={t('ortak.yukleniyor')} className="flex flex-col gap-2">
      <Iskelet className="h-5 w-1/3" />
      <Iskelet className="h-5 w-1/2" />
    </div>
  );
}

function Izleyenler({ kurumId, kaynakId }: { kurumId: string; kaynakId: string }) {
  const q = useIzlemeler(kurumId, kaynakId, true);
  return (
    <section
      aria-label={t('kayitGeriBildirim.kart.izleyenler')}
      className="rounded-orta bg-yuzey-ikincil/60 p-3 text-sm"
    >
      {q.isPending ? (
        <Yukleniyor />
      ) : q.isError ? (
        <HataDurumu
          baslik={t('kayitGeriBildirim.kart.izlemeYuklenemedi')}
          aciklama={hataMesaji(q.error)}
          tekrarDene={() => void q.refetch()}
          className="py-3"
        />
      ) : q.data.hedef_sayisi === 0 ? (
        <p className="text-metin-ikincil">{t('kayitGeriBildirim.kart.hedefYok')}</p>
      ) : (
        <>
          <p className="mb-2 font-medium">
            {t('kayitGeriBildirim.kart.izlemeOzeti', {
              n: q.data.izleyenler.length,
              toplam: q.data.hedef_sayisi,
            })}
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <h4 className="mb-1 text-metin-ikincil">
                {t('kayitGeriBildirim.kart.izleyenlerBaslik')}
              </h4>
              {q.data.izleyenler.length === 0 ? (
                <p className="text-metin-ikincil">{t('kayitGeriBildirim.kart.kimseYok')}</p>
              ) : (
                <ul className="flex flex-col gap-0.5">
                  {q.data.izleyenler.map((i) => (
                    <li key={i.ogrenci_id}>
                      {i.gorunen_ad ?? t('operasyon.ortak.adsiz')}{' '}
                      <span className="text-metin-ikincil">({zamanYaz(i.izledi_at)})</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <h4 className="mb-1 text-metin-ikincil">
                {t('kayitGeriBildirim.kart.izlemeyenlerBaslik')}
              </h4>
              {q.data.izlemeyenler.length === 0 ? (
                <p className="text-metin-ikincil">{t('kayitGeriBildirim.kart.kimseYok')}</p>
              ) : (
                <ul className="flex flex-col gap-0.5">
                  {q.data.izlemeyenler.map((i) => (
                    <li key={i.ogrenci_id}>{i.gorunen_ad ?? t('operasyon.ortak.adsiz')}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
}

function Sorunlar({ kurumId, kaynakId }: { kurumId: string; kaynakId: string }) {
  const q = useSorunlar(kurumId, kaynakId, true);
  const yenile = useKayitYenile(kurumId);
  const coz = useMutation({
    mutationFn: () =>
      dersIstek(`kurumlar/${kurumId}/kaynaklar/${kaynakId}/sorunlar/coz`, {
        yontem: 'POST',
        sema: KaynakSorunCozYanitSema,
      }),
    onSuccess: () => yenile(),
  });
  const acikSayisi = q.data?.sorunlar.filter((s) => s.durum === 'acik').length ?? 0;
  return (
    <section
      aria-label={t('kayitGeriBildirim.kart.sorunlarBaslik')}
      className="rounded-orta bg-yuzey-ikincil/60 p-3 text-sm"
    >
      {q.isPending ? (
        <Yukleniyor />
      ) : q.isError ? (
        <HataDurumu
          baslik={t('kayitGeriBildirim.kart.sorunYuklenemedi')}
          aciklama={hataMesaji(q.error)}
          tekrarDene={() => void q.refetch()}
          className="py-3"
        />
      ) : q.data.sorunlar.length === 0 ? (
        <p className="text-metin-ikincil">{t('kayitGeriBildirim.kart.sorunYok')}</p>
      ) : (
        <>
          <ul className="flex flex-col gap-2">
            {q.data.sorunlar.map((s) => (
              <li key={s.id} className="flex flex-col gap-0.5">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{s.bildiren_ad ?? t('operasyon.ortak.adsiz')}</span>
                  <Rozet ton={s.durum === 'acik' ? 'uyari' : 'basari'}>
                    {t(`kayitGeriBildirim.sorunDurum.${s.durum}`)}
                  </Rozet>
                  <span className="text-metin-ikincil">{zamanYaz(s.created_at)}</span>
                </span>
                <span>
                  {t(`kayitGeriBildirim.neden.${s.neden}`)}
                  {s.aciklama ? `: ${s.aciklama}` : ''}
                </span>
              </li>
            ))}
          </ul>
          {acikSayisi > 0 ? (
            <div className="mt-3 flex flex-col items-start gap-2">
              <Dugme
                type="button"
                boyut="sm"
                disabled={coz.isPending}
                onClick={() => {
                  coz.mutate();
                }}
              >
                {t('kayitGeriBildirim.kart.cozuldu')}
              </Dugme>
              {coz.isError ? <Uyari>{hataMesaji(coz.error)}</Uyari> : null}
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
