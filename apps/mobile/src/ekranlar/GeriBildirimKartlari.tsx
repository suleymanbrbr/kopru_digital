import { t, type MessageKey } from '@kopru/i18n';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import type { GeriBildirimDegeri } from '../api/kayitTipleri';
import { GERI_BILDIRIM_DEGERLERI } from '../api/kayitTipleri';
import { geriBildirimAdi } from '../kayit/kurallar';
import { kisaZaman } from '../lib/saat';
import {
  GERI_BILDIRIM_TURU,
  geriBildirimKuyrugaAl,
  type GeriBildirimYuku,
  type VerilenGeriBildirim,
} from '../offline/geriBildirim';
import { useTema } from '../tema/TemaSaglayici';
import { Dugme } from '../ui/Dugme';
import { Ikon } from '../ui/Ikon';
import { Kart } from '../ui/Kart';
import { Metin } from '../ui/Metin';
import { MetinGirdisi } from '../ui/MetinGirdisi';
import { useAktif, useServisler } from '../uygulama/baglam';
import { useGeriBildirimBekleyen, useVerilenGeriBildirimler } from '../uygulama/kayit';
import { useKuyruk, useModulAcik, useSaatDilimi } from '../uygulama/operasyon';
import { KONU_SECIMI_BOS, KonuSecici, type KonuSecimi } from './KonuSecici';

const IKONLAR = {
  anladim: 'happy-outline',
  kismen: 'remove-circle-outline',
  anlamadim: 'sad-outline',
} as const;

/** Karta gerekli ders bilgisi (bekleyen sunucu satirindan ya da yerel kayittan). */
interface KartDersi {
  dersId: string;
  ad: string;
  baslangic: string;
  sonVerme: string;
}

function bekleyenAdi(baslik: string | null, bransKodu: string): string {
  if (baslik) return baslik;
  const anahtar = `mobil.brans.${bransKodu}` as MessageKey;
  const ad = t(anahtar);
  return ad === anahtar ? t('mobil.ders.adsiz') : ad;
}

function DegerDugmesi({
  deger,
  ders,
  secili,
  onSec,
}: {
  deger: GeriBildirimDegeri;
  ders: string;
  secili: boolean;
  onSec: (d: GeriBildirimDegeri) => void;
}) {
  const { renkler } = useTema();
  const ad = geriBildirimAdi(deger);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('mobil.geriBildirim.degerEtiket', { ders, deger: ad })}
      accessibilityState={{ selected: secili }}
      testID={`geri-bildirim-${deger}`}
      onPress={() => {
        onSec(deger);
      }}
      className={`min-h-16 min-w-0 flex-1 items-center justify-center gap-1 rounded-buyuk border px-2 py-3 active:opacity-80 ${
        secili ? 'border-birincil bg-yuzeyIkincil' : 'border-kenar bg-yuzey'
      }`}
    >
      <Ikon ad={secili ? 'checkmark-circle' : IKONLAR[deger]} boyut={26} renk={renkler.birincil} />
      <Metin varyant="etiket" className="text-center">
        {ad}
      </Metin>
    </Pressable>
  );
}

/**
 * Tek ders icin geri bildirim karti. Ucuncu dokunus gerekmez: degerlerden birine dokunmak
 * gonderir (kuyruga alinir, iyimser olarak "tesekkurler" gosterilir). Not ve konu sonradan eklenir;
 * `sonVerme`ye kadar cevap degistirilebilir (PUT idempotent, son deger kazanir).
 */
export function GeriBildirimKarti({
  ders,
  verilen,
}: {
  ders: KartDersi;
  verilen: VerilenGeriBildirim | null;
}) {
  const { kuyruk, geriBildirimDeposu } = useServisler();
  const uyelikId = useAktif()?.uyelik.uyelikId;
  const { tz } = useSaatDilimi();
  const { bekleyen } = useKuyruk();
  const [degistiriyor, setDegistiriyor] = useState(false);
  const [notAcik, setNotAcik] = useState(false);
  const [not, setNot] = useState(verilen?.not ?? '');
  const [konu, setKonu] = useState<KonuSecimi>(
    verilen?.konuId ? { bransKodu: null, konuId: verilen.konuId } : KONU_SECIMI_BOS,
  );
  const [notGonderildi, setNotGonderildi] = useState(false);
  const beklemede = bekleyen.some(
    (i) => i.tur === GERI_BILDIRIM_TURU && (i.yuk as GeriBildirimYuku).dersId === ders.dersId,
  );

  function gonder(deger: GeriBildirimDegeri, ek?: { not: string | null; konuId: string | null }) {
    if (!uyelikId) return;
    const sonNot = ek ? ek.not : (verilen?.not ?? null);
    const sonKonu = ek ? ek.konuId : (verilen?.konuId ?? null);
    const yuk: GeriBildirimYuku = {
      dersId: ders.dersId,
      dersBaslik: ders.ad,
      dersBaslangic: ders.baslangic,
      sonVerme: ders.sonVerme,
      deger,
      konuId: sonKonu,
      not: sonNot,
    };
    // Iyimser: yerel kayit aninda yazilir, kart "tesekkurler" durumuna gecer.
    geriBildirimDeposu.ekle(uyelikId, { ...yuk, konuId: sonKonu, not: sonNot });
    geriBildirimKuyrugaAl(kuyruk, yuk);
    setDegistiriyor(false);
  }

  function notuGonder() {
    if (!verilen) return;
    const temiz = not.trim();
    gonder(verilen.deger, { not: temiz === '' ? null : temiz, konuId: konu.konuId });
    setNotAcik(false);
    setNotGonderildi(true);
  }

  // --- Soru durumu ---
  if (!verilen || degistiriyor) {
    return (
      <Kart className="gap-3" testID={`geri-bildirim-kart-${ders.dersId}`}>
        <View
          className="gap-1"
          accessible
          accessibilityLabel={t('mobil.geriBildirim.soruEtiket', { ders: ders.ad })}
        >
          <Metin varyant="altBaslik" accessibilityRole="header">
            {t('mobil.geriBildirim.soru')}
          </Metin>
          <Metin varyant="ikincil">
            {t('mobil.geriBildirim.dersZaman', {
              ders: ders.ad,
              zaman: kisaZaman(ders.baslangic, tz),
            })}
          </Metin>
        </View>
        <View className="flex-row gap-2">
          {GERI_BILDIRIM_DEGERLERI.map((d) => (
            <DegerDugmesi
              key={d}
              deger={d}
              ders={ders.ad}
              secili={verilen?.deger === d}
              onSec={(x) => {
                gonder(x);
              }}
            />
          ))}
        </View>
        {degistiriyor ? (
          <Dugme
            varyant="hayalet"
            etiket={t('mobil.geriBildirim.kapat')}
            onPress={() => {
              setDegistiriyor(false);
            }}
          />
        ) : null}
      </Kart>
    );
  }

  // --- Verildi durumu ---
  const deger = geriBildirimAdi(verilen.deger);
  return (
    <Kart className="gap-3" testID={`geri-bildirim-kart-${ders.dersId}`}>
      <View
        className="gap-1"
        accessible
        accessibilityLiveRegion="polite"
        accessibilityLabel={t('mobil.geriBildirim.tesekkur', { deger })}
      >
        <View className="flex-row items-center gap-2">
          <Ikon ad="checkmark-circle" />
          <Metin varyant="altBaslik" className="flex-1">
            {t('mobil.geriBildirim.tesekkur', { deger })}
          </Metin>
        </View>
        <Metin varyant="kucuk">
          {t('mobil.geriBildirim.dersZaman', {
            ders: ders.ad,
            zaman: kisaZaman(ders.baslangic, tz),
          })}
        </Metin>
        {beklemede ? (
          <Metin varyant="kucuk" testID="geri-bildirim-bekliyor">
            {t('mobil.geriBildirim.bekliyor')}
          </Metin>
        ) : null}
        {notGonderildi && !beklemede ? (
          <Metin varyant="kucuk">{t('mobil.geriBildirim.notGonderildi')}</Metin>
        ) : null}
        <Metin varyant="kucuk">
          {t('mobil.geriBildirim.sonVerme', { zaman: kisaZaman(ders.sonVerme, tz) })}
        </Metin>
      </View>
      {notAcik ? (
        <View className="gap-3">
          <KonuSecici
            deger={konu}
            onDegis={setKonu}
            etiket={t('mobil.geriBildirim.konuBaslik')}
            yalnizDers={false}
          />
          <MetinGirdisi
            etiket={t('mobil.geriBildirim.notAlan')}
            placeholder={t('mobil.geriBildirim.notIpucu')}
            value={not}
            onChangeText={setNot}
            maxLength={500}
            multiline
            testID="geri-bildirim-not"
          />
          <View className="flex-row gap-2">
            <Dugme
              className="flex-1"
              etiket={t('mobil.geriBildirim.notGonder')}
              onPress={notuGonder}
            />
            <Dugme
              className="flex-1"
              varyant="ikincil"
              etiket={t('ortak.vazgec')}
              onPress={() => {
                setNotAcik(false);
              }}
            />
          </View>
        </View>
      ) : (
        <View className="flex-row flex-wrap gap-2">
          <Dugme
            varyant="ikincil"
            etiket={t('mobil.geriBildirim.notEkle')}
            testID="geri-bildirim-not-ekle"
            onPress={() => {
              setNotAcik(true);
            }}
          />
          <Dugme
            varyant="hayalet"
            etiket={t('mobil.geriBildirim.degistir')}
            testID="geri-bildirim-degistir"
            onPress={() => {
              setDegistiriyor(true);
            }}
          />
        </View>
      )}
    </Kart>
  );
}

/**
 * Ogrenci "Bugun": "Bugunku ders nasildi?" kartlari. Kaynak: sunucunun bekleyen listesi (son 24 saat,
 * henuz cevaplanmamis) + yerel "verdim" kaydi (cevaplananlar `sonVerme`ye kadar degistirilebilir
 * olarak kalir). `geri_bildirim` modulu kapaliysa hicbir sey cizilmez.
 */
export function GeriBildirimKartlari() {
  const acik = useModulAcik('geri_bildirim');
  const sorgu = useGeriBildirimBekleyen();
  const verilen = useVerilenGeriBildirimler();
  const [simdi] = useState(() => Date.now());
  if (!acik) return null;

  const gecerli = verilen.filter((v) => Date.parse(v.sonVerme) > simdi);
  const verilenIdler = new Set(gecerli.map((v) => v.dersId));
  const sorular = (sorgu.data ?? []).filter((b) => !verilenIdler.has(b.dersId));
  if (sorular.length === 0 && gecerli.length === 0) return null;

  return (
    <View className="gap-3" testID="geri-bildirim-kartlari">
      {sorular.map((b) => (
        <GeriBildirimKarti
          key={b.dersId}
          ders={{
            dersId: b.dersId,
            ad: bekleyenAdi(b.baslik, b.bransKodu),
            baslangic: b.baslangic,
            sonVerme: b.sonVerme,
          }}
          verilen={null}
        />
      ))}
      {gecerli.map((v) => (
        <GeriBildirimKarti
          key={v.dersId}
          ders={{
            dersId: v.dersId,
            ad: v.dersBaslik,
            baslangic: v.dersBaslangic,
            sonVerme: v.sonVerme,
          }}
          verilen={v}
        />
      ))}
    </View>
  );
}
