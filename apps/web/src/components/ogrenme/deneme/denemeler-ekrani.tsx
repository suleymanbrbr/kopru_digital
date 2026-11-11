'use client';

import type { DenemeTipi } from '@kopru/contracts';
import { t } from '@kopru/i18n';
import { useMutation } from '@tanstack/react-query';
import { BookOpenCheck } from 'lucide-react';
import { useState } from 'react';

import { DenemeFormu } from './deneme-formu';
import { ExcelYukle } from './excel-yukle';
import { GelisimPaneli, SinifOzeti } from './gelisim';
import { OnayKuyrugu } from './onay-kuyrugu';
import { TabloGiris } from './tablo-giris';

import { BosDurum } from '@/components/bos-durum';
import { HataDurumu } from '@/components/hata-durumu';
import {
  BildirimKutusu,
  DahaFazla,
  ListeIskeleti,
  basari,
  basarisiz,
  type Bildirim,
} from '@/components/hesap/ortak';
import { BolumKapisi } from '@/components/kabuk/bolum-yer-tutucu';
import { SayfaBasligi } from '@/components/kabuk/sayfa-basligi';
import { OgrenciSecimi, Sekmeler } from '@/components/ogrenme/ortak';
import { Alan } from '@/components/operasyon/ortak';
import { Rozet } from '@/components/ui/rozet';
import { Secim } from '@/components/ui/secim';
import { useKurum } from '@/kurum/baglam';
import { hataMesaji } from '@/lib/api';
import { ogrenmeIstek } from '@/lib/hesap-istek';
import { netMetni } from '@/lib/ogrenme/net';
import { ogrenmeYetkileri } from '@/lib/ogrenme/rol';
import {
  useDenemeAyarlari,
  useDenemeKurallari,
  useDenemeler,
  useDenemelerim,
  useOgrenciler,
  useOgrenmeYenile,
} from '@/lib/ogrenme/veri';
import { useGruplar } from '@/lib/operasyon-verisi';
import { gunEtiketi } from '@/lib/saat';

export function DenemelerEkrani() {
  return (
    <BolumKapisi bolum="denemeler">
      <DenemelerYonlendir />
    </BolumKapisi>
  );
}

function DenemelerYonlendir() {
  const { rol } = useKurum();
  return ogrenmeYetkileri(rol).personel ? <PersonelDeneme /> : <OgrenciDeneme />;
}

/** Kural secimi: etiketli `<select>`; varsayilan ilk kural. */
function useKuralSecimi(kurumId: string) {
  const kurallar = useDenemeKurallari(kurumId);
  const [kod, setKod] = useState('');
  const liste = kurallar.data?.kurallar ?? [];
  const kural = liste.find((k) => k.kod === (kod || liste[0]?.kod));
  const secici = (
    <Alan etiket={t('ogrenme.deneme.tur')}>
      {(o) => (
        <Secim
          {...o}
          value={kural?.kod ?? ''}
          onChange={(e) => {
            setKod(e.target.value);
          }}
        >
          {liste.map((k) => (
            <option key={k.id} value={k.kod}>
              {k.ad}
            </option>
          ))}
        </Secim>
      )}
    </Alan>
  );
  return { kural, secici };
}

function PersonelDeneme() {
  const { uyelik, rol } = useKurum();
  const kurumId = uyelik.kurumId;
  const yetki = ogrenmeYetkileri(rol);
  const [sekme, setSekme] = useState('tek');
  const [bildirim, setBildirim] = useState<Bildirim>(null);
  const bekleyen = useDenemeler(kurumId, { onay: 'bekliyor' });
  const bekleyenSayisi = bekleyen.denemeler.length;
  const bekleyenMetni = bekleyen.hasNextPage
    ? `${String(bekleyenSayisi)}+`
    : String(bekleyenSayisi);

  const bildir = (mesaj: string) => {
    setBildirim(basari(mesaj));
  };

  return (
    <>
      <SayfaBasligi baslik={t('nav.denemeler')} aciklama={t('ogrenme.deneme.aciklama')} />
      <div className="mb-4">
        <BildirimKutusu bildirim={bildirim} />
      </div>
      <Sekmeler
        deger={sekme}
        degisti={(s) => {
          setSekme(s);
          setBildirim(null);
        }}
        etiket={t('nav.denemeler')}
        sekmeler={[
          {
            anahtar: 'tek',
            etiket: t('ogrenme.deneme.sekme.tek'),
            icerik: <DenemeFormu kurumId={kurumId} ogrenciModu={false} bitti={bildir} />,
          },
          {
            anahtar: 'tablo',
            etiket: t('ogrenme.deneme.sekme.tablo'),
            icerik: <TabloGiris kurumId={kurumId} bitti={bildir} />,
          },
          {
            anahtar: 'excel',
            etiket: t('ogrenme.deneme.sekme.excel'),
            icerik: <ExcelYukle kurumId={kurumId} bitti={bildir} />,
          },
          {
            anahtar: 'onay',
            etiket:
              bekleyenSayisi > 0
                ? t('ogrenme.deneme.sekme.onayAdet', { n: bekleyenMetni })
                : t('ogrenme.deneme.sekme.onay'),
            icerik: <OnayKuyrugu kurumId={kurumId} bildirim={setBildirim} />,
          },
          {
            anahtar: 'gelisim',
            etiket: t('ogrenme.deneme.sekme.gelisim'),
            icerik: (
              <PersonelGelisim kurumId={kurumId} sinifOrtalamasi={yetki.sinifOrtalamasiGorur} />
            ),
          },
          ...(yetki.denemeAyariYazabilir
            ? [
                {
                  anahtar: 'ayarlar',
                  etiket: t('ogrenme.deneme.sekme.ayarlar'),
                  icerik: <DenemeAyarlari kurumId={kurumId} bildirim={setBildirim} />,
                },
              ]
            : []),
        ]}
      />
    </>
  );
}

function PersonelGelisim({
  kurumId,
  sinifOrtalamasi,
}: {
  kurumId: string;
  sinifOrtalamasi: boolean;
}) {
  const ogrenciler = useOgrenciler(kurumId);
  const gruplar = useGruplar(kurumId);
  const [ogrenciId, setOgrenciId] = useState('');
  const [grupId, setGrupId] = useState('');
  const { kural, secici } = useKuralSecimi(kurumId);

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 rounded-buyuk border border-kenar bg-yuzey p-4 sm:grid-cols-3">
        <OgrenciSecimi deger={ogrenciId} degisti={setOgrenciId} ogrenciler={ogrenciler.liste} />
        {secici}
        {sinifOrtalamasi ? (
          <Alan etiket={t('ogrenme.deneme.sinifOrtalamasiGrup')}>
            {(o) => (
              <Secim
                {...o}
                value={grupId}
                onChange={(e) => {
                  setGrupId(e.target.value);
                }}
              >
                <option value="">{t('ogrenme.deneme.grupSecmeden')}</option>
                {gruplar.secenekler.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.etiket}
                  </option>
                ))}
              </Secim>
            )}
          </Alan>
        ) : null}
      </div>
      <section
        aria-label={t('ogrenme.deneme.gelisim')}
        className="rounded-buyuk border border-kenar bg-yuzey p-4"
      >
        <h2 className="mb-3 text-base font-semibold">{t('ogrenme.deneme.gelisim')}</h2>
        {ogrenciId === '' ? (
          <p className="text-sm text-metin-ikincil">{t('ogrenme.deneme.gelisimOgrenciSec')}</p>
        ) : (
          <GelisimPaneli kurumId={kurumId} ogrenciId={ogrenciId} kural={kural} />
        )}
      </section>
      {sinifOrtalamasi && grupId !== '' ? (
        <section className="rounded-buyuk border border-kenar bg-yuzey p-4">
          <h2 className="mb-3 text-base font-semibold">{t('ogrenme.deneme.sinifOrtalamasi')}</h2>
          <SinifOzeti kurumId={kurumId} grupId={grupId} kural={kural} />
        </section>
      ) : null}
    </div>
  );
}

function DenemeAyarlari({
  kurumId,
  bildirim,
}: {
  kurumId: string;
  bildirim: (b: Bildirim) => void;
}) {
  const ayar = useDenemeAyarlari(kurumId);
  const yenile = useOgrenmeYenile(kurumId);
  const yaz = useMutation({
    mutationFn: (acik: boolean) =>
      ogrenmeIstek(`kurumlar/${kurumId}/deneme-ayarlari`, {
        yontem: 'PUT',
        govde: { ogrenci_deneme_girisi: acik },
      }),
    onSuccess: async () => {
      await yenile();
      bildirim(basari(t('ogrenme.deneme.ayarKaydedildi')));
    },
    onError: (h) => {
      bildirim(basarisiz(h));
    },
  });
  if (ayar.isPending) return <ListeIskeleti satir={1} />;
  if (ayar.isError) {
    return (
      <HataDurumu
        baslik={t('ogrenme.deneme.ayarYuklenemedi')}
        aciklama={hataMesaji(ayar.error)}
        tekrarDene={() => void ayar.refetch()}
      />
    );
  }
  return (
    <section
      aria-label={t('ogrenme.deneme.sekme.ayarlar')}
      className="rounded-buyuk border border-kenar bg-yuzey p-4"
    >
      <label className="flex min-h-11 cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={ayar.data.ogrenci_deneme_girisi}
          disabled={yaz.isPending}
          onChange={(e) => {
            yaz.mutate(e.target.checked);
          }}
          className="mt-0.5 size-5 accent-[var(--birincil)]"
        />
        <span>
          <span className="block font-medium">{t('ogrenme.deneme.ayarOgrenciGirisi')}</span>
          <span className="block text-sm text-metin-ikincil">
            {t('ogrenme.deneme.ayarOgrenciGirisiAciklama')}
          </span>
        </span>
      </label>
    </section>
  );
}

// --- Ogrenci ----------------------------------------------------------------------------------

function OgrenciDeneme() {
  const { uyelik } = useKurum();
  const kurumId = uyelik.kurumId;
  const ayar = useDenemeAyarlari(kurumId);
  const [sekme, setSekme] = useState('denemelerim');
  const [bildirim, setBildirim] = useState<Bildirim>(null);
  const { kural, secici } = useKuralSecimi(kurumId);
  const girisAcik = ayar.data?.ogrenci_deneme_girisi ?? true;

  return (
    <>
      <SayfaBasligi
        baslik={t('ogrenme.deneme.denemelerim')}
        aciklama={t('ogrenme.deneme.ogrenciAciklama')}
      />
      <div className="mb-4">
        <BildirimKutusu bildirim={bildirim} />
      </div>
      <Sekmeler
        deger={sekme}
        degisti={(s) => {
          setSekme(s);
          setBildirim(null);
        }}
        etiket={t('ogrenme.deneme.denemelerim')}
        sekmeler={[
          {
            anahtar: 'denemelerim',
            etiket: t('ogrenme.deneme.sekme.denemelerim'),
            icerik: <DenemelerimListesi kurumId={kurumId} />,
          },
          {
            anahtar: 'giris',
            etiket: t('ogrenme.deneme.sekme.sonucGir'),
            icerik: girisAcik ? (
              <DenemeFormu
                kurumId={kurumId}
                ogrenciModu
                bitti={(m) => {
                  setBildirim(basari(m));
                  setSekme('denemelerim');
                }}
              />
            ) : (
              <section className="rounded-buyuk border border-kenar bg-yuzey">
                <BosDurum
                  className="py-14"
                  ikon={BookOpenCheck}
                  baslik={t('ogrenme.deneme.girisKapali')}
                  aciklama={t('ogrenme.deneme.girisKapaliAciklama')}
                />
              </section>
            ),
          },
          {
            anahtar: 'gelisim',
            etiket: t('ogrenme.deneme.sekme.gelisimim'),
            icerik: (
              <div className="flex flex-col gap-4">
                <div className="max-w-xs">{secici}</div>
                <section
                  aria-label={t('ogrenme.deneme.gelisimim')}
                  className="rounded-buyuk border border-kenar bg-yuzey p-4"
                >
                  <h2 className="mb-3 text-base font-semibold">{t('ogrenme.deneme.gelisimim')}</h2>
                  <GelisimPaneli kurumId={kurumId} ogrenciId={uyelik.id} kural={kural} />
                </section>
              </div>
            ),
          },
        ]}
      />
    </>
  );
}

const ONAY_TONU = { bekliyor: 'uyari', onaylandi: 'basari', reddedildi: 'hata' } as const;

function DenemelerimListesi({ kurumId }: { kurumId: string }) {
  const veri = useDenemelerim(kurumId, '');
  if (veri.isPending) return <ListeIskeleti satir={3} />;
  if (veri.isError) {
    return (
      <HataDurumu
        baslik={t('ogrenme.deneme.yuklenemedi')}
        aciklama={hataMesaji(veri.error)}
        tekrarDene={() => void veri.refetch()}
      />
    );
  }
  return (
    <section
      aria-label={t('ogrenme.deneme.denemelerim')}
      className="rounded-buyuk border border-kenar bg-yuzey"
    >
      {veri.denemeler.length === 0 ? (
        <BosDurum
          className="py-14"
          ikon={BookOpenCheck}
          baslik={t('ogrenme.deneme.ogrenciBos')}
          aciklama={t('ogrenme.deneme.ogrenciBosAciklama')}
        />
      ) : (
        <ul className="divide-y divide-kenar">
          {veri.denemeler.map((d: DenemeTipi) => (
            <li key={d.id} className="flex flex-col gap-1.5 px-4 py-3">
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{d.ad}</p>
                  <p className="text-sm text-metin-ikincil">
                    {d.kural_kodu.toUpperCase()} · {gunEtiketi(d.sinav_tarihi)}
                  </p>
                </div>
                <p className="text-sm font-semibold">
                  {t('ogrenme.deneme.toplamNetDeger', { net: netMetni(d.toplam_net) })}
                </p>
                <Rozet ton={ONAY_TONU[d.onay_durumu]}>
                  {t(`ogrenme.deneme.onay.${d.onay_durumu}`)}
                </Rozet>
              </div>
              {d.onay_durumu === 'reddedildi' && d.red_nedeni ? (
                <p className="rounded-orta bg-hata-yumusak px-3 py-2 text-sm text-hata">
                  {t('ogrenme.deneme.redNedeniGoster', { neden: d.red_nedeni })}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <DahaFazla
        daha={veri.hasNextPage}
        yukleniyor={veri.isFetchingNextPage}
        yukle={() => void veri.fetchNextPage()}
      />
    </section>
  );
}
