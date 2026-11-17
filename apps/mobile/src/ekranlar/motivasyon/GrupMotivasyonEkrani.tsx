import { t } from '@kopru/i18n';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert, View } from 'react-native';

import { apiHatasiMi } from '../../api/tipler';
import { bugunTarihi, tarihEkle, tarihGecerliMi } from '../../lib/saat';
import { tarihGoster } from '../../lib/zaman';
import { gunFarki } from '../../motivasyon/ruhHali';
import { Cip } from '../../ui/Cip';
import { Dugme } from '../../ui/Dugme';
import { BosDurum, HataDurumu, Yukleniyor } from '../../ui/Durumlar';
import { Ekran } from '../../ui/Ekran';
import { Kart } from '../../ui/Kart';
import { Metin } from '../../ui/Metin';
import { MetinGirdisi } from '../../ui/MetinGirdisi';
import { useAktif, useServisler } from '../../uygulama/baglam';
import { hataMesaji } from '../../uygulama/hatalar';
import { useOyunlastirmaAcik } from '../../uygulama/motivasyon';
import { useSaatDilimi } from '../../uygulama/operasyon';

/** Duraklatma tarih araligi dogrulamasi: <= 31 gun (baslangic ve bitis dahil), gecmis gun yok. */
export function duraklatmaHatasi(baslangic: string, bitis: string, bugun: string): string | null {
  if (!tarihGecerliMi(baslangic) || !tarihGecerliMi(bitis))
    return t('mobil.motivasyon.duraklat.tarihHata');
  if (baslangic < bugun) return t('mobil.motivasyon.duraklat.gecmisHata');
  if (bitis < baslangic) return t('mobil.motivasyon.duraklat.siraHata');
  if (gunFarki(baslangic, bitis) > 30) return t('mobil.motivasyon.duraklat.uzunHata');
  return null;
}

function duraklatmaMesaji(e: unknown): string {
  if (apiHatasiMi(e) && e.kod === 'cakisma') return t('mobil.motivasyon.duraklat.cakisma');
  return hataMesaji(e);
}

function YildizBolumu({ grupId }: { grupId: string }) {
  const { adaptorler } = useServisler();
  const qc = useQueryClient();
  const uyelikId = useAktif()?.uyelik.uyelikId;
  const ogrenciler = useQuery({
    queryKey: ['motivasyon', uyelikId, 'grup-ogrencileri', grupId],
    queryFn: () => adaptorler.motivasyon.grupOgrencileri(grupId),
    enabled: !!uyelikId,
  });
  const verdiklerim = useQuery({
    queryKey: ['motivasyon', uyelikId, 'yildiz-verdiklerim'],
    queryFn: () => adaptorler.motivasyon.yildizVerdiklerim(),
    enabled: !!uyelikId,
  });
  const [secili, setSecili] = useState<string | null>(null);
  const [gerekce, setGerekce] = useState('');
  const [mesaj, setMesaj] = useState<string | null>(null);
  const ver = useMutation({
    networkMode: 'always',
    mutationFn: () => {
      if (!secili) throw new Error('ogrenci secilmedi');
      return adaptorler.motivasyon.yildizVer({
        ogrenciId: secili,
        grupId,
        ...(gerekce.trim() ? { gerekce: gerekce.trim() } : {}),
      });
    },
    onSuccess: (s) => {
      const ad = ogrenciler.data?.find((o) => o.ogrenciId === s.yildiz.ogrenci_id)?.ad ?? '';
      setMesaj(t('mobil.motivasyon.yildiz.verildi', { ad, xp: s.xp }));
      setSecili(null);
      setGerekce('');
      void qc.invalidateQueries({ queryKey: ['motivasyon', uyelikId, 'yildiz-verdiklerim'] });
    },
  });
  const v = verdiklerim.data;
  const hakYok = v?.kalan === 0;
  const adBul = (id: string) => ogrenciler.data?.find((o) => o.ogrenciId === id)?.ad ?? '';
  const bu = (v?.yildizlar ?? []).filter((y) => y.grup_id === grupId);

  return (
    <Kart className="gap-3" testID="yildiz-bolumu">
      <Metin varyant="altBaslik" accessibilityRole="header">
        {t('mobil.motivasyon.yildiz.ogretmenBaslik')}
      </Metin>
      <Metin varyant="ikincil">{t('mobil.motivasyon.yildiz.aciklama')}</Metin>
      {v ? (
        <Metin varyant="etiket" accessibilityLiveRegion="polite" testID="yildiz-hak">
          {v.kalan === null
            ? t('mobil.motivasyon.yildiz.hakSinirsiz', { verilen: v.verilen })
            : t('mobil.motivasyon.yildiz.hak', { kalan: v.kalan, limit: v.limit ?? 0 })}
        </Metin>
      ) : null}
      {ogrenciler.isPending ? <Yukleniyor /> : null}
      {ogrenciler.isError ? (
        <HataDurumu mesaj={hataMesaji(ogrenciler.error)} tekrar={() => void ogrenciler.refetch()} />
      ) : null}
      {ogrenciler.data?.length === 0 ? (
        <BosDurum ikon="sparkles" mesaj={t('mobil.motivasyon.yildiz.ogrenciYok')} />
      ) : null}
      {ogrenciler.data && ogrenciler.data.length > 0 ? (
        <View className="gap-2">
          <Metin varyant="etiket">{t('mobil.motivasyon.yildiz.ogrenciSec')}</Metin>
          <View className="flex-row flex-wrap gap-2" accessibilityRole="radiogroup">
            {ogrenciler.data.map((o) => (
              <Cip
                key={o.ogrenciId}
                etiket={o.ad || t('mobil.ogrenciler.adsiz')}
                secili={secili === o.ogrenciId}
                onPress={() => {
                  setSecili(o.ogrenciId);
                  setMesaj(null);
                  ver.reset();
                }}
                testID={`yildiz-ogrenci-${o.ogrenciId}`}
              />
            ))}
          </View>
        </View>
      ) : null}
      <MetinGirdisi
        etiket={t('mobil.motivasyon.yildiz.gerekce')}
        value={gerekce}
        onChangeText={setGerekce}
        maxLength={200}
        multiline
        testID="yildiz-gerekce"
      />
      {hakYok ? (
        <Metin varyant="ikincil" className="text-hata" accessibilityLiveRegion="polite">
          {t('mobil.motivasyon.hata.haftalik_limit_asildi')}
        </Metin>
      ) : null}
      {ver.isError ? (
        <Metin
          varyant="ikincil"
          className="text-hata"
          accessibilityLiveRegion="polite"
          testID="yildiz-hata"
        >
          {hataMesaji(ver.error)}
        </Metin>
      ) : null}
      {mesaj ? (
        <Metin varyant="etiket" accessibilityLiveRegion="polite" testID="yildiz-verildi">
          {mesaj}
        </Metin>
      ) : null}
      <Dugme
        etiket={t('mobil.motivasyon.yildiz.ver')}
        disabled={!secili || hakYok}
        yukleniyor={ver.isPending}
        onPress={() => {
          ver.mutate();
        }}
        testID="yildiz-ver"
      />
      {bu.length > 0 ? (
        <View className="gap-1" testID="yildiz-verilenler">
          <Metin varyant="etiket">{t('mobil.motivasyon.yildiz.buHafta')}</Metin>
          {bu.map((y) => (
            <Metin key={y.id} varyant="ikincil">
              {adBul(y.ogrenci_id) || t('mobil.ogrenciler.adsiz')}
              {y.gerekce ? `: ${y.gerekce}` : ''}
            </Metin>
          ))}
        </View>
      ) : null}
    </Kart>
  );
}

function DuraklatmaBolumu({ grupId }: { grupId: string }) {
  const { adaptorler } = useServisler();
  const qc = useQueryClient();
  const uyelikId = useAktif()?.uyelik.uyelikId;
  const { tz } = useSaatDilimi();
  const bugun = bugunTarihi(tz);
  const anahtar = ['motivasyon', uyelikId, 'duraklatmalar', grupId];
  const liste = useQuery({
    queryKey: anahtar,
    queryFn: () => adaptorler.motivasyon.duraklatmalar(grupId),
    enabled: !!uyelikId,
  });
  const [baslangic, setBaslangic] = useState(bugun);
  const [bitis, setBitis] = useState(tarihEkle(bugun, 6));
  const [neden, setNeden] = useState('');
  const [hata, setHata] = useState<string | null>(null);
  const olustur = useMutation({
    networkMode: 'always',
    mutationFn: () =>
      adaptorler.motivasyon.duraklatmaOlustur(grupId, {
        baslangic_gun: baslangic,
        bitis_gun: bitis,
        ...(neden.trim() ? { neden: neden.trim() } : {}),
      }),
    onSuccess: () => {
      setNeden('');
      void qc.invalidateQueries({ queryKey: anahtar });
    },
    onError: (e) => {
      setHata(duraklatmaMesaji(e));
    },
  });
  const iptal = useMutation({
    networkMode: 'always',
    mutationFn: (id: string) => adaptorler.motivasyon.duraklatmaIptal(grupId, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: anahtar }),
    onError: (e) => {
      setHata(duraklatmaMesaji(e));
    },
  });

  function gonder() {
    const h = duraklatmaHatasi(baslangic, bitis, bugun);
    setHata(h);
    if (!h) olustur.mutate();
  }

  function iptalOnay(id: string) {
    Alert.alert(
      t('mobil.motivasyon.duraklat.iptalOnay'),
      t('mobil.motivasyon.duraklat.iptalMesaj'),
      [
        { text: t('ortak.iptal'), style: 'cancel' },
        {
          text: t('mobil.motivasyon.duraklat.iptalEt'),
          style: 'destructive',
          onPress: () => {
            iptal.mutate(id);
          },
        },
      ],
    );
  }

  return (
    <Kart className="gap-3" testID="duraklatma-bolumu">
      <Metin varyant="altBaslik" accessibilityRole="header">
        {t('mobil.motivasyon.duraklat.baslik')}
      </Metin>
      <Metin varyant="ikincil">{t('mobil.motivasyon.duraklat.aciklama')}</Metin>
      <MetinGirdisi
        etiket={t('mobil.motivasyon.duraklat.baslangic')}
        value={baslangic}
        onChangeText={(v) => {
          setBaslangic(v);
          setHata(null);
        }}
        keyboardType="numbers-and-punctuation"
        maxLength={10}
        autoCorrect={false}
        testID="duraklat-baslangic"
      />
      <MetinGirdisi
        etiket={t('mobil.motivasyon.duraklat.bitis')}
        value={bitis}
        onChangeText={(v) => {
          setBitis(v);
          setHata(null);
        }}
        keyboardType="numbers-and-punctuation"
        maxLength={10}
        autoCorrect={false}
        testID="duraklat-bitis"
      />
      <MetinGirdisi
        etiket={t('mobil.motivasyon.duraklat.neden')}
        value={neden}
        onChangeText={setNeden}
        maxLength={200}
        testID="duraklat-neden"
      />
      {hata ? (
        <Metin
          varyant="ikincil"
          className="text-hata"
          accessibilityLiveRegion="polite"
          testID="duraklat-hata"
        >
          {hata}
        </Metin>
      ) : null}
      <Dugme
        etiket={t('mobil.motivasyon.duraklat.baslat')}
        yukleniyor={olustur.isPending}
        onPress={gonder}
        testID="duraklat-baslat"
      />
      <Metin varyant="etiket">{t('mobil.motivasyon.duraklat.liste')}</Metin>
      {liste.isPending ? <Yukleniyor /> : null}
      {liste.isError ? (
        <HataDurumu mesaj={hataMesaji(liste.error)} tekrar={() => void liste.refetch()} />
      ) : null}
      {liste.data?.length === 0 ? (
        <Metin varyant="ikincil">{t('mobil.motivasyon.duraklat.bos')}</Metin>
      ) : null}
      {(liste.data ?? []).map((d) => {
        const iptalEdildi = d.iptal_at !== null;
        const aralik = `${tarihGoster(d.baslangic_gun)} – ${tarihGoster(d.bitis_gun)}`;
        return (
          <View
            key={d.id}
            className="min-h-dokunma flex-row items-center gap-3 border-t border-kenar pt-3"
            testID={`duraklatma-${d.id}`}
          >
            <View
              className="flex-1 gap-0.5"
              accessible
              accessibilityLabel={`${aralik}. ${iptalEdildi ? t('mobil.motivasyon.duraklat.iptalEdildi') : t('mobil.motivasyon.duraklat.etkin')}${d.neden ? `. ${d.neden}` : ''}`}
            >
              <Metin varyant="etiket">{aralik}</Metin>
              <Metin varyant="kucuk">
                {iptalEdildi
                  ? t('mobil.motivasyon.duraklat.iptalEdildi')
                  : t('mobil.motivasyon.duraklat.etkin')}
                {d.neden ? ` · ${d.neden}` : ''}
              </Metin>
            </View>
            {!iptalEdildi ? (
              <Dugme
                varyant="ikincil"
                etiket={t('mobil.motivasyon.duraklat.iptalEt')}
                accessibilityLabel={t('mobil.motivasyon.duraklat.iptalEtiketi', { aralik })}
                onPress={() => {
                  iptalOnay(d.id);
                }}
                testID={`duraklatma-iptal-${d.id}`}
              />
            ) : null}
          </View>
        );
      })}
    </Kart>
  );
}

/** Ogretmen/yonetici: grubun haftanin yildizi ve seri duraklatma islemleri. */
export function GrupMotivasyonEkrani({ grupId, grupAd }: { grupId: string; grupAd: string }) {
  const acik = useOyunlastirmaAcik();
  return (
    <Ekran klavye>
      <Metin varyant="baslik" accessibilityRole="header">
        {grupAd || t('mobil.motivasyon.grup.baslik')}
      </Metin>
      {!acik ? (
        <BosDurum ikon="sparkles" mesaj={t('mobil.motivasyon.grup.kapali')} />
      ) : (
        <>
          <YildizBolumu grupId={grupId} />
          <DuraklatmaBolumu grupId={grupId} />
        </>
      )}
    </Ekran>
  );
}
