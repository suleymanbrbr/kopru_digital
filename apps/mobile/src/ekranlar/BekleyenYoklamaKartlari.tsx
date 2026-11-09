import { t } from '@kopru/i18n';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import type { BekleyenYoklamaDersi } from '../api/operasyonTipleri';
import { kisaZaman, saatAraligi } from '../lib/saat';
import { yoklamaKuyrugaAl, type YoklamaYuku } from '../offline/yoklama';
import { Dugme } from '../ui/Dugme';
import { BosDurum, HataDurumu, Yukleniyor } from '../ui/Durumlar';
import { Kart } from '../ui/Kart';
import { Metin } from '../ui/Metin';
import { useAktif, useServisler } from '../uygulama/baglam';
import { hataMesaji } from '../uygulama/hatalar';
import {
  dersAdi,
  useGruplar,
  useKuyruk,
  useSaatDilimi,
  useYoklamaBekleyen,
  useYoklamaKatilimcilari,
} from '../uygulama/operasyon';

function Kart1({ ders, ad, tz }: { ders: BekleyenYoklamaDersi; ad: string; tz: string }) {
  const router = useRouter();
  const qc = useQueryClient();
  const { kuyruk } = useServisler();
  const uyelikId = useAktif()?.uyelik.uyelikId;
  // Katilimcilar kart gorununce onbellege alinir: cevrimdisiyken de "Geldi" calisir.
  const kat = useYoklamaKatilimcilari(ders.id);
  const [alindi, setAlindi] = useState(false);
  const birebir = ders.katilimciSayisi === 1 && kat.data?.length === 1;

  function ac() {
    router.push({
      pathname: '/yoklama/[dersId]',
      params: { dersId: ders.id, baslik: ad, baslangic: ders.baslangic },
    });
  }

  function hizliGeldi() {
    const k = kat.data?.[0];
    if (!k) return;
    const yuk: YoklamaYuku = {
      dersId: ders.id,
      dersBaslik: ad,
      dersBaslangic: ders.baslangic,
      // Dokunma ani yakalanir; yeniden denemede degismez.
      satirlar: [
        { ogrenciId: k.ogrenciId, durum: 'geldi', isaretlenmeAt: new Date().toISOString() },
      ],
    };
    yoklamaKuyrugaAl(kuyruk, yuk);
    setAlindi(true);
    qc.setQueryData<BekleyenYoklamaDersi[]>(['yoklama-bekleyen', uyelikId], (eski) =>
      eski?.filter((d) => d.id !== ders.id),
    );
  }

  const zaman = `${kisaZaman(ders.baslangic, tz)}, ${saatAraligi(ders.baslangic, ders.bitis, tz)}`;
  if (alindi) {
    return (
      <Kart className="gap-1" accessibilityLiveRegion="polite" testID={`yoklama-kart-${ders.id}`}>
        <Metin varyant="etiket">{ad}</Metin>
        <Metin varyant="ikincil">{t('mobil.yoklama.alindiMesaj')}</Metin>
      </Kart>
    );
  }
  return (
    <Kart className="gap-3" testID={`yoklama-kart-${ders.id}`}>
      <View
        className="gap-1"
        accessible
        accessibilityLabel={`${ad}, ${zaman}. ${t('mobil.yoklama.eksik', { n: ders.yoklamasiEksikSayisi })}`}
      >
        <Metin varyant="altBaslik">{ad}</Metin>
        <Metin varyant="ikincil">{zaman}</Metin>
        <Metin varyant="kucuk">{t('mobil.yoklama.eksik', { n: ders.yoklamasiEksikSayisi })}</Metin>
      </View>
      <View className="flex-row gap-2">
        {birebir ? (
          <Dugme
            className="flex-1"
            etiket={t('mobil.yoklama.geldi')}
            accessibilityLabel={t('mobil.yoklama.hizliGeldi', { ad })}
            onPress={hizliGeldi}
          />
        ) : null}
        <Dugme
          className="flex-1"
          varyant={birebir ? 'ikincil' : 'birincil'}
          etiket={birebir ? t('mobil.yoklama.diger') : t('mobil.yoklama.kartBaslik')}
          onPress={ac}
        />
      </View>
    </Kart>
  );
}

/**
 * "Yoklama al" kartlari (`GET /yoklama-bekleyen`). Kuyruga alinmis (henuz sunucuya gitmemis)
 * yoklamalarin dersleri listeden cikarilir, bekleyen ders tekrar gorunmez.
 */
export function BekleyenYoklamaKartlari() {
  const sorgu = useYoklamaBekleyen();
  const gruplar = useGruplar();
  const { tz } = useSaatDilimi();
  const { bekleyen } = useKuyruk();
  const kuyrukta = new Set(bekleyen.map((i) => (i.yuk as YoklamaYuku).dersId));
  const liste = (sorgu.data ?? []).filter((d) => !kuyrukta.has(d.id));

  return (
    <Kart className="gap-3" testID="yoklama-bekleyen">
      <Metin varyant="altBaslik" accessibilityRole="header">
        {t('mobil.yoklama.bekleyenBaslik')}
      </Metin>
      {sorgu.isPending ? <Yukleniyor /> : null}
      {sorgu.isError && !sorgu.data ? (
        <HataDurumu mesaj={hataMesaji(sorgu.error)} tekrar={() => void sorgu.refetch()} />
      ) : null}
      {sorgu.data && liste.length === 0 ? (
        <BosDurum ikon="checkmark-circle-outline" mesaj={t('mobil.yoklama.bekleyenBos')} />
      ) : null}
      {liste.map((d) => (
        <Kart1 key={d.id} ders={d} ad={dersAdi(d, gruplar.data)} tz={tz} />
      ))}
    </Kart>
  );
}
