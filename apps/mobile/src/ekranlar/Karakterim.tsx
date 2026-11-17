import { t, type MessageKey } from '@kopru/i18n';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';

import { tarihGoster } from '../lib/zaman';
import { Dugme } from '../ui/Dugme';
import { BosDurum, HataDurumu, Yukleniyor } from '../ui/Durumlar';
import { Ekran } from '../ui/Ekran';
import { Kart } from '../ui/Kart';
import { Metin } from '../ui/Metin';
import { MetinGirdisi } from '../ui/MetinGirdisi';
import { useAktif, useServisler } from '../uygulama/baglam';
import { hataMesaji } from '../uygulama/hatalar';
import {
  useBenim,
  useKarakterDetayi,
  useKarakterIslemleri,
  useKozmetikler,
  useKusanIslemi,
  useOdakDurumu,
  useSeri,
  useVitrin,
} from '../uygulama/motivasyon';
import { CevrimdisiSerit } from './CevrimdisiSerit';
import { BeceriRadari } from './motivasyon/BeceriRadari';
import { KarakterSahnesi, SeviyeCubugu } from './motivasyon/KarakterSahnesi';
import { KarakterSecimi } from './motivasyon/KarakterSecimi';
import { KozmetikDolabi } from './motivasyon/KozmetikDolabi';
import { RozetBolumu } from './motivasyon/RozetBolumu';
import { SeriBolumu } from './motivasyon/SeriBolumu';

/** XP hareketinin kural adi (bilinmeyen kod okunur hale getirilir). */
export function kuralAdi(kod: string): string {
  const anahtar = `mobil.motivasyon.kural.${kod}` as MessageKey;
  const ad = t(anahtar);
  if (ad !== anahtar) return ad;
  const duz = kod.replace(/_/g, ' ');
  return duz.charAt(0).toLocaleUpperCase('tr') + duz.slice(1);
}

function AdDegistir({ mevcut, bitti }: { mevcut: string; bitti: () => void }) {
  const { ad } = useKarakterIslemleri();
  const [deger, setDeger] = useState(mevcut);
  const [hata, setHata] = useState<string | null>(null);
  async function kaydet() {
    setHata(null);
    try {
      await ad.mutateAsync(deger.trim());
      bitti();
    } catch (e) {
      setHata(hataMesaji(e));
    }
  }
  return (
    <View className="gap-2 self-stretch" testID="ad-degistir">
      <MetinGirdisi
        etiket={t('mobil.motivasyon.secim.adEtiketi')}
        value={deger}
        onChangeText={(v) => {
          setDeger(v);
          setHata(null);
        }}
        maxLength={24}
        autoCorrect={false}
        hata={hata}
        testID="ad-degistir-girdi"
      />
      <View className="flex-row gap-2">
        <Dugme className="flex-1" varyant="ikincil" etiket={t('ortak.iptal')} onPress={bitti} />
        <Dugme
          className="flex-1"
          etiket={t('ortak.kaydet')}
          disabled={deger.trim().length === 0 || deger.trim() === mevcut}
          yukleniyor={ad.isPending}
          onPress={() => void kaydet()}
          testID="ad-kaydet"
        />
      </View>
    </View>
  );
}

function SonHareketler() {
  const benim = useBenim();
  const liste = benim.data?.son_hareketler ?? [];
  return (
    <View className="gap-2" testID="son-hareketler">
      {liste.length === 0 ? (
        <Metin varyant="ikincil">{t('mobil.motivasyon.hareket.bos')}</Metin>
      ) : null}
      {liste.slice(0, 8).map((h) => (
        <View
          key={h.id}
          className="min-h-dokunma flex-row items-center justify-between gap-3 border-b border-kenar py-2"
          accessible
          accessibilityLabel={`${kuralAdi(h.kural_kodu)}, ${h.xp > 0 ? '+' : ''}${String(h.xp)} XP, ${tarihGoster(h.created_at)}`}
        >
          <View className="flex-1">
            <Metin varyant="etiket">{kuralAdi(h.kural_kodu)}</Metin>
            <Metin varyant="kucuk">
              {tarihGoster(h.created_at)}
              {h.kismi ? ` · ${t('mobil.motivasyon.hareket.kismi')}` : ''}
            </Metin>
          </View>
          <Metin varyant="altBaslik">
            {h.xp > 0 ? '+' : ''}
            {h.xp} XP
          </Metin>
        </View>
      ))}
    </View>
  );
}

function AldigimYildizlar({ ogrenciId }: { ogrenciId: string }) {
  const { adaptorler } = useServisler();
  const uyelikId = useAktif()?.uyelik.uyelikId;
  const q = useQuery({
    queryKey: ['motivasyon', uyelikId, 'yildizlarim', ogrenciId],
    queryFn: () => adaptorler.motivasyon.yildizAldiklari(ogrenciId),
    enabled: !!uyelikId,
  });
  const liste = q.data ?? [];
  return (
    <View className="gap-2" testID="yildizlarim">
      {q.isPending ? <Yukleniyor /> : null}
      {q.data && liste.length === 0 ? (
        <BosDurum ikon="sparkles" mesaj={t('mobil.motivasyon.yildiz.bos')} />
      ) : null}
      {liste.map((y) => (
        <View
          key={y.id}
          className="gap-1 rounded-orta bg-yuzeyIkincil p-3"
          accessible
          accessibilityLabel={`${t('mobil.motivasyon.yildiz.hafta', { tarih: tarihGoster(y.hafta_baslangic) })}${y.gerekce ? `. ${y.gerekce}` : ''}`}
        >
          <Metin varyant="etiket">
            {t('mobil.motivasyon.yildiz.hafta', { tarih: tarihGoster(y.hafta_baslangic) })}
          </Metin>
          {y.gerekce ? <Metin>{y.gerekce}</Metin> : null}
        </View>
      ))}
    </View>
  );
}

/**
 * Karakterim (yuva) sekmesi: karakter, seviye ilerlemesi, beceri besgeni, seri ve takvim, rozetler,
 * kostum dolabi, son XP hareketleri ve haftanin yildizlari. Karakter yoksa secim acilir.
 */
export function Karakterim() {
  const benim = useBenim();
  const seri = useSeri();
  const karakter = useKarakterDetayi();
  const kozmetikler = useKozmetikler();
  const kusan = useKusanIslemi();
  const vitrin = useVitrin();
  const odak = useOdakDurumu();
  const [adMod, setAdMod] = useState(false);
  const [turMod, setTurMod] = useState(false);
  const d = benim.data;
  const k = karakter.data;

  return (
    <Ekran ust={<CevrimdisiSerit />} kenarlar={['top', 'left', 'right']}>
      <Metin varyant="baslik" accessibilityRole="header">
        {t('mobil.karakterim.baslik')}
      </Metin>
      {benim.isPending ? <Yukleniyor /> : null}
      {benim.isError && !d ? (
        <HataDurumu mesaj={hataMesaji(benim.error)} tekrar={() => void benim.refetch()} />
      ) : null}
      {d?.karakter === null ? (
        <Kart>
          <KarakterSecimi mod="ilk" bitti={() => undefined} />
        </Kart>
      ) : null}
      {d?.karakter ? (
        <>
          <Kart className="items-center gap-3" testID="karakter-karti">
            <KarakterSahnesi
              durum={d}
              boyut={220}
              odakta={odak.faz === 'calisiyor'}
              kozmetikler={kozmetikler.data}
            />
            <View className="items-center gap-0.5">
              <Metin varyant="altBaslik">{d.karakter.ad}</Metin>
              <Metin varyant="ikincil" className="text-center">
                {k?.tur_adi ?? d.karakter.tur_kodu} · {k?.asama_adi ? `${k.asama_adi} · ` : ''}
                {t('mobil.karakterim.asama', { asama: d.karakter.asama })}
              </Metin>
            </View>
            <SeviyeCubugu durum={d} />
            {d.karakter.sonraki_asama_seviyesi !== null ? (
              <Metin varyant="kucuk" className="text-center">
                {t('mobil.motivasyon.sonrakiAsama', { seviye: d.karakter.sonraki_asama_seviyesi })}
              </Metin>
            ) : null}
            {adMod ? (
              <AdDegistir
                mevcut={d.karakter.ad}
                bitti={() => {
                  setAdMod(false);
                }}
              />
            ) : turMod ? null : (
              <View className="flex-row gap-2 self-stretch">
                <Dugme
                  className="flex-1"
                  varyant="ikincil"
                  etiket={t('mobil.motivasyon.adDegistir')}
                  onPress={() => {
                    setAdMod(true);
                  }}
                  testID="ad-degistir-ac"
                />
                <Dugme
                  className="flex-1"
                  varyant="ikincil"
                  etiket={t('mobil.motivasyon.turDegistir')}
                  disabled={k?.tur_degistirme_hakki === 0}
                  onPress={() => {
                    setTurMod(true);
                  }}
                  testID="tur-degistir-ac"
                />
              </View>
            )}
            {k?.tur_degistirme_hakki === 0 && !turMod && !adMod ? (
              <Metin varyant="kucuk" className="text-center">
                {t('mobil.motivasyon.turHakkiYok')}
              </Metin>
            ) : null}
          </Kart>
          {turMod ? (
            <Kart>
              <KarakterSecimi
                mod="tur"
                mevcutTur={d.karakter.tur_kodu}
                bitti={() => {
                  setTurMod(false);
                }}
                vazgec={() => {
                  setTurMod(false);
                }}
              />
            </Kart>
          ) : null}
          <Kart className="gap-3">
            <Metin varyant="altBaslik" accessibilityRole="header">
              {t('mobil.karakterim.beceriler')}
            </Metin>
            <BeceriRadari beceriler={d.beceriler} />
          </Kart>
          <Kart className="gap-3">
            {seri.isPending ? <Yukleniyor /> : null}
            {seri.isError && !seri.data ? (
              <HataDurumu mesaj={hataMesaji(seri.error)} tekrar={() => void seri.refetch()} />
            ) : null}
            {seri.data ? <SeriBolumu seri={seri.data} /> : null}
          </Kart>
          <Kart className="gap-3">
            <Metin varyant="altBaslik" accessibilityRole="header">
              {t('mobil.motivasyon.rozet.baslik')}
            </Metin>
            <RozetBolumu
              rozetler={d.rozetler}
              vitrin={vitrin.secim}
              vitrinDegistir={vitrin.degistir}
            />
          </Kart>
          <Kart className="gap-3">
            <Metin varyant="altBaslik" accessibilityRole="header">
              {t('mobil.motivasyon.dolap.baslik')}
            </Metin>
            {kozmetikler.isPending ? <Yukleniyor /> : null}
            {kozmetikler.isError && !kozmetikler.data ? (
              <HataDurumu
                mesaj={hataMesaji(kozmetikler.error)}
                tekrar={() => void kozmetikler.refetch()}
              />
            ) : null}
            {kozmetikler.data ? (
              <KozmetikDolabi
                kozmetikler={kozmetikler.data}
                mesgul={kusan.isPending}
                degistir={(slot, kod) => {
                  kusan.mutate({ slot, kod });
                }}
              />
            ) : null}
            {kusan.isError ? (
              <Metin varyant="ikincil" className="text-hata" accessibilityLiveRegion="polite">
                {hataMesaji(kusan.error)}
              </Metin>
            ) : null}
          </Kart>
          <Kart className="gap-3">
            <Metin varyant="altBaslik" accessibilityRole="header">
              {t('mobil.motivasyon.hareket.baslik')}
            </Metin>
            <SonHareketler />
          </Kart>
          <Kart className="gap-3">
            <Metin varyant="altBaslik" accessibilityRole="header">
              {t('mobil.motivasyon.yildiz.baslik')}
            </Metin>
            <AldigimYildizlar ogrenciId={d.ogrenci_id} />
          </Kart>
        </>
      ) : null}
    </Ekran>
  );
}
