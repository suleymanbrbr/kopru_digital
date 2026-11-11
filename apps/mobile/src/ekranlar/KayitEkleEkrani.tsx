import { t } from '@kopru/i18n';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import type { KaynakGirdisi } from '../api/kayitTipleri';
import {
  saglayiciAdi,
  saglayiciIkonu,
  sonErisimBitis,
  varsayilanKayitBasligi,
  type SonErisimSecimi,
} from '../kayit/kurallar';
import { baglantiyiCoz, baglantiyiDuzenle } from '../kayit/saglayici';
import { kisaZaman } from '../lib/saat';
import { Dugme } from '../ui/Dugme';
import { Ekran } from '../ui/Ekran';
import { Ikon } from '../ui/Ikon';
import { Kart } from '../ui/Kart';
import { Metin } from '../ui/Metin';
import { MetinGirdisi } from '../ui/MetinGirdisi';
import { Secici } from '../ui/Secici';
import { useServisler } from '../uygulama/baglam';
import { hataMesaji } from '../uygulama/hatalar';
import { useSaatDilimi } from '../uygulama/operasyon';

const LINK_UST = 20;

interface Satir {
  anahtar: number;
  url: string;
  baslik: string;
  parola: string;
  sonErisim: SonErisimSecimi;
  ayrintiAcik: boolean;
}

const yeniSatir = (anahtar: number): Satir => ({
  anahtar,
  url: '',
  baslik: '',
  parola: '',
  sonErisim: 'yok',
  ayrintiAcik: false,
});

function LinkBlogu({
  satir,
  sira,
  toplam,
  denendi,
  dersAdi,
  guncelle,
  kaldir,
}: {
  satir: Satir;
  sira: number;
  toplam: number;
  denendi: boolean;
  dersAdi: string;
  guncelle: (d: Partial<Satir>) => void;
  kaldir: () => void;
}) {
  const [panoHata, setPanoHata] = useState(false);
  const sonuc = baglantiyiCoz(satir.url);
  const hata =
    satir.url.trim() === ''
      ? denendi
        ? t('mobil.kayit.ekle.hata.bos')
        : null
      : !sonuc.gecerli
        ? t(`mobil.kayit.ekle.hata.${sonuc.neden}`)
        : null;
  const tanindi = sonuc.gecerli ? sonuc.saglayici : null;

  async function yapistir() {
    const metin = await Clipboard.getStringAsync().catch(() => '');
    const url = baglantiyiDuzenle(metin);
    if (url === '' || !baglantiyiCoz(url).gecerli) {
      setPanoHata(true);
      return;
    }
    setPanoHata(false);
    guncelle({ url });
  }

  return (
    <Kart className="gap-3" testID={`link-blogu-${sira}`}>
      <View className="flex-row items-center justify-between gap-2">
        <Metin varyant="altBaslik">{t('mobil.kayit.ekle.linkNo', { n: sira })}</Metin>
        {toplam > 1 ? (
          <Dugme
            varyant="hayalet"
            etiket={t('ortak.kapat')}
            accessibilityLabel={t('mobil.kayit.ekle.linkKaldir', { n: sira })}
            onPress={kaldir}
          />
        ) : null}
      </View>
      <MetinGirdisi
        etiket={t('mobil.kayit.ekle.link')}
        value={satir.url}
        onChangeText={(v) => {
          setPanoHata(false);
          guncelle({ url: v });
        }}
        hata={hata}
        keyboardType="url"
        multiline={false}
        numberOfLines={1}
        scrollEnabled
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="https://"
        testID={`link-url-${sira}`}
      />
      <Dugme
        className="self-start"
        varyant="ikincil"
        etiket={t('mobil.kayit.ekle.yapistir')}
        accessibilityLabel={t('mobil.kayit.ekle.yapistirEtiket')}
        testID={`link-yapistir-${sira}`}
        onPress={() => void yapistir()}
      />
      {panoHata ? (
        <Metin varyant="ikincil" className="text-hata" accessibilityRole="alert">
          {t('mobil.kayit.ekle.panoBos')}
        </Metin>
      ) : null}
      {tanindi ? (
        <View
          className="flex-row items-center gap-2"
          accessible
          accessibilityLabel={t('mobil.kayit.ekle.tanindi', { saglayici: saglayiciAdi(tanindi) })}
          testID={`link-tanindi-${sira}`}
        >
          <Ikon ad={saglayiciIkonu(tanindi)} boyut={18} />
          <Metin varyant="ikincil">
            {t('mobil.kayit.ekle.tanindi', { saglayici: saglayiciAdi(tanindi) })}
          </Metin>
        </View>
      ) : null}
      {tanindi === 'drive' ? (
        <Kart className="flex-row items-start gap-2 border-uyari" testID={`drive-uyari-${sira}`}>
          <Ikon ad="warning-outline" boyut={18} />
          <Metin varyant="ikincil" className="flex-1">
            {t('mobil.kayit.ekle.driveUyari')}
          </Metin>
        </Kart>
      ) : null}
      {satir.ayrintiAcik ? (
        <View className="gap-3">
          <MetinGirdisi
            etiket={t('mobil.kayit.ekle.baslikAlan')}
            value={satir.baslik}
            placeholder={varsayilanKayitBasligi(dersAdi, sira, toplam)}
            onChangeText={(v) => {
              guncelle({ baslik: v });
            }}
            maxLength={200}
            testID={`link-baslik-${sira}`}
          />
          <MetinGirdisi
            etiket={t('mobil.kayit.ekle.parola')}
            value={satir.parola}
            onChangeText={(v) => {
              guncelle({ parola: v });
            }}
            maxLength={200}
            autoCapitalize="none"
            autoCorrect={false}
            testID={`link-parola-${sira}`}
          />
          <Metin varyant="kucuk">{t('mobil.kayit.ekle.parolaIpucu')}</Metin>
          <Secici
            baslik={t('mobil.kayit.ekle.sonErisim')}
            deger={satir.sonErisim}
            onDegis={(v) => {
              guncelle({ sonErisim: v });
            }}
            secenekler={[
              { deger: 'yok', etiket: t('mobil.kayit.ekle.sonErisimYok') },
              { deger: '7', etiket: t('mobil.kayit.ekle.sonErisim7') },
              { deger: '30', etiket: t('mobil.kayit.ekle.sonErisim30') },
              { deger: '90', etiket: t('mobil.kayit.ekle.sonErisim90') },
            ]}
          />
        </View>
      ) : (
        <Dugme
          className="self-start"
          varyant="hayalet"
          etiket={t('mobil.kayit.ekle.ayrinti')}
          accessibilityLabel={t('mobil.kayit.ekle.ayrintiAc')}
          testID={`link-ayrinti-${sira}`}
          onPress={() => {
            guncelle({ ayrintiAcik: true });
          }}
        />
      )}
    </Kart>
  );
}

interface Props {
  dersId: string;
  baslik: string;
  baslangic: string;
}

/**
 * Ogretmen: derse kayit ekle. Yapistir-kaydet: baglanti (panodan yapistir dugmesi) -> saglayici
 * istemcide taninip ikonla gosterilir (son soz sunucuda) -> Kaydet. Parola, baslik ve son erisim
 * ayrintilar altindadir. Birden cok baglanti tek istekte gider; baslik bos ise "{ders} kaydi".
 */
export function KayitEkleEkrani({ dersId, baslik, baslangic }: Props) {
  const router = useRouter();
  const qc = useQueryClient();
  const { adaptorler } = useServisler();
  const { tz } = useSaatDilimi();
  const [satirlar, setSatirlar] = useState<Satir[]>([yeniSatir(1)]);
  const [sonAnahtar, setSonAnahtar] = useState(1);
  const [denendi, setDenendi] = useState(false);
  const [eklenen, setEklenen] = useState<number | null>(null);

  const kaydet = useMutation({
    networkMode: 'always',
    mutationFn: (linkler: KaynakGirdisi[]) => adaptorler.kayit.kaynakEkle(dersId, linkler),
    onSuccess: (sonuc) => {
      void qc.invalidateQueries({ queryKey: ['kayit'] });
      setEklenen(sonuc.length);
    },
  });

  function guncelle(anahtar: number, d: Partial<Satir>) {
    setSatirlar((l) => l.map((s) => (s.anahtar === anahtar ? { ...s, ...d } : s)));
  }

  function gonder() {
    setDenendi(true);
    const cozumler = satirlar.map((s) => baglantiyiCoz(s.url));
    if (cozumler.some((c) => !c.gecerli)) return;
    const simdi = Date.now();
    const linkler = satirlar.map((s, i): KaynakGirdisi => {
      const c = cozumler[i];
      const bitis = sonErisimBitis(s.sonErisim, simdi);
      return {
        baslik: s.baslik.trim() || varsayilanKayitBasligi(baslik, i + 1, satirlar.length),
        url: c?.gecerli ? c.url : s.url.trim(),
        ...(s.parola.trim() ? { parola: s.parola.trim() } : {}),
        ...(bitis ? { gecerlilikBitis: bitis } : {}),
      };
    });
    kaydet.mutate(linkler);
  }

  function baskaKayit() {
    setSatirlar([yeniSatir(sonAnahtar + 1)]);
    setSonAnahtar(sonAnahtar + 1);
    setDenendi(false);
    setEklenen(null);
    kaydet.reset();
  }

  if (eklenen !== null) {
    return (
      <Ekran>
        <Kart
          className="items-center gap-3"
          testID="kayit-eklendi"
          accessibilityLiveRegion="polite"
        >
          <Ikon ad="checkmark-circle" boyut={40} />
          <Metin varyant="altBaslik" className="text-center">
            {t('mobil.kayit.ekle.kaydedildi')}
          </Metin>
        </Kart>
        <Dugme
          buyuk
          etiket={t('mobil.kayit.ekle.bitti')}
          onPress={() => {
            router.back();
          }}
        />
        <Dugme varyant="ikincil" etiket={t('mobil.kayit.ekle.baskaEkle')} onPress={baskaKayit} />
      </Ekran>
    );
  }

  return (
    <Ekran klavye>
      <View className="gap-1" accessible accessibilityRole="header">
        <Metin varyant="altBaslik">{baslik || t('mobil.ders.adsiz')}</Metin>
        {baslangic ? <Metin varyant="ikincil">{kisaZaman(baslangic, tz)}</Metin> : null}
      </View>
      {satirlar.map((s, i) => (
        <LinkBlogu
          key={s.anahtar}
          satir={s}
          sira={i + 1}
          toplam={satirlar.length}
          denendi={denendi}
          dersAdi={baslik}
          guncelle={(d) => {
            guncelle(s.anahtar, d);
          }}
          kaldir={() => {
            setSatirlar((l) => l.filter((x) => x.anahtar !== s.anahtar));
          }}
        />
      ))}
      {satirlar.length < LINK_UST ? (
        <Dugme
          varyant="ikincil"
          etiket={t('mobil.kayit.ekle.baskaLink')}
          testID="baska-link"
          onPress={() => {
            setSatirlar((l) => [...l, yeniSatir(sonAnahtar + 1)]);
            setSonAnahtar(sonAnahtar + 1);
          }}
        />
      ) : null}
      {kaydet.isError ? (
        <Metin
          varyant="ikincil"
          className="text-hata"
          accessibilityRole="alert"
          testID="kayit-ekle-hata"
        >
          {hataMesaji(kaydet.error)}
        </Metin>
      ) : null}
      <Dugme
        buyuk
        etiket={
          kaydet.isPending ? t('mobil.kayit.ekle.kaydediliyor') : t('mobil.kayit.ekle.kaydet')
        }
        yukleniyor={kaydet.isPending}
        testID="kayit-kaydet"
        onPress={gonder}
      />
    </Ekran>
  );
}
