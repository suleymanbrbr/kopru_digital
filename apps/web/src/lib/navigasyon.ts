import type { MessageKey } from '@kopru/i18n';
import {
  BookOpenCheck,
  Building2,
  CalendarDays,
  ClipboardList,
  FileQuestion,
  Files,
  GraduationCap,
  House,
  Layers,
  ListChecks,
  MessageCircleQuestion,
  NotebookPen,
  PawPrint,
  Puzzle,
  Rows3,
  School,
  Target,
  UsersRound,
  Wallet,
  CreditCard,
  type LucideIcon,
} from 'lucide-react';

export type Rol = 'sahip' | 'yonetici' | 'ogretmen' | 'ogrenci' | 'veli';

/** Faz 1'de arayuzu olan roller (veli icin arayuz yok). */
export const faz1Roller: readonly Rol[] = ['sahip', 'yonetici', 'ogretmen', 'ogrenci'];

/**
 * Kapatilabilen modul anahtarlari (hesap.modul_ayarlari.modul_kodu). `null` = cekirdek,
 * her zaman acik. Kesin liste backend'de belirlendiginde yalnizca bu birlesim guncellenir.
 */
export type ModulAnahtari =
  'ders' | 'odev' | 'plan' | 'deneme' | 'soru' | 'kayit' | 'finans' | 'motivasyon';

export type NavGrubu = 'calisma' | 'yonetim';

export interface NavOgesi {
  /** Kararli kimlik (test ve ekran anahtari). */
  anahtar: string;
  /** `/[kurumId]/<yol>` yolunun son parcasi. */
  yol: string;
  baslik: MessageKey;
  ikon: LucideIcon;
  /** Bu modul kapaliysa oge gizlenir; `null` = cekirdek. */
  modul: ModulAnahtari | null;
  roller: readonly Rol[];
  grup: NavGrubu;
  /** Mobilde alt menude gosterilme onceligi (kucuk = once). Belirtilmeyen "Menu" cekmecesinde kalir. */
  mobilOncelik?: number;
}

const personel = ['sahip', 'yonetici', 'ogretmen'] as const satisfies readonly Rol[];
const yonetim = ['sahip', 'yonetici'] as const satisfies readonly Rol[];
const tumu = ['sahip', 'yonetici', 'ogretmen', 'ogrenci'] as const satisfies readonly Rol[];

/**
 * Navigasyonun tek kaynagi: hangi rol hangi ogeyi, hangi modul acikken gorur.
 * Sira, menudeki siradir.
 */
export const navOgeleri: readonly NavOgesi[] = [
  {
    anahtar: 'bugun',
    yol: 'bugun',
    baslik: 'nav.bugun',
    ikon: House,
    modul: null,
    roller: tumu,
    grup: 'calisma',
    mobilOncelik: 1,
  },

  // Ogretmen, yonetici, sahip
  {
    anahtar: 'takvim',
    yol: 'takvim',
    baslik: 'nav.takvim',
    ikon: CalendarDays,
    modul: 'ders',
    roller: personel,
    grup: 'calisma',
    mobilOncelik: 2,
  },
  {
    anahtar: 'ogrenciler',
    yol: 'ogrenciler',
    baslik: 'nav.ogrenciler',
    ikon: GraduationCap,
    modul: null,
    roller: personel,
    grup: 'calisma',
    mobilOncelik: 3,
  },
  {
    anahtar: 'gruplar',
    yol: 'gruplar',
    baslik: 'nav.gruplar',
    ikon: UsersRound,
    modul: null,
    roller: personel,
    grup: 'calisma',
  },
  {
    anahtar: 'odevler',
    yol: 'odevler',
    baslik: 'nav.odevler',
    ikon: ClipboardList,
    modul: 'odev',
    roller: personel,
    grup: 'calisma',
    mobilOncelik: 4,
  },
  {
    anahtar: 'planlar',
    yol: 'planlar',
    baslik: 'nav.planlar',
    ikon: Target,
    modul: 'plan',
    roller: personel,
    grup: 'calisma',
  },
  {
    anahtar: 'denemeler',
    yol: 'denemeler',
    baslik: 'nav.denemeler',
    ikon: BookOpenCheck,
    modul: 'deneme',
    roller: personel,
    grup: 'calisma',
  },
  {
    anahtar: 'sorular',
    yol: 'sorular',
    baslik: 'nav.sorular',
    ikon: FileQuestion,
    modul: 'soru',
    roller: personel,
    grup: 'calisma',
  },
  {
    anahtar: 'kayitlar',
    yol: 'kayitlar',
    baslik: 'nav.kayitlar',
    ikon: Files,
    modul: 'kayit',
    roller: personel,
    grup: 'calisma',
  },
  {
    anahtar: 'finans',
    yol: 'finans',
    baslik: 'nav.finans',
    ikon: Wallet,
    modul: 'finans',
    roller: personel,
    grup: 'calisma',
  },

  // Ogrenci
  {
    anahtar: 'gorevler',
    yol: 'gorevler',
    baslik: 'nav.gorevler',
    ikon: ListChecks,
    modul: 'motivasyon',
    roller: ['ogrenci'],
    grup: 'calisma',
    mobilOncelik: 2,
  },
  {
    anahtar: 'odevlerim',
    yol: 'odevlerim',
    baslik: 'nav.odevlerim',
    ikon: NotebookPen,
    modul: 'odev',
    roller: ['ogrenci'],
    grup: 'calisma',
    mobilOncelik: 3,
  },
  {
    anahtar: 'soru-sor',
    yol: 'soru-sor',
    baslik: 'nav.soruSor',
    ikon: MessageCircleQuestion,
    modul: 'soru',
    roller: ['ogrenci'],
    grup: 'calisma',
    mobilOncelik: 4,
  },
  {
    anahtar: 'kayitlarim',
    yol: 'kayitlarim',
    baslik: 'nav.kayitlarim',
    ikon: Layers,
    modul: 'kayit',
    roller: ['ogrenci'],
    grup: 'calisma',
  },
  {
    anahtar: 'karakterim',
    yol: 'karakterim',
    baslik: 'nav.karakterim',
    ikon: PawPrint,
    modul: 'motivasyon',
    roller: ['ogrenci'],
    grup: 'calisma',
  },

  // Yonetim (yonetici + sahip); abonelik yalnizca sahip
  {
    anahtar: 'kurum',
    yol: 'kurum',
    baslik: 'nav.kurum',
    ikon: Building2,
    modul: null,
    roller: yonetim,
    grup: 'yonetim',
  },
  {
    anahtar: 'ogretmenler',
    yol: 'ogretmenler',
    baslik: 'nav.ogretmenler',
    ikon: School,
    modul: null,
    roller: yonetim,
    grup: 'yonetim',
  },
  {
    anahtar: 'siniflar',
    yol: 'siniflar',
    baslik: 'nav.siniflar',
    ikon: Rows3,
    modul: null,
    roller: yonetim,
    grup: 'yonetim',
  },
  {
    anahtar: 'moduller',
    yol: 'moduller',
    baslik: 'nav.moduller',
    ikon: Puzzle,
    modul: null,
    roller: yonetim,
    grup: 'yonetim',
  },
  {
    anahtar: 'abonelik',
    yol: 'abonelik',
    baslik: 'nav.abonelik',
    ikon: CreditCard,
    modul: null,
    roller: ['sahip'],
    grup: 'yonetim',
  },
];

export interface NavBaglami {
  rol: Rol;
  /** Kurum/kademe/grup duzeyinde cozulmus, acik moduller. */
  acikModuller: readonly string[];
}

/** Rol ve acik modullere gore gorunen ogeler (sira korunur). */
export function gorunurOgeler({ rol, acikModuller }: NavBaglami): NavOgesi[] {
  return navOgeleri.filter(
    (oge) => oge.roller.includes(rol) && (oge.modul === null || acikModuller.includes(oge.modul)),
  );
}

export type BolumDurumu = 'acik' | 'modul-kapali' | 'yetkisiz' | 'yok';

/** `/[kurumId]/<yol>` icin erisim durumu: kapali modul ile yetkisizlik ayri gosterilir. */
export function bolumDurumu(
  yol: string,
  baglam: NavBaglami,
): { durum: BolumDurumu; oge?: NavOgesi } {
  const adaylar = navOgeleri.filter((o) => o.yol === yol);
  const ilk = adaylar[0];
  if (!ilk) return { durum: 'yok' };
  const rolunki = adaylar.find((o) => o.roller.includes(baglam.rol));
  if (!rolunki) return { durum: 'yetkisiz', oge: ilk };
  if (rolunki.modul !== null && !baglam.acikModuller.includes(rolunki.modul)) {
    return { durum: 'modul-kapali', oge: rolunki };
  }
  return { durum: 'acik', oge: rolunki };
}

/** Alt menude gosterilecek ogeler (en cok `sinir`) ve cekmecede kalanlar. */
export function mobilBolme(ogeler: readonly NavOgesi[], sinir = 4) {
  const oncelikli = ogeler
    .filter((o) => o.mobilOncelik !== undefined)
    .sort((a, b) => (a.mobilOncelik ?? 99) - (b.mobilOncelik ?? 99))
    .slice(0, sinir);
  const anahtarlar = new Set(oncelikli.map((o) => o.anahtar));
  return {
    alt: oncelikli,
    cekmece: ogeler.filter((o) => !anahtarlar.has(o.anahtar)),
  };
}

/** Gruplara ayirir; bos gruplar atilir. */
export function gruplaginaAyir(ogeler: readonly NavOgesi[]) {
  const gruplar: Record<NavGrubu, NavOgesi[]> = { calisma: [], yonetim: [] };
  for (const oge of ogeler) gruplar[oge.grup].push(oge);
  return (['calisma', 'yonetim'] as const)
    .filter((grup) => gruplar[grup].length > 0)
    .map((grup) => ({ grup, ogeler: gruplar[grup] }));
}
