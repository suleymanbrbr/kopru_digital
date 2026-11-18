import { t } from '@kopru/i18n';
import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';

import { duyuruOnizleme } from '../../duyuru/metin';
import { Dugme } from '../../ui/Dugme';
import { KartHatasi } from '../../ui/Durumlar';
import { Ikon } from '../../ui/Ikon';
import { Kart } from '../../ui/Kart';
import { Metin } from '../../ui/Metin';
import { useDuyurularim } from '../../uygulama/duyuru';
import { hataMesaji } from '../../uygulama/hatalar';
import { useModulAcik } from '../../uygulama/operasyon';

/** Kartta en cok gosterilen duyuru sayisi (kalani listede). */
const ONIZLEME = 2;

/**
 * Bugun'deki duyuru karti: okunmamis duyurular (yoksa sabitler) ve "Tum duyurular". Modul kapaliysa
 * hic cizilmez; hic duyuru yokken de cizilmez (Bugun'u gereksiz uzatmaz, liste Profil'den acilir).
 * Servis yanit vermezse yalniz bu kart hata gosterir.
 */
export function DuyuruKarti() {
  const router = useRouter();
  const acik = useModulAcik('duyuru');
  const sorgu = useDuyurularim();
  if (!acik) return null;
  const ogeler = sorgu.data?.pages[0]?.ogeler ?? [];
  const okunmamis = ogeler.filter((o) => o.okundu_at === null);
  const gosterilen = (okunmamis.length > 0 ? okunmamis : ogeler.filter((o) => o.sabit)).slice(
    0,
    ONIZLEME,
  );
  if (sorgu.isPending) return null;
  if (sorgu.isError && ogeler.length === 0) {
    return (
      <Kart className="gap-2" testID="bugun-duyurular">
        <Metin varyant="altBaslik" accessibilityRole="header">
          {t('mobil.duyuru.kartBaslik')}
        </Metin>
        <KartHatasi
          mesaj={hataMesaji(sorgu.error)}
          tekrar={() => {
            void sorgu.refetch();
          }}
        />
      </Kart>
    );
  }
  if (gosterilen.length === 0) return null;
  const yeni = okunmamis.length;
  return (
    <Kart className="gap-2" testID="bugun-duyurular">
      <View className="flex-row items-center gap-2">
        <Ikon ad="megaphone-outline" boyut={20} />
        <Metin varyant="altBaslik" accessibilityRole="header" className="flex-1">
          {yeni > 0 ? t('mobil.duyuru.yeniSayisi', { n: yeni }) : t('mobil.duyuru.kartBaslik')}
        </Metin>
      </View>
      {gosterilen.map((o) => (
        <Pressable
          key={o.id}
          testID={`bugun-duyuru-${o.id}`}
          accessibilityRole="button"
          accessibilityLabel={`${o.okundu_at === null ? t('mobil.duyuru.okunmamis') : t('mobil.duyuru.okundu')}. ${o.baslik}. ${duyuruOnizleme(o.govde, 80)}`}
          onPress={() => {
            router.push({ pathname: '/duyuru/[id]', params: { id: o.id } });
          }}
          className="min-h-dokunma gap-1 border-t border-kenar py-2 active:opacity-80"
        >
          <View className="flex-row items-center gap-2">
            {o.okundu_at === null ? (
              <View className="h-2.5 w-2.5 rounded-tam bg-birincil" accessibilityElementsHidden />
            ) : null}
            <Metin varyant="etiket" className="flex-1" numberOfLines={1}>
              {o.baslik}
            </Metin>
          </View>
          <Metin varyant="kucuk" numberOfLines={1}>
            {duyuruOnizleme(o.govde, 70)}
          </Metin>
        </Pressable>
      ))}
      <Dugme
        varyant="hayalet"
        etiket={t('mobil.duyuru.tumu')}
        testID="bugun-duyurular-tumu"
        onPress={() => {
          router.push('/duyurular');
        }}
      />
    </Kart>
  );
}
