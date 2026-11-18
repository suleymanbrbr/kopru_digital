import { BILDIRIM_DERS_HATIRLATMA_DK, BILDIRIM_KATEGORILERI } from '@kopru/contracts';
import { t, type MessageKey } from '@kopru/i18n';
import { useState } from 'react';
import { View } from 'react-native';

import {
  SAAT_ADIMI_DK,
  TUM_GUNLER,
  gunDegistir,
  saatKaydir,
  sessizSaatAcikMi,
} from '../../bildirim/tercih';
import { Anahtar } from '../../ui/Anahtar';
import { Cip } from '../../ui/Cip';
import { Dugme } from '../../ui/Dugme';
import { HataDurumu, Yukleniyor } from '../../ui/Durumlar';
import { Ekran } from '../../ui/Ekran';
import { Ikon } from '../../ui/Ikon';
import { Kart } from '../../ui/Kart';
import { Metin } from '../../ui/Metin';
import { useServisler } from '../../uygulama/baglam';
import {
  useBildirimAyarlari,
  useBildirimTercihleri,
  useBildirimTercihYazimi,
} from '../../uygulama/bildirim';
import { hataMesaji } from '../../uygulama/hatalar';
import { CevrimdisiSerit } from '../CevrimdisiSerit';

function SaatSecici({
  ad,
  deger,
  onDegis,
}: {
  ad: string;
  deger: string;
  onDegis: (yeni: string) => void;
}) {
  return (
    <View className="flex-1 gap-1" accessible={false}>
      <Metin varyant="kucuk">{ad}</Metin>
      <View className="flex-row items-center gap-2">
        <Dugme
          varyant="ikincil"
          etiket="−"
          accessibilityLabel={t('mobil.bildirim.tercih.saatAzalt', { ad })}
          onPress={() => {
            onDegis(saatKaydir(deger, -SAAT_ADIMI_DK));
          }}
          className="min-w-dokunma px-0"
        />
        <Metin varyant="altBaslik" testID={`saat-${ad}`} className="min-w-14 text-center">
          {deger}
        </Metin>
        <Dugme
          varyant="ikincil"
          etiket="+"
          accessibilityLabel={t('mobil.bildirim.tercih.saatArtir', { ad })}
          onPress={() => {
            onDegis(saatKaydir(deger, SAAT_ADIMI_DK));
          }}
          className="min-w-dokunma px-0"
        />
      </View>
    </View>
  );
}

/**
 * Bildirim tercihleri (Profil): kategori x anlik bildirim anahtari (`sistem` kilitli; gelen kutusu
 * her zaman acik), sessiz saat araligi ve gunleri, ders hatirlatma suresi. Degisiklikler hemen
 * (iyimser) kaydedilir; hata olursa onceki deger geri gelir ve mesaj gosterilir.
 */
export function BildirimTercihleri() {
  const { bildirim } = useServisler();
  const izin = bildirim.durum.kullan((d) => d.izin);
  const tercihler = useBildirimTercihleri();
  const ayarlar = useBildirimAyarlari();
  const { tercih, ayar } = useBildirimTercihYazimi();
  const [hata, setHata] = useState<string | null>(null);

  const yazHatasi = () => {
    setHata(t('mobil.bildirim.tercih.kaydedilemedi'));
  };
  const a = ayarlar.data;
  const sessizAcik = a ? sessizSaatAcikMi(a.sessiz_gunler) : false;
  const pushlar = new Map(
    (tercihler.data ?? []).filter((h) => h.kanal === 'push').map((h) => [h.kategori, h]),
  );

  const ayarYaz = (g: Parameters<typeof ayar.mutate>[0]) => {
    setHata(null);
    ayar.mutate(g, { onError: yazHatasi });
  };

  return (
    <Ekran ust={<CevrimdisiSerit />} kenarlar={['left', 'right', 'bottom']}>
      <Metin varyant="ikincil">{t('mobil.bildirim.tercih.aciklama')}</Metin>

      {izin === 'verilmedi' || izin === 'reddedildi' ? (
        <Kart className="gap-3" testID="tercih-izin-kapali">
          <View className="flex-row items-start gap-3">
            <Ikon ad="notifications-off-outline" boyut={24} />
            <Metin varyant="ikincil" className="flex-1">
              {t('mobil.bildirim.tercih.izinKapali')}
            </Metin>
          </View>
          <Dugme
            varyant="ikincil"
            etiket={
              izin === 'reddedildi'
                ? t('mobil.bildirim.izin.ayarlar')
                : t('mobil.bildirim.tercih.izinAc')
            }
            onPress={() => {
              void bildirim.izinIste();
            }}
          />
        </Kart>
      ) : null}

      <Kart className="gap-1">
        <Metin varyant="altBaslik" accessibilityRole="header">
          {t('mobil.bildirim.tercih.pushBaslik')}
        </Metin>
        <Metin varyant="kucuk">{t('mobil.bildirim.tercih.kutuNotu')}</Metin>
        {tercihler.isPending ? <Yukleniyor /> : null}
        {tercihler.isError && !tercihler.data ? (
          <HataDurumu
            mesaj={hataMesaji(tercihler.error)}
            tekrar={() => {
              void tercihler.refetch();
            }}
          />
        ) : null}
        {tercihler.data
          ? BILDIRIM_KATEGORILERI.map((kategori) => {
              const h = pushlar.get(kategori);
              if (!h) return null;
              const etiket = t(`bildirim.kategori.${kategori}` as MessageKey);
              return (
                <View key={kategori} testID={`tercih-${kategori}`}>
                  <Anahtar
                    etiket={etiket}
                    {...(h.kilitli ? { aciklama: t('mobil.bildirim.tercih.kilitli') } : {})}
                    deger={h.acik}
                    onDegis={(acik) => {
                      if (h.kilitli) return;
                      setHata(null);
                      tercih.mutate([{ kategori, kanal: 'push', acik }], { onError: yazHatasi });
                    }}
                    {...(h.kilitli ? { devreDisi: true } : {})}
                  />
                </View>
              );
            })
          : null}
      </Kart>

      <Kart className="gap-3">
        <Metin varyant="altBaslik" accessibilityRole="header">
          {t('mobil.bildirim.tercih.sessizBaslik')}
        </Metin>
        {ayarlar.isPending ? <Yukleniyor /> : null}
        {ayarlar.isError && !a ? (
          <HataDurumu
            mesaj={hataMesaji(ayarlar.error)}
            tekrar={() => {
              void ayarlar.refetch();
            }}
          />
        ) : null}
        {a ? (
          <>
            <Anahtar
              etiket={t('mobil.bildirim.tercih.sessizAcik')}
              aciklama={t('mobil.bildirim.tercih.sessizAciklama')}
              deger={sessizAcik}
              onDegis={(acik) => {
                ayarYaz({ sessiz_gunler: acik ? [...TUM_GUNLER] : [] });
              }}
            />
            {sessizAcik ? (
              <>
                <View className="flex-row gap-4">
                  <SaatSecici
                    ad={t('mobil.bildirim.tercih.sessizBaslangic')}
                    deger={a.sessiz_baslangic}
                    onDegis={(yeni) => {
                      if (yeni === a.sessiz_bitis) {
                        setHata(t('mobil.bildirim.tercih.saatEsit'));
                        return;
                      }
                      ayarYaz({ sessiz_baslangic: yeni, sessiz_bitis: a.sessiz_bitis });
                    }}
                  />
                  <SaatSecici
                    ad={t('mobil.bildirim.tercih.sessizBitis')}
                    deger={a.sessiz_bitis}
                    onDegis={(yeni) => {
                      if (yeni === a.sessiz_baslangic) {
                        setHata(t('mobil.bildirim.tercih.saatEsit'));
                        return;
                      }
                      ayarYaz({ sessiz_baslangic: a.sessiz_baslangic, sessiz_bitis: yeni });
                    }}
                  />
                </View>
                <View className="gap-2">
                  <Metin varyant="etiket">{t('mobil.bildirim.tercih.sessizGunler')}</Metin>
                  <View className="flex-row flex-wrap gap-2">
                    {TUM_GUNLER.map((g) => (
                      <Cip
                        key={g}
                        testID={`sessiz-gun-${String(g)}`}
                        etiket={t(`mobil.bildirim.tercih.g${String(g)}` as MessageKey)}
                        secili={a.sessiz_gunler.includes(g)}
                        onPress={() => {
                          ayarYaz({ sessiz_gunler: gunDegistir(a.sessiz_gunler, g) });
                        }}
                      />
                    ))}
                  </View>
                </View>
              </>
            ) : null}
          </>
        ) : null}
      </Kart>

      {a ? (
        <Kart className="gap-3">
          <Metin varyant="altBaslik" accessibilityRole="header">
            {t('mobil.bildirim.tercih.hatirlatmaBaslik')}
          </Metin>
          <Metin varyant="ikincil">{t('mobil.bildirim.tercih.hatirlatmaAciklama')}</Metin>
          <View className="flex-row flex-wrap gap-2">
            {BILDIRIM_DERS_HATIRLATMA_DK.map((dk) => (
              <Cip
                key={dk}
                testID={`hatirlatma-${String(dk)}`}
                etiket={t(`mobil.bildirim.tercih.hatirlatma${String(dk)}` as MessageKey)}
                secili={a.ders_hatirlatma_dk === dk}
                onPress={() => {
                  ayarYaz({ ders_hatirlatma_dk: dk });
                }}
              />
            ))}
          </View>
        </Kart>
      ) : null}

      {hata ? (
        <Metin varyant="ikincil" className="text-hata" accessibilityLiveRegion="polite">
          {hata}
        </Metin>
      ) : null}
    </Ekran>
  );
}
