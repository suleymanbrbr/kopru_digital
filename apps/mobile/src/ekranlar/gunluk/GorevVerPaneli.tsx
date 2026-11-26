import { t } from '@kopru/i18n';
import { useState } from 'react';
import { View } from 'react-native';

import type { GorevVerYaniti, Zorluk } from '../../api/gunlukSoruTipleri';
import { sayiAyikla, zorlukAdi } from '../../gunluk/kurallar';
import { tarihGoster } from '../../lib/zaman';
import { Dugme } from '../../ui/Dugme';
import { Ikon } from '../../ui/Ikon';
import { Kart } from '../../ui/Kart';
import { Metin } from '../../ui/Metin';
import { MetinGirdisi } from '../../ui/MetinGirdisi';
import { Secici } from '../../ui/Secici';
import { useGorevVer } from '../../uygulama/gunluk';
import { hataMesaji } from '../../uygulama/hatalar';

interface Props {
  ogrenciId: string;
  ogrenciAd: string;
  bransKodu: string;
  konuId: string;
  konuAd: string;
  zorluk: Zorluk;
  soruSayisi: number;
  kapat: () => void;
}

function sonucMetni(s: GorevVerYaniti): string {
  if (s.tur === 'odev') return t('mobil.gunluk.gorev.odevVerildi');
  return s.planDurum === 'taslak'
    ? t('mobil.gunluk.gorev.planTaslak', { gun: tarihGoster(s.gun) })
    : t('mobil.gunluk.gorev.planYayinda', { gun: tarihGoster(s.gun) });
}

/**
 * "Görev ver": öneriden (ya da konu + zorluktan) plan görevi ya da tek öğrencilik ödev. Hiçbir şey
 * kendiliğinden gitmez: özet gösterilir, öğretmen "Onayla ve ver" ile onaylar.
 */
export function GorevVerPaneli({
  ogrenciId,
  ogrenciAd,
  bransKodu,
  konuId,
  konuAd,
  zorluk,
  soruSayisi,
  kapat,
}: Props) {
  const gorevVer = useGorevVer(ogrenciId);
  const [tur, setTur] = useState<'plan_gorevi' | 'odev'>('plan_gorevi');
  const [sayi, setSayi] = useState(String(soruSayisi));
  const [sonuc, setSonuc] = useState<GorevVerYaniti | null>(null);
  const n = sayiAyikla(sayi);
  const gecerli = n >= 1 && n <= 500;
  const ozet = t(
    tur === 'plan_gorevi' ? 'mobil.gunluk.gorev.ozetPlan' : 'mobil.gunluk.gorev.ozetOdev',
    {
      ogrenci: ogrenciAd || t('mobil.ogrenciler.adsiz'),
      konu: konuAd,
      zorluk: zorlukAdi(zorluk).toLowerCase(),
      sayi: n,
    },
  );

  if (sonuc) {
    return (
      <Kart className="gap-3 border-basari" testID="gorev-sonuc">
        <View className="flex-row items-center gap-2">
          <Ikon ad="checkmark-circle" boyut={22} />
          <Metin varyant="altBaslik" className="flex-1" accessibilityLiveRegion="polite">
            {t('mobil.gunluk.gorev.verildi')}
          </Metin>
        </View>
        <Metin>{sonucMetni(sonuc)}</Metin>
        <Dugme varyant="ikincil" etiket={t('ortak.kapat')} onPress={kapat} testID="gorev-kapat" />
      </Kart>
    );
  }

  return (
    <Kart className="gap-3 border-birincil" testID="gorev-paneli">
      <Metin varyant="altBaslik" accessibilityRole="header">
        {t('mobil.gunluk.gorev.baslik')}
      </Metin>
      <Secici
        baslik={t('mobil.gunluk.gorev.tur')}
        secenekler={[
          { deger: 'plan_gorevi', etiket: t('mobil.gunluk.gorev.turPlan') },
          { deger: 'odev', etiket: t('mobil.gunluk.gorev.turOdev') },
        ]}
        deger={tur}
        onDegis={setTur}
      />
      <MetinGirdisi
        etiket={t('mobil.gunluk.gorev.soruSayisi')}
        value={sayi}
        onChangeText={setSayi}
        keyboardType="number-pad"
        maxLength={3}
        testID="gorev-soru-sayisi"
        hata={gecerli ? null : t('mobil.gunluk.gorev.soruSayisiHata')}
      />
      <Metin testID="gorev-ozet">{ozet}</Metin>
      {gorevVer.isError ? (
        <Metin varyant="ikincil" className="text-hata" accessibilityRole="alert">
          {hataMesaji(gorevVer.error)}
        </Metin>
      ) : null}
      <View className="flex-row gap-2">
        <Dugme
          className="flex-1"
          etiket={t('mobil.gunluk.gorev.onayla')}
          disabled={!gecerli}
          yukleniyor={gorevVer.isPending}
          testID="gorev-onayla"
          onPress={() => {
            gorevVer.mutate(
              { tur, bransKodu, konuId, zorluk, soruSayisi: n },
              { onSuccess: setSonuc },
            );
          }}
        />
        <Dugme
          className="flex-1"
          varyant="ikincil"
          etiket={t('ortak.vazgec')}
          onPress={kapat}
          testID="gorev-vazgec"
        />
      </View>
    </Kart>
  );
}
