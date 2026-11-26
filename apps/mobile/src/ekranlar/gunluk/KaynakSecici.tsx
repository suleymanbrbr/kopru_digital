import { t } from '@kopru/i18n';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import type { SonKullanilanKaynak } from '../../api/gunlukSoruTipleri';
import { KAYNAK_YOK, kaynakAdi, type KaynakSecimi } from '../../gunluk/kurallar';
import { Cip } from '../../ui/Cip';
import { BosDurum, HataDurumu, Yukleniyor } from '../../ui/Durumlar';
import { Ikon } from '../../ui/Ikon';
import { Metin } from '../../ui/Metin';
import { MetinGirdisi } from '../../ui/MetinGirdisi';
import { Secici } from '../../ui/Secici';
import { useKaynakKitap, useKaynakKitaplar } from '../../uygulama/gunluk';
import { hataMesaji } from '../../uygulama/hatalar';

interface Props {
  bransKodu: string | null;
  deger: KaynakSecimi;
  onDegis: (k: KaynakSecimi) => void;
  /** Bu dersin son kullanilan kaynaklari: tek dokunusla secilir. */
  sonlar: readonly SonKullanilanKaynak[];
}

type Mod = 'yok' | 'test' | 'metin';

function sonSecime(k: SonKullanilanKaynak): KaynakSecimi | null {
  if (k.kaynakTestId && k.kaynakKitapId) {
    return {
      tur: 'test',
      kitapId: k.kaynakKitapId,
      kitapAd: k.kitapAd ?? '',
      testId: k.kaynakTestId,
      testAd: k.testAd ?? '',
    };
  }
  return k.kaynakMetin ? { tur: 'metin', metin: k.kaynakMetin } : null;
}

/**
 * Kaynak (isteğe bağlı): yok / kitap-test / serbest metin. Son kullanılan kaynaklar tek dokunuşla
 * seçilir (15 sn çıtası); kitap testi iki adımda (kitap, test) seçilir.
 */
export function KaynakSecici({ bransKodu, deger, onDegis, sonlar }: Props) {
  const [mod, setMod] = useState<Mod>(deger.tur);
  const [kitapId, setKitapId] = useState<string | null>(
    deger.tur === 'test' ? deger.kitapId : null,
  );
  const [kitapListesiAcik, setKitapListesiAcik] = useState(deger.tur !== 'test');
  // Test secildiyse liste kapanir (D/Y/B alani kaydirmadan gorunsun); "Degistir" yeniden acar.
  const [testAcik, setTestAcik] = useState(deger.tur !== 'test');
  const kitaplar = useKaynakKitaplar(bransKodu ?? undefined, undefined, mod === 'test');
  const detay = useKaynakKitap(mod === 'test' ? kitapId : null);

  function modDegis(m: Mod) {
    setMod(m);
    if (m === 'yok') onDegis(KAYNAK_YOK);
    if (m === 'metin') onDegis({ tur: 'metin', metin: deger.tur === 'metin' ? deger.metin : '' });
    if (m === 'test' && deger.tur !== 'test') onDegis(KAYNAK_YOK);
  }

  const secenekler = [
    { deger: 'yok' as const, etiket: t('mobil.gunluk.form.kaynakYok') },
    { deger: 'test' as const, etiket: t('mobil.gunluk.form.kaynakKitap') },
    { deger: 'metin' as const, etiket: t('mobil.gunluk.form.kaynakSerbest') },
  ];
  const sonSecimleri = sonlar
    .map((k) => ({ k, s: sonSecime(k) }))
    .filter((x): x is { k: SonKullanilanKaynak; s: KaynakSecimi } => x.s !== null);

  return (
    <View className="gap-3" testID="kaynak-secici">
      <Secici
        baslik={t('mobil.gunluk.form.kaynak')}
        secenekler={secenekler}
        deger={mod}
        onDegis={modDegis}
      />

      {sonSecimleri.length > 0 && !(deger.tur === 'test' && !testAcik) ? (
        <View className="gap-2" testID="son-kaynaklar">
          <Metin varyant="kucuk">{t('mobil.gunluk.form.sonKaynaklar')}</Metin>
          <View className="flex-row flex-wrap gap-2">
            {sonSecimleri.map(({ s }, i) => {
              const ad = kaynakAdi(s) ?? '';
              const secili = kaynakAdi(deger) === ad && deger.tur === s.tur;
              return (
                <Cip
                  key={`${s.tur}-${ad}-${String(i)}`}
                  etiket={ad}
                  secili={secili}
                  testID={`son-kaynak-${String(i)}`}
                  onPress={() => {
                    setMod(s.tur);
                    if (s.tur === 'test') {
                      setKitapId(s.kitapId);
                      setKitapListesiAcik(false);
                      setTestAcik(false);
                    }
                    onDegis(s);
                  }}
                />
              );
            })}
          </View>
        </View>
      ) : null}

      {mod === 'metin' ? (
        <MetinGirdisi
          etiket={t('mobil.gunluk.form.kaynakMetni')}
          placeholder={t('mobil.gunluk.form.kaynakMetniIpucu')}
          value={deger.tur === 'metin' ? deger.metin : ''}
          onChangeText={(m) => {
            onDegis({ tur: 'metin', metin: m });
          }}
          maxLength={200}
          testID="kaynak-metin"
        />
      ) : null}

      {mod === 'test' ? (
        deger.tur === 'test' && !testAcik ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('mobil.gunluk.form.testDegistirEtiketi', {
              kaynak: kaynakAdi(deger) ?? '',
            })}
            testID="secili-test"
            onPress={() => {
              setTestAcik(true);
            }}
            className="min-h-dokunma flex-row items-center gap-2 rounded-orta border border-birincil bg-yuzeyIkincil px-4 py-2 active:opacity-80"
          >
            <Ikon ad="checkmark" boyut={18} />
            <Metin varyant="etiket" className="flex-1">
              {kaynakAdi(deger)}
            </Metin>
            <Metin varyant="kucuk">{t('mobil.gunluk.form.testDegistir')}</Metin>
          </Pressable>
        ) : (
          <View className="gap-2" testID="kitap-secimi">
            {kitaplar.isPending ? <Yukleniyor /> : null}
            {kitaplar.isError && !kitaplar.data ? (
              <HataDurumu
                mesaj={hataMesaji(kitaplar.error)}
                tekrar={() => void kitaplar.refetch()}
              />
            ) : null}
            {kitaplar.data?.length === 0 ? (
              <BosDurum ikon="book-outline" mesaj={t('mobil.gunluk.form.kitapYok')} />
            ) : null}
            {kitapListesiAcik
              ? kitaplar.data?.map((k) => (
                  <Pressable
                    key={k.id}
                    accessibilityRole="button"
                    accessibilityLabel={`${k.ad}${k.yayinevi ? `, ${k.yayinevi}` : ''}`}
                    testID={`kitap-${k.id}`}
                    onPress={() => {
                      setKitapId(k.id);
                      setKitapListesiAcik(false);
                    }}
                    className="min-h-dokunma flex-row items-center gap-2 rounded-orta border border-kenar bg-yuzey px-4 py-2 active:opacity-80"
                  >
                    <Ikon ad="book-outline" boyut={20} />
                    <View className="flex-1">
                      <Metin varyant="etiket">{k.ad}</Metin>
                      {k.yayinevi ? <Metin varyant="kucuk">{k.yayinevi}</Metin> : null}
                    </View>
                  </Pressable>
                ))
              : null}
            {!kitapListesiAcik && kitapId ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('mobil.gunluk.form.kitapDegistir')}
                onPress={() => {
                  setKitapListesiAcik(true);
                }}
                className="min-h-dokunma flex-row items-center gap-2 active:opacity-80"
              >
                <Ikon ad="swap-horizontal" boyut={18} />
                <Metin varyant="etiket" className="flex-1">
                  {detay.data?.ad ?? (deger.tur === 'test' ? deger.kitapAd : t('ortak.yukleniyor'))}
                </Metin>
                <Metin varyant="kucuk">{t('mobil.gunluk.form.kitapDegistir')}</Metin>
              </Pressable>
            ) : null}
            {!kitapListesiAcik && detay.isError && !detay.data ? (
              <HataDurumu mesaj={hataMesaji(detay.error)} tekrar={() => void detay.refetch()} />
            ) : null}
            {!kitapListesiAcik && detay.data ? (
              <View className="gap-2" testID="test-listesi">
                {detay.data.testler.map((x) => {
                  const secili = deger.tur === 'test' && deger.testId === x.id;
                  return (
                    <Pressable
                      key={x.id}
                      accessibilityRole="radio"
                      accessibilityLabel={t('mobil.gunluk.form.testEtiketi', {
                        test: x.ad,
                        soru: x.soruSayisi,
                      })}
                      accessibilityState={{ selected: secili, checked: secili }}
                      testID={`test-${x.id}`}
                      onPress={() => {
                        const kitap = detay.data;
                        setTestAcik(false);
                        onDegis({
                          tur: 'test',
                          kitapId: kitap.id,
                          kitapAd: kitap.ad,
                          testId: x.id,
                          testAd: x.ad,
                        });
                      }}
                      className={`min-h-dokunma flex-row items-center gap-2 rounded-orta border px-4 py-2 active:opacity-80 ${
                        secili ? 'border-birincil bg-yuzeyIkincil' : 'border-kenar bg-yuzey'
                      }`}
                    >
                      {secili ? <Ikon ad="checkmark" boyut={18} /> : null}
                      <Metin varyant="etiket" className="flex-1">
                        {x.ad}
                      </Metin>
                      <Metin varyant="kucuk">
                        {x.cozulduGun
                          ? t('mobil.gunluk.form.testCozuldu', { soru: x.soruSayisi })
                          : t('mobil.gunluk.form.testSoru', { soru: x.soruSayisi })}
                      </Metin>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
          </View>
        )
      ) : null}
    </View>
  );
}
