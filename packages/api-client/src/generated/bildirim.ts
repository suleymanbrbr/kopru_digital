/**
 * Uretilmis dosya: `pnpm --filter @kopru/api-client generate` ile bildirim servisinin
 * OpenAPI anliginden (openapi/bildirim.json) uretilir. Elle degistirmeyin.
 */

export interface paths {
    "/v1/bildirim/cihazlar": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /** Push cihazini kaydeder ya da gunceller (her uygulama acilisinda). Ayni belirtec baska kullanicidaysa onun kaydi pasiflenir. */
        put: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        cihaz_kimligi: string;
                        dil?: string;
                        /** @enum {string} */
                        platform: "ios" | "android" | "web";
                        push_belirteci: string;
                        uygulama_surumu?: string;
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
                            aktif: boolean;
                            cihaz_kimligi: string;
                        };
                    };
                };
            };
        };
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/bildirim/cihazlar/{cihaz_kimligi}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** Cikista cihaz kaydini siler (kayit yoksa da basarili). */
        delete: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    cihaz_kimligi: string;
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
                            aktif: boolean;
                            cihaz_kimligi: string;
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
    "/v1/bildirim/kurumlar/{kurum_id}/ayarlar": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Sessiz saat, saat dilimi ve ders hatirlatma ayarlari (kayit yoksa varsayilan: 22:00-08:00, Europe/Istanbul, 60 dk). */
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
                            ders_hatirlatma_dk: 0 | 15 | 30 | 60 | 120 | 1440;
                            saat_dilimi: string;
                            sessiz_baslangic: string;
                            sessiz_bitis: string;
                            sessiz_gunler: number[];
                        };
                    };
                };
            };
        };
        /** Ayarlari kismen gunceller; guncel ayarlari doner. `sessiz_gunler: []` sessiz saati kapatir; baslangic ve bitis birlikte verilir ve esit olamaz. */
        put: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    kurum_id: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        ders_hatirlatma_dk?: 0 | 15 | 30 | 60 | 120 | 1440;
                        saat_dilimi?: string;
                        sessiz_baslangic?: string;
                        sessiz_bitis?: string;
                        sessiz_gunler?: number[];
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
                            ders_hatirlatma_dk: 0 | 15 | 30 | 60 | 120 | 1440;
                            saat_dilimi: string;
                            sessiz_baslangic: string;
                            sessiz_bitis: string;
                            sessiz_gunler: number[];
                        };
                    };
                };
            };
        };
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/bildirim/kurumlar/{kurum_id}/kutu": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Gelen kutusu (yeniden eskiye, imleçli sayfalama). `okunmamis=true` yalniz okunmamislari getirir; arsivlenmis ve suresi gecmis bildirimler gizlidir. */
        get: {
            parameters: {
                query?: {
                    imlec?: string;
                    limit?: number;
                    okunmamis?: "true" | "false";
                };
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
                            ogeler: {
                                baslik: string;
                                /** Format: date-time */
                                created_at: string;
                                derin_baglanti: string | null;
                                /** Format: date-time */
                                gecerlilik_bitis_at: string | null;
                                govde: string;
                                /** Format: uuid */
                                id: string;
                                /** @enum {string} */
                                kategori: "ders" | "yoklama" | "odev" | "soru" | "kayit" | "duyuru" | "finans" | "oyunlastirma" | "abonelik" | "sistem";
                                /** Format: date-time */
                                okundu_at: string | null;
                                sablon_kodu: string;
                                veri: {
                                    [key: string]: unknown;
                                };
                            }[];
                            sonraki_imlec: string | null;
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
    "/v1/bildirim/kurumlar/{kurum_id}/kutu/{bildirim_id}/arsivle": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Bildirimi arsivler (kutuda gizlenir). */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    bildirim_id: string;
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
                            /** Format: date-time */
                            arsivlendi_at: string | null;
                            /** Format: uuid */
                            id: string;
                            /** Format: date-time */
                            okundu_at: string | null;
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
    "/v1/bildirim/kurumlar/{kurum_id}/kutu/{bildirim_id}/okundu": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Tek bildirimi okundu isaretler (tekrar cagri ilk okuma zamanini korur). */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    bildirim_id: string;
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
                            /** Format: date-time */
                            arsivlendi_at: string | null;
                            /** Format: uuid */
                            id: string;
                            /** Format: date-time */
                            okundu_at: string | null;
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
    "/v1/bildirim/kurumlar/{kurum_id}/kutu/okunmamis-sayisi": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Okunmamis (arsivlenmemis, suresi gecmemis) bildirim sayisi. */
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
                            okunmamis: number;
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
    "/v1/bildirim/kurumlar/{kurum_id}/kutu/tumunu-oku": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Tum okunmamis bildirimleri okundu isaretler. */
        post: {
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
                            guncellenen: number;
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
    "/v1/bildirim/kurumlar/{kurum_id}/tercihler": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Kategori x kanal tercih matrisi (kayit olmayan hucrelerde varsayilan uygulanmis). `sistem` kategorisi ve `kutu` kanali kilitlidir. */
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
                            tercihler: {
                                acik: boolean;
                                /** @enum {string} */
                                kanal: "kutu" | "push" | "eposta" | "sms";
                                /** @enum {string} */
                                kategori: "ders" | "yoklama" | "odev" | "soru" | "kayit" | "duyuru" | "finans" | "oyunlastirma" | "abonelik" | "sistem";
                                kilitli: boolean;
                            }[];
                        };
                    };
                };
            };
        };
        /** Verilen hucreleri gunceller (kismi guncelleme); guncel matrisi doner. Kilitli hucre 400 tercih_kilitli. */
        put: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    kurum_id: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        tercihler: {
                            acik: boolean;
                            /** @enum {string} */
                            kanal: "kutu" | "push" | "eposta" | "sms";
                            /** @enum {string} */
                            kategori: "ders" | "yoklama" | "odev" | "soru" | "kayit" | "duyuru" | "finans" | "oyunlastirma" | "abonelik" | "sistem";
                        }[];
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
                            tercihler: {
                                acik: boolean;
                                /** @enum {string} */
                                kanal: "kutu" | "push" | "eposta" | "sms";
                                /** @enum {string} */
                                kategori: "ders" | "yoklama" | "odev" | "soru" | "kayit" | "duyuru" | "finans" | "oyunlastirma" | "abonelik" | "sistem";
                                kilitli: boolean;
                            }[];
                        };
                    };
                };
            };
        };
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
