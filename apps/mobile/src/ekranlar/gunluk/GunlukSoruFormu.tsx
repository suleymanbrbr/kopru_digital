import { t } from '@kopru/i18n';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Image, View } from 'react-native';

import type { Zorluk } from '../../api/gunlukSoruTipleri';
import { GUNLUK_SORU_EN_FAZLA_FOTOGRAF, ZORLUKLAR } from '../../api/gunlukSoruTipleri';
import { galeridenAl, kameradanAl } from '../../foto/al';
import { fotoHazirla } from '../../foto/hazirla';
import {
  KAYNAK_YOK,
  formDogrula,
  sonSecimOku,
  sonSecimYaz,
  toplamSoru,
  zorlukAdi,
  type KaynakSecimi,
} from '../../gunluk/kurallar';
import { yeniIstekId } from '../../lib/kimlik';
import { bugunTarihi } from '../../lib/saat';
import { bransAdi, bransListesi } from '../../ogrenme/konu';
import { IzinKarti } from '../../soru/parcalar';
import { Cip } from '../../ui/Cip';
import { Dugme } from '../../ui/Dugme';
import { Ekran } from '../../ui/Ekran';
import { Ikon } from '../../ui/Ikon';
import { Kart } from '../../ui/Kart';
import { Metin } from '../../ui/Metin';
import { Secici } from '../../ui/Secici';
import { useAktif, useServisler } from '../../uygulama/baglam';
import { useGunlukKayitlarim, useKayitDuzelt, useSonKullanilanlar } from '../../uygulama/gunluk';
import { hataMesaji } from '../../uygulama/hatalar';
import { useKonular } from '../../uygulama/ogrenme';
import { useSaatDilimi } from '../../uygulama/operasyon';
import { CevrimdisiSerit } from '../CevrimdisiSerit';
import { KonuSecici, type KonuSecimi } from '../KonuSecici';
import { KaynakSecici } from './KaynakSecici';
import { SayiGirisi } from './SayiGirisi';

interface Foto {
  id: string;
  uri: string;
}

export interface GunlukFormParametreleri {
  /** Plan gorevinden gelindiyse: kayit gorevin gerceklesenini de doldurur. */
  planGorevId?: string;
  bransKodu?: string;
  konuId?: string;
  /** Gorevin hedef soru sayisi (yalniz ipucu metni). */
  hedef?: string;
  /** Duzeltilecek (bugunku) kaydin kimligi. */
  duzelt?: string;
}

/**
 * Ogrenci "Soru cozdum" hizli girisi (kalite citasi: 15 saniye). Son ders/konu/zorluk/kaynak
 * cihazda hatirlanir ve sunucunun `son-kullanilanlar` listesiyle desteklenir; tek dokunusla secilir.
 * Kayit `gonderim` yoneticisiyle (kalici kuyruk, `istek_id` idempotent) gonderilir: cevrimdisiyken
 * de girilir, fotograf yukleme hattindan gecer. Duzeltme yalniz cevrimici ve yalniz ayni gun.
 */
export function GunlukSoruFormu({
  planGorevId,
  bransKodu: bransParam,
  konuId: konuParam,
  hedef,
  duzelt,
}: GunlukFormParametreleri) {
  const router = useRouter();
  const { gonderim, yerelDepo, agGozlemcisi } = useServisler();
  const uyelikId = useAktif()?.uyelik.uyelikId ?? '';
  const { tz } = useSaatDilimi();
  const bugun = bugunTarihi(tz);
  const konularSorgu = useKonular();
  const sonlar = useSonKullanilanlar();
  const bugunKayitlari = useGunlukKayitlarim({ gun: bugun }, !!duzelt);
  const duzeltKayit = duzelt
    ? bugunKayitlari.data?.pages.flatMap((s) => s.kayitlar).find((k) => k.id === duzelt)
    : undefined;
  const duzeltme = useKayitDuzelt();

  const [baslangic] = useState(() => sonSecimOku(yerelDepo, uyelikId));
  const [secim, setSecim] = useState<KonuSecimi>({
    bransKodu: bransParam ?? baslangic.bransKodu,
    konuId: konuParam ?? baslangic.konuId,
  });
  const [zorluk, setZorluk] = useState<Zorluk | null>(baslangic.zorluk);
  const [kaynak, setKaynak] = useState<KaynakSecimi>(baslangic.kaynak);
  const [dogru, setDogru] = useState(0);
  const [yanlis, setYanlis] = useState(0);
  const [bos, setBos] = useState(0);
  const [fotolar, setFotolar] = useState<Foto[]>([]);
  const [hazirlaniyor, setHazirlaniyor] = useState(0);
  const [izin, setIzin] = useState(false);
  const [mesaj, setMesaj] = useState<string | null>(null);
  const [mesgul, setMesgul] = useState(false);
  const [denendi, setDenendi] = useState(false);
  const [dokundu, setDokundu] = useState(
    () => !!bransParam || !!konuParam || !!baslangic.bransKodu,
  );
  const [sunucuUygulandi, setSunucuUygulandi] = useState(false);
  const [duzeltUygulandi, setDuzeltUygulandi] = useState(false);

  const konular = konularSorgu.data;
  const konuBul = (id: string | null) => konular?.find((k) => k.id === id);

  // Cihazda hatirlanan secim yoksa sunucunun son kullanilanlarindan on secim (bir kez, ilk veriyle).
  const sonDers = sonlar.data?.dersler[0];
  if (!dokundu && !sunucuUygulandi && !duzelt && sonDers) {
    setSunucuUygulandi(true);
    const k = sonDers.konular[0];
    setSecim({ bransKodu: sonDers.bransKodu, konuId: k?.konuId ?? null });
    if (k) setZorluk(k.sonZorluk);
    const ks = sonDers.kaynaklar[0];
    if (ks?.kaynakTestId && ks.kaynakKitapId) {
      setKaynak({
        tur: 'test',
        kitapId: ks.kaynakKitapId,
        kitapAd: ks.kitapAd ?? '',
        testId: ks.kaynakTestId,
        testAd: ks.testAd ?? '',
      });
    } else if (ks?.kaynakMetin) setKaynak({ tur: 'metin', metin: ks.kaynakMetin });
  }

  // Duzeltme: kaydin mevcut degerleri forma yuklenir (bir kez).
  if (duzeltKayit && !duzeltUygulandi) {
    setDuzeltUygulandi(true);
    setSecim({ bransKodu: duzeltKayit.bransKodu, konuId: duzeltKayit.konuId });
    setZorluk(duzeltKayit.zorluk);
    setDogru(duzeltKayit.dogru);
    setYanlis(duzeltKayit.yanlis);
    setBos(duzeltKayit.bos);
    setKaynak(
      duzeltKayit.kaynakTestId
        ? {
            tur: 'test',
            kitapId: duzeltKayit.kaynakKitapId ?? '',
            kitapAd: '',
            testId: duzeltKayit.kaynakTestId,
            testAd: '',
          }
        : duzeltKayit.kaynakMetin
          ? { tur: 'metin', metin: duzeltKayit.kaynakMetin }
          : KAYNAK_YOK,
    );
  }

  const dersler = useMemo(() => {
    const hepsi = bransListesi(konular ?? []).map((b) => b.kod);
    const son = (sonlar.data?.dersler ?? [])
      .map((d) => d.bransKodu)
      .filter((k) => hepsi.includes(k));
    const secili = secim.bransKodu && hepsi.includes(secim.bransKodu) ? [secim.bransKodu] : [];
    return [...new Set([...secili, ...son, ...hepsi])];
    // Siralama yalniz acilista ve liste yuklenince hesaplanir; secim degisince oynamasin.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [konular, sonlar.data]);

  const dersSon = sonlar.data?.dersler.find((d) => d.bransKodu === secim.bransKodu);
  const hatalar = formDogrula({
    bransKodu: secim.bransKodu,
    konuId: secim.konuId,
    zorluk,
    dogru,
    yanlis,
    bos,
  });
  const toplam = toplamSoru(dogru, yanlis, bos);
  const cevrimdisi = !agGozlemcisi.cevrimiciMi();

  function dersSec(k: string) {
    setDokundu(true);
    if (k === secim.bransKodu) return;
    setSecim({ bransKodu: k, konuId: null });
    setKaynak(KAYNAK_YOK);
  }

  async function foto(sonuc: Awaited<ReturnType<typeof kameradanAl>>) {
    setMesaj(null);
    if (sonuc.durum === 'izin') {
      setIzin(true);
      return;
    }
    if (sonuc.durum === 'yok') {
      setMesaj(t('mobil.gunluk.form.kameraYok'));
      return;
    }
    if (sonuc.durum !== 'tamam') return;
    setIzin(false);
    const yer = Math.max(0, GUNLUK_SORU_EN_FAZLA_FOTOGRAF - fotolar.length);
    const alinan = sonuc.fotograflar.slice(0, yer);
    setHazirlaniyor((n) => n + alinan.length);
    for (const f of alinan) {
      try {
        const h = await fotoHazirla(f.uri, { genislik: f.genislik, yukseklik: f.yukseklik });
        setFotolar((l) => [...l, { id: yeniIstekId(), uri: h.uri }]);
      } catch {
        setMesaj(t('mobil.gunluk.form.fotoHatasi'));
      } finally {
        setHazirlaniyor((n) => n - 1);
      }
    }
  }

  async function kaydet() {
    setDenendi(true);
    setMesaj(null);
    if (Object.keys(hatalar).length > 0 || !secim.bransKodu || !secim.konuId || !zorluk) return;
    if (hazirlaniyor > 0) return;
    setMesgul(true);
    try {
      const testId = kaynak.tur === 'test' ? kaynak.testId : undefined;
      const metin = kaynak.tur === 'metin' && kaynak.metin.trim() ? kaynak.metin.trim() : undefined;
      if (duzelt) {
        await duzeltme.mutateAsync({
          id: duzelt,
          girdi: {
            bransKodu: secim.bransKodu,
            konuId: secim.konuId,
            zorluk,
            kaynakTestId: testId ?? null,
            kaynakMetin: metin ?? null,
            dogru,
            yanlis,
            bos,
            ...(duzeltKayit ? { surum: duzeltKayit.surum } : {}),
          },
        });
        router.back();
        return;
      }
      const dosyalar: Parameters<typeof gonderim.baslat>[0]['dosyalar'] = {};
      fotolar.forEach((f, i) => {
        dosyalar[`f${String(i)}`] = {
          tur: 'gunluk_soru_fotografi',
          mimeTipi: 'image/jpeg',
          yerelUri: f.uri,
        };
      });
      sonSecimYaz(yerelDepo, uyelikId, {
        bransKodu: secim.bransKodu,
        konuId: secim.konuId,
        zorluk,
        kaynak: kaynak.tur === 'metin' && !metin ? KAYNAK_YOK : kaynak,
      });
      await gonderim.baslat({
        tur: 'gunluk_soru',
        baslik: konuBul(secim.konuId)?.ad ?? bransAdi(secim.bransKodu),
        govde: {
          tur: 'gunluk_soru',
          // Giris gunu: cevrimdisi girilen kayit gec gonderilse de gununde kalir.
          gun: bugun,
          bransKodu: secim.bransKodu,
          konuId: secim.konuId,
          zorluk,
          ...(testId ? { kaynakTestId: testId } : {}),
          ...(metin ? { kaynakMetin: metin } : {}),
          dogru,
          yanlis,
          bos,
          ...(planGorevId ? { planGorevId } : {}),
          fotograflar: fotolar.map((_, i) => `f${String(i)}`),
        },
        dosyalar,
      });
      if (router.canGoBack()) router.back();
      else router.replace('/(uygulama)/(sekmeler)/bugun');
    } catch (e) {
      setMesaj(hataMesaji(e));
      setMesgul(false);
    }
  }

  const ozet = [
    konuBul(secim.konuId)?.ad,
    zorluk ? zorlukAdi(zorluk) : null,
    t('mobil.gunluk.form.ozetSayilar', { dogru, yanlis, bos }),
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Ekran klavye kenarlar={['left', 'right', 'bottom']} ust={<CevrimdisiSerit />}>
      {planGorevId ? (
        <Kart className="flex-row items-center gap-3" testID="gunluk-gorev-bilgisi">
          <Ikon ad="flag-outline" boyut={20} />
          <Metin varyant="etiket" className="flex-1">
            {hedef
              ? t('mobil.gunluk.form.gorevHedefli', { soru: hedef })
              : t('mobil.gunluk.form.gorevBaglantisi')}
          </Metin>
        </Kart>
      ) : null}
      {duzelt ? (
        <Kart className="flex-row items-center gap-3" testID="gunluk-duzeltme-bilgisi">
          <Ikon ad="create-outline" boyut={20} />
          <Metin varyant="etiket" className="flex-1">
            {t('mobil.gunluk.form.duzeltmeBilgisi')}
          </Metin>
        </Kart>
      ) : null}

      <View className="gap-2">
        <Metin varyant="etiket" accessibilityRole="header">
          {t('mobil.gunluk.form.ders')}
        </Metin>
        <View
          className="flex-row flex-wrap gap-2"
          accessibilityRole="radiogroup"
          testID="ders-ciplari"
        >
          {dersler.map((k) => (
            <Cip
              key={k}
              etiket={bransAdi(k)}
              secili={secim.bransKodu === k}
              testID={`ders-${k}`}
              onPress={() => {
                dersSec(k);
              }}
            />
          ))}
        </View>
        {denendi && hatalar.ders ? (
          <Metin varyant="ikincil" className="text-hata" accessibilityRole="alert">
            {t('mobil.gunluk.form.dersGerekli')}
          </Metin>
        ) : null}
      </View>

      <View className="gap-2">
        {dersSon && dersSon.konular.length > 0 ? (
          <View className="gap-2" testID="son-konular-ciplari">
            <Metin varyant="kucuk">{t('mobil.gunluk.form.sonKonular')}</Metin>
            <View className="flex-row flex-wrap gap-2">
              {dersSon.konular.map((k) => (
                <Cip
                  key={k.konuId}
                  etiket={k.konuAd ?? ''}
                  secili={secim.konuId === k.konuId}
                  testID={`son-konu-${k.konuId}`}
                  onPress={() => {
                    setDokundu(true);
                    setSecim({ bransKodu: dersSon.bransKodu, konuId: k.konuId });
                    setZorluk(k.sonZorluk);
                  }}
                />
              ))}
            </View>
          </View>
        ) : null}
        <KonuSecici
          key={secim.bransKodu ?? 'tum'}
          deger={secim}
          onDegis={(v) => {
            setDokundu(true);
            setSecim(v);
          }}
          etiket={t('mobil.gunluk.form.konu')}
          yalnizDers={false}
          baslangicBrans={secim.bransKodu}
        />
        {denendi && hatalar.konu ? (
          <Metin varyant="ikincil" className="text-hata" accessibilityRole="alert">
            {t('mobil.gunluk.form.konuGerekli')}
          </Metin>
        ) : null}
      </View>

      <View className="gap-1">
        <Secici
          baslik={t('mobil.gunluk.form.zorluk')}
          secenekler={ZORLUKLAR.map((z) => ({ deger: z, etiket: zorlukAdi(z) }))}
          deger={zorluk}
          onDegis={(z) => {
            setDokundu(true);
            setZorluk(z);
          }}
        />
        {denendi && hatalar.zorluk ? (
          <Metin varyant="ikincil" className="text-hata" accessibilityRole="alert">
            {t('mobil.gunluk.form.zorlukGerekli')}
          </Metin>
        ) : null}
      </View>

      {/* Sayilar kaynaktan once: 15 sn citasi icin D/Y/B kaydirmadan gorunur (kaynak hatirlanir). */}
      <Kart className="gap-4" testID="gunluk-sayilar">
        <SayiGirisi tur="dogru" deger={dogru} onDegis={setDogru} />
        <SayiGirisi tur="yanlis" deger={yanlis} onDegis={setYanlis} />
        <SayiGirisi tur="bos" deger={bos} onDegis={setBos} />
        <View
          className="flex-row items-center justify-between border-t border-kenar pt-3"
          accessible
          accessibilityLiveRegion="polite"
          accessibilityLabel={t('mobil.gunluk.form.toplamEtiketi', { n: toplam })}
        >
          <Metin varyant="etiket">{t('mobil.gunluk.form.toplam')}</Metin>
          <Metin varyant="altBaslik" testID="gunluk-toplam">
            {t('mobil.gunluk.form.toplamSoru', { n: toplam })}
          </Metin>
        </View>
        {denendi && hatalar.toplam ? (
          <Metin varyant="ikincil" className="text-hata" accessibilityRole="alert">
            {hatalar.toplam === 'bos'
              ? t('mobil.gunluk.form.toplamBos')
              : t('gunlukSoru.hata.soru_toplami_gecersiz')}
          </Metin>
        ) : null}
      </Kart>

      <KaynakSecici
        key={`kaynak-${secim.bransKodu ?? ''}`}
        bransKodu={secim.bransKodu}
        deger={kaynak}
        onDegis={setKaynak}
        sonlar={dersSon?.kaynaklar ?? []}
      />

      {!duzelt ? (
        <View className="gap-2" testID="gunluk-foto">
          <Metin varyant="etiket" accessibilityRole="header">
            {t('mobil.gunluk.form.fotograf', {
              n: fotolar.length,
              en: GUNLUK_SORU_EN_FAZLA_FOTOGRAF,
            })}
          </Metin>
          <Metin varyant="kucuk">{t('mobil.gunluk.form.fotografIpucu')}</Metin>
          {fotolar.length > 0 || hazirlaniyor > 0 ? (
            <View className="flex-row flex-wrap gap-2">
              {fotolar.map((f, i) => (
                <View key={f.id} className="gap-1" testID={`gunluk-foto-${String(i)}`}>
                  <Image
                    source={{ uri: f.uri }}
                    accessibilityLabel={t('mobil.gunluk.form.fotoEtiketi', { n: i + 1 })}
                    className="rounded-orta bg-yuzeyIkincil"
                    style={{ width: 96, height: 96 }}
                  />
                  <Dugme
                    varyant="ikincil"
                    etiket={t('mobil.gunluk.form.fotoSil')}
                    accessibilityLabel={`${t('mobil.gunluk.form.fotoSil')}: ${t('mobil.gunluk.form.fotoEtiketi', { n: i + 1 })}`}
                    onPress={() => {
                      setFotolar((l) => l.filter((x) => x.id !== f.id));
                    }}
                  />
                </View>
              ))}
              {hazirlaniyor > 0 ? (
                <View
                  className="items-center justify-center rounded-orta bg-yuzeyIkincil"
                  style={{ width: 96, height: 96 }}
                >
                  <ActivityIndicator />
                </View>
              ) : null}
            </View>
          ) : null}
          {fotolar.length + hazirlaniyor < GUNLUK_SORU_EN_FAZLA_FOTOGRAF ? (
            <View className="flex-row gap-2">
              <Dugme
                className="flex-1"
                varyant="ikincil"
                etiket={t('mobil.gunluk.form.kameraIleCek')}
                testID="gunluk-foto-kamera"
                onPress={() => {
                  void kameradanAl().then(foto);
                }}
              />
              <Dugme
                className="flex-1"
                varyant="ikincil"
                etiket={t('mobil.gunluk.form.galeridenSec')}
                testID="gunluk-foto-galeri"
                onPress={() => {
                  void galeridenAl(
                    Math.max(1, GUNLUK_SORU_EN_FAZLA_FOTOGRAF - fotolar.length - hazirlaniyor),
                  ).then(foto);
                }}
              />
            </View>
          ) : null}
          {izin ? (
            <IzinKarti
              tur="kamera"
              kapat={() => {
                setIzin(false);
              }}
            />
          ) : null}
        </View>
      ) : null}

      {mesaj ? (
        <Metin
          varyant="ikincil"
          className="text-hata"
          accessibilityRole="alert"
          testID="gunluk-hata"
        >
          {mesaj}
        </Metin>
      ) : null}
      <Metin varyant="kucuk" testID="gunluk-ozet" accessibilityLiveRegion="polite">
        {ozet}
      </Metin>
      {cevrimdisi && !duzelt ? (
        <Metin varyant="kucuk" testID="gunluk-cevrimdisi-ipucu">
          {t('mobil.gunluk.form.cevrimdisiIpucu')}
        </Metin>
      ) : null}
      <Dugme
        buyuk
        etiket={duzelt ? t('mobil.gunluk.form.guncelle') : t('mobil.gunluk.form.kaydet')}
        yukleniyor={mesgul}
        disabled={hazirlaniyor > 0 || (!!duzelt && !duzeltKayit)}
        onPress={() => void kaydet()}
        testID="gunluk-kaydet"
      />
    </Ekran>
  );
}
