import { t } from '@kopru/i18n';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { NOT_EN_FAZLA, type OneriTuru } from '../../api/degerlendirmeTipleri';
import {
  oneriFormuDogrula,
  oneriGirdisi,
  type OneriFormDegeri,
} from '../../degerlendirme/kurallar';
import { Dugme } from '../../ui/Dugme';
import { BosDurum, HataDurumu, Yukleniyor } from '../../ui/Durumlar';
import { Ekran } from '../../ui/Ekran';
import { Ikon } from '../../ui/Ikon';
import { Metin } from '../../ui/Metin';
import { MetinGirdisi } from '../../ui/MetinGirdisi';
import { Secici } from '../../ui/Secici';
import { useKaynakOner } from '../../uygulama/degerlendirme';
import { useKaynakKitap, useKaynakKitaplar } from '../../uygulama/gunluk';
import { degerlendirmeHataMesaji, hataMesaji } from '../../uygulama/hatalar';
import { CevrimdisiSerit } from '../CevrimdisiSerit';
import { KONU_SECIMI_BOS, KonuSecici, type KonuSecimi } from '../KonuSecici';

const TURLER: readonly OneriTuru[] = ['kaynak_kitap', 'kaynak_kitap_testi', 'link', 'serbest'];

interface Props {
  ogrenciId: string;
  ad: string;
}

/**
 * Kaynak oner: kurumun kaynak kitabi, kitaptan test, baglanti ya da serbest metin; isteye bagli konu
 * ve not. Ogrenci oneriyi "Ogretmenim" ekraninda gorur ve uygulama ici bildirim alir.
 */
export function KaynakOneriFormu({ ogrenciId, ad }: Props) {
  const router = useRouter();
  const oner = useKaynakOner(ogrenciId);
  const [tur, setTur] = useState<OneriTuru>('kaynak_kitap');
  const [kitapId, setKitapId] = useState<string | null>(null);
  const [testId, setTestId] = useState<string | null>(null);
  const [baglanti, setBaglanti] = useState('');
  const [baslik, setBaslik] = useState('');
  const [konu, setKonu] = useState<KonuSecimi>(KONU_SECIMI_BOS);
  const [notMetni, setNotMetni] = useState('');
  const [denendi, setDenendi] = useState(false);
  const [mesaj, setMesaj] = useState<string | null>(null);

  const kitapTuru = tur === 'kaynak_kitap' || tur === 'kaynak_kitap_testi';
  const kitaplar = useKaynakKitaplar(undefined, undefined, kitapTuru);
  const detay = useKaynakKitap(tur === 'kaynak_kitap_testi' ? kitapId : null);

  const deger: OneriFormDegeri = {
    tur,
    kitapId,
    testId,
    baglanti,
    baslik,
    bransKodu: konu.bransKodu,
    konuId: konu.konuId,
    notMetni,
  };
  const hatalar = oneriFormuDogrula(deger);

  async function gonder() {
    setDenendi(true);
    setMesaj(null);
    if (Object.keys(hatalar).length > 0) return;
    const girdi = oneriGirdisi(deger);
    if (!girdi) return;
    try {
      await oner.mutateAsync(girdi);
      router.back();
    } catch (e) {
      setMesaj(degerlendirmeHataMesaji(e));
    }
  }

  return (
    <Ekran klavye kenarlar={['left', 'right', 'bottom']} ust={<CevrimdisiSerit />}>
      <View className="gap-1">
        <Metin varyant="baslik" accessibilityRole="header">
          {t('kaynakOnerisi.baslik')}
        </Metin>
        <Metin varyant="ikincil" testID="oneri-ogrenci-adi">
          {ad || t('mobil.ogrenciler.adsiz')}
        </Metin>
      </View>

      <Secici
        baslik={t('mobil.kocluk.oneriTuru')}
        secenekler={TURLER.map((x) => ({ deger: x, etiket: t(`kaynakOnerisi.tur.${x}`) }))}
        deger={tur}
        onDegis={(x) => {
          setTur(x);
          setTestId(null);
        }}
        dikey
      />

      {kitapTuru ? (
        <View className="gap-2" testID="oneri-kitap-secimi">
          <Metin varyant="etiket">{t('mobil.kocluk.kitapSec')}</Metin>
          {kitaplar.isPending ? <Yukleniyor /> : null}
          {kitaplar.isError && !kitaplar.data ? (
            <HataDurumu mesaj={hataMesaji(kitaplar.error)} tekrar={() => void kitaplar.refetch()} />
          ) : null}
          {kitaplar.data?.length === 0 ? (
            <BosDurum ikon="book-outline" mesaj={t('mobil.kocluk.kitapYok')} />
          ) : null}
          {kitaplar.data?.map((k) => {
            const secili = kitapId === k.id;
            return (
              <Pressable
                key={k.id}
                accessibilityRole="radio"
                accessibilityLabel={`${k.ad}${k.yayinevi ? `, ${k.yayinevi}` : ''}`}
                accessibilityState={{ selected: secili, checked: secili }}
                testID={`oneri-kitap-${k.id}`}
                onPress={() => {
                  setKitapId(k.id);
                  setTestId(null);
                }}
                className={`min-h-dokunma flex-row items-center gap-2 rounded-orta border px-4 py-2 active:opacity-80 ${
                  secili ? 'border-birincil bg-yuzeyIkincil' : 'border-kenar bg-yuzey'
                }`}
              >
                <Ikon ad={secili ? 'checkmark' : 'book-outline'} boyut={20} />
                <View className="flex-1">
                  <Metin varyant="etiket">{k.ad}</Metin>
                  {k.yayinevi ? <Metin varyant="kucuk">{k.yayinevi}</Metin> : null}
                </View>
              </Pressable>
            );
          })}
          {denendi && hatalar.kitap ? (
            <Metin varyant="ikincil" className="text-hata" accessibilityRole="alert">
              {t('mobil.kocluk.kitapGerekli')}
            </Metin>
          ) : null}
        </View>
      ) : null}

      {tur === 'kaynak_kitap_testi' && kitapId ? (
        <View className="gap-2" testID="oneri-test-secimi">
          <Metin varyant="etiket">{t('mobil.kocluk.testSec')}</Metin>
          {detay.isPending ? <Yukleniyor /> : null}
          {detay.data?.testler.map((x) => {
            const secili = testId === x.id;
            return (
              <Pressable
                key={x.id}
                accessibilityRole="radio"
                accessibilityLabel={t('mobil.gunluk.form.testEtiketi', {
                  test: x.ad,
                  soru: x.soruSayisi,
                })}
                accessibilityState={{ selected: secili, checked: secili }}
                testID={`oneri-test-${x.id}`}
                onPress={() => {
                  setTestId(x.id);
                }}
                className={`min-h-dokunma flex-row items-center gap-2 rounded-orta border px-4 py-2 active:opacity-80 ${
                  secili ? 'border-birincil bg-yuzeyIkincil' : 'border-kenar bg-yuzey'
                }`}
              >
                {secili ? <Ikon ad="checkmark" boyut={18} /> : null}
                <Metin varyant="etiket" className="flex-1">
                  {x.ad}
                </Metin>
                <Metin varyant="kucuk">
                  {t('mobil.gunluk.form.testSoru', { soru: x.soruSayisi })}
                </Metin>
              </Pressable>
            );
          })}
          {denendi && hatalar.test ? (
            <Metin varyant="ikincil" className="text-hata" accessibilityRole="alert">
              {t('mobil.kocluk.testGerekli')}
            </Metin>
          ) : null}
        </View>
      ) : null}
      {denendi && hatalar.test && tur === 'kaynak_kitap_testi' && !kitapId ? (
        <Metin varyant="ikincil" className="text-hata" accessibilityRole="alert">
          {t('mobil.kocluk.kitapGerekli')}
        </Metin>
      ) : null}

      {tur === 'link' ? (
        <MetinGirdisi
          etiket={t('mobil.kocluk.baglanti')}
          placeholder="https://…"
          value={baglanti}
          onChangeText={setBaglanti}
          keyboardType="url"
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={2000}
          hata={denendi && hatalar.baglanti ? t('mobil.kocluk.baglantiGecersiz') : null}
          testID="oneri-baglanti-girdisi"
        />
      ) : null}
      {tur === 'link' || tur === 'serbest' ? (
        <MetinGirdisi
          etiket={t('mobil.kocluk.oneriBaslik')}
          placeholder={t('mobil.kocluk.baslikIpucu')}
          value={baslik}
          onChangeText={setBaslik}
          maxLength={200}
          hata={denendi && hatalar.baslik ? t('mobil.kocluk.baslikGerekli') : null}
          testID="oneri-baslik-girdisi"
        />
      ) : null}

      <View className="gap-1">
        <KonuSecici
          key={tur}
          deger={konu}
          onDegis={setKonu}
          etiket={t('mobil.kocluk.konuIsteBagli')}
          yalnizDers={tur === 'link' || tur === 'serbest'}
        />
        {denendi && hatalar.ders ? (
          <Metin varyant="ikincil" className="text-hata" accessibilityRole="alert">
            {t('mobil.kocluk.dersGerekli')}
          </Metin>
        ) : null}
      </View>

      <MetinGirdisi
        etiket={t('mobil.kocluk.notIsteBagli')}
        placeholder={t('mobil.kocluk.notIpucu')}
        value={notMetni}
        onChangeText={setNotMetni}
        multiline
        maxLength={NOT_EN_FAZLA}
        testID="oneri-not-girdisi"
      />

      {mesaj ? (
        <Metin
          varyant="ikincil"
          className="text-hata"
          accessibilityRole="alert"
          testID="oneri-hata"
        >
          {mesaj}
        </Metin>
      ) : null}
      <Dugme
        buyuk
        etiket={t('mobil.kocluk.oner')}
        yukleniyor={oner.isPending}
        onPress={() => void gonder()}
        testID="oneri-gonder"
      />
    </Ekran>
  );
}
