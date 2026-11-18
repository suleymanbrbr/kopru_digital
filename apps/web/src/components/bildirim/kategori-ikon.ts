import type { BildirimKategori } from '@kopru/contracts';
import {
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  CreditCard,
  Files,
  Flame,
  Megaphone,
  MessageCircleQuestion,
  ShieldCheck,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

/** Kategori -> simge (renk tek basina anlam tasimaz; kategori adi metin olarak da gosterilir). */
export const KATEGORI_IKONU: Record<BildirimKategori, LucideIcon> = {
  ders: CalendarDays,
  yoklama: ClipboardCheck,
  odev: ClipboardList,
  soru: MessageCircleQuestion,
  kayit: Files,
  duyuru: Megaphone,
  finans: Wallet,
  oyunlastirma: Flame,
  abonelik: CreditCard,
  sistem: ShieldCheck,
};
