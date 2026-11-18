'use client';

import type { Duyuru } from '@kopru/contracts';
import { t } from '@kopru/i18n';
import { ArrowLeft, Megaphone, Pin } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { DuyuruFormu } from './duyuru-formu';
import { GovdeMetni } from './govde-metni';
import { OkuyanlarBolumu } from './okuyanlar';
import { OnayKutusuSatiri } from './onay-kutusu-satiri';

import { HataDurumu } from '@/components/hata-durumu';
import { BildirimKutusu, ListeIskeleti, basari, type Bildirim } from '@/components/hesap/ortak';
import { BolumKapisi } from '@/components/kabuk/bolum-yer-tutucu';
import { Dugme, dugmeStili } from '@/components/ui/button';
import { Girdi } from '@/components/ui/input';
import { Kart } from '@/components/ui/kart';
import { OnayPenceresi } from '@/components/ui/pencere';
import { Rozet } from '@/components/ui/rozet';
import { useKurum } from '@/kurum/baglam';
import { goreliZaman } from '@/lib/bildirim/zaman';
import { duyuruHedefEtiketi, yayinOnayMetni } from '@/lib/duyuru/etiket';
import { bitisHatali, yerelZamanDegeri, yerelZamandanIso } from '@/lib/duyuru/form';
import {
  duyuruHataMesaji,
  useDuyuruArsivle,
  useDuyuruDetayi,
  useDuyuruGuncelle,
  useDuyuruOkundu,
  useDuyuruSil,
  useDuyuruYayinla,
} from '@/lib/duyuru/veri';
import { useGruplar, useSaatDilimi } from '@/lib/operasyon-verisi';

const zamanBicimi = (iso: string, saatDilimi: string) =>
  new Intl.DateTimeFormat('tr-TR', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: saatDilimi,
  }).format(new Date(iso));

export function DuyuruDetayEkrani({ duyuruId }: { duyuruId: string }) {
  return (
    <BolumKapisi bolum="duyurular">
      <DetayIcerigi duyuruId={duyuruId} />
    </BolumKapisi>
  );
}

const DURUM_TONU = { taslak: 'notr', yayinda: 'basari', arsiv: 'uyari' } as const;

function DetayIcerigi({ duyuruId }: { duyuruId: string }) {
  const { uyelik } = useKurum();
  const kurumId = uyelik.kurumId;
  const { saatDilimi } = useSaatDilimi(kurumId);
  const detay = useDuyuruDetayi(kurumId, duyuruId);
  const okundu = useDuyuruOkundu(kurumId);
  const yonetim = detay.data?.yonetim ?? null;
  const gruplar = useGruplar(kurumId, yonetim !== null);
  const isaretlendi = useRef<string | null>(null);

  // Acilista okundu isaretlenir (bir kez). Alici olmayan yonetici icin sunucu 404 verir; sessizce yok sayilir.
  const { mutate: okunduIsaretle } = okundu;
  const okunmamis = detay.data ? detay.data.okundu_at === null : false;
  const yayinda = detay.data ? (yonetim ? yonetim.durum === 'yayinda' : true) : false;
  useEffect(() => {
    if (!okunmamis || !yayinda || isaretlendi.current === duyuruId) return;
    isaretlendi.current = duyuruId;
    okunduIsaretle(duyuruId);
  }, [okunmamis, yayinda, duyuruId, okunduIsaretle]);

  const geri = (
    <Link
      href={`/${kurumId}/duyurular`}
      className={dugmeStili({ gorunum: 'hayalet', className: 'mb-4 -ml-3' })}
    >
      <ArrowLeft aria-hidden />
      {t('duyurular.listeyeDon')}
    </Link>
  );

  if (detay.isPending) {
    return (
      <>
        {geri}
        <Kart>
          <ListeIskeleti satir={3} />
        </Kart>
      </>
    );
  }
  if (detay.isError) {
    return (
      <>
        {geri}
        <Kart>
          <HataDurumu
            baslik={t('duyurular.detayHatasi')}
            aciklama={duyuruHataMesaji(detay.error)}
            tekrarDene={() => void detay.refetch()}
          />
        </Kart>
      </>
    );
  }

  const d = detay.data;
  const zaman = d.yayin_at ?? yonetim?.created_at ?? null;
  return (
    <>
      {geri}
      <article aria-labelledby="duyuru-baslik" data-testid="duyuru-detay">
        <header className="mb-4">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Megaphone className="size-4 text-metin-ikincil" aria-hidden />
            {d.sabit ? (
              <Rozet>
                <Pin className="mr-1 size-3" aria-hidden />
                {t('duyurular.sabit')}
              </Rozet>
            ) : null}
            {yonetim ? (
              <Rozet ton={DURUM_TONU[yonetim.durum]}>
                {t(`bildirim.duyuru.durum.${yonetim.durum}`)}
              </Rozet>
            ) : null}
            {zaman ? (
              <span className="text-sm text-metin-ikincil">
                <time dateTime={zaman}>{goreliZaman(zaman)}</time>
              </span>
            ) : null}
          </div>
          <h1
            id="duyuru-baslik"
            className="text-[1.75rem] font-semibold leading-tight tracking-tight sm:text-3xl"
          >
            {d.baslik}
          </h1>
        </header>
        <Kart className="p-5">
          <GovdeMetni govde={d.govde} className="text-base leading-relaxed" />
        </Kart>
      </article>

      {yonetim ? (
        <YonetimBolumu
          duyuru={yonetim}
          kurumId={kurumId}
          saatDilimi={saatDilimi}
          grupAdlari={gruplar.adlar}
        />
      ) : null}
    </>
  );
}

// --- Yonetim -------------------------------------------------------------------------------------------

function YonetimBolumu({
  duyuru: d,
  kurumId,
  saatDilimi,
  grupAdlari,
}: {
  duyuru: Duyuru;
  kurumId: string;
  saatDilimi: string;
  grupAdlari: ReadonlyMap<string, { etiket: string; uyeSayisi: number }>;
}) {
  const router = useRouter();
  const guncelle = useDuyuruGuncelle(kurumId);
  const yayinla = useDuyuruYayinla(kurumId);
  const arsivle = useDuyuruArsivle(kurumId);
  const sil = useDuyuruSil(kurumId);
  const [bildirim, setBildirim] = useState<Bildirim>(null);
  const [duzenle, setDuzenle] = useState(false);
  const [onay, setOnay] = useState<'yayinla' | 'arsivle' | 'sil' | null>(null);
  /** Duzenleme taslagi; `null`: sunucudaki deger gosterilir. */
  const [bitisTaslagi, setBitisTaslagi] = useState<string | null>(null);
  const bitis = bitisTaslagi ?? yerelZamanDegeri(d.bitis_at);

  const bekliyor = guncelle.isPending || yayinla.isPending || arsivle.isPending || sil.isPending;
  const hedef = duyuruHedefEtiketi(d, grupAdlari);
  const grup = d.hedef_turu === 'grup' ? grupAdlari.get(d.hedef_id) : undefined;

  async function yayinlaVeBildir() {
    setBildirim(null);
    try {
      const s = await yayinla.mutateAsync(d.id);
      setBildirim(
        basari(
          s.alici_sayisi > 0
            ? t('duyurular.onay.sonuc', { n: s.alici_sayisi })
            : t('duyurular.onay.sonucKisisiz'),
        ),
      );
    } catch (hata) {
      setBildirim({ tur: 'hata', metin: duyuruHataMesaji(hata) });
    }
  }

  async function calistir(is: () => Promise<unknown>, mesaj: string) {
    setBildirim(null);
    try {
      await is();
      setBildirim(basari(mesaj));
      return true;
    } catch (hata) {
      setBildirim({ tur: 'hata', metin: duyuruHataMesaji(hata) });
      return false;
    }
  }

  const bitisHatasi = bitisHatali(bitis);

  return (
    <section
      aria-labelledby="duyuru-yonetim"
      className="mt-6 flex flex-col gap-4"
      data-testid="duyuru-yonetim"
    >
      <div>
        <h2 id="duyuru-yonetim" className="text-lg font-semibold">
          {t('duyurular.yonetimBolumu')}
        </h2>
        <p className="text-sm text-metin-ikincil">{t('duyurular.yonetimAciklama')}</p>
      </div>

      <BildirimKutusu bildirim={bildirim} />

      <Kart className="p-5">
        <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-metin-ikincil">{t('duyurular.hedef')}</dt>
            <dd className="font-medium">{hedef}</dd>
          </div>
          <div>
            <dt className="text-metin-ikincil">{t('duyurular.roller')}</dt>
            <dd className="font-medium">
              {d.hedef_roller.map((r) => t(`bildirim.duyuru.rol.${r}`)).join(', ')}
            </dd>
          </div>
          {d.yayin_at ? (
            <div>
              <dt className="text-metin-ikincil">{t('duyurular.yayinEtiketi')}</dt>
              <dd className="font-medium">{zamanBicimi(d.yayin_at, saatDilimi)}</dd>
            </div>
          ) : null}
          {d.bitis_at ? (
            <div>
              <dt className="text-metin-ikincil">{t('duyurular.duzenleBitis')}</dt>
              <dd className="font-medium">{zamanBicimi(d.bitis_at, saatDilimi)}</dd>
            </div>
          ) : null}
          {d.durum !== 'taslak' ? (
            <div>
              <dt className="text-metin-ikincil">{t('duyurular.okuyanlar')}</dt>
              <dd className="font-medium tabular-nums" data-testid="duyuru-okunan-ozet">
                {t('duyurular.okunanSatir', { okunan: d.okunan_sayisi, alici: d.alici_sayisi })}
              </dd>
            </div>
          ) : null}
        </dl>
        {d.durum === 'yayinda' && !d.dagitim_tamam ? (
          <p className="mt-3 text-sm text-metin-ikincil" role="status">
            {t('duyurular.dagitiliyor')}
          </p>
        ) : null}

        {d.durum === 'yayinda' ? (
          <div className="mt-4 flex flex-col gap-3 border-t border-kenar pt-4">
            <OnayKutusuSatiri
              id="duyuru-sabit"
              etiket={t('duyurular.duzenleSabit')}
              secili={d.sabit}
              degisti={(s) => {
                void calistir(
                  () => guncelle.mutateAsync({ id: d.id, govde: { sabit: s } }),
                  t('duyurular.eylem.guncellendi'),
                );
              }}
            />
            <div className="flex flex-wrap items-end gap-2">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="duyuru-bitis" className="text-sm font-medium">
                  {t('duyurular.duzenleBitis')}
                </label>
                <Girdi
                  id="duyuru-bitis"
                  type="datetime-local"
                  value={bitis}
                  aria-invalid={bitisHatasi ? true : undefined}
                  className="sm:w-64"
                  onChange={(e) => {
                    setBitisTaslagi(e.target.value);
                  }}
                />
              </div>
              <Dugme
                gorunum="ikincil"
                disabled={bekliyor || bitisHatasi || bitis === yerelZamanDegeri(d.bitis_at)}
                onClick={() => {
                  void calistir(
                    () =>
                      guncelle.mutateAsync({
                        id: d.id,
                        govde: { bitis_at: yerelZamandanIso(bitis) },
                      }),
                    t('duyurular.eylem.guncellendi'),
                  ).then((tamam) => {
                    if (tamam) setBitisTaslagi(null);
                  });
                }}
              >
                {t('duyurular.eylem.kaydet')}
              </Dugme>
              {d.bitis_at ? (
                <Dugme
                  gorunum="hayalet"
                  disabled={bekliyor}
                  onClick={() => {
                    void calistir(
                      () => guncelle.mutateAsync({ id: d.id, govde: { bitis_at: null } }),
                      t('duyurular.eylem.guncellendi'),
                    ).then((tamam) => {
                      if (tamam) setBitisTaslagi(null);
                    });
                  }}
                >
                  {t('duyurular.bitisTemizle')}
                </Dugme>
              ) : null}
            </div>
            {bitisHatasi ? (
              <p className="text-sm text-hata">{t('duyurular.form.bitisGecmis')}</p>
            ) : null}
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-2 border-t border-kenar pt-4">
          {d.durum === 'taslak' ? (
            <>
              <Dugme
                gorunum="ikincil"
                disabled={bekliyor}
                onClick={() => {
                  setDuzenle(true);
                }}
              >
                {t('duyurular.eylem.duzenle')}
              </Dugme>
              <Dugme
                disabled={bekliyor}
                onClick={() => {
                  setOnay('yayinla');
                }}
              >
                {t('duyurular.eylem.yayinla')}
              </Dugme>
            </>
          ) : null}
          {d.durum === 'yayinda' ? (
            <Dugme
              gorunum="ikincil"
              disabled={bekliyor}
              onClick={() => {
                setOnay('arsivle');
              }}
            >
              {t('duyurular.eylem.arsivle')}
            </Dugme>
          ) : null}
          <Dugme
            gorunum="tehlike"
            disabled={bekliyor}
            onClick={() => {
              setOnay('sil');
            }}
          >
            {t('duyurular.eylem.sil')}
          </Dugme>
        </div>
      </Kart>

      {d.durum !== 'taslak' ? <OkuyanlarBolumu kurumId={kurumId} duyuru={d} /> : null}

      <DuyuruFormu
        acik={duzenle}
        taslak={d}
        kapat={() => {
          setDuzenle(false);
        }}
        tamam={(s) => {
          setDuzenle(false);
          setBildirim(
            basari(
              s.tur === 'yayin'
                ? s.duyuru.alici_sayisi > 0
                  ? t('duyurular.onay.sonuc', { n: s.duyuru.alici_sayisi })
                  : t('duyurular.onay.sonucKisisiz')
                : t('duyurular.eylem.taslakKaydedildi'),
            ),
          );
        }}
      />

      <OnayPenceresi
        acik={onay === 'yayinla'}
        degisti={(a) => {
          if (!a && !bekliyor) setOnay(null);
        }}
        baslik={t('duyurular.onay.baslik')}
        aciklama={yayinOnayMetni({
          baslik: d.baslik,
          hedef,
          roller: d.hedef_roller,
          uyeSayisi: grup ? grup.uyeSayisi : null,
        })}
        onayEtiketi={t('duyurular.onay.onayla')}
        bekliyor={bekliyor}
        onay={() => {
          void yayinlaVeBildir().finally(() => {
            setOnay(null);
          });
        }}
      />
      <OnayPenceresi
        acik={onay === 'arsivle'}
        degisti={(a) => {
          if (!a && !bekliyor) setOnay(null);
        }}
        baslik={t('duyurular.eylem.arsivOnayBaslik')}
        aciklama={t('duyurular.eylem.arsivOnayAciklama')}
        onayEtiketi={t('duyurular.eylem.arsivle')}
        bekliyor={bekliyor}
        onay={() => {
          void calistir(() => arsivle.mutateAsync(d.id), t('duyurular.eylem.arsivlendi')).finally(
            () => {
              setOnay(null);
            },
          );
        }}
      />
      <OnayPenceresi
        acik={onay === 'sil'}
        degisti={(a) => {
          if (!a && !bekliyor) setOnay(null);
        }}
        baslik={t('duyurular.eylem.silOnayBaslik')}
        aciklama={t('duyurular.eylem.silOnayAciklama')}
        onayEtiketi={t('duyurular.eylem.sil')}
        tehlikeli
        bekliyor={bekliyor}
        onay={() => {
          void calistir(async () => {
            await sil.mutateAsync(d.id);
            router.replace(`/${kurumId}/duyurular`);
          }, t('duyurular.eylem.silindi')).finally(() => {
            setOnay(null);
          });
        }}
      />
    </section>
  );
}
