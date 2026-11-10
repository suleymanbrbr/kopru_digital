import { t } from '@kopru/i18n';
import { useRouter } from 'expo-router';
import { useState } from 'react';

import { Dugme } from '../ui/Dugme';
import { BosDurum, HataDurumu, Yukleniyor } from '../ui/Durumlar';
import { Kart } from '../ui/Kart';
import { Metin } from '../ui/Metin';
import { Secici } from '../ui/Secici';
import { hataMesaji } from '../uygulama/hatalar';
import { useDenemeler, useDenemeKurallari } from '../uygulama/ogrenme';
import { BolumNetleri, DenemeBaslik, DenemeDurumRozeti } from './DenemeBilesenleri';
import { DenemeOnayKarti } from './DenemeOnayKuyrugu';
import { GelisimBolumu } from './OgrenciDenemeler';

const SON_DENEME_SAYISI = 5;

/**
 * Ogrenci kartinin "Denemeler" bolumu (ogretmen): gelisim grafigi, son denemeler, bekleyen
 * sonuclarin onayi/reddi ve tek ogrenci icin sonuc girisi.
 */
export function OgrenciDenemeBolumu({
  ogrenciId,
  ogrenciAd,
}: {
  ogrenciId: string;
  ogrenciAd: string;
}) {
  const router = useRouter();
  const sorgu = useDenemeler({ ogrenciId });
  const kurallar = useDenemeKurallari();
  const [secilen, setSecilen] = useState<string | null>(null);
  const liste = sorgu.data ?? [];
  const bekleyenler = liste.filter((d) => d.onayDurumu === 'bekliyor');
  const digerleri = liste.filter((d) => d.onayDurumu !== 'bekliyor').slice(0, SON_DENEME_SAYISI);
  const kodlar = [
    ...new Set(liste.filter((d) => d.onayDurumu === 'onaylandi').map((d) => d.kuralKodu)),
  ];
  const kuralKodu = secilen ?? kodlar[0] ?? null;

  return (
    <Kart className="gap-3" testID="ogrenci-deneme-bolumu">
      <Metin varyant="altBaslik" accessibilityRole="header">
        {t('mobil.ogrenme.deneme.baslik')}
      </Metin>
      <Dugme
        etiket={t('mobil.ogrenme.deneme.sonucGir')}
        onPress={() => {
          router.push({ pathname: '/deneme-gir', params: { ogrenciId, ad: ogrenciAd } });
        }}
      />
      {sorgu.isPending ? <Yukleniyor /> : null}
      {sorgu.isError && !sorgu.data ? (
        <HataDurumu mesaj={hataMesaji(sorgu.error)} tekrar={() => void sorgu.refetch()} />
      ) : null}
      {sorgu.data && liste.length === 0 ? (
        <BosDurum ikon="sparkles" mesaj={t('mobil.ogrenme.deneme.ogretmenBos')} />
      ) : null}
      {bekleyenler.map((d) => (
        <DenemeOnayKarti key={d.id} deneme={d} />
      ))}
      {kodlar.length > 1 ? (
        <Secici
          baslik={t('mobil.ogrenme.deneme.tur')}
          deger={kuralKodu}
          onDegis={setSecilen}
          secenekler={kodlar.map((k) => ({
            deger: k,
            etiket: kurallar.data?.find((x) => x.kod === k)?.ad ?? k.toUpperCase(),
          }))}
        />
      ) : null}
      <GelisimBolumu ogrenciId={ogrenciId} kuralKodu={kuralKodu} />
      {digerleri.map((d) => (
        <Kart key={d.id} className="gap-2" testID={`ogretmen-deneme-${d.id}`}>
          <DenemeBaslik deneme={d} />
          <DenemeDurumRozeti durum={d.onayDurumu} />
          {d.onayDurumu === 'reddedildi' && d.redNedeni ? (
            <Metin varyant="kucuk">
              {t('mobil.ogrenme.deneme.redNedeniBaslik')}: {d.redNedeni}
            </Metin>
          ) : null}
          <BolumNetleri deneme={d} />
        </Kart>
      ))}
    </Kart>
  );
}
