'use client';

import { GUNLUK_SORU_EN_FAZLA_TOPLAM, GUNLUK_SORU_GERI_GUN, type Zorluk } from '@kopru/contracts';
import { t } from '@kopru/i18n';
import { CircleCheck } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState, type SyntheticEvent } from 'react';

import { FotoAlani, useGunlukFotograflar } from './foto-alani';

import { KonuSecici } from '@/components/ogrenme/konu-secici';
import { Alan } from '@/components/operasyon/ortak';
import { Dugme, dugmeStili } from '@/components/ui/button';
import { Girdi } from '@/components/ui/input';
import { Secim } from '@/components/ui/secim';
import { Uyari } from '@/components/ui/uyari';
import { useKurum } from '@/kurum/baglam';
import { hataMesaji } from '@/lib/api';
import { bransAdi, siraliBransler } from '@/lib/bransler';
import { cn } from '@/lib/cn';
import { zorlukAdi } from '@/lib/gunluk-soru/analiz';
import {
  tercihleriOku,
  tercihleriYaz,
  type DersTercihi,
  type SonKaynak,
} from '@/lib/gunluk-soru/hatirla';
import {
  useKayitGuncelle,
  useKayitOlustur,
  useKaynakKitapDetayi,
  useKaynakKitaplar,
  useSonKullanilanlar,
  type Kayit,
} from '@/lib/gunluk-soru/veri';
import { useKonular } from '@/lib/ogrenme/veri';
import { bugunYerel, tarihEkle, kisaGunEtiketi } from '@/lib/saat';
import { bekleMs, dosyaHazirDegilDene } from '@/lib/soru/yukleme';

const ZORLUKLAR: readonly Zorluk[] = ['kolay', 'orta', 'zor'];
type KaynakTuru = SonKaynak['tur'];

export interface KayitBaslangici {
  brans?: string;
  konuId?: string;
  gorevId?: string;
  gorevMiktar?: number;
}

interface Kaydedilen {
  toplam: number;
  ozet: string;
}

const sayiMetni = (v: string) => v.replace(/\D/g, '').slice(0, 3);
const sayiDegeri = (v: string) => (v === '' ? 0 : Number(v));

/**
 * Ogrenci "Soru cozdum" hizli girisi (15 sn calisma citi): ders -> konu -> zorluk -> kaynak -> D/Y/B -> kaydet.
 * Son ders/konu/zorluk/kaynak hatirlanir (yerel + `son-kullanilanlar`), odak dogrudan "Dogru"ya gelir, Enter
 * kaydeder. `duzelt` verilirse ayni gun duzeltme (fotograf ve gun degismez).
 */
export function KayitFormu({
  baslangic = {},
  duzelt,
  bitti,
  vazgec,
  plana,
}: {
  baslangic?: KayitBaslangici;
  duzelt?: Kayit;
  bitti?: () => void;
  vazgec?: () => void;
  /** Gorevden gelindiyse kayittan sonra "Plana don" baglantisi. */
  plana?: string;
}) {
  const { uyelik } = useKurum();
  const kurumId = uyelik.kurumId;
  const kok = `/${kurumId}`;
  const duzenleme = duzelt !== undefined;
  const son = useSonKullanilanlar(kurumId);
  const konular = useKonular(kurumId);
  const foto = useGunlukFotograflar();
  const olustur = useKayitOlustur(kurumId);
  const guncelle = useKayitGuncelle(kurumId, duzelt?.id ?? '');

  const [brans, setBrans] = useState(duzelt?.brans_kodu ?? baslangic.brans ?? '');
  const [konuId, setKonuId] = useState<string | null>(duzelt?.konu_id ?? baslangic.konuId ?? null);
  const [zorluk, setZorluk] = useState<Zorluk>(duzelt?.zorluk ?? 'orta');
  const [kaynakTuru, setKaynakTuru] = useState<KaynakTuru>(
    duzelt?.kaynak_test_id ? 'test' : duzelt?.kaynak_metin ? 'serbest' : 'yok',
  );
  const [kitapId, setKitapId] = useState(duzelt?.kaynak_kitap_id ?? '');
  const [testId, setTestId] = useState(duzelt?.kaynak_test_id ?? '');
  const [serbest, setSerbest] = useState(duzelt?.kaynak_metin ?? '');
  const [dogru, setDogru] = useState(duzelt ? String(duzelt.dogru) : '');
  const [yanlis, setYanlis] = useState(duzelt ? String(duzelt.yanlis) : '');
  const [bos, setBos] = useState(duzelt ? String(duzelt.bos) : '');
  const [gunOnce, setGunOnce] = useState(0);
  const [gorevId, setGorevId] = useState<string | null>(
    duzelt ? duzelt.plan_gorev_id : (baslangic.gorevId ?? null),
  );
  const [hatalar, setHatalar] = useState<Record<string, string>>({});
  const [kaydedilen, setKaydedilen] = useState<Kaydedilen | null>(null);
  /** Ayni istek yeniden denendiginde ayni kayit doner (kayit cogalmaz); basarida yenilenir. */
  const istekId = useRef(crypto.randomUUID());
  const dogruGirdisi = useRef<HTMLInputElement>(null);
  const [hazir, setHazir] = useState(duzenleme);

  const bransSecenekleri = siraliBransler();
  const dersler = son.data?.dersler ?? [];
  const sonDers = dersler.find((d) => d.brans_kodu === brans);
  const sonDersKodlari = new Set(dersler.map((d) => d.brans_kodu));

  /** Dersin varsayilanlari: gorevden gelen > yerel tercih > `son-kullanilanlar` (sunucu). */
  const dersVarsayilanlari = (b: string, ilkAcilis: boolean) => {
    const yerel: DersTercihi = tercihleriOku(kurumId).dersler[b] ?? {};
    const sunucu = dersler.find((d) => d.brans_kodu === b);
    const konu =
      (ilkAcilis && baslangic.konuId && baslangic.brans === b ? baslangic.konuId : undefined) ??
      yerel.konuId ??
      sunucu?.konular[0]?.konu_id ??
      null;
    setKonuId(konu);
    setZorluk(
      yerel.zorluk ?? sunucu?.konular.find((k) => k.konu_id === konu)?.son_zorluk ?? 'orta',
    );
    const kaynak = yerel.kaynak;
    if (kaynak?.tur === 'test' && kaynak.kitapId && kaynak.testId) {
      setKaynakTuru('test');
      setKitapId(kaynak.kitapId);
      setTestId(kaynak.testId);
    } else if (kaynak?.tur === 'serbest' && kaynak.metin) {
      setKaynakTuru('serbest');
      setSerbest(kaynak.metin);
    } else {
      const s = sunucu?.kaynaklar[0];
      if (s?.kaynak_test_id && s.kaynak_kitap_id) {
        setKaynakTuru('test');
        setKitapId(s.kaynak_kitap_id);
        setTestId(s.kaynak_test_id);
      } else if (s?.kaynak_metin) {
        setKaynakTuru('serbest');
        setSerbest(s.kaynak_metin);
      } else {
        setKaynakTuru('yok');
      }
    }
  };

  // Ilk acilis: son kullanilanlar yuklenince (ya da hata verince) bir kez varsayilanlari uygula
  // (render sirasinda durum ayarlama: efekt gerektirmez, ek bir cizim dongusu olmaz).
  if (!hazir && !son.isPending) {
    setHazir(true);
    const b = baslangic.brans ?? tercihleriOku(kurumId).brans ?? dersler[0]?.brans_kodu ?? '';
    setBrans(b);
    if (b !== '') dersVarsayilanlari(b, true);
  }
  // Odak "Doğru" alanina: konu ve zorluk hazirsa tek yazimla kayit girilir.
  useEffect(() => {
    if (hazir && !duzenleme) dogruGirdisi.current?.focus();
  }, [hazir, duzenleme]);

  const kitaplar = useKaynakKitaplar(kurumId, { brans }, brans !== '' && kaynakTuru === 'test');
  const kitap = useKaynakKitapDetayi(kurumId, kaynakTuru === 'test' && kitapId ? kitapId : null);

  const toplam = sayiDegeri(dogru) + sayiDegeri(yanlis) + sayiDegeri(bos);
  const bugun = bugunYerel('Europe/Istanbul');

  const dogrula = (): boolean => {
    const h: Record<string, string> = {};
    if (brans === '') h.brans = t('gunlukSoru.form.hata.ders');
    if (!konuId) h.konu = t('gunlukSoru.form.hata.konu');
    if (toplam < 1 || toplam > GUNLUK_SORU_EN_FAZLA_TOPLAM) {
      h.sayilar = t('gunlukSoru.form.hata.toplam');
    }
    if (kaynakTuru === 'test' && (!kitapId || !testId)) h.kaynak = t('gunlukSoru.form.hata.kitap');
    if (kaynakTuru === 'serbest' && serbest.trim() === '') {
      h.kaynak = t('gunlukSoru.form.hata.serbest');
    }
    setHatalar(h);
    return Object.keys(h).length === 0;
  };

  const fotoHazir = foto.fotograflar.every((f) => f.dosyaId !== null);
  const bekliyor = olustur.isPending || guncelle.isPending;
  const hata = olustur.error ?? guncelle.error;

  const kaynakGovdesi = () =>
    kaynakTuru === 'test'
      ? { kaynak_test_id: testId, kaynak_metin: null }
      : kaynakTuru === 'serbest'
        ? { kaynak_test_id: null, kaynak_metin: serbest.trim() }
        : { kaynak_test_id: null, kaynak_metin: null };

  const tercihiYaz = () => {
    tercihleriYaz(kurumId, brans, {
      ...(konuId ? { konuId } : {}),
      zorluk,
      kaynak:
        kaynakTuru === 'test'
          ? { tur: 'test', kitapId, testId }
          : kaynakTuru === 'serbest'
            ? { tur: 'serbest', metin: serbest.trim() }
            : { tur: 'yok' },
    });
  };

  const gonder = async (e: SyntheticEvent) => {
    e.preventDefault();
    if (bekliyor || !dogrula() || !konuId || !fotoHazir) return;
    const sayilar = {
      dogru: sayiDegeri(dogru),
      yanlis: sayiDegeri(yanlis),
      bos: sayiDegeri(bos),
    };
    try {
      if (duzenleme) {
        await guncelle.mutateAsync({
          brans_kodu: brans,
          konu_id: konuId,
          zorluk,
          ...kaynakGovdesi(),
          ...sayilar,
          plan_gorev_id: gorevId,
          surum: duzelt.surum,
        });
        tercihiYaz();
        bitti?.();
        return;
      }
      const dosyalar = foto.fotograflar.flatMap((f) => (f.dosyaId ? [f.dosyaId] : []));
      await dosyaHazirDegilDene(
        () =>
          olustur.mutateAsync({
            ...(gunOnce > 0 ? { gun: tarihEkle(bugun, -gunOnce) } : {}),
            brans_kodu: brans,
            konu_id: konuId,
            zorluk,
            ...kaynakGovdesi(),
            ...sayilar,
            ...(gorevId ? { plan_gorev_id: gorevId } : {}),
            dosya_idleri: dosyalar,
            istek_id: istekId.current,
          }),
        bekleMs,
      );
      tercihiYaz();
      const konuAdi = (konular.data ?? []).find((k) => k.id === konuId)?.ad ?? '';
      setKaydedilen({
        toplam,
        ozet: t('gunlukSoru.form.kaydedildiAciklama', {
          ders: bransAdi(brans),
          konu: konuAdi,
          zorluk: zorlukAdi(zorluk),
          dogru: sayilar.dogru,
          yanlis: sayilar.yanlis,
          bos: sayilar.bos,
        }),
      });
      bitti?.();
    } catch {
      /* hata `olustur.error` / `guncelle.error` uzerinden gosterilir */
    }
  };

  const yeniKayit = () => {
    setKaydedilen(null);
    setDogru('');
    setYanlis('');
    setBos('');
    setGorevId(null);
    setGunOnce(0);
    foto.temizle();
    olustur.reset();
    istekId.current = crypto.randomUUID();
    setTimeout(() => dogruGirdisi.current?.focus(), 0);
  };

  if (kaydedilen) {
    return (
      <div
        role="status"
        data-testid="kayit-kaydedildi"
        className="flex flex-col gap-4 rounded-buyuk border border-kenar bg-yuzey p-5"
      >
        <div className="flex items-start gap-3">
          <CircleCheck className="mt-0.5 size-6 shrink-0 text-basari" aria-hidden />
          <div>
            <h2 className="text-lg font-semibold">
              {t('gunlukSoru.form.kaydedildi', { n: kaydedilen.toplam })}
            </h2>
            <p className="mt-1 text-sm text-metin-ikincil">{kaydedilen.ozet}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Dugme onClick={yeniKayit}>{t('gunlukSoru.form.yeniKayit')}</Dugme>
          <Link href={`${kok}/gunluk-soru`} className={dugmeStili({ gorunum: 'ikincil' })}>
            {t('gunlukSoru.form.kayitlarima')}
          </Link>
          {plana ? (
            <Link href={plana} className={dugmeStili({ gorunum: 'hayalet' })}>
              {t('gunlukSoru.form.plana')}
            </Link>
          ) : null}
        </div>
      </div>
    );
  }

  const gunSecenekleri = Array.from({ length: GUNLUK_SORU_GERI_GUN + 1 }, (_, n) => n);
  return (
    <form onSubmit={(e) => void gonder(e)} noValidate className="flex flex-col gap-5">
      {gorevId && !duzenleme ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-orta bg-birincil-yumusak px-3 py-2 text-sm">
          <span>
            {t('gunlukSoru.form.gorevBagi', {
              brans: bransAdi(brans !== '' ? brans : (baslangic.brans ?? '')),
              miktar: baslangic.gorevMiktar ?? 0,
            })}
          </span>
          <Dugme
            type="button"
            gorunum="hayalet"
            boyut="sm"
            onClick={() => {
              setGorevId(null);
            }}
          >
            {t('gunlukSoru.form.gorevBagiKaldir')}
          </Dugme>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Alan etiket={t('gunlukSoru.form.ders')} hata={hatalar.brans}>
          {(o) => (
            <Secim
              {...o}
              value={brans}
              onChange={(e) => {
                setBrans(e.target.value);
                setKonuId(null);
                if (e.target.value !== '') dersVarsayilanlari(e.target.value, false);
              }}
            >
              <option value="">{t('gunlukSoru.form.dersSec')}</option>
              {dersler.length > 0 ? (
                <optgroup label={t('gunlukSoru.form.sonKonular')}>
                  {dersler.map((d) => (
                    <option key={`son-${d.brans_kodu}`} value={d.brans_kodu}>
                      {bransAdi(d.brans_kodu)}
                    </option>
                  ))}
                </optgroup>
              ) : null}
              {bransSecenekleri
                .filter((b) => !sonDersKodlari.has(b.kod))
                .map((b) => (
                  <option key={b.kod} value={b.kod}>
                    {b.ad}
                  </option>
                ))}
            </Secim>
          )}
        </Alan>
        {!duzenleme ? (
          <Alan etiket={t('gunlukSoru.form.gun')}>
            {(o) => (
              <Secim
                {...o}
                value={String(gunOnce)}
                onChange={(e) => {
                  setGunOnce(Number(e.target.value));
                }}
              >
                {gunSecenekleri.map((n) => (
                  <option key={n} value={n}>
                    {n === 0
                      ? t('gunlukSoru.form.bugun')
                      : `${kisaGunEtiketi(tarihEkle(bugun, -n))} (${t('gunlukSoru.form.gunOnce', { n })})`}
                  </option>
                ))}
              </Secim>
            )}
          </Alan>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <KonuSecici
          kurumId={kurumId}
          deger={konuId}
          brans={brans || '__yok__'}
          degisti={(k) => {
            setKonuId(k?.id ?? null);
          }}
          etiket={t('gunlukSoru.form.konu')}
        />
        {hatalar.konu ? (
          <p role="alert" className="text-sm text-hata">
            {hatalar.konu}
          </p>
        ) : null}
        {sonDers && sonDers.konular.length > 0 ? (
          <ul
            aria-label={t('gunlukSoru.form.sonKonular')}
            className="flex flex-wrap gap-2"
            data-testid="son-konular"
          >
            {sonDers.konular.map((k) => (
              <li key={k.konu_id}>
                <button
                  type="button"
                  aria-pressed={konuId === k.konu_id}
                  onClick={() => {
                    setKonuId(k.konu_id);
                    setZorluk(k.son_zorluk);
                  }}
                  className={cn(
                    'min-h-9 rounded-full border border-kenar px-3 text-sm hover:bg-yuzey-ikincil',
                    konuId === k.konu_id && 'border-birincil bg-birincil-yumusak font-medium',
                  )}
                >
                  {k.konu_ad ?? ''}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1.5 text-sm font-medium">{t('gunlukSoru.form.zorluk')}</legend>
        <div
          role="radiogroup"
          aria-label={t('gunlukSoru.form.zorlukGrubu')}
          className="grid grid-cols-3 gap-2"
        >
          {ZORLUKLAR.map((z) => (
            <label
              key={z}
              className={cn(
                'flex min-h-11 cursor-pointer items-center justify-center rounded-orta border border-kenar px-3 text-base has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2',
                zorluk === z
                  ? 'border-birincil bg-birincil-yumusak font-semibold'
                  : 'bg-yuzey hover:bg-yuzey-ikincil',
              )}
            >
              <input
                type="radio"
                name="zorluk"
                value={z}
                checked={zorluk === z}
                onChange={() => {
                  setZorluk(z);
                }}
                className="sr-only"
              />
              {zorlukAdi(z)}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1.5 text-sm font-medium">{t('gunlukSoru.form.kaynak')}</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <Alan etiket={t('gunlukSoru.form.kaynakTuru')}>
            {(o) => (
              <Secim
                {...o}
                value={kaynakTuru}
                onChange={(e) => {
                  setKaynakTuru(e.target.value as KaynakTuru);
                }}
              >
                <option value="yok">{t('gunlukSoru.form.kaynakYok')}</option>
                <option value="test">{t('gunlukSoru.form.kaynakTest')}</option>
                <option value="serbest">{t('gunlukSoru.form.kaynakSerbest')}</option>
              </Secim>
            )}
          </Alan>
          {kaynakTuru === 'serbest' ? (
            <Alan etiket={t('gunlukSoru.form.serbest')} hata={hatalar.kaynak}>
              {(o) => (
                <Girdi
                  {...o}
                  maxLength={200}
                  value={serbest}
                  placeholder={t('gunlukSoru.form.serbestYer')}
                  onChange={(e) => {
                    setSerbest(e.target.value);
                  }}
                />
              )}
            </Alan>
          ) : null}
        </div>
        {kaynakTuru === 'test' ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Alan etiket={t('gunlukSoru.form.kitap')} hata={hatalar.kaynak}>
              {(o) => (
                <Secim
                  {...o}
                  value={kitapId}
                  onChange={(e) => {
                    setKitapId(e.target.value);
                    setTestId('');
                  }}
                >
                  <option value="">
                    {(kitaplar.data?.kitaplar.length ?? 1) === 0
                      ? t('gunlukSoru.form.kitapYok')
                      : t('gunlukSoru.form.kitapSec')}
                  </option>
                  {(kitaplar.data?.kitaplar ?? []).map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.ad}
                    </option>
                  ))}
                </Secim>
              )}
            </Alan>
            <Alan etiket={t('gunlukSoru.form.test')}>
              {(o) => (
                <Secim
                  {...o}
                  value={testId}
                  disabled={!kitapId}
                  onChange={(e) => {
                    setTestId(e.target.value);
                  }}
                >
                  <option value="">{t('gunlukSoru.form.testSec')}</option>
                  {(kitap.data?.testler ?? []).map((x) => (
                    <option key={x.id} value={x.id}>
                      {t('gunlukSoru.form.testSoru', { ad: x.ad, n: x.soru_sayisi })}
                    </option>
                  ))}
                </Secim>
              )}
            </Alan>
          </div>
        ) : null}
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 text-sm font-medium">{t('gunlukSoru.ortak.cozulen')}</legend>
        <div className="grid grid-cols-3 gap-3">
          {(
            [
              ['dogru', t('gunlukSoru.form.dogru'), dogru, setDogru],
              ['yanlis', t('gunlukSoru.form.yanlis'), yanlis, setYanlis],
              ['bos', t('gunlukSoru.form.bos'), bos, setBos],
            ] as const
          ).map(([ad, etiket, deger, yaz]) => (
            <Alan key={ad} etiket={etiket}>
              {(o) => (
                <Girdi
                  {...o}
                  ref={ad === 'dogru' ? dogruGirdisi : undefined}
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="0"
                  value={deger}
                  onChange={(e) => {
                    yaz(sayiMetni(e.target.value));
                  }}
                  onFocus={(e) => {
                    e.target.select();
                  }}
                />
              )}
            </Alan>
          ))}
        </div>
        <p
          role="status"
          data-testid="kayit-toplam"
          className={cn('text-sm', hatalar.sayilar ? 'text-hata' : 'text-metin-ikincil')}
        >
          {hatalar.sayilar ?? t('gunlukSoru.form.toplam', { n: toplam })}
        </p>
      </fieldset>

      {!duzenleme ? (
        <section aria-labelledby="gs-foto-baslik" className="flex flex-col gap-2">
          <h3 id="gs-foto-baslik" className="text-sm font-medium">
            {t('gunlukSoru.form.foto')}
          </h3>
          <FotoAlani depo={foto} />
        </section>
      ) : null}

      {hata ? <Uyari>{hataMesaji(hata)}</Uyari> : null}

      <div className="flex flex-wrap items-center gap-3">
        <Dugme type="submit" boyut="lg" disabled={bekliyor || !fotoHazir}>
          {bekliyor
            ? t('gunlukSoru.form.kaydediliyor')
            : duzenleme
              ? t('gunlukSoru.form.guncelle')
              : t('gunlukSoru.form.kaydet')}
        </Dugme>
        {vazgec ? (
          <Dugme type="button" gorunum="ikincil" boyut="lg" onClick={vazgec}>
            {t('gunlukSoru.form.vazgec')}
          </Dugme>
        ) : null}
        {!fotoHazir ? (
          <p role="status" className="text-sm text-metin-ikincil">
            {t('gunlukSoru.form.fotoBekleniyor')}
          </p>
        ) : null}
      </div>
    </form>
  );
}
