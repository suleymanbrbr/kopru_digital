import { t } from '@kopru/i18n';
import { View } from 'react-native';

import type { Olcekler } from '../../api/degerlendirmeTipleri';
import { doluOlcekler, donemEtiketi, olcekSatiri } from '../../degerlendirme/kurallar';
import { bransAdi } from '../../ogrenme/konu';
import { Metin } from '../../ui/Metin';

/**
 * Dolu olcekler okunakli bir liste olarak ("Calisma duzeni 4/5"): grafik degil, satir; buyuk yazida
 * alt satira kayar. Hepsi bossa hicbir sey cizilmez.
 */
export function OlcekListesi({ olcekler, testID }: { olcekler: Olcekler; testID?: string }) {
  const dolu = doluOlcekler(olcekler);
  if (dolu.length === 0) return null;
  return (
    <View className="flex-row flex-wrap gap-2" testID={testID}>
      {dolu.map(({ kod, puan }) => (
        <View
          key={kod}
          accessible
          accessibilityLabel={olcekSatiri(kod, puan)}
          className="rounded-tam border border-kenar bg-yuzeyIkincil px-3 py-1"
        >
          <Metin varyant="kucuk" className="text-metin">
            {olcekSatiri(kod, puan)}
          </Metin>
        </View>
      ))}
    </View>
  );
}

/** "23 Kas – 29 Kas · Matematik" (ders yoksa yalniz donem). */
export function DonemSatiri({
  baslangic,
  bitis,
  bransKodu,
}: {
  baslangic: string;
  bitis: string;
  bransKodu: string | null;
}) {
  const donem = donemEtiketi(baslangic, bitis);
  return (
    <Metin varyant="ikincil">
      {bransKodu
        ? `${donem} · ${bransAdi(bransKodu)}`
        : `${donem} · ${t('mobil.degerlendirme.genel')}`}
    </Metin>
  );
}
