import { t } from '@kopru/i18n';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, type ComponentProps } from 'react';
import { Alert, View } from 'react-native';

import type { KatilimIstegi } from '../api/tipler';
import { kodBicimle, kodDogrula } from '../hesap/sinifKodu';
import { Dugme } from '../ui/Dugme';
import { BosDurum, HataDurumu, Yukleniyor } from '../ui/Durumlar';
import { Ekran } from '../ui/Ekran';
import { Ikon } from '../ui/Ikon';
import { Kart } from '../ui/Kart';
import { Metin } from '../ui/Metin';
import { MetinGirdisi } from '../ui/MetinGirdisi';
import { useOturum, useServisler } from '../uygulama/baglam';
import { hataMesaji, katilimHataMesaji } from '../uygulama/hatalar';
import { CevrimdisiSerit } from './CevrimdisiSerit';

interface Props {
  /** Ekranin kendi geri dugmesi yoksa (onboarding) gosterilir. */
  geri?: () => void;
  /** Ust bar (header) varsa 'top' dislanir. */
  kenarlar?: ComponentProps<typeof Ekran>['kenarlar'];
}

/**
 * Sinif koduyla katil (ogrenci ya da uyeliksiz kullanici): kod gir -> istek gonder -> "onay
 * bekleniyor" -> bekleyen isteklerim (iptal). Kod bicimi istemcide denetlenir; bicimi hatali
 * kod sunucuya gitmez (5 basarisiz denemede 15 dk kilit oldugu icin deneme hakki korunur).
 */
export function SinifKoduKatil({ geri, kenarlar }: Props) {
  const { adaptorler, oturum } = useServisler();
  const durum = useOturum();
  const qc = useQueryClient();
  const kullaniciId = durum.asama === 'giris' ? durum.kullanici.id : undefined;
  const anahtar = ['sinif-istekleri', kullaniciId] as const;

  const [kod, setKod] = useState('');
  const [girdiHatasi, setGirdiHatasi] = useState<string | null>(null);
  const [gonderilen, setGonderilen] = useState<KatilimIstegi | null>(null);
  const [bilgi, setBilgi] = useState<string | null>(null);

  const istekler = useQuery({
    queryKey: anahtar,
    queryFn: () => adaptorler.hesap.sinifKoduIsteklerim(),
    enabled: !!kullaniciId,
    // Onay gelince listeden duser; yeni uyelik icin duzenli kontrol (bildirim henuz yok).
    refetchInterval: 15_000,
    staleTime: 0,
  });

  const katil = useMutation({
    networkMode: 'always',
    mutationFn: (k: string) => adaptorler.hesap.sinifKoduKatil(k),
    onSuccess: (istek) => {
      setGonderilen(istek);
      setKod('');
      setGirdiHatasi(null);
      void qc.invalidateQueries({ queryKey: anahtar });
    },
    onError: (e) => {
      setGirdiHatasi(katilimHataMesaji(e));
    },
  });

  const iptal = useMutation({
    networkMode: 'always',
    mutationFn: (id: string) => adaptorler.hesap.sinifKoduIstegiIptal(id),
    onSuccess: (_s, id) => {
      setGonderilen((g) => (g?.id === id ? null : g));
    },
    onError: (e) => {
      setBilgi(hataMesaji(e));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: anahtar }),
  });

  // Bekleyen bir istek listeden kaybolduysa onaylanmis olabilir: uyelikleri yenile.
  const oncekiIdler = useRef<string[]>([]);
  useEffect(() => {
    if (!istekler.data) return;
    const simdi = istekler.data.map((i) => i.id);
    const kayboldu = oncekiIdler.current.some((id) => !simdi.includes(id));
    oncekiIdler.current = simdi;
    if (!kayboldu) return;
    void oturum
      .uyelikleriYenile()
      .then(() => {
        setBilgi(t('mobil.sinifKodu.uyelikGeldi'));
        setGonderilen(null);
      })
      .catch(() => undefined);
  }, [istekler.data, oturum]);

  function gonder() {
    const sonuc = kodDogrula(kod);
    if (sonuc !== 'tamam') {
      setGirdiHatasi(
        sonuc === 'karakter' ? t('mobil.sinifKodu.gecersizKarakter') : t('mobil.sinifKodu.uzunluk'),
      );
      return;
    }
    setBilgi(null);
    setGirdiHatasi(null);
    katil.mutate(kodBicimle(kod));
  }

  function iptalEt(i: KatilimIstegi) {
    Alert.alert(
      t('mobil.sinifKodu.iptalOnay'),
      t('mobil.sinifKodu.iptalOnayMesaj', { kurum: i.kurumAd, grup: i.grupAd }),
      [
        { text: t('mobil.sinifKodu.vazgec'), style: 'cancel' },
        {
          text: t('mobil.sinifKodu.iptal'),
          style: 'destructive',
          onPress: () => {
            iptal.mutate(i.id);
          },
        },
      ],
    );
  }

  async function yenile() {
    setBilgi(null);
    await Promise.all([istekler.refetch(), oturum.uyelikleriYenile().catch(() => undefined)]);
  }

  return (
    <Ekran ust={<CevrimdisiSerit />} klavye {...(kenarlar ? { kenarlar } : {})}>
      <View className="gap-2">
        <Metin varyant="baslik" accessibilityRole="header">
          {t('mobil.sinifKodu.baslik')}
        </Metin>
        <Metin varyant="ikincil">{t('mobil.sinifKodu.aciklama')}</Metin>
      </View>

      <MetinGirdisi
        etiket={t('mobil.sinifKodu.girdiEtiketi')}
        placeholder={t('mobil.sinifKodu.ipucu')}
        value={kod}
        onChangeText={(v) => {
          setKod(kodBicimle(v));
          setGirdiHatasi(null);
        }}
        hata={girdiHatasi}
        autoCapitalize="characters"
        autoCorrect={false}
        autoComplete="off"
        spellCheck={false}
        returnKeyType="send"
        onSubmitEditing={gonder}
      />
      <Dugme
        etiket={t('mobil.sinifKodu.gonder')}
        buyuk
        yukleniyor={katil.isPending}
        onPress={gonder}
      />

      {gonderilen ? (
        <Kart className="flex-row items-start gap-3" accessibilityLiveRegion="polite">
          <Ikon ad="hourglass-outline" boyut={24} />
          <View className="flex-1 gap-1">
            <Metin varyant="altBaslik">{t('mobil.sinifKodu.onayBekliyorBaslik')}</Metin>
            <Metin varyant="ikincil">
              {t('mobil.sinifKodu.onayBekliyor', {
                kurum: gonderilen.kurumAd,
                grup: gonderilen.grupAd,
              })}
            </Metin>
          </View>
        </Kart>
      ) : null}

      {bilgi ? (
        <Metin varyant="ikincil" accessibilityLiveRegion="polite">
          {bilgi}
        </Metin>
      ) : null}

      <View className="gap-3">
        <Metin varyant="altBaslik" accessibilityRole="header">
          {t('mobil.sinifKodu.bekleyenlerBaslik')}
        </Metin>
        {istekler.isPending ? <Yukleniyor /> : null}
        {istekler.isError ? (
          <HataDurumu
            mesaj={hataMesaji(istekler.error)}
            tekrar={() => {
              void istekler.refetch();
            }}
          />
        ) : null}
        {istekler.data?.length === 0 ? (
          <BosDurum ikon="checkmark-circle-outline" mesaj={t('mobil.sinifKodu.bekleyenYok')} />
        ) : null}
        {istekler.data?.map((i) => (
          <Kart
            key={i.id}
            className="gap-3"
            accessible
            accessibilityLabel={t('mobil.sinifKodu.bekleyenEtiketi', {
              kurum: i.kurumAd,
              grup: i.grupAd,
            })}
          >
            <View className="gap-1">
              <Metin varyant="altBaslik">{i.grupAd}</Metin>
              <Metin varyant="ikincil">{i.kurumAd}</Metin>
              <Metin varyant="kucuk">{t('mobil.sinifKodu.onayBekliyorKisa')}</Metin>
            </View>
            <Dugme
              varyant="ikincil"
              etiket={t('mobil.sinifKodu.iptal')}
              yukleniyor={iptal.isPending && iptal.variables === i.id}
              onPress={() => {
                iptalEt(i);
              }}
            />
          </Kart>
        ))}
        <Dugme
          varyant="hayalet"
          etiket={t('mobil.sinifKodu.yenile')}
          yukleniyor={istekler.isFetching && !istekler.isPending}
          onPress={() => void yenile()}
        />
      </View>

      {geri ? (
        <Dugme varyant="hayalet" etiket={t('mobil.sinifKodu.kurumSeceDon')} onPress={geri} />
      ) : null}
    </Ekran>
  );
}
