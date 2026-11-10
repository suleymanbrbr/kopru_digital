import { t } from '@kopru/i18n';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import type { PlanGorevi } from '../api/ogrenmeTipleri';
import { gunKisa, gunNumarasi, bugunTarihi } from '../lib/saat';
import {
  gerceklesenKuyrugaAl,
  PLAN_GERCEKLESEN_TURU,
  type PlanGerceklesenYuku,
} from '../offline/plan';
import {
  gorevOrani,
  gorevSayilari,
  gunBasligi,
  gunGorevleri,
  haftaBaslangici,
  haftaEtiketi,
  haftaGunleri,
  haftaKaydir,
} from '../ogrenme/hafta';
import { bransAdi, konuEtiketi } from '../ogrenme/konu';
import { Dugme } from '../ui/Dugme';
import { BosDurum, HataDurumu, Yukleniyor } from '../ui/Durumlar';
import { Ikon } from '../ui/Ikon';
import { Kart } from '../ui/Kart';
import { Metin } from '../ui/Metin';
import { MetinGirdisi } from '../ui/MetinGirdisi';
import { useAktif, useServisler } from '../uygulama/baglam';
import { hataMesaji } from '../uygulama/hatalar';
import { gerceklesenIyimser, useKonuHaritasi, usePlanim } from '../uygulama/ogrenme';
import { useKuyruk, useSaatDilimi } from '../uygulama/operasyon';

const DURUM_IKON = {
  bekliyor: 'ellipse-outline',
  tamam: 'checkmark-circle',
  kismen: 'contrast-outline',
  yapilmadi: 'close-circle-outline',
  devredildi: 'arrow-forward-circle-outline',
} as const;

/** Gorev basligi: ozel baslik, yoksa konu ya da brans adi. */
export function gorevAdi(
  g: Pick<PlanGorevi, 'baslik' | 'konuId' | 'bransKodu'>,
  konular: Map<string, { ad: string; kullanimdanKalkti: boolean }>,
): string {
  if (g.baslik) return g.baslik;
  const konu = g.konuId ? konular.get(g.konuId) : undefined;
  return konu ? konuEtiketi(konu) : bransAdi(g.bransKodu);
}

export function hedefMetni(g: Pick<PlanGorevi, 'hedefTuru' | 'hedefMiktar'>): string {
  return g.hedefTuru === 'soru'
    ? t('mobil.ogrenme.plan.hedefSoru', { n: g.hedefMiktar })
    : t('mobil.ogrenme.plan.hedefDakika', { n: g.hedefMiktar });
}

/** "12 / 20 soru" gibi ilerleme metni. */
export function ilerlemeMetni(g: PlanGorevi): string {
  const yapilan = g.gerceklesen ?? 0;
  return g.hedefTuru === 'soru'
    ? t('mobil.ogrenme.plan.ilerlemeSoru', { yapilan, hedef: g.hedefMiktar })
    : t('mobil.ogrenme.plan.ilerlemeDakika', { yapilan, hedef: g.hedefMiktar });
}

function GorevKarti({
  gorev,
  ad,
  kilitli,
  bekliyor,
}: {
  gorev: PlanGorevi;
  ad: string;
  kilitli: boolean;
  bekliyor: boolean;
}) {
  const qc = useQueryClient();
  const { adaptorler, kuyruk } = useServisler();
  const uyelikId = useAktif()?.uyelik.uyelikId;
  const [acik, setAcik] = useState(false);
  const [miktar, setMiktar] = useState(String(gorev.gerceklesen ?? gorev.hedefMiktar));
  const [hata, setHata] = useState<string | null>(null);
  const [mesaj, setMesaj] = useState<string | null>(null);

  const duzenlenebilir = !kilitli && gorev.durum !== 'devredildi';
  const devretmeUygun = duzenlenebilir && gorev.durum !== 'tamam' && !bekliyor;

  const devret = useMutation({
    networkMode: 'always',
    mutationFn: () => adaptorler.ogrenme.gorevDevret(gorev.id),
    onSuccess: () => {
      setAcik(false);
      setMesaj(t('mobil.ogrenme.plan.devredildi'));
      void qc.invalidateQueries({ queryKey: ['plan'] });
    },
    onError: (e) => {
      setHata(hataMesaji(e));
    },
  });

  function kaydet() {
    setMesaj(null);
    if (!/^\d{1,6}$/.test(miktar.trim()) || Number(miktar) > 100_000) {
      setHata(t('mobil.ogrenme.plan.miktarHata'));
      return;
    }
    setHata(null);
    const n = Number(miktar);
    // Iyimser: arayuz hemen guncellenir; kuyruk (cevrimdisiysa baglanti gelince) gonderir.
    gerceklesenIyimser(qc, uyelikId, gorev.id, n);
    const yuk: PlanGerceklesenYuku = {
      gorevId: gorev.id,
      gorevBaslik: ad,
      gun: gorev.gun,
      miktar: n,
    };
    gerceklesenKuyrugaAl(kuyruk, yuk);
    setAcik(false);
  }

  const durumEtiketi = t(`mobil.ogrenme.plan.durum.${gorev.durum}`);
  const oran = gorevOrani(gorev);
  return (
    <Kart className="gap-3" testID={`gorev-${gorev.id}`}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${ad}, ${hedefMetni(gorev)}, ${ilerlemeMetni(gorev)}, ${durumEtiketi}`}
        accessibilityHint={duzenlenebilir ? t('mobil.ogrenme.plan.gorevIpucu') : undefined}
        accessibilityState={{ expanded: acik, disabled: !duzenlenebilir }}
        disabled={!duzenlenebilir}
        onPress={() => {
          setAcik((a) => !a);
          setMesaj(null);
        }}
        className="min-h-dokunma gap-2 active:opacity-80"
      >
        <View className="flex-row items-center gap-3">
          <Ikon ad={DURUM_IKON[gorev.durum]} boyut={24} />
          <View className="flex-1">
            <Metin varyant="altBaslik">{ad}</Metin>
            <Metin varyant="ikincil">
              {hedefMetni(gorev)} · {durumEtiketi}
            </Metin>
          </View>
        </View>
        <View className="h-2 overflow-hidden rounded-tam bg-yuzeyIkincil">
          <View
            className="h-2 rounded-tam bg-birincil"
            style={{ width: `${String(oran * 100)}%` }}
          />
        </View>
        <Metin varyant="kucuk">{ilerlemeMetni(gorev)}</Metin>
        {bekliyor ? (
          <View className="flex-row items-center gap-1" testID={`gorev-bekliyor-${gorev.id}`}>
            <Ikon ad="cloud-upload-outline" boyut={14} />
            <Metin varyant="kucuk">{t('mobil.ogrenme.plan.gonderilmeyiBekliyor')}</Metin>
          </View>
        ) : null}
      </Pressable>

      {mesaj ? (
        <Metin varyant="ikincil" accessibilityLiveRegion="polite">
          {mesaj}
        </Metin>
      ) : null}

      {acik ? (
        <View className="gap-3 border-t border-kenar pt-3">
          <MetinGirdisi
            etiket={
              gorev.hedefTuru === 'soru'
                ? t('mobil.ogrenme.plan.gerceklesenSoru')
                : t('mobil.ogrenme.plan.gerceklesenDakika')
            }
            value={miktar}
            onChangeText={setMiktar}
            keyboardType="number-pad"
            maxLength={6}
            hata={hata}
            selectTextOnFocus
          />
          <Dugme etiket={t('mobil.ogrenme.plan.kaydet')} onPress={kaydet} />
          {devretmeUygun ? (
            <Dugme
              varyant="ikincil"
              etiket={t('mobil.ogrenme.plan.yarinaTasi')}
              yukleniyor={devret.isPending}
              onPress={() => {
                setHata(null);
                devret.mutate();
              }}
            />
          ) : null}
          {bekliyor && gorev.durum !== 'tamam' ? (
            <Metin varyant="kucuk">{t('mobil.ogrenme.plan.devirBekliyor')}</Metin>
          ) : null}
        </View>
      ) : null}
    </Kart>
  );
}

/** Ogrenci "Gorevler" sekmesi: gun seridi ile hafta ve secili gunun plan gorevleri. */
export function OgrenciPlani() {
  const { tz, hazir } = useSaatDilimi();
  const bugun = bugunTarihi(tz);
  const [secilen, setSecilen] = useState<string | null>(null);
  const gun = secilen ?? bugun;
  const hafta = haftaBaslangici(gun);
  const sorgu = usePlanim(hafta);
  const konular = useKonuHaritasi();
  const { bekleyen, basarisiz } = useKuyruk();

  // Kalici hataya dusen giris sunucudaki degere geri doner: liste tazelenir.
  const basarisizSayisi = basarisiz.length;
  const { refetch } = sorgu;
  useEffect(() => {
    if (basarisizSayisi > 0) void refetch();
  }, [basarisizSayisi, refetch]);

  const gorevler = sorgu.data?.gorevler ?? [];
  const gunGorevleriListesi = gunGorevleri(gorevler, gun);
  const bekleyenIdler = new Set(
    bekleyen
      .filter((i) => i.tur === PLAN_GERCEKLESEN_TURU)
      .map((i) => (i.yuk as PlanGerceklesenYuku).gorevId),
  );
  const gunSayisi = gorevSayilari(gunGorevleriListesi);
  const planYok = sorgu.data?.plan === null;

  return (
    <View className="gap-3" testID="ogrenci-plani">
      <View className="flex-row items-center justify-between gap-2">
        <Metin varyant="altBaslik" accessibilityRole="header">
          {t('mobil.ogrenme.plan.baslik')}
        </Metin>
        {gun !== bugun ? (
          <Dugme
            varyant="hayalet"
            etiket={t('mobil.ogrenme.plan.bugun')}
            onPress={() => {
              setSecilen(null);
            }}
          />
        ) : null}
      </View>

      <View className="flex-row items-center justify-between gap-2">
        <Dugme
          varyant="ikincil"
          etiket={t('mobil.ogrenme.plan.oncekiHafta')}
          onPress={() => {
            setSecilen(haftaKaydir(gun, -1));
          }}
        />
        <Metin varyant="etiket" accessibilityLiveRegion="polite" testID="hafta-etiketi">
          {haftaEtiketi(hafta)}
        </Metin>
        <Dugme
          varyant="ikincil"
          etiket={t('mobil.ogrenme.plan.sonrakiHafta')}
          onPress={() => {
            setSecilen(haftaKaydir(gun, 1));
          }}
        />
      </View>

      <View className="flex-row justify-between gap-1" accessibilityRole="tablist">
        {haftaGunleri(hafta).map((g) => {
          const secili = g === gun;
          const say = gorevSayilari(gunGorevleri(gorevler, g));
          return (
            <Pressable
              key={g}
              accessibilityRole="tab"
              accessibilityLabel={`${gunBasligi(g)}, ${
                say.toplam > 0
                  ? t('mobil.ogrenme.plan.gunOzeti', { tamam: say.tamam, toplam: say.toplam })
                  : t('mobil.ogrenme.plan.gorevYokKisa')
              }${g === bugun ? `, ${t('mobil.ogrenme.plan.bugun')}` : ''}`}
              accessibilityState={{ selected: secili }}
              testID={`gun-${g}`}
              onPress={() => {
                setSecilen(g);
              }}
              className={`min-h-dokunma flex-1 items-center justify-center rounded-orta border px-1 py-2 ${
                secili ? 'border-birincil bg-birincil' : 'border-kenar bg-yuzey'
              }`}
            >
              <Metin
                varyant="kucuk"
                className={secili ? 'text-birincilUzeri' : 'text-metinIkincil'}
              >
                {gunKisa(g)}
              </Metin>
              <Metin
                varyant="etiket"
                className={
                  secili ? 'text-birincilUzeri' : g === bugun ? 'text-birincil' : 'text-metin'
                }
              >
                {String(gunNumarasi(g))}
              </Metin>
              <Metin
                varyant="kucuk"
                className={secili ? 'text-birincilUzeri' : 'text-metinIkincil'}
              >
                {say.toplam > 0 ? `${String(say.tamam)}/${String(say.toplam)}` : '–'}
              </Metin>
            </Pressable>
          );
        })}
      </View>

      {!hazir || sorgu.isPending ? <Yukleniyor /> : null}
      {sorgu.isError && !sorgu.data ? (
        <HataDurumu mesaj={hataMesaji(sorgu.error)} tekrar={() => void sorgu.refetch()} />
      ) : null}
      {sorgu.data?.kilitli ? (
        <Metin varyant="ikincil" testID="plan-kilitli">
          {t('mobil.ogrenme.plan.kilitli')}
        </Metin>
      ) : null}
      {sorgu.data ? (
        <Metin varyant="etiket" testID="gun-ozeti" accessibilityLiveRegion="polite">
          {gunBasligi(gun)}
          {gunSayisi.toplam > 0
            ? ` · ${t('mobil.ogrenme.plan.gunOzeti', { tamam: gunSayisi.tamam, toplam: gunSayisi.toplam })}`
            : ''}
        </Metin>
      ) : null}
      {planYok ? (
        <BosDurum ikon="calendar-outline" mesaj={t('mobil.ogrenme.plan.planYok')} />
      ) : null}
      {sorgu.data?.plan && gunGorevleriListesi.length === 0 ? (
        <BosDurum ikon="checkmark-circle-outline" mesaj={t('mobil.ogrenme.plan.gunBos')} />
      ) : null}
      {gunGorevleriListesi.map((g) => (
        <GorevKarti
          key={g.id}
          gorev={g}
          ad={gorevAdi(g, konular)}
          kilitli={sorgu.data?.kilitli ?? false}
          bekliyor={bekleyenIdler.has(g.id)}
        />
      ))}
    </View>
  );
}
