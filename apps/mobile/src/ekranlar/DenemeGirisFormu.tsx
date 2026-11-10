import { t } from '@kopru/i18n';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import type { DenemeBolumGirdisi, DenemeKurali } from '../api/ogrenmeTipleri';
import { bugunTarihi, tarihGecerliMi } from '../lib/saat';
import { bolumKur, netBicimle, yuvarla2, type BolumHatasi } from '../ogrenme/net';
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
import { denemeleriTazele, useDenemeKurallari, useOgrenciDenemeAyari } from '../uygulama/ogrenme';
import { useSaatDilimi } from '../uygulama/operasyon';

interface BolumMetinleri {
  dogru: string;
  yanlis: string;
  bos: string;
}

const BOLUM_HATASI: Record<BolumHatasi, string> = {
  gecersiz: t('mobil.ogrenme.deneme.sayiGecersiz'),
  asim: t('mobil.ogrenme.deneme.toplamAsim'),
  toplam: t('mobil.ogrenme.deneme.toplamTutmuyor'),
};

function BolumKarti({
  bolum,
  deger,
  katsayi,
  denendi,
  onDegis,
}: {
  bolum: DenemeKurali['bolumler'][number];
  deger: BolumMetinleri;
  katsayi: number;
  denendi: boolean;
  onDegis: (v: BolumMetinleri) => void;
}) {
  const sonuc = bolumKur(bolum, deger.dogru, deger.yanlis, deger.bos, katsayi);
  const ad = `${bolum.ad} (${t('mobil.ogrenme.deneme.soruSayisi', { n: bolum.soruSayisi })})`;
  const hata = !sonuc.ok && (denendi || deger.dogru !== '' || deger.yanlis !== '');
  return (
    <Kart className="gap-3" testID={`bolum-${bolum.bolumKodu}`}>
      <Metin varyant="altBaslik">{ad}</Metin>
      <View className="flex-row gap-3">
        <View className="flex-1">
          <MetinGirdisi
            etiket={`${bolum.ad}: ${t('mobil.ogrenme.deneme.dogru')}`}
            placeholder={t('mobil.ogrenme.deneme.dogru')}
            value={deger.dogru}
            keyboardType="number-pad"
            maxLength={3}
            onChangeText={(v) => {
              onDegis({ ...deger, dogru: v });
            }}
          />
        </View>
        <View className="flex-1">
          <MetinGirdisi
            etiket={`${bolum.ad}: ${t('mobil.ogrenme.deneme.yanlis')}`}
            placeholder={t('mobil.ogrenme.deneme.yanlis')}
            value={deger.yanlis}
            keyboardType="number-pad"
            maxLength={3}
            onChangeText={(v) => {
              onDegis({ ...deger, yanlis: v });
            }}
          />
        </View>
        <View className="flex-1">
          <MetinGirdisi
            etiket={`${bolum.ad}: ${t('mobil.ogrenme.deneme.bos')}`}
            placeholder={sonuc.ok ? String(sonuc.bos) : t('mobil.ogrenme.deneme.bos')}
            value={deger.bos}
            keyboardType="number-pad"
            maxLength={3}
            onChangeText={(v) => {
              onDegis({ ...deger, bos: v });
            }}
          />
        </View>
      </View>
      {sonuc.ok ? (
        <Metin
          varyant="etiket"
          testID={`net-${bolum.bolumKodu}`}
          accessibilityLabel={t('mobil.ogrenme.deneme.netOnizlemeEtiketi', {
            bolum: bolum.ad,
            net: netBicimle(sonuc.net),
          })}
        >
          {t('mobil.ogrenme.deneme.netOnizleme', { net: netBicimle(sonuc.net) })}
        </Metin>
      ) : hata ? (
        <Metin varyant="ikincil" className="text-hata" accessibilityLiveRegion="polite">
          {BOLUM_HATASI[sonuc.hata]}
        </Metin>
      ) : null}
    </Kart>
  );
}

/**
 * Deneme sonucu girisi (ogrenci kendi sonucunu, ogretmen tek ogrenci icin). Bolum basina
 * dogru/yanlis/bos; bos yazilmazsa `soru sayisi - dogru - yanlis` hesaplanir ve her bolumun toplami
 * soru sayisina esit olmalidir. Net onizlemesi sunucudaki formulle aynidir. Ogrenci girisi
 * ogretmen onayina duser. Giris baglanti ister; yoksa acik mesaj gosterilir.
 */
export function DenemeGirisFormu({
  ogrenciId,
  ogrenciAd,
}: {
  ogrenciId?: string;
  ogrenciAd?: string;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const { adaptorler } = useServisler();
  const rol = useAktif()?.uyelik.rol;
  const ogrenciMi = rol === 'ogrenci';
  const { tz } = useSaatDilimi();
  const kurallar = useDenemeKurallari();
  const ayar = useOgrenciDenemeAyari();

  const [kuralKodu, setKuralKodu] = useState<string | null>(null);
  const [ad, setAd] = useState('');
  const [tarih, setTarih] = useState(() => bugunTarihi(tz));
  const [yayinevi, setYayinevi] = useState('');
  const [metinler, setMetinler] = useState<Record<string, BolumMetinleri>>({});
  const [denendi, setDenendi] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const [bitti, setBitti] = useState<null | 'onay' | 'kaydedildi'>(null);

  const kural =
    kurallar.data?.find((k) => k.kod === (kuralKodu ?? kurallar.data[0]?.kod)) ?? undefined;
  const bos: BolumMetinleri = { dogru: '', yanlis: '', bos: '' };

  const olustur = useMutation({
    networkMode: 'always',
    mutationFn: (g: Parameters<typeof adaptorler.ogrenme.denemeOlustur>[0]) =>
      adaptorler.ogrenme.denemeOlustur(g),
    onSuccess: () => {
      setHata(null);
      setBitti(ogrenciMi ? 'onay' : 'kaydedildi');
      void denemeleriTazele(qc);
    },
    onError: (e) => {
      setHata(hataMesaji(e));
    },
  });

  if (kurallar.isPending || (ogrenciMi && ayar.isPending)) {
    return (
      <Ekran kenarlar={['left', 'right', 'bottom']}>
        <Yukleniyor />
      </Ekran>
    );
  }
  if (kurallar.isError && !kurallar.data) {
    return (
      <Ekran kenarlar={['left', 'right', 'bottom']}>
        <HataDurumu mesaj={hataMesaji(kurallar.error)} tekrar={() => void kurallar.refetch()} />
      </Ekran>
    );
  }
  if (ogrenciMi && ayar.data === false) {
    return (
      <Ekran kenarlar={['left', 'right', 'bottom']}>
        <BosDurum ikon="sparkles" mesaj={t('mobil.ogrenme.deneme.girisKapali')} />
      </Ekran>
    );
  }
  if (bitti) {
    return (
      <Ekran kenarlar={['left', 'right']}>
        <Kart
          className="items-center gap-3"
          accessibilityLiveRegion="polite"
          testID="deneme-kaydedildi"
        >
          <Ikon ad="checkmark-circle" boyut={40} />
          <Metin varyant="baslik">
            {bitti === 'onay'
              ? t('mobil.ogrenme.deneme.onayaGonderildi')
              : t('mobil.ogrenme.deneme.kaydedildi')}
          </Metin>
          <Metin varyant="ikincil" className="text-center">
            {bitti === 'onay'
              ? t('mobil.ogrenme.deneme.onayaGonderildiMesaj')
              : t('mobil.ogrenme.deneme.kaydedildiMesaj')}
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

  // Bolumlerin net onizlemesi ve dogrulama (gonder ile ayni kural).
  const sonuclar = (kural?.bolumler ?? []).map((b) => {
    const m = metinler[b.bolumKodu] ?? bos;
    return { b, s: bolumKur(b, m.dogru, m.yanlis, m.bos, kural?.yanlisKatsayisi ?? 0) };
  });
  const toplamNet = yuvarla2(sonuclar.reduce((a, x) => a + (x.s.ok ? x.s.net : 0), 0));

  function gonder() {
    setDenendi(true);
    if (!kural) return;
    if (!ad.trim()) {
      setHata(t('mobil.ogrenme.deneme.adGerekli'));
      return;
    }
    if (!tarihGecerliMi(tarih)) {
      setHata(t('mobil.ogrenme.deneme.tarihGecersiz'));
      return;
    }
    const bolumler: DenemeBolumGirdisi[] = [];
    for (const { s } of sonuclar) {
      if (!s.ok) {
        setHata(t('mobil.ogrenme.deneme.bolumlerHatali'));
        return;
      }
      bolumler.push(s.girdi);
    }
    setHata(null);
    olustur.mutate({
      ...(ogrenciMi ? {} : { ogrenciId: ogrenciId ?? '' }),
      kuralKodu: kural.kod,
      ad: ad.trim(),
      ...(yayinevi.trim() ? { yayinevi: yayinevi.trim() } : {}),
      sinavTarihi: tarih,
      bolumler,
    });
  }

  return (
    <Ekran kenarlar={['left', 'right', 'bottom']} klavye>
      <View className="gap-1">
        <Metin varyant="baslik" accessibilityRole="header">
          {t('mobil.ogrenme.deneme.girisBaslik')}
        </Metin>
        {ogrenciAd ? <Metin varyant="ikincil">{ogrenciAd}</Metin> : null}
        {ogrenciMi ? (
          <Metin varyant="kucuk">{t('mobil.ogrenme.deneme.ogrenciOnayNotu')}</Metin>
        ) : null}
      </View>
      {kurallar.data.length > 0 ? (
        <Secici
          baslik={t('mobil.ogrenme.deneme.tur')}
          deger={kural?.kod ?? null}
          onDegis={(k) => {
            setKuralKodu(k);
            setMetinler({});
          }}
          secenekler={kurallar.data.map((k) => ({ deger: k.kod, etiket: k.ad }))}
        />
      ) : (
        <BosDurum ikon="sparkles" mesaj={t('mobil.ogrenme.deneme.kuralYok')} />
      )}
      <MetinGirdisi
        etiket={t('mobil.ogrenme.deneme.ad')}
        value={ad}
        onChangeText={setAd}
        maxLength={200}
        placeholder={t('mobil.ogrenme.deneme.adIpucu')}
      />
      <MetinGirdisi
        etiket={t('mobil.ogrenme.deneme.tarih')}
        value={tarih}
        onChangeText={setTarih}
        maxLength={10}
        keyboardType="numbers-and-punctuation"
        hata={denendi && !tarihGecerliMi(tarih) ? t('mobil.ogrenme.deneme.tarihGecersiz') : null}
      />
      <MetinGirdisi
        etiket={t('mobil.ogrenme.deneme.yayinevi')}
        value={yayinevi}
        onChangeText={setYayinevi}
        maxLength={200}
      />
      {kural ? (
        <>
          <Metin varyant="ikincil">
            {t('mobil.ogrenme.deneme.formulAciklama', {
              katsayi: String(kural.yanlisKatsayisi).replace('.', ','),
            })}
          </Metin>
          {kural.bolumler.map((b) => (
            <BolumKarti
              key={b.bolumKodu}
              bolum={b}
              deger={metinler[b.bolumKodu] ?? bos}
              katsayi={kural.yanlisKatsayisi}
              denendi={denendi}
              onDegis={(v) => {
                setMetinler((m) => ({ ...m, [b.bolumKodu]: v }));
              }}
            />
          ))}
          <Kart className="flex-row items-center justify-between" testID="toplam-net">
            <Metin varyant="altBaslik">{t('mobil.ogrenme.deneme.toplamNet')}</Metin>
            <Metin
              varyant="baslik"
              accessibilityLabel={t('mobil.ogrenme.deneme.toplamNetEtiketi', {
                net: netBicimle(toplamNet),
              })}
            >
              {netBicimle(toplamNet)}
            </Metin>
          </Kart>
        </>
      ) : null}
      {hata ? (
        <Metin varyant="ikincil" className="text-hata" accessibilityLiveRegion="polite">
          {hata}
        </Metin>
      ) : null}
      <Dugme
        buyuk
        etiket={t('mobil.ogrenme.deneme.kaydet')}
        yukleniyor={olustur.isPending}
        disabled={!kural}
        onPress={gonder}
      />
    </Ekran>
  );
}
