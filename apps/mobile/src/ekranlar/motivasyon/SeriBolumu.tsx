import { t, type MessageKey } from '@kopru/i18n';
import { View } from 'react-native';

import type { SeriDetayi } from '../../api/motivasyonTipleri';
import { gunBasligi } from '../../lib/saat';
import {
  enYakinHedef,
  gunDurumuEtiketi,
  hedefIlerlemeMetni,
  kilometreTasiMetni,
  seriBasligi,
  seriDurumMetni,
  takvimOzeti,
  takvimSatirlari,
  type TakvimHucresi,
} from '../../motivasyon/seriMetni';
import { useTema } from '../../tema/TemaSaglayici';
import { Ikon } from '../../ui/Ikon';
import { Metin } from '../../ui/Metin';

const HAFTA_GUNLERI: MessageKey[] = [
  'mobil.motivasyon.seri.haftaGunu.pzt',
  'mobil.motivasyon.seri.haftaGunu.sal',
  'mobil.motivasyon.seri.haftaGunu.car',
  'mobil.motivasyon.seri.haftaGunu.per',
  'mobil.motivasyon.seri.haftaGunu.cum',
  'mobil.motivasyon.seri.haftaGunu.cmt',
  'mobil.motivasyon.seri.haftaGunu.paz',
];

type IkonAdi = 'checkmark' | 'snow' | 'pause' | 'refresh' | 'remove';
const GUN_IKONU: Record<string, IkonAdi | null> = {
  aktif: 'checkmark',
  dondurma: 'snow',
  duraklatma: 'pause',
  onarim: 'refresh',
  kacirildi: 'remove',
  yok: null,
};

/** Gunun kutusu: durum renk + ikon + erisilebilir etiketle verilir (renk tek sinyal degil). */
function GunHucresi({ h }: { h: TakvimHucresi }) {
  const { renkler } = useTema();
  if (!h.gun || !h.durum) return <View className="aspect-square flex-1" />;
  const dolu = h.durum === 'aktif' || h.durum === 'onarim';
  const ikon = GUN_IKONU[h.durum] ?? null;
  const etiket = `${gunBasligi(h.gun)}: ${gunDurumuEtiketi(h.durum)}${h.bugun ? `, ${t('mobil.motivasyon.seri.bugun')}` : ''}`;
  return (
    <View className="aspect-square flex-1 p-0.5">
      <View
        accessible
        accessibilityLabel={etiket}
        testID={`seri-gun-${h.gun}`}
        className={`flex-1 items-center justify-center rounded-orta border ${
          dolu ? 'border-vurgu bg-vurgu' : 'border-kenar bg-yuzeyIkincil'
        } ${h.bugun ? 'border-2 border-birincil' : ''}`}
      >
        {ikon ? (
          <Ikon ad={ikon} boyut={14} renk={dolu ? renkler.birincilUzeri : renkler.metinIkincil} />
        ) : null}
        <Metin
          varyant="kucuk"
          className={dolu ? 'text-vurguUzeri' : ''}
          style={{ fontSize: 10, lineHeight: 12 }}
        >
          {h.gunNo}
        </Metin>
      </View>
    </View>
  );
}

/**
 * Seri: alev + gun sayisi, suclamayan durum metni, gunun hedef cubugu, dondurma stogu ve 35 gunluk
 * takvim. Onarim penceresi aciksa "Seriyi kurtarmak icin bugun ..." ve hedef ilerlemesi gosterilir.
 */
export function SeriBolumu({ seri }: { seri: SeriDetayi }) {
  const { renkler } = useTema();
  const durumMetni = seriDurumMetni(seri);
  const hedefler = seri.onarim ? seri.onarim.hedefler : seri.hedefler;
  const yakin = enYakinHedef(hedefler);
  const tas = kilometreTasiMetni(seri);
  const satirlar = takvimSatirlari(seri.gunler);
  return (
    <View className="gap-3" testID="seri-bolumu">
      <View className="flex-row items-center gap-3">
        <Ikon
          ad="flame"
          boyut={32}
          renk={seri.mevcut_seri > 0 ? '#FF8A3D' : renkler.metinIkincil}
        />
        <View className="flex-1">
          <Metin varyant="altBaslik" accessibilityRole="header">
            {seriBasligi(seri.mevcut_seri)}
          </Metin>
          <Metin varyant="kucuk">
            {t('mobil.motivasyon.seri.enUzun', { n: seri.en_uzun_seri })}
          </Metin>
        </View>
      </View>
      {durumMetni ? (
        <View
          className={`rounded-orta p-3 ${seri.onarim ? 'border border-uyari bg-yuzeyIkincil' : 'bg-yuzeyIkincil'}`}
          testID="seri-durum"
        >
          <Metin>{durumMetni}</Metin>
        </View>
      ) : null}
      {yakin ? (
        <View
          className="gap-1"
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel={`${t('mobil.motivasyon.seri.hedefBaslik')}: ${hedefIlerlemeMetni(yakin.hedef)}`}
          accessibilityValue={{ min: 0, max: 100, now: Math.round(yakin.oran * 100) }}
          testID="seri-hedef"
        >
          <View className="flex-row items-center justify-between gap-2">
            <Metin varyant="etiket">{t('mobil.motivasyon.seri.hedefBaslik')}</Metin>
            <Metin varyant="etiket">{hedefIlerlemeMetni(yakin.hedef)}</Metin>
          </View>
          <View className="h-3 overflow-hidden rounded-tam bg-yuzeyIkincil">
            <View
              className="h-3 rounded-tam bg-birincil"
              style={{ width: `${Math.round(yakin.oran * 100)}%` }}
            />
          </View>
          {hedefler.length > 1 ? (
            <Metin varyant="kucuk">{t('mobil.motivasyon.seri.birYeter')}</Metin>
          ) : null}
        </View>
      ) : null}
      <View className="flex-row flex-wrap gap-x-4 gap-y-1">
        <View
          className="flex-row items-center gap-1"
          accessible
          accessibilityLabel={t('mobil.motivasyon.seri.dondurmaStogu', { n: seri.dondurma_stogu })}
          testID="seri-dondurma"
        >
          <Ikon ad="snow" boyut={16} renk={renkler.metinIkincil} />
          <Metin varyant="kucuk">
            {t('mobil.motivasyon.seri.dondurmaStogu', { n: seri.dondurma_stogu })}
          </Metin>
        </View>
        {tas ? <Metin varyant="kucuk">{tas}</Metin> : null}
      </View>
      <View className="gap-0.5" testID="seri-takvim" accessibilityLabel={takvimOzeti(seri.gunler)}>
        <View className="flex-row" importantForAccessibility="no-hide-descendants">
          {HAFTA_GUNLERI.map((k) => (
            <View key={k} className="flex-1 items-center">
              <Metin varyant="kucuk">{t(k)}</Metin>
            </View>
          ))}
        </View>
        {satirlar.map((satir, i) => (
          <View key={i} className="flex-row">
            {satir.map((h, j) => (
              <GunHucresi key={`${String(i)}-${String(j)}`} h={h} />
            ))}
          </View>
        ))}
      </View>
      <View
        className="flex-row flex-wrap gap-x-4 gap-y-1"
        importantForAccessibility="no-hide-descendants"
      >
        {(['aktif', 'dondurma', 'duraklatma', 'onarim', 'kacirildi'] as const).map((d) => (
          <View key={d} className="flex-row items-center gap-1">
            <Ikon ad={GUN_IKONU[d] ?? 'remove'} boyut={12} renk={renkler.metinIkincil} />
            <Metin varyant="kucuk">{gunDurumuEtiketi(d)}</Metin>
          </View>
        ))}
      </View>
    </View>
  );
}
