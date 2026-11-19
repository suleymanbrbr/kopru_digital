'use client';

import { t } from '@kopru/i18n';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { Dugme } from '../ui/dugme';
import { SorguHatasi, Yukleniyor } from '../ui/durum-gosterimi';
import { Kart, KartBasligi, SayfaBasligi } from '../ui/kart';
import { OnayPenceresi } from '../ui/onay-penceresi';
import { Rozet } from '../ui/rozet';
import { Tablo, Td, Th } from '../ui/tablo';
import { Uyari } from '../ui/uyari';

import { platform, YonetimHatasi } from '@/lib/api';
import { tarihSaat } from '@/lib/bicim';
import {
  alanHataHaritasi,
  degisiklikleriBul,
  degisiklikSayisi,
  formaCevir,
  kuralAdi,
  tavanAdi,
  type AyarFormu,
} from '@/lib/motivasyon';
import { useYonetici } from '@/lib/oturum';
import type { AyarlarYaniti, AyarSurumu } from '@/lib/tipler';

export const AYAR_ANAHTARI = ['motivasyon', 'ayarlar'] as const;

const SAYI_GIRDISI =
  'h-10 w-24 rounded-orta border border-kenar bg-yuzey px-2 text-sm aria-[invalid=true]:border-hata disabled:border-transparent disabled:bg-transparent';

/** Etiketsiz tablo girdisi: erisilebilir ad `aria-label` ile verilir. */
function SayiGirdisi({
  etiket,
  deger,
  duzenle,
  hata,
  onDegis,
  bos,
}: {
  etiket: string;
  deger: string;
  duzenle: boolean;
  hata?: string | undefined;
  onDegis: (v: string) => void;
  bos?: string;
}) {
  if (!duzenle) return <span>{deger === '' ? (bos ?? '') : deger}</span>;
  return (
    <div>
      <input
        aria-label={etiket}
        aria-invalid={hata ? true : undefined}
        inputMode="decimal"
        value={deger}
        onChange={(e) => {
          onDegis(e.target.value);
        }}
        className={SAYI_GIRDISI}
      />
      {hata ? <p className="mt-1 max-w-56 text-xs font-medium text-hata">{hata}</p> : null}
    </div>
  );
}

function mesajMetni(s: { surum: number; geriAlinan: number | null }): string {
  return s.geriAlinan === null
    ? t('yonetim.motivasyon.kaydedildi', { n: s.surum })
    : t('yonetim.motivasyon.geriAlindi', { n: s.geriAlinan, yeni: s.surum });
}

function UyariListesi({ uyarilar }: { uyarilar: AyarSurumu['uyarilar'] }) {
  return (
    <Uyari ton="uyari" baslik={t('yonetim.motivasyon.uyarilar')}>
      <p>{t('yonetim.motivasyon.uyariAciklama')}</p>
      <ul className="mt-1 list-disc pl-4">
        {uyarilar.map((u) => (
          <li key={u.kod + u.mesaj}>{u.mesaj}</li>
        ))}
      </ul>
    </Uyari>
  );
}

function GecmisKarti({
  veri,
  yonetici,
  onGeriAl,
}: {
  veri: AyarlarYaniti;
  yonetici: boolean;
  onGeriAl: (s: AyarSurumu) => void;
}) {
  return (
    <Kart aria-labelledby="gecmis-baslik">
      <KartBasligi id="gecmis-baslik" baslik={t('yonetim.motivasyon.gecmis')} />
      <Tablo etiket={t('yonetim.motivasyon.gecmisTablo')}>
        <thead>
          <tr>
            <Th>{t('yonetim.motivasyon.gecmisSurum')}</Th>
            <Th>{t('yonetim.motivasyon.gecmisTarih')}</Th>
            <Th>{t('yonetim.motivasyon.gecmisNeden')}</Th>
            <Th>{t('yonetim.motivasyon.gecmisKim')}</Th>
            <Th>{t('yonetim.motivasyon.gecmisUyari')}</Th>
            {yonetici ? <Th className="text-right">{t('yonetim.ortak.islem')}</Th> : null}
          </tr>
        </thead>
        <tbody>
          {veri.gecmis.map((s) => (
            <tr key={s.surum}>
              <Td className="font-medium whitespace-nowrap">
                {s.surum}{' '}
                {s.surum === veri.gecerli.surum ? (
                  <Rozet ton="basari">{t('yonetim.motivasyon.gecerliEtiket')}</Rozet>
                ) : null}
              </Td>
              <Td className="text-xs whitespace-nowrap">{tarihSaat(s.created_at)}</Td>
              <Td className="min-w-48">
                {s.neden}
                {s.geri_alinan_surum ? (
                  <p className="mt-0.5 text-xs text-metin-ikincil">
                    {t('yonetim.motivasyon.geriAlinan', { n: s.geri_alinan_surum })}
                  </p>
                ) : null}
              </Td>
              <Td className="font-mono text-xs">
                {s.degistiren_kullanici_id
                  ? `${s.degistiren_kullanici_id.slice(0, 8)}…`
                  : t('yonetim.motivasyon.tohum')}
              </Td>
              <Td>
                {s.uyarilar.length > 0 ? (
                  <details>
                    <summary className="cursor-pointer text-xs text-uyari">
                      {t('yonetim.motivasyon.uyarilar')} ({s.uyarilar.length})
                    </summary>
                    <ul className="mt-1 max-w-xs list-disc pl-4 text-xs">
                      {s.uyarilar.map((u) => (
                        <li key={u.kod + u.mesaj}>{u.mesaj}</li>
                      ))}
                    </ul>
                  </details>
                ) : (
                  <span className="text-xs text-metin-ikincil">—</span>
                )}
              </Td>
              {yonetici ? (
                <Td className="text-right">
                  {s.surum !== veri.gecerli.surum ? (
                    <Dugme
                      gorunum="ikincil"
                      boyut="sm"
                      aria-label={`${t('yonetim.motivasyon.geriAl')} (${String(s.surum)})`}
                      onClick={() => {
                        onGeriAl(s);
                      }}
                    >
                      {t('yonetim.motivasyon.geriAl')}
                    </Dugme>
                  ) : null}
                </Td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </Tablo>
    </Kart>
  );
}

interface Sonuc {
  surum: number;
  uyarilar: AyarSurumu['uyarilar'];
  /** Geri almada hedef surum. */
  geriAlinan: number | null;
}

export function MotivasyonSayfasi() {
  const yonetici = useYonetici();
  // Kayit/geri alma sonrasi form yeniden kurulur (key); bildirimler bu yuzden burada tutulur.
  const [sonuc, setSonuc] = useState<Sonuc | null>(null);
  const [catisma, setCatisma] = useState(false);
  const sorgu = useQuery({
    queryKey: AYAR_ANAHTARI,
    enabled: yonetici,
    queryFn: () => platform.al<AyarlarYaniti>('motivasyon/ayarlar', { limit: 50 }),
  });

  if (!yonetici) {
    return (
      <>
        <SayfaBasligi baslik={t('yonetim.motivasyon.baslik')} />
        <Uyari ton="uyari">{t('yonetim.ortak.yalnizYonetici')}</Uyari>
      </>
    );
  }
  return (
    <>
      <SayfaBasligi
        baslik={t('yonetim.motivasyon.baslik')}
        aciklama={t('yonetim.motivasyon.aciklama')}
      />
      {sorgu.isPending ? (
        <Yukleniyor />
      ) : sorgu.error ? (
        <SorguHatasi
          hata={sorgu.error}
          onTekrar={() => {
            void sorgu.refetch();
          }}
        />
      ) : (
        // Surum degisince (kayit / geri alma / catisma) form gecerli degerlerle yeniden kurulur.
        <AyarEditoru
          key={sorgu.data.gecerli.surum}
          veri={sorgu.data}
          sonuc={sonuc}
          setSonuc={setSonuc}
          catisma={catisma}
          setCatisma={setCatisma}
        />
      )}
    </>
  );
}

function AyarEditoru({
  veri,
  sonuc,
  setSonuc,
  catisma,
  setCatisma,
}: {
  veri: AyarlarYaniti;
  sonuc: Sonuc | null;
  setSonuc: (s: Sonuc | null) => void;
  catisma: boolean;
  setCatisma: (v: boolean) => void;
}) {
  const istemci = useQueryClient();
  const gecerli = veri.gecerli;
  const [duzenle, setDuzenle] = useState(false);
  const [form, setForm] = useState<AyarFormu>(() => formaCevir(gecerli.degerler));
  const [onay, setOnay] = useState(false);
  const [geriAlinacak, setGeriAlinacak] = useState<AyarSurumu | null>(null);
  const [sunucuHatalari, setSunucuHatalari] = useState<Record<string, string>>({});

  const degisiklik = degisiklikleriBul(form, gecerli.degerler);
  const sayi = degisiklikSayisi(degisiklik);
  const yerelHata = degisiklik.gecersiz.length > 0;

  const yenile = () => istemci.invalidateQueries({ queryKey: AYAR_ANAHTARI });

  const kaydet = useMutation({
    mutationFn: (neden: string) =>
      platform.koy<AyarSurumu>('motivasyon/ayarlar', {
        neden,
        beklenen_surum: gecerli.surum,
        ...(Object.keys(degisiklik.kurallar).length > 0 ? { kurallar: degisiklik.kurallar } : {}),
        ...(Object.keys(degisiklik.tavanlar).length > 0 ? { tavanlar: degisiklik.tavanlar } : {}),
      }),
    onSuccess: async (s) => {
      setOnay(false);
      setDuzenle(false);
      setSunucuHatalari({});
      setSonuc({ surum: s.surum, uyarilar: s.uyarilar, geriAlinan: null });
      await yenile();
    },
    onError: async (hata) => {
      if (hata instanceof YonetimHatasi) {
        if (hata.kod === 'ayar_gecersiz') {
          setSunucuHatalari(alanHataHaritasi(hata.alanHatalari));
        } else if (hata.kod === 'surum_catismasi') {
          setOnay(false);
          setCatisma(true);
          await yenile();
        }
      }
    },
  });

  const geriAl = useMutation({
    mutationFn: ({ surum, neden }: { surum: number; neden: string }) =>
      platform.yolla<AyarSurumu>('motivasyon/ayarlar/geri-al', {
        surum,
        neden,
        beklenen_surum: gecerli.surum,
      }),
    onSuccess: async (s) => {
      const hedef = geriAlinacak?.surum ?? null;
      setGeriAlinacak(null);
      setSonuc({ surum: s.surum, uyarilar: s.uyarilar, geriAlinan: hedef });
      await yenile();
    },
    onError: async (hata) => {
      if (hata instanceof YonetimHatasi && hata.kod === 'surum_catismasi') {
        setGeriAlinacak(null);
        setCatisma(true);
        await yenile();
      }
    },
  });

  const kuralDegis = (kod: string, parca: Partial<AyarFormu['kurallar'][string]>) => {
    setForm((f) => ({
      ...f,
      kurallar: f.kurallar[kod]
        ? { ...f.kurallar, [kod]: { ...f.kurallar[kod], ...parca } }
        : f.kurallar,
    }));
  };

  const hataOf = (alan: string) =>
    sunucuHatalari[alan] ??
    (degisiklik.gecersiz.includes(alan) ? t('yonetim.motivasyon.sayiGerekli') : undefined);

  const kuralKodlari = Object.keys(gecerli.degerler.kurallar);
  const tavanKodlari = Object.keys(gecerli.degerler.tavanlar);

  return (
    <div className="flex flex-col gap-4">
      {catisma ? <Uyari ton="uyari">{t('yonetim.motivasyon.surumCatismasi')}</Uyari> : null}
      {sonuc ? (
        sonuc.uyarilar.length > 0 ? (
          <div className="flex flex-col gap-2">
            <Uyari ton="basari">{mesajMetni(sonuc)}</Uyari>
            <UyariListesi uyarilar={sonuc.uyarilar} />
          </div>
        ) : (
          <Uyari ton="basari">{mesajMetni(sonuc)}</Uyari>
        )
      ) : null}

      <Kart aria-labelledby="kural-baslik">
        <KartBasligi
          id="kural-baslik"
          baslik={t('yonetim.motivasyon.kurallar')}
          aciklama={t('yonetim.motivasyon.gecerliSurum', { n: gecerli.surum })}
          sag={
            duzenle ? (
              <div className="flex flex-wrap items-center gap-2">
                <span role="status" className="text-sm text-metin-ikincil">
                  {sayi > 0
                    ? t('yonetim.motivasyon.degisiklikSayisi', { n: sayi })
                    : t('yonetim.motivasyon.degisiklikYok')}
                </span>
                <Dugme
                  gorunum="ikincil"
                  onClick={() => {
                    setDuzenle(false);
                    setForm(formaCevir(gecerli.degerler));
                    setSunucuHatalari({});
                  }}
                >
                  {t('yonetim.motivasyon.vazgec')}
                </Dugme>
                <Dugme
                  disabled={sayi === 0 || yerelHata}
                  onClick={() => {
                    kaydet.reset();
                    setCatisma(false);
                    setOnay(true);
                  }}
                >
                  {t('yonetim.motivasyon.kaydet')}
                </Dugme>
              </div>
            ) : (
              <Dugme
                onClick={() => {
                  setSonuc(null);
                  setCatisma(false);
                  setDuzenle(true);
                }}
              >
                {t('yonetim.motivasyon.duzenle')}
              </Dugme>
            )
          }
        />
        <Tablo etiket={t('yonetim.motivasyon.kurallar')}>
          <thead>
            <tr>
              <Th>{t('yonetim.motivasyon.kuralSutun')}</Th>
              <Th>{t('yonetim.motivasyon.xp')}</Th>
              <Th>{t('yonetim.motivasyon.olayBasi')}</Th>
              <Th>{t('yonetim.motivasyon.gecCarpani')}</Th>
              <Th>{t('yonetim.motivasyon.aktif')}</Th>
            </tr>
          </thead>
          <tbody>
            {kuralKodlari.map((kod) => {
              const f = form.kurallar[kod];
              const g = gecerli.degerler.kurallar[kod];
              if (!f || !g) return null;
              const ad = kuralAdi(kod);
              return (
                <tr key={kod}>
                  <Td className="min-w-44 font-medium">{ad}</Td>
                  <Td>
                    <SayiGirdisi
                      etiket={`${ad}: ${t('yonetim.motivasyon.xp')}`}
                      deger={f.xp}
                      duzenle={duzenle}
                      hata={hataOf(`kurallar.${kod}.xp`)}
                      onDegis={(v) => {
                        kuralDegis(kod, { xp: v });
                      }}
                    />
                  </Td>
                  <Td>
                    <SayiGirdisi
                      etiket={`${ad}: ${t('yonetim.motivasyon.olayBasi')}`}
                      deger={f.olay}
                      bos={t('yonetim.motivasyon.sinirYok')}
                      duzenle={duzenle}
                      hata={hataOf(`kurallar.${kod}.olay_basi_ust_sinir`)}
                      onDegis={(v) => {
                        kuralDegis(kod, { olay: v });
                      }}
                    />
                  </Td>
                  <Td>
                    <SayiGirdisi
                      etiket={`${ad}: ${t('yonetim.motivasyon.gecCarpani')}`}
                      deger={f.carpan}
                      duzenle={duzenle}
                      hata={hataOf(`kurallar.${kod}.gec_carpani`)}
                      onDegis={(v) => {
                        kuralDegis(kod, { carpan: v });
                      }}
                    />
                  </Td>
                  <Td>
                    {duzenle ? (
                      <input
                        type="checkbox"
                        aria-label={`${ad}: ${t('yonetim.motivasyon.aktif')}`}
                        checked={f.aktif}
                        onChange={(e) => {
                          kuralDegis(kod, { aktif: e.target.checked });
                        }}
                        className="size-5"
                      />
                    ) : (
                      <Rozet ton={g.aktif ? 'basari' : 'notr'}>
                        {g.aktif ? t('yonetim.ortak.acik') : t('yonetim.ortak.kapali')}
                      </Rozet>
                    )}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Tablo>
      </Kart>

      <Kart aria-labelledby="tavan-baslik">
        <KartBasligi id="tavan-baslik" baslik={t('yonetim.motivasyon.tavanlar')} />
        <Tablo etiket={t('yonetim.motivasyon.tavanlar')}>
          <thead>
            <tr>
              <Th>{t('yonetim.motivasyon.tavanSutun')}</Th>
              <Th>{t('yonetim.motivasyon.tavanDeger')}</Th>
            </tr>
          </thead>
          <tbody>
            {tavanKodlari.map((kod) => (
              <tr key={kod}>
                <Td className="font-medium">{tavanAdi(kod)}</Td>
                <Td>
                  <SayiGirdisi
                    etiket={`${tavanAdi(kod)}: ${t('yonetim.motivasyon.tavanDeger')}`}
                    deger={form.tavanlar[kod] ?? ''}
                    duzenle={duzenle}
                    hata={hataOf(`tavanlar.${kod}`)}
                    onDegis={(v) => {
                      setForm((f) => ({ ...f, tavanlar: { ...f.tavanlar, [kod]: v } }));
                    }}
                  />
                </Td>
              </tr>
            ))}
          </tbody>
        </Tablo>
      </Kart>

      <GecmisKarti
        veri={veri}
        yonetici
        onGeriAl={(s) => {
          geriAl.reset();
          setSonuc(null);
          setCatisma(false);
          setGeriAlinacak(s);
        }}
      />

      <OnayPenceresi
        acik={onay}
        onKapat={() => {
          kaydet.reset();
          setOnay(false);
        }}
        baslik={t('yonetim.motivasyon.kaydetBaslik')}
        aciklama={t('yonetim.motivasyon.kaydetAciklama')}
        neden={{ min: 3 }}
        onayEtiketi={t('yonetim.motivasyon.kaydet')}
        bekliyor={kaydet.isPending}
        hata={kaydet.error}
        genis
        onOnayla={(neden) => {
          kaydet.mutate(neden);
        }}
      >
        <ul
          className="max-h-48 list-disc overflow-y-auto pl-5 text-sm"
          aria-label={t('yonetim.motivasyon.degisiklikSayisi', { n: sayi })}
        >
          {Object.entries(degisiklik.kurallar).flatMap(([kod, parca]) =>
            Object.entries(parca).map(([alan, deger]) => (
              <li key={`${kod}.${alan}`}>
                {kuralAdi(kod)} · {alan}: {String(deger ?? t('yonetim.motivasyon.sinirYok'))}
              </li>
            )),
          )}
          {Object.entries(degisiklik.tavanlar).map(([kod, deger]) => (
            <li key={`tavan.${kod}`}>
              {tavanAdi(kod)}: {deger}
            </li>
          ))}
        </ul>
      </OnayPenceresi>

      <OnayPenceresi
        acik={geriAlinacak !== null}
        onKapat={() => {
          geriAl.reset();
          setGeriAlinacak(null);
        }}
        baslik={t('yonetim.motivasyon.geriAlBaslik', { n: geriAlinacak?.surum ?? 0 })}
        aciklama={t('yonetim.motivasyon.geriAlAciklama')}
        neden={{ min: 3 }}
        onayEtiketi={t('yonetim.motivasyon.geriAl')}
        bekliyor={geriAl.isPending}
        hata={geriAl.error}
        onOnayla={(neden) => {
          if (geriAlinacak) geriAl.mutate({ surum: geriAlinacak.surum, neden });
        }}
      />
    </div>
  );
}
