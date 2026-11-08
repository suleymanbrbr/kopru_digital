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
