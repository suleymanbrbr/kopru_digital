import { t } from '@kopru/i18n';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import {
  OLCEK_KODLARI,
  OLCEK_PUANLARI,
  YORUM_EN_FAZLA,
  type OlcekKodu,
  type Olcekler,
} from '../../api/degerlendirmeTipleri';
import { apiHatasiMi } from '../../api/tipler';
import {
  DONEM_SECENEKLERI,
  degerlendirmeFormuDogrula,
  donemCoz,
  donemEtiketi,
  donemSecimiBul,
  olcekAdi,
  type DonemSecimi,
} from '../../degerlendirme/kurallar';
import { bugunTarihi } from '../../lib/saat';
import { bransAdi, bransListesi } from '../../ogrenme/konu';
import { Anahtar } from '../../ui/Anahtar';
import { Cip } from '../../ui/Cip';
import { Dugme } from '../../ui/Dugme';
import { HataDurumu, Yukleniyor } from '../../ui/Durumlar';
import { Ekran } from '../../ui/Ekran';
import { Kart } from '../../ui/Kart';
import { Metin } from '../../ui/Metin';
import { MetinGirdisi } from '../../ui/MetinGirdisi';
import { Secici } from '../../ui/Secici';
import {
  useDegerlendirmeDuzenle,
  useDegerlendirmeYaz,
  useKocluk,
  useZamanCizelgesi,
} from '../../uygulama/degerlendirme';
import { degerlendirmeHataMesaji, hataMesaji } from '../../uygulama/hatalar';
import { useKonular } from '../../uygulama/ogrenme';
import { useSaatDilimi } from '../../uygulama/operasyon';
import { CevrimdisiSerit } from '../CevrimdisiSerit';

/** Tek olcek: 1-5 buyuk dokunmatik dugmeler; secili puana tekrar dokunmak olcegi temizler. */
function OlcekSecici({
  kod,
  deger,
  onDegis,
}: {
  kod: OlcekKodu;
  deger: number | null;
  onDegis: (v: number | null) => void;
}) {
  const ad = olcekAdi(kod);
  return (
    <View className="gap-2" accessibilityRole="radiogroup" accessibilityLabel={ad}>
      <Metin varyant="etiket">{ad}</Metin>
      <View className="flex-row gap-2">
        {OLCEK_PUANLARI.map((p) => {
          const secili = deger === p;
          return (
            <Pressable
              key={p}
              accessibilityRole="radio"
              accessibilityLabel={t('mobil.degerlendirme.olcekSec', { olcek: ad, puan: p })}
              accessibilityHint={secili ? t('mobil.degerlendirme.olcekTemizleIpucu') : undefined}
              accessibilityState={{ selected: secili, checked: secili }}
              testID={`olcek-${kod}-${String(p)}`}
              onPress={() => {
                onDegis(secili ? null : p);
              }}
              className={`min-h-14 flex-1 items-center justify-center rounded-orta border py-3 active:opacity-80 ${
                secili ? 'border-birincil bg-birincil' : 'border-kenar bg-yuzeyIkincil'
              }`}
            >
              <Metin varyant="altBaslik" className={secili ? 'text-birincilUzeri' : 'text-metin'}>
                {String(p)}
              </Metin>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

interface Props {
  ogrenciId: string;
  ad: string;
  /** Duzenlenecek degerlendirmenin kimligi (yazarin kendi, 7 gun icinde). */
  duzelt?: string;
}

const BOS_OLCEKLER: Olcekler = {
  calisma_duzeni: null,
  derse_katilim: null,
  odev_disiplini: null,
  anlama_duzeyi: null,
};

/**
 * Degerlendirme yaz / duzenle (kalite citasi: 30 saniye). Donem "bu hafta" on secili, 4 olcek buyuk
 * dokunmatik 1-5 (hepsi istege bagli), yorum istege bagli, "Ogrenci gorsun" varsayilan KAPALI ve
 * aciklamali. Kayit `/kocluk`a doner; cevrimdisiyken kuyruklanmaz (acik hata).
 */
export function DegerlendirmeFormu({ ogrenciId, ad, duzelt }: Props) {
  const router = useRouter();
  const qc = useQueryClient();
  const { tz } = useSaatDilimi();
  const bugun = bugunTarihi(tz);
  const konular = useKonular();
  const kocluk = useKocluk(duzelt ? ogrenciId : null);
  const zaman = useZamanCizelgesi(ogrenciId, kocluk.data);
  const duzeltKayit = duzelt ? zaman.liste.find((d) => d.id === duzelt) : undefined;
  const yaz = useDegerlendirmeYaz(ogrenciId);
  const duzenle = useDegerlendirmeDuzenle();

  const [donem, setDonem] = useState<DonemSecimi>('hafta');
  const [ozelDonem, setOzelDonem] = useState<{ baslangic: string; bitis: string } | null>(null);
  const [olcekler, setOlcekler] = useState<Olcekler>(BOS_OLCEKLER);
  const [yorum, setYorum] = useState('');
  const [gorur, setGorur] = useState(false);
  const [bransKodu, setBransKodu] = useState<string | null>(null);
  const [dersAcik, setDersAcik] = useState(false);
  const [denendi, setDenendi] = useState(false);
  const [mesaj, setMesaj] = useState<string | null>(null);
  const [yuklendi, setYuklendi] = useState(false);

  // Duzenleme: kaydin mevcut degerleri forma yuklenir (bir kez).
  if (duzeltKayit && !yuklendi) {
    setYuklendi(true);
    const d = { baslangic: duzeltKayit.donemBaslangic, bitis: duzeltKayit.donemBitis };
    const secim = donemSecimiBul(d, bugun);
    setDonem(secim);
    if (secim === 'ozel') setOzelDonem(d);
    setOlcekler({ ...duzeltKayit.olcekler });
    setYorum(duzeltKayit.yorum ?? '');
    setGorur(duzeltKayit.ogrenciGorur);
    setBransKodu(duzeltKayit.bransKodu);
  }

  const hatalar = degerlendirmeFormuDogrula({ olcekler, yorum });
  const donemAraligi =
    donem === 'ozel' && ozelDonem ? ozelDonem : donemCoz(donem === 'ozel' ? 'hafta' : donem, bugun);
  const dersler = bransListesi(konular.data ?? []);
  const mesgul = yaz.isPending || duzenle.isPending;

  const donemEtiketleri: Record<Exclude<DonemSecimi, 'ozel'>, string> = {
    hafta: t('mobil.degerlendirme.donemHafta', {
      aralik: donemEtiketi(donemCoz('hafta', bugun).baslangic, donemCoz('hafta', bugun).bitis),
    }),
    gecen_hafta: t('mobil.degerlendirme.donemGecenHafta'),
    bugun: t('mobil.degerlendirme.donemBugun'),
    dun: t('mobil.degerlendirme.donemDun'),
  };
  const donemSecenekleri = [
    ...DONEM_SECENEKLERI.map((s) => ({ deger: s, etiket: donemEtiketleri[s] })),
    ...(ozelDonem
      ? [
          {
            deger: 'ozel' as DonemSecimi,
            etiket: donemEtiketi(ozelDonem.baslangic, ozelDonem.bitis),
          },
        ]
      : []),
  ];

  async function kaydet() {
    setDenendi(true);
    setMesaj(null);
    if (hatalar.bos || hatalar.yorumUzun) return;
    try {
      if (duzelt) {
        if (!duzeltKayit) return;
        await duzenle.mutateAsync({
          id: duzelt,
          girdi: {
            donemBaslangic: donemAraligi.baslangic,
            donemBitis: donemAraligi.bitis,
            bransKodu,
            olcekler,
            yorum: yorum.trim() ? yorum.trim() : null,
            ogrenciGorur: gorur,
            surum: duzeltKayit.surum,
          },
        });
      } else {
        await yaz.mutateAsync({
          donemBaslangic: donemAraligi.baslangic,
          ...(donemAraligi.bitis !== donemAraligi.baslangic
            ? { donemBitis: donemAraligi.bitis }
            : {}),
          ...(bransKodu ? { bransKodu } : {}),
          olcekler,
          ...(yorum.trim() ? { yorum: yorum.trim() } : {}),
          ogrenciGorur: gorur,
        });
      }
      router.back();
    } catch (e) {
      if (duzelt && apiHatasiMi(e) && e.ayrinti === 'surum_cakismasi') {
        // Baska bir yerden degisti: guncel hali yuklenir (yazilanlar yenilenir), tekrar denenir.
        await qc.invalidateQueries({ queryKey: ['degerlendirme'] });
        setYuklendi(false);
        setMesaj(t('mobil.degerlendirme.surumCakismasi'));
        return;
      }
      setMesaj(degerlendirmeHataMesaji(e));
    }
  }

  const duzenlemeYukleniyor = !!duzelt && !duzeltKayit && kocluk.isPending;
  const duzenlemeBulunamadi = !!duzelt && !duzeltKayit && !kocluk.isPending;

  return (
    <Ekran klavye kenarlar={['left', 'right', 'bottom']} ust={<CevrimdisiSerit />}>
      <View className="gap-1">
        <Metin varyant="baslik" accessibilityRole="header">
          {duzelt ? t('mobil.degerlendirme.duzenleBaslik') : t('degerlendirme.yaz')}
        </Metin>
        <Metin varyant="ikincil" testID="degerlendirme-ogrenci-adi">
          {ad || t('mobil.ogrenciler.adsiz')}
        </Metin>
        {duzelt ? <Metin varyant="kucuk">{t('degerlendirme.duzenlemeSuresi')}</Metin> : null}
      </View>

      {duzenlemeYukleniyor ? <Yukleniyor /> : null}
      {duzenlemeBulunamadi ? (
        <HataDurumu
          mesaj={
            kocluk.isError ? hataMesaji(kocluk.error) : t('mobil.degerlendirme.duzenlemeBulunamadi')
          }
          tekrar={() => void kocluk.refetch()}
        />
      ) : null}

      {!duzenlemeYukleniyor && !duzenlemeBulunamadi ? (
        <>
          <Secici
            baslik={t('degerlendirme.donem')}
            secenekler={donemSecenekleri}
            deger={donem}
            onDegis={setDonem}
            dikey
          />

          <Kart className="gap-4" testID="degerlendirme-olcekler">
            <View className="gap-1">
              <Metin varyant="etiket" accessibilityRole="header">
                {t('mobil.degerlendirme.olcekler')}
              </Metin>
              <Metin varyant="kucuk">{t('degerlendirme.olcek.yardim')}</Metin>
            </View>
            {OLCEK_KODLARI.map((k) => (
              <OlcekSecici
                key={k}
                kod={k}
                deger={olcekler[k]}
                onDegis={(v) => {
                  setOlcekler((o) => ({ ...o, [k]: v }));
                }}
              />
            ))}
          </Kart>

          <View className="gap-1">
            <MetinGirdisi
              etiket={t('degerlendirme.yorum')}
              placeholder={t('mobil.degerlendirme.yorumIpucu')}
              value={yorum}
              onChangeText={setYorum}
              multiline
              maxLength={YORUM_EN_FAZLA}
              testID="degerlendirme-yorum"
            />
            {denendi && hatalar.bos ? (
              <Metin varyant="ikincil" className="text-hata" accessibilityRole="alert">
                {t('mobil.degerlendirme.bosHata')}
              </Metin>
            ) : null}
          </View>

          <Kart className="gap-2" testID="ogrenci-gorsun">
            <Anahtar etiket={t('degerlendirme.ogrenciGorsun')} deger={gorur} onDegis={setGorur} />
            <Metin
              varyant="kucuk"
              testID="ogrenci-gorsun-aciklama"
              accessibilityLiveRegion="polite"
            >
              {gorur
                ? t('mobil.degerlendirme.gorunurAcik')
                : t('mobil.degerlendirme.gorunurKapali')}
            </Metin>
          </Kart>

          <View className="gap-2">
            <Dugme
              varyant="hayalet"
              etiket={
                bransKodu
                  ? t('mobil.degerlendirme.dersSecili', { ders: bransAdi(bransKodu) })
                  : t('degerlendirme.ders')
              }
              testID="degerlendirme-ders-ac"
              onPress={() => {
                setDersAcik((a) => !a);
              }}
            />
            {dersAcik ? (
              <View className="flex-row flex-wrap gap-2" testID="degerlendirme-dersler">
                <Cip
                  etiket={t('mobil.degerlendirme.genel')}
                  secili={bransKodu === null}
                  testID="degerlendirme-ders-genel"
                  onPress={() => {
                    setBransKodu(null);
                  }}
                />
                {dersler.map((b) => (
                  <Cip
                    key={b.kod}
                    etiket={b.ad}
                    secili={bransKodu === b.kod}
                    testID={`degerlendirme-ders-${b.kod}`}
                    onPress={() => {
                      setBransKodu(b.kod);
                    }}
                  />
                ))}
              </View>
            ) : null}
          </View>

          {mesaj ? (
            <Metin
              varyant="ikincil"
              className="text-hata"
              accessibilityRole="alert"
              testID="degerlendirme-hata"
            >
              {mesaj}
            </Metin>
          ) : null}
          <Dugme
            buyuk
            etiket={duzelt ? t('mobil.degerlendirme.guncelle') : t('degerlendirme.kaydet')}
            yukleniyor={mesgul}
            onPress={() => void kaydet()}
            testID="degerlendirme-kaydet"
          />
        </>
      ) : null}
    </Ekran>
  );
}
