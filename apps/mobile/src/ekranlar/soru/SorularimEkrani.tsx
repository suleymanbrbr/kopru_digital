import { t } from '@kopru/i18n';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';

import { SORU_DURUMLARI, type SoruDurumu } from '../../api/soruTipleri';
import { bransAdi } from '../../ogrenme/konu';
import { durumAdi } from '../../soru/bicim';
import { SoruSatiri } from '../../soru/SoruSatiri';
import { Cip } from '../../ui/Cip';
import { Dugme } from '../../ui/Dugme';
import { BosDurum, HataDurumu, Yukleniyor } from '../../ui/Durumlar';
import { Ekran } from '../../ui/Ekran';
import { Metin } from '../../ui/Metin';
import { MetinGirdisi } from '../../ui/MetinGirdisi';
import { hataMesaji } from '../../uygulama/hatalar';
import { useSaatDilimi } from '../../uygulama/operasyon';
import { useSorularim } from '../../uygulama/soru';

/** Ogrencinin kendi soru arsivi: arama, duruma ve derse gore suzgec, durum rozetleri. */
export function SorularimEkrani() {
  const router = useRouter();
  const { tz } = useSaatDilimi();
  const [arama, setArama] = useState('');
  const [q, setQ] = useState('');
  const [durum, setDurum] = useState<SoruDurumu | null>(null);
  const [brans, setBrans] = useState<string | null>(null);
  const [gorulen, setGorulen] = useState<string[]>([]);

  useEffect(() => {
    const id = setTimeout(() => {
      setQ(arama.trim());
    }, 300);
    return () => {
      clearTimeout(id);
    };
  }, [arama]);

  const suzgec = useMemo(
    () => ({
      ...(durum ? { durum } : {}),
      ...(brans ? { bransKodu: brans } : {}),
      ...(q ? { q } : {}),
    }),
    [durum, brans, q],
  );
  const sorgu = useSorularim(suzgec);
  const sorular = useMemo(() => sorgu.data?.pages.flatMap((p) => p.sorular) ?? [], [sorgu.data]);

  // Ders suzgeci: o ana dek gorulen derslerden (suzgec uygulaninca liste daralsa da cipler kalir).
  useEffect(() => {
    const yeni = sorular.map((s) => s.bransKodu).filter((b) => !gorulen.includes(b));
    if (yeni.length > 0) setGorulen((g) => [...g, ...new Set(yeni)]);
  }, [sorular, gorulen]);

  return (
    <Ekran kenarlar={['left', 'right', 'bottom']} klavye>
      <MetinGirdisi
        etiket={t('mobil.soru.liste.ara')}
        value={arama}
        onChangeText={setArama}
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
        testID="soru-ara"
      />
      <View className="gap-2">
        <Metin varyant="etiket">{t('mobil.soru.liste.durumSuzgeci')}</Metin>
        <View className="flex-row flex-wrap gap-2" accessibilityRole="radiogroup">
          <Cip
            etiket={t('mobil.soru.liste.tum')}
            secili={durum === null}
            onPress={() => {
              setDurum(null);
            }}
          />
          {SORU_DURUMLARI.filter((d) => d !== 'kapandi').map((d) => (
            <Cip
              key={d}
              etiket={durumAdi(d)}
              secili={durum === d}
              onPress={() => {
                setDurum(d);
              }}
              testID={`suzgec-${d}`}
            />
          ))}
        </View>
      </View>
      {gorulen.length > 1 ? (
        <View className="gap-2">
          <Metin varyant="etiket">{t('mobil.soru.liste.bransSuzgeci')}</Metin>
          <View className="flex-row flex-wrap gap-2" accessibilityRole="radiogroup">
            <Cip
              etiket={t('mobil.soru.liste.tum')}
              secili={brans === null}
              onPress={() => {
                setBrans(null);
              }}
            />
            {gorulen.map((b) => (
              <Cip
                key={b}
                etiket={bransAdi(b)}
                secili={brans === b}
                onPress={() => {
                  setBrans(b);
                }}
              />
            ))}
          </View>
        </View>
      ) : null}

      {sorgu.isPending ? <Yukleniyor /> : null}
      {sorgu.isError && !sorgu.data ? (
        <HataDurumu
          mesaj={hataMesaji(sorgu.error) || t('mobil.soru.liste.yuklenemedi')}
          tekrar={() => void sorgu.refetch()}
        />
      ) : null}
      {sorgu.data && sorular.length === 0 ? (
        <BosDurum
          ikon="chatbubbles-outline"
          mesaj={
            q || durum || brans
              ? t('mobil.soru.liste.aramaBos')
              : t('mobil.soru.ogrenci.sorularimBos')
          }
        />
      ) : null}
      {sorular.map((s) => (
        <SoruSatiri
          key={s.id}
          soru={s}
          tz={tz}
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
    </Ekran>
  );
}
