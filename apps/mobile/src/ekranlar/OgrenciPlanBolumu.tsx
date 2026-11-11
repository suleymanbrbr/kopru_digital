import { t } from '@kopru/i18n';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import type { PlanGorevi, PlanHedefTuru } from '../api/ogrenmeTipleri';
import { bugunTarihi } from '../lib/saat';
import {
  gunBasligi,
  gunGorevleri,
  haftaBaslangici,
  haftaEtiketi,
  haftaGunleri,
  haftaKaydir,
  haftaOzeti,
} from '../ogrenme/hafta';
import { bransAdi } from '../ogrenme/konu';
import { Dugme } from '../ui/Dugme';
import { BosDurum, HataDurumu, Yukleniyor } from '../ui/Durumlar';
import { Ikon } from '../ui/Ikon';
import { Kart } from '../ui/Kart';
import { Metin } from '../ui/Metin';
import { MetinGirdisi } from '../ui/MetinGirdisi';
import { Secici } from '../ui/Secici';
import { useServisler } from '../uygulama/baglam';
import { hataMesaji } from '../uygulama/hatalar';
import { useKonuHaritasi, useOgrenciPlani } from '../uygulama/ogrenme';
import { useSaatDilimi } from '../uygulama/operasyon';
import { KONU_SECIMI_BOS, KonuSecici, type KonuSecimi } from './KonuSecici';
import { gorevAdi, hedefMetni, ilerlemeMetni } from './OgrenciPlani';

const TURLER: readonly PlanHedefTuru[] = ['soru', 'dakika'];

interface FormProps {
  planId: string;
  hafta: string;
  /** Duzenleme: mevcut gorev; yoksa yeni gorev. */
  gorev?: PlanGorevi;
  varsayilanGun: string;
  onBitti: () => void;
  onHata: (m: string) => void;
}

/** Gorev ekle / duzenle formu (ogretmen). Duzenlemede ders ve konu sabittir; "Sil" yalniz silinebilir gorevde. */
function GorevFormu({ planId, hafta, gorev, varsayilanGun, onBitti, onHata }: FormProps) {
  const qc = useQueryClient();
  const { adaptorler } = useServisler();
  const [gun, setGun] = useState(gorev?.gun ?? varsayilanGun);
  const [konu, setKonu] = useState<KonuSecimi>(
    gorev ? { bransKodu: gorev.bransKodu, konuId: gorev.konuId } : KONU_SECIMI_BOS,
  );
  const [tur, setTur] = useState<PlanHedefTuru>(gorev?.hedefTuru ?? 'soru');
  const [miktar, setMiktar] = useState(String(gorev?.hedefMiktar ?? 20));
  const [denendi, setDenendi] = useState(false);

  const gecerliMiktar =
    /^\d{1,6}$/.test(miktar.trim()) && Number(miktar) >= 1 && Number(miktar) <= 100_000;
  const gecerli = gecerliMiktar && !!konu.bransKodu;

  const tazele = () => qc.invalidateQueries({ queryKey: ['plan'] });
  const kaydet = useMutation({
    networkMode: 'always',
    mutationFn: () =>
      gorev
        ? adaptorler.ogrenme.gorevGuncelle(gorev.id, {
            gun,
            hedefTuru: tur,
            hedefMiktar: Number(miktar),
            surum: gorev.surum,
          })
        : adaptorler.ogrenme.gorevEkle(planId, {
            gun,
            bransKodu: konu.bransKodu ?? '',
            ...(konu.konuId ? { konuId: konu.konuId } : {}),
            hedefTuru: tur,
            hedefMiktar: Number(miktar),
          }),
    onSuccess: () => {
      void tazele();
      onBitti();
    },
    onError: (e) => {
      onHata(hataMesaji(e));
    },
  });
  const sil = useMutation({
    networkMode: 'always',
    mutationFn: () => adaptorler.ogrenme.gorevSil(gorev?.id ?? ''),
    onSuccess: () => {
      void tazele();
      onBitti();
    },
    onError: (e) => {
      onHata(hataMesaji(e));
    },
  });

  return (
    <Kart className="gap-3" testID={gorev ? 'gorev-duzenle' : 'gorev-ekle-formu'}>
      <Secici
        baslik={t('mobil.ogrenme.plan.gun')}
        deger={gun}
        onDegis={setGun}
        secenekler={haftaGunleri(hafta).map((g) => ({
          deger: g,
          etiket: gunBasligi(g).split(',')[0] ?? g,
          erisilebilirlikEtiketi: gunBasligi(g),
        }))}
      />
      {gorev ? (
        <Metin varyant="ikincil">{bransAdi(gorev.bransKodu)}</Metin>
      ) : (
        <KonuSecici deger={konu} onDegis={setKonu} etiket={t('mobil.ogrenme.plan.dersKonu')} />
      )}
      <Secici
        baslik={t('mobil.ogrenme.plan.hedefTuru')}
        deger={tur}
        onDegis={setTur}
        secenekler={TURLER.map((x) => ({ deger: x, etiket: t(`mobil.ogrenme.plan.tur.${x}`) }))}
      />
      <MetinGirdisi
        etiket={t('mobil.ogrenme.plan.hedefMiktar')}
        value={miktar}
        onChangeText={setMiktar}
        keyboardType="number-pad"
        maxLength={6}
        hata={denendi && !gecerliMiktar ? t('mobil.ogrenme.plan.miktarHata') : null}
      />
      {denendi && !konu.bransKodu ? (
        <Metin varyant="ikincil" className="text-hata">
          {t('mobil.ogrenme.odev.dersHata')}
        </Metin>
      ) : null}
      <View className="flex-row gap-2">
        <Dugme
          className="flex-1"
          etiket={t('mobil.ogrenme.plan.gorevKaydet')}
          yukleniyor={kaydet.isPending}
          onPress={() => {
            setDenendi(true);
            if (gecerli) kaydet.mutate();
          }}
        />
        {gorev ? (
          <Dugme
            className="flex-1"
            varyant="tehlike"
            etiket={t('mobil.ogrenme.plan.gorevSil')}
            yukleniyor={sil.isPending}
            onPress={() => {
              sil.mutate();
            }}
          />
        ) : null}
        <Dugme className="flex-1" varyant="ikincil" etiket={t('ortak.iptal')} onPress={onBitti} />
      </View>
    </Kart>
  );
}

/**
 * Ogrenci kartinin "Plan" bolumu (ogretmen): haftayi goruntule, gorev ekle/duzenle, yayinla. Genis
 * duzenleme (kopyalama, sablon, toplu plan) web'dedir. Kilitli (hafta sonu + 14 gun) planlar salt
 * okunurdur.
 */
export function OgrenciPlanBolumu({ ogrenciId }: { ogrenciId: string }) {
  const qc = useQueryClient();
  const { adaptorler } = useServisler();
  const { tz } = useSaatDilimi();
  const bugun = bugunTarihi(tz);
  const [gun, setGun] = useState<string | null>(null);
  const hafta = haftaBaslangici(gun ?? bugun);
  const sorgu = useOgrenciPlani(ogrenciId, hafta);
  const konular = useKonuHaritasi();
  const [form, setForm] = useState<string | null>(null);
  const [hata, setHata] = useState<string | null>(null);

  const tazele = () => qc.invalidateQueries({ queryKey: ['plan'] });
  const olustur = useMutation({
    networkMode: 'always',
    mutationFn: () => adaptorler.ogrenme.planOlustur(ogrenciId, hafta),
    onSuccess: () => {
      setHata(null);
      void tazele();
    },
    onError: (e) => {
      setHata(hataMesaji(e));
    },
  });
  const yayinla = useMutation({
    networkMode: 'always',
    mutationFn: (planId: string) => adaptorler.ogrenme.planYayinla(planId),
    onSuccess: () => {
      setHata(null);
      void tazele();
    },
    onError: (e) => {
      setHata(hataMesaji(e));
    },
  });

  const d = sorgu.data;
  const gorevler = d?.gorevler ?? [];
  const ozet = haftaOzeti(gorevler);
  const yazilabilir = !!d && !d.kilitli;

  return (
    <Kart className="gap-3" testID="ogrenci-plan-bolumu">
      <Metin varyant="altBaslik" accessibilityRole="header">
        {t('mobil.ogrenme.plan.baslik')}
      </Metin>
      <View className="flex-row items-center justify-between gap-2">
        <Dugme
          varyant="ikincil"
          etiket={t('mobil.ogrenme.plan.oncekiHafta')}
          onPress={() => {
            setGun(haftaKaydir(hafta, -1));
            setForm(null);
          }}
        />
        <Metin varyant="etiket" accessibilityLiveRegion="polite">
          {haftaEtiketi(hafta)}
        </Metin>
        <Dugme
          varyant="ikincil"
          etiket={t('mobil.ogrenme.plan.sonrakiHafta')}
          onPress={() => {
            setGun(haftaKaydir(hafta, 1));
            setForm(null);
          }}
        />
      </View>
      {sorgu.isPending ? <Yukleniyor /> : null}
      {sorgu.isError && !d ? (
        <HataDurumu mesaj={hataMesaji(sorgu.error)} tekrar={() => void sorgu.refetch()} />
      ) : null}
      {hata ? (
        <Metin varyant="ikincil" className="text-hata" accessibilityLiveRegion="polite">
          {hata}
        </Metin>
      ) : null}
      {d?.kilitli ? (
        <Metin varyant="ikincil" testID="plan-kilitli">
          {t('mobil.ogrenme.plan.ogretmenKilitli')}
        </Metin>
      ) : null}

      {d?.plan === null ? (
        <>
          <BosDurum ikon="calendar-outline" mesaj={t('mobil.ogrenme.plan.ogretmenPlanYok')} />
          {yazilabilir ? (
            <Dugme
              etiket={t('mobil.ogrenme.plan.planOlustur')}
              yukleniyor={olustur.isPending}
              onPress={() => {
                olustur.mutate();
              }}
            />
          ) : null}
        </>
      ) : null}

      {d?.plan ? (
        <>
          <View
            className="flex-row items-center gap-2"
            accessible
            accessibilityLabel={
              d.plan.durum === 'yayinda'
                ? t('mobil.ogrenme.plan.yayinda')
                : t('mobil.ogrenme.plan.taslakAciklama')
            }
          >
            <Ikon
              ad={d.plan.durum === 'yayinda' ? 'checkmark-circle' : 'create-outline'}
              boyut={18}
            />
            <Metin varyant="ikincil" testID="plan-durumu">
              {d.plan.durum === 'yayinda'
                ? t('mobil.ogrenme.plan.yayinda')
                : t('mobil.ogrenme.plan.taslakAciklama')}
            </Metin>
          </View>
          {d.plan.durum === 'taslak' && yazilabilir ? (
            <Dugme
              etiket={t('mobil.ogrenme.plan.yayinla')}
              yukleniyor={yayinla.isPending}
              onPress={() => {
                yayinla.mutate(d.plan?.id ?? '');
              }}
            />
          ) : null}
          {haftaGunleri(hafta).map((g) => {
            const liste = gunGorevleri(gorevler, g);
            return (
              <View
                key={g}
                className="gap-1 border-t border-kenar pt-2"
                testID={`ogretmen-gun-${g}`}
              >
                <Metin varyant="etiket" accessibilityRole="header">
                  {gunBasligi(g)}
                </Metin>
                {liste.length === 0 ? (
                  <Metin varyant="kucuk">{t('mobil.ogrenme.plan.gunBosKisa')}</Metin>
                ) : null}
                {liste.map((gv) =>
                  form === gv.id && d.plan ? (
                    <GorevFormu
                      key={gv.id}
                      planId={d.plan.id}
                      hafta={hafta}
                      gorev={gv}
                      varsayilanGun={g}
                      onBitti={() => {
                        setForm(null);
                      }}
                      onHata={setHata}
                    />
                  ) : (
                    <Pressable
                      key={gv.id}
                      accessibilityRole="button"
                      accessibilityLabel={`${gorevAdi(gv, konular)}, ${hedefMetni(gv)}, ${ilerlemeMetni(gv)}, ${t(`mobil.ogrenme.plan.durum.${gv.durum}`)}`}
                      accessibilityHint={
                        yazilabilir ? t('mobil.ogrenme.plan.duzenleIpucu') : undefined
                      }
                      disabled={!yazilabilir || gv.durum === 'devredildi'}
                      testID={`ogretmen-gorev-${gv.id}`}
                      onPress={() => {
                        setHata(null);
                        setForm(gv.id);
                      }}
                      className="min-h-dokunma justify-center active:opacity-80"
                    >
                      <Metin>{gorevAdi(gv, konular)}</Metin>
                      <Metin varyant="kucuk">
                        {hedefMetni(gv)} · {ilerlemeMetni(gv)} ·{' '}
                        {t(`mobil.ogrenme.plan.durum.${gv.durum}`)}
                      </Metin>
                    </Pressable>
                  ),
                )}
              </View>
            );
          })}
          <View className="gap-1 border-t border-kenar pt-2" testID="hafta-ozeti">
            <Metin varyant="etiket">{t('mobil.ogrenme.plan.haftaOzeti')}</Metin>
            <Metin varyant="ikincil">
              {t('mobil.ogrenme.plan.ozetSoru', {
                yapilan: ozet.soru.gerceklesen,
                hedef: ozet.soru.planlanan,
              })}
              {' · '}
              {t('mobil.ogrenme.plan.ozetDakika', {
                yapilan: ozet.dakika.gerceklesen,
                hedef: ozet.dakika.planlanan,
              })}
            </Metin>
          </View>
          {form === 'yeni' ? (
            <GorevFormu
              planId={d.plan.id}
              hafta={hafta}
              varsayilanGun={haftaGunleri(hafta).includes(bugun) ? bugun : hafta}
              onBitti={() => {
                setForm(null);
              }}
              onHata={setHata}
            />
          ) : yazilabilir ? (
            <Dugme
              varyant="ikincil"
              etiket={t('mobil.ogrenme.plan.gorevEkle')}
              onPress={() => {
                setHata(null);
                setForm('yeni');
              }}
            />
          ) : null}
        </>
      ) : null}
    </Kart>
  );
}
