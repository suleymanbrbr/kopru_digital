import { t, type MessageKey } from '@kopru/i18n';
import { Pressable, View } from 'react-native';

import { KOZMETIK_SLOTLARI, type Kozmetik, type KozmetikSlotu } from '../../api/motivasyonTipleri';
import { Ikon } from '../../ui/Ikon';
import { Metin } from '../../ui/Metin';

/** Kilitli kozmetigin acilma kosulu: sunucudan gelen rozet adi / seviye / seri. */
export function acilmaKosuluMetni(k: Pick<Kozmetik, 'acilma_kosulu'>): string {
  const c = k.acilma_kosulu;
  if (c.rozet_adi || c.rozet) {
    return t('mobil.motivasyon.dolap.kosulRozet', { ad: c.rozet_adi ?? c.rozet ?? '' });
  }
  if (c.seviye !== undefined) return t('mobil.motivasyon.dolap.kosulSeviye', { n: c.seviye });
  if (c.seri !== undefined) return t('mobil.motivasyon.dolap.kosulSeri', { n: c.seri });
  return t('mobil.motivasyon.dolap.kosulYok');
}

const NADIRLIK: Record<Kozmetik['nadirlik'], MessageKey> = {
  yaygin: 'mobil.motivasyon.dolap.yaygin',
  nadir: 'mobil.motivasyon.dolap.nadir',
  efsanevi: 'mobil.motivasyon.dolap.efsanevi',
};

function KozmetikSatiri({
  k,
  mesgul,
  degistir,
}: {
  k: Kozmetik;
  mesgul: boolean;
  degistir: (kod: string | null) => void;
}) {
  const durum = k.kusanildi
    ? t('mobil.motivasyon.dolap.kusanili')
    : k.sahip
      ? t('mobil.motivasyon.dolap.sahip')
      : t('mobil.motivasyon.dolap.kilitli');
  return (
    <View
      className="min-h-dokunma flex-row items-center gap-3 rounded-orta border border-kenar bg-yuzey p-3"
      testID={`kozmetik-${k.kod}`}
    >
      <Ikon ad={k.sahip ? 'shirt-outline' : 'lock-closed'} boyut={22} />
      <View
        className="flex-1 gap-0.5"
        accessible
        accessibilityLabel={`${k.ad}, ${t(NADIRLIK[k.nadirlik])}, ${durum}${k.sahip ? '' : `. ${acilmaKosuluMetni(k)}`}`}
      >
        <Metin varyant="etiket">{k.ad}</Metin>
        <Metin varyant="kucuk">
          {t(NADIRLIK[k.nadirlik])} · {durum}
        </Metin>
        {!k.sahip ? <Metin varyant="kucuk">{acilmaKosuluMetni(k)}</Metin> : null}
      </View>
      {k.sahip ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            k.kusanildi
              ? t('mobil.motivasyon.dolap.cikarEtiketi', { ad: k.ad })
              : t('mobil.motivasyon.dolap.kusanEtiketi', { ad: k.ad })
          }
          accessibilityState={{ selected: k.kusanildi, disabled: mesgul }}
          disabled={mesgul}
          onPress={() => {
            degistir(k.kusanildi ? null : k.kod);
          }}
          testID={`kusan-${k.kod}`}
          className={`min-h-dokunma min-w-dokunma items-center justify-center rounded-tam border px-4 active:opacity-80 ${
            k.kusanildi ? 'border-birincil bg-yuzeyIkincil' : 'border-kenar'
          }`}
        >
          <Metin varyant="etiket">
            {k.kusanildi ? t('mobil.motivasyon.dolap.cikar') : t('mobil.motivasyon.dolap.kusan')}
          </Metin>
        </Pressable>
      ) : null}
    </View>
  );
}

interface Props {
  kozmetikler: readonly Kozmetik[];
  mesgul: boolean;
  degistir: (slot: KozmetikSlotu, kod: string | null) => void;
}

/** Kostum dolabi: slot slot listelenir; sahip olunan kusanilir/cikarilir, kilitlinin kosulu yazilir. */
export function KozmetikDolabi({ kozmetikler, mesgul, degistir }: Props) {
  return (
    <View className="gap-3" testID="kozmetik-dolabi">
      {KOZMETIK_SLOTLARI.map((slot) => {
        const liste = kozmetikler.filter((k) => k.slot === slot);
        if (liste.length === 0) return null;
        return (
          <View key={slot} className="gap-2">
            <Metin varyant="etiket" accessibilityRole="header">
              {t(`mobil.motivasyon.slot.${slot}` as MessageKey)}
            </Metin>
            {liste.map((k) => (
              <KozmetikSatiri
                key={k.kod}
                k={k}
                mesgul={mesgul}
                degistir={(kod) => {
                  degistir(slot, kod);
                }}
              />
            ))}
          </View>
        );
      })}
    </View>
  );
}
