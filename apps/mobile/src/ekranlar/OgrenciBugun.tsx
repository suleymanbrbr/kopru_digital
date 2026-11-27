import { t } from '@kopru/i18n';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import type { Ders } from '../api/operasyonTipleri';
import { olcumIsareti, useBugunOlcumu } from '../lib/olcum';
import { bugunTarihi, kisaZaman, tarihEkle, yerelTarih } from '../lib/saat';
import { modulAcikMi } from '../nav/yapilandirma';
import { CevaplananSorularKarti } from '../soru/BugunKartlari';
import { Dugme } from '../ui/Dugme';
import { BosDurum, KartHatasi, KartYukleniyor } from '../ui/Durumlar';
import { Ekran } from '../ui/Ekran';
import { Ikon } from '../ui/Ikon';
import { Kart } from '../ui/Kart';
import { Metin } from '../ui/Metin';
import { useAktif, useOturum } from '../uygulama/baglam';
import { hataMesaji } from '../uygulama/hatalar';
import { useGorevlerim } from '../uygulama/ogrenme';
import {
  dersAdi,
  useAralikDersleri,
  useModulAcik,
  useOgrenciKarti,
  useSaatDilimi,
  useYoklamaKatilimcilari,
} from '../uygulama/operasyon';
import { BildirimIzinKarti } from './bildirim/BildirimIzinKarti';
import { BildirimZili } from './bildirim/BildirimZili';
import { CevrimdisiSerit } from './CevrimdisiSerit';
import { OgretmenimGirisi } from './degerlendirme/OgretmenimGirisi';
import { DersSatiri } from './DerslerEkrani';
import { DuyuruKarti } from './duyuru/DuyuruKarti';
import { GeriBildirimKartlari } from './GeriBildirimKartlari';
import { GunlukBugunKarti } from './gunluk/GunlukBugunKarti';
import { SilmeSeridi } from './hesabim/SilmeSeridi';
import { KayitlarimGirisi } from './KayitlarimGirisi';
import { BugunMotivasyon } from './motivasyon/BugunMotivasyon';
import { OgrenciBugunOgrenme } from './OgrenciBugunOgrenme';

/** Ogretmenin "ogrenciye gorunsun" notu (api `ogretmene_ozel` notlari ogrenciye hic donmez). */
function OgretmenNotu({ ders, tz }: { ders: Ders; tz: string }) {
  const kat = useYoklamaKatilimcilari(ders.id);
  const not = kat.data?.find((k) => k.not)?.not;
  if (!not) return null;
  return (
    <Kart className="gap-1" testID={`ogretmen-notu-${ders.id}`}>
      <Metin varyant="etiket" accessibilityRole="header">
        {t('mobil.bugun.ogrenci.notBaslik')}
      </Metin>
      <Metin varyant="kucuk">{kisaZaman(ders.baslangic, tz)}</Metin>
      <Metin>{not}</Metin>
    </Kart>
  );
}

/** Buyuk "Odaklan" ve "Soru sor" dugmeleri: yan yana, ilk ekranda. */
function OgrenciEylemleri({ soru }: { soru: boolean }) {
  const router = useRouter();
  return (
    <View className="flex-row gap-3" testID="bugun-eylemler">
      <View className="flex-1">
        <Dugme
          etiket={t('mobil.bugun.ogrenci.odaklan')}
          varyant="birincil"
          buyuk
          testID="bugun-odaklan"
          onPress={() => {
            router.push('/odaklan');
          }}
        />
      </View>
      {soru ? (
        <View className="flex-1">
          <Dugme
            etiket={t('mobil.bugun.ogrenci.soruSor')}
            varyant="vurgu"
            buyuk
            testID="bugun-soru-sor"
            onPress={() => {
              router.push('/(uygulama)/soru-yeni');
            }}
          />
        </View>
      ) : null}
    </View>
  );
}

/**
 * Ogrenci "Bugun": ustte kompakt karakter + seri + gunun hedefi, hemen altinda Odaklan / Soru sor,
 * sonra bugunun plan gorevleri ve yaklasan odevler ("Bugun ne yapmaliyim?" kaydirmadan gorunur),
 * sirada ders, duyurular, cevaplanan sorular. Her kart kendi sorgusunu yonetir: bir servis (ornegin
 * motivasyon) yanit vermezse yalniz o kart hata gosterir, ekranin geri kalani calisir.
 */
export function OgrenciBugun() {
  olcumIsareti('bugun-ilk-render');
  const oturum = useOturum();
  const aktif = useAktif();
  const ad = oturum.asama === 'giris' ? oturum.kullanici.adSoyad.split(' ')[0] : '';
  const oyun = !!aktif && modulAcikMi(aktif.moduller, 'oyunlastirma');
  const soru = !!aktif && modulAcikMi(aktif.moduller, 'soru_sor');
  const takvim = useModulAcik('takvim');
  const finans = useModulAcik('finans');
  const { tz } = useSaatDilimi();
  const bugun = bugunTarihi(tz);
  const dersler = useAralikDersleri(tarihEkle(bugun, -7), 22);
  const kart = useOgrenciKarti(aktif?.uyelik.uyelikId);
  // Ogrenci yalnizca kalan dersini gorur; fiyat/borc/tahsilat bu ekranda hicbir kosulda yoktur.
  const kalan = kart.data?.gorunum === 'ogrenci' ? kart.data.kalanKredi : null;
  const gorevler = useGorevlerim(bugun);
  useBugunOlcumu('ogrenci-bugun', gorevler.data !== undefined, gorevler.dataUpdatedAt);
  const [simdi] = useState(() => Date.now());
  const tumu = dersler.data ?? [];
  const bugunku = tumu.filter((x) => yerelTarih(x.baslangic, tz) === bugun);
  const yaklasan = tumu
    .filter((x) => x.durum === 'planli' && yerelTarih(x.baslangic, tz) > bugun)
    .slice(0, 5);
  const siradaki = tumu.find((x) => x.durum === 'planli' && Date.parse(x.bitis) >= simdi);
  const gecmis = tumu
    .filter((x) => x.durum !== 'iptal' && Date.parse(x.baslangic) < simdi)
    .slice(-3)
    .reverse();

  return (
    <Ekran
      ust={
        <>
          <CevrimdisiSerit />
          <SilmeSeridi />
        </>
      }
      kenarlar={['top', 'left', 'right']}
    >
      <View className="flex-row items-center gap-2">
        <Metin varyant="baslik" accessibilityRole="header" className="flex-1">
          {ad ? t('mobil.bugun.selam', { ad }) : t('mobil.bugun.selamAdsiz')}
        </Metin>
        <BildirimZili />
      </View>
      {oyun ? <BugunMotivasyon /> : null}
      <OgrenciEylemleri soru={soru} />
      <GunlukBugunKarti />
      <OgretmenimGirisi />
      <DuyuruKarti en={1} />
      <OgrenciBugunOgrenme />
      {takvim ? (
        <Kart className="gap-3" testID="siradaki-ders">
          <Metin varyant="altBaslik" accessibilityRole="header">
            {t('mobil.bugun.ogrenci.siradakiDers')}
          </Metin>
          {dersler.isPending ? <KartYukleniyor /> : null}
          {dersler.isError && !dersler.data ? (
            <KartHatasi
              mesaj={hataMesaji(dersler.error)}
              tekrar={() => {
                void dersler.refetch();
              }}
            />
          ) : null}
          {dersler.data && !siradaki ? (
            <BosDurum ikon="calendar-outline" mesaj={t('mobil.bugun.ogrenci.yaklasanBos')} />
          ) : null}
          {siradaki ? (
            <DersSatiri ders={siradaki} ad={dersAdi(siradaki, undefined)} tz={tz} />
          ) : null}
        </Kart>
      ) : null}
      {soru ? <CevaplananSorularKarti /> : null}
      <GeriBildirimKartlari />
      <KayitlarimGirisi />
      {finans && kalan !== null ? (
        <Kart className="flex-row items-center gap-3" testID="kalan-ders">
          <Ikon ad="ticket-outline" />
          <Metin varyant="altBaslik">{t('mobil.finans.ogrenciKalan', { n: kalan })}</Metin>
        </Kart>
      ) : null}
      {takvim ? (
        <>
          <Kart className="gap-3">
            <Metin varyant="altBaslik" accessibilityRole="header">
              {t('mobil.bugun.ogrenci.bugunkuDersler')}
            </Metin>
            {dersler.data && bugunku.length === 0 ? (
              <BosDurum
                ikon="calendar-outline"
                mesaj={t('mobil.bugun.ogrenci.bugunkuDerslerBos')}
              />
            ) : null}
            {bugunku.map((x) => (
              <DersSatiri key={x.id} ders={x} ad={dersAdi(x, undefined)} tz={tz} />
            ))}
          </Kart>
          <Kart className="gap-3">
            <Metin varyant="altBaslik" accessibilityRole="header">
              {t('mobil.bugun.ogrenci.yaklasanDersler')}
            </Metin>
            {dersler.data && yaklasan.length === 0 ? (
              <BosDurum ikon="calendar-outline" mesaj={t('mobil.bugun.ogrenci.yaklasanBos')} />
            ) : null}
            {yaklasan.map((x) => (
              <DersSatiri key={x.id} ders={x} ad={dersAdi(x, undefined)} tz={tz} />
            ))}
          </Kart>
          {gecmis.map((x) => (
            <OgretmenNotu key={x.id} ders={x} tz={tz} />
          ))}
        </>
      ) : null}
      <BildirimIzinKarti />
    </Ekran>
  );
}
