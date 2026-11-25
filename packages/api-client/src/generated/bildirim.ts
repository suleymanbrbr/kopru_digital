/**
 * Uretilmis dosya: `pnpm --filter @kopru/api-client generate` ile bildirim servisinin
 * OpenAPI anliginden (openapi/bildirim.json) uretilir. Elle degistirmeyin.
 */

export interface paths {
    "/ic/kvkk/veri": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Ic uc (servis JWT, `scope=kvkk.veri`): kullanicinin bu kurumdaki bildirim verisi (KVKK disa aktarma). */
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
                        /** Format: uuid */
                        kullanici_id: string;
                        /** Format: uuid */
                        kurum_id: string;
                        uyelik_idleri: string[];
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
                            bolumler: {
                                [key: string]: {
                                    [key: string]: unknown;
                                }[];
                            };
                            /** @enum {string} */
                            servis: "motivasyon" | "bildirim" | "medya";
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
    "/v1/bildirim/kurumlar/{kurum_id}/duyurular": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Duyurularim (alici): sabitler uste, yayin zamanina gore yeniden eskiye; suresi gecen, arsivlenen ve silinenler gizli. */
        get: {
            parameters: {
                query?: {
                    limit?: number;
                    offset?: number;
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
                                bitis_at: string | null;
                                govde: string;
                                /** Format: uuid */
                                hedef_id: string;
                                /** @enum {string} */
                                hedef_turu: "grup" | "kademe" | "kurum";
                                /** Format: uuid */
                                id: string;
                                /** Format: date-time */
                                okundu_at: string | null;
                                sabit: boolean;
                                /** Format: date-time */
                                yayin_at: string;
                                /** Format: uuid */
                                yazar_id: string;
                            }[];
                            toplam: number;
                        };
                    };
                };
            };
        };
        put?: never;
        /** Duyuru taslagi olusturur. Ogretmen yalniz atandigi gruba; yonetici/sahip her hedefe yazar. Yayin ayri uctadir. */
        post: {
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
                        baslik: string;
                        /** Format: date-time */
                        bitis_at?: string | null;
                        govde: string;
                        /** Format: uuid */
                        hedef_id?: string;
                        /**
                         * @default [
                         *       "ogrenci"
                         *     ]
                         */
                        hedef_roller?: ("ogrenci" | "ogretmen")[];
                        /** @enum {string} */
                        hedef_turu: "grup" | "kademe" | "kurum";
                        /** @default true */
                        push_gonderildi?: boolean;
                        /** @default false */
                        sabit?: boolean;
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
                            alici_sayisi: number;
                            baslik: string;
                            /** Format: date-time */
                            bitis_at: string | null;
                            /** Format: date-time */
                            created_at: string;
                            dagitim_tamam: boolean;
                            /** @enum {string} */
                            durum: "taslak" | "yayinda" | "arsiv";
                            govde: string;
                            /** Format: uuid */
                            hedef_id: string;
                            hedef_roller: ("ogrenci" | "ogretmen")[];
                            /** @enum {string} */
                            hedef_turu: "grup" | "kademe" | "kurum";
                            /** Format: uuid */
                            id: string;
                            okunan_sayisi: number;
                            push_gonderildi: boolean;
                            sabit: boolean;
                            /** Format: date-time */
                            updated_at: string;
                            /** Format: date-time */
                            yayin_at: string | null;
                            /** Format: uuid */
                            yazar_id: string;
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
    "/v1/bildirim/kurumlar/{kurum_id}/duyurular/{duyuru_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Tekil duyuru. Alici icin yalniz kendi (yayindaki, suresi gecmemis) duyurusu; yazar/yonetici icin her durumda, `yonetim` blogu ile. */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    duyuru_id: string;
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
                            baslik: string;
                            /** Format: date-time */
                            bitis_at: string | null;
                            govde: string;
                            /** Format: uuid */
                            hedef_id: string;
                            /** @enum {string} */
                            hedef_turu: "grup" | "kademe" | "kurum";
                            /** Format: uuid */
                            id: string;
                            /** Format: date-time */
                            okundu_at: string | null;
                            sabit: boolean;
                            /** Format: date-time */
                            yayin_at: string | null;
                            /** Format: uuid */
                            yazar_id: string;
                            yonetim: {
                                alici_sayisi: number;
                                baslik: string;
                                /** Format: date-time */
                                bitis_at: string | null;
                                /** Format: date-time */
                                created_at: string;
                                dagitim_tamam: boolean;
                                /** @enum {string} */
                                durum: "taslak" | "yayinda" | "arsiv";
                                govde: string;
                                /** Format: uuid */
                                hedef_id: string;
                                hedef_roller: ("ogrenci" | "ogretmen")[];
                                /** @enum {string} */
                                hedef_turu: "grup" | "kademe" | "kurum";
                                /** Format: uuid */
                                id: string;
                                okunan_sayisi: number;
                                push_gonderildi: boolean;
                                sabit: boolean;
                                /** Format: date-time */
                                updated_at: string;
                                /** Format: date-time */
                                yayin_at: string | null;
                                /** Format: uuid */
                                yazar_id: string;
                            } | null;
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        /** Duyuruyu siler (yumusak silme; kutudaki bildirimleri de gizlenir). */
        delete: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    duyuru_id: string;
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
                            /** Format: uuid */
                            id: string;
                            /** @enum {boolean} */
                            silindi: true;
                        };
                    };
                };
            };
        };
        options?: never;
        head?: never;
        /** Duyuruyu gunceller. Taslakta tum alanlar; yayindakinde yalniz `sabit` ve `bitis_at` (arsivde 409). */
        patch: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    duyuru_id: string;
                    kurum_id: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        baslik?: string;
                        /** Format: date-time */
                        bitis_at?: string | null;
                        govde?: string;
                        /** Format: uuid */
                        hedef_id?: string;
                        hedef_roller?: ("ogrenci" | "ogretmen")[];
                        /** @enum {string} */
                        hedef_turu?: "grup" | "kademe" | "kurum";
                        push_gonderildi?: boolean;
                        sabit?: boolean;
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
                            alici_sayisi: number;
                            baslik: string;
                            /** Format: date-time */
                            bitis_at: string | null;
                            /** Format: date-time */
                            created_at: string;
                            dagitim_tamam: boolean;
                            /** @enum {string} */
                            durum: "taslak" | "yayinda" | "arsiv";
                            govde: string;
                            /** Format: uuid */
                            hedef_id: string;
                            hedef_roller: ("ogrenci" | "ogretmen")[];
                            /** @enum {string} */
                            hedef_turu: "grup" | "kademe" | "kurum";
                            /** Format: uuid */
                            id: string;
                            okunan_sayisi: number;
                            push_gonderildi: boolean;
                            sabit: boolean;
                            /** Format: date-time */
                            updated_at: string;
                            /** Format: date-time */
                            yayin_at: string | null;
                            /** Format: uuid */
                            yazar_id: string;
                        };
                    };
                };
            };
        };
        trace?: never;
    };
    "/v1/bildirim/kurumlar/{kurum_id}/duyurular/{duyuru_id}/arsivle": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Yayindaki duyuruyu arsivler: alicilarin listesinden ve kutusundan kalkar. */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    duyuru_id: string;
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
                            alici_sayisi: number;
                            baslik: string;
                            /** Format: date-time */
                            bitis_at: string | null;
                            /** Format: date-time */
                            created_at: string;
                            dagitim_tamam: boolean;
                            /** @enum {string} */
                            durum: "taslak" | "yayinda" | "arsiv";
                            govde: string;
                            /** Format: uuid */
                            hedef_id: string;
                            hedef_roller: ("ogrenci" | "ogretmen")[];
                            /** @enum {string} */
                            hedef_turu: "grup" | "kademe" | "kurum";
                            /** Format: uuid */
                            id: string;
                            okunan_sayisi: number;
                            push_gonderildi: boolean;
                            sabit: boolean;
                            /** Format: date-time */
                            updated_at: string;
                            /** Format: date-time */
                            yayin_at: string | null;
                            /** Format: uuid */
                            yazar_id: string;
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
    "/v1/bildirim/kurumlar/{kurum_id}/duyurular/{duyuru_id}/okundu": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Duyuruyu okundu isaretler: okunan sayaci yalniz ilk okumada artar; kutudaki duyuru bildirimi de okundu olur. */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    duyuru_id: string;
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
                            /** Format: uuid */
                            duyuru_id: string;
                            /** Format: date-time */
                            okundu_at: string;
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
    "/v1/bildirim/kurumlar/{kurum_id}/duyurular/{duyuru_id}/okuyanlar": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Duyuruyu okuyanlar (yazar/yonetici): yalniz uyelik kimlikleri, adlar istemcide api`den cozulur. */
        get: {
            parameters: {
                query?: {
                    limit?: number;
                    offset?: number;
                };
                header?: never;
                path: {
                    duyuru_id: string;
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
                            alici_sayisi: number;
                            okunan_sayisi: number;
                            okuyanlar: {
                                /** Format: uuid */
                                alici_id: string;
                                /** Format: date-time */
                                okundu_at: string;
                            }[];
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
    "/v1/bildirim/kurumlar/{kurum_id}/duyurular/{duyuru_id}/yayinla": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Taslagi yayinlar: alicilar cozulur (`duyuru_alicilari`), kutu bildirimi ve (`push_gonderildi` ise) genel metinli push uretilir. `duyuru` modulu kapaliysa 403 `modul_kapali`. */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    duyuru_id: string;
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
                            alici_sayisi: number;
                            baslik: string;
                            /** Format: date-time */
                            bitis_at: string | null;
                            /** Format: date-time */
                            created_at: string;
                            dagitim_tamam: boolean;
                            /** @enum {string} */
                            durum: "taslak" | "yayinda" | "arsiv";
                            govde: string;
                            /** Format: uuid */
                            hedef_id: string;
                            hedef_roller: ("ogrenci" | "ogretmen")[];
                            /** @enum {string} */
                            hedef_turu: "grup" | "kademe" | "kurum";
                            /** Format: uuid */
                            id: string;
                            okunan_sayisi: number;
                            push_gonderildi: boolean;
                            sabit: boolean;
                            /** Format: date-time */
                            updated_at: string;
                            /** Format: date-time */
                            yayin_at: string | null;
                            /** Format: uuid */
                            yazar_id: string;
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
    "/v1/bildirim/kurumlar/{kurum_id}/duyurular/yonetim": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Yazar/yonetici listesi (alici ve okunan sayisiyla). Ogretmen yalniz kendi duyurularini, yonetici/sahip kurumun tumunu gorur. */
        get: {
            parameters: {
                query?: {
                    durum?: "taslak" | "yayinda" | "arsiv";
                    limit?: number;
                    offset?: number;
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
                                alici_sayisi: number;
                                baslik: string;
                                /** Format: date-time */
                                bitis_at: string | null;
                                /** Format: date-time */
                                created_at: string;
                                dagitim_tamam: boolean;
                                /** @enum {string} */
                                durum: "taslak" | "yayinda" | "arsiv";
                                govde: string;
                                /** Format: uuid */
                                hedef_id: string;
                                hedef_roller: ("ogrenci" | "ogretmen")[];
                                /** @enum {string} */
                                hedef_turu: "grup" | "kademe" | "kurum";
                                /** Format: uuid */
                                id: string;
                                okunan_sayisi: number;
                                push_gonderildi: boolean;
                                sabit: boolean;
                                /** Format: date-time */
                                updated_at: string;
                                /** Format: date-time */
                                yayin_at: string | null;
                                /** Format: uuid */
                                yazar_id: string;
                            }[];
                            toplam: number;
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
