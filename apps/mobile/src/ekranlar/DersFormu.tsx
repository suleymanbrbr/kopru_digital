import { t, type MessageKey } from '@kopru/i18n';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { View } from 'react-native';

import type { CakisanDers, DersOlusturSonucu } from '../api/operasyonTipleri';
import { apiHatasiMi } from '../api/tipler';
import { useHareketAzalt } from '../hooks/useHareketAzalt';
import { cakisanDersleriOku, hatirla, hatirlananiOku } from '../lib/cakisma';
import { bugunTarihi, saatGecerliMi, tarihEkle, tarihGecerliMi } from '../lib/saat';
import { Anahtar } from '../ui/Anahtar';
import { Dugme } from '../ui/Dugme';
import { HataDurumu, Yukleniyor } from '../ui/Durumlar';
import { Ekran, type KaydirmaOgesi } from '../ui/Ekran';
import { Kart } from '../ui/Kart';
import { Metin } from '../ui/Metin';
import { MetinGirdisi } from '../ui/MetinGirdisi';
import { Secici } from '../ui/Secici';
import { useServisler } from '../uygulama/baglam';
import { hataMesaji } from '../uygulama/hatalar';
import { grupEtiketi, useGruplar, useSaatDilimi } from '../uygulama/operasyon';
import { CakismaOnayi } from './CakismaOnayi';

/** Saat alani: sabit genislik (NativeWind `w-28` bu olcekte tanimli degildi); buyuk yazida da `16:00` sigar. */
const SAAT_KUTUSU = { width: 132, flexShrink: 0 } as const;

const SON_GRUP = 'kopru.ders.sonGrup';
const SON_SAAT = 'kopru.ders.sonSaat';
const SON_SURE = 'kopru.ders.sonSure';
const SON_BRANS = 'kopru.ders.sonBrans';

const BRANSLAR = [
  'matematik',
  'geometri',
  'fizik',
  'kimya',
  'biyoloji',
  'fen_bilimleri',
  'turkce',
  'edebiyat',
  'tarih',
  'inkilap_tarihi',
  'cografya',
  'sosyal_bilgiler',
  'felsefe',
  'din_kulturu',
  'ingilizce',
  'almanca',
  'diger',
] as const;

interface Props {
  /** Baslangic gunu (`YYYY-MM-DD`); verilmezse bugun. */
  tarih?: string;
}

/**
 * Yeni ders. Tekrarlayan ders 4 dokunusta: "+" -> ogrenci/grup sec -> (her hafta tekrar varsayilan
 * acik, gun/saat/sure dolu) -> kaydet. Brans yalniz api isterse (`brans_gerekli`) sorulur ve
 * secim hatirlanir. Ogretmen cakismasi onayla `cakisma_onayli: true` ile yazilir.
 */
export function DersFormu({ tarih }: Props) {
  const router = useRouter();
  const qc = useQueryClient();
  const { adaptorler } = useServisler();
  const { tz } = useSaatDilimi();
  const gruplar = useGruplar();

  const [grupId, setGrupId] = useState<string | null>(hatirlananiOku(SON_GRUP));
  const [gun, setGun] = useState(tarih ?? bugunTarihi(tz));
  const [saat, setSaat] = useState(hatirlananiOku(SON_SAAT) ?? '16:00');
  const [sure, setSure] = useState(hatirlananiOku(SON_SURE) ?? '60');
  const [haftalik, setHaftalik] = useState(true);
  const [bitis, setBitis] = useState('');
  const [baslik, setBaslik] = useState('');
  const [baglanti, setBaglanti] = useState('');
  const [yer, setYer] = useState('');
  const [brans, setBrans] = useState<string | null>(null);
  const [bransSor, setBransSor] = useState(false);
  const kaydirmaRef = useRef<KaydirmaOgesi>(null);
  const azalt = useHareketAzalt();
  const [gonderildi, setGonderildi] = useState(false);
  const [cakisanlar, setCakisanlar] = useState<CakisanDers[] | null>(null);
  const [sonuc, setSonuc] = useState<DersOlusturSonucu | null>(null);

  const hatalar = {
    kime: grupId ? null : t('mobil.ders.kimeHata'),
    gun: tarihGecerliMi(gun) ? null : t('mobil.ders.tarihHata'),
    saat: saatGecerliMi(saat) ? null : t('mobil.ders.saatHata'),
    sure:
      /^\d+$/.test(sure) && Number(sure) >= 10 && Number(sure) <= 480
        ? null
        : t('mobil.ders.sureHata'),
    bitis:
      haftalik && bitis !== '' && (!tarihGecerliMi(bitis) || bitis < gun)
        ? tarihGecerliMi(bitis)
          ? t('mobil.ders.bitisHata')
          : t('mobil.ders.tarihHata')
        : null,
  };
  const gecerli = Object.values(hatalar).every((h) => h === null);

  const kaydet = useMutation({
    networkMode: 'always',
    mutationFn: (cakismaOnayli: boolean) =>
      adaptorler.ders.dersOlustur({
        grupId: grupId ?? '',
        tarih: gun,
        saat,
        sureDk: Number(sure),
        haftalik,
        cakismaOnayli,
        ...(haftalik && bitis ? { bitisTarihi: bitis } : {}),
        ...(brans ? { bransKodu: brans } : {}),
        ...(baslik.trim() ? { baslik: baslik.trim() } : {}),
        ...(baglanti.trim() ? { onlineBaglanti: baglanti.trim() } : {}),
        ...(yer.trim() ? { yer: yer.trim() } : {}),
      }),
    onSuccess: (s) => {
      if (grupId) hatirla(SON_GRUP, grupId);
      hatirla(SON_SAAT, saat);
      hatirla(SON_SURE, sure);
      if (brans) hatirla(SON_BRANS, brans);
      void qc.invalidateQueries({ queryKey: ['dersler'] });
      void qc.invalidateQueries({ queryKey: ['yoklama-bekleyen'] });
      setCakisanlar(null);
      if (s.ogrenciCakismasi || s.atlanan > 0) setSonuc(s);
      else router.back();
    },
    onError: (e) => {
      const c = cakisanDersleriOku(e);
      if (c) {
        setCakisanlar(c);
        return;
      }
      if (apiHatasiMi(e) && e.ayrinti === 'brans_gerekli') {
        setBrans((b) => b ?? hatirlananiOku(SON_BRANS));
        setBransSor(true);
      }
    },
  });

  // `brans_gerekli` hata degil, bir sorudur: kullaniciya hata metni gosterilmez.
  const bransHatasi =
    kaydet.isError && apiHatasiMi(kaydet.error) && kaydet.error.ayrinti === 'brans_gerekli';

  function gonder(onayli: boolean) {
    setGonderildi(true);
    if (!gecerli) return;
    kaydet.mutate(onayli);
  }

  if (sonuc) {
    return (
      <Ekran kenarlar={['left', 'right']}>
        <Kart className="gap-3" accessibilityLiveRegion="polite">
          <Metin varyant="altBaslik">
            {t('mobil.ders.olusturuldu', { n: sonuc.dersler.length })}
          </Metin>
          {sonuc.atlanan > 0 ? (
            <Metin varyant="ikincil">{t('mobil.ders.atlanan', { n: sonuc.atlanan })}</Metin>
          ) : null}
          {sonuc.ogrenciCakismasi ? (
            <Metin varyant="ikincil" className="text-uyari">
              {t('mobil.ders.ogrenciCakisma')}
            </Metin>
          ) : null}
          <Dugme
            etiket={t('mobil.ders.kapat')}
            onPress={() => {
              router.back();
            }}
          />
        </Kart>
      </Ekran>
    );
  }

  const secenekler =
    gruplar.data?.map((g) => ({
      deger: g.id,
      etiket: `${grupEtiketi(g)} · ${g.tur === 'birebir' ? t('mobil.ders.birebir') : t('mobil.ders.grup')}`,
    })) ?? [];

  return (
    <Ekran kenarlar={['left', 'right', 'bottom']} klavye kaydirmaRef={kaydirmaRef}>
      <View className="gap-3">
        <Metin varyant="altBaslik" accessibilityRole="header">
          {t('mobil.ders.kime')}
        </Metin>
        {gruplar.isPending ? <Yukleniyor /> : null}
        {gruplar.isError && !gruplar.data ? (
          <HataDurumu
            mesaj={t('mobil.ders.kimeYuklenemedi')}
            tekrar={() => void gruplar.refetch()}
          />
        ) : null}
        {gruplar.data?.length === 0 ? (
          <Metin varyant="ikincil">{t('mobil.ders.kimeYok')}</Metin>
        ) : null}
        {secenekler.length > 0 ? (
          <Secici
            dikey
            secenekler={secenekler}
            deger={grupId}
            onDegis={(g) => {
              setGrupId(g);
            }}
          />
        ) : null}
        {gonderildi && hatalar.kime ? (
          <Metin varyant="ikincil" className="text-hata">
            {hatalar.kime}
          </Metin>
        ) : null}
      </View>

      <View className="flex-row gap-3">
        <View className="flex-1">
          <MetinGirdisi
            etiket={t('mobil.ders.gun')}
            value={gun}
            onChangeText={setGun}
            placeholder={t('mobil.ders.gunIpucu')}
            keyboardType="numbers-and-punctuation"
            autoCapitalize="none"
            hata={gonderildi ? hatalar.gun : null}
          />
        </View>
        <View style={SAAT_KUTUSU}>
          <MetinGirdisi
            etiket={t('mobil.ders.saat')}
            value={saat}
            onChangeText={setSaat}
            placeholder={t('mobil.ders.saatIpucu')}
            keyboardType="numbers-and-punctuation"
            autoCapitalize="none"
            hata={gonderildi ? hatalar.saat : null}
          />
        </View>
      </View>
      <View className="flex-row flex-wrap gap-2">
        <Dugme
          varyant="ikincil"
          etiket={t('mobil.ders.bugunButon')}
          onPress={() => {
            setGun(bugunTarihi(tz));
          }}
        />
        <Dugme
          varyant="ikincil"
          etiket="+1"
          accessibilityLabel={t('mobil.ders.yeniGun')}
          onPress={() => {
            setGun((g) => (tarihGecerliMi(g) ? tarihEkle(g, 1) : bugunTarihi(tz)));
          }}
        />
      </View>
      <MetinGirdisi
        etiket={t('mobil.ders.sure')}
        value={sure}
        onChangeText={setSure}
        keyboardType="number-pad"
        hata={gonderildi ? hatalar.sure : null}
      />

      <Anahtar
        etiket={t('mobil.ders.tekrar')}
        aciklama={t('mobil.ders.tekrarAciklama')}
        deger={haftalik}
        onDegis={setHaftalik}
      />
      {haftalik ? (
        <MetinGirdisi
          etiket={t('mobil.ders.bitis')}
          value={bitis}
          onChangeText={setBitis}
          placeholder={t('mobil.ders.gunIpucu')}
          keyboardType="numbers-and-punctuation"
          autoCapitalize="none"
          hata={gonderildi ? hatalar.bitis : null}
        />
      ) : null}
      {haftalik ? <Metin varyant="kucuk">{t('mobil.ders.bitisAciklama')}</Metin> : null}

      <MetinGirdisi
        etiket={t('mobil.ders.baslikAlani')}
        value={baslik}
        onChangeText={setBaslik}
        maxLength={200}
      />
      <MetinGirdisi
        etiket={t('mobil.ders.cevrimiciBaglanti')}
        value={baglanti}
        onChangeText={setBaglanti}
        keyboardType="url"
        autoCapitalize="none"
        autoCorrect={false}
      />
      <MetinGirdisi
        etiket={t('mobil.ders.konum')}
        value={yer}
        onChangeText={setYer}
        maxLength={500}
      />

      {bransSor ? (
        <Kart
          className="gap-3 border-uyari"
          testID="brans-sor"
          onLayout={(e) => {
            // Branş sorusu acilinca kaydet dugmesinin ustunde gorunecek sekilde kaydirilir.
            kaydirmaRef.current?.scrollTo({
              y: Math.max(e.nativeEvent.layout.y - 16, 0),
              animated: !azalt,
            });
          }}
        >
          <Metin varyant="altBaslik" accessibilityRole="header">
            {t('mobil.ders.bransBaslik')}
          </Metin>
          <Metin varyant="ikincil">{t('mobil.ders.bransAciklama')}</Metin>
          <Secici
            secenekler={BRANSLAR.map((b) => ({
              deger: b,
              etiket: t(`mobil.brans.${b}` as MessageKey),
            }))}
            deger={(brans as (typeof BRANSLAR)[number] | null) ?? null}
            onDegis={(b) => {
              setBrans(b);
              // Eski `brans_gerekli` hatasi sifirlanir; yeni secimle yeniden denenir.
              kaydet.reset();
            }}
          />
        </Kart>
      ) : null}

      {cakisanlar ? (
        <CakismaOnayi
          cakisanlar={cakisanlar}
          tz={tz}
          onayEtiketi={t('mobil.ders.cakismaYine')}
          mesgul={kaydet.isPending}
          onayla={() => {
            gonder(true);
          }}
          vazgec={() => {
            setCakisanlar(null);
          }}
        />
      ) : null}

      {kaydet.isError && !cakisanlar && !bransHatasi ? (
        <Metin varyant="ikincil" className="text-hata" accessibilityLiveRegion="polite">
          {hataMesaji(kaydet.error)}
        </Metin>
      ) : null}

      <Dugme
        buyuk
        etiket={haftalik ? t('mobil.ders.kaydetSeri') : t('mobil.ders.kaydet')}
        yukleniyor={kaydet.isPending}
        disabled={bransSor && !brans}
        onPress={() => {
          gonder(false);
        }}
      />
    </Ekran>
  );
}
