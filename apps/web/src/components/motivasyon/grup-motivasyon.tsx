'use client';

import {
  MotivasyonDuraklatmaSema,
  YildizVerYanitiSema,
  YILDIZ_GEREKCE_AZAMI,
  type GrupTipi,
} from '@kopru/contracts';
import { t } from '@kopru/i18n';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { PauseCircle, Star } from 'lucide-react';
import { useMemo, useState, type SyntheticEvent } from 'react';

import { BosDurum } from '@/components/bos-durum';
import { HataDurumu } from '@/components/hata-durumu';
import {
  basari,
  BildirimKutusu,
  Bolum,
  ListeIskeleti,
  tarihYaz,
  type Bildirim,
} from '@/components/hesap/ortak';
import { Alan } from '@/components/operasyon/ortak';
import { Dugme } from '@/components/ui/button';
import { Girdi } from '@/components/ui/input';
import { MetinAlani } from '@/components/ui/metin-alani';
import { OnayPenceresi } from '@/components/ui/pencere';
import { Rozet } from '@/components/ui/rozet';
import { Secim } from '@/components/ui/secim';
import { Uyari } from '@/components/ui/uyari';
import { hataMesaji } from '@/lib/api';
import { motivasyonIstek } from '@/lib/hesap-istek';
import {
  DURAKLATMA_AZAMI_GUN,
  aralikMetni,
  duraklatmaDogrula,
  duraklatmaHataMetni,
} from '@/lib/motivasyon/duraklatma';
import { motivasyonHataMesaji } from '@/lib/motivasyon/hata';
import { motivasyonAnahtari, useDuraklatmalar, useVerdiklerim } from '@/lib/motivasyon/veri';
import { useGrupOgrencileri } from '@/lib/ogrenme/veri';
import { useSaatDilimi } from '@/lib/operasyon-verisi';
import { yerelTarih } from '@/lib/saat';

/**
 * Grup sayfasinda ogretmen/yonetici motivasyon eylemleri: haftanin yildizi ver ve seri duraklatma.
 * Oyunlastirma modulu kapaliysa cagiran taraf bu bileseni hic cizmez.
 */
export function GrupMotivasyon({ kurumId, grup }: { kurumId: string; grup: GrupTipi }) {
  const aktif = grup.durum === 'aktif';
  return (
    <>
      <YildizVer kurumId={kurumId} grup={grup} yazabilir={aktif} />
      <SeriDuraklatma kurumId={kurumId} grup={grup} yazabilir={aktif} />
    </>
  );
}

// --- Haftanin yildizi -------------------------------------------------------------------------

function YildizVer({
  kurumId,
  grup,
  yazabilir,
}: {
  kurumId: string;
  grup: GrupTipi;
  yazabilir: boolean;
}) {
  const qc = useQueryClient();
  const uyeler = useGrupOgrencileri(kurumId, grup.id);
  const verdiklerim = useVerdiklerim(kurumId);
  const [ogrenciId, setOgrenciId] = useState('');
  const [gerekce, setGerekce] = useState('');
  const [bildirim, setBildirim] = useState<Bildirim>(null);

  const liste = useMemo(
    () =>
      (uyeler.data?.uyeler ?? [])
        .filter((u) => u.bitis_tarihi === null)
        .map((u) => ({ id: u.ogrenci_id, ad: u.gorunen_ad ?? '' })),
    [uyeler.data],
  );
  const adlar = useMemo(() => new Map(liste.map((o) => [o.id, o.ad])), [liste]);

  const ver = useMutation({
    mutationFn: () =>
      motivasyonIstek(`kurumlar/${kurumId}/haftanin-yildizlari`, {
        yontem: 'POST',
        govde: {
          ogrenci_id: ogrenciId,
          grup_id: grup.id,
          ...(gerekce.trim() ? { gerekce: gerekce.trim() } : {}),
        },
        sema: YildizVerYanitiSema,
      }),
    onSuccess: async (yanit) => {
      setBildirim(
        basari(
          t('motivasyon.yildiz.verildi', {
            ad: adlar.get(yanit.yildiz.ogrenci_id) ?? t('motivasyon.yildiz.ogrenci'),
            xp: yanit.xp,
          }),
        ),
      );
      setOgrenciId('');
      setGerekce('');
      await qc.invalidateQueries({ queryKey: motivasyonAnahtari(kurumId) });
    },
    onError: () => {
      setBildirim(null);
    },
  });

  const gonder = (e: SyntheticEvent) => {
    e.preventDefault();
    if (ogrenciId && !ver.isPending) ver.mutate();
  };

  const v = verdiklerim.data;
  const sinirsiz = v?.limit === null;
  const hakYok = (v?.kalan ?? 1) <= 0;
  const buGrup = (v?.yildizlar ?? []).filter((y) => y.grup_id === grup.id);

  return (
    <Bolum
      baslik={t('motivasyon.yildiz.verBaslik')}
      aciklama={t('motivasyon.yildiz.verAciklama')}
      eylemler={
        v ? (
          <Rozet ton={hakYok ? 'uyari' : 'bilgi'}>
            {sinirsiz
              ? t('motivasyon.yildiz.sinirsiz')
              : t('motivasyon.yildiz.kalan', { kalan: v.kalan ?? 0, limit: v.limit ?? 0 })}
          </Rozet>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-4 p-4">
        <BildirimKutusu bildirim={bildirim} />
        {uyeler.isPending || verdiklerim.isPending ? (
          <ListeIskeleti satir={2} />
        ) : uyeler.isError || verdiklerim.isError ? (
          <HataDurumu
            aciklama={hataMesaji(uyeler.error ?? verdiklerim.error)}
            tekrarDene={() => {
              void uyeler.refetch();
              void verdiklerim.refetch();
            }}
            className="py-6"
          />
        ) : liste.length === 0 ? (
          <BosDurum
            ikon={Star}
            baslik={t('motivasyon.yildiz.ogrenciYok')}
            aciklama={t('motivasyon.yildiz.ogrenciYokAciklama')}
            className="py-4"
          />
        ) : yazabilir ? (
          <form onSubmit={gonder} className="flex max-w-lg flex-col gap-3" noValidate>
            <Alan etiket={t('motivasyon.yildiz.ogrenciEtiketi')}>
              {(o) => (
                <Secim
                  {...o}
                  value={ogrenciId}
                  disabled={hakYok}
                  onChange={(e) => {
                    setOgrenciId(e.target.value);
                    ver.reset();
                  }}
                >
                  <option value="">{t('motivasyon.yildiz.ogrenciSec')}</option>
                  {[...liste]
                    .sort((a, b) => a.ad.localeCompare(b.ad, 'tr'))
                    .map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.ad}
                      </option>
                    ))}
                </Secim>
              )}
            </Alan>
            <Alan
              etiket={t('motivasyon.yildiz.gerekceEtiketi')}
              yardim={t('motivasyon.yildiz.gerekceYardim', { azami: YILDIZ_GEREKCE_AZAMI })}
            >
              {(o) => (
                <MetinAlani
                  {...o}
                  value={gerekce}
                  maxLength={YILDIZ_GEREKCE_AZAMI}
                  rows={3}
                  disabled={hakYok}
                  onChange={(e) => {
                    setGerekce(e.target.value);
                  }}
                />
              )}
            </Alan>
            {hakYok ? (
              <p role="status" className="text-sm text-metin-ikincil">
                {t('motivasyon.yildiz.hakBitti')}
              </p>
            ) : null}
            {ver.isError ? <Uyari>{motivasyonHataMesaji(ver.error)}</Uyari> : null}
            <div>
              <Dugme type="submit" disabled={!ogrenciId || hakYok || ver.isPending}>
                <Star aria-hidden />
                {ver.isPending ? t('ortak.yukleniyor') : t('motivasyon.yildiz.ver')}
              </Dugme>
            </div>
          </form>
        ) : null}

        {buGrup.length > 0 ? (
          <div>
            <h3 className="mb-1 text-sm font-semibold">{t('motivasyon.yildiz.buHafta')}</h3>
            <ul className="divide-y divide-kenar" data-testid="verilen-yildizlar">
              {buGrup.map((y) => (
                <li key={y.id} className="py-2 text-sm">
                  <span className="font-medium">
                    {adlar.get(y.ogrenci_id) ?? t('motivasyon.yildiz.ogrenci')}
                  </span>
                  {y.gerekce ? <span className="text-metin-ikincil"> — {y.gerekce}</span> : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </Bolum>
  );
}

// --- Seri duraklatma --------------------------------------------------------------------------

function SeriDuraklatma({
  kurumId,
  grup,
  yazabilir,
}: {
  kurumId: string;
  grup: GrupTipi;
  yazabilir: boolean;
}) {
  const qc = useQueryClient();
  const liste = useDuraklatmalar(kurumId, grup.id);
  const { saatDilimi } = useSaatDilimi(kurumId);
  const bugun = yerelTarih(new Date(), saatDilimi);
  const [baslangic, setBaslangic] = useState('');
  const [bitis, setBitis] = useState('');
  const [neden, setNeden] = useState('');
  const [denendi, setDenendi] = useState(false);
  const [bildirim, setBildirim] = useState<Bildirim>(null);
  const [iptal, setIptal] = useState<string | null>(null);

  const dogrulama = duraklatmaDogrula(baslangic, bitis, bugun);

  const ekle = useMutation({
    mutationFn: () =>
      motivasyonIstek(`kurumlar/${kurumId}/gruplar/${grup.id}/seri-duraklatmalari`, {
        yontem: 'POST',
        govde: {
          baslangic_gun: baslangic,
          bitis_gun: bitis,
          ...(neden.trim() ? { neden: neden.trim() } : {}),
        },
        sema: MotivasyonDuraklatmaSema,
      }),
    onSuccess: async () => {
      setBildirim(
        basari(t('motivasyon.duraklatma.eklendi', { aralik: aralikMetni(baslangic, bitis) })),
      );
      setBaslangic('');
      setBitis('');
      setNeden('');
      setDenendi(false);
      await qc.invalidateQueries({ queryKey: motivasyonAnahtari(kurumId) });
    },
  });

  const iptalEt = useMutation({
    mutationFn: (id: string) =>
      motivasyonIstek(`kurumlar/${kurumId}/gruplar/${grup.id}/seri-duraklatmalari/${id}`, {
        yontem: 'DELETE',
      }),
    onSuccess: async () => {
      setBildirim(basari(t('motivasyon.duraklatma.iptalEdildi')));
      await qc.invalidateQueries({ queryKey: motivasyonAnahtari(kurumId) });
    },
    onSettled: () => {
      setIptal(null);
    },
  });

  const gonder = (e: SyntheticEvent) => {
    e.preventDefault();
    setDenendi(true);
    setBildirim(null);
    if (dogrulama === null && !ekle.isPending) ekle.mutate();
  };

  const etkin = (liste.data?.duraklatmalar ?? []).filter((d) => d.iptal_at === null);
  const hata = denendi && dogrulama !== null ? duraklatmaHataMetni(dogrulama) : undefined;

  return (
    <Bolum
      baslik={t('motivasyon.duraklatma.baslik')}
      aciklama={t('motivasyon.duraklatma.aciklama', { azami: DURAKLATMA_AZAMI_GUN })}
    >
      <div className="flex flex-col gap-4 p-4">
        <BildirimKutusu bildirim={bildirim} />
        {yazabilir ? (
          <form onSubmit={gonder} className="flex max-w-lg flex-col gap-3" noValidate>
            <div className="grid gap-3 sm:grid-cols-2">
              <Alan etiket={t('motivasyon.duraklatma.baslangic')} hata={hata}>
                {(o) => (
                  <Girdi
                    {...o}
                    type="date"
                    min={bugun}
                    value={baslangic}
                    onChange={(e) => {
                      setBaslangic(e.target.value);
                      ekle.reset();
                    }}
                  />
                )}
              </Alan>
              <Alan etiket={t('motivasyon.duraklatma.bitis')}>
                {(o) => (
                  <Girdi
                    {...o}
                    type="date"
                    min={baslangic || bugun}
                    value={bitis}
                    onChange={(e) => {
                      setBitis(e.target.value);
                      ekle.reset();
                    }}
                  />
                )}
              </Alan>
            </div>
            <Alan
              etiket={t('motivasyon.duraklatma.neden')}
              yardim={t('motivasyon.duraklatma.nedenYardim')}
            >
              {(o) => (
                <Girdi
                  {...o}
                  value={neden}
                  maxLength={200}
                  placeholder={t('motivasyon.duraklatma.nedenYerTutucu')}
                  onChange={(e) => {
                    setNeden(e.target.value);
                  }}
                />
              )}
            </Alan>
            {ekle.isError ? <Uyari>{motivasyonHataMesaji(ekle.error, 'duraklatma')}</Uyari> : null}
            <div>
              <Dugme type="submit" disabled={ekle.isPending}>
                <PauseCircle aria-hidden />
                {ekle.isPending ? t('ortak.yukleniyor') : t('motivasyon.duraklatma.ekle')}
              </Dugme>
            </div>
          </form>
        ) : null}

        {liste.isPending ? (
          <ListeIskeleti satir={2} />
        ) : liste.isError ? (
          <HataDurumu
            aciklama={hataMesaji(liste.error)}
            tekrarDene={() => void liste.refetch()}
            className="py-6"
          />
        ) : etkin.length === 0 ? (
          <p className="text-sm text-metin-ikincil">{t('motivasyon.duraklatma.bos')}</p>
        ) : (
          <ul className="divide-y divide-kenar" data-testid="duraklatmalar">
            {etkin.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{aralikMetni(d.baslangic_gun, d.bitis_gun)}</p>
                  <p className="text-sm text-metin-ikincil">
                    {d.neden ?? t('motivasyon.duraklatma.nedenYok')} · {tarihYaz(d.created_at)}
                  </p>
                </div>
                {yazabilir ? (
                  <Dugme
                    gorunum="ikincil"
                    boyut="sm"
                    onClick={() => {
                      setIptal(d.id);
                    }}
                    aria-label={t('motivasyon.duraklatma.iptalEtiketi', {
                      aralik: aralikMetni(d.baslangic_gun, d.bitis_gun),
                    })}
                  >
                    {t('motivasyon.duraklatma.iptal')}
                  </Dugme>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {iptalEt.isError ? <Uyari>{motivasyonHataMesaji(iptalEt.error)}</Uyari> : null}
      </div>
      <OnayPenceresi
        acik={iptal !== null}
        degisti={(a) => {
          if (!a) setIptal(null);
        }}
        baslik={t('motivasyon.duraklatma.iptalBaslik')}
        aciklama={t('motivasyon.duraklatma.iptalAciklama')}
        onayEtiketi={t('motivasyon.duraklatma.iptalOnay')}
        tehlikeli
        bekliyor={iptalEt.isPending}
        onay={() => {
          if (iptal) iptalEt.mutate(iptal);
        }}
      />
    </Bolum>
  );
}
