import { t } from '@kopru/i18n';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { bugunTarihi, kisaZaman } from '../lib/saat';
import { PLAN_GERCEKLESEN_TURU, type PlanGerceklesenYuku } from '../offline/plan';
import { gorevSayilari } from '../ogrenme/hafta';
import { bransAdi } from '../ogrenme/konu';
import { odevGecikmisMi, odevleriBol } from '../ogrenme/odev';
import { BosDurum, HataDurumu, Yukleniyor } from '../ui/Durumlar';
import { Ikon } from '../ui/Ikon';
import { Kart } from '../ui/Kart';
import { Metin } from '../ui/Metin';
import { hataMesaji } from '../uygulama/hatalar';
import { useGorevlerim, useKonuHaritasi, useOdevlerim } from '../uygulama/ogrenme';
import { useKuyruk, useModulAcik, useSaatDilimi } from '../uygulama/operasyon';
import { GorevKarti, gorevAdi } from './OgrenciPlani';

/** "Bugun" ekraninin gercek plan gorevleri: Gorevler sekmesindeki ayni giris karti (dokun, gir, kaydet). */
export function BugunkuGorevler() {
  const { tz } = useSaatDilimi();
  const bugun = bugunTarihi(tz);
  const sorgu = useGorevlerim(bugun);
  const konular = useKonuHaritasi();
  const { bekleyen } = useKuyruk();
  const bekleyenIdler = new Set(
    bekleyen
      .filter((i) => i.tur === PLAN_GERCEKLESEN_TURU)
      .map((i) => (i.yuk as PlanGerceklesenYuku).gorevId),
  );
  const gorevler = sorgu.data?.gorevler ?? [];
  const say = gorevSayilari(gorevler);
  return (
    <View className="gap-3" testID="bugunku-gorevler">
      <View className="flex-row items-center justify-between gap-2">
        <Metin varyant="altBaslik" accessibilityRole="header">
          {t('mobil.bugun.ogrenci.bugunkuGorevler')}
        </Metin>
        {say.toplam > 0 ? (
          <Metin varyant="etiket" accessibilityLiveRegion="polite" testID="bugun-gorev-ozeti">
            {t('mobil.ogrenme.plan.gunOzeti', { tamam: say.tamam, toplam: say.toplam })}
          </Metin>
        ) : null}
      </View>
      {sorgu.isPending ? <Yukleniyor /> : null}
      {sorgu.isError && !sorgu.data ? (
        <HataDurumu mesaj={hataMesaji(sorgu.error)} tekrar={() => void sorgu.refetch()} />
      ) : null}
      {sorgu.data && gorevler.length === 0 ? (
        <Kart>
          <BosDurum
            ikon="checkmark-circle-outline"
            mesaj={t('mobil.bugun.ogrenci.bugunkuGorevlerBos')}
          />
        </Kart>
      ) : null}
      {gorevler.map((g) => (
        <GorevKarti
          key={g.id}
          gorev={g}
          ad={gorevAdi(g, konular)}
          kilitli={false}
          bekliyor={bekleyenIdler.has(g.id)}
        />
      ))}
    </View>
  );
}

/** Yaklasan ve geciken odevler (en yakin 3); karta dokununca teslim ekrani. */
export function YaklasanOdevler() {
  const router = useRouter();
  const { tz } = useSaatDilimi();
  const sorgu = useOdevlerim();
  const [simdi] = useState(() => Date.now());
  const b = sorgu.data ? odevleriBol(sorgu.data, simdi) : null;
  const liste = b ? [...b.geciken, ...b.yaklasan].slice(0, 3) : [];
  return (
    <Kart className="gap-2" testID="bugun-yaklasan-odevler">
      <Metin varyant="altBaslik" accessibilityRole="header">
        {t('mobil.ogrenme.odev.yaklasanBaslik')}
      </Metin>
      {sorgu.isPending ? <Yukleniyor /> : null}
      {sorgu.isError && !sorgu.data ? (
        <HataDurumu mesaj={hataMesaji(sorgu.error)} tekrar={() => void sorgu.refetch()} />
      ) : null}
      {sorgu.data && liste.length === 0 ? (
        <BosDurum ikon="checkmark-circle-outline" mesaj={t('mobil.ogrenme.odev.bosListe')} />
      ) : null}
      {liste.map((o) => {
        const geciken = odevGecikmisMi(o, simdi);
        const son = o.sonTeslim
          ? `${geciken ? t('mobil.ogrenme.odev.gecikti') : t('mobil.ogrenme.odev.sonTeslim')}: ${kisaZaman(o.sonTeslim, tz)}`
          : t('mobil.ogrenme.odev.sonTeslimYok');
        return (
          <Pressable
            key={o.id}
            accessibilityRole="button"
            accessibilityLabel={`${o.baslik}, ${bransAdi(o.bransKodu)}, ${son}`}
            testID={`bugun-odev-${o.id}`}
            onPress={() => {
              router.push({ pathname: '/odev-teslim/[id]', params: { id: o.id } });
            }}
            className="min-h-dokunma flex-row items-center gap-2 border-t border-kenar py-2 active:opacity-80"
          >
            <Ikon ad={geciken ? 'alert-circle' : 'document-text-outline'} boyut={20} />
            <View className="flex-1">
              <Metin varyant="etiket">{o.baslik}</Metin>
              <Metin varyant="kucuk" className={geciken ? 'text-hata' : ''}>
                {son}
              </Metin>
            </View>
          </Pressable>
        );
      })}
    </Kart>
  );
}

/** "Bugun" ekraninin ogrenme bolumleri; modulu kapali olan hic cizilmez. */
export function OgrenciBugunOgrenme() {
  const plan = useModulAcik('haftalik_plan');
  const odev = useModulAcik('odev');
  return (
    <>
      {plan ? <BugunkuGorevler /> : null}
      {odev ? <YaklasanOdevler /> : null}
    </>
  );
}
