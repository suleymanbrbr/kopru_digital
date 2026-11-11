import { t } from '@kopru/i18n';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import type { Ders } from '../api/operasyonTipleri';
import { Companion } from '../karakter/Companion';
import { bugunTarihi, kisaZaman, tarihEkle, yerelTarih } from '../lib/saat';
import { modulAcikMi } from '../nav/yapilandirma';
import { Dugme } from '../ui/Dugme';
import { BosDurum, HataDurumu, Yukleniyor } from '../ui/Durumlar';
import { Ekran } from '../ui/Ekran';
import { Ikon } from '../ui/Ikon';
import { Kart } from '../ui/Kart';
import { Metin } from '../ui/Metin';
import { useAktif, useOturum } from '../uygulama/baglam';
import { hataMesaji } from '../uygulama/hatalar';
import {
  dersAdi,
  useAralikDersleri,
  useModulAcik,
  useOgrenciKarti,
  useSaatDilimi,
  useYoklamaKatilimcilari,
} from '../uygulama/operasyon';
import { useOgrenciBugun } from '../uygulama/sorgular';
import { CevrimdisiSerit } from './CevrimdisiSerit';
import { DersSatiri } from './DerslerEkrani';
import { GeriBildirimKartlari } from './GeriBildirimKartlari';
import { KayitlarimGirisi } from './KayitlarimGirisi';
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

export function OgrenciBugun() {
  const router = useRouter();
  const oturum = useOturum();
  const aktif = useAktif();
  const sorgu = useOgrenciBugun();
  const ad = oturum.asama === 'giris' ? oturum.kullanici.adSoyad.split(' ')[0] : '';
  const oyun = !!aktif && modulAcikMi(aktif.moduller, 'oyunlastirma');
  const soru = !!aktif && modulAcikMi(aktif.moduller, 'soru_sor');
  const d = sorgu.data;
  const takvim = useModulAcik('takvim');
  const finans = useModulAcik('finans');
  const { tz } = useSaatDilimi();
  const bugun = bugunTarihi(tz);
  const dersler = useAralikDersleri(tarihEkle(bugun, -7), 22);
  const kart = useOgrenciKarti(aktif?.uyelik.uyelikId);
  // Ogrenci yalnizca kalan dersini gorur; fiyat/borc/tahsilat bu ekranda hicbir kosulda yoktur.
  const kalan = kart.data?.gorunum === 'ogrenci' ? kart.data.kalanKredi : null;
  const [simdi] = useState(() => Date.now());
  const bugunku = (dersler.data ?? []).filter((x) => yerelTarih(x.baslangic, tz) === bugun);
  const yaklasan = (dersler.data ?? [])
    .filter((x) => x.durum === 'planli' && yerelTarih(x.baslangic, tz) > bugun)
    .slice(0, 5);
  const gecmis = (dersler.data ?? [])
    .filter((x) => x.durum !== 'iptal' && Date.parse(x.baslangic) < simdi)
    .slice(-3)
    .reverse();

  return (
    <Ekran ust={<CevrimdisiSerit />} kenarlar={['top', 'left', 'right']}>
      <Metin varyant="baslik" accessibilityRole="header">
        {t('mobil.bugun.selam', { ad: ad ?? '' })}
      </Metin>
      {sorgu.isPending ? <Yukleniyor /> : null}
      {sorgu.isError ? (
        <HataDurumu mesaj={hataMesaji(sorgu.error)} tekrar={() => void sorgu.refetch()} />
      ) : null}
      {d ? (
        <>
          <GeriBildirimKartlari />
          {oyun ? (
            <Kart className="items-center gap-3">
              <Companion
                tur={d.karakter.tur}
                asama={d.karakter.asama}
                seviye={d.karakter.seviye}
                varyant={d.karakter.varyant}
                beceriler={d.karakter.beceriler}
                ruhHali={d.karakter.uykulu ? 'uykulu' : 'normal'}
                ad={d.karakter.ad}
                boyut={168}
              />
              <View
                className="flex-row items-center gap-2 rounded-tam bg-yuzeyIkincil px-4 py-2"
                accessible
                accessibilityLabel={`${t('mobil.bugun.ogrenci.seri')}: ${
                  d.seri > 0
                    ? t('mobil.bugun.ogrenci.seriGun', { n: d.seri })
                    : t('mobil.bugun.ogrenci.seriYok')
                }`}
              >
                <Ikon ad="flame" renk="#FF8A3D" />
                <Metin varyant="etiket">
                  {d.seri > 0
                    ? t('mobil.bugun.ogrenci.seriGun', { n: d.seri })
                    : t('mobil.bugun.ogrenci.seriYok')}
                </Metin>
              </View>
            </Kart>
          ) : null}
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
                {dersler.isPending ? <Yukleniyor /> : null}
                {dersler.isError && !dersler.data ? (
                  <HataDurumu
                    mesaj={hataMesaji(dersler.error)}
                    tekrar={() => void dersler.refetch()}
                  />
                ) : null}
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
          <KayitlarimGirisi />
          <OgrenciBugunOgrenme />
        </>
      ) : null}
      <Dugme
        etiket={t('mobil.bugun.ogrenci.odaklan')}
        varyant="birincil"
        buyuk
        onPress={() => {
          router.push('/odaklan');
        }}
      />
      {soru ? (
        <Dugme
          etiket={t('mobil.bugun.ogrenci.soruSor')}
          varyant="vurgu"
          buyuk
          onPress={() => {
            router.navigate('/soru-sor');
          }}
        />
      ) : null}
    </Ekran>
  );
}
