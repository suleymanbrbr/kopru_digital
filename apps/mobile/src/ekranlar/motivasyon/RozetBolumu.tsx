import { t, type MessageKey } from '@kopru/i18n';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import type { MotivasyonDurumu } from '../../api/motivasyonTipleri';
import { VITRIN_ENFAZLA } from '../../motivasyon/vitrin';
import { Ikon } from '../../ui/Ikon';
import { Metin } from '../../ui/Metin';

type Kazanilan = MotivasyonDurumu['rozetler']['kazanilan'][number];
type Kilitli = MotivasyonDurumu['rozetler']['kilitli'][number];

const KADEME_RENGI: Record<string, string> = {
  bronz: '#B8733B',
  gumus: '#8A97A6',
  altin: '#D9A400',
};

/** Kademe adi ayrica metin olarak yazilir: renk tek sinyal degildir. */
export function kademeAdi(k: string): string {
  return t(`mobil.motivasyon.rozet.kademe.${k}` as MessageKey);
}

function KazanilanRozet({
  r,
  vitrinde,
  degistir,
}: {
  r: Kazanilan;
  vitrinde: boolean;
  degistir: () => void;
}) {
  return (
    <View
      className="w-[48%] gap-1 rounded-orta border border-kenar bg-yuzey p-3"
      testID={`rozet-${r.kod}`}
    >
      <View
        accessible
        accessibilityLabel={`${r.ad}, ${kademeAdi(r.kademe)}. ${r.aciklama}`}
        className="gap-1"
      >
        <Ikon ad="ribbon" boyut={28} renk={KADEME_RENGI[r.kademe] ?? '#8A97A6'} />
        <Metin varyant="etiket">{r.ad}</Metin>
        <Metin varyant="kucuk">{kademeAdi(r.kademe)}</Metin>
        <Metin varyant="kucuk">{r.aciklama}</Metin>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          vitrinde
            ? t('mobil.motivasyon.rozet.vitrindenCikar', { ad: r.ad })
            : t('mobil.motivasyon.rozet.vitrineEkle', { ad: r.ad })
        }
        accessibilityState={{ selected: vitrinde }}
        onPress={degistir}
        testID={`vitrin-${r.kod}`}
        className="min-h-dokunma flex-row items-center gap-1 active:opacity-80"
      >
        <Ikon ad={vitrinde ? 'star' : 'star-outline'} boyut={18} />
        <Metin varyant="kucuk" className="flex-1">
          {vitrinde ? t('mobil.motivasyon.rozet.vitrinde') : t('mobil.motivasyon.rozet.vitrineAl')}
        </Metin>
      </Pressable>
    </View>
  );
}

function KilitliRozet({ r }: { r: Kilitli }) {
  const oran = Math.min(r.ilerleme / r.esik, 1);
  return (
    <View
      className="w-[48%] gap-1 rounded-orta border border-kenar bg-yuzeyIkincil p-3"
      accessible
      accessibilityLabel={`${r.ad}, ${kademeAdi(r.kademe)}, ${t('mobil.motivasyon.rozet.kilitli')}. ${r.aciklama} ${t('mobil.motivasyon.rozet.ilerleme', { yapilan: r.ilerleme, esik: r.esik })}`}
      testID={`rozet-kilitli-${r.kod}`}
    >
      <Ikon ad="lock-closed" boyut={24} />
      <Metin varyant="etiket">{r.ad}</Metin>
      <Metin varyant="kucuk">{kademeAdi(r.kademe)}</Metin>
      <Metin varyant="kucuk">{r.aciklama}</Metin>
      <View className="h-2 overflow-hidden rounded-tam bg-yuzey">
        <View
          className="h-2 rounded-tam bg-birincil"
          style={{ width: `${Math.round(oran * 100)}%` }}
        />
      </View>
      <Metin varyant="kucuk">
        {t('mobil.motivasyon.rozet.ilerleme', { yapilan: r.ilerleme, esik: r.esik })}
      </Metin>
    </View>
  );
}

interface Props {
  rozetler: MotivasyonDurumu['rozetler'];
  vitrin: readonly string[];
  vitrinDegistir: (kod: string) => { dolu: boolean };
}

/**
 * Rozetler: vitrin (secilen en cok 3 rozet, yerelde saklanir), kazanilanlar ve ilerlemeli kilitliler.
 * Gizli rozetler kazanilana kadar sunucudan gelmez.
 */
export function RozetBolumu({ rozetler, vitrin, vitrinDegistir }: Props) {
  const [uyari, setUyari] = useState(false);
  const vitrinRozetleri = vitrin
    .map((k) => rozetler.kazanilan.find((r) => r.kod === k))
    .filter((r): r is Kazanilan => !!r);
  return (
    <View className="gap-3" testID="rozet-bolumu">
      <View className="gap-2" testID="rozet-vitrin">
        <Metin varyant="etiket">{t('mobil.motivasyon.rozet.vitrinBaslik')}</Metin>
        {vitrinRozetleri.length === 0 ? (
          <Metin varyant="ikincil">
            {t('mobil.motivasyon.rozet.vitrinBos', { n: VITRIN_ENFAZLA })}
          </Metin>
        ) : (
          <View
            className="flex-row flex-wrap gap-2"
            accessible
            accessibilityLabel={t('mobil.motivasyon.rozet.vitrinEtiketi', {
              liste: vitrinRozetleri.map((r) => r.ad).join(', '),
            })}
          >
            {vitrinRozetleri.map((r) => (
              <View
                key={r.kod}
                className="flex-row items-center gap-1 rounded-tam border border-kenar px-3 py-1"
              >
                <Ikon ad="ribbon" boyut={16} renk={KADEME_RENGI[r.kademe] ?? '#8A97A6'} />
                <Metin varyant="kucuk">
                  {r.ad} · {kademeAdi(r.kademe)}
                </Metin>
              </View>
            ))}
          </View>
        )}
        {uyari ? (
          <Metin varyant="kucuk" className="text-hata" accessibilityLiveRegion="polite">
            {t('mobil.motivasyon.rozet.vitrinDolu', { n: VITRIN_ENFAZLA })}
          </Metin>
        ) : null}
      </View>
      <Metin varyant="etiket">
        {t('mobil.motivasyon.rozet.kazanilan', { n: rozetler.kazanilan.length })}
      </Metin>
      {rozetler.kazanilan.length === 0 ? (
        <Metin varyant="ikincil">{t('mobil.motivasyon.rozet.kazanilanBos')}</Metin>
      ) : (
        <View className="flex-row flex-wrap justify-between gap-y-2">
          {rozetler.kazanilan.map((r) => (
            <KazanilanRozet
              key={r.kod}
              r={r}
              vitrinde={vitrin.includes(r.kod)}
              degistir={() => {
                setUyari(vitrinDegistir(r.kod).dolu);
              }}
            />
          ))}
        </View>
      )}
      {rozetler.kilitli.length > 0 ? (
        <>
          <Metin varyant="etiket">{t('mobil.motivasyon.rozet.yolda')}</Metin>
          <View className="flex-row flex-wrap justify-between gap-y-2">
            {rozetler.kilitli.map((r) => (
              <KilitliRozet key={r.kod} r={r} />
            ))}
          </View>
        </>
      ) : null}
    </View>
  );
}
