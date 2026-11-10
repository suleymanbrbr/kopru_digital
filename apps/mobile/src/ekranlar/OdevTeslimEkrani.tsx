import { t } from '@kopru/i18n';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import type { OgrenciOdevi } from '../api/ogrenmeTipleri';
import { kisaZaman } from '../lib/saat';
import { bransAdi, konuEtiketi } from '../ogrenme/konu';
import { odevGecikmisMi, teslimBekliyorMu, teslimKur, type TeslimHatasi } from '../ogrenme/odev';
import { Dugme } from '../ui/Dugme';
import { BosDurum, HataDurumu, Yukleniyor } from '../ui/Durumlar';
import { Ekran } from '../ui/Ekran';
import { Ikon } from '../ui/Ikon';
import { Kart } from '../ui/Kart';
import { Metin } from '../ui/Metin';
import { MetinGirdisi } from '../ui/MetinGirdisi';
import { useServisler } from '../uygulama/baglam';
import { hataMesaji } from '../uygulama/hatalar';
import { useKonuHaritasi, useOdevlerim } from '../uygulama/ogrenme';
import { useSaatDilimi } from '../uygulama/operasyon';
import { sonucMetni } from './OgrenciGorevler';

const HATA_ANAHTARI: Record<TeslimHatasi, string> = {
  yapilan: t('mobil.ogrenme.odev.yapilanGerekli'),
  gecersiz: t('mobil.ogrenme.odev.sayiGecersiz'),
  asim: t('mobil.ogrenme.odev.toplamAsim'),
  toplam: t('mobil.ogrenme.odev.toplamTutmuyor'),
};

function Satir({ etiket, deger }: { etiket: string; deger: string }) {
  return (
    <View className="flex-row justify-between gap-3">
      <Metin varyant="ikincil">{etiket}</Metin>
      <Metin varyant="etiket">{deger}</Metin>
    </View>
  );
}

function SonucOzeti({ odev, tz }: { odev: OgrenciOdevi; tz: string }) {
  return (
    <Kart className="gap-2" testID="teslim-ozeti">
      <Metin varyant="altBaslik" accessibilityRole="header">
        {t('mobil.ogrenme.odev.teslimBilgisi')}
      </Metin>
      <Satir etiket={t('mobil.ogrenme.odev.durumEtiketi')} deger={sonucMetni(odev)} />
      {odev.teslimAt ? (
        <Satir etiket={t('mobil.ogrenme.odev.teslimZamani')} deger={kisaZaman(odev.teslimAt, tz)} />
      ) : null}
      {odev.yapilanSoru !== null ? (
        <Satir
          etiket={t('mobil.ogrenme.odev.yapilan')}
          deger={String(odev.yapilanSoru)}
        />
      ) : null}
      {odev.dogru !== null ? (
        <Satir
          etiket={t('mobil.ogrenme.odev.dogruYanlisBos')}
          deger={`${String(odev.dogru)} / ${String(odev.yanlis ?? 0)} / ${String(odev.bos ?? 0)}`}
        />
      ) : null}
      {odev.ogrenciNotu ? (
        <Satir etiket={t('mobil.ogrenme.odev.notum')} deger={odev.ogrenciNotu} />
      ) : null}
      {odev.incelemeNotu ? (
        <View className="gap-1 border-t border-kenar pt-2" testID="inceleme-notu">
          <Metin varyant="kucuk">{t('mobil.ogrenme.odev.ogretmenNotuBaslik')}</Metin>
          <Metin>{odev.incelemeNotu}</Metin>
        </View>
      ) : null}
    </Kart>
  );
}

/**
 * Odev teslimi (ogrenci): yapilan, dogru/yanlis/bos ve not tek ekranda; yapilan hedefle onceden
 * dolu olur (2 dokunus: kart + "Teslim et"). Teslim baglanti ister; yoksa acik mesaj gosterilir
 * ve hicbir sey sessizce kaybolmaz. Incelenen odevde sonuc ve ogretmen notu gorunur.
 */
export function OdevTeslimEkrani({ ogrenciOdevId }: { ogrenciOdevId: string }) {
  const router = useRouter();
  const qc = useQueryClient();
  const { adaptorler } = useServisler();
  const { tz } = useSaatDilimi();
  const liste = useOdevlerim();
  const konular = useKonuHaritasi();
  const odev = liste.data?.find((o) => o.id === ogrenciOdevId);

  const [yapilan, setYapilan] = useState<string | null>(null);
  const [dogru, setDogru] = useState('');
  const [yanlis, setYanlis] = useState('');
  const [bos, setBos] = useState('');
  const [not, setNot] = useState('');
  const [hata, setHata] = useState<string | null>(null);
  const [tamam, setTamam] = useState(false);

  const teslim = useMutation({
    networkMode: 'always',
    mutationFn: (g: Parameters<typeof adaptorler.ogrenme.odevTeslim>[1]) =>
      adaptorler.ogrenme.odevTeslim(ogrenciOdevId, g),
    onSuccess: () => {
      setHata(null);
      setTamam(true);
      void qc.invalidateQueries({ queryKey: ['odev'] });
    },
    onError: (e) => {
      setHata(hataMesaji(e));
    },
  });

  function gonder() {
    if (!odev) return;
    const sonuc = teslimKur(
      yapilan ?? String(odev.hedefSoruSayisi ?? ''),
      dogru,
      yanlis,
      bos,
      not,
    );
    if (!sonuc.ok) {
      setHata(HATA_ANAHTARI[sonuc.hata]);
      return;
    }
    setHata(null);
    teslim.mutate(sonuc.girdi);
  }

  if (liste.isPending) {
    return (
      <Ekran kenarlar={['left', 'right', 'bottom']}>
        <Yukleniyor />
      </Ekran>
    );
  }
  if (!odev) {
    return (
      <Ekran kenarlar={['left', 'right', 'bottom']}>
        {liste.isError ? (
          <HataDurumu mesaj={hataMesaji(liste.error)} tekrar={() => void liste.refetch()} />
        ) : (
          <BosDurum ikon="checkmark-circle-outline" mesaj={t('mobil.ogrenme.odev.bulunamadi')} />
        )}
      </Ekran>
    );
  }

  const konu = odev.konuId ? konular.get(odev.konuId) : undefined;
  const geciken = odevGecikmisMi(odev, Date.now());

  if (tamam) {
    return (
      <Ekran kenarlar={['left', 'right']}>
        <Kart className="items-center gap-3" accessibilityLiveRegion="polite" testID="teslim-tamam">
          <Ikon ad="checkmark-circle" boyut={40} />
          <Metin varyant="baslik">{t('mobil.ogrenme.odev.teslimEdildi')}</Metin>
          <Metin varyant="ikincil" className="text-center">
            {t('mobil.ogrenme.odev.teslimEdildiMesaj')}
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
      <View className="gap-1">
        <Metin varyant="baslik" accessibilityRole="header">
          {odev.baslik}
        </Metin>
        <Metin varyant="ikincil">
          {konu ? `${konuEtiketi(konu)} · ` : ''}
          {bransAdi(odev.bransKodu)}
          {odev.hedefSoruSayisi ? ` · ${t('mobil.ogrenme.plan.hedefSoru', { n: odev.hedefSoruSayisi })}` : ''}
        </Metin>
        {odev.kaynak ? <Metin varyant="kucuk">{odev.kaynak}</Metin> : null}
        {odev.aciklama ? <Metin>{odev.aciklama}</Metin> : null}
        {odev.sonTeslim ? (
          <Metin varyant="ikincil" className={geciken ? 'text-hata' : ''}>
            {geciken ? t('mobil.ogrenme.odev.gecikti') : t('mobil.ogrenme.odev.sonTeslim')}:{' '}
            {kisaZaman(odev.sonTeslim, tz)}
          </Metin>
        ) : null}
      </View>

      {teslimBekliyorMu(odev) ? (
        <>
          {odev.durum === 'tekrar_istendi' && odev.incelemeNotu ? (
            <Kart className="gap-1">
              <Metin varyant="etiket">{t('mobil.ogrenme.odev.tekrarIstendi')}</Metin>
              <Metin>{odev.incelemeNotu}</Metin>
            </Kart>
          ) : null}
          <MetinGirdisi
            etiket={t('mobil.ogrenme.odev.yapilanGirdi')}
            value={yapilan ?? String(odev.hedefSoruSayisi ?? '')}
            onChangeText={setYapilan}
            keyboardType="number-pad"
            maxLength={5}
            selectTextOnFocus
          />
          <View className="flex-row gap-3">
            <View className="flex-1">
              <MetinGirdisi
                etiket={t('mobil.ogrenme.odev.dogru')}
                value={dogru}
                onChangeText={setDogru}
                keyboardType="number-pad"
                maxLength={5}
              />
            </View>
            <View className="flex-1">
              <MetinGirdisi
                etiket={t('mobil.ogrenme.odev.yanlis')}
                value={yanlis}
                onChangeText={setYanlis}
                keyboardType="number-pad"
                maxLength={5}
              />
            </View>
            <View className="flex-1">
              <MetinGirdisi
                etiket={t('mobil.ogrenme.odev.bos')}
                value={bos}
                onChangeText={setBos}
                keyboardType="number-pad"
                maxLength={5}
              />
            </View>
          </View>
          <MetinGirdisi
            etiket={t('mobil.ogrenme.odev.notGirdi')}
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
            buyuk
            etiket={t('mobil.ogrenme.odev.teslimEt')}
            yukleniyor={teslim.isPending}
            onPress={gonder}
          />
        </>
      ) : (
        <SonucOzeti odev={odev} tz={tz} />
      )}
    </Ekran>
  );
}
