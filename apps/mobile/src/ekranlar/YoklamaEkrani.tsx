import { t } from '@kopru/i18n';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import type { BekleyenYoklamaDersi, NotGorunurluk, YoklamaDurumu } from '../api/operasyonTipleri';
import { yoklamaKuyrugaAl, type YoklamaYuku } from '../offline/yoklama';
import {
  gecDakikaGecerliMi,
  yoklamaSatirlariKur,
  type YoklamaSecimi,
} from '../offline/yoklamaSatirlari';
import { Anahtar } from '../ui/Anahtar';
import { Dugme } from '../ui/Dugme';
import { BosDurum, HataDurumu, Yukleniyor } from '../ui/Durumlar';
import { Ekran } from '../ui/Ekran';
import { Ikon } from '../ui/Ikon';
import { Kart } from '../ui/Kart';
import { Metin } from '../ui/Metin';
import { MetinGirdisi } from '../ui/MetinGirdisi';
import { Secici } from '../ui/Secici';
import { useAktif, useServisler } from '../uygulama/baglam';
import { hataMesaji } from '../uygulama/hatalar';
import { useKuyruk, useYoklamaKatilimcilari } from '../uygulama/operasyon';

const DURUMLAR: readonly YoklamaDurumu[] = ['geldi', 'gelmedi', 'izinli', 'gec'];

export function durumEtiketi(d: YoklamaDurumu): string {
  return t(`mobil.yoklama.${d}`);
}

interface Props {
  dersId: string;
  baslik: string;
  baslangic: string;
}

/**
 * Yoklama ekrani. Birebir: tek ogrenci, durum secilip kaydedilir (hizli yol "Bugun" kartindaki
 * tek dokunus "Geldi"). Grup: herkes varsayilan "geldi", yalniz gelmeyenler isaretlenir.
 * Kaydet iyimserdir: kuyruga alinir, ekran aninda "alindi" gosterir; baglanti gelince eslesir.
 */
export function YoklamaEkrani({ dersId, baslik, baslangic }: Props) {
  const router = useRouter();
  const qc = useQueryClient();
  const { kuyruk } = useServisler();
  const uyelikId = useAktif()?.uyelik.uyelikId;
  const kat = useYoklamaKatilimcilari(dersId);
  const { bekleyen } = useKuyruk();

  const [degisen, setDegisen] = useState<Record<string, YoklamaSecimi>>({});
  const [not, setNot] = useState('');
  const [ogrenciyeGorunsun, setOgrenciyeGorunsun] = useState(false);
  const [denendi, setDenendi] = useState(false);
  const [alindi, setAlindi] = useState(false);

  const secimler = useMemo(() => {
    const taban: Record<string, YoklamaSecimi> = {};
    for (const k of kat.data ?? []) taban[k.ogrenciId] = { durum: k.durum ?? 'geldi' };
    return { ...taban, ...degisen };
  }, [kat.data, degisen]);

  const tek = (kat.data?.length ?? 0) === 1;
  const hatali = Object.values(secimler).some(
    (s) => s.durum === 'gec' && !gecDakikaGecerliMi(s.gecDakika),
  );

  function kaydet() {
    setDenendi(true);
    const gorunurluk: NotGorunurluk = ogrenciyeGorunsun ? 'ogrenciye' : 'ogretmene_ozel';
    // Dokunma ani: `isaretlenme_at` burada yakalanir ve yeniden denemelerde degismez.
    const sonuc = yoklamaSatirlariKur(secimler, { not, gorunurluk, an: new Date() });
    if (!sonuc.ok) return;
    const yuk: YoklamaYuku = {
      dersId,
      dersBaslik: baslik,
      dersBaslangic: baslangic,
      satirlar: sonuc.satirlar,
    };
    yoklamaKuyrugaAl(kuyruk, yuk);
    qc.setQueryData<BekleyenYoklamaDersi[]>(['yoklama-bekleyen', uyelikId], (eski) =>
      eski?.filter((d) => d.id !== dersId),
    );
    setAlindi(true);
  }

  if (alindi) {
    const bekliyor = bekleyen.some((i) => (i.yuk as YoklamaYuku).dersId === dersId);
    return (
      <Ekran kenarlar={['left', 'right']}>
        <Kart
          className="items-center gap-3"
          accessibilityLiveRegion="polite"
          testID="yoklama-alindi"
        >
          <Ikon ad="checkmark-circle" boyut={40} />
          <Metin varyant="baslik">{t('mobil.yoklama.alindi')}</Metin>
          <Metin varyant="ikincil" className="text-center">
            {bekliyor ? t('mobil.yoklama.gonderilmeyiBekliyor') : t('mobil.yoklama.alindiMesaj')}
          </Metin>
          <Dugme
            etiket={t('ortak.devam')}
            onPress={() => {
              router.back();
            }}
          />
        </Kart>
      </Ekran>
    );
  }

  return (
    <Ekran kenarlar={['left', 'right', 'bottom']} klavye>
      <View className="gap-1">
        <Metin varyant="baslik" accessibilityRole="header">
          {baslik}
        </Metin>
        {!tek ? <Metin varyant="ikincil">{t('mobil.yoklama.varsayilanAciklama')}</Metin> : null}
      </View>
      {kat.isPending ? <Yukleniyor /> : null}
      {kat.isError && !kat.data ? (
        <HataDurumu mesaj={hataMesaji(kat.error)} tekrar={() => void kat.refetch()} />
      ) : null}
      {kat.data?.length === 0 ? (
        <BosDurum ikon="calendar-outline" mesaj={t('mobil.yoklama.ogrenciYok')} />
      ) : null}
      {kat.data?.map((k) => {
        const s = secimler[k.ogrenciId] ?? { durum: 'geldi' as const };
        return (
          <Kart key={k.ogrenciId} className="gap-3" testID={`yoklama-satir-${k.ogrenciId}`}>
            <Metin varyant="altBaslik">{k.ad || t('mobil.ogrenciler.adsiz')}</Metin>
            <Secici
              secenekler={DURUMLAR.map((d) => ({
                deger: d,
                etiket: durumEtiketi(d),
                erisilebilirlikEtiketi: t('mobil.yoklama.durumEtiketi', {
                  ad: k.ad,
                  durum: durumEtiketi(d),
                }),
              }))}
              deger={s.durum}
              onDegis={(d) => {
                setDegisen((o) => ({
                  ...o,
                  [k.ogrenciId]: { durum: d, ...(d === 'gec' ? { gecDakika: '10' } : {}) },
                }));
              }}
            />
            {s.durum === 'gec' ? (
              <MetinGirdisi
                etiket={t('mobil.yoklama.gecDakika')}
                value={s.gecDakika ?? ''}
                keyboardType="number-pad"
                maxLength={3}
                onChangeText={(v) => {
                  setDegisen((o) => ({ ...o, [k.ogrenciId]: { durum: 'gec', gecDakika: v } }));
                }}
                hata={
                  denendi && !gecDakikaGecerliMi(s.gecDakika)
                    ? t('mobil.yoklama.gecDakikaHata')
                    : null
                }
              />
            ) : null}
          </Kart>
        );
      })}
      {kat.data && kat.data.length > 0 ? (
        <>
          <MetinGirdisi
            etiket={t('mobil.yoklama.not')}
            value={not}
            onChangeText={setNot}
            maxLength={500}
            multiline
          />
          <Anahtar
            etiket={t('mobil.yoklama.ogrenciye')}
            aciklama={ogrenciyeGorunsun ? undefined : t('mobil.yoklama.ozel')}
            deger={ogrenciyeGorunsun}
            onDegis={setOgrenciyeGorunsun}
          />
          {denendi && hatali ? (
            <Metin varyant="ikincil" className="text-hata" accessibilityLiveRegion="polite">
              {t('mobil.yoklama.gecDakikaHata')}
            </Metin>
          ) : null}
          <Dugme buyuk etiket={t('mobil.yoklama.kaydet')} onPress={kaydet} />
        </>
      ) : null}
    </Ekran>
  );
}
