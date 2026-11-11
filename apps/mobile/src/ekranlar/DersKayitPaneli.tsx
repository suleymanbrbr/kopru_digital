import { t } from '@kopru/i18n';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import type { DersKaynagi } from '../api/kayitTipleri';
import type { Ders } from '../api/operasyonTipleri';
import { geriBildirimAdi, saglayiciAdi, saglayiciIkonu } from '../kayit/kurallar';
import { Dugme } from '../ui/Dugme';
import { Ikon } from '../ui/Ikon';
import { Metin } from '../ui/Metin';
import { useDersGeriBildirimleri, useKaynakIzlemeleri } from '../uygulama/kayit';
import { useModulAcik } from '../uygulama/operasyon';

function KaynakSatiri({ k, hedef }: { k: DersKaynagi; hedef: number }) {
  const [acik, setAcik] = useState(false);
  const izleme = useKaynakIzlemeleri(k.id, acik);
  const durum =
    k.durum === 'bozuk'
      ? t('mobil.kayit.ogretmen.durumBozuk')
      : k.durum === 'suresi_doldu'
        ? t('mobil.kayit.ogretmen.durumSuresiDoldu')
        : k.durum === 'gizli'
          ? t('mobil.kayit.ogretmen.durumGizli')
          : null;
  return (
    <View className="gap-2" testID={`kaynak-${k.id}`}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('mobil.kayit.ogretmen.izlemeAc', { baslik: k.baslik })}
        accessibilityState={{ expanded: acik }}
        testID={`kaynak-ac-${k.id}`}
        onPress={() => {
          setAcik(!acik);
        }}
        className="min-h-dokunma flex-row items-center gap-2 active:opacity-80"
      >
        <Ikon ad={saglayiciIkonu(k.saglayici)} boyut={20} />
        <View className="flex-1">
          <Metin varyant="etiket">{k.baslik}</Metin>
          <Metin varyant="kucuk">
            {[
              saglayiciAdi(k.saglayici),
              t('mobil.kayit.ogretmen.ozet', { n: 1, izleyen: k.izleyenSayisi, hedef }),
              durum,
            ]
              .filter(Boolean)
              .join(' · ')}
          </Metin>
        </View>
        <Ikon ad={acik ? 'chevron-up' : 'chevron-down'} boyut={18} />
      </Pressable>
      {k.acikSorunSayisi > 0 ? (
        <View className="flex-row items-center gap-1" testID={`kaynak-sorun-${k.id}`}>
          <Ikon ad="warning-outline" boyut={14} />
          <Metin varyant="kucuk">
            {t('mobil.kayit.ogretmen.acikSorun', { n: k.acikSorunSayisi })}
          </Metin>
        </View>
      ) : null}
      {acik && izleme.data ? (
        <View className="gap-1 pl-7" testID={`izleme-${k.id}`}>
          <Metin varyant="kucuk">
            {t('mobil.kayit.ogretmen.izleyenler')}:{' '}
            {izleme.data.izleyenler.length > 0
              ? izleme.data.izleyenler.map((i) => i.ad).join(', ')
              : t('mobil.kayit.ogretmen.izleyenYok')}
          </Metin>
          {izleme.data.izlemeyenler.length > 0 ? (
            <Metin varyant="kucuk">
              {t('mobil.kayit.ogretmen.izlemeyenler')}:{' '}
              {izleme.data.izlemeyenler.map((i) => i.ad).join(', ')}
            </Metin>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function GeriBildirimOzeti({ dersId }: { dersId: string }) {
  const sorgu = useDersGeriBildirimleri(dersId, true);
  const d = sorgu.data;
  if (!d) return null;
  return (
    <View className="gap-2" testID={`geri-bildirim-ozet-${dersId}`}>
      <Metin varyant="etiket" accessibilityRole="header">
        {t('mobil.geriBildirim.ogretmen.baslik')}
      </Metin>
      {d.ozet.toplam === 0 ? (
        <Metin varyant="kucuk">{t('mobil.geriBildirim.ogretmen.yok')}</Metin>
      ) : (
        <>
          <Metin varyant="ikincil">
            {t('mobil.geriBildirim.ogretmen.sayilar', {
              a: d.ozet.anladim,
              k: d.ozet.kismen,
              n: d.ozet.anlamadim,
            })}
          </Metin>
          <Metin varyant="kucuk">
            {t('mobil.geriBildirim.ogretmen.cevaplayan', {
              n: d.ozet.toplam,
              toplam: d.katilimciSayisi,
            })}
          </Metin>
          {d.satirlar
            .filter((s) => !!s.not || !!s.konuId)
            .map((s) => (
              <Metin
                key={s.ogrenciId}
                varyant="kucuk"
                accessibilityLabel={`${s.ad}, ${geriBildirimAdi(s.deger)}. ${s.not ?? ''}`}
              >
                {s.ad}: {geriBildirimAdi(s.deger)}
                {s.not ? ` · ${s.not}` : ''}
              </Metin>
            ))}
        </>
      )}
    </View>
  );
}

interface Props {
  ders: Ders;
  ad: string;
  /** Dersin gunu icin yuklenmis kaynaklar (tum dersler); burada derse suzulur. */
  kaynaklar: readonly DersKaynagi[];
}

/**
 * Ogretmen ders kartinin alt bolumu: "Kayit ekle" dugmesi, kayitlarin izleyen sayilari ve
 * izleyenler, biten derslerde geri bildirim ozeti (sayilar ve notlar). `kayitlar` ve `geri_bildirim`
 * modulleri ayri ayri kapatilabilir; kapaliysa ilgili parca hic cizilmez.
 */
export function DersKayitPaneli({ ders, ad, kaynaklar }: Props) {
  const router = useRouter();
  const kayitAcik = useModulAcik('kayitlar');
  const geriAcik = useModulAcik('geri_bildirim');
  const [acik, setAcik] = useState(false);
  const [simdi] = useState(() => Date.now());
  const iptal = ders.durum === 'iptal';
  const bitti = !iptal && Date.parse(ders.bitis) <= simdi;
  const kayitGorunur = kayitAcik && !iptal;
  const geriGorunur = geriAcik && bitti;
  if (!kayitGorunur && !geriGorunur) return null;

  const dersinkiler = kaynaklar.filter((k) => k.dersId === ders.id);
  const izleyen = dersinkiler.reduce((n, k) => n + k.izleyenSayisi, 0);
  const hedef = ders.katilimciSayisi * dersinkiler.length;
  const ozet =
    dersinkiler.length > 0
      ? t('mobil.kayit.ogretmen.ozet', { n: dersinkiler.length, izleyen, hedef })
      : t('mobil.kayit.ogretmen.ozetYok');

  return (
    <View className="gap-2 border-t border-kenar pt-3" testID={`kayit-panel-${ders.id}`}>
      <View className="flex-row flex-wrap items-center gap-2">
        {kayitGorunur ? (
          <Dugme
            varyant="ikincil"
            etiket={t('mobil.kayit.ekle.dugme')}
            accessibilityLabel={t('mobil.kayit.ekle.dugmeEtiket', { ders: ad })}
            testID={`kayit-ekle-${ders.id}`}
            onPress={() => {
              router.push({
                pathname: '/kayit-ekle',
                params: { dersId: ders.id, baslik: ad, baslangic: ders.baslangic },
              });
            }}
          />
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${ozet}. ${acik ? t('mobil.kayit.ogretmen.gizle') : t('mobil.kayit.ogretmen.goster')}`}
          accessibilityState={{ expanded: acik }}
          testID={`kayit-panel-ac-${ders.id}`}
          onPress={() => {
            setAcik(!acik);
          }}
          className="min-h-dokunma flex-1 flex-row items-center gap-1 active:opacity-80"
        >
          <Metin varyant="kucuk" className="flex-1">
            {kayitGorunur ? ozet : t('mobil.geriBildirim.ogretmen.baslik')}
          </Metin>
          <Ikon ad={acik ? 'chevron-up' : 'chevron-down'} boyut={18} />
        </Pressable>
      </View>
      {acik ? (
        <View className="gap-3">
          {kayitGorunur
            ? dersinkiler.map((k) => <KaynakSatiri key={k.id} k={k} hedef={ders.katilimciSayisi} />)
            : null}
          {geriGorunur ? <GeriBildirimOzeti dersId={ders.id} /> : null}
        </View>
      ) : null}
    </View>
  );
}
