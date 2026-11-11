import { t } from '@kopru/i18n';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import type { Odev, OdevSablonu, OdevTuru } from '../api/ogrenmeTipleri';
import { bugunTarihi, tarihEkle, tarihGecerliMi, yerelDenUtc } from '../lib/saat';
import { bransAdi } from '../ogrenme/konu';
import { odevBasligiOner, varsayilanSonTeslim } from '../ogrenme/odev';
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
import { useKonuHaritasi, useOdevSablonlari } from '../uygulama/ogrenme';
import { grupEtiketi, useSaatDilimi } from '../uygulama/operasyon';
import { KONU_SECIMI_BOS, KonuSecici, type KonuSecimi } from './KonuSecici';

type Teslim = '1' | '3' | '7' | 'ozel';
const TURLER: readonly OdevTuru[] = ['soru', 'sayfa', 'serbest'];

/**
 * Odev ver (ogretmen): hedef (grup ya da birebir ogrenci), ders ve konu, tur, teslim tarihi.
 * Varsayilanlar dolu: tur "soru", 20 soru, teslim 3 gun sonra 23:59 (kurum saat dilimi), baslik
 * konudan onerilir. Sablon secilirse ders/konu/tur/sayi dolar. Gonder = olustur + yayinla.
 */
export function OdevVerEkrani() {
  const router = useRouter();
  const qc = useQueryClient();
  const { adaptorler } = useServisler();
  const uyelikId = useAktif()?.uyelik.uyelikId;
  const { tz } = useSaatDilimi();
  const bugun = bugunTarihi(tz);
  const konular = useKonuHaritasi();
  const sablonlar = useOdevSablonlari();
  const gruplar = useQuery({
    queryKey: ['gruplar', uyelikId],
    queryFn: () => adaptorler.ders.gruplar(),
    enabled: !!uyelikId,
    staleTime: 5 * 60_000,
  });

  const [hedefId, setHedefId] = useState<string | null>(null);
  const [konu, setKonu] = useState<KonuSecimi>(KONU_SECIMI_BOS);
  const [tur, setTur] = useState<OdevTuru>('soru');
  const [sayi, setSayi] = useState('20');
  const [baslikElle, setBaslikElle] = useState<string | null>(null);
  const [teslim, setTeslim] = useState<Teslim>('3');
  const [ozelTarih, setOzelTarih] = useState('');
  const [denendi, setDenendi] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const [sonuc, setSonuc] = useState<Odev | null>(null);

  const liste = gruplar.data ?? [];
  // Varsayilan hedef: ilk sinif grubu, yoksa ilk grup.
  const secilenHedef = hedefId ?? liste.find((g) => g.tur === 'sinif')?.id ?? liste[0]?.id ?? null;
  const sayiDegeri = /^\d{1,5}$/.test(sayi.trim()) ? Number(sayi) : null;
  const konuAdi = konu.konuId
    ? (konular.get(konu.konuId)?.ad ?? '')
    : konu.bransKodu
      ? bransAdi(konu.bransKodu)
      : '';
  const oneri = odevBasligiOner(konuAdi || t('mobil.ogrenme.odev.ornekBaslik'), tur, sayiDegeri);
  const baslik = baslikElle ?? oneri;
  const sonTeslimTarihi = teslim === 'ozel' ? ozelTarih : tarihEkle(bugun, Number(teslim));
  const tarihHatasi = teslim === 'ozel' && !tarihGecerliMi(ozelTarih);

  const hatalar = {
    hedef: secilenHedef ? null : t('mobil.ogrenme.odev.hedefHata'),
    ders: konu.bransKodu ? null : t('mobil.ogrenme.odev.dersHata'),
    sayi: tur === 'serbest' || sayiDegeri !== null ? null : t('mobil.ogrenme.odev.sayiHata'),
    tarih: tarihHatasi ? t('mobil.ogrenme.odev.tarihHata') : null,
    baslik: baslik.trim() ? null : t('mobil.ogrenme.odev.baslikHata'),
  };
  const gecerli = Object.values(hatalar).every((h) => h === null);

  const ver = useMutation({
    networkMode: 'always',
    mutationFn: () =>
      adaptorler.ogrenme.odevVer({
        baslik: baslik.trim(),
        bransKodu: konu.bransKodu ?? '',
        ...(konu.konuId ? { konuId: konu.konuId } : {}),
        tur,
        hedefTuru: 'grup',
        hedefId: secilenHedef ?? '',
        sonTeslim:
          teslim === 'ozel'
            ? yerelDenUtc(ozelTarih, '23:59', tz)
            : varsayilanSonTeslim(bugun, tz, Number(teslim)),
        ...(tur !== 'serbest' && sayiDegeri ? { hedefSoruSayisi: sayiDegeri } : {}),
      }),
    onSuccess: (o) => {
      setHata(null);
      setSonuc(o);
      void qc.invalidateQueries({ queryKey: ['odev'] });
    },
    onError: (e) => {
      setHata(hataMesaji(e));
    },
  });

  function sablonUygula(s: OdevSablonu) {
    setKonu({ bransKodu: s.bransKodu, konuId: s.konuId });
    setTur(s.tur);
    if (s.hedefSoruSayisi) setSayi(String(s.hedefSoruSayisi));
    setBaslikElle(null);
  }

  function gonder() {
    setDenendi(true);
    if (!gecerli) return;
    setHata(null);
    ver.mutate();
  }

  if (sonuc) {
    return (
      <Ekran kenarlar={['left', 'right']}>
        <Kart className="items-center gap-3" accessibilityLiveRegion="polite" testID="odev-verildi">
          <Ikon ad="checkmark-circle" boyut={40} />
          <Metin varyant="baslik">{t('mobil.ogrenme.odev.verildi')}</Metin>
          <Metin varyant="ikincil" className="text-center">
            {t('mobil.ogrenme.odev.verildiMesaj', { n: sonuc.atananSayisi })}
          </Metin>
          <Dugme
            etiket={t('mobil.ogrenme.odev.ozetiGor')}
            onPress={() => {
              router.replace({ pathname: '/odev/[id]', params: { id: sonuc.id } });
            }}
          />
          <Dugme
            varyant="ikincil"
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
      <Metin varyant="baslik" accessibilityRole="header">
        {t('mobil.ogrenme.odev.odevVer')}
      </Metin>

      {sablonlar.data && sablonlar.data.length > 0 ? (
        <View className="gap-2" testID="sablonlar">
          <Metin varyant="etiket">{t('mobil.ogrenme.odev.sablondan')}</Metin>
          <View className="flex-row flex-wrap gap-2">
            {sablonlar.data.map((s) => (
              <Dugme
                key={s.id}
                varyant="ikincil"
                etiket={s.baslik}
                onPress={() => {
                  sablonUygula(s);
                }}
              />
            ))}
          </View>
        </View>
      ) : null}

      <View className="gap-2">
        <Metin varyant="etiket" accessibilityRole="header">
          {t('mobil.ogrenme.odev.kime')}
        </Metin>
        {gruplar.isPending ? <Yukleniyor /> : null}
        {gruplar.isError && !gruplar.data ? (
          <HataDurumu mesaj={hataMesaji(gruplar.error)} tekrar={() => void gruplar.refetch()} />
        ) : null}
        {gruplar.data?.length === 0 ? (
          <BosDurum ikon="sparkles" mesaj={t('mobil.ogrenme.odev.kimeYok')} />
        ) : null}
        {liste.length > 0 ? (
          <Secici
            dikey
            deger={secilenHedef}
            onDegis={setHedefId}
            secenekler={liste.map((g) => ({
              deger: g.id,
              etiket: `${grupEtiketi(g)} · ${g.tur === 'birebir' ? t('mobil.ders.birebir') : t('mobil.ders.grup')}`,
            }))}
          />
        ) : null}
        {denendi && hatalar.hedef ? (
          <Metin varyant="ikincil" className="text-hata">
            {hatalar.hedef}
          </Metin>
        ) : null}
      </View>

      <View className="gap-1">
        <KonuSecici
          deger={konu}
          onDegis={(v) => {
            setKonu(v);
            setBaslikElle(null);
          }}
          etiket={t('mobil.ogrenme.odev.dersKonu')}
        />
        {denendi && hatalar.ders ? (
          <Metin varyant="ikincil" className="text-hata">
            {hatalar.ders}
          </Metin>
        ) : null}
      </View>

      <Secici
        baslik={t('mobil.ogrenme.odev.tur')}
        deger={tur}
        onDegis={(v) => {
          setTur(v);
          setBaslikElle(null);
        }}
        secenekler={TURLER.map((x) => ({ deger: x, etiket: t(`mobil.ogrenme.odev.turler.${x}`) }))}
      />
      {tur !== 'serbest' ? (
        <MetinGirdisi
          etiket={
            tur === 'soru'
              ? t('mobil.ogrenme.odev.soruSayisi')
              : t('mobil.ogrenme.odev.sayfaSayisi')
          }
          value={sayi}
          onChangeText={(v) => {
            setSayi(v);
            setBaslikElle(null);
          }}
          keyboardType="number-pad"
          maxLength={5}
          hata={denendi ? hatalar.sayi : null}
        />
      ) : null}

      <Secici
        baslik={t('mobil.ogrenme.odev.teslimTarihi')}
        deger={teslim}
        onDegis={setTeslim}
        secenekler={[
          { deger: '1', etiket: t('mobil.ogrenme.odev.yarin') },
          { deger: '3', etiket: t('mobil.ogrenme.odev.ucGun') },
          { deger: '7', etiket: t('mobil.ogrenme.odev.birHafta') },
          { deger: 'ozel', etiket: t('mobil.ogrenme.odev.ozelTarih') },
        ]}
      />
      {teslim === 'ozel' ? (
        <MetinGirdisi
          etiket={t('mobil.ogrenme.odev.tarihGirdi')}
          value={ozelTarih}
          onChangeText={setOzelTarih}
          maxLength={10}
          keyboardType="numbers-and-punctuation"
          hata={denendi ? hatalar.tarih : null}
        />
      ) : (
        <Metin varyant="kucuk">
          {t('mobil.ogrenme.odev.teslimAciklama', { tarih: sonTeslimTarihi })}
        </Metin>
      )}

      <MetinGirdisi
        etiket={t('mobil.ogrenme.odev.baslikGirdi')}
        value={baslik}
        onChangeText={setBaslikElle}
        maxLength={200}
        hata={denendi ? hatalar.baslik : null}
      />

      {hata ? (
        <Metin varyant="ikincil" className="text-hata" accessibilityLiveRegion="polite">
          {hata}
        </Metin>
      ) : null}
      <Dugme
        buyuk
        etiket={t('mobil.ogrenme.odev.gonder')}
        yukleniyor={ver.isPending}
        onPress={gonder}
      />
    </Ekran>
  );
}
