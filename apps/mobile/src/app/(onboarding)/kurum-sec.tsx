import { t } from '@kopru/i18n';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { kurumSecenekleri } from '../../oturum/kurumSecimi';
import { Dugme } from '../../ui/Dugme';
import { BosDurum } from '../../ui/Durumlar';
import { Ekran } from '../../ui/Ekran';
import { Ikon } from '../../ui/Ikon';
import { Kart } from '../../ui/Kart';
import { Metin } from '../../ui/Metin';
import { useOturum, useServisler } from '../../uygulama/baglam';
import { hataMesaji } from '../../uygulama/hatalar';

export default function KurumSec() {
  const router = useRouter();
  const { oturum } = useServisler();
  const durum = useOturum();
  const [secilen, setSecilen] = useState<string | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const uyelikler = durum.asama === 'giris' ? kurumSecenekleri(durum.uyelikler) : [];
  const tekId = uyelikler.length === 1 ? (uyelikler[0]?.uyelikId ?? null) : null;

  async function sec(id: string) {
    setSecilen(id);
    setHata(null);
    try {
      await oturum.uyelikSec(id);
    } catch (e) {
      setHata(hataMesaji(e));
    } finally {
      setSecilen(null);
    }
  }

  // Tek kurum varsa secim ekrani atlanir (solo hoca her acilista sorulmaz).
  useEffect(() => {
    if (!tekId) return;
    let iptal = false;
    oturum.uyelikSec(tekId).catch((e: unknown) => {
      if (!iptal) setHata(hataMesaji(e));
    });
    return () => {
      iptal = true;
    };
  }, [tekId, oturum]);

  return (
    <Ekran>
      <View className="gap-2">
        <Metin varyant="baslik" accessibilityRole="header">
          {t('mobil.kurumSec.baslik')}
        </Metin>
        <Metin varyant="ikincil">{t('mobil.kurumSec.aciklama')}</Metin>
      </View>
      {uyelikler.length === 0 ? <BosDurum mesaj={t('mobil.kurumSec.bosAciklama')} /> : null}
      {uyelikler.map((u) => (
        <Pressable
          key={u.uyelikId}
          accessibilityRole="button"
          accessibilityLabel={t('mobil.kurumSec.secimEtiketi', {
            kurum: u.kurumAd,
            rol: t(`roller.${u.rol}`),
          })}
          accessibilityState={{ busy: secilen === u.uyelikId, disabled: secilen !== null }}
          disabled={secilen !== null}
          onPress={() => void sec(u.uyelikId)}
          className="active:opacity-80"
        >
          <Kart className="min-h-dokunma flex-row items-center gap-3">
            <View className="h-11 w-11 items-center justify-center rounded-orta bg-yuzeyIkincil">
              <Ikon ad="business" />
            </View>
            <View className="flex-1">
              <Metin varyant="altBaslik">{u.kurumAd}</Metin>
              <Metin varyant="ikincil">{t(`roller.${u.rol}`)}</Metin>
            </View>
            <Ikon ad="chevron-forward" />
          </Kart>
        </Pressable>
      ))}
      {hata ? (
        <Metin varyant="ikincil" className="text-hata" accessibilityLiveRegion="polite">
          {hata}
        </Metin>
      ) : null}
      <Kart className="gap-3">
        <Metin varyant="ikincil">{t('mobil.kurumSec.sinifKoduAciklama')}</Metin>
        <Dugme
          varyant="ikincil"
          etiket={t('mobil.kurumSec.sinifKoduIleKatil')}
          onPress={() => {
            router.push('/sinif-kodu');
          }}
        />
      </Kart>
      <Dugme
        varyant="hayalet"
        etiket={t('mobil.profil.cikis')}
        onPress={() => void oturum.cikis()}
      />
    </Ekran>
  );
}
