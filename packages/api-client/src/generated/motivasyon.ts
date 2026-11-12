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
    "/v1/motivasyon/kurumlar/{kurum_id}/benim/seri": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Ogrencinin seri ekrani: son 35 gunun takvimi (gun basina durum), mevcut/en uzun seri, dondurma stogu, onarim hakki ve penceresi, bugun aktif mi ve hedefe ne kaldi, siradaki kilometre tasi. Modul kapaliysa 403 modul_kapali. */
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
                            /** Format: date */
                            bugun: string;
                            bugun_aktif: boolean;
                            dondurma_stogu: number;
                            en_uzun_seri: number;
                            gunler: {
                                bugun: boolean;
                                /** @enum {string} */
                                durum: "aktif" | "dondurma" | "duraklatma" | "onarim" | "kacirildi" | "yok";
                                /** Format: date */
                                gun: string;
                            }[];
                            hedefler: {
                                esik: number;
                                kalan: number;
                                /** @enum {string} */
                                tur: "plan_gorevi" | "odak_dk" | "odev" | "soru";
                                yapilan: number;
                            }[];
                            mevcut_seri: number;
                            onarim: {
                                /** Format: date-time */
                                bitis_at: string;
                                /** Format: date */
                                bozulan_gun: string;
                                bozulan_seri: number;
                                hedefler: {
                                    esik: number;
                                    kalan: number;
                                    /** @enum {string} */
                                    tur: "plan_gorevi" | "odak_dk" | "odev" | "soru";
                                    yapilan: number;
                                }[];
                            } | null;
                            onarim_hakki: number;
                            sonraki_kilometre_tasi: {
                                hedef: number;
                                kalan: number;
                            } | null;
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
    "/v1/motivasyon/kurumlar/{kurum_id}/gruplar/{grup_id}/seri-duraklatmalari": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Grubun seri duraklatmalari (iptal edilenler dahil, baslangica gore yeniden eskiye; en cok 100). */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    grup_id: string;
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
                            duraklatmalar: {
                                /** Format: date */
                                baslangic_gun: string;
                                /** Format: date */
                                bitis_gun: string;
                                /** Format: date-time */
                                created_at: string;
                                /** Format: uuid */
                                grup_id: string;
                                /** Format: uuid */
                                id: string;
                                /** Format: date-time */
                                iptal_at: string | null;
                                neden: string | null;
                                /** Format: uuid */
                                veren_ogretmen_id: string;
                            }[];
                        };
                    };
                };
            };
        };
        put?: never;
        /** Grup icin seri duraklatmasi baslatir (ogretmen yalniz atandigi grup, yonetici/sahip kurumdaki grup). En cok 31 gun (baslangic ve bitis dahil), gecmis gun olamaz; cakisan aralik 409. Aralikta grubun etkin uyeleri icin gunler `duraklatma` olur: seri bozulmaz, dondurma harcanmaz. */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    grup_id: string;
                    kurum_id: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        /** Format: date */
                        baslangic_gun: string;
                        /** Format: date */
                        bitis_gun: string;
                        neden?: string;
                    };
                };
            };
            responses: {
                /** @description Default Response */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** Format: date */
                            baslangic_gun: string;
                            /** Format: date */
                            bitis_gun: string;
                            /** Format: date-time */
                            created_at: string;
                            /** Format: uuid */
                            grup_id: string;
                            /** Format: uuid */
                            id: string;
                            /** Format: date-time */
                            iptal_at: string | null;
                            neden: string | null;
                            /** Format: uuid */
                            veren_ogretmen_id: string;
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/motivasyon/kurumlar/{kurum_id}/gruplar/{grup_id}/seri-duraklatmalari/{duraklatma_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** Duraklatmayi iptal eder (yalniz henuz degerlendirilmemis gunler etkilenir; gecen gunler `duraklatma` kalir). Zaten iptalse 404. */
        delete: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    duraklatma_id: string;
                    grup_id: string;
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
                            /** Format: date */
                            baslangic_gun: string;
                            /** Format: date */
                            bitis_gun: string;
                            /** Format: date-time */
                            created_at: string;
                            /** Format: uuid */
                            grup_id: string;
                            /** Format: uuid */
                            id: string;
                            /** Format: date-time */
                            iptal_at: string | null;
                            neden: string | null;
                            /** Format: uuid */
                            veren_ogretmen_id: string;
                        };
                    };
                };
            };
        };
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
