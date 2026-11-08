import { t } from '@kopru/i18n';
import { Modal, View } from 'react-native';

import type { DavetDurumu } from '../davet/yonetici';
import { Dugme } from '../ui/Dugme';
import { Ikon } from '../ui/Ikon';
import { Metin } from '../ui/Metin';
import { useServisler } from '../uygulama/baglam';

function icerik(
  d: DavetDurumu,
): { ikon: 'checkmark-circle' | 'alert-circle'; baslik: string; mesaj: string } | null {
  switch (d.asama) {
    case 'basarili':
      return {
        ikon: 'checkmark-circle',
        baslik: t('mobil.davet.basariliBaslik'),
        mesaj: d.kurumAd
          ? t('mobil.davet.basarili', { kurum: d.kurumAd })
          : t('mobil.davet.basariliGenel'),
      };
    case 'hata':
      return d.neden === 'zaten_uye'
        ? {
            ikon: 'alert-circle',
            baslik: t('mobil.davet.zatenUyeBaslik'),
            mesaj: t('mobil.davet.zatenUye'),
          }
        : d.neden === 'ag'
          ? { ikon: 'alert-circle', baslik: t('mobil.davet.agBaslik'), mesaj: t('mobil.davet.ag') }
          : {
              ikon: 'alert-circle',
              baslik: t('mobil.davet.gecersizBaslik'),
              mesaj: t('mobil.davet.gecersiz'),
            };
    default:
      return null;
  }
}

/**
 * Davet derin baglantisinin sonucu: kabul ediliyor (yukleniyor), kabul edildi ya da aciklayici
 * hata (gecersiz/kullanilmis/suresi dolmus, zaten uye, baglanti sorunu). Oturum asamasindan
 * bagimsiz, tum ekranlarin ustunde gorunur.
 */
export function DavetBildirimi() {
  const { davet } = useServisler();
  const durum = davet.durum.kullan();
  const gorunum = icerik(durum);
  const isleniyor = durum.asama === 'isleniyor';
  if (!gorunum && !isleniyor) return null;

  return (
    <Modal
      transparent
      animationType="fade"
      visible
      onRequestClose={() => {
        davet.kapat();
      }}
    >
      <View
        className="flex-1 items-center justify-center p-6"
        style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
        accessibilityViewIsModal
      >
        <View className="w-full max-w-sm gap-4 rounded-buyuk border border-kenar bg-yuzey p-5">
          {isleniyor ? (
            <View accessibilityLiveRegion="polite" className="items-center gap-3">
              <Ikon ad="sync" boyut={28} />
              <Metin varyant="etiket">{t('mobil.davet.isleniyor')}</Metin>
            </View>
          ) : gorunum ? (
            <>
              <View className="items-center gap-2" accessibilityRole="alert">
                <Ikon ad={gorunum.ikon} boyut={32} />
                <Metin varyant="altBaslik" accessibilityRole="header" className="text-center">
                  {gorunum.baslik}
                </Metin>
                <Metin varyant="ikincil" className="text-center">
                  {gorunum.mesaj}
                </Metin>
              </View>
              {durum.asama === 'hata' && durum.neden === 'ag' ? (
                <Dugme
                  etiket={t('mobil.davet.tekrarDene')}
                  onPress={() => void davet.tekrarDene()}
                />
              ) : null}
              <Dugme
                varyant={durum.asama === 'hata' && durum.neden === 'ag' ? 'hayalet' : 'birincil'}
                etiket={t('mobil.davet.tamam')}
                onPress={() => {
                  davet.kapat();
                }}
              />
            </>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}
