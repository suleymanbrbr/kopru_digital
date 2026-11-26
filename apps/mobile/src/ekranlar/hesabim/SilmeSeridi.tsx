import { t } from '@kopru/i18n';
import { useRouter } from 'expo-router';
import { Pressable } from 'react-native';

import { silmeBekliyorMu } from '../../api/tipler';
import { tarihGoster } from '../../lib/zaman';
import { Ikon } from '../../ui/Ikon';
import { Metin } from '../../ui/Metin';
import { useSilmeDurumu } from '../../uygulama/hesap';

/**
 * Bekleyen hesap silme talebi varsa ana ekranin ustunde bilgi seridi (KVKK: kullanici unutmasin,
 * 30 gun icinde geri alabilsin). Dokununca Hesabim ekranina gider.
 */
export function SilmeSeridi() {
  const router = useRouter();
  const { data } = useSilmeDurumu();
  if (!data?.talep || !silmeBekliyorMu(data)) return null;
  const mesaj = t('mobil.hesabim.serit', { tarih: tarihGoster(data.talep.planlanan) });
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${mesaj} ${t('mobil.hesabim.seritDugme')}`}
      onPress={() => {
        router.push('/hesabim');
      }}
      className="min-h-dokunma flex-row items-center gap-2 border-y border-hata bg-yuzeyIkincil px-4 py-2"
      testID="silme-serit"
    >
      <Ikon ad="alert-circle" boyut={18} />
      <Metin varyant="etiket" className="flex-1">
        {mesaj}
      </Metin>
      <Ikon ad="chevron-forward" boyut={16} />
    </Pressable>
  );
}
