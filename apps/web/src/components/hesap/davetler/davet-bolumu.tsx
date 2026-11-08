'use client';

import { DavetListeYanitSema, DavetOlusturYanitSema, type DavetTipi } from '@kopru/contracts';
import { t } from '@kopru/i18n';
import { useMutation, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { MailPlus, Send, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { z } from 'zod';

import {
  basari,
  basarisiz,
  BildirimKutusu,
  Bolum,
  DahaFazla,
  ListeIskeleti,
  tarihYaz,
  type Bildirim,
} from '../ortak';
import { DavetFormu, type DavetRolu, type DavetSonucu } from './davet-formu';
import { TopluDavet } from './toplu-davet';

import { BosDurum } from '@/components/bos-durum';
import { HataDurumu } from '@/components/hata-durumu';
import { Dugme } from '@/components/ui/button';
import { OnayPenceresi } from '@/components/ui/pencere';
import { Rozet } from '@/components/ui/rozet';
import { Secim } from '@/components/ui/secim';
import { hataMesaji } from '@/lib/api';
import { hesapIstek } from '@/lib/hesap-istek';
import { useSayfaliSorgu } from '@/lib/sayfali-sorgu';
import { telefonBicimle } from '@/lib/telefon';

type DavetListe = z.output<typeof DavetListeYanitSema>;
type Durum = DavetTipi['durum'];

const durumTonu = {
  bekliyor: 'uyari',
  kullanildi: 'basari',
  iptal: 'notr',
  suresi_doldu: 'notr',
} as const;

function davetHedefi(d: DavetTipi): string {
  const ad = d.hedef_ad;
  const iletisim = d.hedef_telefon_e164
    ? `+90 ${telefonBicimle(d.hedef_telefon_e164)}`
    : (d.hedef_eposta ?? null);
  if (ad && iletisim) return `${ad} · ${iletisim}`;
  return ad ?? iletisim ?? t('hesap.davet.hedefBaglanti');
}

/**
 * Davet listesi ve olusturma eylemleri. `rolu` listeyi o role daraltir (api rol suzgeci
 * sunmaz, suzme istemcide yapilir); `roller` olusturma formundaki secilebilir roller.
 */
export function DavetBolumu({
  kurumId,
  rolu,
  roller,
  grupSecilebilir,
}: {
  kurumId: string;
  rolu: readonly DavetRolu[];
  roller: readonly DavetRolu[];
  grupSecilebilir: boolean;
}) {
  const qc = useQueryClient();
  const taban = ['hesap', kurumId, 'davetler'] as const;
  const [durum, setDurum] = useState<'' | Durum>('');
  const [formAcik, setFormAcik] = useState(false);
  const [topluAcik, setTopluAcik] = useState(false);
  const [sonuc, setSonuc] = useState<{ davet: DavetSonucu; baslik?: string } | null>(null);
  const [iptalEdilecek, setIptalEdilecek] = useState<DavetTipi | null>(null);
  const [bildirim, setBildirim] = useState<Bildirim>(null);

  const sorgu = useSayfaliSorgu({
    anahtar: taban,
    yol: `kurumlar/${kurumId}/davetler`,
    sema: DavetListeYanitSema,
    sorgu: { durum: durum || undefined },
  });
  const davetler = useMemo(
    () =>
      (sorgu.data?.pages.flatMap((s) => s.davetler) ?? [])
        .filter((d) => rolu.includes(d.rol as DavetRolu))
        .sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [sorgu.data, rolu],
  );

  const iptal = useMutation({
    mutationFn: (d: DavetTipi) =>
      hesapIstek(`kurumlar/${kurumId}/davetler/${d.id}/iptal`, { yontem: 'POST' }),
    onMutate: async (d) => {
      await qc.cancelQueries({ queryKey: taban });
      const onceki = qc.getQueriesData<InfiniteData<DavetListe>>({ queryKey: taban });
      qc.setQueriesData<InfiniteData<DavetListe>>({ queryKey: taban }, (v) =>
        v
          ? {
              ...v,
              pages: v.pages.map((s) => ({
                ...s,
                davetler: s.davetler.map((x) => (x.id === d.id ? { ...x, durum: 'iptal' } : x)),
              })),
            }
          : v,
      );
      setIptalEdilecek(null);
      return { onceki };
    },
    onError: (e, _d, baglam) => {
      for (const [anahtar, veri] of baglam?.onceki ?? []) qc.setQueryData(anahtar, veri);
      setBildirim(basarisiz(e));
    },
    onSuccess: () => {
      setBildirim(basari(t('hesap.davet.iptalEdildi')));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: taban }),
  });

  const yenidenGonder = useMutation({
    mutationFn: (d: DavetTipi) =>
      hesapIstek(`kurumlar/${kurumId}/davetler/${d.id}/yeniden-gonder`, {
        yontem: 'POST',
        sema: DavetOlusturYanitSema,
      }),
    onSuccess: (yanit) => {
      void qc.invalidateQueries({ queryKey: taban });
      setBildirim(basari(t('hesap.davet.yenidenGonderildi')));
      setSonuc({ davet: yanit });
      setFormAcik(true);
    },
    onError: (e) => {
      setBildirim(basarisiz(e));
    },
  });

  return (
    <Bolum
      baslik={t('hesap.davet.baslik')}
      aciklama={t('hesap.davet.aciklama')}
      eylemler={
        <div className="flex flex-wrap gap-2">
          <Dugme
            gorunum="ikincil"
            boyut="sm"
            onClick={() => {
              setTopluAcik(true);
            }}
          >
            <Users aria-hidden />
            {t('hesap.davet.toplu')}
          </Dugme>
          <Dugme
            boyut="sm"
            onClick={() => {
              setSonuc(null);
              setFormAcik(true);
            }}
          >
            <MailPlus aria-hidden />
            {t('hesap.davet.olustur')}
          </Dugme>
        </div>
      }
    >
      <div className="flex flex-col gap-3 p-4 pb-2">
        <div className="w-52">
          <Secim
            aria-label={t('hesap.davet.durumSuz')}
            value={durum}
            onChange={(e) => {
              setDurum(e.target.value as '' | Durum);
            }}
          >
            <option value="">{t('hesap.ortak.hepsi')}</option>
            {(['bekliyor', 'kullanildi', 'iptal', 'suresi_doldu'] as const).map((d) => (
              <option key={d} value={d}>
                {t(`hesap.davet.durum.${d}`)}
              </option>
            ))}
          </Secim>
        </div>
        <BildirimKutusu bildirim={bildirim} />
      </div>

      {sorgu.isPending ? (
        <ListeIskeleti />
      ) : sorgu.isError ? (
        <HataDurumu
          baslik={t('hesap.davet.yuklenemedi')}
          aciklama={hataMesaji(sorgu.error)}
          tekrarDene={() => void sorgu.refetch()}
          className="py-8"
        />
      ) : davetler.length === 0 && !sorgu.hasNextPage ? (
        <BosDurum
          className="py-10"
          ikon={Send}
          baslik={durum ? t('hesap.davet.bosFiltre') : t('hesap.davet.bos')}
          {...(durum ? {} : { aciklama: t('hesap.davet.bosAciklama') })}
        />
      ) : (
        <>
          <ul className="divide-y divide-kenar border-t border-kenar">
            {davetler.map((d) => {
              const hedef = davetHedefi(d);
              return (
                <li key={d.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{hedef}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-metin-ikincil">
                      <Rozet ton={durumTonu[d.durum]}>{t(`hesap.davet.durum.${d.durum}`)}</Rozet>
                      <span>{t(`hesap.davet.kanal.${d.kanal}`)}</span>
                      <span>{t(`hesap.davet.rol.${d.rol as DavetRolu}`)}</span>
                      {d.kanal === 'baglanti' ? (
                        <span>
                          {t('hesap.davet.kullanim', {
                            n: d.kullanim_sayisi,
                            azami: d.max_kullanim,
                          })}
                        </span>
                      ) : (
                        <span>{t('hesap.davet.gonderim', { n: d.gonderim_sayisi })}</span>
                      )}
                      {d.durum === 'bekliyor' ? (
                        <span>
                          {t('hesap.davet.sonGecerlilik', { tarih: tarihYaz(d.expires_at) })}
                        </span>
                      ) : null}
                    </p>
                  </div>
                  {d.durum === 'bekliyor' ? (
                    <div className="flex gap-2">
                      {d.kanal !== 'baglanti' ? (
                        <Dugme
                          gorunum="ikincil"
                          boyut="sm"
                          disabled={yenidenGonder.isPending}
                          aria-label={t('hesap.davet.yenidenGonderAria', { hedef })}
                          onClick={() => {
                            yenidenGonder.mutate(d);
                          }}
                        >
                          {t('hesap.davet.yenidenGonder')}
                        </Dugme>
                      ) : null}
                      <Dugme
                        gorunum="hayalet"
                        boyut="sm"
                        aria-label={t('hesap.davet.iptalAria', { hedef })}
                        onClick={() => {
                          setIptalEdilecek(d);
                        }}
                      >
                        {t('hesap.davet.iptal')}
                      </Dugme>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
          <DahaFazla
            daha={sorgu.hasNextPage}
            yukleniyor={sorgu.isFetchingNextPage}
            yukle={() => void sorgu.fetchNextPage()}
          />
        </>
      )}

      <DavetFormu
        acik={formAcik}
        degisti={setFormAcik}
        kurumId={kurumId}
        roller={roller}
        grupSecilebilir={grupSecilebilir}
        sonuc={sonuc}
        sonucAyarla={setSonuc}
      />
      <TopluDavet
        acik={topluAcik}
        degisti={setTopluAcik}
        kurumId={kurumId}
        roller={roller}
        grupSecilebilir={grupSecilebilir}
      />
      <OnayPenceresi
        acik={iptalEdilecek !== null}
        degisti={(a) => {
          if (!a) setIptalEdilecek(null);
        }}
        baslik={t('hesap.davet.iptalBaslik')}
        aciklama={t('hesap.davet.iptalAciklama')}
        onayEtiketi={t('hesap.davet.iptalOnay')}
        tehlikeli
        bekliyor={iptal.isPending}
        onay={() => {
          if (iptalEdilecek) iptal.mutate(iptalEdilecek);
        }}
      />
    </Bolum>
  );
}
