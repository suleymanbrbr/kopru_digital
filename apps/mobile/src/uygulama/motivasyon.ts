import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';

import type { KozmetikSlotu, MotivasyonDurumu, Kozmetik } from '../api/motivasyonTipleri';
import type { RuhHali, Beceriler, TurKodu } from '../karakter/tipler';
import { ruhHaliSec } from '../motivasyon/ruhHali';
import { vitrinDegistir, vitrinOku } from '../motivasyon/vitrin';
import { useAktif, useServisler } from './baglam';
import { useModulAcik } from './operasyon';

/**
 * Motivasyon sorgulari. Anahtarlar uyelik kapsamlidir (`['motivasyon', uyelikId, ...]`); XP
 * yoneticisi taze `benim` anligini ayni anahtara yazar. `oyunlastirma` kapaliysa hicbir sorgu calismaz.
 */
function useUyelikId() {
  return useAktif()?.uyelik.uyelikId;
}

/** Etkin kurumda `oyunlastirma` acik mi (karakter, seri ve XP arayuzu buna bagli). */
export function useOyunlastirmaAcik(): boolean {
  return useModulAcik('oyunlastirma');
}

/** Ogrenci ve modul acik: karakter/seri/XP gosterilir. */
export function useOgrenciOyunu(): boolean {
  const aktif = useAktif();
  const acik = useOyunlastirmaAcik();
  return acik && aktif?.uyelik.rol === 'ogrenci';
}

/** Ogrencinin kendi motivasyon durumu. */
export function useBenim() {
  const { adaptorler, xp } = useServisler();
  const uyelikId = useUyelikId();
  const etkin = useOgrenciOyunu();
  return useQuery({
    queryKey: ['motivasyon', uyelikId, 'benim'],
    queryFn: async () => {
      const d = await adaptorler.motivasyon.benim();
      xp.gozlemle(d);
      return d;
    },
    enabled: !!uyelikId && etkin,
  });
}

export function useSeri() {
  const { adaptorler } = useServisler();
  const uyelikId = useUyelikId();
  const etkin = useOgrenciOyunu();
  return useQuery({
    queryKey: ['motivasyon', uyelikId, 'seri'],
    queryFn: () => adaptorler.motivasyon.seri(),
    enabled: !!uyelikId && etkin,
  });
}

export function useKarakterTurleri(etkin = true) {
  const { adaptorler } = useServisler();
  const uyelikId = useUyelikId();
  const acik = useOgrenciOyunu();
  return useQuery({
    queryKey: ['motivasyon', uyelikId, 'turler'],
    queryFn: () => adaptorler.motivasyon.karakterTurleri(),
    enabled: !!uyelikId && acik && etkin,
    staleTime: 60 * 60_000,
  });
}

export function useKarakterDetayi() {
  const { adaptorler } = useServisler();
  const uyelikId = useUyelikId();
  const acik = useOgrenciOyunu();
  return useQuery({
    queryKey: ['motivasyon', uyelikId, 'karakter'],
    queryFn: () => adaptorler.motivasyon.karakter(),
    enabled: !!uyelikId && acik,
  });
}

export function useKozmetikler() {
  const { adaptorler } = useServisler();
  const uyelikId = useUyelikId();
  const acik = useOgrenciOyunu();
  return useQuery({
    queryKey: ['motivasyon', uyelikId, 'kozmetikler'],
    queryFn: () => adaptorler.motivasyon.kozmetikler(),
    enabled: !!uyelikId && acik,
  });
}

/** Personel: bir ogrencinin motivasyon ozeti (modul kapaliysa calismaz). */
export function useOgrenciMotivasyonOzeti(ogrenciId: string) {
  const { adaptorler } = useServisler();
  const uyelikId = useUyelikId();
  const acik = useOyunlastirmaAcik();
  const aktif = useAktif();
  const personel = !!aktif && aktif.uyelik.rol !== 'ogrenci';
  return useQuery({
    queryKey: ['motivasyon', uyelikId, 'ozet', ogrenciId],
    queryFn: () => adaptorler.motivasyon.ogrenciOzeti(ogrenciId),
    enabled: !!uyelikId && !!ogrenciId && acik && personel,
    // Modul kapali ya da kapsam disi (404) tekrar denenmez.
    retry: false,
  });
}

/** Karakter secimi, tur/ad degistirme: yazimdan sonra tum motivasyon sorgulari yenilenir. */
export function useKarakterIslemleri() {
  const { adaptorler } = useServisler();
  const qc = useQueryClient();
  const uyelikId = useUyelikId();
  const yenile = () => qc.invalidateQueries({ queryKey: ['motivasyon', uyelikId] });
  const sec = useMutation({
    networkMode: 'always',
    mutationFn: (g: { turKodu: string; ad: string }) =>
      adaptorler.motivasyon.karakterSec(g.turKodu, g.ad),
    onSuccess: yenile,
  });
  const tur = useMutation({
    networkMode: 'always',
    mutationFn: (turKodu: string) => adaptorler.motivasyon.turDegistir(turKodu),
    onSuccess: yenile,
  });
  const ad = useMutation({
    networkMode: 'always',
    mutationFn: (yeniAd: string) => adaptorler.motivasyon.adDegistir(yeniAd),
    onSuccess: yenile,
  });
  return { sec, tur, ad };
}

export function useKusanIslemi() {
  const { adaptorler } = useServisler();
  const qc = useQueryClient();
  const uyelikId = useUyelikId();
  return useMutation({
    networkMode: 'always',
    mutationFn: async (g: { slot: KozmetikSlotu; kod: string | null }) => {
      if (g.kod === null) await adaptorler.motivasyon.cikar(g.slot);
      else await adaptorler.motivasyon.kusan(g.slot, g.kod);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['motivasyon', uyelikId] }),
  });
}

/** Odak yoneticisinin anlik durumu (sure ekranda `gecenSn`den hesaplanir). */
export function useOdakDurumu() {
  const { odak } = useServisler();
  return useSyncExternalStore(
    (cb) => odak.abone(cb),
    () => odak.al(),
  );
}

/** Vitrin (3 rozet) yerelde saklanir. */
export function useVitrin() {
  const { yerelDepo } = useServisler();
  const uyelikId = useUyelikId() ?? '';
  const qc = useQueryClient();
  const secim = useQuery({
    queryKey: ['motivasyon', uyelikId, 'vitrin'],
    queryFn: () => vitrinOku(yerelDepo, uyelikId),
    enabled: !!uyelikId,
    staleTime: Infinity,
    networkMode: 'always',
  });
  const degistir = (kod: string) => {
    const s = vitrinDegistir(yerelDepo, uyelikId, kod);
    qc.setQueryData(['motivasyon', uyelikId, 'vitrin'], s.secim);
    return s;
  };
  return { secim: secim.data ?? [], degistir };
}

export interface KarakterGorunumu {
  tur: TurKodu;
  asama: number;
  seviye: number;
  ad: string;
  beceriler: Beceriler;
  ruhHali: RuhHali;
}

const TURLER: readonly string[] = ['kivilcim', 'dinamo', 'sedir'];

/** Sunucu beceri listesi -> `Companion` icin 0-10 beceri nesnesi (Rive girdisi; olcek 10'a kirpilir). */
export function becerilerNesnesi(d: Pick<MotivasyonDurumu, 'beceriler'>): Beceriler {
  const al = (kod: string) => d.beceriler.find((b) => b.kod === kod)?.puan ?? 0;
  return {
    sayisal: al('sayisal'),
    sozel: al('sozel'),
    fen: al('fen'),
    sosyal: al('sosyal'),
    dil: al('dil'),
  };
}

/** Kuşanılan kozmetikleri `Companion`un sayisal Rive girdilerine esler (slot icinde siradaki no, 0 = yok). */
export function kozmetikGirdileri(
  kusanilanlar: readonly { slot: KozmetikSlotu; kozmetik_kodu: string }[],
  tumu: readonly Kozmetik[] | undefined,
): { sapka?: number; aksesuar?: number; arkaPlan?: number } {
  const no = (slot: KozmetikSlotu): number | undefined => {
    const kod = kusanilanlar.find((k) => k.slot === slot)?.kozmetik_kodu;
    if (!kod || !tumu) return undefined;
    const i = tumu.filter((k) => k.slot === slot).findIndex((k) => k.kod === kod);
    return i < 0 ? undefined : i + 1;
  };
  const sapka = no('sapka');
  const aksesuar = no('aksesuar');
  const arkaPlan = no('arka_plan');
  return {
    ...(sapka !== undefined ? { sapka } : {}),
    ...(aksesuar !== undefined ? { aksesuar } : {}),
    ...(arkaPlan !== undefined ? { arkaPlan } : {}),
  };
}

/** Durumdan karakterin ekranda gorunumu (ruh hali son aktiviteye ve odaga gore). */
export function karakterGorunumu(
  d: MotivasyonDurumu,
  odakta: boolean,
  kutlama = false,
): KarakterGorunumu | null {
  const k = d.karakter;
  if (!k) return null;
  return {
    tur: (TURLER.includes(k.tur_kodu) ? k.tur_kodu : 'kivilcim') as TurKodu,
    asama: k.asama,
    seviye: d.seviye,
    ad: k.ad,
    beceriler: becerilerNesnesi(d),
    ruhHali: ruhHaliSec({
      odakta,
      kutlama,
      bugun: d.bugun.gun,
      sonAktifGun: d.seri.son_aktif_gun,
      bugunXp: d.bugun.xp,
    }),
  };
}
