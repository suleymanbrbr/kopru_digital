import { t } from '@kopru/i18n';
import { useEffect } from 'react';
import { View } from 'react-native';

import { SES_UYARI_KALAN_SN, kalanSn, kayitSuresiSn, sureMetni } from '../ses/sinirlar';
import { useSesKaydi } from '../ses/useSesKaydi';
import { Dugme } from '../ui/Dugme';
import { Kart } from '../ui/Kart';
import { Metin } from '../ui/Metin';
import { IzinKarti } from './parcalar';
import { SesOynatici } from './SesOynatici';

/**
 * Sesli anlatim kaydedici: kaydet / durdur (en cok 180 sn; sure ve kalan gosterilir) / dinle /
 * yeniden kaydet. Bitince `onHazir(uri, sn)`; yeniden kayit ya da silinince `onSil`.
 */
export function SesKaydedici({
  onHazir,
  onSil,
  vazgec,
}: {
  onHazir: (uri: string, sureSn: number) => void;
  onSil: () => void;
  vazgec: () => void;
}) {
  const ses = useSesKaydi();
  const kalan = kalanSn(ses.gecenSn);

  useEffect(() => {
    if (ses.asama === 'bitti' && ses.uri) onHazir(ses.uri, kayitSuresiSn(ses.gecenSn));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- yalniz kayit bitince
  }, [ses.asama, ses.uri]);

  return (
    <Kart className="gap-3" testID="ses-kaydedici">
      <Metin varyant="altBaslik" accessibilityRole="header">
        {t('mobil.soru.ses.baslik')}
      </Metin>
      {ses.hata === 'izin' ? <IzinKarti tur="mikrofon" /> : null}
      {ses.hata === 'baslamadi' ? (
        <Metin varyant="ikincil" className="text-hata" accessibilityRole="alert">
          {t('mobil.soru.ses.baslamadi')}
        </Metin>
      ) : null}
      <View accessibilityLiveRegion="polite" className="gap-1">
        {ses.asama === 'kaydediyor' ? (
          <>
            <Metin varyant="baslik" testID="ses-sure">
              {sureMetni(ses.gecenSn)}
            </Metin>
            <Metin varyant="ikincil" className={kalan <= SES_UYARI_KALAN_SN ? 'text-hata' : ''}>
              {t('mobil.soru.ses.kalan', { sure: sureMetni(kalan) })}
            </Metin>
          </>
        ) : null}
        {ses.asama === 'bos' && ses.gecenSn > 0 && ses.gecenSn < 1 ? (
          <Metin varyant="ikincil">{t('mobil.soru.ses.kisa')}</Metin>
        ) : null}
        {ses.asama === 'bitti' && ses.uri ? (
          <>
            <Metin varyant="etiket">{t('mobil.soru.ses.hazir', { sure: sureMetni(ses.gecenSn) })}</Metin>
            <SesOynatici url={ses.uri} sureSn={Math.round(ses.gecenSn)} />
            {ses.gecenSn >= 179.5 ? (
              <Metin varyant="kucuk">{t('mobil.soru.ses.sinirDoldu')}</Metin>
            ) : null}
          </>
        ) : null}
      </View>
      <View className="flex-row gap-2">
        {ses.asama === 'kaydediyor' ? (
          <Dugme
            className="flex-1"
            varyant="tehlike"
            etiket={t('mobil.soru.ses.durdur')}
            onPress={() => void ses.durdur()}
            testID="ses-durdur"
          />
        ) : (
          <Dugme
            className="flex-1"
            etiket={ses.asama === 'bitti' ? t('mobil.soru.ses.yenidenKaydet') : t('mobil.soru.ses.kaydet')}
            onPress={() => {
              if (ses.asama === 'bitti') {
                ses.sil();
                onSil();
              }
              void ses.baslat();
            }}
            testID="ses-kaydet"
          />
        )}
        <Dugme
          className="flex-1"
          varyant="ikincil"
          etiket={ses.asama === 'bitti' ? t('mobil.soru.cizim.tamam') : t('ortak.iptal')}
          disabled={ses.asama === 'kaydediyor'}
          onPress={() => {
            if (ses.asama !== 'bitti') {
              ses.sil();
              onSil();
            }
            vazgec();
          }}
        />
      </View>
    </Kart>
  );
}
