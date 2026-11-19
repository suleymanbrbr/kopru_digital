import { t } from '@kopru/i18n';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Linking, Platform, View } from 'react-native';

import { aktivasyonuBekle, type AktivasyonSecenekleri } from '../../abonelik/aktivasyon';
import { durumOzetle, platformKaynagi } from '../../abonelik/durum';
import type { AbonelikOzeti, AbonelikPlani, AbonelikPeriyodu } from '../../api/abonelikTipleri';
import { apiHatasiMi } from '../../api/tipler';
import { aboneligiYonetUrl, MagazaHatasi, type MagazaTeklifi } from '../../magaza';
import { Dugme } from '../../ui/Dugme';
import { BosDurum, HataDurumu, Yukleniyor } from '../../ui/Durumlar';
import { Ekran } from '../../ui/Ekran';
import { Kart } from '../../ui/Kart';
import { Metin } from '../../ui/Metin';
import {
  useAbonelikOzeti,
  useAbonelikPlanlari,
  useMagazaTeklifleri,
  useSahipMi,
  useSimdi,
} from '../../uygulama/abonelik';
import { useAktif, useServisler } from '../../uygulama/baglam';
import { hataMesaji } from '../../uygulama/hatalar';
import { KullanimCubugu } from './KullanimCubugu';

export interface AbonelikEkraniProps {
  /** Test: yoklama suresi/araligi/saati (varsayilan: 15 sn, 1 sn). */
  yoklama?: Partial<Pick<AktivasyonSecenekleri, 'sureMs' | 'araMs' | 'simdi' | 'bekle'>>;
  /** Test: cihaz platformu (varsayilan `Platform.OS`). */
  platform?: string;
}

type Islem = 'bosta' | 'satiliyor' | 'bekleniyor' | 'geriYukleniyor';
interface Mesaj {
  tur: 'basari' | 'bilgi' | 'hata';
  metin: string;
  /** "Durumu yenile" dugmesi gosterilsin. */
  yenile?: boolean;
}

const tarih = (iso: string) =>
  new Date(iso).toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Istanbul',
  });

function durumMetni(o: AbonelikOzeti, d: ReturnType<typeof durumOzetle>): string | null {
  switch (d.durum) {
    case 'deneme':
      return (d.kalanGun ?? 0) <= 0
        ? t('mobil.abonelik.denemeBugun')
        : t('mobil.abonelik.denemeKalan', { n: d.kalanGun ?? 0 });
    case 'ek_sure':
      return t('mobil.abonelik.ekSureKalan', { n: d.kalanGun ?? 0 });
    case 'askida':
    case 'odeme_bekliyor':
      return t('mobil.abonelik.askidaAciklama');
    case 'sona_erdi':
    case 'iptal':
      return t('mobil.abonelik.sonaErdi');
    case 'aktif':
      if (d.iptalBitis) return t('mobil.abonelik.iptalBitis', { tarih: tarih(d.iptalBitis) });
      return o.abonelik
        ? t('mobil.abonelik.yenilenme', { tarih: tarih(o.abonelik.donemBitis) })
        : null;
    default:
      return null;
  }
}

/** Sahip icin abonelik ekrani: durum, kullanim, magaza planlari, satin alma / geri yukleme / yonetim. */
export function AbonelikEkrani({ yoklama, platform = Platform.OS }: AbonelikEkraniProps) {
  const sahip = useSahipMi();
  const aktif = useAktif();
  const { adaptorler, magaza, abonelikUyari } = useServisler();
  const qc = useQueryClient();
  const ozetQ = useAbonelikOzeti();
  const planlarQ = useAbonelikPlanlari();
  const teklifQ = useMagazaTeklifleri();
  const simdi = useSimdi();
  const [islem, setIslem] = useState<Islem>('bosta');
  const [mesaj, setMesaj] = useState<Mesaj | null>(null);

  if (!aktif || !sahip) {
    return (
      <Ekran kenarlar={['left', 'right', 'bottom']}>
        <BosDurum mesaj={t('mobil.abonelik.sahipDegil')} />
      </Ekran>
    );
  }
  const kurumId = aktif.uyelik.kurumId;
  const kanal = platformKaynagi(platform);

  if (ozetQ.isPending || planlarQ.isPending) {
    return (
      <Ekran kenarlar={['left', 'right', 'bottom']}>
        <Yukleniyor />
      </Ekran>
    );
  }
  if (ozetQ.isError || planlarQ.isError) {
    return (
      <Ekran kenarlar={['left', 'right', 'bottom']}>
        <HataDurumu
          mesaj={hataMesaji(ozetQ.error ?? planlarQ.error)}
          tekrar={() => {
            void ozetQ.refetch();
            void planlarQ.refetch();
          }}
        />
      </Ekran>
    );
  }

  const ozet = ozetQ.data;
  const planlar = planlarQ.data;
  const d = durumOzetle(ozet, platform, simdi);
  const busy = islem !== 'bosta';
  const teklifler = teklifQ.data ?? [];

  const yenile = async () => {
    await qc.invalidateQueries({ queryKey: ['abonelik', kurumId] });
  };

  const bekle = (tamam: (o: AbonelikOzeti) => boolean, ekle?: Partial<AktivasyonSecenekleri>) =>
    aktivasyonuBekle({
      getir: () => adaptorler.abonelik.ozet(),
      tamam,
      ...yoklama,
      ...ekle,
    });

  async function satinAl(teklif: MagazaTeklifi) {
    setMesaj(null);
    setIslem('satiliyor');
    try {
      await magaza.logIn(kurumId);
      const r = await magaza.satinAl(teklif);
      if (r.durum === 'iptal') {
        setMesaj({ tur: 'bilgi', metin: t('mobil.abonelik.satinAlma.iptal') });
        return;
      }
      setIslem('bekleniyor');
      const s = await bekle(
        (o) =>
          o.abonelik?.durum === 'aktif' &&
          o.abonelik.kaynak === kanal &&
          o.abonelik.plan.kod === teklif.planKodu,
      );
      await yenile();
      if (s.durum === 'tamam') {
        abonelikUyari.saltOkunurTemizle();
        setMesaj({ tur: 'basari', metin: t('mobil.abonelik.satinAlma.basarili') });
      } else {
        setMesaj({ tur: 'bilgi', metin: t('mobil.abonelik.satinAlma.isleniyor'), yenile: true });
      }
    } catch (e) {
      setMesaj({
        tur: 'hata',
        metin:
          e instanceof MagazaHatasi
            ? e.kod === 'kullanilamiyor'
              ? t('mobil.abonelik.satinAlma.magazaYok')
              : t('mobil.abonelik.satinAlma.hata')
            : apiHatasiMi(e)
              ? hataMesaji(e)
              : t('mobil.abonelik.satinAlma.hata'),
      });
    } finally {
      setIslem('bosta');
    }
  }

  async function geriYukle() {
    setMesaj({ tur: 'bilgi', metin: t('mobil.abonelik.geriYukle.bekleniyor') });
    setIslem('geriYukleniyor');
    try {
      await magaza.logIn(kurumId);
      await magaza.geriYukle();
      const s = await bekle((o) => o.abonelik?.durum === 'aktif' && o.abonelik.kaynak === kanal, {
        sureMs: yoklama?.sureMs ?? 6_000,
      });
      await yenile();
      setMesaj(
        s.durum === 'tamam'
          ? { tur: 'basari', metin: t('mobil.abonelik.geriYukle.basarili') }
          : { tur: 'bilgi', metin: t('mobil.abonelik.geriYukle.bulunamadi') },
      );
    } catch {
      setMesaj({ tur: 'hata', metin: t('mobil.abonelik.geriYukle.hata') });
    } finally {
      setIslem('bosta');
    }
  }

  const sinirsiz = t('mobil.abonelik.planlar.sinirsiz');
  const periyotAdi = (p: AbonelikPeriyodu) => t(`mobil.abonelik.periyot.${p}`);

  return (
    <Ekran kenarlar={['left', 'right', 'bottom']}>
      <Kart className="gap-2" testID="abonelik-durum">
        <Metin varyant="etiket">{t('mobil.abonelik.planBaslik')}</Metin>
        <Metin varyant="baslik">{ozet.abonelik?.plan.ad ?? t('mobil.abonelik.ucretsizPlan')}</Metin>
        <Metin
          varyant="altBaslik"
          accessibilityLabel={`${t('mobil.abonelik.durumBaslik')}: ${t(`mobil.abonelik.durum.${d.durum}`)}`}
          testID="abonelik-durum-adi"
        >
          {t(`mobil.abonelik.durum.${d.durum}`)}
          {d.kaynak ? ` · ${t(`mobil.abonelik.kaynak.${d.kaynak}`)}` : ''}
        </Metin>
        {durumMetni(ozet, d) ? (
          <Metin varyant="ikincil" testID="abonelik-durum-aciklama">
            {durumMetni(ozet, d)}
          </Metin>
        ) : null}
      </Kart>

      <Kart className="gap-3" testID="abonelik-kullanim">
        <Metin varyant="altBaslik" accessibilityRole="header">
          {t('mobil.abonelik.kullanim.baslik')}
        </Metin>
        <KullanimCubugu
          testID="kullanim-ogrenci"
          ad={t('mobil.abonelik.kullanim.ogrenci')}
          mevcut={ozet.kullanim.ogrenci.mevcut}
          ustSinir={ozet.kullanim.ogrenci.ustSinir}
        />
        <KullanimCubugu
          testID="kullanim-ogretmen"
          ad={t('mobil.abonelik.kullanim.ogretmen')}
          mevcut={ozet.kullanim.ogretmen.mevcut}
          ustSinir={ozet.kullanim.ogretmen.ustSinir}
        />
      </Kart>

      {mesaj ? (
        <Kart
          accessibilityLiveRegion="polite"
          accessibilityRole={mesaj.tur === 'hata' ? 'alert' : undefined}
          testID="abonelik-mesaj"
          className={`gap-2 ${mesaj.tur === 'hata' ? 'border-hata' : ''}`}
        >
          <Metin>{mesaj.metin}</Metin>
          {mesaj.yenile ? (
            <Dugme
              varyant="ikincil"
              etiket={t('mobil.abonelik.satinAlma.yenile')}
              onPress={() => {
                setMesaj(null);
                void yenile();
              }}
            />
          ) : null}
        </Kart>
      ) : null}
      {islem === 'bekleniyor' ? (
        <Yukleniyor etiket={t('mobil.abonelik.satinAlma.bekleniyor')} />
      ) : null}

      {d.satinAlmaKapali ? (
        <Kart testID="satin-alma-kapali" accessibilityRole="alert">
          <Metin>{t(`mobil.abonelik.kapali.${d.satinAlmaKapali}`)}</Metin>
        </Kart>
      ) : null}

      {kanal && d.satinAlmaKapali !== 'baska_kanal' ? (
        <View className="gap-3">
          <Metin varyant="altBaslik" accessibilityRole="header">
            {t('mobil.abonelik.planlar.baslik')}
          </Metin>
          {teklifQ.isPending ? <Yukleniyor /> : null}
          {teklifQ.isError ? (
            <HataDurumu
              mesaj={t('mobil.abonelik.planlar.yuklenemedi')}
              tekrar={() => {
                void teklifQ.refetch();
              }}
            />
          ) : null}
          {planlar.length === 0 ? <BosDurum mesaj={t('mobil.abonelik.planlar.bos')} /> : null}
          {planlar.map((p) => (
            <PlanKarti
              key={p.kod}
              plan={p}
              teklifler={teklifler.filter((x) => x.planKodu === p.kod)}
              mevcut={
                d.magazaYonetilebilir && ozet.abonelik?.plan.kod === p.kod
                  ? ozet.abonelik.periyot
                  : null
              }
              kapali={d.satinAlmaKapali !== null || busy}
              degistir={d.magazaYonetilebilir}
              periyotAdi={periyotAdi}
              sinirsiz={sinirsiz}
              yukleniyor={islem === 'satiliyor'}
              satinAl={(x) => void satinAl(x)}
              hazir={!teklifQ.isPending}
            />
          ))}
        </View>
      ) : null}

      {kanal ? (
        <Dugme
          varyant="ikincil"
          etiket={t('mobil.abonelik.geriYukle.dugme')}
          disabled={busy}
          yukleniyor={islem === 'geriYukleniyor'}
          onPress={() => void geriYukle()}
        />
      ) : null}

      {d.magazaYonetilebilir ? (
        <View className="gap-2">
          <Dugme
            varyant="hayalet"
            etiket={t('mobil.abonelik.yonet.dugme')}
            onPress={() => {
              void Linking.openURL(aboneligiYonetUrl(platform));
            }}
          />
          <Metin varyant="kucuk" className="text-center">
            {t('mobil.abonelik.yonet.aciklama')}
          </Metin>
        </View>
      ) : null}
    </Ekran>
  );
}

function PlanKarti({
  plan,
  teklifler,
  mevcut,
  kapali,
  degistir,
  periyotAdi,
  sinirsiz,
  yukleniyor,
  satinAl,
  hazir,
}: {
  plan: AbonelikPlani;
  teklifler: MagazaTeklifi[];
  /** Bu plan etkin magaza aboneligiyse periyodu. */
  mevcut: AbonelikPeriyodu | null;
  kapali: boolean;
  degistir: boolean;
  periyotAdi: (p: AbonelikPeriyodu) => string;
  sinirsiz: string;
  yukleniyor: boolean;
  satinAl: (t: MagazaTeklifi) => void;
  hazir: boolean;
}) {
  const sirali = [...teklifler].sort((a) => (a.periyot === 'aylik' ? -1 : 1));
  return (
    <Kart className="gap-2" testID={`plan-${plan.kod}`}>
      <Metin varyant="altBaslik">{plan.ad}</Metin>
      <Metin varyant="ikincil">
        {t('mobil.abonelik.planlar.limitler', {
          ogrenci: plan.maxOgrenci ?? sinirsiz,
          ogretmen: plan.maxOgretmen ?? sinirsiz,
        })}
      </Metin>
      {sirali.length === 0 && hazir ? (
        <View testID={`plan-yakinda-${plan.kod}`} accessible>
          <Metin varyant="etiket">{t('mobil.abonelik.planlar.yakinda')}</Metin>
          <Metin varyant="kucuk">{t('mobil.abonelik.planlar.yakindaAciklama')}</Metin>
        </View>
      ) : null}
      {sirali.map((x) => {
        const buMevcut = mevcut === x.periyot;
        const etiket = `${periyotAdi(x.periyot)} · ${x.fiyatMetni}`;
        return (
          <Dugme
            key={x.urunId}
            varyant={buMevcut ? 'ikincil' : 'birincil'}
            etiket={buMevcut ? t('mobil.abonelik.planlar.mevcut') : etiket}
            accessibilityLabel={
              buMevcut
                ? t('mobil.abonelik.planlar.mevcut')
                : `${degistir ? t('mobil.abonelik.planlar.planDegistir') : t('mobil.abonelik.planlar.satinAl')}: ${t('mobil.abonelik.planlar.etiket', { plan: plan.ad, periyot: periyotAdi(x.periyot), fiyat: x.fiyatMetni })}`
            }
            disabled={kapali || buMevcut}
            yukleniyor={yukleniyor}
            testID={`satin-al-${x.urunId}`}
            onPress={() => {
              satinAl(x);
            }}
          />
        );
      })}
    </Kart>
  );
}
