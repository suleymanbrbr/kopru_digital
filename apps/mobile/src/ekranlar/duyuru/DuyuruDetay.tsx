import { t } from '@kopru/i18n';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useRef, useState } from 'react';
import { Alert, View } from 'react-native';

import type { Duyuru } from '../../api/bildirimTipleri';
import { duyuruParcalari } from '../../duyuru/metin';
import { zamanGoster } from '../../lib/zaman';
import { Anahtar } from '../../ui/Anahtar';
import { Dugme } from '../../ui/Dugme';
import { HataDurumu, Yukleniyor } from '../../ui/Durumlar';
import { Ekran } from '../../ui/Ekran';
import { Ikon } from '../../ui/Ikon';
import { Kart } from '../../ui/Kart';
import { Metin } from '../../ui/Metin';
import { useDuyuru, useDuyuruIslemleri, useDuyuruOkundu } from '../../uygulama/duyuru';
import { hataMesaji } from '../../uygulama/hatalar';
import { grupEtiketi, useGruplar } from '../../uygulama/operasyon';
import { CevrimdisiSerit } from '../CevrimdisiSerit';

/** Govde duz metindir; yalniz http/https baglantilari uygulama ici tarayicida acilir. */
function Govde({ govde, hata }: { govde: string; hata: (m: string | null) => void }) {
  const parcalar = duyuruParcalari(govde);
  return (
    <Metin testID="duyuru-govde" selectable>
      {parcalar.map((p, i) =>
        p.tur === 'metin' ? (
          p.metin
        ) : (
          <Metin
            key={`${String(i)}-${p.url}`}
            accessibilityRole="link"
            className="text-birincil underline"
            onPress={() => {
              hata(null);
              WebBrowser.openBrowserAsync(p.url).catch(() => {
                hata(t('mobil.duyuru.baglantiAcilamadi'));
              });
            }}
          >
            {p.url}
          </Metin>
        ),
      )}
    </Metin>
  );
}

function YonetimBolumu({ d, kapat }: { d: Duyuru; kapat: () => void }) {
  const router = useRouter();
  const gruplar = useGruplar();
  const islem = useDuyuruIslemleri();
  const [hata, setHata] = useState<string | null>(null);
  const grup = d.hedef_turu === 'grup' ? gruplar.data?.find((g) => g.id === d.hedef_id) : undefined;
  const hedef =
    d.hedef_turu === 'grup'
      ? t('mobil.duyuru.yonetim.hedef.grup', { ad: grup ? grupEtiketi(grup) : '—' })
      : t(`mobil.duyuru.yonetim.hedef.${d.hedef_turu}`);
  const oran = d.alici_sayisi > 0 ? Math.min(1, d.okunan_sayisi / d.alici_sayisi) : 0;

  const hataYaz = (e: unknown) => {
    setHata(hataMesaji(e));
  };

  function yayinla() {
    setHata(null);
    Alert.alert(
      t('mobil.duyuru.yaz.onayBaslik'),
      t('mobil.duyuru.yaz.onay', { baslik: d.baslik, hedef }) +
        (d.push_gonderildi ? t('mobil.duyuru.yaz.onayPush') : ''),
      [
        { text: t('ortak.iptal'), style: 'cancel' },
        {
          text: t('mobil.duyuru.yonetim.yayinla'),
          onPress: () => {
            islem.yayinla.mutate(d.id, { onError: hataYaz });
          },
        },
      ],
    );
  }
  function arsivle() {
    setHata(null);
    Alert.alert(
      t('mobil.duyuru.yonetim.arsivleOnayBaslik'),
      t('mobil.duyuru.yonetim.arsivleOnay'),
      [
        { text: t('ortak.iptal'), style: 'cancel' },
        {
          text: t('mobil.duyuru.yonetim.arsivle'),
          style: 'destructive',
          onPress: () => {
            islem.arsivle.mutate(d.id, { onError: hataYaz, onSuccess: kapat });
          },
        },
      ],
    );
  }
  function sil() {
    setHata(null);
    Alert.alert(t('mobil.duyuru.yonetim.silOnayBaslik'), t('mobil.duyuru.yonetim.silOnay'), [
      { text: t('ortak.iptal'), style: 'cancel' },
      {
        text: t('mobil.duyuru.yonetim.sil'),
        style: 'destructive',
        onPress: () => {
          islem.sil.mutate(d.id, { onError: hataYaz, onSuccess: kapat });
        },
      },
    ]);
  }

  return (
    <Kart className="gap-3" testID="duyuru-yonetim">
      <View className="flex-row items-center justify-between gap-2">
        <Metin varyant="altBaslik" accessibilityRole="header">
          {t(`mobil.duyuru.yonetim.durum.${d.durum}`)}
        </Metin>
        <Metin varyant="ikincil">{hedef}</Metin>
      </View>
      {d.durum !== 'taslak' ? (
        <View
          className="gap-1"
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel={`${t('mobil.duyuru.yonetim.okunanEtiketi')}: ${t('mobil.duyuru.yonetim.okunanOzeti', { okunan: d.okunan_sayisi, alici: d.alici_sayisi })}`}
          accessibilityValue={{ min: 0, max: 100, now: Math.round(oran * 100) }}
        >
          <Metin varyant="etiket" testID="duyuru-okunan-ozeti">
            {t('mobil.duyuru.yonetim.okunanOzeti', {
              okunan: d.okunan_sayisi,
              alici: d.alici_sayisi,
            })}
          </Metin>
          <View className="h-3 overflow-hidden rounded-tam bg-yuzeyIkincil">
            <View
              className="h-3 rounded-tam bg-birincil"
              style={{ width: `${Math.round(oran * 100)}%` }}
            />
          </View>
          {!d.dagitim_tamam && d.durum === 'yayinda' ? (
            <Metin varyant="kucuk">{t('mobil.duyuru.yonetim.dagitiliyor')}</Metin>
          ) : null}
        </View>
      ) : null}
      {d.durum === 'yayinda' ? (
        <Anahtar
          etiket={t('mobil.duyuru.yonetim.sabitle')}
          deger={d.sabit}
          onDegis={(v) => {
            setHata(null);
            islem.guncelle.mutate({ id: d.id, g: { sabit: v } }, { onError: hataYaz });
          }}
        />
      ) : null}
      {hata ? (
        <Metin varyant="ikincil" className="text-hata" accessibilityLiveRegion="polite">
          {hata}
        </Metin>
      ) : null}
      {d.durum === 'taslak' ? (
        <View className="gap-2">
          <Dugme
            etiket={t('mobil.duyuru.yonetim.yayinla')}
            testID="duyuru-yayinla"
            yukleniyor={islem.yayinla.isPending}
            onPress={yayinla}
          />
          <Dugme
            varyant="ikincil"
            etiket={t('mobil.duyuru.yonetim.duzenle')}
            onPress={() => {
              router.push({ pathname: '/duyuru-yaz', params: { id: d.id } });
            }}
          />
          <Dugme
            varyant="hayalet"
            etiket={t('mobil.duyuru.yonetim.sil')}
            yukleniyor={islem.sil.isPending}
            onPress={sil}
          />
        </View>
      ) : null}
      {d.durum === 'yayinda' ? (
        <Dugme
          varyant="ikincil"
          etiket={t('mobil.duyuru.yonetim.arsivle')}
          testID="duyuru-arsivle"
          yukleniyor={islem.arsivle.isPending}
          onPress={arsivle}
        />
      ) : null}
    </Kart>
  );
}

/**
 * Duyuru detayi. Alici acinca duyuru bir kez okundu isaretlenir (yazar/yonetici kendi duyurusunu
 * acarken sayac artmaz). Personel icin okunan/alici sayaci ve taslak/yayin/arsiv eylemleri vardir.
 */
export function DuyuruDetay({ id }: { id: string }) {
  const router = useRouter();
  const sorgu = useDuyuru(id);
  const okundu = useDuyuruOkundu();
  const [baglantiHatasi, setBaglantiHatasi] = useState<string | null>(null);
  const isaretlendi = useRef<string | null>(null);
  const d = sorgu.data;

  useEffect(() => {
    if (d?.yonetim !== null || d.okundu_at !== null || isaretlendi.current === d.id) return;
    isaretlendi.current = d.id;
    okundu.mutate(d.id);
  }, [d, okundu]);

  return (
    <Ekran ust={<CevrimdisiSerit />} kenarlar={['left', 'right', 'bottom']}>
      {sorgu.isPending ? <Yukleniyor /> : null}
      {sorgu.isError && !d ? (
        <HataDurumu
          mesaj={hataMesaji(sorgu.error)}
          tekrar={() => {
            void sorgu.refetch();
          }}
        />
      ) : null}
      {d ? (
        <>
          <View className="gap-2">
            <View className="flex-row items-center gap-2">
              {d.sabit ? <Ikon ad="pin" boyut={20} /> : null}
              <Metin varyant="baslik" accessibilityRole="header" className="flex-1">
                {d.baslik}
              </Metin>
            </View>
            {d.yayin_at ? (
              <Metin varyant="kucuk">
                {t('mobil.duyuru.yayin', { zaman: zamanGoster(d.yayin_at) })}
              </Metin>
            ) : null}
          </View>
          <Kart>
            <Govde govde={d.govde} hata={setBaglantiHatasi} />
            {baglantiHatasi ? (
              <Metin varyant="ikincil" className="mt-2 text-hata" accessibilityLiveRegion="polite">
                {baglantiHatasi}
              </Metin>
            ) : null}
          </Kart>
          {d.yonetim ? (
            <YonetimBolumu
              d={d.yonetim}
              kapat={() => {
                if (router.canGoBack()) router.back();
              }}
            />
          ) : null}
        </>
      ) : null}
    </Ekran>
  );
}
