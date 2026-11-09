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
    "/auth/eposta/dogrula": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** E-postadaki baglantidaki belirtecle e-posta adresini dogrula */
        get: {
            parameters: {
                query: {
                    /** @description E-postadaki doğrulama bağlantısındaki belirteç. */
                    belirtec: string;
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
                            /** @enum {boolean} */
                            dogrulandi: true;
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
    "/auth/eposta/dogrulama-gonder": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * E-posta dogrulama baglantisini yeniden gonder
         * @description Kullanici/dogrulama durumu ifsa edilmez: kayitli ve dogrulanmamis adres icin gonderilir, yanit her zaman aynidir.
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
                        /** Format: email */
                        eposta: string;
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
    "/v1/ders/kurumlar/{kurum_id}/dersler": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Ders listesi (takvim araligi, en cok 100 gun; anahtar tabanli sayfalama). Kapsam rolun izin kapsamina gore daralir: ogrenci yalniz katilimcisi oldugu dersleri gorur. */
        get: {
            parameters: {
                query: {
                    /** @description Aralık başı (UTC önerilir: `...Z`). */
                    baslangic: string;
                    /** @description Aralık sonu; en çok 100 gün. */
                    bitis: string;
                    durum?: "planli" | "tamamlandi" | "iptal";
                    grup_id?: string;
                    /** @description Önceki sayfanın `sonraki_imlec` değeri. */
                    imlec?: string;
                    limit?: number;
                    ogrenci_id?: string;
                    ogretmen_id?: string;
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
                            dersler: {
                                /** Format: date-time */
                                baslangic_at: string;
                                baslik: string | null;
                                /** Format: date-time */
                                bitis_at: string;
                                brans_kodu: string;
                                cakisma_onayli: boolean;
                                /** Format: date-time */
                                created_at: string;
                                /** @enum {string} */
                                durum: "planli" | "tamamlandi" | "iptal";
                                ertelendi_sayisi: number;
                                gec_iptal: boolean;
                                /** Format: uuid */
                                grup_id: string;
                                /** Format: uuid */
                                id: string;
                                /** Format: date-time */
                                ilk_baslangic_at: string;
                                /** Format: date-time */
                                iptal_at: string | null;
                                /** Format: uuid */
                                iptal_eden_id: string | null;
                                /** @enum {string|null} */
                                iptal_kaynagi: "ogretmen" | "ogrenci" | "yonetici" | null;
                                iptal_nedeni: string | null;
                                katilimci_sayisi: number;
                                /** Format: uuid */
                                konu_id: string | null;
                                /** Format: uuid */
                                ogretmen_id: string;
                                online_baglanti: string | null;
                                /** Format: uuid */
                                seri_id: string | null;
                                seri_istisna: boolean;
                                seri_sirasi: number | null;
                                surum: number;
                                telafi: boolean;
                                /** Format: uuid */
                                telafi_kaynak_ders_id: string | null;
                                yer: string | null;
                            }[];
                            sonraki_imlec: string | null;
                        };
                    };
                };
            };
        };
        put?: never;
        /** Tekil ders olustur. Ogretmen cakismasinda 409 ders_cakismasi; cakisma_onayli:true ile yazilir. Ogrenci cakismasi yanitta uyaridir. */
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
                        /** @description Yerel saat, SS:DD (24 saat). */
                        baslangic_saati: string;
                        baslik?: string;
                        /** @description Boşsa öğretmenin gruptaki atamasının branşı. */
                        brans_kodu?: string;
                        /**
                         * @description Öğretmen çakışması bilerek onaylandı (`409 ders_cakismasi` sonrası).
                         * @default false
                         */
                        cakisma_onayli?: boolean;
                        /** Format: uuid */
                        grup_id: string;
                        /** Format: uuid */
                        konu_id?: string;
                        /**
                         * Format: uuid
                         * @description Boşsa: öğretmen çağıranın kendisi; sahip/yönetici için aynı kullanıcının öğretmen üyeliği (yoksa 422).
                         */
                        ogretmen_id?: string;
                        online_baglanti?: string;
                        sure_dk: number;
                        /** Format: date */
                        tarih: string;
                        /** @default false */
                        telafi?: boolean;
                        /** Format: uuid */
                        telafi_kaynak_ders_id?: string;
                        yer?: string;
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
                            ders: {
                                /** Format: date-time */
                                baslangic_at: string;
                                baslik: string | null;
                                /** Format: date-time */
                                bitis_at: string;
                                brans_kodu: string;
                                cakisma_onayli: boolean;
                                /** Format: date-time */
                                created_at: string;
                                /** @enum {string} */
                                durum: "planli" | "tamamlandi" | "iptal";
                                ertelendi_sayisi: number;
                                gec_iptal: boolean;
                                /** Format: uuid */
                                grup_id: string;
                                /** Format: uuid */
                                id: string;
                                /** Format: date-time */
                                ilk_baslangic_at: string;
                                /** Format: date-time */
                                iptal_at: string | null;
                                /** Format: uuid */
                                iptal_eden_id: string | null;
                                /** @enum {string|null} */
                                iptal_kaynagi: "ogretmen" | "ogrenci" | "yonetici" | null;
                                iptal_nedeni: string | null;
                                katilimci_sayisi: number;
                                /** @description Öğrenci rolünde yalnız kendisi görünür. */
                                katilimcilar: {
                                    gorunen_ad: string | null;
                                    /**
                                     * Format: uuid
                                     * @description Öğrenci üyeliği (`uyelikler.id`).
                                     */
                                    ogrenci_id: string;
                                    /** @enum {string} */
                                    tur: "uye" | "misafir" | "telafi";
                                }[];
                                /** Format: uuid */
                                konu_id: string | null;
                                /** Format: uuid */
                                ogretmen_id: string;
                                online_baglanti: string | null;
                                /** Format: uuid */
                                seri_id: string | null;
                                seri_istisna: boolean;
                                seri_sirasi: number | null;
                                surum: number;
                                telafi: boolean;
                                /** Format: uuid */
                                telafi_kaynak_ders_id: string | null;
                                yer: string | null;
                            };
                            uyari: {
                                /** Format: uuid */
                                cakisan_ders_id: string;
                                /** Format: uuid */
                                ders_id: string;
                                /** @enum {string} */
                                kod: "ogrenci_cakismasi";
                                ogrenci_idleri: string[];
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
    "/v1/ders/kurumlar/{kurum_id}/dersler/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Tekil ders ve katilimcilari (kapsam disi: 404). Ogrenci rolunde yalniz kendisi gorunur. */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
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
                            baslangic_at: string;
                            baslik: string | null;
                            /** Format: date-time */
                            bitis_at: string;
                            brans_kodu: string;
                            cakisma_onayli: boolean;
                            /** Format: date-time */
                            created_at: string;
                            /** @enum {string} */
                            durum: "planli" | "tamamlandi" | "iptal";
                            ertelendi_sayisi: number;
                            gec_iptal: boolean;
                            /** Format: uuid */
                            grup_id: string;
                            /** Format: uuid */
                            id: string;
                            /** Format: date-time */
                            ilk_baslangic_at: string;
                            /** Format: date-time */
                            iptal_at: string | null;
                            /** Format: uuid */
                            iptal_eden_id: string | null;
                            /** @enum {string|null} */
                            iptal_kaynagi: "ogretmen" | "ogrenci" | "yonetici" | null;
                            iptal_nedeni: string | null;
                            katilimci_sayisi: number;
                            /** @description Öğrenci rolünde yalnız kendisi görünür. */
                            katilimcilar: {
                                gorunen_ad: string | null;
                                /**
                                 * Format: uuid
                                 * @description Öğrenci üyeliği (`uyelikler.id`).
                                 */
                                ogrenci_id: string;
                                /** @enum {string} */
                                tur: "uye" | "misafir" | "telafi";
                            }[];
                            /** Format: uuid */
                            konu_id: string | null;
                            /** Format: uuid */
                            ogretmen_id: string;
                            online_baglanti: string | null;
                            /** Format: uuid */
                            seri_id: string | null;
                            seri_istisna: boolean;
                            seri_sirasi: number | null;
                            surum: number;
                            telafi: boolean;
                            /** Format: uuid */
                            telafi_kaynak_ders_id: string | null;
                            yer: string | null;
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
        /** Ders bilgisi guncelle (baslik, konu, online baglanti, yer). `surum` zorunlu (eskiyse 409). `yalniz_bu` seri dersini seriden ayirir (seri_istisna); `bu_ve_sonrakiler` yalniz seri_istisna=false gelecek dersleri ve seri kuralini gunceller. */
        patch: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                    kurum_id: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        baslik?: string | null;
                        /**
                         * @description `bu_ve_sonrakiler` yalnız seri dersinde geçerlidir ve yalnız `seri_istisna=false` gelecek dersleri etkiler.
                         * @default yalniz_bu
                         * @enum {string}
                         */
                        kapsam?: "yalniz_bu" | "bu_ve_sonrakiler";
                        /** Format: uuid */
                        konu_id?: string | null;
                        online_baglanti?: string | null;
                        /** @description Okunan `surum`; eskiyse 409. */
                        surum: number;
                        yer?: string | null;
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
                            ders: {
                                /** Format: date-time */
                                baslangic_at: string;
                                baslik: string | null;
                                /** Format: date-time */
                                bitis_at: string;
                                brans_kodu: string;
                                cakisma_onayli: boolean;
                                /** Format: date-time */
                                created_at: string;
                                /** @enum {string} */
                                durum: "planli" | "tamamlandi" | "iptal";
                                ertelendi_sayisi: number;
                                gec_iptal: boolean;
                                /** Format: uuid */
                                grup_id: string;
                                /** Format: uuid */
                                id: string;
                                /** Format: date-time */
                                ilk_baslangic_at: string;
                                /** Format: date-time */
                                iptal_at: string | null;
                                /** Format: uuid */
                                iptal_eden_id: string | null;
                                /** @enum {string|null} */
                                iptal_kaynagi: "ogretmen" | "ogrenci" | "yonetici" | null;
                                iptal_nedeni: string | null;
                                katilimci_sayisi: number;
                                /** @description Öğrenci rolünde yalnız kendisi görünür. */
                                katilimcilar: {
                                    gorunen_ad: string | null;
                                    /**
                                     * Format: uuid
                                     * @description Öğrenci üyeliği (`uyelikler.id`).
                                     */
                                    ogrenci_id: string;
                                    /** @enum {string} */
                                    tur: "uye" | "misafir" | "telafi";
                                }[];
                                /** Format: uuid */
                                konu_id: string | null;
                                /** Format: uuid */
                                ogretmen_id: string;
                                online_baglanti: string | null;
                                /** Format: uuid */
                                seri_id: string | null;
                                seri_istisna: boolean;
                                seri_sirasi: number | null;
                                surum: number;
                                telafi: boolean;
                                /** Format: uuid */
                                telafi_kaynak_ders_id: string | null;
                                yer: string | null;
                            };
                            /** @description Seçilen ders dahil değişen tüm dersler. */
                            etkilenen_ders_idleri: string[];
                            uyari: {
                                /** Format: uuid */
                                cakisan_ders_id: string;
                                /** Format: uuid */
                                ders_id: string;
                                /** @enum {string} */
                                kod: "ogrenci_cakismasi";
                                ogrenci_idleri: string[];
                            }[];
                        };
                    };
                };
            };
        };
        trace?: never;
    };
    "/v1/ders/kurumlar/{kurum_id}/dersler/{id}/iptal": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Dersi iptal et. `iptal_kaynagi=ogrenci` yalniz birebir grupta (degilse 422); `gec_iptal` sunucuda hesaplanir. `bu_ve_sonrakiler` seriyi bu dersten itibaren sonlandirir. */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                    kurum_id: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        /**
                         * @description `ogrenci` yalnız birebir grupta kabul edilir.
                         * @enum {string}
                         */
                        iptal_kaynagi: "ogretmen" | "ogrenci" | "yonetici";
                        iptal_nedeni?: string;
                        /**
                         * @description `bu_ve_sonrakiler` yalnız seri dersinde geçerlidir ve yalnız `seri_istisna=false` gelecek dersleri etkiler.
                         * @default yalniz_bu
                         * @enum {string}
                         */
                        kapsam?: "yalniz_bu" | "bu_ve_sonrakiler";
                        surum?: number;
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
                            ders: {
                                /** Format: date-time */
                                baslangic_at: string;
                                baslik: string | null;
                                /** Format: date-time */
                                bitis_at: string;
                                brans_kodu: string;
                                cakisma_onayli: boolean;
                                /** Format: date-time */
                                created_at: string;
                                /** @enum {string} */
                                durum: "planli" | "tamamlandi" | "iptal";
                                ertelendi_sayisi: number;
                                gec_iptal: boolean;
                                /** Format: uuid */
                                grup_id: string;
                                /** Format: uuid */
                                id: string;
                                /** Format: date-time */
                                ilk_baslangic_at: string;
                                /** Format: date-time */
                                iptal_at: string | null;
                                /** Format: uuid */
                                iptal_eden_id: string | null;
                                /** @enum {string|null} */
                                iptal_kaynagi: "ogretmen" | "ogrenci" | "yonetici" | null;
                                iptal_nedeni: string | null;
                                katilimci_sayisi: number;
                                /** @description Öğrenci rolünde yalnız kendisi görünür. */
                                katilimcilar: {
                                    gorunen_ad: string | null;
                                    /**
                                     * Format: uuid
                                     * @description Öğrenci üyeliği (`uyelikler.id`).
                                     */
                                    ogrenci_id: string;
                                    /** @enum {string} */
                                    tur: "uye" | "misafir" | "telafi";
                                }[];
                                /** Format: uuid */
                                konu_id: string | null;
                                /** Format: uuid */
                                ogretmen_id: string;
                                online_baglanti: string | null;
                                /** Format: uuid */
                                seri_id: string | null;
                                seri_istisna: boolean;
                                seri_sirasi: number | null;
                                surum: number;
                                telafi: boolean;
                                /** Format: uuid */
                                telafi_kaynak_ders_id: string | null;
                                yer: string | null;
                            };
                            /** @description Seçilen ders dahil değişen tüm dersler. */
                            etkilenen_ders_idleri: string[];
                            uyari: {
                                /** Format: uuid */
                                cakisan_ders_id: string;
                                /** Format: uuid */
                                ders_id: string;
                                /** @enum {string} */
                                kod: "ogrenci_cakismasi";
                                ogrenci_idleri: string[];
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
    "/v1/ders/kurumlar/{kurum_id}/dersler/{id}/katilimcilar": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Derse misafir veya telafi ogrencisi ekle */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                    kurum_id: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        /** Format: uuid */
                        ogrenci_id: string;
                        /**
                         * @default misafir
                         * @enum {string}
                         */
                        tur?: "misafir" | "telafi";
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
                            ders: {
                                /** Format: date-time */
                                baslangic_at: string;
                                baslik: string | null;
                                /** Format: date-time */
                                bitis_at: string;
                                brans_kodu: string;
                                cakisma_onayli: boolean;
                                /** Format: date-time */
                                created_at: string;
                                /** @enum {string} */
                                durum: "planli" | "tamamlandi" | "iptal";
                                ertelendi_sayisi: number;
                                gec_iptal: boolean;
                                /** Format: uuid */
                                grup_id: string;
                                /** Format: uuid */
                                id: string;
                                /** Format: date-time */
                                ilk_baslangic_at: string;
                                /** Format: date-time */
                                iptal_at: string | null;
                                /** Format: uuid */
                                iptal_eden_id: string | null;
                                /** @enum {string|null} */
                                iptal_kaynagi: "ogretmen" | "ogrenci" | "yonetici" | null;
                                iptal_nedeni: string | null;
                                katilimci_sayisi: number;
                                /** @description Öğrenci rolünde yalnız kendisi görünür. */
                                katilimcilar: {
                                    gorunen_ad: string | null;
                                    /**
                                     * Format: uuid
                                     * @description Öğrenci üyeliği (`uyelikler.id`).
                                     */
                                    ogrenci_id: string;
                                    /** @enum {string} */
                                    tur: "uye" | "misafir" | "telafi";
                                }[];
                                /** Format: uuid */
                                konu_id: string | null;
                                /** Format: uuid */
                                ogretmen_id: string;
                                online_baglanti: string | null;
                                /** Format: uuid */
                                seri_id: string | null;
                                seri_istisna: boolean;
                                seri_sirasi: number | null;
                                surum: number;
                                telafi: boolean;
                                /** Format: uuid */
                                telafi_kaynak_ders_id: string | null;
                                yer: string | null;
                            };
                            /** @description Seçilen ders dahil değişen tüm dersler. */
                            etkilenen_ders_idleri: string[];
                            uyari: {
                                /** Format: uuid */
                                cakisan_ders_id: string;
                                /** Format: uuid */
                                ders_id: string;
                                /** @enum {string} */
                                kod: "ogrenci_cakismasi";
                                ogrenci_idleri: string[];
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
    "/v1/ders/kurumlar/{kurum_id}/dersler/{id}/katilimcilar/{ogrenci_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** Ogrenciyi dersin katilimcilarindan cikar (planli veya tamamlanmis ders). Yoklamasi olan katilimci 409 katilimci_yoklamali. */
        delete: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
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
                            ders: {
                                /** Format: date-time */
                                baslangic_at: string;
                                baslik: string | null;
                                /** Format: date-time */
                                bitis_at: string;
                                brans_kodu: string;
                                cakisma_onayli: boolean;
                                /** Format: date-time */
                                created_at: string;
                                /** @enum {string} */
                                durum: "planli" | "tamamlandi" | "iptal";
                                ertelendi_sayisi: number;
                                gec_iptal: boolean;
                                /** Format: uuid */
                                grup_id: string;
                                /** Format: uuid */
                                id: string;
                                /** Format: date-time */
                                ilk_baslangic_at: string;
                                /** Format: date-time */
                                iptal_at: string | null;
                                /** Format: uuid */
                                iptal_eden_id: string | null;
                                /** @enum {string|null} */
                                iptal_kaynagi: "ogretmen" | "ogrenci" | "yonetici" | null;
                                iptal_nedeni: string | null;
                                katilimci_sayisi: number;
                                /** @description Öğrenci rolünde yalnız kendisi görünür. */
                                katilimcilar: {
                                    gorunen_ad: string | null;
                                    /**
                                     * Format: uuid
                                     * @description Öğrenci üyeliği (`uyelikler.id`).
                                     */
                                    ogrenci_id: string;
                                    /** @enum {string} */
                                    tur: "uye" | "misafir" | "telafi";
                                }[];
                                /** Format: uuid */
                                konu_id: string | null;
                                /** Format: uuid */
                                ogretmen_id: string;
                                online_baglanti: string | null;
                                /** Format: uuid */
                                seri_id: string | null;
                                seri_istisna: boolean;
                                seri_sirasi: number | null;
                                surum: number;
                                telafi: boolean;
                                /** Format: uuid */
                                telafi_kaynak_ders_id: string | null;
                                yer: string | null;
                            };
                            /** @description Seçilen ders dahil değişen tüm dersler. */
                            etkilenen_ders_idleri: string[];
                            uyari: {
                                /** Format: uuid */
                                cakisan_ders_id: string;
                                /** Format: uuid */
                                ders_id: string;
                                /** @enum {string} */
                                kod: "ogrenci_cakismasi";
                                ogrenci_idleri: string[];
                            }[];
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
    "/v1/ders/kurumlar/{kurum_id}/dersler/{id}/tasi": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Dersi yeni gun/saate tasi (erteleme). `yalniz_bu` dersi seriden ayirir; `bu_ve_sonrakiler` yalniz saati degistirir (gun degisikligi 422), seri kurali da guncellenir ve istisna dersler korunur. */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                    kurum_id: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        /** @default false */
                        cakisma_onayli?: boolean;
                        /**
                         * @description `bu_ve_sonrakiler` yalnız seri dersinde geçerlidir ve yalnız `seri_istisna=false` gelecek dersleri etkiler.
                         * @default yalniz_bu
                         * @enum {string}
                         */
                        kapsam?: "yalniz_bu" | "bu_ve_sonrakiler";
                        surum: number;
                        /** @description Yerel saat, SS:DD (24 saat). */
                        yeni_saat?: string;
                        /**
                         * Format: date
                         * @description Yeni yerel gün. `bu_ve_sonrakiler` kapsamında değiştirilemez.
                         */
                        yeni_tarih?: string;
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
                            ders: {
                                /** Format: date-time */
                                baslangic_at: string;
                                baslik: string | null;
                                /** Format: date-time */
                                bitis_at: string;
                                brans_kodu: string;
                                cakisma_onayli: boolean;
                                /** Format: date-time */
                                created_at: string;
                                /** @enum {string} */
                                durum: "planli" | "tamamlandi" | "iptal";
                                ertelendi_sayisi: number;
                                gec_iptal: boolean;
                                /** Format: uuid */
                                grup_id: string;
                                /** Format: uuid */
                                id: string;
                                /** Format: date-time */
                                ilk_baslangic_at: string;
                                /** Format: date-time */
                                iptal_at: string | null;
                                /** Format: uuid */
                                iptal_eden_id: string | null;
                                /** @enum {string|null} */
                                iptal_kaynagi: "ogretmen" | "ogrenci" | "yonetici" | null;
                                iptal_nedeni: string | null;
                                katilimci_sayisi: number;
                                /** @description Öğrenci rolünde yalnız kendisi görünür. */
                                katilimcilar: {
                                    gorunen_ad: string | null;
                                    /**
                                     * Format: uuid
                                     * @description Öğrenci üyeliği (`uyelikler.id`).
                                     */
                                    ogrenci_id: string;
                                    /** @enum {string} */
                                    tur: "uye" | "misafir" | "telafi";
                                }[];
                                /** Format: uuid */
                                konu_id: string | null;
                                /** Format: uuid */
                                ogretmen_id: string;
                                online_baglanti: string | null;
                                /** Format: uuid */
                                seri_id: string | null;
                                seri_istisna: boolean;
                                seri_sirasi: number | null;
                                surum: number;
                                telafi: boolean;
                                /** Format: uuid */
                                telafi_kaynak_ders_id: string | null;
                                yer: string | null;
                            };
                            /** @description Seçilen ders dahil değişen tüm dersler. */
                            etkilenen_ders_idleri: string[];
                            uyari: {
                                /** Format: uuid */
                                cakisan_ders_id: string;
                                /** Format: uuid */
                                ders_id: string;
                                /** @enum {string} */
                                kod: "ogrenci_cakismasi";
                                ogrenci_idleri: string[];
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
    "/v1/ders/kurumlar/{kurum_id}/dersler/{id}/yoklamalar": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Dersin katilimcilari ve (varsa) yoklamalari; yoklamasi olmayan katilimci da listelenir. Personel tum katilimcilari gorur; ogrenci yalniz kendisini ve `ogretmene_ozel` notu hic gormez. Liste grup uyeligiyle esitlenir (planli ders). */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
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
                            ders: {
                                /** Format: date-time */
                                baslangic_at: string;
                                /** Format: date-time */
                                bitis_at: string;
                                /** @enum {string} */
                                durum: "planli" | "tamamlandi" | "iptal";
                                /** Format: uuid */
                                grup_id: string;
                                /** Format: uuid */
                                id: string;
                            };
                            katilimcilar: {
                                gorunen_ad: string | null;
                                /** Format: uuid */
                                ogrenci_id: string;
                                /** @enum {string} */
                                tur: "uye" | "misafir" | "telafi";
                                /** @description Yoklaması henüz alınmamışsa `null`. */
                                yoklama: {
                                    /** Format: uuid */
                                    ders_id: string;
                                    /** @enum {string} */
                                    durum: "geldi" | "gelmedi" | "izinli" | "gec";
                                    gec_dakika: number | null;
                                    /** Format: uuid */
                                    id: string;
                                    /** Format: date-time */
                                    isaretlenme_at: string;
                                    /** Format: uuid */
                                    isaretleyen_id: string;
                                    /** @description Öğrenci rolünde `ogretmene_ozel` not hep `null`. */
                                    not: string | null;
                                    /**
                                     * @description `ogretmene_ozel` (varsayılan): not öğrenciye ve hiçbir olaya dönmez. `ogrenciye`: öğrenci kendi yoklamasında görür.
                                     * @enum {string}
                                     */
                                    not_gorunurluk: "ogretmene_ozel" | "ogrenciye";
                                    /** Format: uuid */
                                    ogrenci_id: string;
                                    /** Format: date-time */
                                    sunucu_at: string;
                                    surum: number;
                                } | null;
                            }[];
                        };
                    };
                };
            };
        };
        /** Yoklama al/duzelt (toplu, tek islem). `Idempotency-Key` (UUID) zorunlu: ayni anahtar+govde kayitli yaniti `Idempotent-Replayed: true` ile aynen doner, ayni anahtar farkli govde 422. Satir basina `sonuc`: yeni | guncellendi | ayni (icerik ayni, hicbir sey yazilmaz) | eski (istemci saati mevcuttan eski, yazilmaz). Tek satir hata verirse hicbiri yazilmaz. Ilk basarili yazim dersi `tamamlandi` yapar. Gelecek ders 422, iptal ders 409, kilitli ders 403 (yalniz ogretmen). */
        put: {
            parameters: {
                query?: never;
                header: {
                    /** @description İstemcinin ürettiği UUID (çevrimdışı kuyruk her denemede aynısını gönderir). */
                    "idempotency-key": string;
                };
                path: {
                    id: string;
                    kurum_id: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        yoklamalar: {
                            /** @enum {string} */
                            durum: "geldi" | "gelmedi" | "izinli" | "gec";
                            /** @description `durum=gec` ise zorunlu (1-240), aksi hâlde verilemez. */
                            gec_dakika?: number;
                            /**
                             * Format: date-time
                             * @description İstemci saati (çevrimdışı kuyrukta işaretlenme anı). Mevcut kayıttan eskiyse `sonuc: eski`.
                             */
                            isaretlenme_at: string;
                            /** @description Kısa ders notu. Satır tam yazılır: verilmezse mevcut not silinir. */
                            not?: string | null;
                            /**
                             * @description `ogretmene_ozel` (varsayılan): not öğrenciye ve hiçbir olaya dönmez. `ogrenciye`: öğrenci kendi yoklamasında görür.
                             * @enum {string}
                             */
                            not_gorunurluk?: "ogretmene_ozel" | "ogrenciye";
                            /**
                             * Format: uuid
                             * @description Dersin katılımcısı olan öğrenci üyeliği.
                             */
                            ogrenci_id: string;
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
                            /** @enum {string} */
                            ders_durumu: "planli" | "tamamlandi" | "iptal";
                            /** Format: uuid */
                            ders_id: string;
                            sonuclar: {
                                /** @description Bu işlem kredi bakiyesini değiştirdiyse güncel kalan kredi, yoksa `null`. */
                                kalan_kredi: number | null;
                                /** Format: uuid */
                                ogrenci_id: string;
                                /**
                                 * @description `yeni`/`guncellendi`: yazıldı. `ayni`: içerik birebir aynı, hiçbir şey değişmedi. `eski`: istemci saati mevcut kayıttan eski, yazılmadı.
                                 * @enum {string}
                                 */
                                sonuc: "yeni" | "guncellendi" | "ayni" | "eski";
                                /** @enum {string|null} */
                                uyari: "ucret_tarifesi_yok" | null;
                                /** @description İşlem sonrası güncel satır (`eski` ise mevcut satır). */
                                yoklama: {
                                    /** Format: uuid */
                                    ders_id: string;
                                    /** @enum {string} */
                                    durum: "geldi" | "gelmedi" | "izinli" | "gec";
                                    gec_dakika: number | null;
                                    /** Format: uuid */
                                    id: string;
                                    /** Format: date-time */
                                    isaretlenme_at: string;
                                    /** Format: uuid */
                                    isaretleyen_id: string;
                                    /** @description Öğrenci rolünde `ogretmene_ozel` not hep `null`. */
                                    not: string | null;
                                    /**
                                     * @description `ogretmene_ozel` (varsayılan): not öğrenciye ve hiçbir olaya dönmez. `ogrenciye`: öğrenci kendi yoklamasında görür.
                                     * @enum {string}
                                     */
                                    not_gorunurluk: "ogretmene_ozel" | "ogrenciye";
                                    /** Format: uuid */
                                    ogrenci_id: string;
                                    /** Format: date-time */
                                    sunucu_at: string;
                                    surum: number;
                                };
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
    "/v1/ders/kurumlar/{kurum_id}/seriler": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Tekrarlayan ders serisi olustur (FREQ=WEEKLY|DAILY, INTERVAL, BYDAY; bitis tarihi veya adet). Dersler 12 hafta ileriye uretilir, kalani gece isi uretir. */
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
                        adet?: number;
                        /** @description Yerel saat, SS:DD (24 saat). */
                        baslangic_saati: string;
                        /** Format: date */
                        baslangic_tarihi: string;
                        baslik?: string;
                        /** Format: date */
                        bitis_tarihi?: string;
                        /** @description Boşsa öğretmenin gruptaki atamasının branşı. */
                        brans_kodu?: string;
                        /**
                         * @description Öğretmen çakışması bilerek onaylandı (`409 ders_cakismasi` sonrası).
                         * @default false
                         */
                        cakisma_onayli?: boolean;
                        /** Format: uuid */
                        grup_id: string;
                        /** Format: uuid */
                        konu_id?: string;
                        /**
                         * Format: uuid
                         * @description Boşsa: öğretmen çağıranın kendisi; sahip/yönetici için aynı kullanıcının öğretmen üyeliği (yoksa 422).
                         */
                        ogretmen_id?: string;
                        online_baglanti?: string;
                        sure_dk: number;
                        /** @description RFC 5545 alt kümesi: FREQ=WEEKLY|DAILY, INTERVAL, BYDAY. Örnek: FREQ=WEEKLY;BYDAY=MO,WE */
                        tekrar_kurali: string;
                        yer?: string;
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
                            atlanan: {
                                /** @enum {string} */
                                neden: "cakisma" | "zaten_var";
                                seri_sirasi: number;
                                /** Format: date */
                                tarih: string;
                            }[];
                            /** @description `cakisma_onayli: true` ile yazılan derslerin çakıştığı mevcut dersler. */
                            cakisanlar: {
                                /** Format: date-time */
                                baslangic_at: string;
                                baslik: string | null;
                                /** Format: date-time */
                                bitis_at: string;
                                /** Format: uuid */
                                grup_id: string;
                                /** Format: uuid */
                                id: string;
                            }[];
                            dersler: {
                                /** Format: date-time */
                                baslangic_at: string;
                                baslik: string | null;
                                /** Format: date-time */
                                bitis_at: string;
                                brans_kodu: string;
                                cakisma_onayli: boolean;
                                /** Format: date-time */
                                created_at: string;
                                /** @enum {string} */
                                durum: "planli" | "tamamlandi" | "iptal";
                                ertelendi_sayisi: number;
                                gec_iptal: boolean;
                                /** Format: uuid */
                                grup_id: string;
                                /** Format: uuid */
                                id: string;
                                /** Format: date-time */
                                ilk_baslangic_at: string;
                                /** Format: date-time */
                                iptal_at: string | null;
                                /** Format: uuid */
                                iptal_eden_id: string | null;
                                /** @enum {string|null} */
                                iptal_kaynagi: "ogretmen" | "ogrenci" | "yonetici" | null;
                                iptal_nedeni: string | null;
                                katilimci_sayisi: number;
                                /** Format: uuid */
                                konu_id: string | null;
                                /** Format: uuid */
                                ogretmen_id: string;
                                online_baglanti: string | null;
                                /** Format: uuid */
                                seri_id: string | null;
                                seri_istisna: boolean;
                                seri_sirasi: number | null;
                                surum: number;
                                telafi: boolean;
                                /** Format: uuid */
                                telafi_kaynak_ders_id: string | null;
                                yer: string | null;
                            }[];
                            seri: {
                                adet: number | null;
                                /** @description Yerel saat, SS:DD (24 saat). */
                                baslangic_saati: string;
                                /** Format: date */
                                baslangic_tarihi: string;
                                baslik: string | null;
                                /** Format: date */
                                bitis_tarihi: string | null;
                                brans_kodu: string;
                                /** @enum {string} */
                                durum: "aktif" | "bitti" | "iptal";
                                /** Format: uuid */
                                grup_id: string;
                                /** Format: uuid */
                                id: string;
                                /** Format: uuid */
                                ogretmen_id: string;
                                online_baglanti: string | null;
                                saat_dilimi: string;
                                sure_dk: number;
                                surum: number;
                                tekrar_kurali: string;
                                /** Format: date */
                                uretildi_son_tarih: string;
                                yer: string | null;
                            };
                            uyari: {
                                /** Format: uuid */
                                cakisan_ders_id: string;
                                /** Format: uuid */
                                ders_id: string;
                                /** @enum {string} */
                                kod: "ogrenci_cakismasi";
                                ogrenci_idleri: string[];
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
    "/v1/ders/kurumlar/{kurum_id}/yoklama-bekleyen": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Ogretmenin "Yoklama al" listesi: baslamis, `planli`, en az bir katilimcisinin yoklamasi eksik dersler (son 14 gun; kapsam suzgecli; `baslangic_at` azalan; imlecle sayfali). */
        get: {
            parameters: {
                query?: {
                    /** @description Önceki sayfanın `sonraki_imlec` değeri. */
                    imlec?: string;
                    limit?: number;
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
                            dersler: {
                                /** Format: date-time */
                                baslangic_at: string;
                                baslik: string | null;
                                /** Format: date-time */
                                bitis_at: string;
                                brans_kodu: string;
                                cakisma_onayli: boolean;
                                /** Format: date-time */
                                created_at: string;
                                /** @enum {string} */
                                durum: "planli" | "tamamlandi" | "iptal";
                                ertelendi_sayisi: number;
                                gec_iptal: boolean;
                                /** Format: uuid */
                                grup_id: string;
                                /** Format: uuid */
                                id: string;
                                /** Format: date-time */
                                ilk_baslangic_at: string;
                                /** Format: date-time */
                                iptal_at: string | null;
                                /** Format: uuid */
                                iptal_eden_id: string | null;
                                /** @enum {string|null} */
                                iptal_kaynagi: "ogretmen" | "ogrenci" | "yonetici" | null;
                                iptal_nedeni: string | null;
                                katilimci_sayisi: number;
                                /** Format: uuid */
                                konu_id: string | null;
                                /** Format: uuid */
                                ogretmen_id: string;
                                online_baglanti: string | null;
                                /** Format: uuid */
                                seri_id: string | null;
                                seri_istisna: boolean;
                                seri_sirasi: number | null;
                                surum: number;
                                telafi: boolean;
                                /** Format: uuid */
                                telafi_kaynak_ders_id: string | null;
                                yer: string | null;
                                /** @description Yoklaması girilmemiş katılımcı sayısı. */
                                yoklamasi_eksik_sayisi: number;
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
    "/v1/finans/kurumlar/{kurum_id}/ayarlar": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Kurum finans ayari: ogrenci kalan ders sayisini gorur mu (varsayilan evet). */
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
                            ogrenci_kalan_ders_gorur: boolean;
                        };
                    };
                };
            };
        };
        /** Kurum finans ayarini yaz. `ogrenci_kalan_ders_gorur=false` ise ogrenci kalan ders sayisini gormez (`kalan_kredi: null`). */
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
                        ogrenci_kalan_ders_gorur: boolean;
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
                            ogrenci_kalan_ders_gorur: boolean;
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
    "/v1/finans/kurumlar/{kurum_id}/disa-aktar": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Aylik tahsilatlari ve ogrenci bakiyelerini gercek .xlsx olarak indir. Kurus TL'ye yalniz burada cevrilir. Yalniz `finans.oku` ve kurum/grup kapsami; indirme denetim kaydina duser. */
        get: {
            parameters: {
                query: {
                    /** @description Europe/Istanbul takvim ayı, ör. 2026-11. */
                    ay: string;
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
                    content?: never;
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
    "/v1/finans/kurumlar/{kurum_id}/kredi-politikasi": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Kurum kredi dusum politikasi (satir yoksa varsayilanlar, `varsayilan: true`). */
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
                            dusuk_kredi_esigi: number;
                            gec_dusurur: boolean;
                            gec_iptal_saat: number;
                            geldi_dusurur: boolean;
                            gelmedi_dusurur: boolean;
                            izinli_dusurur: boolean;
                            ogrenci_gec_iptal_dusurur: boolean;
                            varsayilan: boolean;
                        };
                    };
                };
            };
        };
        /** Kurum kredi dusum politikasini yaz (verilmeyen alanlar mevcut degeri korur). Paket bazli gecersiz kilma paket sablonundadir. */
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
                        dusuk_kredi_esigi?: number;
                        gec_dusurur?: boolean;
                        gec_iptal_saat?: number;
                        geldi_dusurur?: boolean;
                        gelmedi_dusurur?: boolean;
                        izinli_dusurur?: boolean;
                        ogrenci_gec_iptal_dusurur?: boolean;
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
                            dusuk_kredi_esigi: number;
                            gec_dusurur: boolean;
                            gec_iptal_saat: number;
                            geldi_dusurur: boolean;
                            gelmedi_dusurur: boolean;
                            izinli_dusurur: boolean;
                            ogrenci_gec_iptal_dusurur: boolean;
                            varsayilan: boolean;
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
    "/v1/finans/kurumlar/{kurum_id}/ogrenciler": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Ogrenci finans listesi (kalan ders rozeti icin `kalan_kredi` ve esik). `?borclu` ve `?dusuk_kredi` suzgecleri; kapsam rolun izin kapsamina gore daralir. */
        get: {
            parameters: {
                query?: {
                    borclu?: "" | ("0" | "1" | "true" | "false");
                    dusuk_kredi?: "" | ("0" | "1" | "true" | "false");
                    /** @description Önceki sayfanın `sonraki_imlec` değeri. */
                    imlec?: string;
                    limit?: number;
                    /** @description Ada göre arama. */
                    q?: string;
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
                            dusuk_kredi_esigi: number;
                            /** @enum {string} */
                            kapsam: "kendi" | "grup" | "sube" | "kurum";
                            ogrenciler: {
                                bakiye_kurus: number;
                                borclu: boolean;
                                dusuk_kredi: boolean;
                                gorunen_ad: string | null;
                                kalan_kredi: number;
                                /** @enum {string} */
                                model: "paket" | "ders_basi" | "yok";
                                /** Format: uuid */
                                ogrenci_id: string;
                            }[];
                            /** Format: uuid */
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
    "/v1/finans/kurumlar/{kurum_id}/ogrenciler/{ogrenci_id}/bakiye-hareketleri": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Bakiye defteri satirlari (yeniden eskiye, sayfali). Negatif bakiye = ogrenci borclu. */
        get: {
            parameters: {
                query?: {
                    /** @description Önceki sayfanın `sonraki_imlec` değeri. */
                    imlec?: string;
                    limit?: number;
                };
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
                            bakiye_kurus: number;
                            hareketler: {
                                /** Format: date-time */
                                created_at: string;
                                /** Format: uuid */
                                ders_id: string | null;
                                /** Format: uuid */
                                id: string;
                                /** Format: uuid */
                                kaynak_id: string | null;
                                /** @enum {string} */
                                kaynak_turu: "yoklama" | "paket_satisi" | "tahsilat" | "elle" | "ders_iptal";
                                neden: string | null;
                                /** Format: uuid */
                                ters_cevrilen_id: string | null;
                                /** @enum {string} */
                                tur: "ders_ucreti" | "paket_satisi" | "tahsilat" | "duzeltme" | "ters_kayit";
                                tutar_kurus: number;
                                /** Format: uuid */
                                yoklama_id: string | null;
                            }[];
                            /** Format: uuid */
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
    "/v1/finans/kurumlar/{kurum_id}/ogrenciler/{ogrenci_id}/finans": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Ogrenci finans karti. Personel (`gorunum: tam`): kalan kredi, bakiye, etkin paketler, son hareketler, odeyen. Ogrenci rolu (`gorunum: ogrenci`): yalniz kendi kalan dersi; kurum ayari kapaliysa `kalan_kredi: null`. Fiyat/borc/tahsilat ogrenciye donmez. */
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
                            bakiye_kurus: number;
                            borclu: boolean;
                            dusuk_kredi_esigi: number;
                            etkin_paketler: {
                                ad: string;
                                /** Format: date */
                                baslangic_tarihi: string;
                                /** Format: date */
                                bitis_tarihi: string | null;
                                /** Format: date-time */
                                created_at: string;
                                /** @enum {string} */
                                durum: "aktif" | "tukendi" | "suresi_doldu" | "iptal";
                                fiyat_kurus: number;
                                /** Format: uuid */
                                id: string;
                                /** Format: date-time */
                                iptal_at: string | null;
                                kalan_kredi: number;
                                /** Format: uuid */
                                ogrenci_id: string;
                                /** Format: uuid */
                                paket_id: string | null;
                                /** Format: uuid */
                                satan_id: string;
                                toplam_kredi: number;
                            }[];
                            /** @enum {string} */
                            gorunum: "tam";
                            kalan_kredi: number;
                            /** @enum {string} */
                            model: "paket" | "ders_basi" | "yok";
                            odeyen_ad: string | null;
                            odeyen_telefon: string | null;
                            /** Format: uuid */
                            ogrenci_id: string;
                            son_bakiye_hareketleri: {
                                /** Format: date-time */
                                created_at: string;
                                /** Format: uuid */
                                ders_id: string | null;
                                /** Format: uuid */
                                id: string;
                                /** Format: uuid */
                                kaynak_id: string | null;
                                /** @enum {string} */
                                kaynak_turu: "yoklama" | "paket_satisi" | "tahsilat" | "elle" | "ders_iptal";
                                neden: string | null;
                                /** Format: uuid */
                                ters_cevrilen_id: string | null;
                                /** @enum {string} */
                                tur: "ders_ucreti" | "paket_satisi" | "tahsilat" | "duzeltme" | "ters_kayit";
                                tutar_kurus: number;
                                /** Format: uuid */
                                yoklama_id: string | null;
                            }[];
                            son_kredi_hareketleri: {
                                /** Format: date-time */
                                created_at: string;
                                /** Format: uuid */
                                ders_id: string | null;
                                /** Format: uuid */
                                id: string;
                                miktar: number;
                                neden: string | null;
                                /** Format: uuid */
                                paket_satisi_id: string | null;
                                /** Format: uuid */
                                ters_cevrilen_id: string | null;
                                /** @enum {string} */
                                tur: "satin_alma" | "dusum" | "iptal_dusum" | "iade" | "duzeltme" | "son_kullanma" | "ters_kayit";
                                /** Format: uuid */
                                yoklama_id: string | null;
                                yoklama_surumu: number | null;
                            }[];
                        } | {
                            /** @enum {string} */
                            gorunum: "ogrenci";
                            kalan_kredi: number | null;
                            /** Format: uuid */
                            ogrenci_id: string;
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
    "/v1/finans/kurumlar/{kurum_id}/ogrenciler/{ogrenci_id}/finans-profili": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Ogrencinin faturalama modeli ve odeyen kisi (duz bilgi). */
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
                            /** @enum {string} */
                            model: "paket" | "ders_basi" | "yok";
                            odeyen_ad: string | null;
                            odeyen_telefon: string | null;
                            /** Format: uuid */
                            ogrenci_id: string;
                            surum: number | null;
                        };
                    };
                };
            };
        };
        /** Faturalama modelini (paket, ders_basi, yok) ve odeyen kisiyi yaz. Verilmeyen alanlar degismez; odeyen bilgisi denetim kaydina, olaya ve loga girmez. */
        put: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    kurum_id: string;
                    ogrenci_id: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        /** @enum {string} */
                        model?: "paket" | "ders_basi" | "yok";
                        odeyen_ad?: string | null;
                        odeyen_telefon?: string | null;
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
                            model: "paket" | "ders_basi" | "yok";
                            odeyen_ad: string | null;
                            odeyen_telefon: string | null;
                            /** Format: uuid */
                            ogrenci_id: string;
                            surum: number | null;
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
    "/v1/finans/kurumlar/{kurum_id}/ogrenciler/{ogrenci_id}/kredi-hareketleri": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Kredi defteri satirlari (yeniden eskiye, sayfali). */
        get: {
            parameters: {
                query?: {
                    /** @description Önceki sayfanın `sonraki_imlec` değeri. */
                    imlec?: string;
                    limit?: number;
                };
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
                            hareketler: {
                                /** Format: date-time */
                                created_at: string;
                                /** Format: uuid */
                                ders_id: string | null;
                                /** Format: uuid */
                                id: string;
                                miktar: number;
                                neden: string | null;
                                /** Format: uuid */
                                paket_satisi_id: string | null;
                                /** Format: uuid */
                                ters_cevrilen_id: string | null;
                                /** @enum {string} */
                                tur: "satin_alma" | "dusum" | "iptal_dusum" | "iade" | "duzeltme" | "son_kullanma" | "ters_kayit";
                                /** Format: uuid */
                                yoklama_id: string | null;
                                yoklama_surumu: number | null;
                            }[];
                            kalan_kredi: number;
                            /** Format: uuid */
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
    "/v1/finans/kurumlar/{kurum_id}/ozet/aylik": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Aylik gelir ozeti: gecerli tahsilat toplami ve yonteme gore kirilim (iptaller haric). Ay Europe/Istanbul takvim ayidir; kapsam rolun izin kapsamina gore daralir. */
        get: {
            parameters: {
                query: {
                    /** @description Europe/Istanbul takvim ayı, ör. 2026-11. */
                    ay: string;
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
                            ay: string;
                            /** @enum {string} */
                            kapsam: "kendi" | "grup" | "sube" | "kurum";
                            tahsilat_sayisi: number;
                            toplam_kurus: number;
                            yonteme_gore: {
                                adet: number;
                                toplam_kurus: number;
                                /** @enum {string} */
                                yontem: "nakit" | "havale" | "kart" | "diger";
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
    "/v1/finans/kurumlar/{kurum_id}/paket-satislari": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Paket sat. Satis, kredi satin alma, ucret borcu (bakiye) ve varsa tahsilat tek islemde yazilir. `odeme.tur`: tamami | kismi | sonra. */
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
                        /**
                         * Format: date
                         * @description Varsayılan: bugün (Europe/Istanbul).
                         */
                        baslangic_tarihi?: string;
                        /**
                         * @default {
                         *       "tur": "sonra"
                         *     }
                         */
                        odeme?: {
                            /** @enum {string} */
                            tur: "sonra";
                        } | {
                            makbuz_no?: string;
                            /** @enum {string} */
                            tur: "tamami";
                            /** @enum {string} */
                            yontem: "nakit" | "havale" | "kart" | "diger";
                        } | {
                            makbuz_no?: string;
                            /** @enum {string} */
                            tur: "kismi";
                            tutar_kurus: number;
                            /** @enum {string} */
                            yontem: "nakit" | "havale" | "kart" | "diger";
                        };
                        /** Format: uuid */
                        ogrenci_id: string;
                        /** Format: uuid */
                        paket_id: string;
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
                            bakiye_kurus: number;
                            kalan_kredi: number;
                            satis: {
                                ad: string;
                                /** Format: date */
                                baslangic_tarihi: string;
                                /** Format: date */
                                bitis_tarihi: string | null;
                                /** Format: date-time */
                                created_at: string;
                                /** @enum {string} */
                                durum: "aktif" | "tukendi" | "suresi_doldu" | "iptal";
                                fiyat_kurus: number;
                                /** Format: uuid */
                                id: string;
                                /** Format: date-time */
                                iptal_at: string | null;
                                kalan_kredi: number;
                                /** Format: uuid */
                                ogrenci_id: string;
                                /** Format: uuid */
                                paket_id: string | null;
                                /** Format: uuid */
                                satan_id: string;
                                toplam_kredi: number;
                            };
                            tahsilat: {
                                aciklama: string | null;
                                /** Format: uuid */
                                alan_id: string;
                                /** Format: date-time */
                                created_at: string;
                                /** @enum {string} */
                                durum: "gecerli" | "iptal";
                                /** Format: uuid */
                                id: string;
                                /** Format: date-time */
                                iptal_at: string | null;
                                iptal_nedeni: string | null;
                                makbuz_no: string | null;
                                /** Format: uuid */
                                ogrenci_id: string;
                                /** Format: uuid */
                                paket_satisi_id: string | null;
                                /** Format: date */
                                tahsilat_tarihi: string;
                                tutar_kurus: number;
                                /** @enum {string} */
                                yontem: "nakit" | "havale" | "kart" | "diger";
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
    "/v1/finans/kurumlar/{kurum_id}/paket-satislari/{satis_id}/iptal": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Paket satisini iptal et (kredi ve ucret borcu ters kayitla geri alinir). Kullanilmis kredi varsa 409 `paket_kullanilmis`. Alinmis tahsilatlar ayri iptal edilir. */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    kurum_id: string;
                    satis_id: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        neden: string;
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
                            /** Format: date */
                            baslangic_tarihi: string;
                            /** Format: date */
                            bitis_tarihi: string | null;
                            /** Format: date-time */
                            created_at: string;
                            /** @enum {string} */
                            durum: "aktif" | "tukendi" | "suresi_doldu" | "iptal";
                            fiyat_kurus: number;
                            /** Format: uuid */
                            id: string;
                            /** Format: date-time */
                            iptal_at: string | null;
                            kalan_kredi: number;
                            /** Format: uuid */
                            ogrenci_id: string;
                            /** Format: uuid */
                            paket_id: string | null;
                            /** Format: uuid */
                            satan_id: string;
                            toplam_kredi: number;
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
    "/v1/finans/kurumlar/{kurum_id}/paketler": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Paket sablonlarini listele (varsayilan: yalniz aktif). */
        get: {
            parameters: {
                query?: {
                    durum?: "aktif" | "arsiv" | "hepsi";
                    /** @description Önceki sayfanın `sonraki_imlec` değeri. */
                    imlec?: string;
                    limit?: number;
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
                            paketler: {
                                ad: string;
                                aktif: boolean;
                                /** Format: date-time */
                                arsivlendi_at: string | null;
                                brans_kodu: string | null;
                                /** Format: date-time */
                                created_at: string;
                                fiyat_kurus: number;
                                gecerlilik_gun: number | null;
                                /** @enum {string|null} */
                                grup_turu: "birebir" | "grup" | "sinif" | "etut" | null;
                                /** Format: uuid */
                                id: string;
                                kredi_adedi: number;
                                kredi_politikasi: {
                                    gec_dusurur?: boolean;
                                    geldi_dusurur?: boolean;
                                    gelmedi_dusurur?: boolean;
                                    izinli_dusurur?: boolean;
                                    ogrenci_gec_iptal_dusurur?: boolean;
                                } | null;
                                surum: number;
                            }[];
                            /** Format: uuid */
                            sonraki_imlec: string | null;
                        };
                    };
                };
            };
        };
        put?: never;
        /** Paket sablonu olustur (ad, kredi adedi, fiyat kurus, gecerlilik, politika). */
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
                        ad: string;
                        brans_kodu?: string | null;
                        fiyat_kurus: number;
                        gecerlilik_gun?: number | null;
                        /** @enum {string|null} */
                        grup_turu?: "birebir" | "grup" | "sinif" | "etut" | null;
                        kredi_adedi: number;
                        kredi_politikasi?: {
                            gec_dusurur?: boolean;
                            geldi_dusurur?: boolean;
                            gelmedi_dusurur?: boolean;
                            izinli_dusurur?: boolean;
                            ogrenci_gec_iptal_dusurur?: boolean;
                        } | null;
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
                            ad: string;
                            aktif: boolean;
                            /** Format: date-time */
                            arsivlendi_at: string | null;
                            brans_kodu: string | null;
                            /** Format: date-time */
                            created_at: string;
                            fiyat_kurus: number;
                            gecerlilik_gun: number | null;
                            /** @enum {string|null} */
                            grup_turu: "birebir" | "grup" | "sinif" | "etut" | null;
                            /** Format: uuid */
                            id: string;
                            kredi_adedi: number;
                            kredi_politikasi: {
                                gec_dusurur?: boolean;
                                geldi_dusurur?: boolean;
                                gelmedi_dusurur?: boolean;
                                izinli_dusurur?: boolean;
                                ogrenci_gec_iptal_dusurur?: boolean;
                            } | null;
                            surum: number;
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
    "/v1/finans/kurumlar/{kurum_id}/paketler/{paket_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** Paket sablonunu guncelle. Satilmis paketler satis aninin kopyasini (ad, kredi, fiyat) korur. */
        patch: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    kurum_id: string;
                    paket_id: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        ad?: string;
                        brans_kodu?: string | null;
                        fiyat_kurus?: number;
                        gecerlilik_gun?: number | null;
                        /** @enum {string|null} */
                        grup_turu?: "birebir" | "grup" | "sinif" | "etut" | null;
                        kredi_adedi?: number;
                        kredi_politikasi?: {
                            gec_dusurur?: boolean;
                            geldi_dusurur?: boolean;
                            gelmedi_dusurur?: boolean;
                            izinli_dusurur?: boolean;
                            ogrenci_gec_iptal_dusurur?: boolean;
                        } | null;
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
                            aktif: boolean;
                            /** Format: date-time */
                            arsivlendi_at: string | null;
                            brans_kodu: string | null;
                            /** Format: date-time */
                            created_at: string;
                            fiyat_kurus: number;
                            gecerlilik_gun: number | null;
                            /** @enum {string|null} */
                            grup_turu: "birebir" | "grup" | "sinif" | "etut" | null;
                            /** Format: uuid */
                            id: string;
                            kredi_adedi: number;
                            kredi_politikasi: {
                                gec_dusurur?: boolean;
                                geldi_dusurur?: boolean;
                                gelmedi_dusurur?: boolean;
                                izinli_dusurur?: boolean;
                                ogrenci_gec_iptal_dusurur?: boolean;
                            } | null;
                            surum: number;
                        };
                    };
                };
            };
        };
        trace?: never;
    };
    "/v1/finans/kurumlar/{kurum_id}/paketler/{paket_id}/arsivle": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Paket sablonunu arsivle (silinmez; yeni satista gorunmez, eski satislar etkilenmez). */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    kurum_id: string;
                    paket_id: string;
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
                            aktif: boolean;
                            /** Format: date-time */
                            arsivlendi_at: string | null;
                            brans_kodu: string | null;
                            /** Format: date-time */
                            created_at: string;
                            fiyat_kurus: number;
                            gecerlilik_gun: number | null;
                            /** @enum {string|null} */
                            grup_turu: "birebir" | "grup" | "sinif" | "etut" | null;
                            /** Format: uuid */
                            id: string;
                            kredi_adedi: number;
                            kredi_politikasi: {
                                gec_dusurur?: boolean;
                                geldi_dusurur?: boolean;
                                gelmedi_dusurur?: boolean;
                                izinli_dusurur?: boolean;
                                ogrenci_gec_iptal_dusurur?: boolean;
                            } | null;
                            surum: number;
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
    "/v1/finans/kurumlar/{kurum_id}/tahsilatlar": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Tahsilatlari listele (yeniden eskiye); kapsam rolun izin kapsamina gore daralir. */
        get: {
            parameters: {
                query?: {
                    ay?: string;
                    durum?: "gecerli" | "iptal" | "hepsi";
                    /** @description Önceki sayfanın `sonraki_imlec` değeri. */
                    imlec?: string;
                    limit?: number;
                    ogrenci_id?: string;
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
                            tahsilatlar: {
                                aciklama: string | null;
                                /** Format: uuid */
                                alan_id: string;
                                /** Format: date-time */
                                created_at: string;
                                /** @enum {string} */
                                durum: "gecerli" | "iptal";
                                /** Format: uuid */
                                id: string;
                                /** Format: date-time */
                                iptal_at: string | null;
                                iptal_nedeni: string | null;
                                makbuz_no: string | null;
                                /** Format: uuid */
                                ogrenci_id: string;
                                /** Format: uuid */
                                paket_satisi_id: string | null;
                                /** Format: date */
                                tahsilat_tarihi: string;
                                tutar_kurus: number;
                                /** @enum {string} */
                                yontem: "nakit" | "havale" | "kart" | "diger";
                            }[];
                        };
                    };
                };
            };
        };
        put?: never;
        /** Tahsilat al. `Idempotency-Key` (UUID) basligi ayni istegin ikinci kez cift kayit olusturmasini onler (tekrar: true). */
        post: {
            parameters: {
                query?: never;
                header?: {
                    /** @description Çift gönderim koruması (UUID). */
                    "idempotency-key"?: string;
                };
                path: {
                    kurum_id: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        aciklama?: string;
                        makbuz_no?: string;
                        /** Format: uuid */
                        ogrenci_id: string;
                        /** Format: uuid */
                        paket_satisi_id?: string;
                        /**
                         * Format: date
                         * @description Varsayılan: bugün (Europe/Istanbul).
                         */
                        tahsilat_tarihi?: string;
                        tutar_kurus: number;
                        /** @enum {string} */
                        yontem: "nakit" | "havale" | "kart" | "diger";
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
                            aciklama: string | null;
                            /** Format: uuid */
                            alan_id: string;
                            /** Format: date-time */
                            created_at: string;
                            /** @enum {string} */
                            durum: "gecerli" | "iptal";
                            /** Format: uuid */
                            id: string;
                            /** Format: date-time */
                            iptal_at: string | null;
                            iptal_nedeni: string | null;
                            makbuz_no: string | null;
                            /** Format: uuid */
                            ogrenci_id: string;
                            /** Format: uuid */
                            paket_satisi_id: string | null;
                            /** Format: date */
                            tahsilat_tarihi: string;
                            tekrar: boolean;
                            tutar_kurus: number;
                            /** @enum {string} */
                            yontem: "nakit" | "havale" | "kart" | "diger";
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
                            aciklama: string | null;
                            /** Format: uuid */
                            alan_id: string;
                            /** Format: date-time */
                            created_at: string;
                            /** @enum {string} */
                            durum: "gecerli" | "iptal";
                            /** Format: uuid */
                            id: string;
                            /** Format: date-time */
                            iptal_at: string | null;
                            iptal_nedeni: string | null;
                            makbuz_no: string | null;
                            /** Format: uuid */
                            ogrenci_id: string;
                            /** Format: uuid */
                            paket_satisi_id: string | null;
                            /** Format: date */
                            tahsilat_tarihi: string;
                            tekrar: boolean;
                            tutar_kurus: number;
                            /** @enum {string} */
                            yontem: "nakit" | "havale" | "kart" | "diger";
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
    "/v1/finans/kurumlar/{kurum_id}/tahsilatlar/{tahsilat_id}/iptal": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Tahsilati iptal et (ters kayit). Neden zorunludur; iptal tek yonludur ve iptalin iptali yoktur. */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    kurum_id: string;
                    tahsilat_id: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        neden: string;
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
                            aciklama: string | null;
                            /** Format: uuid */
                            alan_id: string;
                            /** Format: date-time */
                            created_at: string;
                            /** @enum {string} */
                            durum: "gecerli" | "iptal";
                            /** Format: uuid */
                            id: string;
                            /** Format: date-time */
                            iptal_at: string | null;
                            iptal_nedeni: string | null;
                            makbuz_no: string | null;
                            /** Format: uuid */
                            ogrenci_id: string;
                            /** Format: uuid */
                            paket_satisi_id: string | null;
                            /** Format: date */
                            tahsilat_tarihi: string;
                            tutar_kurus: number;
                            /** @enum {string} */
                            yontem: "nakit" | "havale" | "kart" | "diger";
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
    "/v1/finans/kurumlar/{kurum_id}/ucret-tarifeleri": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Ucret tarifelerini listele (ders basi modeli). */
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
                            tarifeler: {
                                brans_kodu: string | null;
                                /** Format: date */
                                gecerlilik_baslangic: string;
                                /** Format: date */
                                gecerlilik_bitis: string | null;
                                /** Format: uuid */
                                grup_id: string | null;
                                /** Format: uuid */
                                id: string;
                                /** Format: uuid */
                                ogrenci_id: string | null;
                                surum: number;
                                ucret_kurus: number;
                            }[];
                        };
                    };
                };
            };
        };
        put?: never;
        /** Ucret tarifesi ekle. Secim onceligi: ogrenci > grup > yalniz brans > kurum varsayilani. Ayni kapsamda cakisan aralik 409. */
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
                        brans_kodu?: string | null;
                        /** Format: date */
                        gecerlilik_baslangic: string;
                        /** Format: date */
                        gecerlilik_bitis?: string | null;
                        /** Format: uuid */
                        grup_id?: string | null;
                        /** Format: uuid */
                        ogrenci_id?: string | null;
                        ucret_kurus: number;
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
                            brans_kodu: string | null;
                            /** Format: date */
                            gecerlilik_baslangic: string;
                            /** Format: date */
                            gecerlilik_bitis: string | null;
                            /** Format: uuid */
                            grup_id: string | null;
                            /** Format: uuid */
                            id: string;
                            /** Format: uuid */
                            ogrenci_id: string | null;
                            surum: number;
                            ucret_kurus: number;
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
    "/v1/finans/kurumlar/{kurum_id}/ucret-tarifeleri/{tarife_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** Ucret tarifesini sil (defter satirlari tutari kopya sakladigi icin etkilenmez). */
        delete: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    kurum_id: string;
                    tarife_id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Default Response */
                204: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": null;
                    };
                };
            };
        };
        options?: never;
        head?: never;
        /** Ucret tarifesini guncelle (gecmis derslere kopyalanmis tutarlar degismez). */
        patch: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    kurum_id: string;
                    tarife_id: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        brans_kodu?: string | null;
                        /** Format: date */
                        gecerlilik_baslangic?: string;
                        /** Format: date */
                        gecerlilik_bitis?: string | null;
                        /** Format: uuid */
                        grup_id?: string | null;
                        /** Format: uuid */
                        ogrenci_id?: string | null;
                        ucret_kurus?: number;
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
                            brans_kodu: string | null;
                            /** Format: date */
                            gecerlilik_baslangic: string;
                            /** Format: date */
                            gecerlilik_bitis: string | null;
                            /** Format: uuid */
                            grup_id: string | null;
                            /** Format: uuid */
                            id: string;
                            /** Format: uuid */
                            ogrenci_id: string | null;
                            surum: number;
                            ucret_kurus: number;
                        };
                    };
                };
            };
        };
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
                                /** @description E-posta adresi doğrulandı mı (eposta yoksa false). Davet eşleştirmesi için ipucu. */
                                eposta_dogrulandi: boolean;
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
    "/v1/hesap/davetler/kabul": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Daveti kabul et (giris yapmis kullanici): uyelik olusur, davette grup varsa gruba eklenir. Gecersiz/kullanilmis/suresi dolmus: 410 davet_gecersiz. */
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
                        belirtec: string;
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
                            /** Format: uuid */
                            davet_id: string;
                            /** Format: uuid */
                            grup_id: string | null;
                            /** Format: uuid */
                            grup_uyesi_id: string | null;
                            /** Format: uuid */
                            kurum_id: string;
                            /** @enum {string} */
                            rol: "sahip" | "yonetici" | "ogretmen" | "ogrenci" | "veli";
                            /** Format: uuid */
                            uyelik_id: string;
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
                                    ogrenci_kalan_ders_gorur?: boolean;
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
                                ogrenci_kalan_ders_gorur?: boolean;
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
                                ogrenci_kalan_ders_gorur?: boolean;
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
    "/v1/hesap/kurumlar/{kurum_id}/atamalar": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Atamalari listele (grup ya da ogretmen bazli); yalnizca kapsamdaki gruplarin atamalari gorunur */
        get: {
            parameters: {
                query?: {
                    durum?: "etkin" | "bitmis" | "hepsi";
                    grup_id?: string;
                    imlec?: string;
                    limit?: number;
                    ogretmen_id?: string;
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
                            atamalar: {
                                ana_ogretmen: boolean;
                                /** Format: date */
                                baslangic_tarihi: string;
                                /** Format: date */
                                bitis_tarihi: string | null;
                                brans_kodu: string;
                                /** Format: uuid */
                                grup_id: string;
                                /** Format: uuid */
                                id: string;
                                ogretmen_ad: string | null;
                                /**
                                 * Format: uuid
                                 * @description Ogretmen uyeligi (`uyelikler.id`).
                                 */
                                ogretmen_id: string;
                            }[];
                            /** @enum {string} */
                            kapsam: "kendi" | "grup" | "sube" | "kurum";
                            /** Format: uuid */
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
    "/v1/hesap/kurumlar/{kurum_id}/atamalar/{atama_id}/bitir": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Atamayi bitir (bitis_tarihi bugun olur, ogretmenin grup kapsami hemen duser); tekrar cagri etkisizdir */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    atama_id: string;
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
                            ana_ogretmen: boolean;
                            /** Format: date */
                            baslangic_tarihi: string;
                            /** Format: date */
                            bitis_tarihi: string | null;
                            brans_kodu: string;
                            /** Format: uuid */
                            grup_id: string;
                            /** Format: uuid */
                            id: string;
                            ogretmen_ad: string | null;
                            /**
                             * Format: uuid
                             * @description Ogretmen uyeligi (`uyelikler.id`).
                             */
                            ogretmen_id: string;
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
    "/v1/hesap/kurumlar/{kurum_id}/davetler": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Davetleri listele (durum suzgeci, sayfali). Suresi gecen bekleyen davet okuma aninda suresi_doldu gorunur. */
        get: {
            parameters: {
                query?: {
                    durum?: "bekliyor" | "kullanildi" | "iptal" | "suresi_doldu";
                    grup_id?: string;
                    /** @description Önceki sayfanın `sonraki_imlec` değeri. */
                    imlec?: string;
                    limit?: number;
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
                            davetler: {
                                /** Format: date-time */
                                created_at: string;
                                /** Format: uuid */
                                davet_eden_id: string;
                                /** @enum {string} */
                                durum: "bekliyor" | "kullanildi" | "iptal" | "suresi_doldu";
                                /** Format: date-time */
                                expires_at: string;
                                /** @description SMS / e-posta gonderim sayaci (en cok 3). */
                                gonderim_sayisi: number;
                                /** Format: uuid */
                                grup_id: string | null;
                                hedef_ad: string | null;
                                hedef_eposta: string | null;
                                hedef_telefon_e164: string | null;
                                /** Format: uuid */
                                id: string;
                                /** Format: uuid */
                                kademe_id: string | null;
                                /** @enum {string} */
                                kanal: "baglanti" | "sms" | "eposta";
                                kullanim_sayisi: number;
                                max_kullanim: number;
                                /** @enum {string} */
                                rol: "yonetici" | "ogretmen" | "ogrenci" | "veli";
                                /** Format: date-time */
                                son_gonderim_at: string | null;
                                /** Format: uuid */
                                sube_id: string | null;
                            }[];
                            /** @enum {string} */
                            kapsam: "kendi" | "grup" | "sube" | "kurum";
                            /** Format: uuid */
                            sonraki_imlec: string | null;
                        };
                    };
                };
            };
        };
        put?: never;
        /** Davet olustur (sms | eposta | baglanti). Duz belirtec yalniz bu yanitta doner. Ogretmen yalniz atandigi gruba ogrenci davet eder. */
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
                        /**
                         * Format: email
                         * @description `eposta` kanalında zorunlu.
                         */
                        eposta?: string;
                        /** @default 7 */
                        gecerlilik_gun?: number;
                        /**
                         * Format: uuid
                         * @description Yalnız `ogrenci` daveti için: kabulde gruba eklenir.
                         */
                        grup_id?: string;
                        hedef_ad?: string;
                        /**
                         * Format: uuid
                         * @description Yalnız `ogrenci` daveti için.
                         */
                        kademe_id?: string;
                        /** @enum {string} */
                        kanal: "baglanti" | "sms" | "eposta";
                        /**
                         * @description Çok kullanımlı olabilmesi için kanal `baglanti` olmalı.
                         * @default 1
                         */
                        max_kullanim?: number;
                        /** @enum {string} */
                        rol: "yonetici" | "ogretmen" | "ogrenci";
                        /** Format: uuid */
                        sube_id?: string;
                        /** @description `sms` kanalında zorunlu. */
                        telefon?: string;
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
                            /** @description Düz davet belirteci. YALNIZ bu yanıtta (ve yeniden göndermede) döner; saklanmaz. */
                            belirtec: string;
                            davet: {
                                /** Format: date-time */
                                created_at: string;
                                /** Format: uuid */
                                davet_eden_id: string;
                                /** @enum {string} */
                                durum: "bekliyor" | "kullanildi" | "iptal" | "suresi_doldu";
                                /** Format: date-time */
                                expires_at: string;
                                /** @description SMS / e-posta gonderim sayaci (en cok 3). */
                                gonderim_sayisi: number;
                                /** Format: uuid */
                                grup_id: string | null;
                                hedef_ad: string | null;
                                hedef_eposta: string | null;
                                hedef_telefon_e164: string | null;
                                /** Format: uuid */
                                id: string;
                                /** Format: uuid */
                                kademe_id: string | null;
                                /** @enum {string} */
                                kanal: "baglanti" | "sms" | "eposta";
                                kullanim_sayisi: number;
                                max_kullanim: number;
                                /** @enum {string} */
                                rol: "yonetici" | "ogretmen" | "ogrenci" | "veli";
                                /** Format: date-time */
                                son_gonderim_at: string | null;
                                /** Format: uuid */
                                sube_id: string | null;
                            };
                            /** @enum {string} */
                            gonderim: "gonderildi" | "basarisiz" | "yok";
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
    "/v1/hesap/kurumlar/{kurum_id}/davetler/{davet_id}/iptal": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Bekleyen daveti iptal et; tekrar cagri etkisizdir, kullanilmis davet iptal edilemez (409) */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    davet_id: string;
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
                            created_at: string;
                            /** Format: uuid */
                            davet_eden_id: string;
                            /** @enum {string} */
                            durum: "bekliyor" | "kullanildi" | "iptal" | "suresi_doldu";
                            /** Format: date-time */
                            expires_at: string;
                            /** @description SMS / e-posta gonderim sayaci (en cok 3). */
                            gonderim_sayisi: number;
                            /** Format: uuid */
                            grup_id: string | null;
                            hedef_ad: string | null;
                            hedef_eposta: string | null;
                            hedef_telefon_e164: string | null;
                            /** Format: uuid */
                            id: string;
                            /** Format: uuid */
                            kademe_id: string | null;
                            /** @enum {string} */
                            kanal: "baglanti" | "sms" | "eposta";
                            kullanim_sayisi: number;
                            max_kullanim: number;
                            /** @enum {string} */
                            rol: "yonetici" | "ogretmen" | "ogrenci" | "veli";
                            /** Format: date-time */
                            son_gonderim_at: string | null;
                            /** Format: uuid */
                            sube_id: string | null;
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
    "/v1/hesap/kurumlar/{kurum_id}/davetler/{davet_id}/yeniden-gonder": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** SMS / e-posta davetini yeniden gonder (en cok 3 gonderim). Duz belirtec saklanmadigi icin yeni belirtec uretilir, eski baglanti gecersizlesir ve sure 7 gun uzar. */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    davet_id: string;
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
                            /** @description Düz davet belirteci. YALNIZ bu yanıtta (ve yeniden göndermede) döner; saklanmaz. */
                            belirtec: string;
                            davet: {
                                /** Format: date-time */
                                created_at: string;
                                /** Format: uuid */
                                davet_eden_id: string;
                                /** @enum {string} */
                                durum: "bekliyor" | "kullanildi" | "iptal" | "suresi_doldu";
                                /** Format: date-time */
                                expires_at: string;
                                /** @description SMS / e-posta gonderim sayaci (en cok 3). */
                                gonderim_sayisi: number;
                                /** Format: uuid */
                                grup_id: string | null;
                                hedef_ad: string | null;
                                hedef_eposta: string | null;
                                hedef_telefon_e164: string | null;
                                /** Format: uuid */
                                id: string;
                                /** Format: uuid */
                                kademe_id: string | null;
                                /** @enum {string} */
                                kanal: "baglanti" | "sms" | "eposta";
                                kullanim_sayisi: number;
                                max_kullanim: number;
                                /** @enum {string} */
                                rol: "yonetici" | "ogretmen" | "ogrenci" | "veli";
                                /** Format: date-time */
                                son_gonderim_at: string | null;
                                /** Format: uuid */
                                sube_id: string | null;
                            };
                            /** @enum {string} */
                            gonderim: "gonderildi" | "basarisiz" | "yok";
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
    "/v1/hesap/kurumlar/{kurum_id}/davetler/toplu": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Toplu davet (en cok 100 satir). Her satir tekil davetle ayni yetki/kapsam kurallarina tabidir; sonuc satir bazlidir, hatali satir digerlerini geri almaz. */
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
                        /** @description En çok 100 satır; her satır tekil davetle aynı kurallara tabidir. */
                        davetler: {
                            /** @description `eposta` kanalında zorunlu. */
                            eposta?: string;
                            /** @default 7 */
                            gecerlilik_gun?: number;
                            /**
                             * Format: uuid
                             * @description Yalnız `ogrenci` daveti için: kabulde gruba eklenir.
                             */
                            grup_id?: string;
                            hedef_ad?: string;
                            /**
                             * Format: uuid
                             * @description Yalnız `ogrenci` daveti için.
                             */
                            kademe_id?: string;
                            /** @enum {string} */
                            kanal: "baglanti" | "sms" | "eposta";
                            /**
                             * @description Çok kullanımlı olabilmesi için kanal `baglanti` olmalı.
                             * @default 1
                             */
                            max_kullanim?: number;
                            /** @enum {string} */
                            rol: "yonetici" | "ogretmen" | "ogrenci";
                            /** Format: uuid */
                            sube_id?: string;
                            /** @description `sms` kanalında zorunlu. */
                            telefon?: string;
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
                            basarili_sayisi: number;
                            hata_sayisi: number;
                            sonuclar: {
                                /** @description Yalnız başarılı satırda ve yalnız bu yanıtta döner. */
                                belirtec: string | null;
                                davet: {
                                    /** Format: date-time */
                                    created_at: string;
                                    /** Format: uuid */
                                    davet_eden_id: string;
                                    /** @enum {string} */
                                    durum: "bekliyor" | "kullanildi" | "iptal" | "suresi_doldu";
                                    /** Format: date-time */
                                    expires_at: string;
                                    /** @description SMS / e-posta gonderim sayaci (en cok 3). */
                                    gonderim_sayisi: number;
                                    /** Format: uuid */
                                    grup_id: string | null;
                                    hedef_ad: string | null;
                                    hedef_eposta: string | null;
                                    hedef_telefon_e164: string | null;
                                    /** Format: uuid */
                                    id: string;
                                    /** Format: uuid */
                                    kademe_id: string | null;
                                    /** @enum {string} */
                                    kanal: "baglanti" | "sms" | "eposta";
                                    kullanim_sayisi: number;
                                    max_kullanim: number;
                                    /** @enum {string} */
                                    rol: "yonetici" | "ogretmen" | "ogrenci" | "veli";
                                    /** Format: date-time */
                                    son_gonderim_at: string | null;
                                    /** Format: uuid */
                                    sube_id: string | null;
                                } | null;
                                /** @enum {string} */
                                durum: "basarili" | "hata";
                                /** @enum {string|null} */
                                gonderim: "gonderildi" | "basarisiz" | "yok" | null;
                                /** @description Alan hata kodu, örn. `gecersiz_telefon`, `izin_yok`. */
                                hata_kodu: string | null;
                                hata_mesaji: string | null;
                                /** @description Girdideki satır sırası (0 tabanlı). */
                                sira: number;
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
    "/v1/hesap/kurumlar/{kurum_id}/gruplar": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Gruplari listele; kapsam rolun izin kapsamina gore daralir (ogretmen: atandigi gruplar) */
        get: {
            parameters: {
                query?: {
                    durum?: "aktif" | "arsiv" | "hepsi";
                    /** @description Önceki sayfanın `sonraki_imlec` değeri. */
                    imlec?: string;
                    kademe_id?: string;
                    limit?: number;
                    tur?: "birebir" | "grup" | "sinif" | "etut";
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
                            gruplar: {
                                ad: string;
                                /** Format: date-time */
                                arsivlendi_at: string | null;
                                /** Format: date-time */
                                created_at: string;
                                /** @enum {string} */
                                durum: "aktif" | "arsiv";
                                /** Format: uuid */
                                id: string;
                                /** Format: uuid */
                                kademe_id: string | null;
                                kapasite: number | null;
                                renk: string | null;
                                /** Format: uuid */
                                sube_id: string | null;
                                surum: number;
                                /** @enum {string} */
                                tur: "birebir" | "grup" | "sinif" | "etut";
                                /** @description Etkin (bitis_tarihi bos) ogrenci sayisi. */
                                uye_sayisi: number;
                            }[];
                            /** @enum {string} */
                            kapsam: "kendi" | "grup" | "sube" | "kurum";
                            /** Format: uuid */
                            sonraki_imlec: string | null;
                        };
                    };
                };
            };
        };
        put?: never;
        /** Grup olustur (birebir, grup, sinif, etut) */
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
                        ad: string;
                        /** Format: uuid */
                        kademe_id?: string;
                        kapasite?: number;
                        renk?: string;
                        /** Format: uuid */
                        sube_id?: string;
                        /** @enum {string} */
                        tur: "birebir" | "grup" | "sinif" | "etut";
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
                            ad: string;
                            /** Format: date-time */
                            arsivlendi_at: string | null;
                            /** Format: date-time */
                            created_at: string;
                            /** @enum {string} */
                            durum: "aktif" | "arsiv";
                            /** Format: uuid */
                            id: string;
                            /** Format: uuid */
                            kademe_id: string | null;
                            kapasite: number | null;
                            renk: string | null;
                            /** Format: uuid */
                            sube_id: string | null;
                            surum: number;
                            /** @enum {string} */
                            tur: "birebir" | "grup" | "sinif" | "etut";
                            /** @description Etkin (bitis_tarihi bos) ogrenci sayisi. */
                            uye_sayisi: number;
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
    "/v1/hesap/kurumlar/{kurum_id}/gruplar/{grup_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Tekil grup (kapsam disi: 404) */
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
                            ad: string;
                            /** Format: date-time */
                            arsivlendi_at: string | null;
                            /** Format: date-time */
                            created_at: string;
                            /** @enum {string} */
                            durum: "aktif" | "arsiv";
                            /** Format: uuid */
                            id: string;
                            /** Format: uuid */
                            kademe_id: string | null;
                            kapasite: number | null;
                            renk: string | null;
                            /** Format: uuid */
                            sube_id: string | null;
                            surum: number;
                            /** @enum {string} */
                            tur: "birebir" | "grup" | "sinif" | "etut";
                            /** @description Etkin (bitis_tarihi bos) ogrenci sayisi. */
                            uye_sayisi: number;
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
        /** Grup bilgilerini guncelle (tur degistirilemez) */
        patch: {
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
                        ad?: string;
                        /** Format: uuid */
                        kademe_id?: string | null;
                        kapasite?: number | null;
                        renk?: string | null;
                        /** Format: uuid */
                        sube_id?: string | null;
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
                            /** Format: date-time */
                            arsivlendi_at: string | null;
                            /** Format: date-time */
                            created_at: string;
                            /** @enum {string} */
                            durum: "aktif" | "arsiv";
                            /** Format: uuid */
                            id: string;
                            /** Format: uuid */
                            kademe_id: string | null;
                            kapasite: number | null;
                            renk: string | null;
                            /** Format: uuid */
                            sube_id: string | null;
                            surum: number;
                            /** @enum {string} */
                            tur: "birebir" | "grup" | "sinif" | "etut";
                            /** @description Etkin (bitis_tarihi bos) ogrenci sayisi. */
                            uye_sayisi: number;
                        };
                    };
                };
            };
        };
        trace?: never;
    };
    "/v1/hesap/kurumlar/{kurum_id}/gruplar/{grup_id}/arsivle": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Grubu arsivle (uyelik ve atama gecmisi korunur); tekrar cagri etkisizdir */
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
                            /** Format: date-time */
                            arsivlendi_at: string | null;
                            /** Format: date-time */
                            created_at: string;
                            /** @enum {string} */
                            durum: "aktif" | "arsiv";
                            /** Format: uuid */
                            id: string;
                            /** Format: uuid */
                            kademe_id: string | null;
                            kapasite: number | null;
                            renk: string | null;
                            /** Format: uuid */
                            sube_id: string | null;
                            surum: number;
                            /** @enum {string} */
                            tur: "birebir" | "grup" | "sinif" | "etut";
                            /** @description Etkin (bitis_tarihi bos) ogrenci sayisi. */
                            uye_sayisi: number;
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
    "/v1/hesap/kurumlar/{kurum_id}/gruplar/{grup_id}/atamalar": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Grubun etkin atamalari (ogretmen x brans) */
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
                            atamalar: {
                                ana_ogretmen: boolean;
                                /** Format: date */
                                baslangic_tarihi: string;
                                /** Format: date */
                                bitis_tarihi: string | null;
                                brans_kodu: string;
                                /** Format: uuid */
                                grup_id: string;
                                /** Format: uuid */
                                id: string;
                                ogretmen_ad: string | null;
                                /**
                                 * Format: uuid
                                 * @description Ogretmen uyeligi (`uyelikler.id`).
                                 */
                                ogretmen_id: string;
                            }[];
                        };
                    };
                };
            };
        };
        put?: never;
        /** Ogretmeni gruba brans ile ata; ana ogretmen (grup x brans) tekildir */
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
                        /** @default false */
                        ana_ogretmen?: boolean;
                        brans_kodu: string;
                        /** Format: uuid */
                        ogretmen_id: string;
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
                            ana_ogretmen: boolean;
                            /** Format: date */
                            baslangic_tarihi: string;
                            /** Format: date */
                            bitis_tarihi: string | null;
                            brans_kodu: string;
                            /** Format: uuid */
                            grup_id: string;
                            /** Format: uuid */
                            id: string;
                            ogretmen_ad: string | null;
                            /**
                             * Format: uuid
                             * @description Ogretmen uyeligi (`uyelikler.id`).
                             */
                            ogretmen_id: string;
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
    "/v1/hesap/kurumlar/{kurum_id}/gruplar/{grup_id}/katilim-istekleri": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Grubun katilim isteklerini listele (durum suzgeci, sayfali). Yalniz gorunen ad doner; telefon ve e-posta donmez. */
        get: {
            parameters: {
                query?: {
                    durum?: "bekliyor" | "onaylandi" | "reddedildi" | "iptal";
                    /** @description Önceki sayfanın `sonraki_imlec` değeri. */
                    imlec?: string;
                    limit?: number;
                };
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
                            istekler: {
                                /** Format: date-time */
                                created_at: string;
                                /** @enum {string} */
                                durum: "bekliyor" | "onaylandi" | "reddedildi" | "iptal";
                                /** @description Yalniz ad; telefon ve e-posta donmez. */
                                gorunen_ad: string | null;
                                /** Format: uuid */
                                grup_id: string;
                                /** Format: uuid */
                                id: string;
                                /** Format: date-time */
                                karar_at: string | null;
                                /**
                                 * Format: uuid
                                 * @description Karar veren uyelik.
                                 */
                                karar_veren_id: string | null;
                                /** Format: uuid */
                                kullanici_id: string;
                            }[];
                            /** Format: uuid */
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
    "/v1/hesap/kurumlar/{kurum_id}/gruplar/{grup_id}/katilim-istekleri/{istek_id}/onayla": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Katilim istegini onayla: ogrenci uyeligi (yoksa) olusur ve ogrenci gruba sinif_kodu yoluyla eklenir. Kapasite dolu: 409 kapasite_dolu; kod kullanim siniri dolu: 409 kod_kullanim_doldu. Tekrar onay etkisizdir. */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    grup_id: string;
                    istek_id: string;
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
                            grup_uyesi_id: string | null;
                            istek: {
                                /** Format: date-time */
                                created_at: string;
                                /** @enum {string} */
                                durum: "bekliyor" | "onaylandi" | "reddedildi" | "iptal";
                                /** @description Yalniz ad; telefon ve e-posta donmez. */
                                gorunen_ad: string | null;
                                /** Format: uuid */
                                grup_id: string;
                                /** Format: uuid */
                                id: string;
                                /** Format: date-time */
                                karar_at: string | null;
                                /**
                                 * Format: uuid
                                 * @description Karar veren uyelik.
                                 */
                                karar_veren_id: string | null;
                                /** Format: uuid */
                                kullanici_id: string;
                            };
                            /** Format: uuid */
                            uyelik_id: string | null;
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
    "/v1/hesap/kurumlar/{kurum_id}/gruplar/{grup_id}/katilim-istekleri/{istek_id}/reddet": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Katilim istegini reddet: ogrenci eklenmez. Tekrar red etkisizdir; onaylanmis/iptal istek reddedilemez (409). */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    grup_id: string;
                    istek_id: string;
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
                            grup_uyesi_id: string | null;
                            istek: {
                                /** Format: date-time */
                                created_at: string;
                                /** @enum {string} */
                                durum: "bekliyor" | "onaylandi" | "reddedildi" | "iptal";
                                /** @description Yalniz ad; telefon ve e-posta donmez. */
                                gorunen_ad: string | null;
                                /** Format: uuid */
                                grup_id: string;
                                /** Format: uuid */
                                id: string;
                                /** Format: date-time */
                                karar_at: string | null;
                                /**
                                 * Format: uuid
                                 * @description Karar veren uyelik.
                                 */
                                karar_veren_id: string | null;
                                /** Format: uuid */
                                kullanici_id: string;
                            };
                            /** Format: uuid */
                            uyelik_id: string | null;
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
    "/v1/hesap/kurumlar/{kurum_id}/gruplar/{grup_id}/katilim-kodu": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Grubun etkin katilim kodu (yoksa 404). */
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
                            aktif: boolean;
                            /** Format: date-time */
                            created_at: string;
                            /** Format: date-time */
                            expires_at: string | null;
                            /** Format: uuid */
                            grup_id: string;
                            /** Format: uuid */
                            id: string;
                            /** Format: date-time */
                            iptal_at: string | null;
                            kod: string;
                            kullanim_sayisi: number;
                            max_kullanim: number | null;
                        };
                    };
                };
            };
        };
        put?: never;
        /** Sinif katilim kodu olustur / yenile. Grup basina tek etkin kod vardir; yenileme eski kodu kapatir (eski kod artik gecersiz). Yalniz sinif turu gruplar. */
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
                        /** @description Bos = suresiz. */
                        gecerlilik_gun?: number;
                        /** @description Onaylanabilecek en cok katilim. Bos = sinirsiz. */
                        max_kullanim?: number;
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
                            aktif: boolean;
                            /** Format: date-time */
                            created_at: string;
                            /** Format: date-time */
                            expires_at: string | null;
                            /** Format: uuid */
                            grup_id: string;
                            /** Format: uuid */
                            id: string;
                            /** Format: date-time */
                            iptal_at: string | null;
                            kod: string;
                            kullanim_sayisi: number;
                            max_kullanim: number | null;
                        };
                    };
                };
            };
        };
        /** Etkin katilim kodunu kapat. Bekleyen istekler etkilenmez; kod artik yeni istek kabul etmez. Etkin kod yoksa 404. */
        delete: {
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
                            aktif: boolean;
                            /** Format: date-time */
                            created_at: string;
                            /** Format: date-time */
                            expires_at: string | null;
                            /** Format: uuid */
                            grup_id: string;
                            /** Format: uuid */
                            id: string;
                            /** Format: date-time */
                            iptal_at: string | null;
                            kod: string;
                            kullanim_sayisi: number;
                            max_kullanim: number | null;
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
    "/v1/hesap/kurumlar/{kurum_id}/gruplar/{grup_id}/uyeler": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Grubun etkin ogrencileri (ogrenci kapsaminda yalniz kendisi gorunur) */
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
                            uyeler: {
                                /** Format: date */
                                baslangic_tarihi: string;
                                /** Format: date */
                                bitis_tarihi: string | null;
                                gorunen_ad: string | null;
                                /** Format: uuid */
                                grup_id: string;
                                /**
                                 * Format: uuid
                                 * @description `grup_uyeleri.id`
                                 */
                                id: string;
                                /** @enum {string} */
                                katilim_yolu: "yonetici" | "davet" | "sinif_kodu";
                                /**
                                 * Format: uuid
                                 * @description Ogrenci uyeligi (`uyelikler.id`).
                                 */
                                ogrenci_id: string;
                            }[];
                        };
                    };
                };
            };
        };
        put?: never;
        /** Gruba ogrenci ekle (coklu); zaten uye olanlar atlanir, kapasite asilirsa 409 */
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
                        /** @description Ogrenci uyelik kimlikleri; tek istekte coklu ekleme. */
                        ogrenci_idleri: string[];
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
                            eklenenler: {
                                /** Format: date */
                                baslangic_tarihi: string;
                                /** Format: date */
                                bitis_tarihi: string | null;
                                gorunen_ad: string | null;
                                /** Format: uuid */
                                grup_id: string;
                                /**
                                 * Format: uuid
                                 * @description `grup_uyeleri.id`
                                 */
                                id: string;
                                /** @enum {string} */
                                katilim_yolu: "yonetici" | "davet" | "sinif_kodu";
                                /**
                                 * Format: uuid
                                 * @description Ogrenci uyeligi (`uyelikler.id`).
                                 */
                                ogrenci_id: string;
                            }[];
                            /** @description Zaten etkin uye olan ogrenci uyelikleri (atlanir). */
                            zaten_uye: string[];
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
    "/v1/hesap/kurumlar/{kurum_id}/gruplar/{grup_id}/uyeler/{ogrenci_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** Ogrenciyi gruptan cikar (bitis_tarihi dolar, gecmis korunur) */
        delete: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    grup_id: string;
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
                            /** Format: date */
                            baslangic_tarihi: string;
                            /** Format: date */
                            bitis_tarihi: string | null;
                            gorunen_ad: string | null;
                            /** Format: uuid */
                            grup_id: string;
                            /**
                             * Format: uuid
                             * @description `grup_uyeleri.id`
                             */
                            id: string;
                            /** @enum {string} */
                            katilim_yolu: "yonetici" | "davet" | "sinif_kodu";
                            /**
                             * Format: uuid
                             * @description Ogrenci uyeligi (`uyelikler.id`).
                             */
                            ogrenci_id: string;
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
    "/v1/hesap/modul-ayarlari/etkin-tumu": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Tum modullerin durumu tek cagrida (kurum > kademe > grup); /modul-ayarlari/etkin ile ayni cozumleme */
        get: {
            parameters: {
                query?: {
                    grup_id?: string;
                    kademe_id?: string;
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
                            /** @description Her modül kodu için bu kademe/grupta etkin mi (kurum > kademe > grup). */
                            moduller: {
                                [key: string]: boolean;
                            };
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
    "/v1/hesap/oturumlar": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Acik oturumlarim (cihazlar). IP tam donmez, `bu_oturum` istegi yapan oturumu isaretler. */
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
                            oturumlar: {
                                /** @description İsteği yapan oturum mu. */
                                bu_oturum: boolean;
                                /** @description Kısaltılmış cihaz/tarayıcı bilgisi (en çok 80 karakter). */
                                cihaz: string | null;
                                /** Format: date-time */
                                created_at: string;
                                /** Format: date-time */
                                expires_at: string;
                                /** Format: uuid */
                                id: string;
                                /** @description IP adresinin ilk bölümleri, kalanı maskeli. */
                                ip_maskeli: string | null;
                                /** Format: date-time */
                                son_kullanim_at: string;
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
    "/v1/hesap/oturumlar/{oturum_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** Tek oturumu sonlandir. Baskasinin (veya olmayan) oturumu 404. Erisim belirteci aninda 401 olur. */
        delete: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    oturum_id: string;
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
                            /** @enum {boolean} */
                            sonlandirildi: true;
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
    "/v1/hesap/oturumlar/tumunu-kapat": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Tum oturumlarimi sonlandir (mevcut_haric=true ile istegi yapan oturum haric). Sonlanan oturumlarin erisim belirteci aninda 401 olur. */
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
                         * @description true: isteği yapan oturum açık kalır.
                         * @default false
                         */
                        mevcut_haric?: boolean;
                    } | null;
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
                            kapatilan: number;
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
    "/v1/hesap/sinif-kodu/istekler": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Kendi katilim isteklerim (varsayilan: bekleyenler), tum kurumlar. */
        get: {
            parameters: {
                query?: {
                    durum?: "bekliyor" | "onaylandi" | "reddedildi" | "iptal";
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
                            istekler: {
                                /** Format: date-time */
                                created_at: string;
                                /** @enum {string} */
                                durum: "bekliyor" | "onaylandi" | "reddedildi" | "iptal";
                                grup_ad: string | null;
                                /** Format: uuid */
                                grup_id: string;
                                /** Format: uuid */
                                id: string;
                                /** Format: date-time */
                                karar_at: string | null;
                                kurum_ad: string | null;
                                /** Format: uuid */
                                kurum_id: string;
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
    "/v1/hesap/sinif-kodu/istekler/{istek_id}/iptal": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Bekleyen katilim istegimi iptal et. Tekrar iptal etkisizdir; karara baglanmis istek iptal edilemez (409). Baskasinin istegi 404. */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    istek_id: string;
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
                            created_at: string;
                            /** @enum {string} */
                            durum: "bekliyor" | "onaylandi" | "reddedildi" | "iptal";
                            grup_ad: string | null;
                            /** Format: uuid */
                            grup_id: string;
                            /** Format: uuid */
                            id: string;
                            /** Format: date-time */
                            karar_at: string | null;
                            kurum_ad: string | null;
                            /** Format: uuid */
                            kurum_id: string;
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
    "/v1/hesap/sinif-kodu/katil": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Sinif koduyla katilim istegi gonder (ogretmen onayi gerekir). Gecersiz/kapali/suresi dolmus/kullanimi dolu/bulunamayan kod ayni 410 kod_gecersiz. IP basina dakikada 10 istek; 5 basarisiz denemede 15 dk bekleme (429). Zaten uyeyse 409 zaten_uye; bekleyen istek varsa ayni istek doner. */
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
                            /** Format: date-time */
                            created_at: string;
                            /** @enum {string} */
                            durum: "bekliyor" | "onaylandi" | "reddedildi" | "iptal";
                            grup_ad: string | null;
                            /** Format: uuid */
                            grup_id: string;
                            /** Format: uuid */
                            id: string;
                            /** Format: date-time */
                            karar_at: string | null;
                            kurum_ad: string | null;
                            /** Format: uuid */
                            kurum_id: string;
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
                            /** Format: date-time */
                            created_at: string;
                            /** @enum {string} */
                            durum: "bekliyor" | "onaylandi" | "reddedildi" | "iptal";
                            grup_ad: string | null;
                            /** Format: uuid */
                            grup_id: string;
                            /** Format: uuid */
                            id: string;
                            /** Format: date-time */
                            karar_at: string | null;
                            kurum_ad: string | null;
                            /** Format: uuid */
                            kurum_id: string;
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
    "/v1/ogrenme/kurumlar/{kurum_id}/kataloglar": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Katalog ve sürüm listesi (yalnız yayınlanmış sürümler) ile kurumun atanmış sürümü. */
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
                            kataloglar: {
                                en_yuksek_yayinlanmis: number | null;
                                /** @enum {string} */
                                katalog_kodu: "lgs" | "tyt" | "ayt" | "ydt" | "okul";
                                /** @description Kurum kapsamında atanmış sürüm. */
                                kurum_surumu: number | null;
                                surumler: {
                                    aciklama: string | null;
                                    ad: string;
                                    surum_no: number;
                                    /** Format: date-time */
                                    yayinlandi_at: string | null;
                                }[];
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
    "/v1/ogrenme/kurumlar/{kurum_id}/konular": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Konu listesi: global katalog (çözülen sürüme göre) ve kurum konuları. Kullanımdan kalkanlar varsayılan gizli, tumu=1 ile rozetli. Anahtar tabanlı sayfalama. */
        get: {
            parameters: {
                query?: {
                    brans_kodu?: string;
                    /** @description Önceki sayfanın `sonraki_imlec` değeri. */
                    imlec?: string;
                    /** @description Atama çözümü için kademe/grup bağlamı. */
                    kapsam?: "kurum" | "kademe" | "grup";
                    kapsam_id?: string;
                    /** @description Verilmezse tüm kataloglar, her biri kendi çözülmüş sürümüyle. */
                    katalog_kodu?: "lgs" | "tyt" | "ayt" | "ydt" | "okul";
                    kaynak?: "global" | "kurum";
                    limit?: number;
                    /** @description Ad araması (Türkçe harf duyarsız). */
                    q?: string;
                    seviye?: "unite" | "konu" | "alt_konu";
                    sinif_seviyesi?: number;
                    /** @description Yalnız `katalog_kodu` ile. Varsayılan: kurumun atanmış sürümü, yoksa en yüksek yayınlanmış. */
                    surum_no?: number;
                    /** @description 1: kullanımdan kalkan ve arşivlenen konular da gelir (rozetli). */
                    tumu?: "0" | "1" | "true" | "false";
                    ust_id?: string;
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
                            konular: {
                                ad: string;
                                /** Format: date-time */
                                arsivlendi_at: string | null;
                                brans_kodu: string;
                                gecerli_surum_baslangic: number | null;
                                gecerli_surum_bitis: number | null;
                                /** Format: uuid */
                                id: string;
                                /** @enum {string|null} */
                                katalog_kodu: "lgs" | "tyt" | "ayt" | "ydt" | "okul" | null;
                                kazanim_kodu: string | null;
                                /** @description Sorgulanan sürümde artık yok (global) ya da arşivlendi (kurum). Rozet için. */
                                kullanimdan_kalkti: boolean;
                                /**
                                 * Format: uuid
                                 * @description null: global katalog konusu (salt okunur).
                                 */
                                kurum_id: string | null;
                                /** @enum {string} */
                                seviye: "unite" | "konu" | "alt_konu";
                                sinif_seviyesi: number | null;
                                sira: number;
                                /** @description Kayıt sürümü (iyimser kilit). */
                                surum: number;
                                /** Format: uuid */
                                ust_id: string | null;
                                /** Format: uuid */
                                yerine_gecen_id: string | null;
                            }[];
                            sonraki_imlec: string | null;
                            /** @description Sorgunun çözdüğü katalog sürümleri. */
                            surumler: {
                                /** @enum {string} */
                                katalog_kodu: "lgs" | "tyt" | "ayt" | "ydt" | "okul";
                                surum_no: number;
                            }[];
                        };
                    };
                };
            };
        };
        put?: never;
        /** Kuruma özel konu ekle (ünite > konu > alt konu). */
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
                        ad: string;
                        brans_kodu: string;
                        kazanim_kodu?: string;
                        /** @enum {string} */
                        seviye: "unite" | "konu" | "alt_konu";
                        sinif_seviyesi?: number;
                        /** @default 0 */
                        sira?: number;
                        /** Format: uuid */
                        ust_id?: string;
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
                            ad: string;
                            /** Format: date-time */
                            arsivlendi_at: string | null;
                            brans_kodu: string;
                            gecerli_surum_baslangic: number | null;
                            gecerli_surum_bitis: number | null;
                            /** Format: uuid */
                            id: string;
                            /** @enum {string|null} */
                            katalog_kodu: "lgs" | "tyt" | "ayt" | "ydt" | "okul" | null;
                            kazanim_kodu: string | null;
                            /** @description Sorgulanan sürümde artık yok (global) ya da arşivlendi (kurum). Rozet için. */
                            kullanimdan_kalkti: boolean;
                            /**
                             * Format: uuid
                             * @description null: global katalog konusu (salt okunur).
                             */
                            kurum_id: string | null;
                            /** @enum {string} */
                            seviye: "unite" | "konu" | "alt_konu";
                            sinif_seviyesi: number | null;
                            sira: number;
                            /** @description Kayıt sürümü (iyimser kilit). */
                            surum: number;
                            /** Format: uuid */
                            ust_id: string | null;
                            /** Format: uuid */
                            yerine_gecen_id: string | null;
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
    "/v1/ogrenme/kurumlar/{kurum_id}/konular/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Tekil konu ve üst zinciri. Kullanımdan kalkma, kurumun çözülmüş sürümüne göre işaretlenir. */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
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
                            /** Format: date-time */
                            arsivlendi_at: string | null;
                            brans_kodu: string;
                            gecerli_surum_baslangic: number | null;
                            gecerli_surum_bitis: number | null;
                            /** Format: uuid */
                            id: string;
                            /** @enum {string|null} */
                            katalog_kodu: "lgs" | "tyt" | "ayt" | "ydt" | "okul" | null;
                            kazanim_kodu: string | null;
                            /** @description Sorgulanan sürümde artık yok (global) ya da arşivlendi (kurum). Rozet için. */
                            kullanimdan_kalkti: boolean;
                            /**
                             * Format: uuid
                             * @description null: global katalog konusu (salt okunur).
                             */
                            kurum_id: string | null;
                            /** @enum {string} */
                            seviye: "unite" | "konu" | "alt_konu";
                            sinif_seviyesi: number | null;
                            sira: number;
                            /** @description Kayıt sürümü (iyimser kilit). */
                            surum: number;
                            /** Format: uuid */
                            ust_id: string | null;
                            /** @description Kökten yakın üste doğru. */
                            ust_zinciri: {
                                ad: string;
                                /** Format: uuid */
                                id: string;
                                /** @enum {string} */
                                seviye: "unite" | "konu" | "alt_konu";
                            }[];
                            /** Format: uuid */
                            yerine_gecen_id: string | null;
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
        /** Kurum konusunu güncelle. Global katalog konusu için 403 global_konu_yazilamaz. */
        patch: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                    kurum_id: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        ad?: string;
                        kazanim_kodu?: string | null;
                        /** @enum {string} */
                        seviye?: "unite" | "konu" | "alt_konu";
                        sinif_seviyesi?: number | null;
                        sira?: number;
                        /** Format: uuid */
                        ust_id?: string | null;
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
                            /** Format: date-time */
                            arsivlendi_at: string | null;
                            brans_kodu: string;
                            gecerli_surum_baslangic: number | null;
                            gecerli_surum_bitis: number | null;
                            /** Format: uuid */
                            id: string;
                            /** @enum {string|null} */
                            katalog_kodu: "lgs" | "tyt" | "ayt" | "ydt" | "okul" | null;
                            kazanim_kodu: string | null;
                            /** @description Sorgulanan sürümde artık yok (global) ya da arşivlendi (kurum). Rozet için. */
                            kullanimdan_kalkti: boolean;
                            /**
                             * Format: uuid
                             * @description null: global katalog konusu (salt okunur).
                             */
                            kurum_id: string | null;
                            /** @enum {string} */
                            seviye: "unite" | "konu" | "alt_konu";
                            sinif_seviyesi: number | null;
                            sira: number;
                            /** @description Kayıt sürümü (iyimser kilit). */
                            surum: number;
                            /** Format: uuid */
                            ust_id: string | null;
                            /** Format: uuid */
                            yerine_gecen_id: string | null;
                        };
                    };
                };
            };
        };
        trace?: never;
    };
    "/v1/ogrenme/kurumlar/{kurum_id}/konular/{id}/arsivden-cikar": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Arşivlenmiş kurum konusunu geri getir (idempotent). */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
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
                            /** Format: date-time */
                            arsivlendi_at: string | null;
                            brans_kodu: string;
                            gecerli_surum_baslangic: number | null;
                            gecerli_surum_bitis: number | null;
                            /** Format: uuid */
                            id: string;
                            /** @enum {string|null} */
                            katalog_kodu: "lgs" | "tyt" | "ayt" | "ydt" | "okul" | null;
                            kazanim_kodu: string | null;
                            /** @description Sorgulanan sürümde artık yok (global) ya da arşivlendi (kurum). Rozet için. */
                            kullanimdan_kalkti: boolean;
                            /**
                             * Format: uuid
                             * @description null: global katalog konusu (salt okunur).
                             */
                            kurum_id: string | null;
                            /** @enum {string} */
                            seviye: "unite" | "konu" | "alt_konu";
                            sinif_seviyesi: number | null;
                            sira: number;
                            /** @description Kayıt sürümü (iyimser kilit). */
                            surum: number;
                            /** Format: uuid */
                            ust_id: string | null;
                            /** Format: uuid */
                            yerine_gecen_id: string | null;
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
    "/v1/ogrenme/kurumlar/{kurum_id}/konular/{id}/arsivle": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Kurum konusunu arşivle (silinmez; idempotent). */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
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
                            /** Format: date-time */
                            arsivlendi_at: string | null;
                            brans_kodu: string;
                            gecerli_surum_baslangic: number | null;
                            gecerli_surum_bitis: number | null;
                            /** Format: uuid */
                            id: string;
                            /** @enum {string|null} */
                            katalog_kodu: "lgs" | "tyt" | "ayt" | "ydt" | "okul" | null;
                            kazanim_kodu: string | null;
                            /** @description Sorgulanan sürümde artık yok (global) ya da arşivlendi (kurum). Rozet için. */
                            kullanimdan_kalkti: boolean;
                            /**
                             * Format: uuid
                             * @description null: global katalog konusu (salt okunur).
                             */
                            kurum_id: string | null;
                            /** @enum {string} */
                            seviye: "unite" | "konu" | "alt_konu";
                            sinif_seviyesi: number | null;
                            sira: number;
                            /** @description Kayıt sürümü (iyimser kilit). */
                            surum: number;
                            /** Format: uuid */
                            ust_id: string | null;
                            /** Format: uuid */
                            yerine_gecen_id: string | null;
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
    "/v1/ogrenme/kurumlar/{kurum_id}/mufredat-atamalari": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Kurum, kademe ve grup için atanmış katalog sürümleri. */
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
                            atamalar: {
                                /** Format: uuid */
                                id: string;
                                /** @enum {string} */
                                kapsam: "kurum" | "kademe" | "grup";
                                /** Format: uuid */
                                kapsam_id: string;
                                /** @enum {string} */
                                katalog_kodu: "lgs" | "tyt" | "ayt" | "ydt" | "okul";
                                surum: number;
                                surum_no: number;
                                /** Format: date-time */
                                updated_at: string;
                            }[];
                        };
                    };
                };
            };
        };
        /** Kapsam (kurum/kademe/grup) ve katalog için sürüm ata (upsert). Yalnız yayınlanmış sürüm atanır. */
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
                        /** @enum {string} */
                        kapsam: "kurum" | "kademe" | "grup";
                        /**
                         * Format: uuid
                         * @description `kurum` için kurum kimliği; `kademe`/`grup` için kendi kimliği.
                         */
                        kapsam_id: string;
                        /** @enum {string} */
                        katalog_kodu: "lgs" | "tyt" | "ayt" | "ydt" | "okul";
                        surum_no: number;
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
                            /** Format: uuid */
                            id: string;
                            /** @enum {string} */
                            kapsam: "kurum" | "kademe" | "grup";
                            /** Format: uuid */
                            kapsam_id: string;
                            /** @enum {string} */
                            katalog_kodu: "lgs" | "tyt" | "ayt" | "ydt" | "okul";
                            surum: number;
                            surum_no: number;
                            /** Format: date-time */
                            updated_at: string;
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
