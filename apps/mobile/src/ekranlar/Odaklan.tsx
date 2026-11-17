import { t } from '@kopru/i18n';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, AppState, View } from 'react-native';

import type { OdakModu } from '../api/motivasyonTipleri';
import type { PlanGorevi } from '../api/ogrenmeTipleri';
import { Companion } from '../karakter/Companion';
import { bugunTarihi } from '../lib/saat';
import {
  ODAK_MODLARI,
  ODAK_SERBEST_ADIM_DK,
  ODAK_SERBEST_ENAZ_DK,
  ODAK_SERBEST_ENCOK_DK,
  type OdakPlanGorevi,
} from '../motivasyon/odak';
import { Cip } from '../ui/Cip';
import { Dugme } from '../ui/Dugme';
import { Ekran } from '../ui/Ekran';
import { Kart } from '../ui/Kart';
import { Metin } from '../ui/Metin';
import { useAktif, useServisler } from '../uygulama/baglam';
import { hataMesaji } from '../uygulama/hatalar';
import { karakterGorunumu, useBenim, useOdakDurumu } from '../uygulama/motivasyon';
import { useGorevlerim, useKonuHaritasi } from '../uygulama/ogrenme';
import { useSaatDilimi } from '../uygulama/operasyon';
import { gorevAdi } from './OgrenciPlani';

export function sureBicimle(sn: number): string {
  const d = Math.floor(sn / 60);
  const s = sn % 60;
  return `${String(d).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** Saniyede bir yenilenen "simdi"; uygulama one gelince hemen tazelenir (ekran kapaliyken sayac durmaz). */
function useSimdi(etkin: boolean): number {
  const [simdi, setSimdi] = useState(() => Date.now());
  useEffect(() => {
    if (!etkin) return;
    const z = setInterval(() => {
      setSimdi(Date.now());
    }, 1000);
    const durum = AppState.addEventListener('change', (d) => {
      if (d === 'active') setSimdi(Date.now());
    });
    return () => {
      clearInterval(z);
      durum.remove();
    };
  }, [etkin]);
  return simdi;
}

const MOD_ETIKETI: Record<OdakModu, string> = {
  '25_5': t('mobil.motivasyon.odak.mod25'),
  '50_10': t('mobil.motivasyon.odak.mod50'),
  serbest: t('mobil.motivasyon.odak.modSerbest'),
};

/** Dakika tipli, bitmemis gorevler: yalniz bunlara odak suresi "gerceklesen" olarak yazilabilir. */
export function odakGorevleri(gorevler: readonly PlanGorevi[]): PlanGorevi[] {
  return gorevler.filter(
    (g) => g.hedefTuru === 'dakika' && g.durum !== 'tamam' && g.durum !== 'devredildi',
  );
}

/**
 * Odak sayaci: 25/5, 50/10 ya da serbest (5-180 dk), isteğe bagli plan gorevi. Sure oturumun
 * baslangic zamanindan hesaplanir (ekran kapaliyken dogru); oturum sunucuya baglidir ve cevrimdisi
 * kuyrukla eslesir. Karakter oturum boyunca "odak" ruh halinde yaninda oturur.
 */
export function Odaklan() {
  const router = useRouter();
  const { odak, agGozlemcisi } = useServisler();
  const aktif = useAktif();
  const durum = useOdakDurumu();
  const benim = useBenim();
  const { tz } = useSaatDilimi();
  const gorevSorgusu = useGorevlerim(bugunTarihi(tz));
  const konular = useKonuHaritasi();
  const calisiyor = durum.faz === 'calisiyor';
  const simdi = useSimdi(calisiyor);

  const [mod, setMod] = useState<OdakModu>('25_5');
  const [serbestDk, setSerbestDk] = useState(30);
  const [gorevId, setGorevId] = useState<string | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [baslatiyor, setBaslatiyor] = useState(false);
  const otomatikBitti = useRef<string | null>(null);

  useEffect(() => {
    void odak.yukle();
  }, [odak, aktif?.uyelik.uyelikId]);

  const o = durum.oturum;
  const kalan = o && calisiyor ? odak.kalanSn(o, simdi) : 0;
  const gecen = o && calisiyor ? odak.gecenSn(o, simdi) : 0;

  // Sure doldu: oturum planlanan bitisle otomatik tamamlanir (gec donen kullanici fazladan sayilmaz).
  useEffect(() => {
    if (!calisiyor || !o || kalan > 0 || otomatikBitti.current === o.istemciId) return;
    otomatikBitti.current = o.istemciId;
    const planlananBitis = Date.parse(o.baslangicAt) + o.planlananDk * 60_000;
    odak.bitir('tamam', new Date(Math.min(Date.now(), planlananBitis)).toISOString());
  }, [calisiyor, o, kalan, odak]);

  const gorevler = odakGorevleri(gorevSorgusu.data?.gorevler ?? []);
  const secilenGorev = gorevler.find((g) => g.id === gorevId);
  const planlananDk = mod === 'serbest' ? serbestDk : mod === '25_5' ? 25 : 50;

  async function baslat() {
    setHata(null);
    setBaslatiyor(true);
    try {
      const planGorevi: OdakPlanGorevi | undefined = secilenGorev
        ? {
            id: secilenGorev.id,
            baslik: gorevAdi(secilenGorev, konular),
            gun: secilenGorev.gun,
            mevcutDk: secilenGorev.gerceklesen ?? 0,
            bransKodu: secilenGorev.bransKodu,
          }
        : undefined;
      await odak.baslat({ mod, planlananDk, ...(planGorevi ? { planGorevi } : {}) });
    } catch (e) {
      setHata(hataMesaji(e));
    } finally {
      setBaslatiyor(false);
    }
  }

  function bitirOnay() {
    const kisa = gecen < 60;
    Alert.alert(
      t('mobil.motivasyon.odak.bitirOnay'),
      kisa ? t('mobil.motivasyon.odak.bitirKisa') : t('mobil.motivasyon.odak.bitirMesaj'),
      [
        { text: t('mobil.motivasyon.odak.devam'), style: 'cancel' },
        {
          text: t('mobil.motivasyon.odak.bitir'),
          style: 'destructive',
          onPress: () => {
            odak.bitir('yarida');
          },
        },
      ],
    );
  }

  const k = benim.data ? karakterGorunumu(benim.data, calisiyor, durum.faz === 'bitti') : null;
  const karakter = k ? (
    <Companion
      tur={k.tur}
      asama={k.asama}
      seviye={k.seviye}
      beceriler={k.beceriler}
      ruhHali={k.ruhHali}
      ad={k.ad}
      boyut={calisiyor ? 200 : 160}
    />
  ) : null;

  if (durum.faz === 'calisiyor' && o) {
    const oran = Math.min(gecen / (o.planlananDk * 60), 1);
    return (
      <Ekran className="items-center justify-center">
        {karakter}
        <View
          accessible
          accessibilityRole="timer"
          accessibilityLabel={t('mobil.odaklan.sureEtiketi', { sure: sureBicimle(kalan) })}
          testID="odak-sure"
        >
          <Metin varyant="baslik" className="text-center text-3xl">
            {sureBicimle(kalan)}
          </Metin>
        </View>
        <View
          className="h-3 self-stretch overflow-hidden rounded-tam bg-yuzeyIkincil"
          accessible
          accessibilityRole="progressbar"
          accessibilityValue={{ min: 0, max: 100, now: Math.round(oran * 100) }}
          accessibilityLabel={t('mobil.motivasyon.odak.ilerleme', {
            dk: Math.floor(gecen / 60),
            planlanan: o.planlananDk,
          })}
        >
          <View
            className="h-3 rounded-tam bg-vurgu"
            style={{ width: `${Math.round(oran * 100)}%` }}
          />
        </View>
        <Metin varyant="ikincil" className="text-center">
          {t('mobil.motivasyon.odak.odaktasin', { dk: o.planlananDk })}
        </Metin>
        {o.planGorevi ? (
          <Kart className="self-stretch" testID="odak-gorev">
            <Metin varyant="etiket">{t('mobil.motivasyon.odak.gorevBaslik')}</Metin>
            <Metin>{o.planGorevi.baslik}</Metin>
          </Kart>
        ) : null}
        {o.devralindi ? (
          <Metin varyant="kucuk" className="text-center">
            {t('mobil.motivasyon.odak.devralindi')}
          </Metin>
        ) : null}
        {!o.sunucuda && (gecen > 4 || !agGozlemcisi.cevrimiciMi()) ? (
          <Metin varyant="kucuk" className="text-center" accessibilityLiveRegion="polite">
            {t('mobil.motivasyon.odak.cevrimdisiBaslandi')}
          </Metin>
        ) : null}
        <Dugme
          buyuk
          className="self-stretch"
          varyant="ikincil"
          etiket={t('mobil.motivasyon.odak.bitir')}
          onPress={bitirOnay}
          testID="odak-bitir"
        />
      </Ekran>
    );
  }

  if (durum.faz === 'bitiyor' || durum.faz === 'bitti') {
    const s = durum.sonuc;
    const dk = Math.floor((s?.gerceklesenSn ?? 0) / 60);
    const bekleniyor = durum.faz === 'bitiyor';
    const kz = s?.kazanim;
    return (
      <Ekran className="items-center justify-center">
        {karakter}
        <Metin varyant="baslik" className="text-center" accessibilityRole="header">
          {s?.durum === 'tamam' ? t('mobil.odaklan.bitti') : t('mobil.motivasyon.odak.biraktin')}
        </Metin>
        <Kart className="self-stretch gap-2" testID="odak-sonuc">
          <Metin>{t('mobil.motivasyon.odak.sonucSure', { dk })}</Metin>
          {kz && kz.xp > 0 ? (
            <Metin varyant="altBaslik" testID="odak-xp">
              {t('mobil.motivasyon.xpEtiketi', { xp: kz.xp })}
            </Metin>
          ) : null}
          {kz?.xp === 0 && dk < 1 ? (
            <Metin varyant="ikincil">{t('mobil.motivasyon.odak.kisaSure')}</Metin>
          ) : null}
          {kz && kz.dogrulanmamisSayilmayanSn > 0 ? (
            <Metin varyant="ikincil" testID="odak-dogrulanmamis">
              {t('mobil.motivasyon.odak.dogrulanmamis', {
                dk: Math.max(Math.round(kz.dogrulanmamisSayilmayanSn / 60), 1),
              })}
            </Metin>
          ) : null}
          {s?.planYazildi ? (
            <Metin varyant="ikincil">{t('mobil.motivasyon.odak.gorevYazildi')}</Metin>
          ) : null}
          {bekleniyor ? (
            <Metin varyant="ikincil" accessibilityLiveRegion="polite" testID="odak-bekliyor">
              {t('mobil.motivasyon.odak.kaydediliyor')}
            </Metin>
          ) : null}
          {s?.hata ? (
            <Metin varyant="ikincil" className="text-hata" accessibilityLiveRegion="polite">
              {t('mobil.motivasyon.odak.kaydedilemedi')}
            </Metin>
          ) : null}
          {s?.durum === 'tamam' && o && (o.mod === '25_5' || o.mod === '50_10') ? (
            <Metin varyant="ikincil">
              {t('mobil.motivasyon.odak.mola', { dk: o.mod === '25_5' ? 5 : 10 })}
            </Metin>
          ) : null}
        </Kart>
        <Dugme
          buyuk
          className="self-stretch"
          etiket={t('mobil.motivasyon.odak.yeniTur')}
          onPress={() => {
            odak.yeniTur();
          }}
          testID="odak-yeni-tur"
        />
        <Dugme
          varyant="hayalet"
          etiket={t('mobil.motivasyon.odak.kapat')}
          onPress={() => {
            odak.yeniTur();
            router.back();
          }}
        />
      </Ekran>
    );
  }

  return (
    <Ekran className="items-center">
      {karakter}
      <Metin varyant="ikincil" className="text-center">
        {t('mobil.odaklan.ipucu')}
      </Metin>
      <View className="flex-row flex-wrap justify-center gap-2" accessibilityRole="radiogroup">
        {ODAK_MODLARI.map((m) => (
          <Cip
            key={m.mod}
            etiket={MOD_ETIKETI[m.mod]}
            secili={mod === m.mod}
            onPress={() => {
              setMod(m.mod);
            }}
            testID={`odak-mod-${m.mod}`}
          />
        ))}
      </View>
      {mod === 'serbest' ? (
        <View className="flex-row items-center gap-3" testID="odak-serbest">
          <Dugme
            varyant="ikincil"
            etiket="−"
            accessibilityLabel={t('mobil.motivasyon.odak.azalt')}
            disabled={serbestDk <= ODAK_SERBEST_ENAZ_DK}
            onPress={() => {
              setSerbestDk((d) => Math.max(d - ODAK_SERBEST_ADIM_DK, ODAK_SERBEST_ENAZ_DK));
            }}
          />
          <Metin
            varyant="altBaslik"
            accessibilityLiveRegion="polite"
            accessibilityLabel={t('mobil.motivasyon.odak.dakikaEtiketi', { dk: serbestDk })}
          >
            {t('mobil.motivasyon.odak.dakika', { dk: serbestDk })}
          </Metin>
          <Dugme
            varyant="ikincil"
            etiket="+"
            accessibilityLabel={t('mobil.motivasyon.odak.arttir')}
            disabled={serbestDk >= ODAK_SERBEST_ENCOK_DK}
            onPress={() => {
              setSerbestDk((d) => Math.min(d + ODAK_SERBEST_ADIM_DK, ODAK_SERBEST_ENCOK_DK));
            }}
          />
        </View>
      ) : null}
      {gorevler.length > 0 ? (
        <View className="gap-2 self-stretch" testID="odak-gorevler">
          <Metin varyant="etiket">{t('mobil.motivasyon.odak.gorevSec')}</Metin>
          <View className="flex-row flex-wrap gap-2">
            <Cip
              etiket={t('mobil.motivasyon.odak.gorevsiz')}
              secili={gorevId === null}
              onPress={() => {
                setGorevId(null);
              }}
            />
            {gorevler.map((g) => (
              <Cip
                key={g.id}
                etiket={gorevAdi(g, konular)}
                secili={gorevId === g.id}
                onPress={() => {
                  setGorevId(g.id);
                }}
                testID={`odak-gorev-${g.id}`}
              />
            ))}
          </View>
          <Metin varyant="kucuk">{t('mobil.motivasyon.odak.gorevAciklama')}</Metin>
        </View>
      ) : null}
      {hata ? (
        <Metin varyant="ikincil" className="text-center text-hata" accessibilityLiveRegion="polite">
          {hata}
        </Metin>
      ) : null}
      <Dugme
        buyuk
        className="self-stretch"
        etiket={t('mobil.odaklan.baslat')}
        yukleniyor={baslatiyor}
        onPress={() => void baslat()}
        testID="odak-baslat"
      />
    </Ekran>
  );
}
