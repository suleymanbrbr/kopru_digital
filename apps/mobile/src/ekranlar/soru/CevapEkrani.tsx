import { t } from '@kopru/i18n';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Image, View } from 'react-native';

import type { OkumaAdresi } from '../../api/soruTipleri';
import type { CizimVerisi } from '../../cizim/model';
import { galeridenAl, kameradanAl, type AlinanFoto } from '../../foto/al';
import type { HazirFoto } from '../../foto/hazirla';
import { yeniIstekId } from '../../lib/kimlik';
import { bransAdi } from '../../ogrenme/konu';
import { sureMetni } from '../../ses/sinirlar';
import { CizimEkrani, type CizimModu, type CizimSonucu } from '../../soru/CizimEkrani';
import { FotoDuzenle } from '../../soru/FotoDuzenle';
import { skiaKaynagi } from '../../soru/gorsel';
import { IzinKarti } from '../../soru/parcalar';
import { SesKaydedici } from '../../soru/SesKaydedici';
import { Anahtar } from '../../ui/Anahtar';
import { Dugme } from '../../ui/Dugme';
import { HataDurumu, Yukleniyor } from '../../ui/Durumlar';
import { Ekran } from '../../ui/Ekran';
import { Ikon } from '../../ui/Ikon';
import { Kart } from '../../ui/Kart';
import { Metin } from '../../ui/Metin';
import { MetinGirdisi } from '../../ui/MetinGirdisi';
import { useServisler } from '../../uygulama/baglam';
import { hataMesaji } from '../../uygulama/hatalar';
import { useSoru } from '../../uygulama/soru';

type Ek =
  | { id: string; tur: 'fotograf'; uri: string; genislik: number; yukseklik: number }
  | {
      id: string;
      tur: 'cizim';
      duzUri: string;
      kaynak: string;
      veri: CizimVerisi;
      mini: boolean;
    }
  | { id: string; tur: 'ses'; uri: string; sureSn: number; mini: boolean };

interface CizimHedefi {
  mod: CizimModu;
  adres: OkumaAdresi;
  kaynakId: string;
}

/**
 * Ogretmen cevabi: metin, cozumun fotografi, fotograf uzerine cizim, sesli anlatim, mini anlatim
 * (cizerken ses; zaman damgali cizgiler) ve "derste konusalim". "Cevabi gonder" kalici kuyruga
 * alir; ekran kapatilabilir.
 */
export function CevapEkrani({ id }: { id: string }) {
  const router = useRouter();
  const { gonderim } = useServisler();
  const sorgu = useSoru(id);
  const [metin, setMetin] = useState('');
  const [derste, setDerste] = useState(false);
  const [ekler, setEkler] = useState<Ek[]>([]);
  const [duzenlenecek, setDuzenlenecek] = useState<AlinanFoto | null>(null);
  const [secim, setSecim] = useState<CizimModu | null>(null);
  const [hedef, setHedef] = useState<CizimHedefi | null>(null);
  const [sesAcik, setSesAcik] = useState(false);
  const [izin, setIzin] = useState(false);
  const [mesaj, setMesaj] = useState<string | null>(null);
  const [mesgul, setMesgul] = useState(false);

  const soru = sorgu.data;
  const fotolar = (soru?.fotograflar ?? []).filter((f) => f.adres);
  const sesVar = ekler.some((e) => e.tur === 'ses');
  const bos = metin.trim() === '' && !derste && ekler.length === 0;

  function cizimBaslat(mod: CizimModu) {
    if (fotolar.length === 0) return;
    if (fotolar.length === 1) {
      const f = fotolar[0];
      if (f?.adres) setHedef({ mod, adres: f.adres, kaynakId: f.medyaDosyaId });
    } else setSecim(mod);
  }

  async function fotografAl(kaynak: 'kamera' | 'galeri') {
    setMesaj(null);
    const s = kaynak === 'kamera' ? await kameradanAl() : await galeridenAl(1);
    if (s.durum === 'izin') setIzin(true);
    else if (s.durum === 'yok') setMesaj(t('mobil.soru.ogrenci.kameraYok'));
    else if (s.durum === 'tamam' && s.fotograflar[0]) {
      setIzin(false);
      setDuzenlenecek(s.fotograflar[0]);
    }
  }

  function fotografBitti(f: HazirFoto) {
    setEkler((l) => [
      ...l,
      {
        id: yeniIstekId(),
        tur: 'fotograf',
        uri: f.uri,
        genislik: f.genislik,
        yukseklik: f.yukseklik,
      },
    ]);
    setDuzenlenecek(null);
  }

  function cizimBitti(s: CizimSonucu, h: CizimHedefi) {
    const yeni: Ek[] = [
      {
        id: yeniIstekId(),
        tur: 'cizim',
        duzUri: s.duzUri,
        kaynak: h.kaynakId,
        veri: s.veri,
        mini: h.mod === 'mini',
      },
    ];
    if (h.mod === 'mini' && s.sesUri) {
      yeni.push({ id: yeniIstekId(), tur: 'ses', uri: s.sesUri, sureSn: s.sesSn ?? 1, mini: true });
    }
    setEkler((l) => {
      // Tek sesli anlatim: yeni mini anlatim onceki sesi degistirir.
      const kalan = h.mod === 'mini' ? l.filter((e) => e.tur !== 'ses') : l;
      return [...kalan, ...yeni];
    });
    setHedef(null);
  }

  async function gonder() {
    if (bos) {
      setMesaj(t('mobil.soru.cevap.bos'));
      return;
    }
    setMesgul(true);
    setMesaj(null);
    try {
      const dosyalar: Parameters<typeof gonderim.baslat>[0]['dosyalar'] = {};
      const taslak: Parameters<typeof gonderim.baslat>[0]['govde'] & { tur: 'cevap' } = {
        tur: 'cevap',
        soruId: id,
        ...(metin.trim() ? { metin: metin.trim() } : {}),
        dersteKonusalim: derste,
        ekler: [],
      };
      ekler.forEach((e, i) => {
        const ad = `e${String(i)}`;
        if (e.tur === 'fotograf') {
          dosyalar[ad] = { tur: 'soru_cevap_fotografi', mimeTipi: 'image/jpeg', yerelUri: e.uri };
          taslak.ekler.push({ tur: 'fotograf', dosya: ad });
        } else if (e.tur === 'cizim') {
          dosyalar[ad] = { tur: 'soru_cizim', mimeTipi: 'image/jpeg', yerelUri: e.duzUri };
          taslak.ekler.push({
            tur: 'cizimli_fotograf',
            dosya: ad,
            kaynak: e.kaynak,
            cizimVerisi: e.veri,
          });
        } else {
          dosyalar[ad] = { tur: 'soru_ses', mimeTipi: 'audio/mp4', yerelUri: e.uri };
          taslak.ekler.push({ tur: 'ses', dosya: ad, sureSn: e.sureSn });
        }
      });
      await gonderim.baslat({
        tur: 'cevap',
        hedefId: id,
        baslik: soru?.ogrenciAdi ?? bransAdi(soru?.bransKodu ?? ''),
        govde: taslak,
        dosyalar,
      });
      router.replace('/(uygulama)/(sekmeler)/sorular');
    } catch {
      setMesaj(t('mobil.soru.hata.genel'));
      setMesgul(false);
    }
  }

  return (
    <Ekran kenarlar={['left', 'right', 'bottom']} klavye>
      {sorgu.isPending ? <Yukleniyor /> : null}
      {sorgu.isError && !soru ? (
        <HataDurumu mesaj={hataMesaji(sorgu.error)} tekrar={() => void sorgu.refetch()} />
      ) : null}
      {soru ? (
        <>
          <Metin varyant="etiket">
            {soru.ogrenciAdi ?? t('mobil.soru.ogretmen.adsiz')} · {bransAdi(soru.bransKodu)}
          </Metin>
          <MetinGirdisi
            etiket={t('mobil.soru.cevap.metin')}
            placeholder={t('mobil.soru.cevap.metinIpucu')}
            value={metin}
            onChangeText={setMetin}
            multiline
            maxLength={4000}
            style={{ minHeight: 96, textAlignVertical: 'top' }}
            testID="cevap-metin"
          />

          <View className="gap-2">
            <Metin varyant="etiket" accessibilityRole="header">
              {t('mobil.soru.cevap.ekler')}
            </Metin>
            <View className="gap-2">
              <View className="flex-row gap-2">
                <Dugme
                  className="flex-1"
                  varyant="ikincil"
                  etiket={t('mobil.soru.ogrenci.kameraIleCek')}
                  onPress={() => void fotografAl('kamera')}
                />
                <Dugme
                  className="flex-1"
                  varyant="ikincil"
                  etiket={t('mobil.soru.ogrenci.galeridenSec')}
                  onPress={() => void fotografAl('galeri')}
                  testID="cevap-galeri"
                />
              </View>
              <Dugme
                varyant="ikincil"
                etiket={t('mobil.soru.cevap.cizimYap')}
                disabled={fotolar.length === 0}
                onPress={() => {
                  cizimBaslat('cizim');
                }}
                testID="cevap-cizim"
              />
              <Dugme
                varyant="ikincil"
                etiket={t('mobil.soru.cevap.miniAnlatim')}
                disabled={fotolar.length === 0}
                onPress={() => {
                  cizimBaslat('mini');
                }}
                testID="cevap-mini"
              />
              <Dugme
                varyant="ikincil"
                etiket={t('mobil.soru.cevap.sesliAnlat')}
                disabled={sesVar}
                onPress={() => {
                  setSesAcik(true);
                }}
                testID="cevap-ses"
              />
              {fotolar.length === 0 ? (
                <Metin varyant="kucuk">{t('mobil.soru.cevap.fotografYok')}</Metin>
              ) : null}
            </View>
            {izin ? (
              <IzinKarti
                tur="kamera"
                kapat={() => {
                  setIzin(false);
                }}
              />
            ) : null}
          </View>

          {secim ? (
            <Kart className="gap-2" testID="foto-sec">
              <Metin varyant="etiket">{t('mobil.soru.cevap.hangiFotograf')}</Metin>
              <View className="flex-row flex-wrap gap-2">
                {fotolar.map((f, i) => (
                  <Dugme
                    key={f.medyaDosyaId}
                    varyant="ikincil"
                    etiket={t('mobil.soru.cevap.fotografSec', { n: i + 1 })}
                    onPress={() => {
                      if (f.adres)
                        setHedef({ mod: secim, adres: f.adres, kaynakId: f.medyaDosyaId });
                      setSecim(null);
                    }}
                  />
                ))}
              </View>
            </Kart>
          ) : null}

          {sesAcik ? (
            <SesKaydedici
              onHazir={(uri, sn) => {
                setEkler((l) => [
                  ...l.filter((e) => !(e.tur === 'ses' && !e.mini)),
                  { id: yeniIstekId(), tur: 'ses', uri, sureSn: sn, mini: false },
                ]);
              }}
              onSil={() => {
                setEkler((l) => l.filter((e) => !(e.tur === 'ses' && !e.mini)));
              }}
              vazgec={() => {
                setSesAcik(false);
              }}
            />
          ) : null}

          {ekler.length > 0 ? (
            <View className="gap-2" testID="ekler">
              {ekler.map((e) => (
                <Kart key={e.id} className="flex-row items-center gap-3 p-3">
                  {e.tur === 'fotograf' ? (
                    <Image
                      source={{ uri: e.uri }}
                      style={{ width: 56, height: 56, borderRadius: 8 }}
                    />
                  ) : e.tur === 'cizim' ? (
                    <Image
                      source={{ uri: e.duzUri }}
                      style={{ width: 56, height: 56, borderRadius: 8 }}
                    />
                  ) : (
                    <Ikon ad="mic" boyut={28} />
                  )}
                  <Metin className="flex-1">
                    {e.tur === 'fotograf'
                      ? t('mobil.soru.cevap.ekFotograf')
                      : e.tur === 'cizim'
                        ? e.mini
                          ? t('mobil.soru.ek.miniAnlatim')
                          : t('mobil.soru.cevap.ekCizim')
                        : e.mini
                          ? t('mobil.soru.cevap.ekMini', { sure: sureMetni(e.sureSn) })
                          : t('mobil.soru.cevap.ekSes', { sure: sureMetni(e.sureSn) })}
                  </Metin>
                  <Dugme
                    varyant="hayalet"
                    etiket={t('mobil.soru.cevap.ekKaldir')}
                    accessibilityLabel={`${t('mobil.soru.cevap.ekKaldir')}: ${e.tur}`}
                    onPress={() => {
                      // Mini anlatimda cizim ve ses birlikte kaldirilir.
                      setEkler((l) =>
                        l.filter(
                          (x) =>
                            x.id !== e.id &&
                            !(
                              e.tur !== 'fotograf' &&
                              'mini' in e &&
                              e.mini &&
                              'mini' in x &&
                              x.mini
                            ),
                        ),
                      );
                    }}
                  />
                </Kart>
              ))}
            </View>
          ) : null}

          <Kart>
            <Anahtar
              etiket={t('mobil.soru.cevap.dersteKonusalim')}
              aciklama={t('mobil.soru.cevap.dersteKonusalimAciklama')}
              deger={derste}
              onDegis={setDerste}
            />
          </Kart>

          {mesaj ? (
            <Metin varyant="ikincil" className="text-hata" accessibilityRole="alert">
              {mesaj}
            </Metin>
          ) : null}
          <Dugme
            buyuk
            etiket={t('mobil.soru.cevap.gonder')}
            yukleniyor={mesgul}
            onPress={() => void gonder()}
            testID="cevap-gonder"
          />
        </>
      ) : null}

      {duzenlenecek ? (
        <FotoDuzenle
          uri={duzenlenecek.uri}
          boyut={{ genislik: duzenlenecek.genislik, yukseklik: duzenlenecek.yukseklik }}
          onTamam={fotografBitti}
          onVazgec={() => {
            setDuzenlenecek(null);
          }}
        />
      ) : null}
      {hedef ? (
        <CizimEkrani
          mod={hedef.mod}
          gorsel={skiaKaynagi(hedef.adres.ortaUrl ?? hedef.adres.asilUrl)}
          kaynakUri={hedef.adres.ortaUrl ?? hedef.adres.asilUrl}
          oran={(hedef.adres.yukseklik ?? 4) / (hedef.adres.genislik ?? 3)}
          onVazgec={() => {
            setHedef(null);
          }}
          onBitti={(s) => {
            cizimBitti(s, hedef);
          }}
        />
      ) : null}
    </Ekran>
  );
}
