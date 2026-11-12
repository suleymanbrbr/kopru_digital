'use client';

import {
  GeriBildirimKaydetYanitSema,
  type GeriBildirimBekleyenDersSema,
  type GeriBildirimDeger,
} from '@kopru/contracts';
import { t } from '@kopru/i18n';
import { useMutation } from '@tanstack/react-query';
import { CircleCheck } from 'lucide-react';
import { useMemo, useState, type SyntheticEvent } from 'react';
import type { z } from 'zod';

import { DEGER_IKONLARI } from './deger-rozeti';

import { KonuSecici } from '@/components/ogrenme/konu-secici';
import { Alan } from '@/components/operasyon/ortak';
import { Dugme } from '@/components/ui/button';
import { Kart } from '@/components/ui/kart';
import { MetinAlani } from '@/components/ui/metin-alani';
import { Uyari } from '@/components/ui/uyari';
import { useKurum } from '@/kurum/baglam';
import { hataMesaji } from '@/lib/api';
import { bransAdi } from '@/lib/bransler';
import { cn } from '@/lib/cn';
import { dersIstek } from '@/lib/hesap-istek';
import { GERI_BILDIRIM_DEGERLERI, degistirilebilirMi } from '@/lib/kayit/geri-bildirim';
import { useGeriBildirimBekleyen } from '@/lib/kayit/veri';
import { useSaatDilimi } from '@/lib/operasyon-verisi';
import { gunEtiketi, saatAraligi, yerelTarih, yerelSaat } from '@/lib/saat';

type BekleyenDers = z.infer<typeof GeriBildirimBekleyenDersSema>;

/**
 * Ogrenci "Bugun": bekleyen ders sonu geri bildirimi. Tek dokunusla cevaplanir; konu ve not istege
 * bagli, `son_verme_at`e kadar degistirilebilir. Bekleyen yoksa kart hic gosterilmez.
 */
export function BugunGeriBildirimKarti() {
  const { uyelik, acikModuller, rol } = useKurum();
  const kurumId = uyelik.kurumId;
  const etkin = rol === 'ogrenci' && acikModuller.includes('geri_bildirim');
  const q = useGeriBildirimBekleyen(kurumId, etkin);
  /**
   * Ilk cevaptan sonra liste sabitlenir: cevaplanan ders sunucunun bekleyen listesinden dusse de kartta
   * ayni sirada kalir (degistirmek icin); sira atlamaz.
   */
  const [sabit, setSabit] = useState<BekleyenDers[] | null>(null);
  const dersler = useMemo(() => {
    const liste = q.data?.dersler ?? [];
    if (sabit === null) return liste;
    const kimlikler = new Set(sabit.map((d) => d.ders_id));
    return [...sabit, ...liste.filter((d) => !kimlikler.has(d.ders_id))];
  }, [q.data, sabit]);

  if (!etkin || q.isPending || q.isError || dersler.length === 0) return null;

  const cevaplandi = () => {
    setSabit((onceki) => onceki ?? dersler);
  };

  return (
    <Kart
      aria-labelledby="geri-bildirim-baslik"
      className="flex flex-col border-birincil/40 bg-birincil-yumusak md:col-span-2"
    >
      <h2 id="geri-bildirim-baslik" className="px-5 pt-4 text-base font-semibold">
        {t('kayitGeriBildirim.geriBildirim.kartBaslik')}
      </h2>
      <ul className="divide-y divide-kenar">
        {dersler.map((d) => (
          <GeriBildirimOgesi key={d.ders_id} kurumId={kurumId} ders={d} cevaplandi={cevaplandi} />
        ))}
      </ul>
    </Kart>
  );
}

function GeriBildirimOgesi({
  kurumId,
  ders: d,
  cevaplandi,
}: {
  kurumId: string;
  ders: BekleyenDers;
  cevaplandi: () => void;
}) {
  const { saatDilimi } = useSaatDilimi(kurumId);
  const [deger, setDeger] = useState<GeriBildirimDeger | null>(null);
  const [ayrintiAcik, setAyrintiAcik] = useState(false);
  const [konuId, setKonuId] = useState<string | null>(null);
  const [not, setNot] = useState('');
  const [ayrintiKaydedildi, setAyrintiKaydedildi] = useState(false);
  const degistirilebilir = degistirilebilirMi(d.son_verme_at);

  const kaydet = useMutation({
    mutationFn: (g: { deger: GeriBildirimDeger; ayrinti: boolean }) =>
      dersIstek(`kurumlar/${kurumId}/dersler/${d.ders_id}/geri-bildirim`, {
        yontem: 'PUT',
        govde: {
          deger: g.deger,
          ...(g.ayrinti && konuId ? { konu_id: konuId } : {}),
          ...(g.ayrinti && not.trim() ? { not: not.trim() } : {}),
        },
        sema: GeriBildirimKaydetYanitSema,
      }),
    onSuccess: (_, g) => {
      setDeger(g.deger);
      setAyrintiKaydedildi(g.ayrinti);
      cevaplandi();
    },
  });

  const sec = (v: GeriBildirimDeger) => {
    // Ayrinti zaten girildiyse degeri degistirirken de gonderilir.
    kaydet.mutate({ deger: v, ayrinti: ayrintiAcik && (konuId !== null || not.trim() !== '') });
  };
  const ayrintiGonder = (e: SyntheticEvent) => {
    e.preventDefault();
    if (deger) kaydet.mutate({ deger, ayrinti: true });
  };

  const gun = yerelTarih(d.baslangic_at, saatDilimi);
  const sonSaat = yerelSaat(d.son_verme_at, saatDilimi);
  const sonGun = yerelTarih(d.son_verme_at, saatDilimi);
  const grupAdi = d.baslik ? `${bransAdi(d.brans_kodu)} · ${d.baslik}` : bransAdi(d.brans_kodu);

  return (
    <li className="flex flex-col gap-3 px-5 py-4" data-testid="geri-bildirim-ogesi">
      <div>
        <p className="font-medium">{t('kayitGeriBildirim.geriBildirim.soru')}</p>
        <p className="text-sm text-metin-ikincil">
          {grupAdi} · {gunEtiketi(gun)}, {saatAraligi(d.baslangic_at, d.bitis_at, saatDilimi)}
        </p>
      </div>
      <div
        role="group"
        aria-label={t('kayitGeriBildirim.geriBildirim.secenekler', { ders: grupAdi })}
        className="grid grid-cols-3 gap-2"
      >
        {GERI_BILDIRIM_DEGERLERI.map((v) => {
          const Ikon = DEGER_IKONLARI[v];
          const secili = deger === v;
          return (
            <button
              key={v}
              type="button"
              aria-pressed={secili}
              disabled={kaydet.isPending || !degistirilebilir}
              onClick={() => {
                sec(v);
              }}
              className={cn(
                'flex min-h-16 flex-col items-center justify-center gap-1 rounded-orta border-2 px-2 py-2 text-sm font-medium transition-colors disabled:opacity-50',
                secili
                  ? 'border-birincil bg-birincil text-birincil-uzeri'
                  : 'border-kenar bg-yuzey hover:bg-yuzey-ikincil',
              )}
            >
              <Ikon className="size-6" aria-hidden />
              {t(`kayitGeriBildirim.geriBildirim.deger.${v}`)}
            </button>
          );
        })}
      </div>
      {kaydet.isError ? <Uyari>{hataMesaji(kaydet.error)}</Uyari> : null}
      {deger ? (
        <div className="flex flex-col gap-3" role="status" aria-live="polite">
          <p className="flex items-center gap-2 text-sm">
            <CircleCheck className="size-4 text-basari" aria-hidden />
            {t('kayitGeriBildirim.geriBildirim.tesekkur')}{' '}
            {degistirilebilir
              ? t('kayitGeriBildirim.geriBildirim.degistirebilirsin', {
                  gun: gunEtiketi(sonGun),
                  saat: sonSaat,
                })
              : ''}
            {ayrintiKaydedildi ? ` ${t('kayitGeriBildirim.geriBildirim.ayrintiKaydedildi')}` : ''}
          </p>
        </div>
      ) : null}
      {deger && !ayrintiAcik ? (
        <div>
          <Dugme
            type="button"
            gorunum="ikincil"
            boyut="sm"
            onClick={() => {
              setAyrintiAcik(true);
            }}
          >
            {t('kayitGeriBildirim.geriBildirim.ayrintiEkle')}
          </Dugme>
        </div>
      ) : null}
      {deger && ayrintiAcik ? (
        <form onSubmit={ayrintiGonder} className="flex flex-col gap-3">
          <KonuSecici
            kurumId={kurumId}
            deger={konuId}
            brans={d.brans_kodu}
            etiket={t('kayitGeriBildirim.geriBildirim.konu')}
            degisti={(k) => {
              setKonuId(k?.id ?? null);
            }}
          />
          <Alan etiket={t('kayitGeriBildirim.geriBildirim.not')}>
            {(o) => (
              <MetinAlani
                {...o}
                rows={2}
                maxLength={500}
                value={not}
                onChange={(e) => {
                  setNot(e.target.value);
                }}
              />
            )}
          </Alan>
          <div className="flex justify-end">
            <Dugme type="submit" disabled={kaydet.isPending || !degistirilebilir}>
              {t('kayitGeriBildirim.geriBildirim.ayrintiKaydet')}
            </Dugme>
          </div>
        </form>
      ) : null}
    </li>
  );
}
