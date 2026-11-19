/** Fatura alici adresi (`kurum_fatura_bilgileri.adres` / `faturalar.alici_adres` jsonb). */
export interface FaturaAdresi {
  satir: string;
  ilce: string;
  il: string;
  posta_kodu?: string;
}
