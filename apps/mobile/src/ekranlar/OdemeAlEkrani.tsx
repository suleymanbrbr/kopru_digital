import { kurusBicimle, t } from '@kopru/i18n';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';

import type { TahsilatYontemi } from '../api/operasyonTipleri';
import { tutarCoz } from '../finans/kurallar';
import { yeniIstekId } from '../lib/kimlik';
import { Dugme } from '../ui/Dugme';
import { Ekran } from '../ui/Ekran';
import { Ikon } from '../ui/Ikon';
import { Kart } from '../ui/Kart';
import { Metin } from '../ui/Metin';
import { MetinGirdisi } from '../ui/MetinGirdisi';
import { Secici } from '../ui/Secici';
import { useServisler } from '../uygulama/baglam';
import { hataMesaji } from '../uygulama/hatalar';
import { sonYontem, yontemSecenekleri, yontemiHatirla } from './PaketSatEkrani';

/**
 * Odeme al: tutar (TL metni -> kurus, gecersizse alan hatasi) + yontem. `Idempotency-Key`: ayni
 * tutar ve yontemle yapilan her deneme AYNI anahtari kullanir (ag hatasi sonrasi tekrar denemek ya
 * da cift dokunmak cift kayit yapmaz); tutar/yontem degisirse yeni anahtar uretilir.
 */
export function OdemeAlEkrani({ ogrenciId, ad }: { ogrenciId: string; ad: string }) {
  const router = useRouter();
  const qc = useQueryClient();
  const { adaptorler } = useServisler();
  const [tutar, setTutar] = useState('');
  const [yontem, setYontem] = useState<TahsilatYontemi>(sonYontem());
  const [denendi, setDenendi] = useState(false);
  const [sonuc, setSonuc] = useState<{ tekrar: boolean; kurus: number } | null>(null);
  const anahtar = useRef<{ imza: string; id: string } | null>(null);
  // Ayni tick'te ust uste dokunmalar (state guncellemesinden once) ikinci istegi gondermez.
  const gonderiyor = useRef(false);

  const cozum = tutarCoz(tutar);
  const tutarHata = cozum.ok
    ? null
    : cozum.hata === 'bos'
      ? t('mobil.finans.tutarBos')
      : t('mobil.finans.tutarGecersiz');

  const kaydetIstegi = useMutation({
    networkMode: 'always',
    mutationFn: (g: { kurus: number; istekId: string }) =>
      adaptorler.finans.tahsilatAl({ ogrenciId, tutarKurus: g.kurus, yontem }, g.istekId),
    onSettled: () => {
      gonderiyor.current = false;
    },
    onSuccess: (s, g) => {
      yontemiHatirla(yontem);
      void qc.invalidateQueries({ queryKey: ['finans'] });
      setSonuc({ tekrar: s.tekrar, kurus: g.kurus });
    },
  });

  function kaydet() {
    setDenendi(true);
    // Cift dokunma: istek suruyorsa ikinci dokunus yok sayilir.
    if (gonderiyor.current || !cozum.ok) return;
    gonderiyor.current = true;
    const imza = `${String(cozum.kurus)}|${yontem}`;
    if (anahtar.current?.imza !== imza) anahtar.current = { imza, id: yeniIstekId() };
    kaydetIstegi.mutate({ kurus: cozum.kurus, istekId: anahtar.current.id });
  }

  if (sonuc) {
    return (
      <Ekran kenarlar={['left', 'right']}>
        <Kart className="items-center gap-3" accessibilityLiveRegion="polite" testID="odeme-alindi">
          <Ikon ad="checkmark-circle" boyut={40} />
          <Metin varyant="altBaslik" className="text-center">
            {t('mobil.finans.odemeAlindi', { tutar: kurusBicimle(sonuc.kurus) })}
          </Metin>
          {sonuc.tekrar ? (
            <Metin varyant="ikincil" className="text-center">
              {t('mobil.finans.odemeTekrar')}
            </Metin>
          ) : null}
          <Dugme
            etiket={t('ortak.devam')}
            onPress={() => {
              router.back();
            }}
          />
        </Kart>
      </Ekran>
    );
  }

  return (
    <Ekran kenarlar={['left', 'right', 'bottom']} klavye>
      <Metin varyant="baslik" accessibilityRole="header">
        {ad}
      </Metin>
      <MetinGirdisi
        etiket={t('mobil.finans.tutar')}
        value={tutar}
        onChangeText={setTutar}
        placeholder={t('mobil.finans.tutarIpucu')}
        keyboardType="decimal-pad"
        hata={denendi ? tutarHata : null}
      />
      <Secici
        baslik={t('mobil.finans.yontem')}
        secenekler={yontemSecenekleri()}
        deger={yontem}
        onDegis={setYontem}
      />
      {kaydetIstegi.isError ? (
        <Metin varyant="ikincil" className="text-hata" accessibilityLiveRegion="polite">
          {hataMesaji(kaydetIstegi.error)}
        </Metin>
      ) : null}
      <Dugme
        buyuk
        etiket={t('mobil.finans.odemeKaydet')}
        yukleniyor={kaydetIstegi.isPending}
        onPress={kaydet}
      />
    </Ekran>
  );
}
