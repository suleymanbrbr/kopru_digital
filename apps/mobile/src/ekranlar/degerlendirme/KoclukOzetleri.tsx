import { t } from '@kopru/i18n';
import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { OLCEK_KODLARI, type Kocluk, type Olcekler } from '../../api/degerlendirmeTipleri';
import { olcekAdi, puanMetni, kisaTarih } from '../../degerlendirme/kurallar';
import { oneriMetni } from '../../degerlendirme/oneriMetni';
import { yuzdeMetni } from '../../gunluk/kurallar';
import { haftaEtiketi } from '../../ogrenme/hafta';
import { bransAdi } from '../../ogrenme/konu';
import { Dugme } from '../../ui/Dugme';
import { Kart } from '../../ui/Kart';
import { Metin } from '../../ui/Metin';

/** Ortalamalar okunakli satirlar olarak ("Calisma duzeni 3,5 / 5"); veri olmayan olcek atlanir. */
function OrtalamaListesi({ o }: { o: Olcekler }) {
  const dolu = OLCEK_KODLARI.filter((k) => o[k] !== null);
  if (dolu.length === 0) return null;
  return (
    <View className="flex-row flex-wrap gap-2">
      {dolu.map((k) => {
        const metin = t('mobil.kocluk.olcekOrtalamasi', {
          olcek: olcekAdi(k),
          puan: puanMetni(o[k]),
        });
        return (
          <View
            key={k}
            accessible
            accessibilityLabel={metin}
            className="rounded-tam border border-kenar bg-yuzeyIkincil px-3 py-1"
          >
            <Metin varyant="kucuk" className="text-metin">
              {metin}
            </Metin>
          </View>
        );
      })}
    </View>
  );
}

/** Son 4 haftanin olcek ortalamalari: hafta hafta okunakli liste (en yeni once) ve 4 haftalik ortalama. */
export function OlcekEgilimi({ k }: { k: Kocluk }) {
  const haftalar = [...k.olcekHaftalari].reverse();
  const herhangi = k.olcekToplami.sayi > 0;
  return (
    <Kart className="gap-3" testID="olcek-egilimi">
      <Metin varyant="altBaslik" accessibilityRole="header">
        {t('kocluk.olcekEgilimi')}
      </Metin>
      {!herhangi ? <Metin varyant="ikincil">{t('mobil.kocluk.olcekBos')}</Metin> : null}
      {haftalar.map((h) => (
        <View
          key={h.haftaBaslangici}
          className="gap-2 border-t border-kenar pt-2"
          testID={`olcek-hafta-${h.haftaBaslangici}`}
        >
          <Metin varyant="etiket">
            {`${haftaEtiketi(h.haftaBaslangici)} · ${t('mobil.kocluk.degerlendirmeSayisi', { n: h.sayi })}`}
          </Metin>
          {h.sayi === 0 ? (
            <Metin varyant="kucuk">{t('mobil.kocluk.haftaBos')}</Metin>
          ) : (
            <OrtalamaListesi o={h.ortalamalar} />
          )}
        </View>
      ))}
      {herhangi ? (
        <View className="gap-2 border-t border-kenar pt-2" testID="olcek-toplam">
          <Metin varyant="etiket">
            {`${t('mobil.kocluk.ortalama4Hafta')} · ${t('mobil.kocluk.degerlendirmeSayisi', { n: k.olcekToplami.sayi })}`}
          </Metin>
          <OrtalamaListesi o={k.olcekToplami.ortalamalar} />
        </View>
      ) : null}
    </Kart>
  );
}

/** Kullandigi kaynaklar: kitap ilerlemesi, serbest kaynaklar ve odevlerde gecenler. */
export function KullanilanKaynaklarKarti({ k }: { k: Kocluk }) {
  const { kitaplar, serbest, odevler } = k.kullanilanKaynaklar;
  const bos = kitaplar.length + serbest.length + odevler.length === 0;
  return (
    <Kart className="gap-3" testID="kullanilan-kaynaklar">
      <Metin varyant="altBaslik" accessibilityRole="header">
        {t('kocluk.kullanilanKaynaklar')}
      </Metin>
      {bos ? <Metin varyant="ikincil">{t('mobil.kocluk.kaynakKullanimiBos')}</Metin> : null}
      {kitaplar.map((b) => (
        <View
          key={b.kitapId}
          className="gap-1 border-t border-kenar pt-2"
          accessible
          accessibilityLabel={`${b.ad}, ${t('kocluk.ilerleme', { cozulen: b.cozulenTest, toplam: b.toplamTest })}`}
          testID={`kullanilan-kitap-${b.kitapId}`}
        >
          <Metin varyant="etiket">{b.ad}</Metin>
          <Metin varyant="ikincil">
            {`${t('kocluk.ilerleme', { cozulen: b.cozulenTest, toplam: b.toplamTest })} · ${bransAdi(b.bransKodu)}`}
          </Metin>
          <Metin varyant="kucuk">
            {t('mobil.kocluk.sonKullanim', { tarih: kisaTarih(b.sonKullanimGun) })}
          </Metin>
        </View>
      ))}
      {serbest.map((s) => (
        <View key={`s-${s.ad}`} className="gap-1 border-t border-kenar pt-2">
          <Metin varyant="etiket">{s.ad}</Metin>
          <Metin varyant="kucuk">
            {`${t('mobil.kocluk.kayitSayisi', { n: s.kayitSayisi })} · ${t('mobil.kocluk.sonKullanim', { tarih: kisaTarih(s.sonKullanimGun) })}`}
          </Metin>
        </View>
      ))}
      {odevler.map((o) => (
        <View key={`o-${o.ad}`} className="gap-1 border-t border-kenar pt-2">
          <Metin varyant="etiket">{o.ad}</Metin>
          <Metin varyant="kucuk">
            {`${t('mobil.kocluk.odevSayisi', { n: o.odevSayisi })} · ${t('mobil.kocluk.sonKullanim', { tarih: kisaTarih(o.sonKullanimGun) })}`}
          </Metin>
        </View>
      ))}
    </Kart>
  );
}

/** Konu analizi ozeti (son 30 gun) ve Konu analizi ekranina baglanti. */
export function KonuOzetiKarti({
  k,
  ogrenciId,
  ogrenciAd,
}: {
  k: Kocluk;
  ogrenciId: string;
  ogrenciAd: string;
}) {
  const router = useRouter();
  const o = k.konuOzeti;
  return (
    <Kart className="gap-3" testID="konu-ozeti">
      <Metin varyant="altBaslik" accessibilityRole="header">
        {t('kocluk.konuAnalizi')}
      </Metin>
      {o.cozulen === 0 ? (
        <Metin varyant="ikincil">{t('mobil.kocluk.konuBos')}</Metin>
      ) : (
        <>
          <Metin accessibilityLiveRegion="polite">
            {t('mobil.kocluk.konuOzet', { n: o.cozulen, yuzde: yuzdeMetni(o.basari) })}
          </Metin>
          <View className="gap-2">
            <Metin varyant="etiket">{t('mobil.kocluk.zayifKonular')}</Metin>
            {o.zayifKonular.length === 0 ? (
              <Metin varyant="ikincil">{t('mobil.kocluk.zayifBos')}</Metin>
            ) : null}
            {o.zayifKonular.map((z) => (
              <Metin key={z.konuId} testID={`zayif-konu-${z.konuId}`}>
                {t('mobil.kocluk.zayifSatir', {
                  konu: z.konuAd ?? t('mobil.gunluk.analiz.konuAdsiz'),
                  yuzde: yuzdeMetni(z.basari),
                  soru: z.cozulen,
                })}
              </Metin>
            ))}
          </View>
          {o.oneriler.length > 0 ? (
            <View className="gap-1" testID="sistem-onerileri">
              <Metin varyant="etiket">{t('mobil.kocluk.sistemOnerileri')}</Metin>
              {o.oneriler.map((x) => (
                <Metin key={`${x.tur}-${x.konuId}`}>{oneriMetni(x)}</Metin>
              ))}
            </View>
          ) : null}
        </>
      )}
      <Dugme
        varyant="ikincil"
        etiket={t('mobil.kocluk.konuAnaliziAc')}
        testID="kocluk-konu-analizi-ac"
        onPress={() => {
          router.push({ pathname: '/konu-analizi', params: { ogrenciId, ad: ogrenciAd } });
        }}
      />
    </Kart>
  );
}

/** Bu haftanin plani ve odev durumu ozeti. */
export function PlanOdevKarti({ k }: { k: Kocluk }) {
  const { plan, odev } = k;
  return (
    <Kart className="gap-3" testID="plan-odev-ozeti">
      <Metin varyant="altBaslik" accessibilityRole="header">
        {t('kocluk.planOdev')}
      </Metin>
      {plan ? (
        <View className="gap-1">
          <Metin>
            {t('mobil.kocluk.planGorev', { tamam: plan.tamamSayisi, toplam: plan.gorevSayisi })}
          </Metin>
          <Metin varyant="ikincil">
            {t('mobil.kocluk.planSoru', {
              gerceklesen: plan.soru.gerceklesen,
              planlanan: plan.soru.planlanan,
            })}
          </Metin>
          <Metin varyant="ikincil">
            {t('mobil.kocluk.planDakika', {
              gerceklesen: plan.dakika.gerceklesen,
              planlanan: plan.dakika.planlanan,
            })}
          </Metin>
        </View>
      ) : (
        <Metin varyant="ikincil">{t('mobil.kocluk.planYok')}</Metin>
      )}
      <View className="gap-1 border-t border-kenar pt-2">
        <Metin>{t('mobil.kocluk.odevAcik', { n: odev.acik, geciken: odev.geciken })}</Metin>
        <Metin varyant="ikincil">
          {t('mobil.kocluk.odevTeslim', { n: odev.teslimEdildi, inceleme: odev.incelemeBekleyen })}
        </Metin>
      </View>
    </Kart>
  );
}
