import { t } from '@kopru/i18n';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { Markdown } from '../../lib/markdown/Markdown';
import { Dugme } from '../../ui/Dugme';
import { HataDurumu, Yukleniyor } from '../../ui/Durumlar';
import { Ekran } from '../../ui/Ekran';
import { Ikon } from '../../ui/Ikon';
import { Metin } from '../../ui/Metin';
import { useOturum, useServisler } from '../../uygulama/baglam';
import { hataMesaji } from '../../uygulama/hatalar';

/**
 * KVKK onayi: kabul edilmeden uygulamanin geri kalanina gecilemez (Stack.Protected).
 * Bekleyen metinler (aydinlatma, kullanim kosullari) sirayla tek kaydirilabilir alanda gosterilir;
 * onay kutusu ve dugme altta sabittir. Metin yuklenmeden onay verilemez.
 */
export default function Kvkk() {
  const { oturum } = useServisler();
  const durum = useOturum();
  const metinler = durum.asama === 'giris' ? durum.kvkk.metinler : [];
  const [onay, setOnay] = useState(false);
  const [yukleniyor, setYukleniyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  // Metin varsa hazirdir (turetilir); yoksa yukleniyor (hata null) ya da hata mesaji.
  const [yuklemeHatasi, setYuklemeHatasi] = useState<string | null>(null);
  const [deneme, setDeneme] = useState(0);
  const hazir = metinler.length > 0;

  useEffect(() => {
    if (hazir) return;
    let iptal = false;
    oturum
      .kvkkMetinleriYukle()
      .then(() => {
        if (iptal) return;
        const d = oturum.depo.al();
        // Bos geldiyse onaylanacak bir sey gosterilemiyor demektir.
        const bos = d.asama !== 'giris' || d.kvkk.metinler.length === 0;
        setYuklemeHatasi(bos ? t('mobil.kvkk.metinYok') : null);
      })
      .catch((e: unknown) => {
        if (!iptal) setYuklemeHatasi(hataMesaji(e));
      });
    return () => {
      iptal = true;
    };
  }, [hazir, oturum, deneme]);

  async function kabul() {
    if (!hazir) return;
    setYukleniyor(true);
    setHata(null);
    try {
      await oturum.kvkkKabulEt();
    } catch (e) {
      setHata(hataMesaji(e));
    } finally {
      setYukleniyor(false);
    }
  }

  const surumler = [...new Set(metinler.map((m) => m.surum))].join(', ');

  return (
    <Ekran kaydir={false}>
      <View
        className="min-h-0 flex-1 overflow-hidden rounded-buyuk border border-kenar bg-yuzey"
        accessibilityLabel={t('mobil.kvkk.metinBolgesi')}
      >
        <ScrollView
          className="flex-1"
          contentContainerClassName="gap-4 p-4"
          showsVerticalScrollIndicator
          persistentScrollbar
        >
          <View className="gap-2">
            <Metin varyant="baslik" accessibilityRole="header">
              {t('kvkk.baslik')}
            </Metin>
            <Metin varyant="ikincil">{t('kvkk.aciklama')}</Metin>
          </View>
          {!hazir && yuklemeHatasi === null ? (
            <Yukleniyor etiket={t('mobil.kvkk.yukleniyor')} />
          ) : null}
          {!hazir && yuklemeHatasi !== null ? (
            <HataDurumu
              mesaj={yuklemeHatasi}
              tekrar={() => {
                setYuklemeHatasi(null);
                setDeneme((n) => n + 1);
              }}
            />
          ) : null}
          {metinler.map((m) => (
            <View key={m.id} className="gap-3 border-t border-kenar pt-4">
              <Metin varyant="altBaslik" accessibilityRole="header">
                {m.baslik}
              </Metin>
              <Markdown kaynak={m.govdeMarkdown} />
            </View>
          ))}
          {hazir ? (
            <Metin varyant="kucuk">{t('mobil.kvkk.surum', { surum: surumler })}</Metin>
          ) : null}
        </ScrollView>
      </View>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: onay, disabled: !hazir }}
        accessibilityLabel={t('mobil.kvkk.onayKutusuEtiketi')}
        accessibilityHint={hazir ? undefined : t('mobil.kvkk.onayKilitli')}
        disabled={!hazir}
        onPress={() => {
          setOnay((o) => !o);
        }}
        className={`min-h-dokunma flex-row items-center gap-3 ${hazir ? '' : 'opacity-50'}`}
      >
        <View
          className={`h-7 w-7 items-center justify-center rounded-kucuk border-2 ${
            onay && hazir ? 'border-birincil bg-birincil' : 'border-kenar bg-yuzey'
          }`}
        >
          {onay && hazir ? <Ikon ad="checkmark" boyut={18} renk="#FFFFFF" /> : null}
        </View>
        <Metin className="flex-1">{t('kvkk.onay')}</Metin>
      </Pressable>
      {hata ? (
        <Metin varyant="ikincil" className="text-hata" accessibilityLiveRegion="polite">
          {hata}
        </Metin>
      ) : null}
      <Dugme
        etiket={t('mobil.kvkk.kabulEt')}
        buyuk
        disabled={!onay || !hazir}
        yukleniyor={yukleniyor}
        onPress={() => void kabul()}
      />
      <Dugme varyant="hayalet" etiket={t('mobil.kvkk.cikis')} onPress={() => void oturum.cikis()} />
    </Ekran>
  );
}
