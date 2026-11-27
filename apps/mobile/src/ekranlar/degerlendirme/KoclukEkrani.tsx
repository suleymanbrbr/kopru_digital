import { t } from '@kopru/i18n';
import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { Dugme } from '../../ui/Dugme';
import { BosDurum, HataDurumu, Yukleniyor } from '../../ui/Durumlar';
import { Ekran } from '../../ui/Ekran';
import { Kart } from '../../ui/Kart';
import { Metin } from '../../ui/Metin';
import { useAktif } from '../../uygulama/baglam';
import { useKocluk, useZamanCizelgesi } from '../../uygulama/degerlendirme';
import { hataMesaji } from '../../uygulama/hatalar';
import { CevrimdisiSerit } from '../CevrimdisiSerit';
import {
  KonuOzetiKarti,
  KullanilanKaynaklarKarti,
  OlcekEgilimi,
  PlanOdevKarti,
} from './KoclukOzetleri';
import { OneriKarti } from './OneriKarti';
import { ZamanCizelgesi } from './ZamanCizelgesi';

interface Props {
  ogrenciId: string;
  ad: string;
}

/**
 * Ogrenci koclugu (personel): tek istekte (`/kocluk`) tum ogretmenlerin degerlendirme zaman cizelgesi,
 * son 4 haftanin olcekleri, kullanilan ve onerilen kaynaklar, konu analizi ozeti, plan/odev ozeti.
 * Ustte iki hizli eylem: "Degerlendirme yaz" (30 sn) ve "Kaynak oner".
 */
export function KoclukEkrani({ ogrenciId, ad }: Props) {
  const router = useRouter();
  const rol = useAktif()?.uyelik.rol;
  const yonetici = rol === 'sahip' || rol === 'yonetici';
  const sorgu = useKocluk(ogrenciId);
  const k = sorgu.data;
  const zaman = useZamanCizelgesi(ogrenciId, k);
  const gorunenAd = ad !== '' ? ad : (k?.ogrenciAd ?? t('mobil.ogrenciler.adsiz'));

  return (
    <Ekran ust={<CevrimdisiSerit />} kenarlar={['left', 'right', 'bottom']}>
      <View className="gap-1">
        <Metin varyant="baslik" accessibilityRole="header" testID="kocluk-baslik">
          {gorunenAd}
        </Metin>
        <Metin varyant="ikincil">{t('mobil.kocluk.aciklama')}</Metin>
      </View>

      <View className="gap-2">
        <Dugme
          buyuk
          etiket={t('degerlendirme.yaz')}
          testID="kocluk-degerlendirme-yaz"
          onPress={() => {
            router.push({ pathname: '/degerlendirme-yaz', params: { ogrenciId, ad: gorunenAd } });
          }}
        />
        <Dugme
          varyant="ikincil"
          etiket={t('kaynakOnerisi.baslik')}
          testID="kocluk-kaynak-oner"
          onPress={() => {
            router.push({ pathname: '/kaynak-oner', params: { ogrenciId, ad: gorunenAd } });
          }}
        />
      </View>

      {sorgu.isPending ? <Yukleniyor /> : null}
      {sorgu.isError && !k ? (
        <HataDurumu mesaj={hataMesaji(sorgu.error)} tekrar={() => void sorgu.refetch()} />
      ) : null}

      {k ? (
        <>
          <ZamanCizelgesi
            liste={zaman.liste}
            ogrenciId={ogrenciId}
            ogrenciAd={gorunenAd}
            yonetici={yonetici}
            dahaVar={zaman.dahaVar}
            dahaFazla={zaman.dahaFazla}
            yukleniyor={zaman.yukleniyor}
            hata={zaman.hata}
          />
          <OlcekEgilimi k={k} />
          <KullanilanKaynaklarKarti k={k} />
          <View className="gap-3" testID="onerilen-kaynaklar">
            <Metin varyant="altBaslik" accessibilityRole="header">
              {t('kocluk.onerilenKaynaklar')}
            </Metin>
            {k.oneriler.length === 0 ? (
              <Kart>
                <BosDurum
                  ikon="book-outline"
                  baslik={t('mobil.kocluk.oneriBos')}
                  mesaj={t('mobil.kocluk.oneriBosAciklama')}
                />
              </Kart>
            ) : null}
            {k.oneriler.map((o) => (
              <OneriKarti key={o.id} o={o} gorunum="personel" yonetici={yonetici} />
            ))}
          </View>
          <KonuOzetiKarti k={k} ogrenciId={ogrenciId} ogrenciAd={gorunenAd} />
          <PlanOdevKarti k={k} />
        </>
      ) : null}
    </Ekran>
  );
}
