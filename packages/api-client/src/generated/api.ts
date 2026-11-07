/**
 * Uretilmis dosya: `pnpm --filter @kopru/api-client generate` ile api servisinin
 * OpenAPI anliginden (openapi/api.json) uretilir. Elle degistirmeyin.
 */

export interface paths {
    "/.well-known/jwks.json": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** JWT dogrulama anahtarlari (JWKS) */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
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
                            keys: {
                                [key: string]: unknown;
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
    "/auth/cikis": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Oturumu kapat */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
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
                            /** @enum {boolean} */
                            cikis: true;
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
    "/auth/eposta/giris": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** E-posta ve parola ile giris */
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
                        /** Format: email */
                        eposta: string;
                        parola: string;
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
                            kullanici: {
                                dil: string;
                                eposta: string | null;
                                gorunen_ad: string | null;
                                /** Format: uuid */
                                id: string;
                                telefon_e164: string | null;
                            };
                            /** @description Opak oturum belirteci. `POST /auth/token` için Bearer olarak gönderilir. */
                            oturum_belirteci: string;
                            yeni_kullanici: boolean;
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
    "/auth/eposta/kayit": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** E-posta ve parola ile kayit */
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
                        /** Format: email */
                        eposta: string;
                        gorunen_ad?: string;
                        parola: string;
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
                            kullanici: {
                                dil: string;
                                eposta: string | null;
                                gorunen_ad: string | null;
                                /** Format: uuid */
                                id: string;
                                telefon_e164: string | null;
                            };
                            /** @description Opak oturum belirteci. `POST /auth/token` için Bearer olarak gönderilir. */
                            oturum_belirteci: string;
                            yeni_kullanici: boolean;
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
    "/auth/otp/dogrula": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** OTP kodunu dogrula; oturum ac (kullanici yoksa olusturur) */
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
                        kod: string;
                        /** @description Telefon: 05xx..., 5xx..., 90 5xx... veya +905xx... biçiminde. Sunucu E.164e çevirir. */
                        telefon: string;
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
                            kullanici: {
                                dil: string;
                                eposta: string | null;
                                gorunen_ad: string | null;
                                /** Format: uuid */
                                id: string;
                                telefon_e164: string | null;
                            };
                            /** @description Opak oturum belirteci. `POST /auth/token` için Bearer olarak gönderilir. */
                            oturum_belirteci: string;
                            yeni_kullanici: boolean;
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
    "/auth/otp/gonder": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Telefona giris/kayit kodu (OTP) gonder */
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
                        /** @description Telefon: 05xx..., 5xx..., 90 5xx... veya +905xx... biçiminde. Sunucu E.164e çevirir. */
                        telefon: string;
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
                            gecerlilik_sn: number;
                            /** @enum {boolean} */
                            gonderildi: true;
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
    "/auth/token": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Erisim JWT uret / kurum-uyelik degistir
         * @description Authorization: Bearer <oturum_belirteci> (veya oturum çerezi) ile çağrılır.
         */
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
                        kurum_id?: string;
                        /** Format: uuid */
                        uyelik_id?: string;
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
                            access_token: string;
                            expires_in: number;
                            /** Format: uuid */
                            kurum_id: string | null;
                            /** @enum {string|null} */
                            rol: "sahip" | "yonetici" | "ogretmen" | "ogrenci" | "veli" | null;
                            roller: ("sahip" | "yonetici" | "ogretmen" | "ogrenci" | "veli")[];
                            /** @enum {string} */
                            token_type: "Bearer";
                            /** Format: uuid */
                            uyelik_id: string | null;
                            uyelikler: {
                                /** @enum {string} */
                                durum: "davetli" | "aktif" | "askida" | "ayrildi";
                                kurum_ad: string | null;
                                /** Format: uuid */
                                kurum_id: string;
                                /** @enum {string|null} */
                                kurum_tur: "bireysel" | "ekip" | "kurum" | null;
                                /** @enum {string} */
                                rol: "sahip" | "yonetici" | "ogretmen" | "ogrenci" | "veli";
                                /** Format: uuid */
                                sube_id: string | null;
                                /** Format: uuid */
                                uyelik_id: string;
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
    "/v1/hesap/ben": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Oturum acan kullanici, riza durumu ve uyelikleri */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
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
                            kullanici: {
                                dil: string;
                                eposta: string | null;
                                gorunen_ad: string | null;
                                /** Format: uuid */
                                id: string;
                                telefon_e164: string | null;
                            };
                            onay_gerekli: boolean;
                            uyelikler: {
                                /** @enum {string} */
                                durum: "davetli" | "aktif" | "askida" | "ayrildi";
                                kurum_ad: string | null;
                                /** Format: uuid */
                                kurum_id: string;
                                /** @enum {string|null} */
                                kurum_tur: "bireysel" | "ekip" | "kurum" | null;
                                /** @enum {string} */
                                rol: "sahip" | "yonetici" | "ogretmen" | "ogrenci" | "veli";
                                /** Format: uuid */
                                sube_id: string | null;
                                /** Format: uuid */
                                uyelik_id: string;
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
    "/v1/hesap/kurumlar": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Kurum olustur (onboarding): olusturan sahip olur; bireysel ise ogretmen de olur */
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
                        ad: string;
                        /** @description Üyelikte kullanılacak ad. */
                        gorunen_ad?: string;
                        /** @default Europe/Istanbul */
                        saat_dilimi?: string;
                        /** @enum {string} */
                        tur: "bireysel" | "ekip" | "kurum";
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
                            kurum: {
                                ad: string;
                                ayarlar: {
                                    ders_hatirlatma_dk?: number;
                                    /** Format: uri */
                                    logo_url?: string;
                                    sessiz_saat_varsayilan?: string;
                                    vurgu_rengi?: string;
                                    yoklama_kilit_gun?: number;
                                };
                                /** Format: date-time */
                                created_at: string;
                                /** @enum {string} */
                                durum: "aktif" | "askida" | "kapali";
                                /** Format: uuid */
                                id: string;
                                kisa_ad: string | null;
                                saat_dilimi: string;
                                surum: number;
                                /** @enum {string} */
                                tur: "bireysel" | "ekip" | "kurum";
                            };
                            uyelikler: {
                                /** @enum {string} */
                                durum: "davetli" | "aktif" | "askida" | "ayrildi";
                                kurum_ad: string | null;
                                /** Format: uuid */
                                kurum_id: string;
                                /** @enum {string|null} */
                                kurum_tur: "bireysel" | "ekip" | "kurum" | null;
                                /** @enum {string} */
                                rol: "sahip" | "yonetici" | "ogretmen" | "ogrenci" | "veli";
                                /** Format: uuid */
                                sube_id: string | null;
                                /** Format: uuid */
                                uyelik_id: string;
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
    "/v1/hesap/kurumlar/{kurum_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Kurum bilgileri */
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
                            ad: string;
                            ayarlar: {
                                ders_hatirlatma_dk?: number;
                                /** Format: uri */
                                logo_url?: string;
                                sessiz_saat_varsayilan?: string;
                                vurgu_rengi?: string;
                                yoklama_kilit_gun?: number;
                            };
                            /** Format: date-time */
                            created_at: string;
                            /** @enum {string} */
                            durum: "aktif" | "askida" | "kapali";
                            /** Format: uuid */
                            id: string;
                            kisa_ad: string | null;
                            saat_dilimi: string;
                            surum: number;
                            /** @enum {string} */
                            tur: "bireysel" | "ekip" | "kurum";
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
        /** Kurum temel bilgileri: ad, saat dilimi, logo adresi, vurgu rengi */
        patch: {
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
                        ad?: string;
                        /** Format: uri */
                        logo_url?: string | null;
                        saat_dilimi?: string;
                        vurgu_rengi?: string | null;
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
                            ad: string;
                            ayarlar: {
                                ders_hatirlatma_dk?: number;
                                /** Format: uri */
                                logo_url?: string;
                                sessiz_saat_varsayilan?: string;
                                vurgu_rengi?: string;
                                yoklama_kilit_gun?: number;
                            };
                            /** Format: date-time */
                            created_at: string;
                            /** @enum {string} */
                            durum: "aktif" | "askida" | "kapali";
                            /** Format: uuid */
                            id: string;
                            kisa_ad: string | null;
                            saat_dilimi: string;
                            surum: number;
                            /** @enum {string} */
                            tur: "bireysel" | "ekip" | "kurum";
                        };
                    };
                };
            };
        };
        trace?: never;
    };
    "/v1/hesap/kurumlar/{kurum_id}/modul-ayarlari": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Modul ayarlari (kurum/kademe/grup satirlari) */
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
                            ayarlar: {
                                acik: boolean;
                                /** Format: uuid */
                                id: string;
                                /** @enum {string} */
                                kapsam: "kurum" | "kademe" | "grup";
                                /** Format: uuid */
                                kapsam_id: string;
                                /** @enum {string} */
                                modul_kodu: "takvim" | "yoklama" | "geri_bildirim" | "kayitlar" | "finans" | "odev" | "haftalik_plan" | "deneme" | "soru_sor" | "oyunlastirma" | "duyuru";
                            }[];
                            kurum_etkin: {
                                [key: string]: boolean;
                            };
                        };
                    };
                };
            };
        };
        /** Modul ayari yaz; acik=null mirasa dondurur. Alt duzey yalnizca daraltabilir. */
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
                        /** @description null: mirasa dön (satır silinir). */
                        acik: boolean | null;
                        /** @enum {string} */
                        kapsam: "kurum" | "kademe" | "grup";
                        /**
                         * Format: uuid
                         * @description `kurum` kapsamında boş bırakılabilir.
                         */
                        kapsam_id?: string;
                        /** @enum {string} */
                        modul_kodu: "takvim" | "yoklama" | "geri_bildirim" | "kayitlar" | "finans" | "odev" | "haftalik_plan" | "deneme" | "soru_sor" | "oyunlastirma" | "duyuru";
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
                            ayar: {
                                acik: boolean;
                                /** Format: uuid */
                                id: string;
                                /** @enum {string} */
                                kapsam: "kurum" | "kademe" | "grup";
                                /** Format: uuid */
                                kapsam_id: string;
                                /** @enum {string} */
                                modul_kodu: "takvim" | "yoklama" | "geri_bildirim" | "kayitlar" | "finans" | "odev" | "haftalik_plan" | "deneme" | "soru_sor" | "oyunlastirma" | "duyuru";
                            } | null;
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
    "/v1/hesap/kurumlar/{kurum_id}/uyelikler": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Uyeleri listele; kapsam rolun izin kapsamina gore daralir (kurum/sube/grup/kendi) */
        get: {
            parameters: {
                query?: {
                    /** @description Önceki sayfanın `sonraki_imlec` değeri. */
                    imlec?: string;
                    limit?: number;
                    rol?: "sahip" | "yonetici" | "ogretmen" | "ogrenci" | "veli";
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
                            /** @enum {string} */
                            kapsam: "kendi" | "grup" | "sube" | "kurum";
                            /** Format: uuid */
                            sonraki_imlec: string | null;
                            uyeler: {
                                /** @enum {string} */
                                durum: "davetli" | "aktif" | "askida" | "ayrildi";
                                gorunen_ad: string | null;
                                /** Format: uuid */
                                kademe_id: string | null;
                                /** Format: date-time */
                                katildi_at: string | null;
                                /** Format: uuid */
                                kullanici_id: string;
                                /** @enum {string} */
                                rol: "sahip" | "yonetici" | "ogretmen" | "ogrenci" | "veli";
                                /** Format: uuid */
                                sube_id: string | null;
                                /** Format: uuid */
                                uyelik_id: string;
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
    "/v1/hesap/modul-ayarlari/etkin": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Modul bu kademe/grup icin acik mi? (kurum > kademe > grup) */
        get: {
            parameters: {
                query: {
                    grup_id?: string;
                    kademe_id?: string;
                    modul_kodu: "takvim" | "yoklama" | "geri_bildirim" | "kayitlar" | "finans" | "odev" | "haftalik_plan" | "deneme" | "soru_sor" | "oyunlastirma" | "duyuru";
                };
                header?: never;
                path?: never;
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
                            acik: boolean;
                            /** @enum {string} */
                            modul_kodu: "takvim" | "yoklama" | "geri_bildirim" | "kayitlar" | "finans" | "odev" | "haftalik_plan" | "deneme" | "soru_sor" | "oyunlastirma" | "duyuru";
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
    "/v1/hesap/rizalar": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** KVKK metni icin karar (kabul / ret / geri cekme) kaydet */
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
                        /**
                         * @default kabul
                         * @enum {string}
                         */
                        karar?: "kabul" | "ret" | "geri_cekildi";
                        /**
                         * @default web
                         * @enum {string}
                         */
                        kaynak?: "web" | "ios" | "android";
                        /** Format: uuid */
                        riza_metni_id: string;
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
                            /** @enum {string} */
                            karar: "kabul" | "ret" | "geri_cekildi";
                            onay_gerekli: boolean;
                            /** Format: uuid */
                            riza_id: string;
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
    "/v1/hesap/rizalar/guncel": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Guncel KVKK metin surumleri ve kullanicinin onay durumu */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
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
                            metinler: {
                                baslik: string;
                                dil: string;
                                govde_markdown: string;
                                /** @description Hex */
                                govde_sha256: string;
                                /** Format: uuid */
                                id: string;
                                kabul_edildi: boolean;
                                surum: string;
                                /** @enum {string} */
                                tur: "kvkk_aydinlatma" | "acik_riza" | "kullanim_kosullari" | "veli_onayi";
                            }[];
                            onay_gerekli: boolean;
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
    "/v1/hesap/uyeliklerim": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Uyeliklerim (tum kurumlar) */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
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
                            uyelikler: {
                                /** @enum {string} */
                                durum: "davetli" | "aktif" | "askida" | "ayrildi";
                                kurum_ad: string | null;
                                /** Format: uuid */
                                kurum_id: string;
                                /** @enum {string|null} */
                                kurum_tur: "bireysel" | "ekip" | "kurum" | null;
                                /** @enum {string} */
                                rol: "sahip" | "yonetici" | "ogretmen" | "ogrenci" | "veli";
                                /** Format: uuid */
                                sube_id: string | null;
                                /** Format: uuid */
                                uyelik_id: string;
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
