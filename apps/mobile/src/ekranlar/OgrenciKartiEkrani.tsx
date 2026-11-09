import { kurusBicimle, t, type MessageKey } from '@kopru/i18n';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Linking, View } from 'react-native';

import type { FinansHareketi, OgrenciKartiTam } from '../api/operasyonTipleri';
import { whatsappBaglantisi } from '../finans/kurallar';
import { kisaZaman } from '../lib/saat';
import { tarihGoster } from '../lib/zaman';
import { Dugme } from '../ui/Dugme';
import { HataDurumu, Yukleniyor } from '../ui/Durumlar';
import { Ekran } from '../ui/Ekran';
import { Kart } from '../ui/Kart';
import { Metin } from '../ui/Metin';
import { MetinGirdisi } from '../ui/MetinGirdisi';
import { KalanDersRozeti } from '../ui/Rozet';
import { hataMesaji } from '../uygulama/hatalar';
import { useOgrenciKarti, useSaatDilimi } from '../uygulama/operasyon';
import { CevrimdisiSerit } from './CevrimdisiSerit';

/** Bakiye metni: negatif = borclu. Tum tutarlar `kurusBicimle` ile gosterilir. */
export function bakiyeMetni(bakiyeKurus: number): string {
  if (bakiyeKurus < 0) return t('mobil.finans.borc', { tutar: kurusBicimle(-bakiyeKurus) });
  if (bakiyeKurus > 0) return t('mobil.finans.alacak', { tutar: kurusBicimle(bakiyeKurus) });
  return t('mobil.finans.bakiyeSifir');
}

function hareketMetni(h: FinansHareketi): string {
  const tur = t(`mobil.finans.hareketTuru.${h.turKodu}` as MessageKey);
  const ad = tur.startsWith('mobil.') ? h.turKodu : tur;
  if (h.tur === 'kredi') {
    const adet = `${h.miktar > 0 ? '+' : ''}${String(h.miktar)}`;
    return `${ad}: ${t('mobil.finans.kalanDersSayi', { n: adet })}`;
  }
  return `${ad}: ${kurusBicimle(h.miktar)}`;
}

function WhatsappHatirlatma({
  ogrenciAd,
  kalan,
  telefon,
}: {
  ogrenciAd: string;
  kalan: number;
  telefon: string | null;
}) {
  const [acik, setAcik] = useState(false);
  const [metin, setMetin] = useState(
    t('mobil.finans.hatirlatMetni', { ogrenci: ogrenciAd, kalan }),
  );
  const [hata, setHata] = useState<string | null>(null);
  const baglanti = whatsappBaglantisi(telefon, metin);
  if (!telefon) {
    return <Metin varyant="kucuk">{t('mobil.finans.telefonYok')}</Metin>;
  }
  return (
    <View className="gap-3">
      <Dugme
        varyant="ikincil"
        etiket={t('mobil.finans.hatirlat')}
        onPress={() => {
          setAcik((a) => !a);
        }}
      />
      {acik ? (
        <Kart className="gap-3" testID="whatsapp-hatirlat">
          <Metin varyant="altBaslik" accessibilityRole="header">
            {t('mobil.finans.hatirlatBaslik')}
          </Metin>
          <MetinGirdisi
            etiket={t('mobil.finans.hatirlatMetniEtiketi')}
            value={metin}
            onChangeText={setMetin}
            multiline
            maxLength={500}
          />
          {hata ? (
            <Metin varyant="ikincil" className="text-hata" accessibilityLiveRegion="polite">
              {hata}
            </Metin>
          ) : null}
          <Dugme
            etiket={t('mobil.finans.hatirlatGonder')}
            disabled={!baglanti}
            onPress={() => {
              // Yalniz kullanici dokununca acilir; otomatik gonderim yoktur.
              if (!baglanti) return;
              setHata(null);
              Linking.openURL(baglanti).catch(() => {
                setHata(t('mobil.finans.hatirlatAcilamadi'));
              });
            }}
          />
        </Kart>
      ) : null}
    </View>
  );
}

function TamKart({ k, ad }: { k: OgrenciKartiTam; ad: string }) {
  const router = useRouter();
  const { tz } = useSaatDilimi();
  const adGoster = ad || t('mobil.ogrenciler.adsiz');
  return (
    <>
      <Kart className="gap-3">
        <Metin varyant="baslik" accessibilityRole="header">
          {adGoster}
        </Metin>
        <View
          className="gap-1"
          accessible
          accessibilityLabel={`${t('mobil.finans.kalanDers')}: ${t('mobil.finans.kalanDersSayi', { n: k.kalanKredi })}. ${bakiyeMetni(k.bakiyeKurus)}`}
        >
          <Metin varyant="kucuk">{t('mobil.finans.kalanDers')}</Metin>
          <Metin varyant="baslik">{t('mobil.finans.kalanDersSayi', { n: k.kalanKredi })}</Metin>
          {k.model === 'paket' ? (
            <KalanDersRozeti kalan={k.kalanKredi} esik={k.dusukKrediEsigi} />
          ) : null}
        </View>
        <View className="gap-1">
          <Metin varyant="kucuk">{t('mobil.finans.bakiye')}</Metin>
          <Metin varyant="altBaslik" className={k.borclu ? 'text-hata' : ''}>
            {bakiyeMetni(k.bakiyeKurus)}
          </Metin>
        </View>
        <Metin varyant="kucuk">
          {t('mobil.finans.model')}:{' '}
          {k.model === 'paket'
            ? t('mobil.finans.modelPaket')
            : k.model === 'ders_basi'
              ? t('mobil.finans.modelDersBasi')
              : t('mobil.finans.modelYok')}
        </Metin>
      </Kart>

      <View className="gap-3">
        <Dugme
          etiket={t('mobil.finans.paketSat')}
          onPress={() => {
            router.push({
              pathname: '/paket-sat',
              params: { ogrenciId: k.ogrenciId, ad: adGoster },
            });
          }}
        />
        <Dugme
          varyant="ikincil"
          etiket={t('mobil.finans.odemeAl')}
          onPress={() => {
            router.push({
              pathname: '/odeme-al',
              params: { ogrenciId: k.ogrenciId, ad: adGoster },
            });
          }}
        />
        <WhatsappHatirlatma ogrenciAd={adGoster} kalan={k.kalanKredi} telefon={k.odeyenTelefon} />
      </View>

      <Kart className="gap-2">
        <Metin varyant="altBaslik" accessibilityRole="header">
          {t('mobil.finans.etkinPaketler')}
        </Metin>
        {k.etkinPaketler.length === 0 ? (
          <Metin varyant="ikincil">{t('mobil.finans.paketYok')}</Metin>
        ) : null}
        {k.etkinPaketler.map((p) => (
          <View key={p.id} className="gap-1 border-t border-kenar pt-2">
            <Metin varyant="etiket">{p.ad}</Metin>
            <Metin varyant="kucuk">
              {t('mobil.finans.paketKalan', { kalan: p.kalanKredi, toplam: p.toplamKredi })}
              {p.bitisTarihi
                ? ` · ${t('mobil.finans.paketBitis', { tarih: tarihGoster(p.bitisTarihi) })}`
                : ''}
            </Metin>
          </View>
        ))}
      </Kart>

      <Kart className="gap-2">
        <Metin varyant="altBaslik" accessibilityRole="header">
          {t('mobil.finans.hareketler')}
        </Metin>
        {k.hareketler.length === 0 ? (
          <Metin varyant="ikincil">{t('mobil.finans.hareketYok')}</Metin>
        ) : null}
        {k.hareketler.map((h) => (
          <View key={h.id} className="gap-1 border-t border-kenar pt-2">
            <Metin varyant="etiket">{hareketMetni(h)}</Metin>
            <Metin varyant="kucuk">{kisaZaman(h.tarih, tz)}</Metin>
          </View>
        ))}
      </Kart>

      <Kart className="gap-1">
        <Metin varyant="altBaslik" accessibilityRole="header">
          {t('mobil.finans.odeyen')}
        </Metin>
        {k.odeyenAd || k.odeyenTelefon ? (
          <>
            {k.odeyenAd ? <Metin>{k.odeyenAd}</Metin> : null}
            {k.odeyenTelefon ? <Metin varyant="ikincil">{k.odeyenTelefon}</Metin> : null}
          </>
        ) : (
          <Metin varyant="ikincil">{t('mobil.finans.odeyenYok')}</Metin>
        )}
      </Kart>
    </>
  );
}

/** Ogrenci karti (ogretmen/sahip/yonetici): kalan ders, bakiye, paketler, hareketler, odeyen. */
export function OgrenciKartiEkrani({ ogrenciId, ad }: { ogrenciId: string; ad: string }) {
  const sorgu = useOgrenciKarti(ogrenciId);
  return (
    <Ekran ust={<CevrimdisiSerit />} kenarlar={['left', 'right', 'bottom']}>
      {sorgu.isPending ? <Yukleniyor /> : null}
      {sorgu.isError && !sorgu.data ? (
        <HataDurumu mesaj={hataMesaji(sorgu.error)} tekrar={() => void sorgu.refetch()} />
      ) : null}
      {sorgu.data?.gorunum === 'tam' ? <TamKart k={sorgu.data} ad={ad} /> : null}
    </Ekran>
  );
}
