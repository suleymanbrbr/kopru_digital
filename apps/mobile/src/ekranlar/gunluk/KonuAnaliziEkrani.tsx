import { t } from '@kopru/i18n';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import type {
  AnalizDonemi,
  AnalizZorlugu,
  HaftalikOzet,
  Oneri,
  Zorluk,
} from '../../api/gunlukSoruTipleri';
import {
  VERI_AZ_ESIGI,
  bantMetni,
  konulariSirala,
  yuzdeMetni,
  zorlukAdi,
} from '../../gunluk/kurallar';
import { tarihGoster } from '../../lib/zaman';
import { bransAdi, bransListesi } from '../../ogrenme/konu';
import { Cip } from '../../ui/Cip';
import { Dugme } from '../../ui/Dugme';
import { BosDurum, HataDurumu, Yukleniyor } from '../../ui/Durumlar';
import { Ekran } from '../../ui/Ekran';
import { Ikon } from '../../ui/Ikon';
import { Kart } from '../../ui/Kart';
import { Metin } from '../../ui/Metin';
import { useGunlukAnaliz, useHaftalikOzet } from '../../uygulama/gunluk';
import { hataMesaji } from '../../uygulama/hatalar';
import { useKonular } from '../../uygulama/ogrenme';
import { CevrimdisiSerit } from '../CevrimdisiSerit';
import { GorevVerPaneli } from './GorevVerPaneli';
import { HucreAyrintisi } from './HucreAyrintisi';
import { KonuSatiri } from './KonuSatiri';

const DONEMLER: { deger: AnalizDonemi; anahtar: 'gun7' | 'gun30' | 'yariyil' }[] = [
  { deger: '7', anahtar: 'gun7' },
  { deger: '30', anahtar: 'gun30' },
  { deger: 'donem', anahtar: 'yariyil' },
];

interface GorevHedefi {
  konuId: string;
  konuAd: string;
  zorluk: Zorluk;
  soru: number;
}

function HaftalikOzetKarti({ ozet }: { ozet: HaftalikOzet }) {
  const bant = (b: HaftalikOzet['bant']['simdiki']) => bantMetni(b);
  return (
    <Kart className="gap-2" testID="haftalik-ozet">
      <Metin varyant="altBaslik" accessibilityRole="header">
        {t('mobil.gunluk.ozet.baslik')}
      </Metin>
      <Metin varyant="kucuk">
        {t('mobil.gunluk.ozet.hafta', { tarih: tarihGoster(ozet.haftaBaslangic) })}
      </Metin>
      {ozet.cozulen === 0 ? (
        <Metin varyant="ikincil">{t('mobil.gunluk.ozet.bos')}</Metin>
      ) : (
        <>
          <Metin testID="ozet-cozulen">
            {t('mobil.gunluk.ozet.cozulen', {
              n: ozet.cozulen,
              yuzde: yuzdeMetni(ozet.basari),
              dogru: ozet.dogru,
              yanlis: ozet.yanlis,
              bos: ozet.bos,
            })}
          </Metin>
          {ozet.enZayifKonular.length > 0 ? (
            <View className="gap-1" testID="ozet-zayif">
              <Metin varyant="etiket">{t('mobil.gunluk.ozet.enZayif')}</Metin>
              {ozet.enZayifKonular.map((k) => (
                <Metin key={k.konuId} varyant="ikincil">
                  {t('mobil.gunluk.ozet.zayifSatiri', {
                    konu: k.konuAd ?? '',
                    ders: bransAdi(k.bransKodu),
                    yuzde: yuzdeMetni(k.basari),
                    n: k.cozulen,
                  })}
                </Metin>
              ))}
            </View>
          ) : null}
        </>
      )}
      <View className="gap-1" testID="ozet-bant">
        <Metin varyant="etiket">{t('mobil.gunluk.ozet.bantDegisimi')}</Metin>
        <Metin varyant="ikincil">
          {t('mobil.gunluk.ozet.bantSatiri', {
            onceki: bant(ozet.bant.onceki),
            simdiki: bant(ozet.bant.simdiki),
            degisim: t(`gunlukSoru.degisim.${ozet.bant.degisim}`),
          })}
        </Metin>
      </View>
    </Kart>
  );
}

function OneriKarti({ oneri, onGorev }: { oneri: Oneri; onGorev?: (h: GorevHedefi) => void }) {
  const konu = oneri.konuAd ?? t('mobil.gunluk.analiz.konuAdsiz');
  if (oneri.tur === 'birebir_ders') {
    const metin = t('gunlukSoru.oneri.birebirDers', {
      konu,
      basari: Math.round(oneri.zorBasari * 100),
    });
    return (
      <Kart
        className="flex-row items-start gap-3 border-uyari"
        testID={`oneri-birebir-${oneri.konuId}`}
        accessible
        accessibilityLabel={metin}
      >
        <Ikon ad="person-circle-outline" boyut={24} />
        <View className="flex-1 gap-1">
          <Metin varyant="etiket">{t('mobil.gunluk.oneri.birebirBaslik')}</Metin>
          <Metin>{metin}</Metin>
        </View>
      </Kart>
    );
  }
  const metin = t('gunlukSoru.oneri.gorevOner', {
    konu,
    zorluk: zorlukAdi(oneri.zorluk).toLowerCase(),
    sayi: oneri.soruSayisi,
  });
  return (
    <Kart className="gap-2" testID={`oneri-gorev-${oneri.konuId}`}>
      <View className="flex-row items-start gap-3">
        <Ikon ad="bulb-outline" boyut={24} />
        <Metin className="flex-1">{metin}</Metin>
      </View>
      {onGorev ? (
        <Dugme
          etiket={t('mobil.gunluk.gorev.gorevVer')}
          accessibilityLabel={`${t('mobil.gunluk.gorev.gorevVer')}: ${metin}`}
          testID={`oneri-gorev-ver-${oneri.konuId}`}
          onPress={() => {
            onGorev({
              konuId: oneri.konuId,
              konuAd: konu,
              zorluk: oneri.zorluk,
              soru: oneri.soruSayisi,
            });
          }}
        />
      ) : null}
    </Kart>
  );
}

interface Props {
  /** Yoksa ogrencinin kendi analizi (oneri, haftalik ozet ve gorev verme YOK). */
  ogrenciId?: string;
  ogrenciAd?: string;
}

/**
 * Konu analizi. Ogretmen: ders + tarih araligi, haftalik ozet, kural tabanli oneriler ("Gorev ver" onayli,
 * "birebir ders gerekebilir" isareti), konu x zorluk hucreleri ve hucre ayrintisi. Ogrenci kendi
 * analizini ayni gorunumle, ONERI OLMADAN gorur.
 */
export function KonuAnaliziEkrani({ ogrenciId, ogrenciAd = '' }: Props) {
  const router = useRouter();
  const personel = !!ogrenciId;
  const konularSorgu = useKonular();
  const branslar = useMemo(() => bransListesi(konularSorgu.data ?? []), [konularSorgu.data]);
  const [secilenDers, setDers] = useState<string | null>(null);
  const ders =
    secilenDers ?? branslar.find((b) => b.kod === 'matematik')?.kod ?? branslar[0]?.kod ?? null;
  const [donem, setDonem] = useState<AnalizDonemi>('30');
  const sorgu = ders ? { bransKodu: ders, donem } : null;
  const analiz = useGunlukAnaliz(sorgu, ogrenciId);
  const ozet = useHaftalikOzet(ogrenciId ?? '', personel);
  const [ayrinti, setAyrinti] = useState<{
    konuId: string;
    zorluk: AnalizZorlugu | 'tum';
  } | null>(null);
  const [gorev, setGorev] = useState<GorevHedefi | null>(null);

  const konular = useMemo(() => konulariSirala(analiz.data?.konular ?? []), [analiz.data]);

  return (
    <Ekran ust={<CevrimdisiSerit />} kenarlar={['left', 'right', 'bottom']}>
      <Metin varyant="baslik" accessibilityRole="header">
        {personel
          ? t('mobil.gunluk.analiz.baslikOgrenci', {
              ad: ogrenciAd || t('mobil.ogrenciler.adsiz'),
            })
          : t('mobil.gunluk.analiz.baslikBen')}
      </Metin>

      {personel ? (
        ozet.isPending ? (
          <Yukleniyor />
        ) : ozet.isError ? (
          <HataDurumu mesaj={hataMesaji(ozet.error)} tekrar={() => void ozet.refetch()} />
        ) : (
          <HaftalikOzetKarti ozet={ozet.data} />
        )
      ) : null}

      <View className="gap-2">
        <Metin varyant="etiket">{t('mobil.gunluk.analiz.ders')}</Metin>
        <View
          className="flex-row flex-wrap gap-2"
          accessibilityRole="radiogroup"
          testID="analiz-dersler"
        >
          {branslar.map((b) => (
            <Cip
              key={b.kod}
              etiket={b.ad}
              secili={ders === b.kod}
              testID={`analiz-ders-${b.kod}`}
              onPress={() => {
                setDers(b.kod);
                setAyrinti(null);
                setGorev(null);
              }}
            />
          ))}
        </View>
      </View>
      <View className="gap-2">
        <Metin varyant="etiket">{t('mobil.gunluk.analiz.donem')}</Metin>
        <View
          className="flex-row flex-wrap gap-2"
          accessibilityRole="radiogroup"
          testID="analiz-donemler"
        >
          {DONEMLER.map((d) => (
            <Cip
              key={d.deger}
              etiket={t(`mobil.gunluk.analiz.${d.anahtar}`)}
              secili={donem === d.deger}
              testID={`analiz-donem-${d.deger}`}
              onPress={() => {
                setDonem(d.deger);
                setAyrinti(null);
              }}
            />
          ))}
        </View>
      </View>

      {analiz.isPending && !!sorgu ? <Yukleniyor /> : null}
      {analiz.isError && !analiz.data ? (
        <HataDurumu mesaj={hataMesaji(analiz.error)} tekrar={() => void analiz.refetch()} />
      ) : null}

      {analiz.data ? (
        <>
          <Kart
            className="gap-1"
            testID="analiz-toplam"
            accessible
            accessibilityLabel={t('mobil.gunluk.analiz.toplamEtiketi', {
              bas: tarihGoster(analiz.data.bas),
              bit: tarihGoster(analiz.data.bit),
              n: analiz.data.toplam.cozulen,
              yuzde: yuzdeMetni(analiz.data.toplam.basari),
            })}
          >
            <Metin varyant="kucuk">
              {tarihGoster(analiz.data.bas)} - {tarihGoster(analiz.data.bit)}
            </Metin>
            <Metin varyant="altBaslik">
              {t('mobil.gunluk.analiz.toplamSatiri', {
                n: analiz.data.toplam.cozulen,
                yuzde: yuzdeMetni(analiz.data.toplam.basari),
              })}
            </Metin>
            <Metin varyant="ikincil">
              {t('mobil.gunluk.kayit.ozet', {
                dogru: analiz.data.toplam.dogru,
                yanlis: analiz.data.toplam.yanlis,
                bos: analiz.data.toplam.bos,
                toplam: analiz.data.toplam.cozulen,
              })}
            </Metin>
            <Metin varyant="kucuk">
              {t('mobil.gunluk.analiz.veriAziAciklama', { n: VERI_AZ_ESIGI })}
            </Metin>
          </Kart>

          {personel && analiz.data.oneriler && analiz.data.oneriler.length > 0 ? (
            <View className="gap-3" testID="oneriler">
              <Metin varyant="altBaslik" accessibilityRole="header">
                {t('mobil.gunluk.oneri.baslik')}
              </Metin>
              <Metin varyant="kucuk">{t('mobil.gunluk.oneri.aciklama')}</Metin>
              {analiz.data.oneriler.map((o, i) => (
                <OneriKarti
                  key={`${o.tur}-${o.konuId}-${String(i)}`}
                  oneri={o}
                  onGorev={(h) => {
                    setGorev(h);
                  }}
                />
              ))}
            </View>
          ) : null}
          {personel && analiz.data.oneriler?.length === 0 && konular.length > 0 ? (
            <Metin varyant="ikincil" testID="oneri-yok">
              {t('mobil.gunluk.oneri.yok')}
            </Metin>
          ) : null}

          {gorev && ders && ogrenciId ? (
            <GorevVerPaneli
              key={`${gorev.konuId}-${gorev.zorluk}`}
              ogrenciId={ogrenciId}
              ogrenciAd={ogrenciAd}
              bransKodu={ders}
              konuId={gorev.konuId}
              konuAd={gorev.konuAd}
              zorluk={gorev.zorluk}
              soruSayisi={gorev.soru}
              kapat={() => {
                setGorev(null);
              }}
            />
          ) : null}

          {konular.length === 0 ? (
            <BosDurum ikon="stats-chart-outline" mesaj={t('mobil.gunluk.analiz.bos')} />
          ) : (
            <View className="gap-3" testID="konu-listesi">
              <Metin varyant="altBaslik" accessibilityRole="header">
                {t('mobil.gunluk.analiz.konular')}
              </Metin>
              {konular.map((k) => (
                <View key={k.konuId} className="gap-2">
                  <KonuSatiri
                    konu={k}
                    acik={ayrinti?.konuId === k.konuId ? ayrinti.zorluk : null}
                    onAc={(zorluk) => {
                      setAyrinti(
                        ayrinti?.konuId === k.konuId && ayrinti.zorluk === zorluk
                          ? null
                          : { konuId: k.konuId, zorluk },
                      );
                    }}
                  />
                  {ayrinti?.konuId === k.konuId && ders && sorgu ? (
                    <>
                      <HucreAyrintisi
                        sorgu={sorgu}
                        konuId={k.konuId}
                        konuAd={k.konuAd ?? t('mobil.gunluk.analiz.konuAdsiz')}
                        zorluk={ayrinti.zorluk}
                        {...(ogrenciId ? { ogrenciId } : {})}
                        kapat={() => {
                          setAyrinti(null);
                        }}
                      />
                      {personel &&
                      ayrinti.zorluk !== 'tum' &&
                      ayrinti.zorluk !== 'belirtilmemis' ? (
                        <Dugme
                          varyant="ikincil"
                          etiket={t('mobil.gunluk.gorev.buSeviyeden')}
                          testID="ayrinti-gorev-ver"
                          onPress={() => {
                            const z = ayrinti.zorluk;
                            if (z === 'tum' || z === 'belirtilmemis') return;
                            setGorev({
                              konuId: k.konuId,
                              konuAd: k.konuAd ?? t('mobil.gunluk.analiz.konuAdsiz'),
                              zorluk: z,
                              soru: 20,
                            });
                          }}
                        />
                      ) : null}
                    </>
                  ) : null}
                </View>
              ))}
            </View>
          )}
        </>
      ) : null}

      {personel ? (
        <Dugme
          varyant="ikincil"
          etiket={t('mobil.gunluk.kitap.ilerleme')}
          testID="kitap-ilerleme-ac"
          onPress={() => {
            router.push({ pathname: '/kaynak-kitaplar', params: { ogrenciId, ad: ogrenciAd } });
          }}
        />
      ) : null}
    </Ekran>
  );
}
