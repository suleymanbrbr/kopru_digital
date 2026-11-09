'use client';

import { OgrenciFinansYanitSema, type DersTipi } from '@kopru/contracts';
import { t } from '@kopru/i18n';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, ChevronLeft, ChevronRight, Plus, Repeat, Video } from 'lucide-react';
import { memo, useMemo, useState } from 'react';

import { DersAyrintisi } from './ders-ayrintisi';
import { DersFormu, type TelafiKaynagi } from './ders-formu';
import { useHaftaDersleri } from './ders-verisi';

import { BosDurum } from '@/components/bos-durum';
import { HataDurumu } from '@/components/hata-durumu';
import { BildirimKutusu, ListeIskeleti, type Bildirim } from '@/components/hesap/ortak';
import { BolumKapisi } from '@/components/kabuk/bolum-yer-tutucu';
import { SayfaBasligi } from '@/components/kabuk/sayfa-basligi';
import { Alan } from '@/components/operasyon/ortak';
import { Dugme } from '@/components/ui/button';
import { Rozet } from '@/components/ui/rozet';
import { Secim } from '@/components/ui/secim';
import { YoklamaFormu } from '@/components/yoklama/yoklama-formu';
import { useKurum } from '@/kurum/baglam';
import { hataMesaji } from '@/lib/api';
import { bransAdi } from '@/lib/bransler';
import { cn } from '@/lib/cn';
import { finansIstek } from '@/lib/hesap-istek';
import { useGruplar, useOgretmenler, useSaatDilimi } from '@/lib/operasyon-verisi';
import {
  bugunYerel,
  gunEtiketi,
  haftaBasi,
  haftaEtiketi,
  haftaGunleri,
  saatAraligi,
  tarihEkle,
  yerelTarih,
} from '@/lib/saat';
import { yenidenDene } from '@/lib/sayfali-sorgu';
import { izinli } from '@/lib/yetki';

export function TakvimEkrani() {
  return (
    <BolumKapisi bolum="takvim">
      <TakvimIcerigi />
    </BolumKapisi>
  );
}

function TakvimIcerigi() {
  const { uyelik, rol, acikModuller } = useKurum();
  const kurumId = uyelik.kurumId;
  const personel = rol !== 'ogrenci';
  const yonetim = rol === 'sahip' || rol === 'yonetici';
  const yazabilir = izinli(rol, 'takvim.yaz');
  const yoklamaAcik = acikModuller.includes('yoklama') && izinli(rol, 'yoklama.yaz');

  const { saatDilimi, hazir } = useSaatDilimi(kurumId);
  const bugun = bugunYerel(saatDilimi);
  const [secilen, setSecilen] = useState<string | null>(null);
  const hafta = secilen ?? haftaBasi(bugun);
  const [ogretmenId, setOgretmenId] = useState('');
  const [grupId, setGrupId] = useState('');

  const gruplar = useGruplar(kurumId, personel);
  const ogretmenler = useOgretmenler(kurumId, yonetim);
  const veri = useHaftaDersleri({
    kurumId,
    haftaBasi: hafta,
    saatDilimi,
    etkin: hazir,
    ...(ogretmenId ? { ogretmenId } : {}),
    ...(grupId ? { grupId } : {}),
  });

  const [bildirim, setBildirim] = useState<Bildirim>(null);
  const [formAcik, setFormAcik] = useState(false);
  const [formTarih, setFormTarih] = useState(bugun);
  const [telafi, setTelafi] = useState<TelafiKaynagi | null>(null);
  const [ayrintiId, setAyrintiId] = useState<string | null>(null);
  const [yoklamaId, setYoklamaId] = useState<string | null>(null);

  const gunler = useMemo(() => haftaGunleri(hafta), [hafta]);
  const gunlere = useMemo(() => {
    const harita = new Map<string, DersTipi[]>(gunler.map((g) => [g, []]));
    for (const d of veri.dersler) harita.get(yerelTarih(d.baslangic_at, saatDilimi))?.push(d);
    return harita;
  }, [veri.dersler, gunler, saatDilimi]);

  const dersEkle = (tarih: string) => {
    setTelafi(null);
    setFormTarih(tarih);
    setFormAcik(true);
  };

  return (
    <>
      <SayfaBasligi
        baslik={t('nav.takvim')}
        aciklama={
          personel ? t('operasyon.takvim.aciklamaPersonel') : t('operasyon.takvim.aciklamaOgrenci')
        }
      >
        {yazabilir ? (
          <Dugme
            onClick={() => {
              dersEkle(gunler.includes(bugun) ? bugun : hafta);
            }}
          >
            <Plus aria-hidden />
            {t('operasyon.takvim.dersEkle')}
          </Dugme>
        ) : null}
      </SayfaBasligi>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <div
          role="group"
          aria-label={t('operasyon.takvim.haftaGezgini')}
          className="flex items-center gap-2"
        >
          <Dugme
            gorunum="ikincil"
            boyut="ikon"
            aria-label={t('operasyon.takvim.onceki')}
            onClick={() => {
              setSecilen(tarihEkle(hafta, -7));
            }}
          >
            <ChevronLeft aria-hidden />
          </Dugme>
          <p className="min-w-44 text-center text-sm font-semibold" aria-live="polite">
            {haftaEtiketi(hafta)}
          </p>
          <Dugme
            gorunum="ikincil"
            boyut="ikon"
            aria-label={t('operasyon.takvim.sonraki')}
            onClick={() => {
              setSecilen(tarihEkle(hafta, 7));
            }}
          >
            <ChevronRight aria-hidden />
          </Dugme>
          <Dugme
            gorunum="hayalet"
            onClick={() => {
              setSecilen(null);
            }}
          >
            {t('operasyon.takvim.buHafta')}
          </Dugme>
        </div>
        {personel ? (
          <div className="flex flex-1 flex-wrap gap-3 sm:justify-end">
            {yonetim ? (
              <Alan etiket={t('operasyon.takvim.ogretmenSuzgec')} className="min-w-44">
                {(o) => (
                  <Secim
                    {...o}
                    value={ogretmenId}
                    onChange={(e) => {
                      setOgretmenId(e.target.value);
                    }}
                  >
                    <option value="">{t('operasyon.ortak.tumu')}</option>
                    {ogretmenler.liste.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.ad || t('operasyon.ortak.adsiz')}
                      </option>
                    ))}
                  </Secim>
                )}
              </Alan>
            ) : null}
            <Alan etiket={t('operasyon.takvim.grupSuzgec')} className="min-w-44">
              {(o) => (
                <Secim
                  {...o}
                  value={grupId}
                  onChange={(e) => {
                    setGrupId(e.target.value);
                  }}
                >
                  <option value="">{t('operasyon.ortak.tumu')}</option>
                  {gruplar.secenekler.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.etiket}
                    </option>
                  ))}
                </Secim>
              )}
            </Alan>
          </div>
        ) : null}
      </div>

      {!personel && acikModuller.includes('finans') ? <KalanDers kurumId={kurumId} /> : null}
      <BildirimKutusu bildirim={bildirim} />

      <section
        aria-label={t('operasyon.takvim.haftaTablo', { hafta: haftaEtiketi(hafta) })}
        className="mt-4 rounded-buyuk border border-kenar bg-yuzey"
      >
        {veri.isPending ? (
          <ListeIskeleti satir={5} />
        ) : veri.isError ? (
          <HataDurumu
            baslik={t('operasyon.takvim.yuklenemedi')}
            aciklama={hataMesaji(veri.error)}
            tekrarDene={() => void veri.refetch()}
          />
        ) : veri.dersler.length === 0 ? (
          <BosDurum
            className="py-14"
            ikon={CalendarDays}
            baslik={personel ? t('operasyon.takvim.bos') : t('operasyon.takvim.bosOgrenci')}
            aciklama={
              personel
                ? t('operasyon.takvim.bosAciklama')
                : t('operasyon.takvim.bosOgrenciAciklama')
            }
          >
            {yazabilir ? (
              <Dugme
                onClick={() => {
                  dersEkle(gunler.includes(bugun) ? bugun : hafta);
                }}
              >
                <Plus aria-hidden />
                {t('operasyon.takvim.dersEkle')}
              </Dugme>
            ) : null}
          </BosDurum>
        ) : (
          <ol className="divide-y divide-kenar">
            {gunler.map((gun) => (
              <GunSatiri
                key={gun}
                gun={gun}
                bugunMu={gun === bugun}
                dersler={gunlere.get(gun) ?? []}
                saatDilimi={saatDilimi}
                grupAdlari={gruplar.adlar}
                ogretmenAdlari={ogretmenler.adlar}
                ac={setAyrintiId}
                yonetim={yonetim}
              />
            ))}
          </ol>
        )}
      </section>

      <DersFormu
        acik={formAcik}
        degisti={setFormAcik}
        kurumId={kurumId}
        saatDilimi={saatDilimi}
        gruplar={gruplar.secenekler}
        ogretmenler={ogretmenler.liste}
        ogretmenSecilebilir={yonetim}
        varsayilanTarih={formTarih}
        telafi={telafi}
        bitti={setBildirim}
      />
      <DersAyrintisi
        kurumId={kurumId}
        saatDilimi={saatDilimi}
        grupAdlari={gruplar.adlar}
        ogretmenAdlari={ogretmenler.adlar}
        yazabilir={yazabilir}
        yonetim={yonetim}
        yoklamaAcik={yoklamaAcik}
        dersId={ayrintiId}
        kapat={() => {
          setAyrintiId(null);
        }}
        yoklamaAl={setYoklamaId}
        telafiEkle={(kaynak) => {
          setTelafi(kaynak);
          setFormTarih(bugun);
          setFormAcik(true);
        }}
        bildir={setBildirim}
      />
      <YoklamaFormu
        kurumId={kurumId}
        dersId={yoklamaId}
        saatDilimi={saatDilimi}
        grupAdlari={gruplar.adlar}
        kapat={() => {
          setYoklamaId(null);
        }}
        bildir={setBildirim}
      />
    </>
  );
}

function KalanDers({ kurumId }: { kurumId: string }) {
  const { uyelik } = useKurum();
  const q = useQuery({
    queryKey: ['finans', kurumId, 'kendi-kalan-ders', uyelik.id],
    retry: yenidenDene,
    queryFn: () =>
      finansIstek(`kurumlar/${kurumId}/ogrenciler/${uyelik.id}/finans`, {
        sema: OgrenciFinansYanitSema,
      }),
  });
  if (q.data?.gorunum !== 'ogrenci' || q.data.kalan_kredi === null) return null;
  return (
    <p className="mb-2 inline-flex rounded-full bg-vurgu-yumusak px-3.5 py-1.5 text-sm font-medium">
      {t('operasyon.takvim.kalanDers', { sayi: q.data.kalan_kredi })}
    </p>
  );
}

const GunSatiri = memo(function GunSatiri({
  gun,
  bugunMu,
  dersler,
  saatDilimi,
  grupAdlari,
  ogretmenAdlari,
  ac,
  yonetim,
}: {
  gun: string;
  bugunMu: boolean;
  dersler: DersTipi[];
  saatDilimi: string;
  grupAdlari: ReadonlyMap<string, { etiket: string }>;
  ogretmenAdlari: ReadonlyMap<string, string>;
  ac: (id: string) => void;
  yonetim: boolean;
}) {
  return (
    <li className="flex flex-col gap-2 p-3 sm:flex-row sm:gap-4 sm:p-4">
      <h2
        className={cn(
          'w-full shrink-0 text-sm font-semibold sm:w-36 sm:pt-2',
          bugunMu && 'text-birincil',
        )}
      >
        {gunEtiketi(gun)}
        {bugunMu ? <span className="ml-2 text-xs font-medium">({t('nav.bugun')})</span> : null}
      </h2>
      {dersler.length === 0 ? (
        <p className="text-sm text-metin-ikincil sm:pt-2">{t('operasyon.takvim.bosGun')}</p>
      ) : (
        <ul className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2">
          {dersler.map((d) => (
            <li key={d.id} className="min-w-0">
              <button
                type="button"
                onClick={() => {
                  ac(d.id);
                }}
                className={cn(
                  'flex min-h-14 w-full flex-col gap-0.5 rounded-orta border border-kenar bg-yuzey-ikincil px-3 py-2 text-left transition-colors hover:border-birincil',
                )}
              >
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold">
                  <span className={cn(d.durum === 'iptal' && 'line-through')}>
                    {saatAraligi(d.baslangic_at, d.bitis_at, saatDilimi)}
                  </span>
                  {d.durum === 'iptal' ? (
                    <Rozet ton="notr">{t('operasyon.takvim.rozet.iptal')}</Rozet>
                  ) : null}
                  {d.durum === 'tamamlandi' ? (
                    <Rozet ton="basari">{t('operasyon.takvim.durum.tamamlandi')}</Rozet>
                  ) : null}
                  {d.telafi ? <Rozet>{t('operasyon.takvim.rozet.telafi')}</Rozet> : null}
                  {d.seri_id ? (
                    <Repeat
                      className="size-3.5 text-metin-ikincil"
                      aria-label={t('operasyon.takvim.rozet.seri')}
                      role="img"
                    />
                  ) : null}
                  {d.online_baglanti ? (
                    <Video className="size-3.5 text-metin-ikincil" aria-hidden />
                  ) : null}
                </span>
                <span className="truncate text-sm">
                  {grupAdlari.get(d.grup_id)?.etiket ?? bransAdi(d.brans_kodu)}
                  {d.baslik ? ` · ${d.baslik}` : ''}
                </span>
                {yonetim && ogretmenAdlari.get(d.ogretmen_id) ? (
                  <span className="truncate text-xs text-metin-ikincil">
                    {ogretmenAdlari.get(d.ogretmen_id)}
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
});
