import { t } from '@kopru/i18n';
import { useAudioPlayer, useAudioPlayerStatus, type AudioPlayer } from 'expo-audio';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import { useTema } from '../tema/TemaSaglayici';
import { Ikon } from '../ui/Ikon';
import { Metin } from '../ui/Metin';
import { cozumle, gorunenCizgiler } from '../cizim/model';
import { Tuval } from '../cizim/Tuval';
import { sureMetni } from '../ses/sinirlar';

const mockMu = (url: string) => url.startsWith('mock://');

/** Oynat/duraklat dugmesi + ilerleme cubugu. `player` disaridan verilirse (mini anlatim) paylasilir. */
export function OynatmaSeridi({
  player,
  sureSn,
  etiket,
  testID,
}: {
  player: AudioPlayer;
  sureSn: number | null;
  etiket: string;
  testID?: string;
}) {
  const { renkler } = useTema();
  const durum = useAudioPlayerStatus(player);
  const toplam = durum.duration > 0 ? durum.duration : (sureSn ?? 0);
  const oran = toplam > 0 ? Math.min(1, durum.currentTime / toplam) : 0;
  function oynat() {
    if (durum.playing) {
      player.pause();
      return;
    }
    if (toplam > 0 && durum.currentTime >= toplam - 0.1) void player.seekTo(0);
    player.play();
  }
  const metin = t('mobil.soru.ek.sureEtiketi', {
    gecen: sureMetni(durum.currentTime),
    toplam: sureMetni(toplam),
  });
  return (
    <View className="flex-row items-center gap-3" testID={testID}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${etiket}: ${durum.playing ? t('mobil.soru.ek.duraklat') : t('mobil.soru.ek.oynat')}`}
        accessibilityState={{ busy: durum.isBuffering }}
        onPress={oynat}
        className="h-11 w-11 items-center justify-center rounded-tam bg-birincil active:opacity-80"
      >
        <Ikon ad={durum.playing ? 'pause' : 'play'} renk={renkler.birincilUzeri} boyut={22} />
      </Pressable>
      <View className="flex-1 gap-1">
        <View
          className="h-2 overflow-hidden rounded-tam bg-yuzeyIkincil"
          accessibilityRole="progressbar"
          accessibilityValue={{ min: 0, max: 100, now: Math.round(oran * 100) }}
        >
          <View className="h-2 bg-birincil" style={{ width: `${String(oran * 100)}%` }} />
        </View>
        <Metin varyant="kucuk">{metin}</Metin>
      </View>
    </View>
  );
}

function GercekOynatici({ url, sureSn, etiket }: { url: string; sureSn: number | null; etiket: string }) {
  const player = useAudioPlayer(url, { updateInterval: 100 });
  return <OynatmaSeridi player={player} sureSn={sureSn} etiket={etiket} testID="ses-oynatici" />;
}

/** Ses eki oynatici. Mock adresler (testler/gelistirme) oynatilamaz, yalniz sure gosterilir. */
export function SesOynatici({
  url,
  sureSn,
  etiket = t('mobil.soru.ek.ses'),
}: {
  url: string;
  sureSn: number | null;
  etiket?: string;
}) {
  if (mockMu(url)) {
    return (
      <View className="flex-row items-center gap-3" testID="ses-oynatici">
        <View className="h-11 w-11 items-center justify-center rounded-tam bg-birincil">
          <Ikon ad="play" renk="#FFFFFF" boyut={22} />
        </View>
        <Metin varyant="kucuk">{sureMetni(sureSn ?? 0)}</Metin>
      </View>
    );
  }
  return <GercekOynatici url={url} sureSn={sureSn} etiket={etiket} />;
}

function MiniGercek({
  sesUrl,
  gorsel,
  oran,
  genislik,
  cizimVerisi,
  sureSn,
}: {
  sesUrl: string;
  gorsel: string | number;
  oran: number;
  genislik: number;
  cizimVerisi: unknown;
  sureSn: number | null;
}) {
  const player = useAudioPlayer(sesUrl, { updateInterval: 100 });
  const durum = useAudioPlayerStatus(player);
  const veri = useMemo(() => cozumle(cizimVerisi), [cizimVerisi]);
  const [t_, setT] = useState(0);
  const [basladi, setBasladi] = useState(false);

  // Oynarken ses pozisyonunu kare kare okuyup cizgileri o ana kadarki haliyle gosterir.
  useEffect(() => {
    if (!durum.playing) return;
    setBasladi(true);
    let id = 0;
    const don = () => {
      setT(Math.round(player.currentTime * 1000));
      id = requestAnimationFrame(don);
    };
    id = requestAnimationFrame(don);
    return () => {
      cancelAnimationFrame(id);
    };
  }, [durum.playing, player]);

  const bitti = !!veri && durum.duration > 0 && durum.currentTime >= durum.duration - 0.1;
  const cizgiler = useMemo(() => {
    if (!veri) return [];
    if (!basladi || bitti) return veri.cizgiler;
    return gorunenCizgiler(veri.cizgiler, t_);
  }, [veri, basladi, bitti, t_]);

  return (
    <View className="gap-3" testID="mini-anlatim">
      <Tuval kaynak={gorsel} oran={oran} genislik={genislik} cizgiler={cizgiler} testID="mini-tuval" />
      <OynatmaSeridi
        player={player}
        sureSn={sureSn}
        etiket={t('mobil.soru.ek.miniAnlatim')}
        testID="mini-oynatma"
      />
    </View>
  );
}

/**
 * Mini anlatim oynatici: kaynak fotograf uzerinde, ses kaydiyla ESZAMANLI cizilen cizgiler
 * (`cizim_verisi` zamanli bicimi, bkz. `cizim/model.ts`). Veri okunamazsa duz ses oynatici gorunur.
 */
export function MiniAnlatimOynatici(props: {
  sesUrl: string;
  /** Sorunun (kaynak) fotografi. */
  gorsel: string | number;
  oran: number;
  genislik: number;
  cizimVerisi: unknown;
  sureSn: number | null;
}) {
  const veri = cozumle(props.cizimVerisi);
  if (!veri?.zamanli || mockMu(props.sesUrl)) {
    return (
      <View className="gap-2">
        <SesOynatici url={props.sesUrl} sureSn={props.sureSn} etiket={t('mobil.soru.ek.miniAnlatim')} />
      </View>
    );
  }
  return <MiniGercek {...props} />;
}
