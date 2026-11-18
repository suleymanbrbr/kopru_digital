'use client';

import {
  DUYURU_BASLIK_EN_FAZLA,
  DUYURU_GOVDE_EN_FAZLA,
  type Duyuru,
  type DuyuruAliciRol,
} from '@kopru/contracts';
import { t } from '@kopru/i18n';
import { useId, useState } from 'react';

import { OnayKutusuSatiri } from './onay-kutusu-satiri';

import { Dugme } from '@/components/ui/button';
import { Girdi, Etiket } from '@/components/ui/input';
import { MetinAlani } from '@/components/ui/metin-alani';
import { OnayPenceresi, Pencere } from '@/components/ui/pencere';
import { Secim } from '@/components/ui/secim';
import { Uyari } from '@/components/ui/uyari';
import { useKurum } from '@/kurum/baglam';
import { yayinOnayMetni } from '@/lib/duyuru/etiket';
import {
  BOS_FORM,
  duyurudenForm,
  formHatalari,
  formdanGovde,
  type DuyuruFormDegerleri,
  type FormHatalari,
} from '@/lib/duyuru/form';
import {
  duyuruHataMesaji,
  useDuyuruGuncelle,
  useDuyuruOlustur,
  useDuyuruYayinla,
} from '@/lib/duyuru/veri';
import { useGruplar } from '@/lib/operasyon-verisi';

export interface FormSonucu {
  tur: 'taslak' | 'yayin';
  duyuru: Duyuru;
}

/**
 * Yeni duyuru (ya da taslagi duzenle) penceresi. Yazar: sahip/yonetici (grup ya da tum kurum) ve ogretmen
 * (yalniz atandigi gruplar; liste kapsami sunucuda). Kademe hedefi yok: kademe listeleme ucu henuz yok.
 */
export function DuyuruFormu(props: {
  acik: boolean;
  kapat: () => void;
  /** Verilirse bu taslak duzenlenir. */
  taslak?: Duyuru | undefined;
  tamam: (sonuc: FormSonucu) => void;
}) {
  // Her acilista temiz durumla yeniden kurulur (efektle sifirlama yok).
  return props.acik ? <FormIcerigi {...props} /> : null;
}

function FormIcerigi({
  acik,
  kapat,
  taslak,
  tamam,
}: {
  acik: boolean;
  kapat: () => void;
  taslak?: Duyuru | undefined;
  tamam: (sonuc: FormSonucu) => void;
}) {
  const { uyelik, rol } = useKurum();
  const kurumId = uyelik.kurumId;
  const yonetim = rol === 'sahip' || rol === 'yonetici';
  const gruplar = useGruplar(kurumId, acik);
  const olustur = useDuyuruOlustur(kurumId);
  const guncelle = useDuyuruGuncelle(kurumId);
  const yayinla = useDuyuruYayinla(kurumId);

  const [ham, setD] = useState<DuyuruFormDegerleri>(() =>
    taslak ? duyurudenForm(taslak) : BOS_FORM,
  );
  const [hatalar, setHatalar] = useState<FormHatalari>({});
  const [sunucuHatasi, setSunucuHatasi] = useState<string | null>(null);
  const [onay, setOnay] = useState(false);
  /** Taslak kaydedildiyse (yayin basarisiz olsa da) tekrar olusturmamak icin kimligi tutulur. */
  const [taslakId, setTaslakId] = useState<string | null>(taslak?.id ?? null);
  const kimlik = useId();

  // Tek secenek varsa (ogretmenin tek grubu) otomatik secilir.
  const gruplarListe = gruplar.secenekler;
  const tekGrup = gruplarListe.length === 1 ? (gruplarListe[0]?.id ?? '') : '';
  const d = ham.grupId === '' && tekGrup !== '' ? { ...ham, grupId: tekGrup } : ham;

  const bekliyor = olustur.isPending || guncelle.isPending || yayinla.isPending;
  const alan = <K extends keyof DuyuruFormDegerleri>(k: K, v: DuyuruFormDegerleri[K]) => {
    setD((onceki) => ({ ...onceki, [k]: v }));
  };
  const rolDegistir = (r: DuyuruAliciRol, secili: boolean) => {
    setD((onceki) => ({
      ...onceki,
      roller: secili
        ? [...onceki.roller.filter((x) => x !== r), r]
        : onceki.roller.filter((x) => x !== r),
    }));
  };

  /** Taslagi olusturur ya da gunceller; kimligi dondurur. */
  async function taslagiKaydet(): Promise<Duyuru> {
    const govde = formdanGovde(d, kurumId);
    if (taslakId) {
      return guncelle.mutateAsync({ id: taslakId, govde });
    }
    const yeni = await olustur.mutateAsync(govde);
    setTaslakId(yeni.id);
    return yeni;
  }

  async function taslakKaydet() {
    const h = formHatalari(d);
    setHatalar(h);
    if (Object.keys(h).length > 0) return;
    setSunucuHatasi(null);
    try {
      tamam({ tur: 'taslak', duyuru: await taslagiKaydet() });
    } catch (hata) {
      setSunucuHatasi(duyuruHataMesaji(hata));
    }
  }

  function yayinaHazirla() {
    const h = formHatalari(d);
    setHatalar(h);
    if (Object.keys(h).length > 0) return;
    setSunucuHatasi(null);
    setOnay(true);
  }

  async function yayinla_() {
    try {
      const kayitli = await taslagiKaydet();
      const yayinda = await yayinla.mutateAsync(kayitli.id);
      setOnay(false);
      tamam({ tur: 'yayin', duyuru: yayinda });
    } catch (hata) {
      setOnay(false);
      setSunucuHatasi(duyuruHataMesaji(hata));
    }
  }

  const secilenGrup = gruplarListe.find((g) => g.id === d.grupId);
  const onayMetni = yayinOnayMetni({
    baslik: d.baslik.trim(),
    hedef: d.hedefTuru === 'grup' ? (secilenGrup?.etiket ?? '') : t('duyurular.hedefKurum'),
    roller: d.roller,
    uyeSayisi: d.hedefTuru === 'grup' && secilenGrup ? secilenGrup.uyeSayisi : null,
  });

  const baslikId = `${kimlik}-baslik`;
  const govdeId = `${kimlik}-govde`;
  const hedefId = `${kimlik}-hedef`;
  const grupId = `${kimlik}-grup`;
  const bitisId = `${kimlik}-bitis`;

  return (
    <>
      <Pencere
        acik={acik}
        degisti={(a) => {
          if (!a && !bekliyor) kapat();
        }}
        baslik={taslak ? t('duyurular.form.duzenleBaslik') : t('duyurular.form.yeniBaslik')}
        aciklama={t('duyurular.form.aciklama')}
        genis
      >
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            yayinaHazirla();
          }}
        >
          {sunucuHatasi ? <Uyari>{sunucuHatasi}</Uyari> : null}

          <div className="flex flex-col gap-1.5">
            <Etiket htmlFor={baslikId}>{t('duyurular.form.baslik')}</Etiket>
            <Girdi
              id={baslikId}
              value={d.baslik}
              maxLength={DUYURU_BASLIK_EN_FAZLA}
              aria-invalid={hatalar.baslik ? true : undefined}
              aria-describedby={`${baslikId}-yardim`}
              onChange={(e) => {
                alan('baslik', e.target.value);
              }}
            />
            <p id={`${baslikId}-yardim`} className="flex justify-between gap-2 text-sm">
              <span className="text-hata">{hatalar.baslik ? t(hatalar.baslik) : null}</span>
              <span className="text-metin-ikincil" aria-live="polite">
                {t('duyurular.form.baslikSayac', {
                  n: d.baslik.length,
                  en: DUYURU_BASLIK_EN_FAZLA,
                })}
              </span>
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Etiket htmlFor={govdeId}>{t('duyurular.form.govde')}</Etiket>
            <MetinAlani
              id={govdeId}
              rows={6}
              value={d.govde}
              maxLength={DUYURU_GOVDE_EN_FAZLA}
              aria-invalid={hatalar.govde ? true : undefined}
              aria-describedby={`${govdeId}-yardim`}
              onChange={(e) => {
                alan('govde', e.target.value);
              }}
            />
            <p id={`${govdeId}-yardim`} className="flex flex-wrap justify-between gap-x-2 text-sm">
              <span className={hatalar.govde ? 'text-hata' : 'text-metin-ikincil'}>
                {hatalar.govde ? t(hatalar.govde) : t('duyurular.form.govdeIpucu')}
              </span>
              <span className="text-metin-ikincil" aria-live="polite">
                {t('duyurular.form.govdeSayac', { n: d.govde.length, en: DUYURU_GOVDE_EN_FAZLA })}
              </span>
            </p>
          </div>

          {yonetim ? (
            <div className="flex flex-col gap-1.5">
              <Etiket htmlFor={hedefId}>{t('duyurular.form.hedefTuru')}</Etiket>
              <Secim
                id={hedefId}
                value={d.hedefTuru}
                onChange={(e) => {
                  alan('hedefTuru', e.target.value === 'kurum' ? 'kurum' : 'grup');
                }}
              >
                <option value="grup">{t('duyurular.form.hedefGrup')}</option>
                <option value="kurum">{t('duyurular.form.hedefKurum')}</option>
              </Secim>
            </div>
          ) : null}

          {d.hedefTuru === 'grup' ? (
            <div className="flex flex-col gap-1.5">
              <Etiket htmlFor={grupId}>{t('duyurular.form.grup')}</Etiket>
              <Secim
                id={grupId}
                value={d.grupId}
                aria-invalid={hatalar.grup ? true : undefined}
                aria-describedby={`${grupId}-hata`}
                onChange={(e) => {
                  alan('grupId', e.target.value);
                }}
              >
                <option value="">{t('duyurular.form.grupSec')}</option>
                {gruplarListe.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.etiket}
                  </option>
                ))}
              </Secim>
              <p id={`${grupId}-hata`} className="text-sm text-hata">
                {hatalar.grup
                  ? t(hatalar.grup)
                  : !gruplar.yukleniyor && gruplarListe.length === 0
                    ? t('duyurular.form.grupYok')
                    : null}
              </p>
            </div>
          ) : null}

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium">{t('duyurular.form.roller')}</legend>
            <OnayKutusuSatiri
              id={`${kimlik}-rol-ogrenci`}
              etiket={t('duyurular.form.rolOgrenci')}
              secili={d.roller.includes('ogrenci')}
              degisti={(s) => {
                rolDegistir('ogrenci', s);
              }}
            />
            <OnayKutusuSatiri
              id={`${kimlik}-rol-ogretmen`}
              etiket={t('duyurular.form.rolOgretmen')}
              secili={d.roller.includes('ogretmen')}
              degisti={(s) => {
                rolDegistir('ogretmen', s);
              }}
            />
            {hatalar.roller ? <p className="text-sm text-hata">{t(hatalar.roller)}</p> : null}
          </fieldset>

          <div className="flex flex-col gap-1.5">
            <Etiket htmlFor={bitisId}>{t('duyurular.form.bitis')}</Etiket>
            <Girdi
              id={bitisId}
              type="datetime-local"
              value={d.bitis}
              aria-invalid={hatalar.bitis ? true : undefined}
              aria-describedby={`${bitisId}-yardim`}
              className="sm:max-w-xs"
              onChange={(e) => {
                alan('bitis', e.target.value);
              }}
            />
            <p
              id={`${bitisId}-yardim`}
              className={hatalar.bitis ? 'text-sm text-hata' : 'text-sm text-metin-ikincil'}
            >
              {hatalar.bitis ? t(hatalar.bitis) : t('duyurular.form.bitisAciklama')}
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <OnayKutusuSatiri
              id={`${kimlik}-sabit`}
              etiket={t('duyurular.form.sabitle')}
              secili={d.sabit}
              degisti={(s) => {
                alan('sabit', s);
              }}
            />
            <OnayKutusuSatiri
              id={`${kimlik}-push`}
              etiket={t('duyurular.form.push')}
              aciklama={t('duyurular.form.pushAciklama')}
              secili={d.push}
              degisti={(s) => {
                alan('push', s);
              }}
            />
          </div>

          <div className="mt-1 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Dugme
              type="button"
              gorunum="ikincil"
              disabled={bekliyor}
              onClick={() => void taslakKaydet()}
            >
              {bekliyor ? t('duyurular.form.kaydediliyor') : t('duyurular.form.taslakKaydet')}
            </Dugme>
            <Dugme type="submit" disabled={bekliyor}>
              {t('duyurular.form.yayinla')}
            </Dugme>
          </div>
        </form>
      </Pencere>
      <OnayPenceresi
        acik={onay}
        degisti={(a) => {
          if (!bekliyor) setOnay(a);
        }}
        baslik={t('duyurular.onay.baslik')}
        aciklama={onayMetni}
        onayEtiketi={t('duyurular.onay.onayla')}
        bekliyor={bekliyor}
        onay={() => void yayinla_()}
      />
    </>
  );
}
