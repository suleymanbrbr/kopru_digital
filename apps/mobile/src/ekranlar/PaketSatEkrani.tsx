import { kurusBicimle, t } from '@kopru/i18n';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import type { OdemeSecimi, PaketSatisSonucu, TahsilatYontemi } from '../api/operasyonTipleri';
import { tutarCoz } from '../finans/kurallar';
import { hatirla, hatirlananiOku } from '../lib/cakisma';
import { Dugme } from '../ui/Dugme';
import { HataDurumu, Yukleniyor } from '../ui/Durumlar';
import { Ekran } from '../ui/Ekran';
import { Ikon } from '../ui/Ikon';
import { Kart } from '../ui/Kart';
import { Metin } from '../ui/Metin';
import { MetinGirdisi } from '../ui/MetinGirdisi';
import { Secici } from '../ui/Secici';
import { useServisler } from '../uygulama/baglam';
import { hataMesaji } from '../uygulama/hatalar';
import { usePaketler } from '../uygulama/operasyon';

const SON_YONTEM = 'kopru.finans.sonYontem';

export function yontemSecenekleri() {
  return [
    { deger: 'nakit' as const, etiket: t('mobil.finans.yontemNakit') },
    { deger: 'havale' as const, etiket: t('mobil.finans.yontemHavale') },
    { deger: 'kart' as const, etiket: t('mobil.finans.yontemKart') },
  ];
}

export function sonYontem(): TahsilatYontemi {
  const y = hatirlananiOku(SON_YONTEM);
  return y === 'havale' || y === 'kart' ? y : 'nakit';
}

export function yontemiHatirla(y: TahsilatYontemi) {
  hatirla(SON_YONTEM, y);
}

type OdemeTuru = 'tamami' | 'kismi' | 'sonra';

/**
 * Paket sat: hazir paket sec -> odeme (varsayilan tamami, nakit) -> kaydet. Tamami/nakit
 * varsayilanlariyla 3 dokunus. Kismi tutar paket fiyatindan az olmali.
 */
export function PaketSatEkrani({ ogrenciId, ad }: { ogrenciId: string; ad: string }) {
  const router = useRouter();
  const qc = useQueryClient();
  const { adaptorler } = useServisler();
  const paketler = usePaketler();
  const [paketId, setPaketId] = useState<string | null>(null);
  const [tur, setTur] = useState<OdemeTuru>('tamami');
  const [yontem, setYontem] = useState<TahsilatYontemi>(sonYontem());
  const [tutar, setTutar] = useState('');
  const [denendi, setDenendi] = useState(false);
  const [sonuc, setSonuc] = useState<PaketSatisSonucu | null>(null);

  const paket = paketler.data?.find((p) => p.id === paketId);
  const kismi = tutarCoz(tutar);
  let tutarHata: string | null = null;
  if (tur === 'kismi') {
    if (!kismi.ok) {
      tutarHata =
        kismi.hata === 'bos' ? t('mobil.finans.tutarBos') : t('mobil.finans.tutarGecersiz');
    } else if (paket && kismi.kurus >= paket.fiyatKurus) {
      tutarHata = t('mobil.finans.kismiTutarFazla');
    }
  }
  const paketHata = paketId ? null : t('mobil.finans.paketSec');

  const sat = useMutation({
    networkMode: 'always',
    mutationFn: (odeme: OdemeSecimi) =>
      adaptorler.finans.paketSat({ ogrenciId, paketId: paketId ?? '', odeme }),
    onSuccess: (s) => {
      if (tur !== 'sonra') yontemiHatirla(yontem);
      void qc.invalidateQueries({ queryKey: ['finans'] });
      setSonuc(s);
    },
  });

  function kaydet() {
    setDenendi(true);
    if (paketHata || tutarHata || !paket) return;
    const odeme: OdemeSecimi =
      tur === 'sonra'
        ? { tur: 'sonra' }
        : tur === 'tamami'
          ? { tur: 'tamami', yontem }
          : { tur: 'kismi', yontem, tutarKurus: kismi.ok ? kismi.kurus : 0 };
    sat.mutate(odeme);
  }

  if (sonuc) {
    return (
      <Ekran kenarlar={['left', 'right']}>
        <Kart
          className="items-center gap-3"
          accessibilityLiveRegion="polite"
          testID="paket-satildi"
        >
          <Ikon ad="checkmark-circle" boyut={40} />
          <Metin varyant="altBaslik" className="text-center">
            {t('mobil.finans.satisYapildi', { n: sonuc.kalanKredi })}
          </Metin>
          <Dugme
            etiket={t('ortak.devam')}
            onPress={() => {
              router.back();
            }}
          />
        </Kart>
      </Ekran>
    );
  }

  return (
    <Ekran kenarlar={['left', 'right', 'bottom']} klavye>
      <Metin varyant="baslik" accessibilityRole="header">
        {ad}
      </Metin>
      <View className="gap-2">
        <Metin varyant="altBaslik" accessibilityRole="header">
          {t('mobil.finans.paketSec')}
        </Metin>
        {paketler.isPending ? <Yukleniyor /> : null}
        {paketler.isError && !paketler.data ? (
          <HataDurumu
            mesaj={t('mobil.finans.paketlerYuklenemedi')}
            tekrar={() => void paketler.refetch()}
          />
        ) : null}
        {paketler.data?.length === 0 ? (
          <Metin varyant="ikincil">{t('mobil.finans.paketlerYok')}</Metin>
        ) : null}
        {paketler.data && paketler.data.length > 0 ? (
          <Secici
            dikey
            secenekler={paketler.data.map((p) => ({
              deger: p.id,
              etiket: `${p.ad} · ${t('mobil.finans.paketOzet', {
                kredi: p.krediAdedi,
                fiyat: kurusBicimle(p.fiyatKurus),
              })}`,
              erisilebilirlikEtiketi: t('mobil.finans.paketEtiketi', {
                ad: p.ad,
                kredi: p.krediAdedi,
                fiyat: kurusBicimle(p.fiyatKurus),
              }),
            }))}
            deger={paketId}
            onDegis={setPaketId}
          />
        ) : null}
        {denendi && paketHata ? (
          <Metin varyant="ikincil" className="text-hata">
            {paketHata}
          </Metin>
        ) : null}
      </View>

      <Secici
        baslik={t('mobil.finans.odemeBaslik')}
        secenekler={[
          { deger: 'tamami', etiket: t('mobil.finans.odemeTamami') },
          { deger: 'kismi', etiket: t('mobil.finans.odemeKismi') },
          { deger: 'sonra', etiket: t('mobil.finans.odemeSonra') },
        ]}
        deger={tur}
        onDegis={setTur}
      />
      {tur !== 'sonra' ? (
        <Secici
          baslik={t('mobil.finans.yontem')}
          secenekler={yontemSecenekleri()}
          deger={yontem}
          onDegis={setYontem}
        />
      ) : null}
      {tur === 'kismi' ? (
        <MetinGirdisi
          etiket={t('mobil.finans.tutar')}
          value={tutar}
          onChangeText={setTutar}
          placeholder={t('mobil.finans.tutarIpucu')}
          keyboardType="decimal-pad"
          hata={denendi ? tutarHata : null}
        />
      ) : null}

      {sat.isError ? (
        <Metin varyant="ikincil" className="text-hata" accessibilityLiveRegion="polite">
          {hataMesaji(sat.error)}
        </Metin>
      ) : null}
      <Dugme
        buyuk
        etiket={t('mobil.finans.satisKaydet')}
        yukleniyor={sat.isPending}
        onPress={kaydet}
      />
    </Ekran>
  );
}
