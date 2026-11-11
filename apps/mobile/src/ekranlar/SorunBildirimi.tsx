import { t } from '@kopru/i18n';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Modal, View } from 'react-native';

import { SORUN_NEDENLERI, type SorunNedeni } from '../api/kayitTipleri';
import { Dugme } from '../ui/Dugme';
import { Ekran } from '../ui/Ekran';
import { Metin } from '../ui/Metin';
import { MetinGirdisi } from '../ui/MetinGirdisi';
import { Secici } from '../ui/Secici';
import { useServisler } from '../uygulama/baglam';
import { hataMesaji } from '../uygulama/hatalar';

interface Props {
  kayitId: string;
  baslik: string;
  /** Gonderildiyse `true` ile, vazgecildiyse `false` ile kapanir. */
  kapat: (gonderildi: boolean) => void;
}

/** "Acilmiyor" bildirimi: neden secimi + isteğe bagli aciklama (ogretmene uyari gider). */
export function SorunBildirimi({ kayitId, baslik, kapat }: Props) {
  const { adaptorler } = useServisler();
  const [neden, setNeden] = useState<SorunNedeni>('acilmiyor');
  const [aciklama, setAciklama] = useState('');

  const gonder = useMutation({
    networkMode: 'always',
    mutationFn: () =>
      adaptorler.kayit.sorunBildir(
        kayitId,
        neden,
        aciklama.trim() === '' ? undefined : aciklama.trim(),
      ),
    onSuccess: () => {
      kapat(true);
    },
  });

  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={() => {
        kapat(false);
      }}
    >
      <Ekran klavye>
        <Metin varyant="baslik" accessibilityRole="header">
          {t('mobil.kayit.sorun.baslik')}
        </Metin>
        <Metin varyant="ikincil">{baslik}</Metin>
        <Secici
          baslik={t('mobil.kayit.sorun.aciklama')}
          dikey
          deger={neden}
          onDegis={setNeden}
          secenekler={SORUN_NEDENLERI.map((n) => ({
            deger: n,
            etiket: t(`mobil.kayit.sorun.nedenler.${n}`),
          }))}
        />
        <MetinGirdisi
          etiket={t('mobil.kayit.sorun.aciklamaIpucu')}
          value={aciklama}
          onChangeText={setAciklama}
          maxLength={500}
          multiline
          testID="sorun-aciklama"
        />
        {gonder.isError ? (
          <Metin varyant="ikincil" className="text-hata" accessibilityRole="alert">
            {hataMesaji(gonder.error)}
          </Metin>
        ) : null}
        <View className="gap-2">
          <Dugme
            buyuk
            etiket={t('mobil.kayit.sorun.gonder')}
            yukleniyor={gonder.isPending}
            testID="sorun-gonder"
            onPress={() => {
              gonder.mutate();
            }}
          />
          <Dugme
            varyant="hayalet"
            etiket={t('ortak.vazgec')}
            onPress={() => {
              kapat(false);
            }}
          />
        </View>
      </Ekran>
    </Modal>
  );
}
