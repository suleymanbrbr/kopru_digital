import { t } from '@kopru/i18n';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import type { KaynakKitap } from '../../api/gunlukSoruTipleri';
import { tarihGoster } from '../../lib/zaman';
import { bransAdi } from '../../ogrenme/konu';
import { BosDurum, HataDurumu, Yukleniyor } from '../../ui/Durumlar';
import { Ekran } from '../../ui/Ekran';
import { Ikon } from '../../ui/Ikon';
import { Kart } from '../../ui/Kart';
import { Metin } from '../../ui/Metin';
import { useKaynakKitap, useKaynakKitaplar } from '../../uygulama/gunluk';
import { hataMesaji } from '../../uygulama/hatalar';
import { CevrimdisiSerit } from '../CevrimdisiSerit';

function Testler({ kitapId, ogrenciId }: { kitapId: string; ogrenciId?: string }) {
  const detay = useKaynakKitap(kitapId, ogrenciId);
  if (detay.isPending) return <Yukleniyor />;
  if (detay.isError && !detay.data) {
    return <HataDurumu mesaj={hataMesaji(detay.error)} tekrar={() => void detay.refetch()} />;
  }
  return (
    <View className="gap-1 border-t border-kenar pt-2" testID={`testler-${kitapId}`}>
      {detay.data.testler.map((x) => (
        <View
          key={x.id}
          className="min-h-dokunma flex-row items-center gap-2"
          accessible
          accessibilityLabel={`${x.ad}, ${t('mobil.gunluk.kitap.testSoru', { n: x.soruSayisi })}, ${
            x.cozulduGun
              ? t('mobil.gunluk.kitap.cozuldu', { gun: tarihGoster(x.cozulduGun) })
              : t('mobil.gunluk.kitap.cozulmedi')
          }`}
        >
          <Ikon ad={x.cozulduGun ? 'checkmark-circle' : 'ellipse-outline'} boyut={20} />
          <View className="flex-1">
            <Metin varyant="etiket">{x.ad}</Metin>
            <Metin varyant="kucuk">{t('mobil.gunluk.kitap.testSoru', { n: x.soruSayisi })}</Metin>
          </View>
          <Metin varyant="kucuk">
            {x.cozulduGun
              ? t('mobil.gunluk.kitap.cozuldu', { gun: tarihGoster(x.cozulduGun) })
              : t('mobil.gunluk.kitap.cozulmedi')}
          </Metin>
        </View>
      ))}
    </View>
  );
}

function KitapKarti({ k, ogrenciId }: { k: KaynakKitap; ogrenciId?: string }) {
  const [acik, setAcik] = useState(false);
  const oran =
    k.ilerleme && k.ilerleme.toplamTest > 0 ? k.ilerleme.cozulenTest / k.ilerleme.toplamTest : 0;
  const ilerleme = k.ilerleme
    ? t('mobil.gunluk.kitap.ilerlemeSatiri', {
        cozulen: k.ilerleme.cozulenTest,
        toplam: k.ilerleme.toplamTest,
      })
    : null;
  return (
    <Kart className="gap-2" testID={`kitap-karti-${k.id}`}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${k.ad}${k.yayinevi ? `, ${k.yayinevi}` : ''}, ${bransAdi(k.bransKodu)}${ilerleme ? `, ${ilerleme}` : ''}`}
        accessibilityState={{ expanded: acik }}
        onPress={() => {
          setAcik((a) => !a);
        }}
        className="min-h-dokunma gap-1 active:opacity-80"
      >
        <View className="flex-row items-center gap-2">
          <Ikon ad="book-outline" boyut={22} />
          <Metin varyant="altBaslik" className="flex-1">
            {k.ad}
          </Metin>
          <Ikon ad={acik ? 'chevron-up' : 'chevron-down'} boyut={18} />
        </View>
        <Metin varyant="ikincil">
          {[
            k.yayinevi,
            bransAdi(k.bransKodu),
            t('mobil.gunluk.kitap.testSayisi', { n: k.testSayisi, soru: k.toplamSoru }),
          ]
            .filter(Boolean)
            .join(' · ')}
        </Metin>
        {ilerleme ? (
          <>
            <View className="h-2 overflow-hidden rounded-tam bg-yuzeyIkincil">
              <View
                className="h-2 rounded-tam bg-birincil"
                style={{ width: `${String(oran * 100)}%` }}
              />
            </View>
            <Metin varyant="kucuk" testID={`kitap-ilerleme-${k.id}`}>
              {ilerleme}
            </Metin>
          </>
        ) : null}
        {!k.aktif ? <Metin varyant="kucuk">{t('mobil.gunluk.kitap.pasif')}</Metin> : null}
      </Pressable>
      {acik ? <Testler kitapId={k.id} {...(ogrenciId ? { ogrenciId } : {})} /> : null}
    </Kart>
  );
}

/**
 * Kaynak kitaplar (okuma): ders, test sayisi ve ilerleme (cozulen test / toplam). Ogrenci kendi
 * ilerlemesini, ogretmen `ogrenciId` ile secili ogrencinin ilerlemesini gorur. Tanimlama web'dedir.
 */
export function KaynakKitaplarEkrani({ ogrenciId, ad }: { ogrenciId?: string; ad?: string }) {
  const kitaplar = useKaynakKitaplar(undefined, ogrenciId);
  return (
    <Ekran ust={<CevrimdisiSerit />} kenarlar={['left', 'right', 'bottom']}>
      <Metin varyant="baslik" accessibilityRole="header">
        {ogrenciId
          ? t('mobil.gunluk.kitap.baslikOgrenci', { ad: ad ?? t('mobil.ogrenciler.adsiz') })
          : t('mobil.gunluk.kitap.baslik')}
      </Metin>
      {kitaplar.isPending ? <Yukleniyor /> : null}
      {kitaplar.isError && !kitaplar.data ? (
        <HataDurumu mesaj={hataMesaji(kitaplar.error)} tekrar={() => void kitaplar.refetch()} />
      ) : null}
      {kitaplar.data?.length === 0 ? (
        <BosDurum ikon="book-outline" mesaj={t('mobil.gunluk.kitap.bos')} />
      ) : null}
      {kitaplar.data?.map((k) => (
        <KitapKarti key={k.id} k={k} {...(ogrenciId ? { ogrenciId } : {})} />
      ))}
      <Metin varyant="kucuk">{t('mobil.gunluk.kitap.webAciklama')}</Metin>
    </Ekran>
  );
}
