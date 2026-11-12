import { t } from '@kopru/i18n';
import { useQueryClient, type InfiniteData } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import * as WebBrowser from 'expo-web-browser';
import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, View } from 'react-native';

import type { KayitDetayi, KayitSatiri, KayitSayfasi, KayitSuzgeci } from '../api/kayitTipleri';
import {
  kayitDurumMetni,
  saglayiciAdi,
  saglayiciIkonu,
  suresiDolduMu,
  tarihAraligi,
  type TarihSecimi,
} from '../kayit/kurallar';
import { bugunTarihi, gunBasligi, yerelTarih } from '../lib/saat';
import { bransAdi } from '../ogrenme/konu';
import { useTema } from '../tema/TemaSaglayici';
import { Cip } from '../ui/Cip';
import { Dugme } from '../ui/Dugme';
import { BosDurum, HataDurumu, Yukleniyor } from '../ui/Durumlar';
import { Ekran } from '../ui/Ekran';
import { Ikon } from '../ui/Ikon';
import { Kart } from '../ui/Kart';
import { Metin } from '../ui/Metin';
import { useAktif, useServisler } from '../uygulama/baglam';
import { hataMesaji } from '../uygulama/hatalar';
import { useKayitlarim } from '../uygulama/kayit';
import { useSaatDilimi } from '../uygulama/operasyon';
import { CevrimdisiSerit } from './CevrimdisiSerit';
import { SorunBildirimi } from './SorunBildirimi';

type Liste = InfiniteData<KayitSayfasi, string | null>;

/** Yalniz guvenli (https) baglantilar uygulama ici tarayicida acilir. */
export function acilabilirMi(url: string): boolean {
  return /^https:\/\//i.test(url.trim());
}

function SuzgecGruplari({
  tur,
  setTur,
  brans,
  setBrans,
  bransKodlari,
  tarih,
  setTarih,
}: {
  tur: KayitSuzgeci['tur'] | 'hepsi';
  setTur: (v: 'hepsi' | 'kayit' | 'materyal') => void;
  brans: string | null;
  setBrans: (v: string | null) => void;
  bransKodlari: string[];
  tarih: TarihSecimi;
  setTarih: (v: TarihSecimi) => void;
}) {
  const turler = ['hepsi', 'kayit', 'materyal'] as const;
  const tarihler = [
    ['hepsi', 'mobil.kayit.suzgec.hepsi'],
    ['bugun', 'mobil.kayit.suzgec.bugun'],
    ['yedi', 'mobil.kayit.suzgec.yediGun'],
    ['otuz', 'mobil.kayit.suzgec.otuzGun'],
  ] as const;
  return (
    <View className="gap-3">
      <View className="gap-1">
        <Metin varyant="kucuk">{t('mobil.kayit.suzgec.tur')}</Metin>
        <View className="flex-row flex-wrap gap-2">
          {turler.map((x) => (
            <Cip
              key={x}
              etiket={t(`mobil.kayit.suzgec.${x}`)}
              secili={tur === x}
              testID={`suzgec-tur-${x}`}
              onPress={() => {
                setTur(x);
              }}
            />
          ))}
        </View>
      </View>
      {bransKodlari.length > 1 ? (
        <View className="gap-1">
          <Metin varyant="kucuk">{t('mobil.kayit.suzgec.brans')}</Metin>
          <View className="flex-row flex-wrap gap-2">
            <Cip
              etiket={t('mobil.kayit.suzgec.hepsi')}
              secili={brans === null}
              testID="suzgec-brans-hepsi"
              onPress={() => {
                setBrans(null);
              }}
            />
            {bransKodlari.map((k) => (
              <Cip
                key={k}
                etiket={bransAdi(k)}
                secili={brans === k}
                testID={`suzgec-brans-${k}`}
                onPress={() => {
                  setBrans(k);
                }}
              />
            ))}
          </View>
        </View>
      ) : null}
      <View className="gap-1">
        <Metin varyant="kucuk">{t('mobil.kayit.suzgec.tarih')}</Metin>
        <View className="flex-row flex-wrap gap-2">
          {tarihler.map(([k, anahtar]) => (
            <Cip
              key={k}
              etiket={t(anahtar)}
              secili={tarih === k}
              testID={`suzgec-tarih-${k}`}
              onPress={() => {
                setTarih(k);
              }}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

type SuzgecProps = Parameters<typeof SuzgecGruplari>[0];

/**
 * Suzgec tek satira iner: "Suzgec" dugmesi + secili suzgeclerin ozeti. Gruplar dugmeyle acilir.
 * Gerekce: 3 ayri cip satiri (tur, brans, tarih) ekranin ust ucte birini kapliyordu; kayit listesi
 * ilk bakista gorunsun diye varsayilan kapali, secim durumu ozetle (metinle) her zaman gorunur.
 */
function Suzgecler(p: SuzgecProps) {
  const { renkler } = useTema();
  const [acik, setAcik] = useState(false);
  const secili = [
    p.tur !== 'hepsi' ? t(`mobil.kayit.suzgec.${p.tur === 'kayit' ? 'kayit' : 'materyal'}`) : null,
    p.brans ? bransAdi(p.brans) : null,
    p.tarih === 'bugun'
      ? t('mobil.kayit.suzgec.bugun')
      : p.tarih === 'yedi'
        ? t('mobil.kayit.suzgec.yediGun')
        : p.tarih === 'otuz'
          ? t('mobil.kayit.suzgec.otuzGun')
          : null,
  ].filter(Boolean);
  const ozet = secili.length > 0 ? secili.join(' · ') : t('mobil.kayit.suzgec.tumu');
  return (
    <View className="gap-3" testID="kayit-suzgecler">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${t('mobil.kayit.suzgec.baslik')}: ${ozet}`}
        accessibilityState={{ expanded: acik }}
        testID="suzgec-ac"
        onPress={() => {
          setAcik(!acik);
        }}
        className="min-h-dokunma flex-row items-center gap-2 rounded-buyuk border border-kenar bg-yuzey px-4 active:opacity-80"
      >
        <Ikon ad="options-outline" boyut={20} renk={renkler.metin} />
        <Metin varyant="etiket">{t('mobil.kayit.suzgec.baslik')}</Metin>
        <Metin varyant="ikincil" className="flex-1" numberOfLines={1}>
          {ozet}
        </Metin>
        <Ikon ad={acik ? 'chevron-up' : 'chevron-down'} boyut={18} renk={renkler.metin} />
      </Pressable>
      {acik ? <SuzgecGruplari {...p} /> : null}
    </View>
  );
}

function KayitKarti({
  kayit,
  tz,
  simdi,
  aciliyor,
  onAc,
  onIzledim,
}: {
  kayit: KayitSatiri;
  tz: string;
  simdi: number;
  aciliyor: boolean;
  onAc: (k: KayitSatiri) => void;
  onIzledim: (k: KayitSatiri) => void;
}) {
  const { renkler } = useTema();
  const durum = kayitDurumMetni(kayit, simdi);
  const saglayici = saglayiciAdi(kayit.saglayici);
  const gun = kayit.dersBaslangic ? gunBasligi(yerelTarih(kayit.dersBaslangic, tz)) : null;
  const uyari = kayit.bozuk || suresiDolduMu(kayit, simdi);
  return (
    <View
      className={`gap-2 rounded-buyuk border bg-yuzey p-4 ${
        kayit.izlendi ? 'border-kenar' : 'border-birincil'
      }`}
      testID={`kayit-${kayit.id}`}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('mobil.kayit.satirEtiketi', {
          baslik: kayit.baslik,
          saglayici,
          durum,
        })}
        testID={`kayit-ac-${kayit.id}`}
        disabled={aciliyor}
        onPress={() => {
          onAc(kayit);
        }}
        className="min-h-dokunma gap-1 active:opacity-80"
      >
        <View className="flex-row items-start gap-3">
          <View className="pt-1">
            {aciliyor ? (
              <ActivityIndicator color={renkler.birincil} />
            ) : (
              <Ikon ad={saglayiciIkonu(kayit.saglayici)} boyut={26} renk={renkler.birincil} />
            )}
          </View>
          <View className="flex-1 gap-1">
            <Metin varyant="altBaslik">{kayit.baslik}</Metin>
            <Metin varyant="ikincil">
              {[
                saglayici,
                kayit.tur === 'materyal' ? t('mobil.kayit.materyal') : null,
                kayit.bransKodu ? bransAdi(kayit.bransKodu) : null,
                gun,
              ]
                .filter(Boolean)
                .join(' · ')}
            </Metin>
          </View>
        </View>
      </Pressable>
      <View className="flex-row items-center justify-between gap-2">
        <View className="flex-1 flex-row flex-wrap items-center gap-x-3 gap-y-1">
          <View className="flex-row items-center gap-1">
            <Ikon
              ad={kayit.izlendi ? 'checkmark-circle' : 'ellipse-outline'}
              boyut={14}
              renk={kayit.izlendi ? renkler.birincil : renkler.metinIkincil}
            />
            <Metin varyant="kucuk">
              {kayit.izlendi ? t('mobil.kayit.izlendi') : t('mobil.kayit.yeni')}
            </Metin>
          </View>
          {kayit.parolaVar ? (
            <View className="flex-row items-center gap-1">
              <Ikon ad="key-outline" boyut={14} renk={renkler.metinIkincil} />
              <Metin varyant="kucuk">{t('mobil.kayit.parolaVar')}</Metin>
            </View>
          ) : null}
          {uyari ? (
            <View className="flex-row items-center gap-1" testID={`kayit-uyari-${kayit.id}`}>
              <Ikon ad="warning-outline" boyut={14} renk={renkler.hata} />
              <Metin varyant="kucuk" className="text-hata">
                {suresiDolduMu(kayit, simdi)
                  ? t('mobil.kayit.suresiDoldu')
                  : t('mobil.kayit.bozuk')}
              </Metin>
            </View>
          ) : null}
        </View>
        {!kayit.izlendi ? (
          <Dugme
            varyant="ikincil"
            etiket={t('mobil.kayit.izledim')}
            accessibilityLabel={t('mobil.kayit.izledimEtiket', { baslik: kayit.baslik })}
            testID={`kayit-izledim-${kayit.id}`}
            onPress={() => {
              onIzledim(kayit);
            }}
          />
        ) : null}
      </View>
    </View>
  );
}

interface SonAcilan {
  kayit: KayitDetayi;
  kopyalandi: boolean;
}

/**
 * Ogrenci "Kayitlarim": izlenmemisler ustte, suzgec (tur, brans, tarih), sonsuz kaydirma (imlec).
 * Kayda dokunmak 2. dokunustur: tekil okuma (parola dahil) -> parola varsa panoya kopyalanir ->
 * uygulama ici tarayicida acilir. "Izledim" ogrencinin acik eylemidir: tarayicidan donunce
 * "Kaydi izledin mi?" karti cikar (Izledim / Acilmiyor / Sonra), satirdaki "Izledim" dugmesi de ayni isi yapar.
 */
export function KayitlarimEkrani() {
  const qc = useQueryClient();
  const { adaptorler } = useServisler();
  const uyelikId = useAktif()?.uyelik.uyelikId;
  const { tz } = useSaatDilimi();
  const bugun = bugunTarihi(tz);
  const [simdi] = useState(() => Date.now());

  const [tur, setTur] = useState<'hepsi' | 'kayit' | 'materyal'>('hepsi');
  const [brans, setBrans] = useState<string | null>(null);
  const [tarih, setTarih] = useState<TarihSecimi>('hepsi');
  const [bilinenBranslar, setBilinenBranslar] = useState<string[]>([]);

  const suzgec = useMemo<KayitSuzgeci>(
    () => ({
      ...(tur !== 'hepsi' ? { tur } : {}),
      ...(brans ? { bransKodu: brans } : {}),
      ...tarihAraligi(tarih, bugun),
    }),
    [tur, brans, tarih, bugun],
  );
  const sorgu = useKayitlarim(suzgec);
  const kayitlar = useMemo(() => sorgu.data?.pages.flatMap((s) => s.kayitlar) ?? [], [sorgu.data]);

  // Brans cipleri yuklenen satirlardan birikir (suzgec daralsa da secenekler kaybolmaz).
  const yeniBrans = kayitlar.map((k) => k.bransKodu).filter((k): k is string => !!k);
  if (yeniBrans.some((k) => !bilinenBranslar.includes(k))) {
    setBilinenBranslar([...new Set([...bilinenBranslar, ...yeniBrans])].sort());
  }

  const [aciliyor, setAciliyor] = useState<string | null>(null);
  const [son, setSon] = useState<SonAcilan | null>(null);
  const [bildirim, setBildirim] = useState<string | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [sorunKaydi, setSorunKaydi] = useState<{ id: string; baslik: string } | null>(null);

  /** Listedeki satiri yerinde gunceller (yeniden siralama yok: parmagin altinda ziplama olmaz). */
  function satiriGuncelle(id: string, degisim: Partial<KayitSatiri>) {
    qc.setQueriesData<Liste>({ queryKey: ['kayit', uyelikId, 'liste'] }, (eski) =>
      eski
        ? {
            ...eski,
            pages: eski.pages.map((s) => ({
              ...s,
              kayitlar: s.kayitlar.map((k) => (k.id === id ? { ...k, ...degisim } : k)),
            })),
          }
        : eski,
    );
  }

  async function izledimIsaretle(k: { id: string }) {
    setHata(null);
    try {
      const r = await adaptorler.kayit.izledim(k.id);
      satiriGuncelle(k.id, { izlendi: true, izlediAt: r.izlediAt });
      setSon((s) => (s?.kayit.id === k.id ? null : s));
      setBildirim(t('mobil.kayit.izledimTamam'));
    } catch (e) {
      setHata(hataMesaji(e));
    }
  }

  async function ac(k: KayitSatiri) {
    setHata(null);
    setBildirim(null);
    setAciliyor(k.id);
    try {
      const d = await adaptorler.kayit.kayit(k.id);
      if (!acilabilirMi(d.url)) {
        setHata(t('mobil.kayit.acilamadi'));
        return;
      }
      let kopyalandi = false;
      if (d.parola) {
        try {
          await Clipboard.setStringAsync(d.parola);
          kopyalandi = true;
        } catch {
          kopyalandi = false;
        }
      }
      setSon({ kayit: d, kopyalandi });
      setAciliyor(null);
      await WebBrowser.openBrowserAsync(d.url);
    } catch (e) {
      setHata(hataMesaji(e));
    } finally {
      setAciliyor(null);
    }
  }

  async function parolayiKopyala() {
    if (!son?.kayit.parola) return;
    await Clipboard.setStringAsync(son.kayit.parola);
    setSon({ ...son, kopyalandi: true });
  }

  const suzgecVar = tur !== 'hepsi' || brans !== null || tarih !== 'hepsi';
  const baslik = (
    <View className="gap-4 pb-2">
      <Suzgecler
        tur={tur}
        setTur={setTur}
        brans={brans}
        setBrans={setBrans}
        bransKodlari={bilinenBranslar}
        tarih={tarih}
        setTarih={setTarih}
      />
      {bildirim ? (
        <Kart accessibilityLiveRegion="polite" testID="kayit-bildirim">
          <Metin varyant="etiket">{bildirim}</Metin>
        </Kart>
      ) : null}
      {hata ? (
        <Kart className="border-hata" accessibilityRole="alert" testID="kayit-hata">
          <Metin varyant="etiket" className="text-hata">
            {hata}
          </Metin>
        </Kart>
      ) : null}
      {son ? (
        <Kart className="gap-3 border-birincil" testID="kayit-izledin-mi">
          <View className="gap-1">
            <Metin varyant="altBaslik" accessibilityRole="header">
              {t('mobil.kayit.sorBaslik')}
            </Metin>
            <Metin varyant="ikincil">
              {t('mobil.kayit.sorMetin', { baslik: son.kayit.baslik })}
            </Metin>
            {son.kayit.parola ? (
              <Metin varyant="kucuk" accessibilityLiveRegion="polite" testID="kayit-parola-durum">
                {son.kopyalandi ? t('mobil.kayit.parolaKopyalandi') : t('mobil.kayit.parolaVar')}
              </Metin>
            ) : null}
          </View>
          <View className="flex-row flex-wrap gap-2">
            <Dugme
              etiket={t('mobil.kayit.izledim')}
              testID="kayit-son-izledim"
              onPress={() => {
                void izledimIsaretle(son.kayit);
              }}
            />
            <Dugme
              varyant="ikincil"
              etiket={t('mobil.kayit.sorun.dugme')}
              testID="kayit-son-sorun"
              onPress={() => {
                setSorunKaydi({ id: son.kayit.id, baslik: son.kayit.baslik });
              }}
            />
            {son.kayit.parola ? (
              <Dugme
                varyant="ikincil"
                etiket={t('mobil.kayit.parolaKopyala')}
                testID="kayit-parola-kopyala"
                onPress={() => {
                  void parolayiKopyala();
                }}
              />
            ) : null}
            <Dugme
              varyant="hayalet"
              etiket={t('mobil.kayit.sonra')}
              accessibilityLabel={t('mobil.kayit.sonraEtiket')}
              onPress={() => {
                setSon(null);
              }}
            />
          </View>
        </Kart>
      ) : null}
    </View>
  );

  return (
    <>
      <Ekran kaydir={false} kenarlar={['left', 'right']} ust={<CevrimdisiSerit />}>
        {sorgu.isPending ? <Yukleniyor /> : null}
        {sorgu.isError && !sorgu.data ? (
          <HataDurumu mesaj={hataMesaji(sorgu.error)} tekrar={() => void sorgu.refetch()} />
        ) : null}
        {sorgu.data ? (
          <FlatList
            data={kayitlar}
            keyExtractor={(k) => k.id}
            contentContainerClassName="gap-3 pb-8 grow"
            keyboardShouldPersistTaps="handled"
            ListHeaderComponent={baslik}
            refreshing={sorgu.isRefetching && !sorgu.isFetchingNextPage}
            onRefresh={() => {
              void sorgu.refetch();
            }}
            onEndReachedThreshold={0.5}
            onEndReached={() => {
              if (sorgu.hasNextPage && !sorgu.isFetchingNextPage) void sorgu.fetchNextPage();
            }}
            ListEmptyComponent={
              suzgecVar ? (
                <View className="items-center gap-2">
                  <BosDurum ikon="calendar-outline" mesaj={t('mobil.kayit.bosSuzgec')} />
                  <Dugme
                    varyant="ikincil"
                    etiket={t('mobil.kayit.suzgecTemizle')}
                    onPress={() => {
                      setTur('hepsi');
                      setBrans(null);
                      setTarih('hepsi');
                    }}
                  />
                </View>
              ) : (
                <BosDurum ikon="calendar-outline" mesaj={t('mobil.kayit.bos')} />
              )
            }
            ListFooterComponent={
              sorgu.isFetchingNextPage ? <Yukleniyor etiket={t('mobil.kayit.daha')} /> : undefined
            }
            renderItem={({ item }) => (
              <KayitKarti
                kayit={item}
                tz={tz}
                simdi={simdi}
                aciliyor={aciliyor === item.id}
                onAc={(k) => void ac(k)}
                onIzledim={(k) => void izledimIsaretle(k)}
              />
            )}
          />
        ) : null}
      </Ekran>
      {sorunKaydi ? (
        <SorunBildirimi
          kayitId={sorunKaydi.id}
          baslik={sorunKaydi.baslik}
          kapat={(gonderildi) => {
            if (gonderildi) {
              satiriGuncelle(sorunKaydi.id, { bozuk: true });
              setBildirim(t('mobil.kayit.sorun.gonderildi'));
              setSon((s) => (s?.kayit.id === sorunKaydi.id ? null : s));
            }
            setSorunKaydi(null);
          }}
        />
      ) : null}
    </>
  );
}
