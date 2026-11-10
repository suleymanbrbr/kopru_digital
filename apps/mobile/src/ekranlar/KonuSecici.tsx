import { t } from '@kopru/i18n';
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import type { Konu } from '../api/ogrenmeTipleri';
import {
  bransAdi,
  bransListesi,
  konuAgaci,
  konuEtiketi,
  sonKonuEkle,
  sonKonulariOku,
  sonKonular,
} from '../ogrenme/konu';
import { useTema } from '../tema/TemaSaglayici';
import { Dugme } from '../ui/Dugme';
import { HataDurumu, Yukleniyor } from '../ui/Durumlar';
import { Ikon } from '../ui/Ikon';
import { Kart } from '../ui/Kart';
import { Metin } from '../ui/Metin';
import { MetinGirdisi } from '../ui/MetinGirdisi';
import { useAktif, useServisler } from '../uygulama/baglam';
import { hataMesaji } from '../uygulama/hatalar';
import { useKonular } from '../uygulama/ogrenme';

export interface KonuSecimi {
  bransKodu: string | null;
  konuId: string | null;
}

export const KONU_SECIMI_BOS: KonuSecimi = { bransKodu: null, konuId: null };

/** Bir seferde cizilen en fazla satir sayisi (uzun listelerde arama daraltir). */
const SATIR_UST = 60;

interface Props {
  deger: KonuSecimi;
  onDegis: (v: KonuSecimi) => void;
  etiket?: string;
  /** Konu secmeden yalniz ders (brans) secilebilsin mi. */
  yalnizDers?: boolean;
}

function KonuSatiri({
  konu,
  derinlik,
  secili,
  onSec,
}: {
  konu: Konu;
  derinlik: number;
  secili: boolean;
  onSec: (k: Konu) => void;
}) {
  const { renkler } = useTema();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${konu.ad}, ${bransAdi(konu.bransKodu)}`}
      accessibilityState={{ selected: secili }}
      testID={`konu-${konu.id}`}
      onPress={() => {
        onSec(konu);
      }}
      style={{ paddingLeft: 12 + derinlik * 16 }}
      className={`min-h-dokunma flex-row items-center gap-2 rounded-orta py-2 pr-3 active:opacity-80 ${
        secili ? 'bg-yuzeyIkincil' : ''
      }`}
    >
      {secili ? <Ikon ad="checkmark" boyut={18} renk={renkler.birincil} /> : null}
      <Metin varyant={derinlik === 0 ? 'etiket' : 'govde'} className="flex-1">
        {konu.ad}
      </Metin>
    </Pressable>
  );
}

/**
 * Ortak konu secici (odev, plan ve deneme formlari): brans suzgeci, Turkce harf duyarsiz arama,
 * unite > konu agaci ve yerel "son kullanilanlar". Alan dokunulunca acilir; konuya dokunmak secer ve
 * kapatir (2 dokunus). Kullanimdan kalkan konular yeni secimde sunulmaz; mevcut secim rozetle
 * gosterilir.
 */
export function KonuSecici({ deger, onDegis, etiket, yalnizDers = true }: Props) {
  const { yerelDepo } = useServisler();
  const uyelikId = useAktif()?.uyelik.uyelikId ?? '';
  const q = useKonular();
  const [acik, setAcik] = useState(false);
  const [filtre, setFiltre] = useState<string | null>(null);
  const [arama, setArama] = useState('');
  const [son, setSon] = useState(() => sonKonulariOku(yerelDepo, uyelikId));
  const konular = q.data;

  const branslar = useMemo(() => bransListesi(konular ?? []), [konular]);
  const satirlar = useMemo(
    () => konuAgaci(konular ?? [], { bransKodu: filtre, arama }),
    [konular, filtre, arama],
  );
  const sonlar = useMemo(() => sonKonular(konular ?? [], son, filtre), [konular, son, filtre]);

  const secilenKonu = deger.konuId ? konular?.find((k) => k.id === deger.konuId) : undefined;
  const gosterim = secilenKonu
    ? `${konuEtiketi(secilenKonu)} · ${bransAdi(secilenKonu.bransKodu)}`
    : deger.bransKodu
      ? bransAdi(deger.bransKodu)
      : t('mobil.ogrenme.konu.secimYok');
  const alanEtiketi = etiket ?? t('mobil.ogrenme.konu.alan');

  function sec(k: Konu) {
    setSon(sonKonuEkle(yerelDepo, uyelikId, k.id));
    onDegis({ bransKodu: k.bransKodu, konuId: k.id });
    setAcik(false);
    setArama('');
  }

  return (
    <View className="gap-2">
      <Metin varyant="etiket">{alanEtiketi}</Metin>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${alanEtiketi}: ${gosterim}`}
        accessibilityState={{ expanded: acik }}
        testID="konu-alani"
        onPress={() => {
          setAcik((a) => !a);
        }}
        className="min-h-12 flex-row items-center gap-2 rounded-orta border border-kenar bg-yuzey px-4 py-2 active:opacity-80"
      >
        <Metin
          className={`flex-1 ${deger.bransKodu ? '' : 'text-metinIkincil'}`}
          numberOfLines={2}
        >
          {gosterim}
        </Metin>
        <Ikon ad={acik ? 'chevron-up' : 'chevron-down'} boyut={18} />
      </Pressable>

      {acik ? (
        <Kart className="gap-3" testID="konu-paneli">
          {q.isPending ? <Yukleniyor /> : null}
          {q.isError && !konular ? (
            <HataDurumu mesaj={hataMesaji(q.error)} tekrar={() => void q.refetch()} />
          ) : null}
          {konular ? (
            <>
              <View className="flex-row flex-wrap gap-2" accessibilityRole="radiogroup">
                {[{ kod: null as string | null, ad: t('mobil.ogrenme.konu.tumBranslar') }, ...branslar].map(
                  (b) => {
                    const secili = filtre === b.kod;
                    return (
                      <Pressable
                        key={b.kod ?? 'tum'}
                        accessibilityRole="radio"
                        accessibilityLabel={b.ad}
                        accessibilityState={{ selected: secili, checked: secili }}
                        onPress={() => {
                          setFiltre(b.kod);
                        }}
                        className={`min-h-dokunma justify-center rounded-tam border px-4 ${
                          secili ? 'border-birincil bg-birincil' : 'border-kenar bg-yuzeyIkincil'
                        }`}
                      >
                        <Metin
                          varyant="etiket"
                          className={secili ? 'text-birincilUzeri' : 'text-metin'}
                        >
                          {b.ad}
                        </Metin>
                      </Pressable>
                    );
                  },
                )}
              </View>
              <MetinGirdisi
                etiket={t('mobil.ogrenme.konu.ara')}
                value={arama}
                onChangeText={setArama}
                autoCorrect={false}
                autoCapitalize="none"
                returnKeyType="search"
              />
              {yalnizDers && filtre ? (
                <Dugme
                  varyant="ikincil"
                  etiket={t('mobil.ogrenme.konu.yalnizDers', { ders: bransAdi(filtre) })}
                  onPress={() => {
                    onDegis({ bransKodu: filtre, konuId: null });
                    setAcik(false);
                  }}
                />
              ) : null}
              {!arama && sonlar.length > 0 ? (
                <View className="gap-1" testID="son-konular">
                  <Metin varyant="etiket" accessibilityRole="header">
                    {t('mobil.ogrenme.konu.sonKullanilan')}
                  </Metin>
                  {sonlar.map((k) => (
                    <KonuSatiri
                      key={`son-${k.id}`}
                      konu={k}
                      derinlik={0}
                      secili={k.id === deger.konuId}
                      onSec={sec}
                    />
                  ))}
                </View>
              ) : null}
              {satirlar.length === 0 ? (
                <Metin varyant="ikincil" className="text-center">
                  {t('mobil.ogrenme.konu.aramaBos')}
                </Metin>
              ) : (
                <View className="gap-1">
                  {satirlar.slice(0, SATIR_UST).map((s) => (
                    <KonuSatiri
                      key={s.konu.id}
                      konu={s.konu}
                      derinlik={s.derinlik}
                      secili={s.konu.id === deger.konuId}
                      onSec={sec}
                    />
                  ))}
                  {satirlar.length > SATIR_UST ? (
                    <Metin varyant="kucuk" className="text-center">
                      {t('mobil.ogrenme.konu.dahaFazla', { n: satirlar.length - SATIR_UST })}
                    </Metin>
                  ) : null}
                </View>
              )}
            </>
          ) : null}
        </Kart>
      ) : null}
    </View>
  );
}
