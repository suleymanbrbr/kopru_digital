import { t } from '@kopru/i18n';
import { View } from 'react-native';

import type { Deneme, DenemeOnayDurumu } from '../api/ogrenmeTipleri';
import { tarihMetni } from '../ogrenme/hafta';
import { bransAdi } from '../ogrenme/konu';
import { netBicimle } from '../ogrenme/net';
import { useTema } from '../tema/TemaSaglayici';
import { Ikon } from '../ui/Ikon';
import { Metin } from '../ui/Metin';

const IKON = {
  bekliyor: 'time-outline',
  onaylandi: 'checkmark-circle',
  reddedildi: 'close-circle',
} as const;

/** Onay durumu rozeti: renk tek sinyal degildir (ikon + metin). */
export function DenemeDurumRozeti({ durum }: { durum: DenemeOnayDurumu }) {
  const { renkler } = useTema();
  const renk =
    durum === 'reddedildi' ? renkler.hata : durum === 'bekliyor' ? renkler.uyari : renkler.basari;
  const metin = t(`mobil.ogrenme.deneme.onay.${durum}`);
  return (
    <View
      accessible
      accessibilityLabel={metin}
      testID={`deneme-rozet-${durum}`}
      className="flex-row items-center gap-1 self-start rounded-tam border px-3 py-1"
      style={{ borderColor: renk }}
    >
      <Ikon ad={IKON[durum]} boyut={14} renk={renk} />
      <Metin varyant="kucuk" style={{ color: renk }}>
        {metin}
      </Metin>
    </View>
  );
}

/** Bolum bazinda net satirlari (D/Y/B ve net). */
export function BolumNetleri({ deneme }: { deneme: Deneme }) {
  return (
    <View className="gap-1">
      {deneme.bolumler.map((b) => (
        <View
          key={b.bolumKodu}
          className="flex-row justify-between gap-2"
          accessible
          accessibilityLabel={t('mobil.ogrenme.deneme.bolumOzetEtiketi', {
            bolum: bransAdi(b.bransKodu),
            dogru: b.dogru,
            yanlis: b.yanlis,
            bos: b.bos,
            net: netBicimle(b.net),
          })}
        >
          <Metin varyant="kucuk" className="flex-1">
            {bransAdi(b.bransKodu)}
          </Metin>
          <Metin varyant="kucuk">
            {b.dogru}/{b.yanlis}/{b.bos}
          </Metin>
          <Metin varyant="kucuk" className="w-14 text-right">
            {netBicimle(b.net)}
          </Metin>
        </View>
      ))}
    </View>
  );
}

/** "Deneme 3 · 21 Kas 2026" ve toplam net. */
export function DenemeBaslik({ deneme }: { deneme: Deneme }) {
  return (
    <View className="flex-row items-start justify-between gap-3">
      <View className="flex-1">
        <Metin varyant="altBaslik">{deneme.ad}</Metin>
        <Metin varyant="ikincil">
          {deneme.kuralKodu.toLocaleUpperCase('tr')} · {tarihMetni(deneme.sinavTarihi)}
          {deneme.ogrenciAd ? ` · ${deneme.ogrenciAd}` : ''}
        </Metin>
      </View>
      <View className="items-end">
        <Metin varyant="altBaslik">{netBicimle(deneme.toplamNet)}</Metin>
        <Metin varyant="kucuk">{t('mobil.ogrenme.deneme.net')}</Metin>
      </View>
    </View>
  );
}
