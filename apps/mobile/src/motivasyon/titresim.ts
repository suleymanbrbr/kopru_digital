import * as Haptics from 'expo-haptics';

/**
 * Hafif titresim (XP, kutlama). Cihaz desteklemiyorsa ya da hata olursa sessizce gecer: titresim
 * hicbir akisi bozmamali. "Hareketi azalt" animasyonu kapatir, titresimi degil.
 */
export const titresim = {
  hafif: () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
  },
  basari: () => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
  },
  guclu: () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => undefined);
  },
};
