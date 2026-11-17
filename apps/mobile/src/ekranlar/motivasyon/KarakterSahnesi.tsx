import { t, type MessageKey } from '@kopru/i18n';
import { View } from 'react-native';

import type { Kozmetik, MotivasyonDurumu } from '../../api/motivasyonTipleri';
import { Companion } from '../../karakter/Companion';
import type { RuhHali } from '../../karakter/tipler';
import { seviyeOrani } from '../../motivasyon/xpFarki';
import { Metin } from '../../ui/Metin';
import { karakterGorunumu, kozmetikGirdileri } from '../../uygulama/motivasyon';

const SLOT_ADI: Record<string, MessageKey> = {
  sapka: 'mobil.motivasyon.slot.sapka',
  gozluk: 'mobil.motivasyon.slot.gozluk',
  aksesuar: 'mobil.motivasyon.slot.aksesuar',
  arka_plan: 'mobil.motivasyon.slot.arka_plan',
  cerceve: 'mobil.motivasyon.slot.cerceve',
};

/** Ruh haline gore karakterin kisa sozu: suclayici dil yok, uykulu hali "seni bekledim". */
export function ruhHaliSozu(r: RuhHali, ad: string): string {
  return t(`mobil.motivasyon.ruhHaliSozu.${r}` as MessageKey, { ad });
}

/** Seviye ilerleme cubugu; renk tek sinyal degildir, metin ve erisilebilir deger birlikte verilir. */
export function SeviyeCubugu({ durum }: { durum: MotivasyonDurumu }) {
  const oran = seviyeOrani(durum);
  const kalan = durum.sonraki_seviyeye_kalan;
  const metin =
    kalan === null
      ? t('mobil.motivasyon.seviyeSon', { seviye: durum.seviye })
      : t('mobil.motivasyon.seviyeKalan', { seviye: durum.seviye + 1, kalan });
  return (
    <View
      className="gap-1 self-stretch"
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`${t('mobil.karakterim.seviye', { seviye: durum.seviye })}. ${metin}`}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(oran * 100) }}
      testID="seviye-cubugu"
    >
      <View className="flex-row items-center justify-between gap-2">
        <Metin varyant="etiket">{t('mobil.karakterim.seviye', { seviye: durum.seviye })}</Metin>
        <Metin varyant="kucuk">{t('mobil.motivasyon.toplamXp', { xp: durum.toplam_xp })}</Metin>
      </View>
      <View className="h-3 overflow-hidden rounded-tam bg-yuzeyIkincil">
        <View
          className="h-3 rounded-tam bg-vurgu"
          style={{ width: `${Math.round(oran * 100)}%` }}
        />
      </View>
      <Metin varyant="kucuk">{metin}</Metin>
    </View>
  );
}

interface Props {
  durum: MotivasyonDurumu;
  boyut?: number;
  odakta?: boolean;
  kutlama?: boolean;
  /** Kuşanılan kozmetiklerin adlari icin (yoksa yalniz kod bilinir ve liste gizlenir). */
  kozmetikler?: readonly Kozmetik[] | undefined;
  sozGoster?: boolean;
}

/**
 * Karakter sahnesi: tur + asama + ruh hali + kuşanılan kozmetikler. Yer tutucu SVG kozmetikleri
 * cizmez; kuşanılanlar etiket olarak altta listelenir ve Rive girdisine sayisal gecer.
 */
export function KarakterSahnesi({
  durum,
  boyut = 200,
  odakta = false,
  kutlama = false,
  kozmetikler,
  sozGoster = true,
}: Props) {
  const g = karakterGorunumu(durum, odakta, kutlama);
  if (!g) return null;
  const kusan = durum.karakter?.kusanilanlar ?? [];
  const adlar = kusan
    .map((k) => kozmetikler?.find((z) => z.kod === k.kozmetik_kodu))
    .filter((z): z is Kozmetik => !!z);
  return (
    <View className="items-center gap-2" testID="karakter-sahnesi">
      <Companion
        tur={g.tur}
        asama={g.asama}
        seviye={g.seviye}
        beceriler={g.beceriler}
        ruhHali={g.ruhHali}
        kozmetik={kozmetikGirdileri(kusan, kozmetikler)}
        ad={g.ad}
        boyut={boyut}
      />
      {sozGoster ? (
        <View
          className="rounded-buyuk bg-yuzeyIkincil px-4 py-2"
          accessible
          accessibilityLiveRegion="polite"
          testID="karakter-sozu"
        >
          <Metin varyant="etiket" className="text-center">
            {ruhHaliSozu(g.ruhHali, g.ad)}
          </Metin>
        </View>
      ) : null}
      {adlar.length > 0 ? (
        <View
          className="flex-row flex-wrap justify-center gap-2"
          accessible
          accessibilityLabel={t('mobil.motivasyon.kusanilanlar', {
            liste: adlar.map((z) => z.ad).join(', '),
          })}
        >
          {adlar.map((z) => (
            <View key={z.kod} className="rounded-tam border border-kenar px-3 py-1">
              <Metin varyant="kucuk">
                {t(SLOT_ADI[z.slot] ?? 'mobil.motivasyon.slot.sapka')}: {z.ad}
              </Metin>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}
