import { t } from '@kopru/i18n';
import type { UseQueryResult } from '@tanstack/react-query';
import { useState } from 'react';
import { Linking, View } from 'react-native';

import type { Ek, EkListesi } from '../api/ogrenmeTipleri';
import { Dugme } from '../ui/Dugme';
import { KartHatasi, KartYukleniyor } from '../ui/Durumlar';
import { Ikon } from '../ui/Ikon';
import { Kart } from '../ui/Kart';
import { Metin } from '../ui/Metin';
import { hataMesaji } from '../uygulama/hatalar';

/** "1,2 MB" / "340 KB". */
export function boyutMetni(bayt: number): string {
  if (bayt >= 1024 * 1024) {
    return `${(bayt / (1024 * 1024)).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} MB`;
  }
  return `${Math.max(1, Math.round(bayt / 1024)).toLocaleString('tr-TR')} KB`;
}

function EkSatiri({ ek }: { ek: Ek }) {
  const [hata, setHata] = useState<string | null>(null);
  const sira = ek.sira + 1;
  const pdf = ek.mimeTipi === 'application/pdf';
  const ac = () => {
    if (!ek.adres) return;
    setHata(null);
    Linking.openURL(ek.adres).catch(() => {
      setHata(t('mobil.ogrenme.ek.acilamadi'));
    });
  };
  return (
    <View className="gap-1 border-t border-kenar py-2" testID={`ek-${String(ek.sira)}`}>
      <View className="flex-row items-center gap-3">
        <Ikon ad={pdf ? 'document-text-outline' : 'image-outline'} boyut={24} />
        <View className="flex-1">
          <Metin varyant="etiket">{t('mobil.ogrenme.ek.sira', { sira })}</Metin>
          <Metin varyant="kucuk">
            {t('mobil.ogrenme.ek.boyutlu', {
              tur: pdf ? t('mobil.ogrenme.ek.pdf') : t('mobil.ogrenme.ek.gorsel'),
              boyut: boyutMetni(ek.boyutBayt),
            })}
          </Metin>
        </View>
        {ek.adres ? (
          <Dugme
            etiket={t('mobil.ogrenme.ek.ac')}
            accessibilityLabel={t('mobil.ogrenme.ek.acEtiket', { sira })}
            testID={`ek-ac-${String(ek.sira)}`}
            onPress={ac}
          />
        ) : (
          <Metin varyant="kucuk">{t('mobil.ogrenme.ek.adresYok')}</Metin>
        )}
      </View>
      {hata ? (
        <Metin varyant="kucuk" className="text-hata" accessibilityLiveRegion="polite">
          {hata}
        </Metin>
      ) : null}
    </View>
  );
}

/**
 * Odev ya da haftalik plan ekleri karti (PDF/fotograf; yukleme web'dedir). Dosya sistemin gorunteleyicisinde
 * acilir. `bosGizle`: ek yoksa hic cizilmez (plan: ek sayisi onceden bilinmez).
 */
export function EkKarti({
  sorgu,
  bosGizle = false,
  testID = 'ek-karti',
}: {
  sorgu: UseQueryResult<EkListesi>;
  bosGizle?: boolean;
  testID?: string;
}) {
  if (bosGizle && (sorgu.isPending || (sorgu.data && sorgu.data.ekler.length === 0))) return null;
  return (
    <Kart className="gap-1" testID={testID}>
      <Metin varyant="altBaslik" accessibilityRole="header">
        {t('mobil.ogrenme.ek.baslik')}
      </Metin>
      {sorgu.isPending ? <KartYukleniyor /> : null}
      {sorgu.isError && !sorgu.data ? (
        <KartHatasi
          mesaj={`${t('mobil.ogrenme.ek.yuklenemedi')} ${hataMesaji(sorgu.error)}`}
          tekrar={() => void sorgu.refetch()}
        />
      ) : null}
      {sorgu.data && sorgu.data.ekler.length === 0 ? (
        <Metin varyant="ikincil">{t('mobil.ogrenme.ek.yok')}</Metin>
      ) : null}
      {sorgu.data?.ekler.map((e) => (
        <EkSatiri key={e.medyaDosyaId} ek={e} />
      ))}
      {sorgu.data?.adreslerAlinamadi ? (
        <Dugme etiket={t('mobil.ogrenme.ek.yenidenDene')} onPress={() => void sorgu.refetch()} />
      ) : null}
    </Kart>
  );
}
