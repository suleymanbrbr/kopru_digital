import { t } from '@kopru/i18n';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import type { OgrenciOdevi } from '../api/ogrenmeTipleri';
import { kisaZaman } from '../lib/saat';
import { bransAdi } from '../ogrenme/konu';
import { odevGecikmisMi, odevleriBol } from '../ogrenme/odev';
import { Dugme } from '../ui/Dugme';
import { BosDurum, HataDurumu, Yukleniyor } from '../ui/Durumlar';
import { Ekran } from '../ui/Ekran';
import { Ikon } from '../ui/Ikon';
import { Kart } from '../ui/Kart';
import { Metin } from '../ui/Metin';
import { hataMesaji } from '../uygulama/hatalar';
import { useOdevlerim } from '../uygulama/ogrenme';
import { useModulAcik, useSaatDilimi } from '../uygulama/operasyon';
import { CevrimdisiSerit } from './CevrimdisiSerit';
import { OgrenciPlani } from './OgrenciPlani';

export function sonucMetni(o: Pick<OgrenciOdevi, 'durum' | 'incelemeSonucu'>): string {
  if (o.durum === 'tekrar_istendi') return t('mobil.ogrenme.odev.durum.tekrar_istendi');
  if (o.incelemeSonucu) return t(`mobil.ogrenme.odev.sonuc.${o.incelemeSonucu}`);
  return t(`mobil.ogrenme.odev.durum.${o.durum}`);
}

function OdevKarti({
  odev,
  tz,
  simdi,
  onAc,
}: {
  odev: OgrenciOdevi;
  tz: string;
  simdi: number;
  onAc: (o: OgrenciOdevi) => void;
}) {
  const geciken = odevGecikmisMi(odev, simdi);
  const teslimBekliyor = odev.durum === 'atandi' || odev.durum === 'tekrar_istendi';
  const etiket = teslimBekliyor
    ? odev.sonTeslim
      ? `${geciken ? t('mobil.ogrenme.odev.gecikti') : t('mobil.ogrenme.odev.sonTeslim')}: ${kisaZaman(odev.sonTeslim, tz)}`
      : t('mobil.ogrenme.odev.sonTeslimYok')
    : sonucMetni(odev);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${odev.baslik}, ${bransAdi(odev.bransKodu)}, ${etiket}`}
      testID={`odev-${odev.id}`}
      onPress={() => {
        onAc(odev);
      }}
      className={`min-h-dokunma gap-1 rounded-buyuk border bg-yuzey p-4 active:opacity-80 ${
        geciken ? 'border-hata' : 'border-kenar'
      }`}
    >
      <View className="flex-row items-center gap-2">
        <Ikon
          ad={
            geciken
              ? 'alert-circle'
              : teslimBekliyor
                ? 'document-text-outline'
                : odev.durum === 'incelendi'
                  ? 'checkmark-circle'
                  : 'time-outline'
          }
          boyut={20}
        />
        <Metin varyant="altBaslik" className="flex-1">
          {odev.baslik}
        </Metin>
      </View>
      <Metin varyant="ikincil" className={geciken ? 'text-hata' : ''}>
        {bransAdi(odev.bransKodu)} · {etiket}
      </Metin>
      {odev.durum === 'incelendi' && odev.incelemeNotu ? (
        <Metin varyant="kucuk" testID={`odev-not-${odev.id}`}>
          {t('mobil.ogrenme.odev.ogretmenNotu', { not: odev.incelemeNotu })}
        </Metin>
      ) : null}
    </Pressable>
  );
}

function OdevBolumu() {
  const router = useRouter();
  const { tz } = useSaatDilimi();
  const sorgu = useOdevlerim();
  const [simdi] = useState(() => Date.now());
  const bolumler = sorgu.data ? odevleriBol(sorgu.data, simdi) : null;
  const ac = (o: OgrenciOdevi) => {
    router.push({ pathname: '/odev-teslim/[id]', params: { id: o.id } });
  };
  const bos =
    bolumler &&
    bolumler.geciken.length + bolumler.yaklasan.length + bolumler.teslimEdilen.length === 0;
  return (
    <View className="gap-3" testID="odev-bolumu">
      <Metin varyant="altBaslik" accessibilityRole="header">
        {t('mobil.ogrenme.odev.baslik')}
      </Metin>
      {sorgu.isPending ? <Yukleniyor /> : null}
      {sorgu.isError && !sorgu.data ? (
        <HataDurumu mesaj={hataMesaji(sorgu.error)} tekrar={() => void sorgu.refetch()} />
      ) : null}
      {bos ? (
        <BosDurum ikon="checkmark-circle-outline" mesaj={t('mobil.ogrenme.odev.bosListe')} />
      ) : null}
      {bolumler?.geciken.length ? (
        <View className="gap-2" testID="geciken-odevler">
          <Metin varyant="etiket" accessibilityRole="header">
            {t('mobil.ogrenme.odev.gecikenBaslik')}
          </Metin>
          {bolumler.geciken.map((o) => (
            <OdevKarti key={o.id} odev={o} tz={tz} simdi={simdi} onAc={ac} />
          ))}
        </View>
      ) : null}
      {bolumler?.yaklasan.length ? (
        <View className="gap-2" testID="yaklasan-odevler">
          <Metin varyant="etiket" accessibilityRole="header">
            {t('mobil.ogrenme.odev.yaklasanBaslik')}
          </Metin>
          {bolumler.yaklasan.map((o) => (
            <OdevKarti key={o.id} odev={o} tz={tz} simdi={simdi} onAc={ac} />
          ))}
        </View>
      ) : null}
      {bolumler?.teslimEdilen.length ? (
        <View className="gap-2" testID="teslim-edilen-odevler">
          <Metin varyant="etiket" accessibilityRole="header">
            {t('mobil.ogrenme.odev.teslimEdilenBaslik')}
          </Metin>
          {bolumler.teslimEdilen.map((o) => (
            <OdevKarti key={o.id} odev={o} tz={tz} simdi={simdi} onAc={ac} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

/**
 * Ogrenci "Gorevler" sekmesi: bugunun plan gorevleri (gun seridi ile hafta), yaklasan ve geciken
 * odevler, denemelerim baglantisi. Her bolum kendi modulu kapaliysa hic cizilmez.
 */
export function OgrenciGorevler() {
  const router = useRouter();
  const plan = useModulAcik('haftalik_plan');
  const odev = useModulAcik('odev');
  const deneme = useModulAcik('deneme');
  return (
    <Ekran ust={<CevrimdisiSerit />} kenarlar={['top', 'left', 'right']}>
      <Metin varyant="baslik" accessibilityRole="header">
        {t('mobil.gorevler.baslik')}
      </Metin>
      {plan ? <OgrenciPlani /> : null}
      {odev ? <OdevBolumu /> : null}
      {deneme ? (
        <Kart className="gap-2">
          <Metin varyant="altBaslik" accessibilityRole="header">
            {t('mobil.ogrenme.deneme.baslik')}
          </Metin>
          <Dugme
            varyant="ikincil"
            etiket={t('mobil.ogrenme.deneme.denemelerimAc')}
            onPress={() => {
              router.push('/denemelerim');
            }}
          />
        </Kart>
      ) : null}
    </Ekran>
  );
}
