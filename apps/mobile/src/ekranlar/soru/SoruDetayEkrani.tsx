import { t, type MessageKey } from '@kopru/i18n';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { SORU_BILDIRIM_NEDENLERI, type SoruBildirimNedeni } from '../../api/soruTipleri';
import { bransAdi } from '../../ogrenme/konu';
import { GonderimKartlari } from '../../soru/GonderimKartlari';
import { MesajKarti, Kucukresim } from '../../soru/Mesaj';
import { DurumRozeti } from '../../soru/parcalar';
import { Dugme } from '../../ui/Dugme';
import { HataDurumu, Yukleniyor } from '../../ui/Durumlar';
import { Ekran } from '../../ui/Ekran';
import { Kart } from '../../ui/Kart';
import { Metin } from '../../ui/Metin';
import { MetinGirdisi } from '../../ui/MetinGirdisi';
import { Secici } from '../../ui/Secici';
import { useAktif, useServisler } from '../../uygulama/baglam';
import { hataMesaji } from '../../uygulama/hatalar';
import { useSaatDilimi } from '../../uygulama/operasyon';
import { useAnladim, useBildir, useGonderimler, useSoru } from '../../uygulama/soru';

function BildirFormu({ id, kapat }: { id: string; kapat: () => void }) {
  const bildir = useBildir(id);
  const [neden, setNeden] = useState<SoruBildirimNedeni>('uygunsuz');
  const [aciklama, setAciklama] = useState('');
  if (bildir.isSuccess) {
    return (
      <Kart testID="bildirildi">
        <Metin accessibilityLiveRegion="polite">{t('mobil.soru.detay.bildirildi')}</Metin>
      </Kart>
    );
  }
  return (
    <Kart className="gap-3" testID="bildir-formu">
      <Secici
        baslik={t('mobil.soru.detay.bildirNeden')}
        dikey
        deger={neden}
        onDegis={setNeden}
        secenekler={SORU_BILDIRIM_NEDENLERI.map((n) => ({
          deger: n,
          etiket: t(`mobil.soru.detay.bildirNedenleri.${n}` as MessageKey),
        }))}
      />
      <MetinGirdisi
        etiket={t('mobil.soru.detay.bildirAciklama')}
        value={aciklama}
        onChangeText={setAciklama}
        maxLength={500}
        multiline
      />
      {bildir.isError ? (
        <Metin varyant="ikincil" className="text-hata" accessibilityRole="alert">
          {hataMesaji(bildir.error)}
        </Metin>
      ) : null}
      <View className="flex-row gap-2">
        <Dugme
          className="flex-1"
          etiket={t('mobil.soru.detay.bildirGonder')}
          yukleniyor={bildir.isPending}
          onPress={() => {
            bildir.mutate({ neden, ...(aciklama.trim() ? { aciklama: aciklama.trim() } : {}) });
          }}
          testID="bildir-gonder"
        />
        <Dugme className="flex-1" varyant="ikincil" etiket={t('ortak.iptal')} onPress={kapat} />
      </View>
    </Kart>
  );
}

function TakipFormu({ id, hak }: { id: string; hak: number }) {
  const { gonderim } = useServisler();
  const [metin, setMetin] = useState('');
  const [mesgul, setMesgul] = useState(false);
  const bos = metin.trim().length === 0;
  async function yolla() {
    if (bos) return;
    setMesgul(true);
    await gonderim.baslat({
      tur: 'takip',
      hedefId: id,
      baslik: t('mobil.soru.detay.takipSorusu'),
      govde: { tur: 'takip', soruId: id, metin: metin.trim(), ekler: [] },
      dosyalar: {},
    });
    setMetin('');
    setMesgul(false);
  }
  return (
    <Kart className="gap-3" testID="takip-formu">
      <MetinGirdisi
        etiket={t('mobil.soru.detay.takipYaz')}
        placeholder={t('mobil.soru.detay.takipIpucu')}
        value={metin}
        onChangeText={setMetin}
        multiline
        maxLength={1000}
        style={{ minHeight: 64, textAlignVertical: 'top' }}
      />
      <Metin varyant="kucuk">{t('mobil.soru.detay.takipHak', { n: hak })}</Metin>
      <Dugme
        etiket={t('mobil.soru.detay.takipGonder')}
        disabled={bos}
        yukleniyor={mesgul}
        onPress={() => void yolla()}
        testID="takip-gonder"
      />
    </Kart>
  );
}

/** Soru ayrintisi: ileti dizisi, ekler ve role gore eylemler (ogrenci: anladim/takip/bildir; personel: cevapla). */
export function SoruDetayEkrani({ id }: { id: string }) {
  const router = useRouter();
  const aktif = useAktif();
  const { tz } = useSaatDilimi();
  const sorgu = useSoru(id);
  const anladim = useAnladim(id);
  const gonderimler = useGonderimler();
  const [takipAcik, setTakipAcik] = useState(false);
  const [bildirAcik, setBildirAcik] = useState(false);
  const ogrenci = aktif?.uyelik.rol === 'ogrenci';
  const s = sorgu.data;
  const bekleyenTakip = gonderimler.some(
    (g) =>
      g.tur === 'takip' &&
      g.hedefId === id &&
      (g.durum === 'yukleniyor' || g.durum === 'gonderiliyor'),
  );
  const fotoYok =
    !!s && !s.adresAlinamadi && s.fotograflar.length > 0 && s.fotograflar.every((f) => !f.adres);

  return (
    <Ekran kenarlar={['left', 'right', 'bottom']} klavye>
      {sorgu.isPending ? <Yukleniyor /> : null}
      {sorgu.isError && !s ? (
        <HataDurumu mesaj={hataMesaji(sorgu.error)} tekrar={() => void sorgu.refetch()} />
      ) : null}
      {s ? (
        <>
          <View className="gap-2">
            <Metin varyant="baslik" accessibilityRole="header">
              {bransAdi(s.bransKodu)}
            </Metin>
            {!ogrenci && s.ogrenciAdi ? (
              <Metin varyant="etiket">
                {t('mobil.soru.detay.ogrenciEtiketi', { ad: s.ogrenciAdi })}
              </Metin>
            ) : null}
            <DurumRozeti durum={s.durum} />
          </View>

          {s.adresAlinamadi ? (
            <Metin varyant="ikincil" accessibilityRole="alert">
              {t('mobil.soru.detay.adresYok')}
            </Metin>
          ) : null}
          {fotoYok ? <Metin varyant="ikincil">{t('mobil.soru.detay.fotoSilindi')}</Metin> : null}

          {s.mesajlar.length > 0 &&
          s.fotograflar.length > 0 &&
          !s.mesajlar[0]?.ekler.some((e) => e.tur === 'fotograf') ? (
            <View className="gap-2">
              {s.fotograflar.map((f, i) => (
                <Kucukresim
                  key={f.medyaDosyaId}
                  adres={f.adres}
                  etiket={t('mobil.soru.ogrenci.fotografEtiketi', { n: i + 1 })}
                />
              ))}
            </View>
          ) : null}

          {s.mesajlar.map((m) => (
            <MesajKarti
              key={m.id}
              mesaj={m}
              soru={s}
              tz={tz}
              benimMi={ogrenci && m.yazarRolu === 'ogrenci'}
            />
          ))}

          <GonderimKartlari turler={['takip']} />

          {ogrenci ? (
            <View className="gap-3">
              {s.durum === 'cevaplandi' && !takipAcik ? (
                <View className="gap-2">
                  <Dugme
                    buyuk
                    etiket={t('mobil.soru.detay.anladim')}
                    yukleniyor={anladim.isPending}
                    onPress={() => {
                      anladim.mutate();
                    }}
                    testID="anladim"
                  />
                  <Dugme
                    varyant="ikincil"
                    etiket={t('mobil.soru.detay.anlamadim')}
                    disabled={s.kalanTakipHakki <= 0}
                    onPress={() => {
                      setTakipAcik(true);
                    }}
                    testID="anlamadim"
                  />
                  {s.kalanTakipHakki <= 0 ? (
                    <Metin varyant="kucuk">{t('mobil.soru.detay.takipHakYok')}</Metin>
                  ) : null}
                </View>
              ) : null}
              {anladim.isError ? (
                <Metin varyant="ikincil" className="text-hata" accessibilityRole="alert">
                  {hataMesaji(anladim.error)}
                </Metin>
              ) : null}
              {s.durum === 'cozuldu' && !takipAcik ? (
                <View className="gap-1">
                  <Metin varyant="ikincil" accessibilityLiveRegion="polite">
                    {t('mobil.soru.detay.anladimOnay')}
                  </Metin>
                  <Dugme
                    varyant="ikincil"
                    etiket={t('mobil.soru.detay.yenidenAc')}
                    disabled={s.kalanTakipHakki <= 0}
                    onPress={() => {
                      setTakipAcik(true);
                    }}
                    testID="yeniden-ac"
                  />
                  <Metin varyant="kucuk">{t('mobil.soru.detay.yenidenAcIpucu')}</Metin>
                </View>
              ) : null}
              {takipAcik &&
              !bekleyenTakip &&
              (s.durum === 'cevaplandi' || s.durum === 'cozuldu') ? (
                <TakipFormu id={id} hak={s.kalanTakipHakki} />
              ) : null}

              {!bildirAcik ? (
                <Dugme
                  varyant="hayalet"
                  etiket={t('mobil.soru.detay.bildir')}
                  onPress={() => {
                    setBildirAcik(true);
                  }}
                  testID="bildir"
                />
              ) : (
                <BildirFormu
                  id={id}
                  kapat={() => {
                    setBildirAcik(false);
                  }}
                />
              )}
            </View>
          ) : (
            <View className="gap-3">
              {s.durum === 'acik' || s.durum === 'takip_bekliyor' ? (
                <Dugme
                  buyuk
                  etiket={t('mobil.soru.detay.cevapla')}
                  onPress={() => {
                    router.push({ pathname: '/(uygulama)/soru-cevap/[id]', params: { id } });
                  }}
                  testID="cevapla"
                />
              ) : (
                <Metin varyant="ikincil">{t('mobil.soru.detay.arsivde')}</Metin>
              )}
            </View>
          )}
        </>
      ) : null}
    </Ekran>
  );
}
