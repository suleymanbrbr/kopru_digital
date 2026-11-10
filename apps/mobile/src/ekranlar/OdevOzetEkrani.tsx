import { t } from '@kopru/i18n';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import type { IncelemeSonucu, OdevOgrenciSatiri, OdevOzeti } from '../api/ogrenmeTipleri';
import { kisaZaman } from '../lib/saat';
import { bransAdi } from '../ogrenme/konu';
import { Dugme } from '../ui/Dugme';
import { HataDurumu, Yukleniyor } from '../ui/Durumlar';
import { Ekran } from '../ui/Ekran';
import { Ikon } from '../ui/Ikon';
import { Kart } from '../ui/Kart';
import { Metin } from '../ui/Metin';
import { MetinGirdisi } from '../ui/MetinGirdisi';
import { Secici } from '../ui/Secici';
import { useAktif, useServisler } from '../uygulama/baglam';
import { hataMesaji } from '../uygulama/hatalar';
import { useOdevOzeti } from '../uygulama/ogrenme';
import { useSaatDilimi } from '../uygulama/operasyon';
import { CevrimdisiSerit } from './CevrimdisiSerit';

const SONUCLAR: readonly IncelemeSonucu[] = ['tamam', 'eksik', 'tekrar'];
/** Incelenecekler (teslim edilen) en uste; sonra bekleyenler, tekrar istenenler, incelenenler. */
const SIRA: Record<OdevOgrenciSatiri['durum'], number> = {
  teslim_edildi: 0,
  atandi: 1,
  tekrar_istendi: 2,
  incelendi: 3,
  iptal: 4,
};

const DURUM_IKON = {
  teslim_edildi: 'document-text-outline',
  atandi: 'ellipse-outline',
  tekrar_istendi: 'refresh-circle-outline',
  incelendi: 'checkmark-circle',
  iptal: 'close-circle-outline',
} as const;

function satirDurumu(s: OdevOgrenciSatiri): string {
  if (s.durum === 'incelendi' && s.incelemeSonucu) {
    return t(`mobil.ogrenme.odev.sonuc.${s.incelemeSonucu}`);
  }
  return t(`mobil.ogrenme.odev.ogretmenDurum.${s.durum}`);
}

function dogruYanlis(s: OdevOgrenciSatiri): string {
  if (s.dogru === null) return s.yapilanSoru !== null ? `${String(s.yapilanSoru)}` : '–';
  return `${String(s.dogru)}/${String(s.yanlis ?? 0)}/${String(s.bos ?? 0)}`;
}

function SatirDetayi({
  satir,
  odevId,
  tz,
}: {
  satir: OdevOgrenciSatiri;
  odevId: string;
  tz: string;
}) {
  const qc = useQueryClient();
  const { adaptorler } = useServisler();
  const uyelikId = useAktif()?.uyelik.uyelikId;
  const [sonuc, setSonuc] = useState<IncelemeSonucu>('tamam');
  const [not, setNot] = useState('');
  const [hata, setHata] = useState<string | null>(null);
  const ozetAnahtari = ['odev', uyelikId, 'ozet', odevId] as const;

  const incele = useMutation({
    networkMode: 'always',
    mutationFn: () =>
      adaptorler.ogrenme.odevIncele(satir.ogrenciOdevId, sonuc, not.trim() || undefined),
    // Iyimser: satir hemen "incelendi" (ya da "tekrar istendi") gorunur; hata olursa geri doner.
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: ozetAnahtari });
      const onceki = qc.getQueryData<OdevOzeti>(ozetAnahtari);
      qc.setQueryData<OdevOzeti>(ozetAnahtari, (o) =>
        o
          ? {
              ...o,
              ogrenciler: o.ogrenciler.map((x) =>
                x.ogrenciOdevId === satir.ogrenciOdevId
                  ? {
                      ...x,
                      durum: sonuc === 'tekrar' ? 'tekrar_istendi' : 'incelendi',
                      incelemeSonucu: sonuc,
                      incelemeNotu: not.trim() || null,
                    }
                  : x,
              ),
            }
          : o,
      );
      return { onceki };
    },
    onError: (e, _v, baglam) => {
      if (baglam?.onceki) qc.setQueryData(ozetAnahtari, baglam.onceki);
      setHata(hataMesaji(e));
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['odev'] });
    },
  });

  return (
    <View className="gap-3 border-t border-kenar pt-3" testID={`satir-detay-${satir.ogrenciOdevId}`}>
      {satir.teslimAt ? (
        <Metin varyant="ikincil">
          {t('mobil.ogrenme.odev.teslimZamani')}: {kisaZaman(satir.teslimAt, tz)}
          {satir.gecTeslim ? ` · ${t('mobil.ogrenme.odev.gecTeslim')}` : ''}
        </Metin>
      ) : null}
      {satir.yapilanSoru !== null ? (
        <Metin varyant="ikincil">
          {t('mobil.ogrenme.odev.yapilan')}: {satir.yapilanSoru}
          {satir.dogru !== null
            ? ` · ${t('mobil.ogrenme.odev.dogruYanlisBos')}: ${dogruYanlis(satir)}`
            : ''}
        </Metin>
      ) : null}
      {satir.ogrenciNotu ? (
        <Metin>
          {t('mobil.ogrenme.odev.ogrenciNotu')}: {satir.ogrenciNotu}
        </Metin>
      ) : null}
      {satir.incelemeNotu ? (
        <Metin varyant="ikincil">
          {t('mobil.ogrenme.odev.ogretmenNotuBaslik')}: {satir.incelemeNotu}
        </Metin>
      ) : null}
      {satir.durum === 'teslim_edildi' ? (
        <>
          <Secici
            baslik={t('mobil.ogrenme.odev.incelemeSonucu')}
            deger={sonuc}
            onDegis={setSonuc}
            secenekler={SONUCLAR.map((s) => ({
              deger: s,
              etiket: t(`mobil.ogrenme.odev.sonuc.${s}`),
            }))}
          />
          <MetinGirdisi
            etiket={t('mobil.ogrenme.odev.incelemeNotu')}
            value={not}
            onChangeText={setNot}
            maxLength={1000}
            multiline
          />
          {hata ? (
            <Metin varyant="ikincil" className="text-hata" accessibilityLiveRegion="polite">
              {hata}
            </Metin>
          ) : null}
          <Dugme
            etiket={t('mobil.ogrenme.odev.incelemeKaydet')}
            yukleniyor={incele.isPending}
            onPress={() => {
              setHata(null);
              incele.mutate();
            }}
          />
        </>
      ) : null}
    </View>
  );
}

/**
 * Odev ozeti (ogretmen): sayilar ve tum ogrencilerin durumu tek ekranda (30 kisilik sinif icin
 * kompakt satirlar). Satira dokununca teslim ayrintisi ve inceleme (Tamam / Eksik / Tekrar + not)
 * acilir.
 */
export function OdevOzetEkrani({ odevId }: { odevId: string }) {
  const { tz } = useSaatDilimi();
  const sorgu = useOdevOzeti(odevId);
  const [acik, setAcik] = useState<string | null>(null);
  const o = sorgu.data;
  const satirlar = [...(o?.ogrenciler ?? [])].sort(
    (a, b) =>
      SIRA[a.durum] - SIRA[b.durum] || (a.ad ?? '').localeCompare(b.ad ?? '', 'tr'),
  );
  const yuzde =
    o?.sayilar.ortalamaDogruOrani != null
      ? `%${String(Math.round(o.sayilar.ortalamaDogruOrani * 100))}`
      : '–';

  return (
    <Ekran ust={<CevrimdisiSerit />} kenarlar={['left', 'right', 'bottom']}>
      {sorgu.isPending ? <Yukleniyor /> : null}
      {sorgu.isError && !o ? (
        <HataDurumu mesaj={hataMesaji(sorgu.error)} tekrar={() => void sorgu.refetch()} />
      ) : null}
      {o ? (
        <>
          <View className="gap-1">
            <Metin varyant="baslik" accessibilityRole="header">
              {o.odev.baslik}
            </Metin>
            <Metin varyant="ikincil">
              {bransAdi(o.odev.bransKodu)}
              {o.odev.sonTeslim
                ? ` · ${t('mobil.ogrenme.odev.sonTeslim')}: ${kisaZaman(o.odev.sonTeslim, tz)}`
                : ''}
            </Metin>
          </View>
          <Kart
            className="flex-row flex-wrap justify-between gap-y-2"
            accessible
            accessibilityLabel={t('mobil.ogrenme.odev.ozetEtiketi', {
              atanan: o.sayilar.atanan,
              teslim: o.sayilar.teslimEdildi + o.sayilar.incelendi,
              bekleyen: o.sayilar.atandi,
              inceleme: o.sayilar.teslimEdildi,
              oran: yuzde,
            })}
            testID="odev-sayilari"
          >
            {[
              [t('mobil.ogrenme.odev.atanan'), o.sayilar.atanan],
              [t('mobil.ogrenme.odev.teslimEdildiSayi'), o.sayilar.teslimEdildi + o.sayilar.incelendi],
              [t('mobil.ogrenme.odev.inceleBekleyen'), o.sayilar.teslimEdildi],
              [t('mobil.ogrenme.odev.teslimsiz'), o.sayilar.atandi],
              [t('mobil.ogrenme.odev.ortDogru'), yuzde],
            ].map(([ad, deger]) => (
              <View key={String(ad)} className="w-1/3 items-center">
                <Metin varyant="altBaslik">{String(deger)}</Metin>
                <Metin varyant="kucuk" className="text-center">
                  {String(ad)}
                </Metin>
              </View>
            ))}
          </Kart>
          <Kart className="gap-0 p-0" testID="odev-ogrenciler">
            {satirlar.map((s, i) => {
              const secili = acik === s.ogrenciOdevId;
              const ad = s.ad ?? t('mobil.ogrenciler.adsiz');
              return (
                <View
                  key={s.ogrenciOdevId}
                  className={`px-4 py-2 ${i > 0 ? 'border-t border-kenar' : ''}`}
                >
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('mobil.ogrenme.odev.satirEtiketi', {
                      ad,
                      durum: satirDurumu(s),
                      sonuc: dogruYanlis(s),
                    })}
                    accessibilityState={{ expanded: secili }}
                    testID={`satir-${s.ogrenciOdevId}`}
                    onPress={() => {
                      setAcik(secili ? null : s.ogrenciOdevId);
                    }}
                    className="min-h-dokunma flex-row items-center gap-3 active:opacity-80"
                  >
                    <Ikon ad={DURUM_IKON[s.durum]} boyut={20} />
                    <Metin className="flex-1" numberOfLines={1}>
                      {ad}
                    </Metin>
                    <View className="items-end">
                      <Metin varyant="kucuk">{satirDurumu(s)}</Metin>
                      <Metin varyant="kucuk">
                        {dogruYanlis(s)}
                        {s.gecTeslim ? ` · ${t('mobil.ogrenme.odev.gecTeslim')}` : ''}
                      </Metin>
                    </View>
                  </Pressable>
                  {secili ? <SatirDetayi satir={s} odevId={odevId} tz={tz} /> : null}
                </View>
              );
            })}
          </Kart>
        </>
      ) : null}
    </Ekran>
  );
}
