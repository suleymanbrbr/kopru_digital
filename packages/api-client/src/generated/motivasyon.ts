/**
 * Uretilmis dosya: `pnpm --filter @kopru/api-client generate` ile motivasyon servisinin
 * OpenAPI anliginden (openapi/motivasyon.json) uretilir. Elle degistirmeyin.
 */

export interface paths {
    "/v1/motivasyon/kurumlar/{kurum_id}/benim": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Ogrencinin kendi motivasyon durumu: XP, seviye, bugunku tavanlar, beceriler, rozetler, karakter, seri ve son hareketler. Modul kapaliysa 403 modul_kapali. */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    kurum_id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Default Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            beceriler: {
                                ad: string;
                                kod: string;
                                puan: number;
                            }[];
                            bu_hafta_xp: number;
                            bugun: {
                                /** Format: date */
                                gun: string;
                                tavanlar: {
                                    kod: string;
                                    kullanilan: number;
                                    ust_sinir: number;
                                }[];
                                xp: number;
                            };
                            karakter: {
                                ad: string;
                                asama: number;
                                kusanilanlar: {
                                    kozmetik_kodu: string;
                                    /** @enum {string} */
                                    slot: "sapka" | "gozluk" | "aksesuar" | "arka_plan" | "cerceve";
                                }[];
                                sonraki_asama_seviyesi: number | null;
                                tur_kodu: string;
                            } | null;
                            /** Format: uuid */
                            ogrenci_id: string;
                            rozetler: {
                                kazanilan: {
                                    aciklama: string;
                                    ad: string;
                                    /** @enum {string} */
                                    kademe: "bronz" | "gumus" | "altin";
                                    /** @enum {string} */
                                    kategori: "devamlilik" | "emek" | "gelisim" | "merak" | "ozel";
                                    /** Format: date-time */
                                    kazanildi_at: string;
                                    kod: string;
                                }[];
                                kilitli: {
                                    aciklama: string;
                                    ad: string;
                                    esik: number;
                                    ilerleme: number;
                                    /** @enum {string} */
                                    kademe: "bronz" | "gumus" | "altin";
                                    /** @enum {string} */
                                    kategori: "devamlilik" | "emek" | "gelisim" | "merak" | "ozel";
                                    kod: string;
                                    sayac_kodu: string;
                                }[];
                            };
                            seri: {
                                /** Format: date */
                                bozulan_gun: string | null;
                                bozulan_seri: number | null;
                                dondurma_stogu: number;
                                en_uzun_seri: number;
                                mevcut_seri: number;
                                /** Format: date-time */
                                onarim_bitis_at: string | null;
                                onarim_hakki: number;
                                /** Format: date */
                                son_aktif_gun: string | null;
                            };
                            seviye: number;
                            seviye_baslangic_xp: number;
                            son_hareketler: {
                                /** Format: date-time */
                                created_at: string;
                                /** Format: date */
                                gun: string;
                                /** Format: uuid */
                                id: string;
                                kismi: boolean;
                                kural_kodu: string;
                                xp: number;
                            }[];
                            sonraki_seviye_xp: number | null;
                            sonraki_seviyeye_kalan: number | null;
                            toplam_xp: number;
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/motivasyon/kurumlar/{kurum_id}/ogrenciler/{ogrenci_id}/ozet": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Ogrenci ozeti (benim ile ayni govde). Ogretmen yalniz atandigi gruplardaki ogrenciyi, yonetici/sahip kurumdakileri, ogrenci yalniz kendini gorur. Modul kapaliysa 403 modul_kapali. */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    kurum_id: string;
                    ogrenci_id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Default Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            beceriler: {
                                ad: string;
                                kod: string;
                                puan: number;
                            }[];
                            bu_hafta_xp: number;
                            bugun: {
                                /** Format: date */
                                gun: string;
                                tavanlar: {
                                    kod: string;
                                    kullanilan: number;
                                    ust_sinir: number;
                                }[];
                                xp: number;
                            };
                            karakter: {
                                ad: string;
                                asama: number;
                                kusanilanlar: {
                                    kozmetik_kodu: string;
                                    /** @enum {string} */
                                    slot: "sapka" | "gozluk" | "aksesuar" | "arka_plan" | "cerceve";
                                }[];
                                sonraki_asama_seviyesi: number | null;
                                tur_kodu: string;
                            } | null;
                            /** Format: uuid */
                            ogrenci_id: string;
                            rozetler: {
                                kazanilan: {
                                    aciklama: string;
                                    ad: string;
                                    /** @enum {string} */
                                    kademe: "bronz" | "gumus" | "altin";
                                    /** @enum {string} */
                                    kategori: "devamlilik" | "emek" | "gelisim" | "merak" | "ozel";
                                    /** Format: date-time */
                                    kazanildi_at: string;
                                    kod: string;
                                }[];
                                kilitli: {
                                    aciklama: string;
                                    ad: string;
                                    esik: number;
                                    ilerleme: number;
                                    /** @enum {string} */
                                    kademe: "bronz" | "gumus" | "altin";
                                    /** @enum {string} */
                                    kategori: "devamlilik" | "emek" | "gelisim" | "merak" | "ozel";
                                    kod: string;
                                    sayac_kodu: string;
                                }[];
                            };
                            seri: {
                                /** Format: date */
                                bozulan_gun: string | null;
                                bozulan_seri: number | null;
                                dondurma_stogu: number;
                                en_uzun_seri: number;
                                mevcut_seri: number;
                                /** Format: date-time */
                                onarim_bitis_at: string | null;
                                onarim_hakki: number;
                                /** Format: date */
                                son_aktif_gun: string | null;
                            };
                            seviye: number;
                            seviye_baslangic_xp: number;
                            son_hareketler: {
                                /** Format: date-time */
                                created_at: string;
                                /** Format: date */
                                gun: string;
                                /** Format: uuid */
                                id: string;
                                kismi: boolean;
                                kural_kodu: string;
                                xp: number;
                            }[];
                            sonraki_seviye_xp: number | null;
                            sonraki_seviyeye_kalan: number | null;
                            toplam_xp: number;
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: never;
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export type operations = Record<string, never>;
