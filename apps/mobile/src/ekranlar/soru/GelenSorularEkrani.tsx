import { t } from '@kopru/i18n';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';

import { bransAdi } from '../../ogrenme/konu';
import { GonderimKartlari } from '../../soru/GonderimKartlari';
import { SoruSatiri } from '../../soru/SoruSatiri';
import { Anahtar } from '../../ui/Anahtar';
import { Cip } from '../../ui/Cip';
import { Dugme } from '../../ui/Dugme';
import { BosDurum, HataDurumu, Yukleniyor } from '../../ui/Durumlar';
import { Ekran } from '../../ui/Ekran';
import { Kart } from '../../ui/Kart';
import { Metin } from '../../ui/Metin';
import { MetinGirdisi } from '../../ui/MetinGirdisi';
import { Secici } from '../../ui/Secici';
import { hataMesaji } from '../../uygulama/hatalar';
import { useSaatDilimi } from '../../uygulama/operasyon';
import {
  useCevapladiklarim,
  useGelenSorular,
  useGelenSoruSayisi,
  useMusaitlik,
  useMusaitlikAyarla,
} from '../../uygulama/soru';
import { CevrimdisiSerit } from '../CevrimdisiSerit';

type Sekme = 'bekleyen' | 'cevaplanan';

function Musaitlik() {
  const q = useMusaitlik();
  const ayarla = useMusaitlikAyarla();
  const musaitDegil = q.data ? !q.data.musait : false;
  return (
    <Kart className="gap-1" testID="musaitlik">
      <Anahtar
        etiket={t('mobil.soru.ogretmen.musait')}
        aciklama={t('mobil.soru.ogretmen.musaitAciklama')}
        deger={musaitDegil}
        onDegis={(v) => {
          ayarla.mutate(!v);
        }}
      />
      {ayarla.isError ? (
        <Metin varyant="ikincil" className="text-hata" accessibilityRole="alert">
          {t('mobil.soru.ogretmen.musaitKaydedilemedi')}
        </Metin>
      ) : null}
    </Kart>
  );
}

/** Ogretmen "Sorular" sekmesi: bekleyen kuyruk (en eski once, brans/ogrenci suzgeci) ve cevapladiklarim. */
export function GelenSorularEkrani() {
  const router = useRouter();
  const { tz } = useSaatDilimi();
  const [sekme, setSekme] = useState<Sekme>('bekleyen');
  const [brans, setBrans] = useState<string | null>(null);
  const [ogrenciId, setOgrenciId] = useState<string | null>(null);
  const [arama, setArama] = useState('');
  const [q, setQ] = useState('');

  useEffect(() => {
    const id = setTimeout(() => {
      setQ(arama.trim());
    }, 300);
    return () => {
      clearTimeout(id);
    };
  }, [arama]);

  const sayi = useGelenSoruSayisi();
  const kuyrukSuzgeci = useMemo(
    () => ({
      ...(brans ? { bransKodu: brans } : {}),
      ...(ogrenciId ? { ogrenciId } : {}),
    }),
    [brans, ogrenciId],
  );
  const arsivSuzgeci = useMemo(
    () => ({ ...kuyrukSuzgeci, ...(q ? { q } : {}) }),
    [kuyrukSuzgeci, q],
  );
  const bekleyen = useGelenSorular(kuyrukSuzgeci, sekme === 'bekleyen');
  const arsiv = useCevapladiklarim(arsivSuzgeci, sekme === 'cevaplanan');
  const sorgu = sekme === 'bekleyen' ? bekleyen : arsiv;
  const sorular = useMemo(() => sorgu.data?.pages.flatMap((p) => p.sorular) ?? [], [sorgu.data]);

  // Ogrenci suzgeci: suzgecsiz kuyruk/arsivdeki ogrencilerden.
  const tumKuyruk = useGelenSorular({}, sekme === 'bekleyen');
  const tumArsiv = useCevapladiklarim({}, sekme === 'cevaplanan');
  const ogrenciler = useMemo(() => {
    const kaynak =
      (sekme === 'bekleyen' ? tumKuyruk : tumArsiv).data?.pages.flatMap((p) => p.sorular) ?? [];
    const harita = new Map<string, string>();
    for (const x of kaynak) if (x.ogrenciAdi) harita.set(x.ogrenciId, x.ogrenciAdi);
    return [...harita].slice(0, 12).map(([id, ad]) => ({ id, ad }));
  }, [sekme, tumKuyruk, tumArsiv]);

  const branslar = sayi.data?.branslar ?? [];

  return (
    <Ekran ust={<CevrimdisiSerit />} kenarlar={['top', 'left', 'right']} klavye>
      <Metin varyant="baslik" accessibilityRole="header">
        {t('mobil.soru.ogretmen.baslik')}
      </Metin>
      <Musaitlik />
      <GonderimKartlari turler={['cevap']} />
      <Secici
        deger={sekme}
        onDegis={setSekme}
        secenekler={[
          {
            deger: 'bekleyen',
            etiket: t('mobil.soru.ogretmen.bekleyenBaslik', { n: sayi.data?.bekleyen ?? 0 }),
          },
          { deger: 'cevaplanan', etiket: t('mobil.soru.ogretmen.cevapladiklarim') },
        ]}
      />

      {branslar.length > 1 || brans ? (
        <View className="flex-row flex-wrap gap-2" accessibilityRole="radiogroup">
          <Cip
            etiket={t('mobil.soru.liste.tum')}
            secili={brans === null}
            onPress={() => {
              setBrans(null);
            }}
          />
          {branslar.map((b) => (
            <Cip
              key={b.bransKodu}
              etiket={`${bransAdi(b.bransKodu)} (${String(b.bekleyen)})`}
              secili={brans === b.bransKodu}
              onPress={() => {
                setBrans(b.bransKodu);
              }}
            />
          ))}
        </View>
      ) : null}
      {ogrenciler.length > 1 || ogrenciId ? (
        <View className="flex-row flex-wrap gap-2" accessibilityRole="radiogroup">
          {ogrenciId ? (
            <Cip
              etiket={t('mobil.soru.ogretmen.ogrenciSuzgeciKaldir')}
              secili={false}
              onPress={() => {
                setOgrenciId(null);
              }}
            />
          ) : null}
          {ogrenciler.map((o) => (
            <Cip
              key={o.id}
              etiket={t('mobil.soru.ogretmen.ogrenciSuzgeci', { ad: o.ad })}
              secili={ogrenciId === o.id}
              onPress={() => {
                setOgrenciId(o.id);
              }}
            />
          ))}
        </View>
      ) : null}
      {sekme === 'cevaplanan' ? (
        <MetinGirdisi
          etiket={t('mobil.soru.liste.ara')}
          value={arama}
          onChangeText={setArama}
          autoCorrect={false}
          autoCapitalize="none"
        />
      ) : null}

      {sorgu.isPending ? <Yukleniyor /> : null}
      {sorgu.isError && !sorgu.data ? (
        <HataDurumu mesaj={hataMesaji(sorgu.error)} tekrar={() => void sorgu.refetch()} />
      ) : null}
      {sorgu.data && sorular.length === 0 ? (
        <BosDurum
          ikon="chatbubbles-outline"
          mesaj={
            sekme === 'bekleyen'
              ? t('mobil.soru.ogretmen.bekleyenBos')
              : t('mobil.soru.ogretmen.cevapladiklarimBos')
          }
        />
      ) : null}
      {sorular.map((s) => (
        <SoruSatiri
          key={s.id}
          soru={s}
          tz={tz}
          ogrencili
          onPress={() => {
            router.push({ pathname: '/(uygulama)/soru/[id]', params: { id: s.id } });
          }}
        />
      ))}
      {sorgu.hasNextPage ? (
        <Dugme
          varyant="ikincil"
          etiket={t('mobil.soru.liste.dahaFazla')}
          yukleniyor={sorgu.isFetchingNextPage}
          onPress={() => void sorgu.fetchNextPage()}
        />
      ) : null}
      <View />
    </Ekran>
  );
}
