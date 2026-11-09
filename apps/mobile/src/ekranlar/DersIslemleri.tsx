import { t } from '@kopru/i18n';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Modal, View } from 'react-native';

import type {
  CakisanDers,
  Ders,
  DersKapsami,
  GrupTuru,
  IptalKaynagi,
} from '../api/operasyonTipleri';
import { cakisanDersleriOku } from '../lib/cakisma';
import { saatAraligi, saatGecerliMi, tarihGecerliMi, yerelSaat, yerelTarih } from '../lib/saat';
import { Dugme } from '../ui/Dugme';
import { Ekran } from '../ui/Ekran';
import { Metin } from '../ui/Metin';
import { MetinGirdisi } from '../ui/MetinGirdisi';
import { Secici } from '../ui/Secici';
import { useServisler } from '../uygulama/baglam';
import { hataMesaji } from '../uygulama/hatalar';
import { CakismaOnayi } from './CakismaOnayi';

type Adim = 'menu' | 'tasi' | 'iptal';

interface Props {
  ders: Ders;
  ad: string;
  tz: string;
  grupTuru?: GrupTuru;
  yoklamaAcik: boolean;
  /** Islem tamamlaninca bilgi mesajiyla, vazgecilince mesajsiz kapanir. */
  kapat: (mesaj?: string) => void;
}

/** Derse uzun basinca acilan islemler: tasi, iptal et, yoklama al. Seri derste kapsam sorulur. */
export function DersIslemleri({ ders, ad, tz, grupTuru, yoklamaAcik, kapat }: Props) {
  const router = useRouter();
  const qc = useQueryClient();
  const { adaptorler } = useServisler();
  const [adim, setAdim] = useState<Adim>('menu');
  const [kapsam, setKapsam] = useState<DersKapsami>('yalniz_bu');
  const [yeniGun, setYeniGun] = useState(yerelTarih(ders.baslangic, tz));
  const [yeniSaat, setYeniSaat] = useState(yerelSaat(ders.baslangic, tz));
  const [kaynak, setKaynak] = useState<IptalKaynagi>('ogretmen');
  const [neden, setNeden] = useState('');
  const [cakisanlar, setCakisanlar] = useState<CakisanDers[] | null>(null);
  const [denendi, setDenendi] = useState(false);

  const seri = ders.seriId !== null;
  const planli = ders.durum === 'planli';
  const [basladi] = useState(() => Date.parse(ders.baslangic) <= Date.now());

  const tasi = useMutation({
    networkMode: 'always',
    mutationFn: (onayli: boolean) =>
      adaptorler.ders.dersTasi(ders, {
        kapsam,
        cakismaOnayli: onayli,
        ...(kapsam === 'yalniz_bu' ? { yeniTarih: yeniGun } : {}),
        yeniSaat,
      }),
    onSuccess: (s) => {
      void qc.invalidateQueries({ queryKey: ['dersler'] });
      void qc.invalidateQueries({ queryKey: ['yoklama-bekleyen'] });
      kapat(
        s.etkilenen > 1 ? t('mobil.ders.tasindiN', { n: s.etkilenen }) : t('mobil.ders.tasindi'),
      );
    },
    onError: (e) => {
      const c = cakisanDersleriOku(e);
      if (c) setCakisanlar(c);
      else if (e instanceof Error && 'ayrinti' in e && e.ayrinti === 'surum_cakismasi') {
        void qc.invalidateQueries({ queryKey: ['dersler'] });
      }
    },
  });

  const iptal = useMutation({
    networkMode: 'always',
    mutationFn: () =>
      adaptorler.ders.dersIptal(ders, {
        kapsam,
        kaynak,
        ...(neden.trim() ? { neden: neden.trim() } : {}),
      }),
    // Iyimser: ders listede hemen "iptal edildi" gorunur; hata olursa geri alinir.
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: ['dersler'] });
      const onceki = qc.getQueriesData<Ders[]>({ queryKey: ['dersler'] });
      qc.setQueriesData<Ders[]>({ queryKey: ['dersler'] }, (eski) =>
        eski?.map((x) =>
          x.id === ders.id ||
          (kapsam === 'bu_ve_sonrakiler' &&
            ders.seriId &&
            x.seriId === ders.seriId &&
            Date.parse(x.baslangic) >= Date.parse(ders.baslangic))
            ? { ...x, durum: 'iptal' as const }
            : x,
        ),
      );
      return { onceki };
    },
    onError: (_e, _v, baglam) => {
      for (const [anahtar, veri] of baglam?.onceki ?? []) qc.setQueryData(anahtar, veri);
    },
    onSuccess: (s) => {
      void qc.invalidateQueries({ queryKey: ['dersler'] });
      void qc.invalidateQueries({ queryKey: ['yoklama-bekleyen'] });
      kapat(
        s.etkilenen > 1
          ? t('mobil.ders.iptalEdildiN', { n: s.etkilenen })
          : t('mobil.ders.iptalEdildiMesaj'),
      );
    },
  });

  const kapsamSecici = seri ? (
    <Secici
      dikey
      baslik={t('mobil.ders.kapsamBaslik')}
      secenekler={[
        { deger: 'yalniz_bu', etiket: t('mobil.ders.kapsamYalnizBu') },
        {
          deger: 'bu_ve_sonrakiler',
          etiket:
            adim === 'tasi'
              ? t('mobil.ders.kapsamSonrakilerSaat')
              : t('mobil.ders.kapsamSonrakiler'),
        },
      ]}
      deger={kapsam}
      onDegis={setKapsam}
    />
  ) : null;

  const tarihHata =
    kapsam === 'yalniz_bu' && !tarihGecerliMi(yeniGun) ? t('mobil.ders.tarihHata') : null;
  const saatHata = saatGecerliMi(yeniSaat) ? null : t('mobil.ders.saatHata');

  return (
    <Modal
      visible
      animationType="slide"
      onRequestClose={() => {
        kapat();
      }}
    >
      <Ekran klavye>
        <Metin varyant="baslik" accessibilityRole="header">
          {adim === 'tasi'
            ? t('mobil.ders.tasiBaslik')
            : adim === 'iptal'
              ? t('mobil.ders.iptalBaslik')
              : t('mobil.ders.islemler')}
        </Metin>
        <View className="gap-1">
          <Metin varyant="altBaslik">{ad}</Metin>
          <Metin varyant="ikincil">{saatAraligi(ders.baslangic, ders.bitis, tz)}</Metin>
        </View>

        {adim === 'menu' ? (
          <View className="gap-3">
            {planli ? (
              <>
                <Dugme
                  etiket={t('mobil.ders.tasi')}
                  onPress={() => {
                    setAdim('tasi');
                  }}
                />
                <Dugme
                  varyant="ikincil"
                  etiket={t('mobil.ders.iptalEt')}
                  onPress={() => {
                    setAdim('iptal');
                  }}
                />
              </>
            ) : null}
            {planli && basladi && yoklamaAcik ? (
              <Dugme
                varyant="ikincil"
                etiket={t('mobil.ders.yoklamaAl')}
                onPress={() => {
                  kapat();
                  router.push({
                    pathname: '/yoklama/[dersId]',
                    params: { dersId: ders.id, baslik: ad, baslangic: ders.baslangic },
                  });
                }}
              />
            ) : null}
            <Dugme
              varyant="hayalet"
              etiket={t('mobil.ders.kapat')}
              onPress={() => {
                kapat();
              }}
            />
          </View>
        ) : null}

        {adim === 'tasi' ? (
          <View className="gap-4">
            {kapsamSecici}
            {kapsam === 'yalniz_bu' ? (
              <MetinGirdisi
                etiket={t('mobil.ders.yeniGun')}
                value={yeniGun}
                onChangeText={setYeniGun}
                placeholder={t('mobil.ders.gunIpucu')}
                autoCapitalize="none"
                hata={denendi ? tarihHata : null}
              />
            ) : null}
            <MetinGirdisi
              etiket={t('mobil.ders.yeniSaat')}
              value={yeniSaat}
              onChangeText={setYeniSaat}
              placeholder={t('mobil.ders.saatIpucu')}
              autoCapitalize="none"
              hata={denendi ? saatHata : null}
            />
            {cakisanlar ? (
              <CakismaOnayi
                cakisanlar={cakisanlar}
                tz={tz}
                onayEtiketi={t('mobil.ders.cakismaTasiYine')}
                mesgul={tasi.isPending}
                onayla={() => {
                  tasi.mutate(true);
                }}
                vazgec={() => {
                  setCakisanlar(null);
                }}
              />
            ) : null}
            {tasi.isError && !cakisanlar ? (
              <Metin varyant="ikincil" className="text-hata" accessibilityLiveRegion="polite">
                {hataMesaji(tasi.error)}
              </Metin>
            ) : null}
            <Dugme
              buyuk
              etiket={t('mobil.ders.tasiKaydet')}
              yukleniyor={tasi.isPending}
              onPress={() => {
                setDenendi(true);
                if (tarihHata || saatHata) return;
                tasi.mutate(false);
              }}
            />
            <Dugme
              varyant="hayalet"
              etiket={t('ortak.vazgec')}
              onPress={() => {
                setAdim('menu');
              }}
            />
          </View>
        ) : null}

        {adim === 'iptal' ? (
          <View className="gap-4">
            {kapsamSecici}
            <Secici
              baslik={t('mobil.ders.iptalKaynak')}
              secenekler={[
                { deger: 'ogretmen', etiket: t('mobil.ders.kaynakOgretmen') },
                // Ogrenci kaynagi yalniz birebir derste gecerlidir (api 422 verir).
                ...(grupTuru === 'birebir'
                  ? [{ deger: 'ogrenci' as const, etiket: t('mobil.ders.kaynakOgrenci') }]
                  : []),
                { deger: 'yonetici', etiket: t('mobil.ders.kaynakYonetici') },
              ]}
              deger={kaynak}
              onDegis={setKaynak}
            />
            <MetinGirdisi
              etiket={t('mobil.ders.iptalNeden')}
              value={neden}
              onChangeText={setNeden}
              maxLength={500}
            />
            {iptal.isError ? (
              <Metin varyant="ikincil" className="text-hata" accessibilityLiveRegion="polite">
                {hataMesaji(iptal.error)}
              </Metin>
            ) : null}
            <Dugme
              buyuk
              varyant="tehlike"
              etiket={t('mobil.ders.iptalOnayla')}
              yukleniyor={iptal.isPending}
              onPress={() => {
                iptal.mutate();
              }}
            />
            <Dugme
              varyant="hayalet"
              etiket={t('ortak.vazgec')}
              onPress={() => {
                setAdim('menu');
              }}
            />
          </View>
        ) : null}
      </Ekran>
    </Modal>
  );
}
