import { t } from '@kopru/i18n';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert, View } from 'react-native';

import type { OturumKaydi } from '../api/tipler';
import { zamanGoster } from '../lib/zaman';
import { Dugme } from '../ui/Dugme';
import { BosDurum, HataDurumu, Yukleniyor } from '../ui/Durumlar';
import { Ekran } from '../ui/Ekran';
import { Ikon } from '../ui/Ikon';
import { Kart } from '../ui/Kart';
import { Metin } from '../ui/Metin';
import { useOturum, useServisler } from '../uygulama/baglam';
import { hataMesaji } from '../uygulama/hatalar';
import { CevrimdisiSerit } from './CevrimdisiSerit';

function onayIste(baslik: string, mesaj: string, eylem: string, tamam: () => void) {
  Alert.alert(baslik, mesaj, [
    { text: t('ortak.iptal'), style: 'cancel' },
    { text: eylem, style: 'destructive', onPress: tamam },
  ]);
}

/**
 * Oturumlarim (Profil): acik cihazlar, "bu cihaz" isareti, tek oturum sonlandirma, digerlerini
 * ya da hepsini kapatma. Kendi oturumu kapaninca giris ekranina donulur. Hepsi onay ister.
 */
export function Oturumlarim() {
  const { adaptorler, oturum } = useServisler();
  const durum = useOturum();
  const qc = useQueryClient();
  const kullaniciId = durum.asama === 'giris' ? durum.kullanici.id : undefined;
  const anahtar = ['oturumlar', kullaniciId] as const;
  const [bilgi, setBilgi] = useState<string | null>(null);
  const [hata, setHata] = useState<string | null>(null);

  const liste = useQuery({
    queryKey: anahtar,
    queryFn: () => adaptorler.hesap.oturumlar(),
    enabled: !!kullaniciId,
    staleTime: 0,
  });

  const bitti = (kendiKapandi: boolean) => {
    if (kendiKapandi) oturum.kendiOturumuKapandi();
    else void qc.invalidateQueries({ queryKey: anahtar });
  };

  const sonlandir = useMutation({
    networkMode: 'always',
    mutationFn: (o: OturumKaydi) => adaptorler.hesap.oturumSonlandir(o.id, o.buOturum),
    onSuccess: (s) => {
      setHata(null);
      setBilgi(null);
      bitti(s.kendiOturumuKapandi);
    },
    onError: (e) => {
      setHata(hataMesaji(e));
      // Oturum zaten kapanmis olabilir (404): liste tazelensin.
      void qc.invalidateQueries({ queryKey: anahtar });
    },
  });

  const kapat = useMutation({
    networkMode: 'always',
    mutationFn: (mevcutHaric: boolean) => adaptorler.hesap.oturumlariKapat(mevcutHaric),
    onSuccess: (s) => {
      setHata(null);
      setBilgi(t('mobil.oturumlar.kapatildi', { n: s.kapatilan }));
      bitti(s.kendiOturumuKapandi);
    },
    onError: (e) => {
      setHata(hataMesaji(e));
    },
  });

  const digerleriVar = (liste.data ?? []).some((o) => !o.buOturum);
  const mesgul = sonlandir.isPending || kapat.isPending;

  function tekSonlandir(o: OturumKaydi) {
    onayIste(
      o.buOturum ? t('mobil.oturumlar.buOturumOnay') : t('mobil.oturumlar.tekOnay'),
      o.buOturum ? t('mobil.oturumlar.buOturumOnayMesaj') : t('mobil.oturumlar.tekOnayMesaj'),
      t('mobil.oturumlar.sonlandir'),
      () => {
        sonlandir.mutate(o);
      },
    );
  }

  return (
    <Ekran ust={<CevrimdisiSerit />} kenarlar={['left', 'right', 'bottom']}>
      <Metin varyant="ikincil">{t('mobil.oturumlar.aciklama')}</Metin>

      {liste.isPending ? <Yukleniyor /> : null}
      {liste.isError ? (
        <HataDurumu
          mesaj={hataMesaji(liste.error)}
          tekrar={() => {
            void liste.refetch();
          }}
        />
      ) : null}
      {liste.data?.length === 0 ? (
        <BosDurum ikon="checkmark-circle-outline" mesaj={t('mobil.oturumlar.bos')} />
      ) : null}

      {liste.data?.map((o) => {
        const cihaz = o.cihaz ?? t('mobil.oturumlar.cihazBilinmiyor');
        return (
          <Kart key={o.id} className="gap-3">
            <View
              className="flex-row items-start gap-3"
              accessible
              accessibilityLabel={[
                cihaz,
                o.buOturum ? t('mobil.oturumlar.buOturum') : '',
                t('mobil.oturumlar.sonKullanim', { zaman: zamanGoster(o.sonKullanim) }),
                o.ipMaskeli ? t('mobil.oturumlar.ip', { ip: o.ipMaskeli }) : '',
              ]
                .filter(Boolean)
                .join('. ')}
            >
              <Ikon ad={o.buOturum ? 'phone-portrait' : 'laptop-outline'} boyut={24} />
              <View className="flex-1 gap-1">
                <Metin varyant="altBaslik">{cihaz}</Metin>
                {o.buOturum ? (
                  <Metin varyant="etiket" className="text-birincil">
                    {t('mobil.oturumlar.buOturum')}
                  </Metin>
                ) : null}
                <Metin varyant="ikincil">
                  {t('mobil.oturumlar.sonKullanim', { zaman: zamanGoster(o.sonKullanim) })}
                </Metin>
                {o.ipMaskeli ? (
                  <Metin varyant="kucuk">{t('mobil.oturumlar.ip', { ip: o.ipMaskeli })}</Metin>
                ) : null}
              </View>
            </View>
            <Dugme
              varyant="ikincil"
              etiket={t('mobil.oturumlar.sonlandir')}
              accessibilityLabel={t('mobil.oturumlar.sonlandirEtiketi', { cihaz })}
              disabled={mesgul}
              yukleniyor={sonlandir.isPending && sonlandir.variables.id === o.id}
              onPress={() => {
                tekSonlandir(o);
              }}
            />
          </Kart>
        );
      })}

      {hata ? (
        <Metin varyant="ikincil" className="text-hata" accessibilityLiveRegion="polite">
          {hata}
        </Metin>
      ) : null}
      {bilgi ? (
        <Metin varyant="ikincil" accessibilityLiveRegion="polite">
          {bilgi}
        </Metin>
      ) : null}

      {liste.data && liste.data.length > 0 ? (
        <View className="gap-2">
          <Dugme
            varyant="ikincil"
            etiket={t('mobil.oturumlar.digerleriniKapat')}
            disabled={!digerleriVar || mesgul}
            yukleniyor={kapat.isPending && kapat.variables}
            onPress={() => {
              onayIste(
                t('mobil.oturumlar.digerleriOnay'),
                t('mobil.oturumlar.digerleriOnayMesaj'),
                t('mobil.oturumlar.digerleriniKapat'),
                () => {
                  kapat.mutate(true);
                },
              );
            }}
          />
          <Dugme
            varyant="tehlike"
            etiket={t('mobil.oturumlar.hepsiniKapat')}
            disabled={mesgul}
            yukleniyor={kapat.isPending && !kapat.variables}
            onPress={() => {
              onayIste(
                t('mobil.oturumlar.hepsiOnay'),
                t('mobil.oturumlar.hepsiOnayMesaj'),
                t('mobil.oturumlar.hepsiniKapat'),
                () => {
                  kapat.mutate(false);
                },
              );
            }}
          />
        </View>
      ) : null}
    </Ekran>
  );
}
