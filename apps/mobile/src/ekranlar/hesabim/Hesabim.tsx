import { t } from '@kopru/i18n';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Linking, Pressable, View } from 'react-native';

import {
  apiHatasiMi,
  silmeBekliyorMu,
  type SilmeDogrulama,
  type SilmeDogrulamaYontemi,
  type SilmeDurumu,
} from '../../api/tipler';
import { veriyiPaylas } from '../../hesap/veriDisaAktar';
import { tarihGoster } from '../../lib/zaman';
import { ortam } from '../../ortam';
import { Dugme } from '../../ui/Dugme';
import { HataDurumu, Yukleniyor } from '../../ui/Durumlar';
import { Ekran } from '../../ui/Ekran';
import { Kart } from '../../ui/Kart';
import { Metin } from '../../ui/Metin';
import { MetinGirdisi } from '../../ui/MetinGirdisi';
import { useOturum, useServisler } from '../../uygulama/baglam';
import { hataMesaji } from '../../uygulama/hatalar';
import { silmeAnahtari, useSilmeDurumu } from '../../uygulama/hesap';
import { CevrimdisiSerit } from '../CevrimdisiSerit';

type Adim = 'ozet' | 'dogrulama' | 'onay';

/** Kod/parola hatalari (yanlis kod, cok deneme) icin ekrana ozel mesaj; digerleri genel esleme. */
function dogrulamaHatasi(e: unknown): string {
  if (apiHatasiMi(e)) {
    if (e.kod === 'otp_gecersiz') return t('mobil.hesabim.dogrulamaHatali');
    if (e.kod === 'otp_cok_deneme') return t('mobil.hesabim.dogrulamaCokDeneme');
    if (e.ayrinti === 'kurum_sahibi_engeli') return t('mobil.hesabim.engelHatasi');
    if (e.ayrinti === 'silme_talebi_var') return t('mobil.hesabim.talepVar');
  }
  return hataMesaji(e);
}

/**
 * Profil > Hesabim (KVKK m.11 ve App Store 5.1.1(v)): verilerimi indir ve hesabimi sil. Silme akisi
 * uygulama icindedir: durum -> yeniden dogrulama (OTP ya da parola) -> onay -> 30 gun beklemede
 * (geri alinabilir). Kurum sahibi engeli varsa yalniz aciklama ve destek baglantisi gosterilir.
 */
export function Hesabim() {
  const { adaptorler } = useServisler();
  const durum = useOturum();
  const qc = useQueryClient();
  const kullaniciId = durum.asama === 'giris' ? durum.kullanici.id : undefined;
  const sorgu = useSilmeDurumu();

  const [adim, setAdim] = useState<Adim>('ozet');
  const [yontem, setYontem] = useState<SilmeDogrulamaYontemi>('otp');
  const [kod, setKod] = useState('');
  const [parola, setParola] = useState('');
  const [kodGonderildi, setKodGonderildi] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const [bilgi, setBilgi] = useState<string | null>(null);

  const yenile = () => qc.invalidateQueries({ queryKey: silmeAnahtari(kullaniciId) });

  const indir = useMutation({
    networkMode: 'always',
    mutationFn: async () => {
      const dosya = await adaptorler.hesap.verilerimiIndir();
      await veriyiPaylas(dosya, t('mobil.hesabim.verilerimPaylasimBasligi'));
      return dosya;
    },
    onSuccess: (dosya) => {
      setHata(null);
      // Kismi sonuc: bazi servisler yanit vermedi; kullanici bilgilendirilir ve sonra tekrar dener.
      if (dosya.eksikServisler.length > 0) setBilgi(t('mobil.hesabim.verilerimEksik'));
    },
    onError: () => {
      setBilgi(null);
      setHata(t('mobil.hesabim.verilerimHata'));
    },
  });

  const kodGonder = useMutation({
    networkMode: 'always',
    mutationFn: () => adaptorler.hesap.silmeKoduGonder(),
    onSuccess: () => {
      setKodGonderildi(true);
      setHata(null);
      setBilgi(t('mobil.hesabim.kodGonderildi'));
    },
    onError: (e) => {
      setBilgi(null);
      setHata(dogrulamaHatasi(e));
    },
  });

  const talepAc = useMutation({
    networkMode: 'always',
    mutationFn: (d: SilmeDogrulama) => adaptorler.hesap.silmeTalebiAc(d),
    onSuccess: (talep) => {
      setHata(null);
      setBilgi(t('mobil.hesabim.talepAlindi', { tarih: tarihGoster(talep.planlanan) }));
      sifirlaForm();
      void yenile();
    },
    onError: (e) => {
      setBilgi(null);
      setHata(dogrulamaHatasi(e));
      if (apiHatasiMi(e) && e.kod === 'otp_gecersiz') {
        setAdim('dogrulama');
      } else {
        void yenile();
      }
    },
  });

  const geriAl = useMutation({
    networkMode: 'always',
    mutationFn: () => adaptorler.hesap.silmeTalebiGeriAl(),
    onSuccess: () => {
      setHata(null);
      setBilgi(t('mobil.hesabim.geriAlindi'));
      void yenile();
    },
    onError: (e) => {
      setBilgi(null);
      setHata(hataMesaji(e));
      void yenile();
    },
  });

  function sifirlaForm() {
    setAdim('ozet');
    setKod('');
    setParola('');
    setKodGonderildi(false);
  }

  const veri = sorgu.data;
  const dogrulamaHazir = yontem === 'otp' ? kod.length === 6 : parola.length > 0;

  function devam(d: SilmeDurumu) {
    setHata(null);
    setBilgi(null);
    setYontem(d.dogrulamaYontemleri[0] ?? 'otp');
    setAdim('dogrulama');
  }

  function gonder() {
    const d: SilmeDogrulama =
      yontem === 'otp' ? { yontem: 'otp', kod } : { yontem: 'parola', parola };
    talepAc.mutate(d);
  }

  return (
    <Ekran ust={<CevrimdisiSerit />} klavye kenarlar={['left', 'right', 'bottom']}>
      <Metin varyant="ikincil">{t('mobil.hesabim.aciklama')}</Metin>

      <Kart className="gap-3">
        <Metin varyant="altBaslik" accessibilityRole="header">
          {t('mobil.hesabim.verilerimBaslik')}
        </Metin>
        <Metin varyant="ikincil">{t('mobil.hesabim.verilerimAciklama')}</Metin>
        <Dugme
          varyant="ikincil"
          etiket={t('mobil.hesabim.verilerimDugme')}
          yukleniyor={indir.isPending}
          onPress={() => {
            setBilgi(null);
            indir.mutate();
          }}
          testID="verilerimi-indir"
        />
      </Kart>

      <Kart className="gap-3">
        <Metin varyant="altBaslik" accessibilityRole="header">
          {t('mobil.hesabim.silBaslik')}
        </Metin>

        {sorgu.isPending ? <Yukleniyor /> : null}
        {sorgu.isError ? (
          <HataDurumu
            mesaj={hataMesaji(sorgu.error)}
            tekrar={() => {
              void sorgu.refetch();
            }}
          />
        ) : null}

        {veri?.talep && silmeBekliyorMu(veri) ? (
          <View className="gap-3" testID="silme-bekliyor">
            <Metin varyant="etiket">{t('mobil.hesabim.bekliyorBaslik')}</Metin>
            <Metin varyant="ikincil">
              {t('mobil.hesabim.bekliyorAciklama', { tarih: tarihGoster(veri.talep.planlanan) })}
            </Metin>
            <Dugme
              etiket={t('mobil.hesabim.geriAl')}
              yukleniyor={geriAl.isPending}
              onPress={() => {
                setBilgi(null);
                geriAl.mutate();
              }}
              testID="silme-geri-al"
            />
          </View>
        ) : null}

        {veri && !silmeBekliyorMu(veri) && veri.engeller.length > 0 ? (
          <View className="gap-3" testID="silme-engel">
            <Metin varyant="etiket">{t('mobil.hesabim.engelBaslik')}</Metin>
            <Metin varyant="ikincil">{t('mobil.hesabim.engelAciklama')}</Metin>
            {veri.engeller.map((e) => (
              <Metin key={e.kurumId} varyant="etiket">
                {t('mobil.hesabim.engelKurum', { kurum: e.kurumAd, n: e.digerUyeSayisi })}
              </Metin>
            ))}
            <Dugme
              varyant="ikincil"
              etiket={t('mobil.hesabim.destekDugme')}
              onPress={() => {
                void Linking.openURL(ortam.destekUrl);
              }}
            />
          </View>
        ) : null}

        {veri && !silmeBekliyorMu(veri) && veri.engeller.length === 0 && adim === 'ozet' ? (
          <View className="gap-3">
            {veri.talep?.durum === 'engellendi' ? (
              <Metin varyant="ikincil" className="text-hata" testID="silme-engellendi">
                {t('mobil.hesabim.talepEngellendi')}
              </Metin>
            ) : null}
            <Metin varyant="ikincil">{t('mobil.hesabim.silAciklama')}</Metin>
            <Metin varyant="ikincil">
              {t('mobil.hesabim.silSogumaBilgisi', { gun: veri.sogumaGun })}
            </Metin>
            <Metin varyant="ikincil">{t('mobil.hesabim.silMagazaUyarisi')}</Metin>
            <Dugme
              varyant="tehlike"
              etiket={t('mobil.hesabim.silDugme')}
              onPress={() => {
                devam(veri);
              }}
              testID="silme-baslat"
            />
          </View>
        ) : null}

        {veri && adim === 'dogrulama' ? (
          <View className="gap-3" testID="silme-dogrulama">
            <Metin varyant="etiket">{t('mobil.hesabim.dogrulamaBaslik')}</Metin>
            <Metin varyant="ikincil">{t('mobil.hesabim.dogrulamaAciklama')}</Metin>
            {veri.dogrulamaYontemleri.length > 1 ? (
              <View className="flex-row gap-2" accessibilityRole="radiogroup">
                {veri.dogrulamaYontemleri.map((y) => {
                  const etiket = t(
                    y === 'otp' ? 'mobil.hesabim.yontemOtp' : 'mobil.hesabim.yontemParola',
                  );
                  const secili = yontem === y;
                  return (
                    <Pressable
                      key={y}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: secili }}
                      accessibilityLabel={etiket}
                      onPress={() => {
                        setYontem(y);
                        setHata(null);
                      }}
                      className={`min-h-dokunma flex-1 items-center justify-center rounded-orta border ${
                        secili ? 'border-birincil bg-birincil' : 'border-kenar bg-yuzey'
                      }`}
                    >
                      <Metin varyant="etiket" className={secili ? 'text-birincilUzeri' : ''}>
                        {etiket}
                      </Metin>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}

            {yontem === 'otp' ? (
              <>
                <Dugme
                  varyant="ikincil"
                  etiket={
                    kodGonderildi ? t('mobil.hesabim.kodTekrar') : t('mobil.hesabim.kodGonder')
                  }
                  yukleniyor={kodGonder.isPending}
                  onPress={() => {
                    kodGonder.mutate();
                  }}
                  testID="silme-kod-gonder"
                />
                {kodGonderildi ? (
                  <MetinGirdisi
                    etiket={t('mobil.hesabim.kodEtiketi')}
                    value={kod}
                    onChangeText={(v) => {
                      setKod(v.replace(/\D/g, '').slice(0, 6));
                    }}
                    keyboardType="number-pad"
                    textContentType="oneTimeCode"
                    autoComplete="one-time-code"
                    maxLength={6}
                    placeholder={t('mobil.hesabim.kodYer')}
                  />
                ) : null}
              </>
            ) : (
              <MetinGirdisi
                etiket={t('mobil.hesabim.parolaEtiketi')}
                value={parola}
                onChangeText={setParola}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="password"
              />
            )}

            <Dugme
              etiket={t('mobil.hesabim.silDevam')}
              disabled={!dogrulamaHazir}
              onPress={() => {
                setHata(null);
                setBilgi(null);
                setAdim('onay');
              }}
              testID="silme-devam"
            />
            <Dugme varyant="hayalet" etiket={t('mobil.hesabim.silVazgec')} onPress={sifirlaForm} />
          </View>
        ) : null}

        {veri && adim === 'onay' ? (
          <View className="gap-3" testID="silme-onay">
            <Metin varyant="etiket">{t('mobil.hesabim.onayBaslik')}</Metin>
            <Metin varyant="ikincil">{t('mobil.hesabim.onayMetni', { gun: veri.sogumaGun })}</Metin>
            <Metin varyant="ikincil">{t('mobil.hesabim.silMagazaUyarisi')}</Metin>
            <Dugme
              varyant="tehlike"
              etiket={t('mobil.hesabim.onayDugme')}
              yukleniyor={talepAc.isPending}
              onPress={gonder}
              testID="silme-gonder"
            />
            <Dugme
              varyant="hayalet"
              etiket={t('mobil.hesabim.silVazgec')}
              disabled={talepAc.isPending}
              onPress={sifirlaForm}
            />
          </View>
        ) : null}
      </Kart>

      {hata ? (
        <Metin varyant="ikincil" className="text-hata" accessibilityLiveRegion="polite">
          {hata}
        </Metin>
      ) : null}
      {bilgi ? (
        <Metin varyant="ikincil" accessibilityLiveRegion="polite" testID="hesabim-bilgi">
          {bilgi}
        </Metin>
      ) : null}
    </Ekran>
  );
}
