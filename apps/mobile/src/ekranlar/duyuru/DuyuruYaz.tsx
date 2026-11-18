import { DUYURU_BASLIK_EN_FAZLA, DUYURU_GOVDE_EN_FAZLA } from '@kopru/contracts';
import { t } from '@kopru/i18n';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, TextInput, View } from 'react-native';

import type { Duyuru, DuyuruAliciRol, DuyuruOlustur } from '../../api/bildirimTipleri';
import { useTema } from '../../tema/TemaSaglayici';
import { Anahtar } from '../../ui/Anahtar';
import { Cip } from '../../ui/Cip';
import { Dugme } from '../../ui/Dugme';
import { BosDurum, HataDurumu, Yukleniyor } from '../../ui/Durumlar';
import { Ekran } from '../../ui/Ekran';
import { Metin } from '../../ui/Metin';
import { MetinGirdisi } from '../../ui/MetinGirdisi';
import { useAktif } from '../../uygulama/baglam';
import { useDuyuru, useDuyuruIslemleri } from '../../uygulama/duyuru';
import { hataMesaji } from '../../uygulama/hatalar';
import { grupEtiketi, useGruplar } from '../../uygulama/operasyon';
import { CevrimdisiSerit } from '../CevrimdisiSerit';

/** `kurum` secimi: yalniz yonetici ve sahip tum kuruma duyuru yapar. */
const KURUM = 'kurum';

/**
 * Basit duyuru yazma formu: baslik, govde (sayacli), hedef (ogretmen kendi gruplari; yonetici ve
 * sahip grup ya da tum kurum), sabitle, anlik bildirim anahtari. "Taslak kaydet" ya da onayli
 * "Yayinla". `id` verilirse mevcut taslak duzenlenir.
 */
function Form({ id, ilk }: { id?: string; ilk?: Duyuru }) {
  const router = useRouter();
  const { renkler } = useTema();
  const aktif = useAktif();
  const yonetici = aktif?.uyelik.rol === 'yonetici' || aktif?.uyelik.rol === 'sahip';
  const gruplar = useGruplar();
  const islem = useDuyuruIslemleri();

  const [baslik, setBaslik] = useState(ilk?.baslik ?? '');
  const [govde, setGovde] = useState(ilk?.govde ?? '');
  const [hedef, setHedef] = useState<string | null>(
    ilk
      ? ilk.hedef_turu === 'grup'
        ? ilk.hedef_id
        : ilk.hedef_turu === 'kurum'
          ? KURUM
          : null
      : null,
  );
  const [roller, setRoller] = useState<DuyuruAliciRol[]>(ilk?.hedef_roller ?? ['ogrenci']);
  const [sabit, setSabit] = useState(ilk?.sabit ?? false);
  const [push, setPush] = useState(ilk?.push_gonderildi ?? true);
  const [hata, setHata] = useState<string | null>(null);

  const grupListesi = gruplar.data ?? [];
  const hedefEtiketi =
    hedef === KURUM
      ? t('mobil.duyuru.yaz.hedefKurum')
      : (() => {
          const g = grupListesi.find((x) => x.id === hedef);
          return g ? grupEtiketi(g) : '';
        })();
  const kayitta = islem.taslak.isPending || islem.guncelle.isPending || islem.yayinla.isPending;
  const gecerli =
    baslik.trim() !== '' && govde.trim() !== '' && hedef !== null && roller.length > 0;

  function govdeOlustur(): DuyuruOlustur | null {
    if (hedef === null) return null;
    return {
      baslik: baslik.trim(),
      govde: govde.trim(),
      hedef_turu: hedef === KURUM ? 'kurum' : 'grup',
      ...(hedef === KURUM ? {} : { hedef_id: hedef }),
      hedef_roller: hedef === KURUM ? roller : ['ogrenci'],
      sabit,
      push_gonderildi: push,
    };
  }

  /** Taslagi olusturur ya da gunceller; sonucun kimligini dondurur. */
  async function taslagiKaydet(): Promise<string | null> {
    const g = govdeOlustur();
    if (!g || !gecerli) {
      setHata(t('mobil.duyuru.yaz.eksik'));
      return null;
    }
    setHata(null);
    try {
      if (id) {
        const d = await islem.guncelle.mutateAsync({ id, g });
        return d.id;
      }
      const d = await islem.taslak.mutateAsync(g);
      return d.id;
    } catch (e) {
      setHata(hataMesaji(e));
      return null;
    }
  }

  async function kaydet() {
    const kimlik = await taslagiKaydet();
    if (kimlik) router.replace({ pathname: '/duyuru/[id]', params: { id: kimlik } });
  }

  function yayinla() {
    if (!gecerli) {
      setHata(t('mobil.duyuru.yaz.eksik'));
      return;
    }
    Alert.alert(
      t('mobil.duyuru.yaz.onayBaslik'),
      t('mobil.duyuru.yaz.onay', { baslik: baslik.trim(), hedef: hedefEtiketi }) +
        (push ? t('mobil.duyuru.yaz.onayPush') : ''),
      [
        { text: t('ortak.iptal'), style: 'cancel' },
        {
          text: t('mobil.duyuru.yaz.yayinla'),
          onPress: () => {
            void (async () => {
              const kimlik = await taslagiKaydet();
              if (!kimlik) return;
              try {
                await islem.yayinla.mutateAsync(kimlik);
              } catch (e) {
                // Taslak kaydedildi; yayin olmadi. Kullanici detaydan yeniden deneyebilir.
                setHata(hataMesaji(e));
                return;
              }
              router.replace({ pathname: '/duyuru/[id]', params: { id: kimlik } });
            })();
          },
        },
      ],
    );
  }

  function rolDegistir(r: DuyuruAliciRol) {
    setRoller((o) => {
      const var_ = o.includes(r);
      if (var_ && o.length === 1) return o;
      return var_ ? o.filter((x) => x !== r) : [...o, r];
    });
  }

  return (
    <Ekran klavye ust={<CevrimdisiSerit />} kenarlar={['left', 'right', 'bottom']}>
      <>
        <MetinGirdisi
          etiket={t('mobil.duyuru.yaz.baslikAlani')}
          value={baslik}
          onChangeText={setBaslik}
          maxLength={DUYURU_BASLIK_EN_FAZLA}
          testID="duyuru-baslik"
        />
        <View className="gap-2">
          <Metin varyant="etiket">{t('mobil.duyuru.yaz.govdeAlani')}</Metin>
          <TextInput
            value={govde}
            onChangeText={setGovde}
            multiline
            maxLength={DUYURU_GOVDE_EN_FAZLA}
            textAlignVertical="top"
            accessibilityLabel={t('mobil.duyuru.yaz.govdeAlani')}
            accessibilityHint={t('mobil.duyuru.yaz.govdeIpucu')}
            placeholderTextColor={renkler.metinIkincil}
            maxFontSizeMultiplier={1.5}
            testID="duyuru-govde-girdi"
            className="min-h-40 rounded-orta border border-kenar bg-yuzey p-4 font-govde text-md text-metin"
            style={{ color: renkler.metin }}
          />
          <View className="flex-row justify-between gap-2">
            <Metin varyant="kucuk" className="flex-1">
              {t('mobil.duyuru.yaz.govdeIpucu')}
            </Metin>
            <Metin varyant="kucuk" accessibilityLiveRegion="polite" testID="duyuru-sayac">
              {t('mobil.duyuru.yaz.sayac', { n: govde.length, max: DUYURU_GOVDE_EN_FAZLA })}
            </Metin>
          </View>
        </View>

        <View className="gap-2">
          <Metin varyant="etiket">{t('mobil.duyuru.yaz.hedef')}</Metin>
          {gruplar.isPending ? <Yukleniyor /> : null}
          {!yonetici && gruplar.data && grupListesi.length === 0 ? (
            <BosDurum ikon="chatbubbles-outline" mesaj={t('mobil.duyuru.yaz.hedefYok')} />
          ) : null}
          <View className="flex-row flex-wrap gap-2">
            {yonetici ? (
              <Cip
                etiket={t('mobil.duyuru.yaz.hedefKurum')}
                secili={hedef === KURUM}
                testID="duyuru-hedef-kurum"
                onPress={() => {
                  setHedef(KURUM);
                }}
              />
            ) : null}
            {grupListesi.map((g) => (
              <Cip
                key={g.id}
                etiket={grupEtiketi(g)}
                secili={hedef === g.id}
                testID={`duyuru-hedef-${g.id}`}
                onPress={() => {
                  setHedef(g.id);
                }}
              />
            ))}
          </View>
        </View>

        {yonetici && hedef === KURUM ? (
          <View className="gap-2">
            <Metin varyant="etiket">{t('mobil.duyuru.yaz.roller')}</Metin>
            <View className="flex-row flex-wrap gap-2">
              {(['ogrenci', 'ogretmen'] as const).map((r) => (
                <Cip
                  key={r}
                  etiket={t(`mobil.duyuru.rol.${r}`)}
                  secili={roller.includes(r)}
                  onPress={() => {
                    rolDegistir(r);
                  }}
                />
              ))}
            </View>
          </View>
        ) : null}

        <Anahtar
          etiket={t('mobil.duyuru.yaz.sabitle')}
          aciklama={t('mobil.duyuru.yaz.sabitleAciklama')}
          deger={sabit}
          onDegis={setSabit}
        />
        <Anahtar
          etiket={t('mobil.duyuru.yaz.pushGonder')}
          aciklama={t('mobil.duyuru.yaz.pushAciklama')}
          deger={push}
          onDegis={setPush}
        />

        {hata ? (
          <Metin varyant="ikincil" className="text-hata" accessibilityLiveRegion="polite">
            {hata}
          </Metin>
        ) : null}
        <View className="gap-2">
          <Dugme
            etiket={t('mobil.duyuru.yaz.yayinla')}
            testID="duyuru-yayinla-dugme"
            disabled={kayitta}
            yukleniyor={islem.yayinla.isPending}
            onPress={yayinla}
          />
          <Dugme
            varyant="ikincil"
            etiket={t('mobil.duyuru.yaz.taslakKaydet')}
            testID="duyuru-taslak-dugme"
            disabled={kayitta}
            yukleniyor={islem.taslak.isPending || islem.guncelle.isPending}
            onPress={() => {
              void kaydet();
            }}
          />
        </View>
      </>
    </Ekran>
  );
}

/** Yeni duyuru ya da mevcut taslagin duzenlenmesi; taslak yuklenince form onunla baslar. */
export function DuyuruYaz({ id }: { id?: string }) {
  const duzenlenen = useDuyuru(id ?? '');
  if (!id) return <Form />;
  return (
    <Ekran ust={<CevrimdisiSerit />} kenarlar={['left', 'right', 'bottom']}>
      {duzenlenen.isPending ? <Yukleniyor /> : null}
      {duzenlenen.isError ? (
        <HataDurumu
          mesaj={hataMesaji(duzenlenen.error)}
          tekrar={() => {
            void duzenlenen.refetch();
          }}
        />
      ) : null}
      {duzenlenen.data?.yonetim ? <Form id={id} ilk={duzenlenen.data.yonetim} /> : null}
    </Ekran>
  );
}
