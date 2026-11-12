import { t } from '@kopru/i18n';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Image, View } from 'react-native';

import { SORU_EN_FAZLA_FOTOGRAF } from '../../api/soruTipleri';
import type { CizimVerisi } from '../../cizim/model';
import { galeridenAl, kameradanAl, type AlinanFoto } from '../../foto/al';
import { type fotoHazirla } from '../../foto/hazirla';
import { yeniIstekId } from '../../lib/kimlik';
import { bransAdi } from '../../ogrenme/konu';
import { bransSirasi, kotaGorunumu } from '../../soru/bicim';
import { CizimEkrani } from '../../soru/CizimEkrani';
import { FotoDuzenle } from '../../soru/FotoDuzenle';
import { IzinKarti } from '../../soru/parcalar';
import { Cip } from '../../ui/Cip';
import { Dugme } from '../../ui/Dugme';
import { Ekran } from '../../ui/Ekran';
import { Ikon } from '../../ui/Ikon';
import { Kart } from '../../ui/Kart';
import { Metin } from '../../ui/Metin';
import { MetinGirdisi } from '../../ui/MetinGirdisi';
import { useAktif, useServisler } from '../../uygulama/baglam';
import { useSaatDilimi } from '../../uygulama/operasyon';
import { useGonderimler, useSoruKotasi } from '../../uygulama/soru';
import { bekleyenSoruSayisi } from '../../yukleme/gonderim';
import { KONU_SECIMI_BOS, KonuSecici, type KonuSecimi } from '../KonuSecici';

interface Taslak {
  id: string;
  uri: string;
  genislik: number;
  yukseklik: number;
  /** Duzenleme (yeniden kirpma) icin orijinal. */
  ham: AlinanFoto;
  isaret?: { duzUri: string; veri: CizimVerisi };
}

const SON_BRANS_ANAHTARI = (uyelikId: string) => `kopru.soru.son-secim.${uyelikId}`;

function sonSecimiOku(oku: (k: string) => string | undefined, uyelikId: string): KonuSecimi {
  const ham = oku(SON_BRANS_ANAHTARI(uyelikId));
  if (!ham) return KONU_SECIMI_BOS;
  try {
    const v = JSON.parse(ham) as Partial<KonuSecimi>;
    return { bransKodu: v.bransKodu ?? null, konuId: v.konuId ?? null };
  } catch {
    return KONU_SECIMI_BOS;
  }
}

/** Ogrenci: yeni soru. Fotograf (en cok 3), ders/konu, not, isaret, gonder. */
export function SoruYeniEkrani() {
  const router = useRouter();
  const { gonderim, yerelDepo } = useServisler();
  const uyelikId = useAktif()?.uyelik.uyelikId ?? '';
  const { tz } = useSaatDilimi();
  const kotaSorgu = useSoruKotasi();
  const gonderimler = useGonderimler();

  const [fotolar, setFotolar] = useState<Taslak[]>([]);
  const [duzenlenecek, setDuzenlenecek] = useState<AlinanFoto[]>([]);
  const [yeniden, setYeniden] = useState<string | null>(null);
  const [isaretlenen, setIsaretlenen] = useState<string | null>(null);
  const [secim, setSecim] = useState<KonuSecimi>(() =>
    sonSecimiOku((k) => yerelDepo.getString(k), uyelikId),
  );
  const [not, setNot] = useState('');
  const [mesaj, setMesaj] = useState<string | null>(null);
  const [izin, setIzin] = useState(false);
  const [mesgul, setMesgul] = useState(false);
  const [denendi, setDenendi] = useState(false);

  // Son secilen ders (acilistaki degeri) basa alinir; secim degisince siralama oynamaz.
  const [siralama] = useState(() => bransSirasi(secim.bransKodu));
  const kota = kotaSorgu.data
    ? kotaGorunumu(kotaSorgu.data, bekleyenSoruSayisi(gonderimler), tz)
    : null;
  const kalanYer = SORU_EN_FAZLA_FOTOGRAF - fotolar.length - duzenlenecek.length;

  function ekle(sonuc: Awaited<ReturnType<typeof kameradanAl>>) {
    setMesaj(null);
    if (sonuc.durum === 'izin') {
      setIzin(true);
      return;
    }
    if (sonuc.durum === 'yok') {
      setMesaj(t('mobil.soru.ogrenci.kameraYok'));
      return;
    }
    if (sonuc.durum === 'tamam') {
      setIzin(false);
      setDuzenlenecek((d) => [...d, ...sonuc.fotograflar.slice(0, Math.max(0, kalanYer))]);
    }
  }

  const duzenlenen = yeniden
    ? (fotolar.find((f) => f.id === yeniden)?.ham ?? null)
    : (duzenlenecek[0] ?? null);

  function duzenlemeBitti(f: Awaited<ReturnType<typeof fotoHazirla>>) {
    const ham = duzenlenen;
    if (!ham) return;
    if (yeniden) {
      setFotolar((l) =>
        l.map((x) =>
          x.id === yeniden
            ? { ...x, uri: f.uri, genislik: f.genislik, yukseklik: f.yukseklik, isaret: undefined }
            : x,
        ),
      );
      setYeniden(null);
    } else {
      setFotolar((l) => [
        ...l,
        { id: yeniIstekId(), uri: f.uri, genislik: f.genislik, yukseklik: f.yukseklik, ham },
      ]);
      setDuzenlenecek((d) => d.slice(1));
    }
  }

  function duzenlemeVazgec() {
    if (yeniden) setYeniden(null);
    else setDuzenlenecek((d) => d.slice(1));
  }

  const isaretFoto = fotolar.find((f) => f.id === isaretlenen);

  const hazir = fotolar.length > 0 && !!secim.bransKodu && !(kota?.dolu ?? false);

  async function gonder() {
    setDenendi(true);
    if (!hazir || !secim.bransKodu) return;
    setMesgul(true);
    try {
      const dosyalar: Parameters<typeof gonderim.baslat>[0]['dosyalar'] = {};
      const isaretler: { dosya: string; kaynak: string; cizimVerisi: CizimVerisi }[] = [];
      fotolar.forEach((f, i) => {
        dosyalar[`f${String(i)}`] = {
          tur: 'soru_fotografi',
          mimeTipi: 'image/jpeg',
          yerelUri: f.uri,
        };
        if (f.isaret) {
          dosyalar[`i${String(i)}`] = {
            tur: 'soru_cizim',
            mimeTipi: 'image/jpeg',
            yerelUri: f.isaret.duzUri,
          };
          isaretler.push({
            dosya: `i${String(i)}`,
            kaynak: `f${String(i)}`,
            cizimVerisi: f.isaret.veri,
          });
        }
      });
      yerelDepo.set(SON_BRANS_ANAHTARI(uyelikId), JSON.stringify(secim));
      await gonderim.baslat({
        tur: 'soru',
        baslik: bransAdi(secim.bransKodu),
        govde: {
          tur: 'soru',
          bransKodu: secim.bransKodu,
          ...(secim.konuId ? { konuId: secim.konuId } : {}),
          ...(not.trim() ? { metin: not.trim() } : {}),
          fotograflar: fotolar.map((_, i) => `f${String(i)}`),
          ...(isaretler.length ? { isaretler } : {}),
        },
        dosyalar,
      });
      router.replace('/(uygulama)/(sekmeler)/soru-sor');
    } catch {
      setMesaj(t('mobil.soru.hata.genel'));
      setMesgul(false);
    }
  }

  return (
    <Ekran klavye kenarlar={['left', 'right', 'bottom']}>
      {kota ? (
        <Kart
          className={`flex-row items-center gap-3 ${kota.dolu ? 'border-hata' : ''}`}
          accessible
          accessibilityLabel={t('mobil.soru.kota.etiket', {
            mesaj: kota.sifirlanma ? `${kota.mesaj} ${kota.sifirlanma}` : kota.mesaj,
          })}
          testID="soru-kota"
        >
          <Ikon ad={kota.dolu ? 'alert-circle' : 'ticket-outline'} />
          <View className="flex-1">
            <Metin varyant="etiket">{kota.mesaj}</Metin>
            {kota.sifirlanma ? <Metin varyant="ikincil">{kota.sifirlanma}</Metin> : null}
          </View>
        </Kart>
      ) : null}

      <View className="gap-2">
        <Metin varyant="etiket" accessibilityRole="header">
          {t('mobil.soru.ogrenci.fotograflar', { n: fotolar.length, en: SORU_EN_FAZLA_FOTOGRAF })}
        </Metin>
        <View className="gap-3" testID="foto-listesi">
          {fotolar.map((f, i) => (
            <Kart key={f.id} className="flex-row gap-3 p-3" testID={`foto-${String(i)}`}>
              <View className="gap-1" style={{ width: 112 }}>
                <Image
                  source={{ uri: f.isaret?.duzUri ?? f.uri }}
                  style={{ width: '100%', aspectRatio: f.genislik / f.yukseklik, borderRadius: 8 }}
                  resizeMode="cover"
                  accessibilityLabel={t('mobil.soru.ogrenci.fotografEtiketi', { n: i + 1 })}
                />
                {f.isaret ? (
                  <View className="flex-row items-center gap-1">
                    <Ikon ad="pencil" boyut={14} />
                    <Metin varyant="kucuk">{t('mobil.soru.ogrenci.isaretli')}</Metin>
                  </View>
                ) : null}
              </View>
              <View className="flex-1 gap-2">
                <Dugme
                  varyant="ikincil"
                  etiket={t('mobil.soru.ogrenci.fotografDuzenle')}
                  onPress={() => {
                    setYeniden(f.id);
                  }}
                />
                <Dugme
                  varyant="ikincil"
                  etiket={t('mobil.soru.ogrenci.fotografIsaretle')}
                  onPress={() => {
                    setIsaretlenen(f.id);
                  }}
                />
                <Dugme
                  varyant="hayalet"
                  etiket={t('mobil.soru.ogrenci.fotografSil')}
                  accessibilityLabel={`${t('mobil.soru.ogrenci.fotografSil')}: ${t('mobil.soru.ogrenci.fotografEtiketi', { n: i + 1 })}`}
                  onPress={() => {
                    setFotolar((l) => l.filter((x) => x.id !== f.id));
                  }}
                />
              </View>
            </Kart>
          ))}
        </View>

        {fotolar.length < SORU_EN_FAZLA_FOTOGRAF ? (
          <View className="flex-row gap-2">
            <Dugme
              className="flex-1"
              etiket={t('mobil.soru.ogrenci.kameraIleCek')}
              onPress={() => {
                void kameradanAl().then(ekle);
              }}
            />
            <Dugme
              className="flex-1"
              varyant="ikincil"
              etiket={t('mobil.soru.ogrenci.galeridenSec')}
              onPress={() => {
                void galeridenAl(Math.max(1, kalanYer)).then(ekle);
              }}
            />
          </View>
        ) : (
          <Metin varyant="kucuk">
            {t('mobil.soru.ogrenci.enFazla', { n: SORU_EN_FAZLA_FOTOGRAF })}
          </Metin>
        )}
        {mesaj ? (
          <Metin varyant="ikincil" className="text-hata" accessibilityRole="alert">
            {mesaj}
          </Metin>
        ) : null}
        {izin ? (
          <IzinKarti
            tur="kamera"
            kapat={() => {
              setIzin(false);
            }}
          />
        ) : null}
        {denendi && fotolar.length === 0 ? (
          <Metin varyant="ikincil" className="text-hata" accessibilityRole="alert">
            {t('mobil.soru.ogrenci.fotografGerekli')}
          </Metin>
        ) : null}
      </View>

      <View className="gap-2">
        <Metin varyant="etiket">{t('mobil.soru.ogrenci.ders')}</Metin>
        <View
          className="flex-row flex-wrap gap-2"
          accessibilityRole="radiogroup"
          testID="ders-ciplari"
        >
          {siralama.map((k) => (
            <Cip
              key={k}
              etiket={bransAdi(k)}
              secili={secim.bransKodu === k}
              onPress={() => {
                setSecim({ bransKodu: k, konuId: secim.bransKodu === k ? secim.konuId : null });
              }}
              testID={`ders-${k}`}
            />
          ))}
        </View>
      </View>
      <KonuSecici deger={secim} onDegis={setSecim} etiket={t('mobil.soru.ogrenci.konu')} />
      {denendi && !secim.bransKodu ? (
        <Metin varyant="ikincil" className="text-hata" accessibilityRole="alert">
          {t('mobil.soru.ogrenci.dersGerekli')}
        </Metin>
      ) : null}

      <MetinGirdisi
        etiket={t('mobil.soru.ogrenci.not')}
        placeholder={t('mobil.soru.ogrenci.notIpucu')}
        value={not}
        onChangeText={setNot}
        multiline
        maxLength={1000}
        style={{ minHeight: 96, textAlignVertical: 'top', paddingTop: 12 }}
      />

      <Dugme
        buyuk
        etiket={t('mobil.soru.ogrenci.gonder')}
        yukleniyor={mesgul}
        disabled={kota?.dolu ?? false}
        onPress={() => void gonder()}
        testID="soru-gonder"
      />
      {mesgul ? (
        <View className="items-center">
          <ActivityIndicator />
        </View>
      ) : null}

      {duzenlenen ? (
        <FotoDuzenle
          key={yeniden ?? duzenlenen.uri}
          uri={duzenlenen.uri}
          boyut={{ genislik: duzenlenen.genislik, yukseklik: duzenlenen.yukseklik }}
          onTamam={duzenlemeBitti}
          onVazgec={duzenlemeVazgec}
        />
      ) : null}
      {isaretFoto ? (
        <CizimEkrani
          mod="isaret"
          gorsel={isaretFoto.uri}
          kaynakUri={isaretFoto.uri}
          oran={isaretFoto.yukseklik / isaretFoto.genislik}
          onVazgec={() => {
            setIsaretlenen(null);
          }}
          onBitti={(s) => {
            setFotolar((l) =>
              l.map((x) =>
                x.id === isaretFoto.id ? { ...x, isaret: { duzUri: s.duzUri, veri: s.veri } } : x,
              ),
            );
            setIsaretlenen(null);
          }}
        />
      ) : null}
    </Ekran>
  );
}
