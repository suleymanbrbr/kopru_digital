/**
 * Uretilmis dosya: `pnpm --filter @kopru/api-client generate` ile medya servisinin
 * OpenAPI anliginden (openapi/medya.json) uretilir. Elle degistirmeyin.
 */

export interface paths {
    "/ic/okuma-adresleri": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Ic uc (servis JWT, `scope=medya.okuma`): kurumdaki hazir dosyalar icin 10 dk presigned GET adresleri. Kurumda olmayan/hazir olmayan/silinmis dosyalar yanitta yer almaz. */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        dosya_idleri: string[];
                        /** Format: uuid */
                        kurum_id: string;
                    };
                };
            };
            responses: {
                /** @description Default Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            adresler: {
                                /** Format: uri */
                                asil_url: string;
                                /** Format: uuid */
                                dosya_id: string;
                                /** Format: date-time */
                                gecerlilik_bitis_at: string;
                                genislik: number | null;
                                /** Format: uri */
                                kucuk_url: string | null;
                                mime_tipi: string;
                                /** Format: uri */
                                orta_url: string | null;
                                sure_sn: number | null;
                                yukseklik: number | null;
                            }[];
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
    "/v1/dosyalar": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Yukleme izni: kayit acar, kota ayirir, 15 dk gecerli presigned PUT adresi doner. Ayni `istemci_anahtari` ayni kaydi (ve gecerliyse yeni PUT adresi) dondurur. Istemci PUT istegine `basliklar`i aynen ekler. */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        boyut_bayt: number;
                        /** Format: uuid */
                        istemci_anahtari: string;
                        mime_tipi: string;
                        sha256: string;
                        /** @enum {string} */
                        tur: "soru_fotografi" | "soru_cevap_fotografi" | "soru_cizim" | "soru_ses" | "odev_eki" | "odev_teslim_fotografi" | "kurum_logosu" | "avatar" | "fatura_pdf";
                    };
                };
            };
            responses: {
                /** @description Default Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            dosya: {
                                boyut_bayt: number;
                                /** @enum {string} */
                                durum: "yukleme_bekliyor" | "yuklendi" | "isleniyor" | "hazir" | "islenemedi" | "silindi";
                                /** Format: uuid */
                                id: string;
                                mime_tipi: string;
                                /** @enum {string} */
                                tur: "soru_fotografi" | "soru_cevap_fotografi" | "soru_cizim" | "soru_ses" | "odev_eki" | "odev_teslim_fotografi" | "kurum_logosu" | "avatar" | "fatura_pdf";
                            };
                            yukleme: {
                                basliklar: {
                                    [key: string]: string;
                                };
                                /** Format: date-time */
                                gecerlilik_bitis_at: string;
                                /** Format: uri */
                                url: string;
                                /** @enum {string} */
                                yontem: "PUT";
                            } | null;
                        };
                    };
                };
                /** @description Default Response */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            dosya: {
                                boyut_bayt: number;
                                /** @enum {string} */
                                durum: "yukleme_bekliyor" | "yuklendi" | "isleniyor" | "hazir" | "islenemedi" | "silindi";
                                /** Format: uuid */
                                id: string;
                                mime_tipi: string;
                                /** @enum {string} */
                                tur: "soru_fotografi" | "soru_cevap_fotografi" | "soru_cizim" | "soru_ses" | "odev_eki" | "odev_teslim_fotografi" | "kurum_logosu" | "avatar" | "fatura_pdf";
                            };
                            yukleme: {
                                basliklar: {
                                    [key: string]: string;
                                };
                                /** Format: date-time */
                                gecerlilik_bitis_at: string;
                                /** Format: uri */
                                url: string;
                                /** @enum {string} */
                                yontem: "PUT";
                            } | null;
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
    "/v1/dosyalar/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Sahibine dosya durumu; `hazir` ise 10 dk gecerli presigned GET adresleri (asil, kucuk, orta). Baskasinin dosyasi api araciligiyla `/ic/okuma-adresleri` ile alinir. */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
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
                            adresler: {
                                /** Format: uri */
                                asil_url: string;
                                /** Format: date-time */
                                gecerlilik_bitis_at: string;
                                /** Format: uri */
                                kucuk_url: string | null;
                                /** Format: uri */
                                orta_url: string | null;
                            } | null;
                            boyut_bayt: number | null;
                            /** @enum {string} */
                            durum: "yukleme_bekliyor" | "yuklendi" | "isleniyor" | "hazir" | "islenemedi" | "silindi";
                            genislik: number | null;
                            /** @enum {string|null} */
                            hata_kodu: "mime_uyusmazligi" | "boyut_uyusmazligi" | "bozuk_dosya" | "sure_asimi" | "yukleme_zaman_asimi" | null;
                            /** Format: uuid */
                            id: string;
                            mime_tipi: string;
                            sure_sn: number | null;
                            /** @enum {string} */
                            tur: "soru_fotografi" | "soru_cevap_fotografi" | "soru_cizim" | "soru_ses" | "odev_eki" | "odev_teslim_fotografi" | "kurum_logosu" | "avatar" | "fatura_pdf";
                            yukseklik: number | null;
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
    "/v1/dosyalar/{id}/tamam": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Yukleme bitti bildirimi: nesneyi HEAD ile dogrular (boyut, icerik turu), `yuklendi` yapar ve isleme kuyruguna alir. Idempotent. Nesne henuz yoksa 409 `yukleme_bulunamadi` (PUT bitince tekrar denenir). */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Default Response */
                202: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            adresler: {
                                /** Format: uri */
                                asil_url: string;
                                /** Format: date-time */
                                gecerlilik_bitis_at: string;
                                /** Format: uri */
                                kucuk_url: string | null;
                                /** Format: uri */
                                orta_url: string | null;
                            } | null;
                            boyut_bayt: number | null;
                            /** @enum {string} */
                            durum: "yukleme_bekliyor" | "yuklendi" | "isleniyor" | "hazir" | "islenemedi" | "silindi";
                            genislik: number | null;
                            /** @enum {string|null} */
                            hata_kodu: "mime_uyusmazligi" | "boyut_uyusmazligi" | "bozuk_dosya" | "sure_asimi" | "yukleme_zaman_asimi" | null;
                            /** Format: uuid */
                            id: string;
                            mime_tipi: string;
                            sure_sn: number | null;
                            /** @enum {string} */
                            tur: "soru_fotografi" | "soru_cevap_fotografi" | "soru_cizim" | "soru_ses" | "odev_eki" | "odev_teslim_fotografi" | "kurum_logosu" | "avatar" | "fatura_pdf";
                            yukseklik: number | null;
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
