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
    "/platform/ben": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Platform kimliğim ve ikinci adım durumum */
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
                            ikinci_adim: {
                                kurulu: boolean;
                                oturumda_dogrulandi: boolean;
                                yedek_kod_kalan: number;
                            };
                            /** Format: uuid */
                            kullanici_id: string;
                            /** @enum {string} */
                            platform_rolu: "destek" | "yonetici";
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
    "/platform/denetim": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Denetim kayıtları (filtre: kurum, aktör, eylem, tarih; imleçli)
         * @description `eylem` tam ad veya `onek.*` olabilir. Sıralama `created_at, id` azalan; `sonraki_imlec` bir sonraki sayfa içindir.
         */
        get: {
            parameters: {
                query?: {
                    aktor_id?: string;
                    baslangic?: string;
                    bitis?: string;
                    /** @description Tam eylem adı (ör. `platform.modul_ayarla`) veya `onek.*`. */
                    eylem?: string;
                    imlec?: string;
                    kurum_id?: string;
                    limit?: number;
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
                            kayitlar: {
                                /** Format: uuid */
                                aktor_kullanici_id: string | null;
                                ayrinti: {
                                    [key: string]: unknown;
                                } | null;
                                /** Format: date-time */
                                created_at: string;
                                eylem: string;
                                /** Format: uuid */
                                hedef_id: string | null;
                                hedef_turu: string | null;
                                /** Format: uuid */
                                id: string;
                                ip: string | null;
                                /** Format: uuid */
                                kurum_id: string | null;
                                neden: string | null;
                                /** Format: uuid */
                                taklit_kayit_id: string | null;
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
    "/platform/ikinci-adim/dogrula": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Oturumu ikinci adım koduyla (veya yedek kodla) doğrula
         * @description Başarılı doğrulama oturuma bağlanır ve `PLATFORM_IKINCI_ADIM_OMRU_SN` boyunca `/platform/*` açılır. Diğer servislerin platform uçları için `POST /auth/token` ile yeni belirteç alın (`plat_2fa_exp` claim'i). 5 yanlış denemede 15 dakika kilit (429). Aynı TOTP kodu iki kez kullanılamaz. Yedek kod tek kullanımlıktır.
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
                        kod?: string;
                        yedek_kod?: string;
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
                            dogrulandi: true;
                            yedek_kod_kalan: number;
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
    "/platform/ikinci-adim/kur": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * İki adımlı doğrulamayı kur (otpauth URI + yedek kodlar)
         * @description Sır ve yedek kodlar yalnız bu yanıtta gösterilir. Kurulum `onayla` ile bir kodla onaylanana kadar etkin değildir; onaylanmış kurulum yeniden yapılamaz (409). Sıfırlama yalnız `platform:yonetici-ekle --2fa-sifirla` betiğiyle.
         */
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
                            otpauth_uri: string;
                            /** @description Base32 sır; QR okutulamazsa elle girilir. */
                            sir: string;
                            /** @description Tek kullanımlık yedek kodlar; yalnız bu yanıtta gösterilir. */
                            yedek_kodlar: string[];
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
    "/platform/ikinci-adim/onayla": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Kurulumu ilk kodla onayla (oturumu da doğrulanmış sayar)
         * @description Başarıdan sonra `POST /auth/token` ile yeni erişim belirteci alın: belirteçteki `plat_2fa_exp` claim'i diğer servislerin (motivasyon) platform uçlarını açar.
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
                            /** @enum {boolean} */
                            dogrulandi: true;
                            yedek_kod_kalan: number;
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
    "/platform/kurumlar": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Kurum listesi ve arama (ad, kurum kimliği, sahip telefonu/e-postası)
         * @description Sahip iletişim bilgisi yalnız maskeli döner. Telefon ve e-posta aramasında tam değer gerekir (öneklerle arama yoktur).
         */
        get: {
            parameters: {
                query?: {
                    durum?: "aktif" | "askida" | "kapali";
                    imlec?: string;
                    limit?: number;
                    /** @description Kurum adı, kurum kimliği, sahibin telefonu (tam) veya e-postası (tam). */
                    q?: string;
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
                            kurumlar: {
                                ad: string;
                                /** Format: date-time */
                                created_at: string;
                                /** @enum {string} */
                                durum: "aktif" | "askida" | "kapali";
                                /** Format: uuid */
                                id: string;
                                sahipler: {
                                    eposta_maskeli: string | null;
                                    /** Format: uuid */
                                    kullanici_id: string;
                                    telefon_maskeli: string | null;
                                }[];
                                /** @enum {string} */
                                tur: "bireysel" | "ekip" | "kurum";
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
    "/platform/kurumlar/{kurum_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Kurum detayı: üye sayıları, durum, platform askısı, abonelik özeti, modül ayarları, beta özellikleri */
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
                            abonelik: {
                                abonelik: {
                                    /** @enum {string|null} */
                                    bekleyen_periyot: "aylik" | "yillik" | null;
                                    bekleyen_plan_kodu: string | null;
                                    /** Format: date-time */
                                    deneme_bitis_at: string | null;
                                    /** Format: date-time */
                                    donem_baslangic_at: string;
                                    /** Format: date-time */
                                    donem_bitis_at: string;
                                    /** @enum {string} */
                                    durum: "deneme" | "aktif" | "odeme_bekliyor" | "ek_sure" | "askida" | "iptal" | "sona_erdi";
                                    /** Format: date-time */
                                    ek_sure_bitis_at: string | null;
                                    fiyat_kurus: number;
                                    /** Format: uuid */
                                    id: string;
                                    /** Format: date-time */
                                    iptal_istendi_at: string | null;
                                    /** @enum {string} */
                                    kaynak: "deneme" | "iyzico" | "apple" | "google" | "kurumsal";
                                    otomatik_yenileme: boolean;
                                    /** @enum {string} */
                                    periyot: "aylik" | "yillik";
                                    plan: {
                                        ad: string;
                                        aylik_fiyat_kurus: number;
                                        /** Format: uuid */
                                        id: string;
                                        kdv_orani: number;
                                        kod: string;
                                        /** @enum {string} */
                                        kurum_turu: "bireysel" | "ekip" | "kurum";
                                        limitler: {
                                            max_ogrenci: number;
                                            max_ogretmen: number;
                                            max_sube: number;
                                            medya_kota_bayt: number;
                                            sms_aylik: number;
                                            soru_aylik_ogrenci: number;
                                        };
                                        magaza_urun_kodlari: {
                                            apple?: string;
                                            google?: string;
                                        } | null;
                                        moduller: string[];
                                        surum: number;
                                        yillik_fiyat_kurus: number | null;
                                    };
                                } | null;
                                yazma_kilitli: boolean;
                            };
                            ad: string;
                            beta_ozellikleri: {
                                acik: boolean;
                                ozellik_kodu: string;
                                /** Format: date-time */
                                updated_at: string;
                            }[];
                            /** Format: date-time */
                            created_at: string;
                            /** @enum {string} */
                            durum: "aktif" | "askida" | "kapali";
                            /** Format: uuid */
                            id: string;
                            moduller: {
                                /** @description Kademe/grup düzeyinde kapatılan ayar sayısı. */
                                alt_duzey_kapali_sayisi: number;
                                /** @description Kurum düzeyinde etkin değer (kayıt yoksa true). */
                                kurum_acik: boolean;
                                kurum_ayari_var: boolean;
                                /** @enum {string} */
                                modul_kodu: "takvim" | "yoklama" | "geri_bildirim" | "kayitlar" | "finans" | "odev" | "haftalik_plan" | "deneme" | "soru_sor" | "oyunlastirma" | "duyuru";
                            }[];
                            platform_aski: {
                                /** @description Platform yöneticisi kurumu elle askıya aldı. */
                                askida: boolean;
                                /** Format: date-time */
                                askida_at: string | null;
                                neden: string | null;
                            };
                            saat_dilimi: string;
                            sahipler: {
                                eposta_maskeli: string | null;
                                /** Format: uuid */
                                kullanici_id: string;
                                telefon_maskeli: string | null;
                            }[];
                            /** @enum {string} */
                            tur: "bireysel" | "ekip" | "kurum";
                            uye_sayilari: {
                                aktif_toplam: number;
                                diger_durumlar: number;
                                rollere_gore: {
                                    [key: string]: number;
                                };
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
    "/platform/kurumlar/{kurum_id}/abonelik": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Kurum aboneliği: güncel durum, abonelik geçmişi ve ödemeler */
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
                            abonelik: {
                                /** @enum {string|null} */
                                bekleyen_periyot: "aylik" | "yillik" | null;
                                bekleyen_plan_kodu: string | null;
                                /** Format: date-time */
                                deneme_bitis_at: string | null;
                                /** Format: date-time */
                                donem_baslangic_at: string;
                                /** Format: date-time */
                                donem_bitis_at: string;
                                /** @enum {string} */
                                durum: "deneme" | "aktif" | "odeme_bekliyor" | "ek_sure" | "askida" | "iptal" | "sona_erdi";
                                /** Format: date-time */
                                ek_sure_bitis_at: string | null;
                                fiyat_kurus: number;
                                /** Format: uuid */
                                id: string;
                                /** Format: date-time */
                                iptal_istendi_at: string | null;
                                /** @enum {string} */
                                kaynak: "deneme" | "iyzico" | "apple" | "google" | "kurumsal";
                                otomatik_yenileme: boolean;
                                /** @enum {string} */
                                periyot: "aylik" | "yillik";
                                plan: {
                                    ad: string;
                                    aylik_fiyat_kurus: number;
                                    /** Format: uuid */
                                    id: string;
                                    kdv_orani: number;
                                    kod: string;
                                    /** @enum {string} */
                                    kurum_turu: "bireysel" | "ekip" | "kurum";
                                    limitler: {
                                        max_ogrenci: number;
                                        max_ogretmen: number;
                                        max_sube: number;
                                        medya_kota_bayt: number;
                                        sms_aylik: number;
                                        soru_aylik_ogrenci: number;
                                    };
                                    magaza_urun_kodlari: {
                                        apple?: string;
                                        google?: string;
                                    } | null;
                                    moduller: string[];
                                    surum: number;
                                    yillik_fiyat_kurus: number | null;
                                };
                            } | null;
                            /** @description Tüm abonelik kayıtları, yeniden eskiye (en çok 50). */
                            gecmis: {
                                /** @enum {string|null} */
                                bekleyen_periyot: "aylik" | "yillik" | null;
                                bekleyen_plan_kodu: string | null;
                                /** Format: date-time */
                                deneme_bitis_at: string | null;
                                /** Format: date-time */
                                donem_baslangic_at: string;
                                /** Format: date-time */
                                donem_bitis_at: string;
                                /** @enum {string} */
                                durum: "deneme" | "aktif" | "odeme_bekliyor" | "ek_sure" | "askida" | "iptal" | "sona_erdi";
                                /** Format: date-time */
                                ek_sure_bitis_at: string | null;
                                fiyat_kurus: number;
                                /** Format: uuid */
                                id: string;
                                /** Format: date-time */
                                iptal_istendi_at: string | null;
                                /** @enum {string} */
                                kaynak: "deneme" | "iyzico" | "apple" | "google" | "kurumsal";
                                otomatik_yenileme: boolean;
                                /** @enum {string} */
                                periyot: "aylik" | "yillik";
                                plan: {
                                    ad: string;
                                    aylik_fiyat_kurus: number;
                                    /** Format: uuid */
                                    id: string;
                                    kdv_orani: number;
                                    kod: string;
                                    /** @enum {string} */
                                    kurum_turu: "bireysel" | "ekip" | "kurum";
                                    limitler: {
                                        max_ogrenci: number;
                                        max_ogretmen: number;
                                        max_sube: number;
                                        medya_kota_bayt: number;
                                        sms_aylik: number;
                                        soru_aylik_ogrenci: number;
                                    };
                                    magaza_urun_kodlari: {
                                        apple?: string;
                                        google?: string;
                                    } | null;
                                    moduller: string[];
                                    surum: number;
                                    yillik_fiyat_kurus: number | null;
                                };
                            }[];
                            /** @description Ödemeler, yeniden eskiye (en çok 50). */
                            odemeler: {
                                /** Format: uuid */
                                abonelik_id: string;
                                /** Format: date-time */
                                donem_baslangic_at: string;
                                /** Format: date-time */
                                donem_bitis_at: string;
                                /** @enum {string} */
                                durum: "basarili" | "basarisiz" | "iade";
                                hata_kodu: string | null;
                                /** Format: uuid */
                                id: string;
                                /** @enum {string} */
                                kaynak: "deneme" | "iyzico" | "apple" | "google" | "kurumsal";
                                kdv_kurus: number;
                                /** Format: date-time */
                                odeme_at: string;
                                tutar_kurus: number;
                            }[];
                            yazma_kilitli: boolean;
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
    "/platform/kurumlar/{kurum_id}/abonelik/askiya-al": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Aboneliği askıya al (platform kurum askısından ayrı)
         * @description Etkin abonelik `askida` olur: kurum yazma isteklerinde `402 abonelik_gerekli` alır. Platform kurum askısı için `/kurumlar/:id/askiya-al`.
         */
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
                            abonelik: {
                                /** @enum {string|null} */
                                bekleyen_periyot: "aylik" | "yillik" | null;
                                bekleyen_plan_kodu: string | null;
                                /** Format: date-time */
                                deneme_bitis_at: string | null;
                                /** Format: date-time */
                                donem_baslangic_at: string;
                                /** Format: date-time */
                                donem_bitis_at: string;
                                /** @enum {string} */
                                durum: "deneme" | "aktif" | "odeme_bekliyor" | "ek_sure" | "askida" | "iptal" | "sona_erdi";
                                /** Format: date-time */
                                ek_sure_bitis_at: string | null;
                                fiyat_kurus: number;
                                /** Format: uuid */
                                id: string;
                                /** Format: date-time */
                                iptal_istendi_at: string | null;
                                /** @enum {string} */
                                kaynak: "deneme" | "iyzico" | "apple" | "google" | "kurumsal";
                                otomatik_yenileme: boolean;
                                /** @enum {string} */
                                periyot: "aylik" | "yillik";
                                plan: {
                                    ad: string;
                                    aylik_fiyat_kurus: number;
                                    /** Format: uuid */
                                    id: string;
                                    kdv_orani: number;
                                    kod: string;
                                    /** @enum {string} */
                                    kurum_turu: "bireysel" | "ekip" | "kurum";
                                    limitler: {
                                        max_ogrenci: number;
                                        max_ogretmen: number;
                                        max_sube: number;
                                        medya_kota_bayt: number;
                                        sms_aylik: number;
                                        soru_aylik_ogrenci: number;
                                    };
                                    magaza_urun_kodlari: {
                                        apple?: string;
                                        google?: string;
                                    } | null;
                                    moduller: string[];
                                    surum: number;
                                    yillik_fiyat_kurus: number | null;
                                };
                            };
                            /** @enum {string} */
                            kurum_durumu: "aktif" | "askida" | "kapali";
                            platform_askida: boolean;
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
    "/platform/kurumlar/{kurum_id}/abonelik/deneme-uzat": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Deneme süresini uzat
         * @description Etkin deneme `gun` kadar uzar; bitmiş (`sona_erdi`) deneme yeniden açılır.
         */
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
                        gun: number;
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
                            abonelik: {
                                /** @enum {string|null} */
                                bekleyen_periyot: "aylik" | "yillik" | null;
                                bekleyen_plan_kodu: string | null;
                                /** Format: date-time */
                                deneme_bitis_at: string | null;
                                /** Format: date-time */
                                donem_baslangic_at: string;
                                /** Format: date-time */
                                donem_bitis_at: string;
                                /** @enum {string} */
                                durum: "deneme" | "aktif" | "odeme_bekliyor" | "ek_sure" | "askida" | "iptal" | "sona_erdi";
                                /** Format: date-time */
                                ek_sure_bitis_at: string | null;
                                fiyat_kurus: number;
                                /** Format: uuid */
                                id: string;
                                /** Format: date-time */
                                iptal_istendi_at: string | null;
                                /** @enum {string} */
                                kaynak: "deneme" | "iyzico" | "apple" | "google" | "kurumsal";
                                otomatik_yenileme: boolean;
                                /** @enum {string} */
                                periyot: "aylik" | "yillik";
                                plan: {
                                    ad: string;
                                    aylik_fiyat_kurus: number;
                                    /** Format: uuid */
                                    id: string;
                                    kdv_orani: number;
                                    kod: string;
                                    /** @enum {string} */
                                    kurum_turu: "bireysel" | "ekip" | "kurum";
                                    limitler: {
                                        max_ogrenci: number;
                                        max_ogretmen: number;
                                        max_sube: number;
                                        medya_kota_bayt: number;
                                        sms_aylik: number;
                                        soru_aylik_ogrenci: number;
                                    };
                                    magaza_urun_kodlari: {
                                        apple?: string;
                                        google?: string;
                                    } | null;
                                    moduller: string[];
                                    surum: number;
                                    yillik_fiyat_kurus: number | null;
                                };
                            };
                            /** @enum {string} */
                            kurum_durumu: "aktif" | "askida" | "kapali";
                            platform_askida: boolean;
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
    "/platform/kurumlar/{kurum_id}/abonelik/ek-sure": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Ek süre ver
         * @description Ödemesi bekleyen / ek süredeki / askıdaki (ücretli) abonelik `ek_sure` durumuna alınır ve tam erişim `gun` kadar sürer.
         */
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
                        gun: number;
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
                            abonelik: {
                                /** @enum {string|null} */
                                bekleyen_periyot: "aylik" | "yillik" | null;
                                bekleyen_plan_kodu: string | null;
                                /** Format: date-time */
                                deneme_bitis_at: string | null;
                                /** Format: date-time */
                                donem_baslangic_at: string;
                                /** Format: date-time */
                                donem_bitis_at: string;
                                /** @enum {string} */
                                durum: "deneme" | "aktif" | "odeme_bekliyor" | "ek_sure" | "askida" | "iptal" | "sona_erdi";
                                /** Format: date-time */
                                ek_sure_bitis_at: string | null;
                                fiyat_kurus: number;
                                /** Format: uuid */
                                id: string;
                                /** Format: date-time */
                                iptal_istendi_at: string | null;
                                /** @enum {string} */
                                kaynak: "deneme" | "iyzico" | "apple" | "google" | "kurumsal";
                                otomatik_yenileme: boolean;
                                /** @enum {string} */
                                periyot: "aylik" | "yillik";
                                plan: {
                                    ad: string;
                                    aylik_fiyat_kurus: number;
                                    /** Format: uuid */
                                    id: string;
                                    kdv_orani: number;
                                    kod: string;
                                    /** @enum {string} */
                                    kurum_turu: "bireysel" | "ekip" | "kurum";
                                    limitler: {
                                        max_ogrenci: number;
                                        max_ogretmen: number;
                                        max_sube: number;
                                        medya_kota_bayt: number;
                                        sms_aylik: number;
                                        soru_aylik_ogrenci: number;
                                    };
                                    magaza_urun_kodlari: {
                                        apple?: string;
                                        google?: string;
                                    } | null;
                                    moduller: string[];
                                    surum: number;
                                    yillik_fiyat_kurus: number | null;
                                };
                            };
                            /** @enum {string} */
                            kurum_durumu: "aktif" | "askida" | "kapali";
                            platform_askida: boolean;
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
    "/platform/kurumlar/{kurum_id}/abonelik/iptal": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Aboneliği iptal et
         * @description `hemen=false` (varsayılan): yenileme iptal edilir, dönem sonunda biter. `hemen=true`: abonelik şimdi `iptal` olur.
         */
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
                         * @description true: abonelik hemen `iptal` olur; false: yenileme iptal edilir, dönem sonunda biter.
                         * @default false
                         */
                        hemen?: boolean;
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
                            abonelik: {
                                /** @enum {string|null} */
                                bekleyen_periyot: "aylik" | "yillik" | null;
                                bekleyen_plan_kodu: string | null;
                                /** Format: date-time */
                                deneme_bitis_at: string | null;
                                /** Format: date-time */
                                donem_baslangic_at: string;
                                /** Format: date-time */
                                donem_bitis_at: string;
                                /** @enum {string} */
                                durum: "deneme" | "aktif" | "odeme_bekliyor" | "ek_sure" | "askida" | "iptal" | "sona_erdi";
                                /** Format: date-time */
                                ek_sure_bitis_at: string | null;
                                fiyat_kurus: number;
                                /** Format: uuid */
                                id: string;
                                /** Format: date-time */
                                iptal_istendi_at: string | null;
                                /** @enum {string} */
                                kaynak: "deneme" | "iyzico" | "apple" | "google" | "kurumsal";
                                otomatik_yenileme: boolean;
                                /** @enum {string} */
                                periyot: "aylik" | "yillik";
                                plan: {
                                    ad: string;
                                    aylik_fiyat_kurus: number;
                                    /** Format: uuid */
                                    id: string;
                                    kdv_orani: number;
                                    kod: string;
                                    /** @enum {string} */
                                    kurum_turu: "bireysel" | "ekip" | "kurum";
                                    limitler: {
                                        max_ogrenci: number;
                                        max_ogretmen: number;
                                        max_sube: number;
                                        medya_kota_bayt: number;
                                        sms_aylik: number;
                                        soru_aylik_ogrenci: number;
                                    };
                                    magaza_urun_kodlari: {
                                        apple?: string;
                                        google?: string;
                                    } | null;
                                    moduller: string[];
                                    surum: number;
                                    yillik_fiyat_kurus: number | null;
                                };
                            };
                            /** @enum {string} */
                            kurum_durumu: "aktif" | "askida" | "kapali";
                            platform_askida: boolean;
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
    "/platform/kurumlar/{kurum_id}/abonelik/kurumsal-aktivasyon": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Kurumsal (elle) aboneliği etkinleştir
         * @description Teklif + fatura sözleşme numarasıyla kurum aboneliği `kurumsal` kaynakla `aktif` olur; deneme/askıdaki abonelik sona erer. Platform askısındaki kurum bu işlemle açılmaz.
         */
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
                         * Format: date-time
                         * @description Varsayılan: şimdi.
                         */
                        donem_baslangic_at?: string;
                        /**
                         * Format: date-time
                         * @description Varsayılan: periyoda göre 30 / 365 gün.
                         */
                        donem_bitis_at?: string;
                        /** @description Anlaşılan fiyat; varsayılan plan fiyatı. */
                        fiyat_kurus?: number;
                        neden: string;
                        /**
                         * @default aylik
                         * @enum {string}
                         */
                        periyot?: "aylik" | "yillik";
                        plan_kodu: string;
                        sozlesme_no: string;
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
                            abonelik: {
                                /** @enum {string|null} */
                                bekleyen_periyot: "aylik" | "yillik" | null;
                                bekleyen_plan_kodu: string | null;
                                /** Format: date-time */
                                deneme_bitis_at: string | null;
                                /** Format: date-time */
                                donem_baslangic_at: string;
                                /** Format: date-time */
                                donem_bitis_at: string;
                                /** @enum {string} */
                                durum: "deneme" | "aktif" | "odeme_bekliyor" | "ek_sure" | "askida" | "iptal" | "sona_erdi";
                                /** Format: date-time */
                                ek_sure_bitis_at: string | null;
                                fiyat_kurus: number;
                                /** Format: uuid */
                                id: string;
                                /** Format: date-time */
                                iptal_istendi_at: string | null;
                                /** @enum {string} */
                                kaynak: "deneme" | "iyzico" | "apple" | "google" | "kurumsal";
                                otomatik_yenileme: boolean;
                                /** @enum {string} */
                                periyot: "aylik" | "yillik";
                                plan: {
                                    ad: string;
                                    aylik_fiyat_kurus: number;
                                    /** Format: uuid */
                                    id: string;
                                    kdv_orani: number;
                                    kod: string;
                                    /** @enum {string} */
                                    kurum_turu: "bireysel" | "ekip" | "kurum";
                                    limitler: {
                                        max_ogrenci: number;
                                        max_ogretmen: number;
                                        max_sube: number;
                                        medya_kota_bayt: number;
                                        sms_aylik: number;
                                        soru_aylik_ogrenci: number;
                                    };
                                    magaza_urun_kodlari: {
                                        apple?: string;
                                        google?: string;
                                    } | null;
                                    moduller: string[];
                                    surum: number;
                                    yillik_fiyat_kurus: number | null;
                                };
                            };
                            /** @enum {string} */
                            kurum_durumu: "aktif" | "askida" | "kapali";
                            platform_askida: boolean;
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
    "/platform/kurumlar/{kurum_id}/abonelik/plan-degistir": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Planı değiştir
         * @description `hemen=true` (varsayılan) plan/periyodu anında değiştirir; `false` sahip akışıyla aynı biçimde dönem sonunda uygular.
         */
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
                         * @description false: ücretli abonelikte hedef plan dönem sonunda uygulanır (sahip akışıyla aynı).
                         * @default true
                         */
                        hemen?: boolean;
                        neden: string;
                        /** @enum {string} */
                        periyot?: "aylik" | "yillik";
                        plan_kodu: string;
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
                            abonelik: {
                                /** @enum {string|null} */
                                bekleyen_periyot: "aylik" | "yillik" | null;
                                bekleyen_plan_kodu: string | null;
                                /** Format: date-time */
                                deneme_bitis_at: string | null;
                                /** Format: date-time */
                                donem_baslangic_at: string;
                                /** Format: date-time */
                                donem_bitis_at: string;
                                /** @enum {string} */
                                durum: "deneme" | "aktif" | "odeme_bekliyor" | "ek_sure" | "askida" | "iptal" | "sona_erdi";
                                /** Format: date-time */
                                ek_sure_bitis_at: string | null;
                                fiyat_kurus: number;
                                /** Format: uuid */
                                id: string;
                                /** Format: date-time */
                                iptal_istendi_at: string | null;
                                /** @enum {string} */
                                kaynak: "deneme" | "iyzico" | "apple" | "google" | "kurumsal";
                                otomatik_yenileme: boolean;
                                /** @enum {string} */
                                periyot: "aylik" | "yillik";
                                plan: {
                                    ad: string;
                                    aylik_fiyat_kurus: number;
                                    /** Format: uuid */
                                    id: string;
                                    kdv_orani: number;
                                    kod: string;
                                    /** @enum {string} */
                                    kurum_turu: "bireysel" | "ekip" | "kurum";
                                    limitler: {
                                        max_ogrenci: number;
                                        max_ogretmen: number;
                                        max_sube: number;
                                        medya_kota_bayt: number;
                                        sms_aylik: number;
                                        soru_aylik_ogrenci: number;
                                    };
                                    magaza_urun_kodlari: {
                                        apple?: string;
                                        google?: string;
                                    } | null;
                                    moduller: string[];
                                    surum: number;
                                    yillik_fiyat_kurus: number | null;
                                };
                            };
                            /** @enum {string} */
                            kurum_durumu: "aktif" | "askida" | "kapali";
                            platform_askida: boolean;
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
    "/platform/kurumlar/{kurum_id}/ac": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Platform askısını kaldır
         * @description Abonelik de kilitliyse (`askida`/`sona_erdi`) kurum `askida` kalır (`abonelik_kilitli=true`); abonelik askısını platform bu uçla açmaz (ek süre veya kurumsal aktivasyon kullanın).
         */
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
                            abonelik_kilitli: boolean;
                            /** @description false: kurum zaten istenen durumdaydı. */
                            degisti: boolean;
                            /** @enum {string} */
                            durum: "aktif" | "askida" | "kapali";
                            /** Format: uuid */
                            kurum_id: string;
                            platform_aski: {
                                /** @description Platform yöneticisi kurumu elle askıya aldı. */
                                askida: boolean;
                                /** Format: date-time */
                                askida_at: string | null;
                                neden: string | null;
                            };
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
    "/platform/kurumlar/{kurum_id}/askiya-al": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Kurumu platform olarak askıya al (abonelik askısından ayrı)
         * @description Kurum üyeleri kiracı uçlarında `403 kurum_askida` alır (taklit okuması hariç). `hesap.kurum.degisti.v1` yayımlanır. Abonelik/ödeme işi bu askıyı kaldıramaz; yalnız `/ac` kaldırır. Zaten askıdaysa değişiklik yapılmaz (`degisti=false`).
         */
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
                            abonelik_kilitli: boolean;
                            /** @description false: kurum zaten istenen durumdaydı. */
                            degisti: boolean;
                            /** @enum {string} */
                            durum: "aktif" | "askida" | "kapali";
                            /** Format: uuid */
                            kurum_id: string;
                            platform_aski: {
                                /** @description Platform yöneticisi kurumu elle askıya aldı. */
                                askida: boolean;
                                /** Format: date-time */
                                askida_at: string | null;
                                neden: string | null;
                            };
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
    "/platform/kurumlar/{kurum_id}/beta/{ozellik_kodu}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /** Kuruma özel beta özellik bayrağı aç/kapat; acik=null bayrağı siler */
        put: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    kurum_id: string;
                    ozellik_kodu: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        /** @description null: bayrağı sil. */
                        acik: boolean | null;
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
                            acik: boolean | null;
                            ozellik_kodu: string;
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
    "/platform/kurumlar/{kurum_id}/moduller/{modul_kodu}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /**
         * Kuruma özel modül aç/kapat (kurum düzeyi); acik=null varsayılana döner
         * @description `hesap.modul_ayari.degisti.v1` olayı aynı işlemde yayımlanır; diğer servislerin kopyaları güncellenir. Neden denetime yazılır.
         */
        put: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    kurum_id: string;
                    modul_kodu: "takvim" | "yoklama" | "geri_bildirim" | "kayitlar" | "finans" | "odev" | "haftalik_plan" | "deneme" | "soru_sor" | "oyunlastirma" | "duyuru";
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        /** @description null: kuruma özel ayarı sil (varsayılana dön). */
                        acik: boolean | null;
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
                            kurum_acik: boolean;
                            kurum_ayari_var: boolean;
                            /** @enum {string} */
                            modul_kodu: "takvim" | "yoklama" | "geri_bildirim" | "kayitlar" | "finans" | "odev" | "haftalik_plan" | "deneme" | "soru_sor" | "oyunlastirma" | "duyuru";
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
    "/platform/mesajlar": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Bakım/duyuru mesajları (son 50) */
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
                            mesajlar: {
                                /** Format: date-time */
                                baslangic_at: string;
                                baslik: string;
                                /** Format: date-time */
                                bitis_at: string;
                                /** Format: date-time */
                                created_at: string;
                                /** Format: uuid */
                                id: string;
                                /** Format: date-time */
                                iptal_at: string | null;
                                metin: string;
                                /** @enum {string} */
                                onem: "bilgi" | "uyari" | "kritik";
                            }[];
                        };
                    };
                };
            };
        };
        put?: never;
        /**
         * Tüm kullanıcılara görünen bakım/duyuru mesajı yayınla
         * @description Mesaj `GET /v1/platform-mesaji` ile kimliksiz okunur. Kişisel veri koymayın; metin denetime girmez (yalnız kimlik ve önem).
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
                        /**
                         * Format: date-time
                         * @description Boşsa şimdi.
                         */
                        baslangic_at?: string;
                        baslik: string;
                        /** Format: date-time */
                        bitis_at: string;
                        metin: string;
                        /**
                         * @default bilgi
                         * @enum {string}
                         */
                        onem?: "bilgi" | "uyari" | "kritik";
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
                            baslangic_at: string;
                            baslik: string;
                            /** Format: date-time */
                            bitis_at: string;
                            /** Format: date-time */
                            created_at: string;
                            /** Format: uuid */
                            id: string;
                            /** Format: date-time */
                            iptal_at: string | null;
                            metin: string;
                            /** @enum {string} */
                            onem: "bilgi" | "uyari" | "kritik";
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
    "/platform/mesajlar/{mesaj_id}/iptal": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Mesajı erkenden kaldır */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    mesaj_id: string;
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
                            iptal_edildi: true;
                            /** Format: uuid */
                            mesaj_id: string;
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
    "/platform/mufredat/kataloglar": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Katalog ve sürüm listesi (taslaklar dahil) ile değişiklik sayıları. */
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
                            kataloglar: {
                                en_yuksek_yayinlanmis: number | null;
                                /** @enum {string} */
                                katalog_kodu: "lgs" | "tyt" | "ayt" | "ydt" | "okul";
                                surumler: {
                                    aciklama: string | null;
                                    ad: string;
                                    degisiklik_sayisi: number;
                                    surum_no: number;
                                    taslak: boolean;
                                    /** Format: date-time */
                                    yayinlandi_at: string | null;
                                }[];
                                taslak_surum_no: number | null;
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
    "/platform/mufredat/kataloglar/{katalog_kodu}/surumler/{surum_no}/agac": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Sürümde geçerli konu ağacı (düz liste; taslakta yeni eklenenler `yeni: true`). */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    katalog_kodu: "lgs" | "tyt" | "ayt" | "ydt" | "okul";
                    surum_no: number;
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
                            katalog_kodu: "lgs" | "tyt" | "ayt" | "ydt" | "okul";
                            konular: {
                                ad: string;
                                brans_kodu: string;
                                gecerli_surum_baslangic: number;
                                gecerli_surum_bitis: number | null;
                                /** Format: uuid */
                                id: string;
                                kazanim_kodu: string | null;
                                /** @enum {string} */
                                seviye: "unite" | "konu" | "alt_konu";
                                sinif_seviyesi: number | null;
                                sira: number;
                                /** Format: uuid */
                                ust_id: string | null;
                                /** @description Bu sürümde eklendi (ya da eskinin yerine kopyalandı). */
                                yeni: boolean;
                                /** Format: uuid */
                                yerine_gecen_id: string | null;
                            }[];
                            surum: {
                                aciklama: string | null;
                                ad: string;
                                degisiklik_sayisi: number;
                                surum_no: number;
                                taslak: boolean;
                                /** Format: date-time */
                                yayinlandi_at: string | null;
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
    "/platform/mufredat/kataloglar/{katalog_kodu}/surumler/{surum_no}/fark": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Sürüm farkı: eklenen, yeniden adlandırılan, taşınan, birleşen, kaldırılan konular ve değişiklik notları. */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    katalog_kodu: "lgs" | "tyt" | "ayt" | "ydt" | "okul";
                    surum_no: number;
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
                            birlesen: {
                                ad_once: string | null;
                                ad_sonra: string | null;
                                ayrinti: {
                                    [key: string]: unknown;
                                };
                                /** Format: date-time */
                                created_at: string;
                                /** Format: uuid */
                                hedef_konu_id: string | null;
                                /** Format: uuid */
                                id: string;
                                /** Format: uuid */
                                konu_id: string;
                                not: string;
                                /** @enum {string} */
                                tur: "ekle" | "adlandir" | "tasi" | "birlestir" | "kaldir";
                            }[];
                            eklenen: {
                                ad_once: string | null;
                                ad_sonra: string | null;
                                ayrinti: {
                                    [key: string]: unknown;
                                };
                                /** Format: date-time */
                                created_at: string;
                                /** Format: uuid */
                                hedef_konu_id: string | null;
                                /** Format: uuid */
                                id: string;
                                /** Format: uuid */
                                konu_id: string;
                                not: string;
                                /** @enum {string} */
                                tur: "ekle" | "adlandir" | "tasi" | "birlestir" | "kaldir";
                            }[];
                            kaldirilan: {
                                ad_once: string | null;
                                ad_sonra: string | null;
                                ayrinti: {
                                    [key: string]: unknown;
                                };
                                /** Format: date-time */
                                created_at: string;
                                /** Format: uuid */
                                hedef_konu_id: string | null;
                                /** Format: uuid */
                                id: string;
                                /** Format: uuid */
                                konu_id: string;
                                not: string;
                                /** @enum {string} */
                                tur: "ekle" | "adlandir" | "tasi" | "birlestir" | "kaldir";
                            }[];
                            /** @enum {string} */
                            katalog_kodu: "lgs" | "tyt" | "ayt" | "ydt" | "okul";
                            ozet: {
                                birlesen: number;
                                eklenen: number;
                                kaldirilan: number;
                                tasinan: number;
                                yeniden_adlandirilan: number;
                            };
                            surum: {
                                aciklama: string | null;
                                ad: string;
                                degisiklik_sayisi: number;
                                surum_no: number;
                                taslak: boolean;
                                /** Format: date-time */
                                yayinlandi_at: string | null;
                            };
                            tasinan: {
                                ad_once: string | null;
                                ad_sonra: string | null;
                                ayrinti: {
                                    [key: string]: unknown;
                                };
                                /** Format: date-time */
                                created_at: string;
                                /** Format: uuid */
                                hedef_konu_id: string | null;
                                /** Format: uuid */
                                id: string;
                                /** Format: uuid */
                                konu_id: string;
                                not: string;
                                /** @enum {string} */
                                tur: "ekle" | "adlandir" | "tasi" | "birlestir" | "kaldir";
                            }[];
                            yeniden_adlandirilan: {
                                ad_once: string | null;
                                ad_sonra: string | null;
                                ayrinti: {
                                    [key: string]: unknown;
                                };
                                /** Format: date-time */
                                created_at: string;
                                /** Format: uuid */
                                hedef_konu_id: string | null;
                                /** Format: uuid */
                                id: string;
                                /** Format: uuid */
                                konu_id: string;
                                not: string;
                                /** @enum {string} */
                                tur: "ekle" | "adlandir" | "tasi" | "birlestir" | "kaldir";
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
    "/platform/mufredat/kataloglar/{katalog_kodu}/taslak": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Yeni taslak sürüm aç. Önceki yayınlı sürümün aktif konuları taslakta da geçerlidir (kimlikler sabit); katalogda tek taslak olur. */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    katalog_kodu: "lgs" | "tyt" | "ayt" | "ydt" | "okul";
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        aciklama?: string;
                        ad: string;
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
                            /** @enum {string} */
                            katalog_kodu: "lgs" | "tyt" | "ayt" | "ydt" | "okul";
                            surum: {
                                aciklama: string | null;
                                ad: string;
                                degisiklik_sayisi: number;
                                surum_no: number;
                                taslak: boolean;
                                /** Format: date-time */
                                yayinlandi_at: string | null;
                            };
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
    "/platform/mufredat/kataloglar/{katalog_kodu}/taslak/konular": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Taslağa konu ekle. */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    katalog_kodu: "lgs" | "tyt" | "ayt" | "ydt" | "okul";
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        ad: string;
                        brans_kodu: string;
                        kazanim_kodu?: string;
                        /** @description Değişiklik notu (zorunlu). */
                        not: string;
                        /** @enum {string} */
                        seviye: "unite" | "konu" | "alt_konu";
                        sinif_seviyesi?: number;
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
                            degisiklik: {
                                ad_once: string | null;
                                ad_sonra: string | null;
                                ayrinti: {
                                    [key: string]: unknown;
                                };
                                /** Format: date-time */
                                created_at: string;
                                /** Format: uuid */
                                hedef_konu_id: string | null;
                                /** Format: uuid */
                                id: string;
                                /** Format: uuid */
                                konu_id: string;
                                not: string;
                                /** @enum {string} */
                                tur: "ekle" | "adlandir" | "tasi" | "birlestir" | "kaldir";
                            };
                            /** @description İşlem sonrası konu (adlandırma/taşımada yeni kopya). */
                            konu: {
                                ad: string;
                                brans_kodu: string;
                                gecerli_surum_baslangic: number;
                                gecerli_surum_bitis: number | null;
                                /** Format: uuid */
                                id: string;
                                kazanim_kodu: string | null;
                                /** @enum {string} */
                                seviye: "unite" | "konu" | "alt_konu";
                                sinif_seviyesi: number | null;
                                sira: number;
                                /** Format: uuid */
                                ust_id: string | null;
                                /** @description Bu sürümde eklendi (ya da eskinin yerine kopyalandı). */
                                yeni: boolean;
                                /** Format: uuid */
                                yerine_gecen_id: string | null;
                            };
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
    "/platform/mufredat/kataloglar/{katalog_kodu}/taslak/konular/{id}/adlandir": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Konuyu yeniden adlandır. Yayınlı sürümlerin görüntüsü bozulmasın diye yeni kopya açılır, eskisinin `yerine_gecen_id`si bağlanır. */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                    katalog_kodu: "lgs" | "tyt" | "ayt" | "ydt" | "okul";
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        ad: string;
                        /** @description Değişiklik notu (zorunlu). */
                        not: string;
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
                            degisiklik: {
                                ad_once: string | null;
                                ad_sonra: string | null;
                                ayrinti: {
                                    [key: string]: unknown;
                                };
                                /** Format: date-time */
                                created_at: string;
                                /** Format: uuid */
                                hedef_konu_id: string | null;
                                /** Format: uuid */
                                id: string;
                                /** Format: uuid */
                                konu_id: string;
                                not: string;
                                /** @enum {string} */
                                tur: "ekle" | "adlandir" | "tasi" | "birlestir" | "kaldir";
                            };
                            /** @description İşlem sonrası konu (adlandırma/taşımada yeni kopya). */
                            konu: {
                                ad: string;
                                brans_kodu: string;
                                gecerli_surum_baslangic: number;
                                gecerli_surum_bitis: number | null;
                                /** Format: uuid */
                                id: string;
                                kazanim_kodu: string | null;
                                /** @enum {string} */
                                seviye: "unite" | "konu" | "alt_konu";
                                sinif_seviyesi: number | null;
                                sira: number;
                                /** Format: uuid */
                                ust_id: string | null;
                                /** @description Bu sürümde eklendi (ya da eskinin yerine kopyalandı). */
                                yeni: boolean;
                                /** Format: uuid */
                                yerine_gecen_id: string | null;
                            };
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
    "/platform/mufredat/kataloglar/{katalog_kodu}/taslak/konular/{id}/birlestir": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Konuyu (kaynak) hedef konuyla birleştir: alt konular hedefe bağlanır, kaynak kullanımdan kalkar ve `yerine_gecen_id` = hedef olur. Kurum verisi (ödev, plan, deneme, kurum alt konuları) kopmaz. */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                    katalog_kodu: "lgs" | "tyt" | "ayt" | "ydt" | "okul";
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        /**
                         * Format: uuid
                         * @description Kaynağın yerine geçecek konu (aynı branş ve seviye).
                         */
                        hedef_id: string;
                        /** @description Değişiklik notu (zorunlu). */
                        not: string;
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
                            degisiklik: {
                                ad_once: string | null;
                                ad_sonra: string | null;
                                ayrinti: {
                                    [key: string]: unknown;
                                };
                                /** Format: date-time */
                                created_at: string;
                                /** Format: uuid */
                                hedef_konu_id: string | null;
                                /** Format: uuid */
                                id: string;
                                /** Format: uuid */
                                konu_id: string;
                                not: string;
                                /** @enum {string} */
                                tur: "ekle" | "adlandir" | "tasi" | "birlestir" | "kaldir";
                            };
                            /** @description İşlem sonrası konu (adlandırma/taşımada yeni kopya). */
                            konu: {
                                ad: string;
                                brans_kodu: string;
                                gecerli_surum_baslangic: number;
                                gecerli_surum_bitis: number | null;
                                /** Format: uuid */
                                id: string;
                                kazanim_kodu: string | null;
                                /** @enum {string} */
                                seviye: "unite" | "konu" | "alt_konu";
                                sinif_seviyesi: number | null;
                                sira: number;
                                /** Format: uuid */
                                ust_id: string | null;
                                /** @description Bu sürümde eklendi (ya da eskinin yerine kopyalandı). */
                                yeni: boolean;
                                /** Format: uuid */
                                yerine_gecen_id: string | null;
                            };
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
    "/platform/mufredat/kataloglar/{katalog_kodu}/taslak/konular/{id}/kaldir": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Konuyu ve alt ağacını kullanımdan kaldır (silme yok; geçerlilik bitişi taslak sürümde başlar). */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                    katalog_kodu: "lgs" | "tyt" | "ayt" | "ydt" | "okul";
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        /** @description Değişiklik notu (zorunlu). */
                        not: string;
                        /**
                         * Format: uuid
                         * @description Önerilen yeni konu (rozet için).
                         */
                        yerine_gecen_id?: string;
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
                            degisiklik: {
                                ad_once: string | null;
                                ad_sonra: string | null;
                                ayrinti: {
                                    [key: string]: unknown;
                                };
                                /** Format: date-time */
                                created_at: string;
                                /** Format: uuid */
                                hedef_konu_id: string | null;
                                /** Format: uuid */
                                id: string;
                                /** Format: uuid */
                                konu_id: string;
                                not: string;
                                /** @enum {string} */
                                tur: "ekle" | "adlandir" | "tasi" | "birlestir" | "kaldir";
                            };
                            /** @description İşlem sonrası konu (adlandırma/taşımada yeni kopya). */
                            konu: {
                                ad: string;
                                brans_kodu: string;
                                gecerli_surum_baslangic: number;
                                gecerli_surum_bitis: number | null;
                                /** Format: uuid */
                                id: string;
                                kazanim_kodu: string | null;
                                /** @enum {string} */
                                seviye: "unite" | "konu" | "alt_konu";
                                sinif_seviyesi: number | null;
                                sira: number;
                                /** Format: uuid */
                                ust_id: string | null;
                                /** @description Bu sürümde eklendi (ya da eskinin yerine kopyalandı). */
                                yeni: boolean;
                                /** Format: uuid */
                                yerine_gecen_id: string | null;
                            };
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
    "/platform/mufredat/kataloglar/{katalog_kodu}/taslak/konular/{id}/tasi": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Konuyu taşı (üst konu ve/veya sıra). Üst değişirse alt ağacıyla birlikte kopyalanır; yalnız sıra değişimi yerinde yapılır. */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                    katalog_kodu: "lgs" | "tyt" | "ayt" | "ydt" | "okul";
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        /** @description Değişiklik notu (zorunlu). */
                        not: string;
                        sira?: number;
                        /**
                         * Format: uuid
                         * @description Yeni üst konu (ünite için null).
                         */
                        ust_id: string | null;
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
                            degisiklik: {
                                ad_once: string | null;
                                ad_sonra: string | null;
                                ayrinti: {
                                    [key: string]: unknown;
                                };
                                /** Format: date-time */
                                created_at: string;
                                /** Format: uuid */
                                hedef_konu_id: string | null;
                                /** Format: uuid */
                                id: string;
                                /** Format: uuid */
                                konu_id: string;
                                not: string;
                                /** @enum {string} */
                                tur: "ekle" | "adlandir" | "tasi" | "birlestir" | "kaldir";
                            };
                            /** @description İşlem sonrası konu (adlandırma/taşımada yeni kopya). */
                            konu: {
                                ad: string;
                                brans_kodu: string;
                                gecerli_surum_baslangic: number;
                                gecerli_surum_bitis: number | null;
                                /** Format: uuid */
                                id: string;
                                kazanim_kodu: string | null;
                                /** @enum {string} */
                                seviye: "unite" | "konu" | "alt_konu";
                                sinif_seviyesi: number | null;
                                sira: number;
                                /** Format: uuid */
                                ust_id: string | null;
                                /** @description Bu sürümde eklendi (ya da eskinin yerine kopyalandı). */
                                yeni: boolean;
                                /** Format: uuid */
                                yerine_gecen_id: string | null;
                            };
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
    "/platform/mufredat/kataloglar/{katalog_kodu}/taslak/yayinla": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Taslağı yayınla: sürüm değişmez olur, kurum alt konuları yeni üst konulara bağlanır, her aktif kuruma `ogrenme.mufredat.yayinlandi.v1` olayı (outbox) yazılır. */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    katalog_kodu: "lgs" | "tyt" | "ayt" | "ydt" | "okul";
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        not?: string;
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
                            bildirilen_kurum_sayisi: number;
                            /** @enum {string} */
                            katalog_kodu: "lgs" | "tyt" | "ayt" | "ydt" | "okul";
                            ozet: {
                                birlesen: number;
                                eklenen: number;
                                kaldirilan: number;
                                tasinan: number;
                                yeniden_adlandirilan: number;
                            };
                            surum: {
                                aciklama: string | null;
                                ad: string;
                                degisiklik_sayisi: number;
                                surum_no: number;
                                taslak: boolean;
                                /** Format: date-time */
                                yayinlandi_at: string | null;
                            };
                            /** @description Kurum alt konularından yeni üst konuya bağlananların sayısı. */
                            yeniden_baglanan_kurum_konusu: number;
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
    "/platform/sistem-sagligi": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Sistem sağlığı: outbox birikimi, kuyruk derinlikleri, son 1 saat 5xx oranı
         * @description Yalnız api servisinin kendi verisi. HTTP sayacı süreç içidir (bu api kopyasının gördüğü istekler). pg-boss henüz kurulu değilse `pgboss_kurulu: false` döner.
         */
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
                            http: {
                                hata_5xx: number;
                                istek: number;
                                /** @enum {string} */
                                kaynak: "surec_ici";
                                /** @description 0..1; istek yoksa 0. */
                                oran_5xx: number;
                                pencere_dk: number;
                            };
                            kuyruklar: {
                                basarisiz: number;
                                derinlikler: {
                                    durum: string;
                                    kuyruk: string;
                                    sayi: number;
                                }[];
                                pgboss_kurulu: boolean;
                            };
                            outbox: {
                                /** @description Henüz yayımlanmamış olay sayısı. */
                                bekleyen: number;
                                en_eski_yas_sn: number | null;
                                /** @description En az bir kez denenip yayımlanamayan olay sayısı. */
                                hatali: number;
                            };
                            /** Format: date-time */
                            uretildi_at: string;
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
    "/platform/taklit": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Kullanıcıyı salt okunur taklit et (15 dk, yenilenemez) */
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
                        hedef_kullanici_id: string;
                        /** Format: uuid */
                        kurum_id: string;
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
                            access_token: string;
                            /** Format: date-time */
                            bitis_at: string;
                            expires_in: number;
                            /** Format: uuid */
                            hedef_kullanici_id: string;
                            /** Format: uuid */
                            kurum_id: string;
                            /** @enum {string} */
                            rol: "sahip" | "yonetici" | "ogretmen" | "ogrenci" | "veli";
                            /** Format: uuid */
                            taklit_id: string;
                            /** @enum {string} */
                            token_type: "Bearer";
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
    "/platform/taklit/{taklit_id}/sonlandir": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Taklidi erken sonlandır (belirteç hemen 401 olur)
         * @description Taklidi başlatan platform kullanıcısı veya platform yöneticisi çağırabilir. Zaten bitmiş taklitte de 200 döner.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    taklit_id: string;
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
                            /** Format: uuid */
                            taklit_id: string;
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
    "/v1/abonelik/kurumlar/{kurum_id}/abonelik": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Kurumun aboneligi, gecerli limitleri ve kullanimi (ogrenci/ogretmen sayisi). Etkin abonelik yoksa ucretsiz katman. */
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
                            abonelik: {
                                /** @enum {string|null} */
                                bekleyen_periyot: "aylik" | "yillik" | null;
                                bekleyen_plan_kodu: string | null;
                                /** Format: date-time */
                                deneme_bitis_at: string | null;
                                /** Format: date-time */
                                donem_baslangic_at: string;
                                /** Format: date-time */
                                donem_bitis_at: string;
                                /** @enum {string} */
                                durum: "deneme" | "aktif" | "odeme_bekliyor" | "ek_sure" | "askida" | "iptal" | "sona_erdi";
                                /** Format: date-time */
                                ek_sure_bitis_at: string | null;
                                fiyat_kurus: number;
                                /** Format: uuid */
                                id: string;
                                /** Format: date-time */
                                iptal_istendi_at: string | null;
                                /** @enum {string} */
                                kaynak: "deneme" | "iyzico" | "apple" | "google" | "kurumsal";
                                otomatik_yenileme: boolean;
                                /** @enum {string} */
                                periyot: "aylik" | "yillik";
                                plan: {
                                    ad: string;
                                    aylik_fiyat_kurus: number;
                                    /** Format: uuid */
                                    id: string;
                                    kdv_orani: number;
                                    kod: string;
                                    /** @enum {string} */
                                    kurum_turu: "bireysel" | "ekip" | "kurum";
                                    limitler: {
                                        max_ogrenci: number;
                                        max_ogretmen: number;
                                        max_sube: number;
                                        medya_kota_bayt: number;
                                        sms_aylik: number;
                                        soru_aylik_ogrenci: number;
                                    };
                                    magaza_urun_kodlari: {
                                        apple?: string;
                                        google?: string;
                                    } | null;
                                    moduller: string[];
                                    surum: number;
                                    yillik_fiyat_kurus: number | null;
                                };
                            } | null;
                            kullanim: {
                                ogrenci: {
                                    mevcut: number;
                                    ust_sinir: number | null;
                                };
                                ogretmen: {
                                    mevcut: number;
                                    ust_sinir: number | null;
                                };
                            };
                            limitler: {
                                max_ogrenci: number;
                                max_ogretmen: number;
                                max_sube: number;
                                medya_kota_bayt: number;
                                sms_aylik: number;
                                soru_aylik_ogrenci: number;
                            };
                            ucretsiz: boolean;
                            yazma_kilitli: boolean;
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
    "/v1/abonelik/kurumlar/{kurum_id}/abonelik/iptal": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Otomatik yenilemeyi iptal et: abonelik donem sonunda sona erer, o zamana kadar tam erisim surer. Tekrar cagri etkisizdir. Magaza aboneligi 409 magaza_uzerinden_yonetilir; etkin abonelik yoksa 409 etkin_abonelik_yok. */
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
                            abonelik: {
                                /** @enum {string|null} */
                                bekleyen_periyot: "aylik" | "yillik" | null;
                                bekleyen_plan_kodu: string | null;
                                /** Format: date-time */
                                deneme_bitis_at: string | null;
                                /** Format: date-time */
                                donem_baslangic_at: string;
                                /** Format: date-time */
                                donem_bitis_at: string;
                                /** @enum {string} */
                                durum: "deneme" | "aktif" | "odeme_bekliyor" | "ek_sure" | "askida" | "iptal" | "sona_erdi";
                                /** Format: date-time */
                                ek_sure_bitis_at: string | null;
                                fiyat_kurus: number;
                                /** Format: uuid */
                                id: string;
                                /** Format: date-time */
                                iptal_istendi_at: string | null;
                                /** @enum {string} */
                                kaynak: "deneme" | "iyzico" | "apple" | "google" | "kurumsal";
                                otomatik_yenileme: boolean;
                                /** @enum {string} */
                                periyot: "aylik" | "yillik";
                                plan: {
                                    ad: string;
                                    aylik_fiyat_kurus: number;
                                    /** Format: uuid */
                                    id: string;
                                    kdv_orani: number;
                                    kod: string;
                                    /** @enum {string} */
                                    kurum_turu: "bireysel" | "ekip" | "kurum";
                                    limitler: {
                                        max_ogrenci: number;
                                        max_ogretmen: number;
                                        max_sube: number;
                                        medya_kota_bayt: number;
                                        sms_aylik: number;
                                        soru_aylik_ogrenci: number;
                                    };
                                    magaza_urun_kodlari: {
                                        apple?: string;
                                        google?: string;
                                    } | null;
                                    moduller: string[];
                                    surum: number;
                                    yillik_fiyat_kurus: number | null;
                                };
                            };
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
    "/v1/abonelik/kurumlar/{kurum_id}/abonelik/plan-degistir": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Plan degistirme istegi. Deneme sirasinda plan hemen degisir; ucretli abonelikte hedef plan donem sonunda uygulanir (odeme baslatma ayri). Hedef planin limiti mevcut kullanimin altindaysa `limit_asimlari` doner; veri silinmez. Kurum turune uymayan plan 404 plan_bulunamadi; etkin abonelik yoksa 409 etkin_abonelik_yok. */
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
                        /** @enum {string} */
                        periyot?: "aylik" | "yillik";
                        plan_kodu: string;
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
                            abonelik: {
                                /** @enum {string|null} */
                                bekleyen_periyot: "aylik" | "yillik" | null;
                                bekleyen_plan_kodu: string | null;
                                /** Format: date-time */
                                deneme_bitis_at: string | null;
                                /** Format: date-time */
                                donem_baslangic_at: string;
                                /** Format: date-time */
                                donem_bitis_at: string;
                                /** @enum {string} */
                                durum: "deneme" | "aktif" | "odeme_bekliyor" | "ek_sure" | "askida" | "iptal" | "sona_erdi";
                                /** Format: date-time */
                                ek_sure_bitis_at: string | null;
                                fiyat_kurus: number;
                                /** Format: uuid */
                                id: string;
                                /** Format: date-time */
                                iptal_istendi_at: string | null;
                                /** @enum {string} */
                                kaynak: "deneme" | "iyzico" | "apple" | "google" | "kurumsal";
                                otomatik_yenileme: boolean;
                                /** @enum {string} */
                                periyot: "aylik" | "yillik";
                                plan: {
                                    ad: string;
                                    aylik_fiyat_kurus: number;
                                    /** Format: uuid */
                                    id: string;
                                    kdv_orani: number;
                                    kod: string;
                                    /** @enum {string} */
                                    kurum_turu: "bireysel" | "ekip" | "kurum";
                                    limitler: {
                                        max_ogrenci: number;
                                        max_ogretmen: number;
                                        max_sube: number;
                                        medya_kota_bayt: number;
                                        sms_aylik: number;
                                        soru_aylik_ogrenci: number;
                                    };
                                    magaza_urun_kodlari: {
                                        apple?: string;
                                        google?: string;
                                    } | null;
                                    moduller: string[];
                                    surum: number;
                                    yillik_fiyat_kurus: number | null;
                                };
                            };
                            limit_asimlari: {
                                /** @enum {string} */
                                limit: "max_ogrenci" | "max_ogretmen";
                                mevcut: number;
                                ust_sinir: number;
                            }[];
                            /** @enum {string} */
                            uygulama: "hemen" | "donem_sonu";
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
    "/v1/abonelik/kurumlar/{kurum_id}/fatura-bilgileri": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Fatura alici bilgileri (yoksa `fatura_bilgisi: null`). */
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
                            fatura_bilgisi: {
                                adres: {
                                    il: string;
                                    ilce: string;
                                    posta_kodu?: string;
                                    satir: string;
                                };
                                e_fatura_mukellefi: boolean;
                                /** Format: email */
                                eposta: string;
                                surum: number;
                                unvan: string;
                                vergi_dairesi: string | null;
                                vergi_no: string;
                            } | null;
                        };
                    };
                };
            };
        };
        /** Fatura alici bilgilerini yaz (kurum basina tek kayit; yoksa olusturur). Vergi no 10 haneli VKN veya 11 haneli TCKN. */
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
                        adres: {
                            il: string;
                            ilce: string;
                            posta_kodu?: string;
                            satir: string;
                        };
                        /** @default false */
                        e_fatura_mukellefi?: boolean;
                        /** Format: email */
                        eposta: string;
                        unvan: string;
                        /** @default null */
                        vergi_dairesi?: string | null;
                        vergi_no: string;
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
                            fatura_bilgisi: {
                                adres: {
                                    il: string;
                                    ilce: string;
                                    posta_kodu?: string;
                                    satir: string;
                                };
                                e_fatura_mukellefi: boolean;
                                /** Format: email */
                                eposta: string;
                                surum: number;
                                unvan: string;
                                vergi_dairesi: string | null;
                                vergi_no: string;
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
    "/v1/abonelik/kurumlar/{kurum_id}/faturalar": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** e-Arsiv fatura gecmisi (meta). PDF dosyasi hazir degilse `pdf_dosya_id` null doner; en yeni ustte. */
        get: {
            parameters: {
                query?: {
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
                            faturalar: {
                                /** @enum {string} */
                                durum: "bekliyor" | "kesildi" | "hata" | "iptal";
                                fatura_no: string | null;
                                /** Format: uuid */
                                id: string;
                                kdv_kurus: number;
                                kdv_orani: number;
                                /** Format: date-time */
                                kesim_at: string | null;
                                matrah_kurus: number;
                                /** Format: uuid */
                                odeme_id: string;
                                /** Format: uuid */
                                pdf_dosya_id: string | null;
                                toplam_kurus: number;
                                /** @enum {string} */
                                tur: "e_arsiv" | "iade";
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
    "/v1/abonelik/kurumlar/{kurum_id}/odeme/baslat": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Web odemesi (iyzico yinelenen abonelik) baslat: saglayicinin odeme sayfasi adresi ya da gomulecek form doner. Fatura bilgisi yoksa 422 fatura_bilgisi_gerekli; baska kanalda (magaza, kurumsal) etkin ucretli abonelik varsa 409 abonelik_baska_kanalda; iyzico aboneligi zaten aktifse 409 abonelik_zaten_aktif; kanal yapilandirilmamissa 503 odeme_kanali_kapali. Deneme sirasinda ucretliye gecis cift abonelik sayilmaz. */
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
                         * @default aylik
                         * @enum {string}
                         */
                        periyot?: "aylik" | "yillik";
                        plan_kodu: string;
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
                            form_icerigi: string | null;
                            /** @enum {string} */
                            kaynak: "iyzico";
                            kdv_kurus: number;
                            /** Format: uuid */
                            oturum_id: string;
                            tutar_kurus: number;
                            yonlendirme_url: string | null;
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
    "/v1/abonelik/kurumlar/{kurum_id}/odemeler": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Abonelik odeme gecmisi (basarili, basarisiz, iade); en yeni ustte. */
        get: {
            parameters: {
                query?: {
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
                            odemeler: {
                                /** Format: uuid */
                                abonelik_id: string;
                                /** Format: date-time */
                                donem_baslangic_at: string;
                                /** Format: date-time */
                                donem_bitis_at: string;
                                /** @enum {string} */
                                durum: "basarili" | "basarisiz" | "iade";
                                hata_kodu: string | null;
                                /** Format: uuid */
                                id: string;
                                /** @enum {string} */
                                kaynak: "deneme" | "iyzico" | "apple" | "google" | "kurumsal";
                                kdv_kurus: number;
                                /** Format: date-time */
                                odeme_at: string;
                                /** Format: uuid */
                                ters_cevrilen_id: string | null;
                                tutar_kurus: number;
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
    "/v1/abonelik/kurumlar/{kurum_id}/planlar": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Kurum turune uygun aktif planlari listele (plan yukseltme/dusurme secenekleri). */
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
                            planlar: {
                                ad: string;
                                aylik_fiyat_kurus: number;
                                /** Format: uuid */
                                id: string;
                                kdv_orani: number;
                                kod: string;
                                /** @enum {string} */
                                kurum_turu: "bireysel" | "ekip" | "kurum";
                                limitler: {
                                    max_ogrenci: number;
                                    max_ogretmen: number;
                                    max_sube: number;
                                    medya_kota_bayt: number;
                                    sms_aylik: number;
                                    soru_aylik_ogrenci: number;
                                };
                                magaza_urun_kodlari: {
                                    apple?: string;
                                    google?: string;
                                } | null;
                                moduller: string[];
                                surum: number;
                                yillik_fiyat_kurus: number | null;
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
    "/v1/abonelik/odeme/iyzico/donus": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** iyzico odeme sayfasi donusu (callback; form govdesinde `token`). Sonucu isler ve web uygulamasina 303 ile yonlendirir (`/abonelik?odeme=basarili|basarisiz|bekliyor|hata`). */
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
                    content?: never;
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/abonelik/webhook/iyzico": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** iyzico abonelik webhook (kimliksiz; imza basligi dogrulanir). Ham govde saklanir, hemen 200 doner, isleme arka planda yapilir. Imza gecersizse 401; kanal kapaliysa 503. */
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
                            /** @enum {string} */
                            durum: "alindi" | "tekrar" | "yoksayildi";
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
    "/v1/abonelik/webhook/revenuecat": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** RevenueCat (App Store / Google Play) webhook (kimliksiz; Authorization basligi paylasilan sirla dogrulanir). `app_user_id` kurum kimligidir. Ham govde saklanir, hemen 200 doner. */
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
                            /** @enum {string} */
                            durum: "alindi" | "tekrar" | "yoksayildi";
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
    "/v1/ders/kurumlar/{kurum_id}/dersler/{id}/geri-bildirim": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Ogrencinin bu derse verdigi geri bildirim (yoksa `geri_bildirim: null`). */
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
                            geri_bildirim: {
                                /** Format: date-time */
                                created_at: string;
                                /** @enum {string} */
                                deger: "anladim" | "kismen" | "anlamadim";
                                /** Format: uuid */
                                ders_id: string;
                                /** Format: uuid */
                                id: string;
                                /** Format: uuid */
                                konu_id: string | null;
                                not: string | null;
                                /** Format: uuid */
                                ogrenci_id: string;
                                /** Format: date-time */
                                updated_at: string;
                            } | null;
                        };
                    };
                };
            };
        };
        /** Ders sonu geri bildirimi ver/guncelle (ogrenci). Kosullar: `geri_bildirim` modulu (grup duzeyi dahil) acik, ders bitmis ve iptal degil, ogrencinin yoklamasi `geldi`/`gec`. Ikinci gonderim gunceller (dersin bitisinden sonra 24 saat icinde; sonra 422). `ders.geri_bildirim.verildi.v1` yalniz ilk verista yayimlanir. */
        put: {
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
                        /** @enum {string} */
                        deger: "anladim" | "kismen" | "anlamadim";
                        /**
                         * Format: uuid
                         * @description Zorlanılan müfredat konusu (isteğe bağlı).
                         */
                        konu_id?: string | null;
                        not?: string | null;
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
                            geri_bildirim: {
                                /** Format: date-time */
                                created_at: string;
                                /** @enum {string} */
                                deger: "anladim" | "kismen" | "anlamadim";
                                /** Format: uuid */
                                ders_id: string;
                                /** Format: uuid */
                                id: string;
                                /** Format: uuid */
                                konu_id: string | null;
                                not: string | null;
                                /** Format: uuid */
                                ogrenci_id: string;
                                /** Format: date-time */
                                updated_at: string;
                            };
                            /** @description `true`: ilk veriş (olay yayımlandı). `false`: güncelleme. */
                            yeni: boolean;
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
    "/v1/ders/kurumlar/{kurum_id}/dersler/{id}/geri-bildirimler": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Dersin geri bildirimleri (ders karti): ogrenci, deger, konu, not ve sayilar. Ogretmen yalniz kendi dersini/atandigi grubu, sahip ve yonetici kapsamindakileri gorur. */
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
                            /** Format: uuid */
                            ders_id: string;
                            geri_bildirimler: {
                                /** Format: date-time */
                                created_at: string;
                                /** @enum {string} */
                                deger: "anladim" | "kismen" | "anlamadim";
                                /** Format: uuid */
                                ders_id: string;
                                gorunen_ad: string | null;
                                /** Format: uuid */
                                id: string;
                                /** Format: uuid */
                                konu_id: string | null;
                                not: string | null;
                                /** Format: uuid */
                                ogrenci_id: string;
                                /** Format: date-time */
                                updated_at: string;
                            }[];
                            katilimci_sayisi: number;
                            ozet: {
                                anladim: number;
                                anlamadim: number;
                                kismen: number;
                                toplam: number;
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
    "/v1/ders/kurumlar/{kurum_id}/dersler/{id}/kaynaklar": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Derse bir ya da birden cok kayit/materyal baglantisi ekle (tek istek, tek islem). Saglayici alan adindan taninir; yalniz https; Zoom parolasi AES-256-GCM ile sifrelenir. Gorunurluk ogrencilere aciksa `ders.kaynak.eklendi.v1` yayimlanir. Ogretmen yalniz kendi dersine ekler; iptal derse 409. */
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
                         * @default grup
                         * @enum {string}
                         */
                        gorunurluk?: "ogretmen" | "grup" | "secili_ogrenciler";
                        /** @description Bir ya da birden çok bağlantı (tek istek, tek işlem). */
                        linkler: {
                            baslik: string;
                            /**
                             * Format: date-time
                             * @description Son erişim tarihi (gelecekte olmalı).
                             */
                            gecerlilik_bitis_at?: string | null;
                            /**
                             * Format: uuid
                             * @description Müfredat konusu.
                             */
                            konu_id?: string | null;
                            /** @description Zoom kayıt parolası; şifreli saklanır. */
                            parola?: string | null;
                            /** @description `https://` ile başlamalı; sağlayıcı alan adından sunucuda tanınır. */
                            url: string;
                        }[];
                        /** @description `secili_ogrenciler` için zorunlu; dersin katılımcısı / grubun etkin üyesi olmalı. */
                        ogrenci_idleri?: string[];
                        /**
                         * @default kayit
                         * @enum {string}
                         */
                        tur?: "kayit" | "materyal";
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
                            kaynaklar: {
                                acik_sorun_sayisi: number;
                                baslik: string;
                                brans_kodu: string | null;
                                /** Format: date-time */
                                created_at: string;
                                /** Format: date-time */
                                ders_baslangic_at: string | null;
                                /** Format: uuid */
                                ders_id: string | null;
                                /** @enum {string} */
                                durum: "aktif" | "suresi_doldu" | "bozuk" | "gizli";
                                /** Format: uuid */
                                ekleyen_id: string;
                                /** Format: date-time */
                                gecerlilik_bitis_at: string | null;
                                /** @enum {string} */
                                gorunurluk: "ogretmen" | "grup" | "secili_ogrenciler";
                                /** Format: uuid */
                                grup_id: string;
                                /** Format: uuid */
                                id: string;
                                izleyen_sayisi: number;
                                /** Format: uuid */
                                konu_id: string | null;
                                /** @description `secili_ogrenciler` alıcıları (yalnız personel); aksi `null`. */
                                ogrenci_idleri: string[] | null;
                                /**
                                 * Format: uuid
                                 * @description Derse bağlıysa dersin öğretmeni, değilse ekleyen.
                                 */
                                ogretmen_id: string | null;
                                /** @description Yalnız görünürlük kurallarını sağlayan öğrenciye ve yetkili öğretmene düz metin. */
                                parola: string | null;
                                parola_var: boolean;
                                /** @enum {string} */
                                saglayici: "zoom" | "drive" | "youtube" | "onedrive" | "diger";
                                /** @enum {string} */
                                tur: "kayit" | "materyal";
                                /** Format: date-time */
                                updated_at: string;
                                url: string;
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
    "/v1/ders/kurumlar/{kurum_id}/geri-bildirim/bekleyen": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Bekleyen geri bildirimler (ogrenci): son 24 saatte biten, iptal olmayan, ogrencinin `geldi`/`gec` oldugu ve henuz geri bildirim vermedigi dersler (grubunda modul kapali olanlar haric). Istemciler Bugun ekraninda kart olarak gosterir; push henuz yok. */
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
                            dersler: {
                                /** Format: date-time */
                                baslangic_at: string;
                                baslik: string | null;
                                /** Format: date-time */
                                bitis_at: string;
                                brans_kodu: string;
                                /** Format: uuid */
                                ders_id: string;
                                /** Format: uuid */
                                grup_id: string;
                                /** Format: uuid */
                                konu_id: string | null;
                                /** Format: uuid */
                                ogretmen_id: string;
                                /**
                                 * Format: date-time
                                 * @description Bu zamandan sonra geri bildirim güncellenemez (bitiş + 24 saat).
                                 */
                                son_verme_at: string;
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
    "/v1/ders/kurumlar/{kurum_id}/geri-bildirim/ozet": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Tarih araliginda (ders bitis gunu, kurum yerel saati) geri bildirim oranlari: toplam ve ogretmen/brans kirilimi. Yalniz sahip/yonetici (kapsamindaki dersler). */
        get: {
            parameters: {
                query: {
                    /** @description Kurum yerel tarihi (dahil). */
                    baslangic: string;
                    /** @description Kurum yerel tarihi (dahil). */
                    bitis: string;
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
                            /** Format: date */
                            baslangic: string;
                            /** Format: date */
                            bitis: string;
                            branslar: {
                                anladim: number;
                                anlamadim: number;
                                brans_kodu: string;
                                kismen: number;
                                /** @description Toplama bölünmüş oranlar (0-1, 4 hane). Toplam 0 ise hepsi 0. */
                                oran: {
                                    anladim: number;
                                    anlamadim: number;
                                    kismen: number;
                                };
                                toplam: number;
                            }[];
                            ogretmenler: {
                                anladim: number;
                                anlamadim: number;
                                gorunen_ad: string | null;
                                kismen: number;
                                /** Format: uuid */
                                ogretmen_id: string;
                                /** @description Toplama bölünmüş oranlar (0-1, 4 hane). Toplam 0 ise hepsi 0. */
                                oran: {
                                    anladim: number;
                                    anlamadim: number;
                                    kismen: number;
                                };
                                toplam: number;
                            }[];
                            toplam: {
                                anladim: number;
                                anlamadim: number;
                                kismen: number;
                                /** @description Toplama bölünmüş oranlar (0-1, 4 hane). Toplam 0 ise hepsi 0. */
                                oran: {
                                    anladim: number;
                                    anlamadim: number;
                                    kismen: number;
                                };
                                toplam: number;
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
    "/v1/ders/kurumlar/{kurum_id}/gruplar/{grup_id}/materyaller": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Gruba dersten bagimsiz materyal baglantisi ekle (PDF, Drive klasoru, konu anlatim videosu). Ogretmen yalniz atandigi gruba ekler (kapsam disi 404). */
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
                        /**
                         * @default grup
                         * @enum {string}
                         */
                        gorunurluk?: "ogretmen" | "grup" | "secili_ogrenciler";
                        /** @description Bir ya da birden çok bağlantı (tek istek, tek işlem). */
                        linkler: {
                            baslik: string;
                            /**
                             * Format: date-time
                             * @description Son erişim tarihi (gelecekte olmalı).
                             */
                            gecerlilik_bitis_at?: string | null;
                            /**
                             * Format: uuid
                             * @description Müfredat konusu.
                             */
                            konu_id?: string | null;
                            /** @description Zoom kayıt parolası; şifreli saklanır. */
                            parola?: string | null;
                            /** @description `https://` ile başlamalı; sağlayıcı alan adından sunucuda tanınır. */
                            url: string;
                        }[];
                        /** @description `secili_ogrenciler` için zorunlu; dersin katılımcısı / grubun etkin üyesi olmalı. */
                        ogrenci_idleri?: string[];
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
                            kaynaklar: {
                                acik_sorun_sayisi: number;
                                baslik: string;
                                brans_kodu: string | null;
                                /** Format: date-time */
                                created_at: string;
                                /** Format: date-time */
                                ders_baslangic_at: string | null;
                                /** Format: uuid */
                                ders_id: string | null;
                                /** @enum {string} */
                                durum: "aktif" | "suresi_doldu" | "bozuk" | "gizli";
                                /** Format: uuid */
                                ekleyen_id: string;
                                /** Format: date-time */
                                gecerlilik_bitis_at: string | null;
                                /** @enum {string} */
                                gorunurluk: "ogretmen" | "grup" | "secili_ogrenciler";
                                /** Format: uuid */
                                grup_id: string;
                                /** Format: uuid */
                                id: string;
                                izleyen_sayisi: number;
                                /** Format: uuid */
                                konu_id: string | null;
                                /** @description `secili_ogrenciler` alıcıları (yalnız personel); aksi `null`. */
                                ogrenci_idleri: string[] | null;
                                /**
                                 * Format: uuid
                                 * @description Derse bağlıysa dersin öğretmeni, değilse ekleyen.
                                 */
                                ogretmen_id: string | null;
                                /** @description Yalnız görünürlük kurallarını sağlayan öğrenciye ve yetkili öğretmene düz metin. */
                                parola: string | null;
                                parola_var: boolean;
                                /** @enum {string} */
                                saglayici: "zoom" | "drive" | "youtube" | "onedrive" | "diger";
                                /** @enum {string} */
                                tur: "kayit" | "materyal";
                                /** Format: date-time */
                                updated_at: string;
                                url: string;
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
    "/v1/ders/kurumlar/{kurum_id}/kayitlarim": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** "Kayitlarim" (ogrenci): gorunurluk kurallarina uyan kayit ve materyaller. Izlenmemisler once, sonra yeni->eski; imlecli sayfalama. Suzgecler: tur, grup, brans, ders, konu, tarih araligi (ders tarihi; materyalde eklenme tarihi). Parola listede donmez (tekil okumada doner). */
        get: {
            parameters: {
                query?: {
                    /** @description Ders tarihi (yoksa eklenme tarihi), kurum yerel günü, dahil. */
                    baslangic?: string;
                    bitis?: string;
                    brans_kodu?: string;
                    ders_id?: string;
                    grup_id?: string;
                    imlec?: string;
                    konu_id?: string;
                    limit?: number;
                    tur?: "kayit" | "materyal";
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
                            kayitlar: {
                                baslik: string;
                                bozuk: boolean;
                                brans_kodu: string | null;
                                /** Format: date-time */
                                created_at: string;
                                /** Format: date-time */
                                ders_baslangic_at: string | null;
                                /** Format: uuid */
                                ders_id: string | null;
                                /** @enum {string} */
                                durum: "aktif" | "suresi_doldu" | "bozuk" | "gizli";
                                /** Format: uuid */
                                ekleyen_id: string;
                                /** Format: date-time */
                                gecerlilik_bitis_at: string | null;
                                /** @enum {string} */
                                gorunurluk: "ogretmen" | "grup" | "secili_ogrenciler";
                                /** Format: uuid */
                                grup_id: string;
                                /** Format: uuid */
                                id: string;
                                /** Format: date-time */
                                izledi_at: string | null;
                                izlendi: boolean;
                                /** Format: uuid */
                                konu_id: string | null;
                                /**
                                 * Format: uuid
                                 * @description Derse bağlıysa dersin öğretmeni, değilse ekleyen.
                                 */
                                ogretmen_id: string | null;
                                parola_var: boolean;
                                /** @enum {string} */
                                saglayici: "zoom" | "drive" | "youtube" | "onedrive" | "diger";
                                /** @enum {string} */
                                tur: "kayit" | "materyal";
                                /** Format: date-time */
                                updated_at: string;
                                url: string;
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
    "/v1/ders/kurumlar/{kurum_id}/kayitlarim/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Tekil kayit (ogrenci). Parola yalniz gorunurluk kurallarini saglayan ogrenciye duz metin doner; gorunmeyen kaynak 404 (varligi ifsa edilmez). */
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
                            /** @description Bu öğrencinin bu kaynak için açık bildirimi var mı. */
                            acik_sorun_var: boolean;
                            baslik: string;
                            bozuk: boolean;
                            brans_kodu: string | null;
                            /** Format: date-time */
                            created_at: string;
                            /** Format: date-time */
                            ders_baslangic_at: string | null;
                            /** Format: uuid */
                            ders_id: string | null;
                            /** @enum {string} */
                            durum: "aktif" | "suresi_doldu" | "bozuk" | "gizli";
                            /** Format: uuid */
                            ekleyen_id: string;
                            /** Format: date-time */
                            gecerlilik_bitis_at: string | null;
                            /** @enum {string} */
                            gorunurluk: "ogretmen" | "grup" | "secili_ogrenciler";
                            /** Format: uuid */
                            grup_id: string;
                            /** Format: uuid */
                            id: string;
                            /** Format: date-time */
                            izledi_at: string | null;
                            izlendi: boolean;
                            /** Format: uuid */
                            konu_id: string | null;
                            /**
                             * Format: uuid
                             * @description Derse bağlıysa dersin öğretmeni, değilse ekleyen.
                             */
                            ogretmen_id: string | null;
                            parola: string | null;
                            parola_var: boolean;
                            /** @enum {string} */
                            saglayici: "zoom" | "drive" | "youtube" | "onedrive" | "diger";
                            /** @enum {string} */
                            tur: "kayit" | "materyal";
                            /** Format: date-time */
                            updated_at: string;
                            url: string;
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
    "/v1/ders/kurumlar/{kurum_id}/kayitlarim/{id}/izledim": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** "Izledim" isareti (idempotent): ikinci cagri ayni `izledi_at` ile `ilk: false` doner. `ders.kaynak.izlendi.v1` yalniz ilk eklemede yayimlanir. Geri alinmaz. */
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
                            /** @description `true`: ilk işaret (olay yayımlandı); `false`: zaten işaretliydi. */
                            ilk: boolean;
                            /** Format: date-time */
                            izledi_at: string;
                            /** Format: uuid */
                            kaynak_id: string;
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
    "/v1/ders/kurumlar/{kurum_id}/kayitlarim/{id}/sorunlar": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** "Acilmiyor" bildirimi (neden + aciklama). Ayni ogrencinin ayni kaynak icin tek acik bildirimi olur (ikincisi 409 `kaynak_sorun_zaten_acik`). Ilk acik bildirim kaynagi `bozuk` yapar; `ders.kaynak.sorun_bildirildi.v1` yayimlanir. */
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
                        aciklama?: string | null;
                        /** @enum {string} */
                        neden: "acilmiyor" | "parola_yanlis" | "suresi_doldu" | "diger";
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
                            /** @enum {string} */
                            kaynak_durumu: "aktif" | "suresi_doldu" | "bozuk" | "gizli";
                            sorun: {
                                aciklama: string | null;
                                /** Format: uuid */
                                bildiren_id: string;
                                /** Format: uuid */
                                cozen_id: string | null;
                                /** Format: date-time */
                                cozuldu_at: string | null;
                                /** Format: date-time */
                                created_at: string;
                                /** @enum {string} */
                                durum: "acik" | "cozuldu";
                                /** Format: uuid */
                                id: string;
                                /** Format: uuid */
                                kaynak_id: string;
                                /** @enum {string} */
                                neden: "acilmiyor" | "parola_yanlis" | "suresi_doldu" | "diger";
                            };
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
    "/v1/ders/kurumlar/{kurum_id}/kaynaklar": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Personel kaynak listesi (yeniden eskiye, imlecli). Ogretmen atandigi gruplarin ve kendi ekledigi kaynaklari, sahip/yonetici kapsamindakilerin hepsini gorur. Suzgecler: tur, grup, brans, ders, konu, durum, tarih. Parola donmez; `izleyen_sayisi` ve `acik_sorun_sayisi` satirdadir. */
        get: {
            parameters: {
                query?: {
                    /** @description Ders tarihi (yoksa eklenme tarihi), kurum yerel günü, dahil. */
                    baslangic?: string;
                    bitis?: string;
                    brans_kodu?: string;
                    ders_id?: string;
                    durum?: "aktif" | "suresi_doldu" | "bozuk" | "gizli";
                    grup_id?: string;
                    imlec?: string;
                    konu_id?: string;
                    limit?: number;
                    tur?: "kayit" | "materyal";
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
                            kaynaklar: {
                                acik_sorun_sayisi: number;
                                baslik: string;
                                brans_kodu: string | null;
                                /** Format: date-time */
                                created_at: string;
                                /** Format: date-time */
                                ders_baslangic_at: string | null;
                                /** Format: uuid */
                                ders_id: string | null;
                                /** @enum {string} */
                                durum: "aktif" | "suresi_doldu" | "bozuk" | "gizli";
                                /** Format: uuid */
                                ekleyen_id: string;
                                /** Format: date-time */
                                gecerlilik_bitis_at: string | null;
                                /** @enum {string} */
                                gorunurluk: "ogretmen" | "grup" | "secili_ogrenciler";
                                /** Format: uuid */
                                grup_id: string;
                                /** Format: uuid */
                                id: string;
                                izleyen_sayisi: number;
                                /** Format: uuid */
                                konu_id: string | null;
                                /**
                                 * Format: uuid
                                 * @description Derse bağlıysa dersin öğretmeni, değilse ekleyen.
                                 */
                                ogretmen_id: string | null;
                                parola_var: boolean;
                                /** @enum {string} */
                                saglayici: "zoom" | "drive" | "youtube" | "onedrive" | "diger";
                                /** @enum {string} */
                                tur: "kayit" | "materyal";
                                /** Format: date-time */
                                updated_at: string;
                                url: string;
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
    "/v1/ders/kurumlar/{kurum_id}/kaynaklar/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Tekil kaynak (personel). Parola yetkili personele (ekleyen/atanmis ogretmen, sahip, yonetici) duz metin doner; alicilar `secili_ogrenciler`de listelenir. */
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
                            acik_sorun_sayisi: number;
                            baslik: string;
                            brans_kodu: string | null;
                            /** Format: date-time */
                            created_at: string;
                            /** Format: date-time */
                            ders_baslangic_at: string | null;
                            /** Format: uuid */
                            ders_id: string | null;
                            /** @enum {string} */
                            durum: "aktif" | "suresi_doldu" | "bozuk" | "gizli";
                            /** Format: uuid */
                            ekleyen_id: string;
                            /** Format: date-time */
                            gecerlilik_bitis_at: string | null;
                            /** @enum {string} */
                            gorunurluk: "ogretmen" | "grup" | "secili_ogrenciler";
                            /** Format: uuid */
                            grup_id: string;
                            /** Format: uuid */
                            id: string;
                            izleyen_sayisi: number;
                            /** Format: uuid */
                            konu_id: string | null;
                            /** @description `secili_ogrenciler` alıcıları (yalnız personel); aksi `null`. */
                            ogrenci_idleri: string[] | null;
                            /**
                             * Format: uuid
                             * @description Derse bağlıysa dersin öğretmeni, değilse ekleyen.
                             */
                            ogretmen_id: string | null;
                            /** @description Yalnız görünürlük kurallarını sağlayan öğrenciye ve yetkili öğretmene düz metin. */
                            parola: string | null;
                            parola_var: boolean;
                            /** @enum {string} */
                            saglayici: "zoom" | "drive" | "youtube" | "onedrive" | "diger";
                            /** @enum {string} */
                            tur: "kayit" | "materyal";
                            /** Format: date-time */
                            updated_at: string;
                            url: string;
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        /** Kaynagi yumusak sil (`silindi_at`). Ogrenciye hemen gorunmez olur; kayit korunur (izleme ve bildirimler). */
        delete: {
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
        /** Kaynagi duzenle ya da gizle (`durum: gizli`). `bozuk` bir kaynak guncellenince `aktif`e doner ve acik bildirimler cozulur; `suresi_doldu` kaynagin son erisim tarihi uzatilinca `aktif`e doner. Yalniz ekleyen / grubuna atanmis ogretmen ya da sahip/yonetici. */
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
                        baslik?: string;
                        /**
                         * @description `gizli`: öğrenciden gizler. `aktif`: yeniden açar.
                         * @enum {string}
                         */
                        durum?: "aktif" | "gizli";
                        /** Format: date-time */
                        gecerlilik_bitis_at?: string | null;
                        /** @enum {string} */
                        gorunurluk?: "ogretmen" | "grup" | "secili_ogrenciler";
                        /** Format: uuid */
                        konu_id?: string | null;
                        ogrenci_idleri?: string[];
                        /** @description `null`: parolayı kaldır. */
                        parola?: string | null;
                        url?: string;
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
                            acik_sorun_sayisi: number;
                            baslik: string;
                            brans_kodu: string | null;
                            /** Format: date-time */
                            created_at: string;
                            /** Format: date-time */
                            ders_baslangic_at: string | null;
                            /** Format: uuid */
                            ders_id: string | null;
                            /** @enum {string} */
                            durum: "aktif" | "suresi_doldu" | "bozuk" | "gizli";
                            /** Format: uuid */
                            ekleyen_id: string;
                            /** Format: date-time */
                            gecerlilik_bitis_at: string | null;
                            /** @enum {string} */
                            gorunurluk: "ogretmen" | "grup" | "secili_ogrenciler";
                            /** Format: uuid */
                            grup_id: string;
                            /** Format: uuid */
                            id: string;
                            izleyen_sayisi: number;
                            /** Format: uuid */
                            konu_id: string | null;
                            /** @description `secili_ogrenciler` alıcıları (yalnız personel); aksi `null`. */
                            ogrenci_idleri: string[] | null;
                            /**
                             * Format: uuid
                             * @description Derse bağlıysa dersin öğretmeni, değilse ekleyen.
                             */
                            ogretmen_id: string | null;
                            /** @description Yalnız görünürlük kurallarını sağlayan öğrenciye ve yetkili öğretmene düz metin. */
                            parola: string | null;
                            parola_var: boolean;
                            /** @enum {string} */
                            saglayici: "zoom" | "drive" | "youtube" | "onedrive" | "diger";
                            /** @enum {string} */
                            tur: "kayit" | "materyal";
                            /** Format: date-time */
                            updated_at: string;
                            url: string;
                        };
                    };
                };
            };
        };
        trace?: never;
    };
    "/v1/ders/kurumlar/{kurum_id}/kaynaklar/{id}/izlemeler": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Kaynagi kimin izledigi: izleyenler (zamaniyla) ve izlemeyenler (hedef kitleden). Hedef: ders katilimcilari / grubun etkin uyeleri / secili alicilar; `ogretmen` gorunurlugunde hedef yoktur. */
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
                            hedef_sayisi: number;
                            izlemeyenler: {
                                gorunen_ad: string | null;
                                /** Format: uuid */
                                ogrenci_id: string;
                            }[];
                            izleyenler: {
                                gorunen_ad: string | null;
                                /** Format: date-time */
                                izledi_at: string;
                                /** Format: uuid */
                                ogrenci_id: string;
                            }[];
                            /** Format: uuid */
                            kaynak_id: string;
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
    "/v1/ders/kurumlar/{kurum_id}/kaynaklar/{id}/sorunlar": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** "Acilmiyor" bildirimleri (acik olanlar once, yeniden eskiye). */
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
                            sorunlar: {
                                aciklama: string | null;
                                bildiren_ad: string | null;
                                /** Format: uuid */
                                bildiren_id: string;
                                /** Format: uuid */
                                cozen_id: string | null;
                                /** Format: date-time */
                                cozuldu_at: string | null;
                                /** Format: date-time */
                                created_at: string;
                                /** @enum {string} */
                                durum: "acik" | "cozuldu";
                                /** Format: uuid */
                                id: string;
                                /** Format: uuid */
                                kaynak_id: string;
                                /** @enum {string} */
                                neden: "acilmiyor" | "parola_yanlis" | "suresi_doldu" | "diger";
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
    "/v1/ders/kurumlar/{kurum_id}/kaynaklar/{id}/sorunlar/coz": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Kaynagin tum acik "acilmiyor" bildirimlerini coz; `bozuk` kaynak `aktif`e doner. Acik bildirim yoksa `cozulen_sayisi: 0`. */
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
                            cozulen_sayisi: number;
                            /** @enum {string} */
                            kaynak_durumu: "aktif" | "suresi_doldu" | "bozuk" | "gizli";
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
    "/v1/ders/kurumlar/{kurum_id}/ogrenciler/{ogrenci_id}/geri-bildirimler": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Ogrencinin son geri bildirimleri (ogrenci profili); yeniden eskiye, imlecle sayfali. Ogretmen yalniz kendi derslerindeki / atandigi gruplardaki geri bildirimleri gorur. */
        get: {
            parameters: {
                query?: {
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
                            geri_bildirimler: {
                                brans_kodu: string;
                                /** Format: date-time */
                                created_at: string;
                                /** @enum {string} */
                                deger: "anladim" | "kismen" | "anlamadim";
                                /** Format: date-time */
                                ders_baslangic_at: string;
                                /** Format: date-time */
                                ders_bitis_at: string;
                                /** Format: uuid */
                                ders_id: string;
                                /** Format: uuid */
                                id: string;
                                /** Format: uuid */
                                konu_id: string | null;
                                not: string | null;
                                /** Format: uuid */
                                ogrenci_id: string;
                                /** Format: uuid */
                                ogretmen_id: string;
                                /** Format: date-time */
                                updated_at: string;
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
    "/v1/ders/kurumlar/{kurum_id}/rapor/anladim": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Ders sonu geri bildirim alt listesi: ogrenci bazinda anladim/kismen/anlamadim, en dusuk "anladim" orani once; en cok 200 satir. */
        get: {
            parameters: {
                query?: {
                    /** @description Son N gün (kurum saat dilimiyle, bugün dahil). */
                    donem?: "7" | "30";
                    /** @description Yalnız bu grubun satırları. */
                    grup_id?: string;
                    /** @description Yalnız bu öğretmenin satırları. */
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
                            satirlar: {
                                ayrinti: {
                                    [key: string]: number;
                                };
                                gorunen_ad: string | null;
                                /** Format: uuid */
                                ogrenci_id: string;
                                oran: number | null;
                                pay: number;
                                payda: number;
                            }[];
                            toplam_satir: number;
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
    "/v1/ders/kurumlar/{kurum_id}/rapor/devam": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Devam orani alt listesi: ogrenci bazinda geldi/gec/gelmedi/izinli, en dusuk devam once; en cok 200 satir. */
        get: {
            parameters: {
                query?: {
                    /** @description Son N gün (kurum saat dilimiyle, bugün dahil). */
                    donem?: "7" | "30";
                    /** @description Yalnız bu grubun satırları. */
                    grup_id?: string;
                    /** @description Yalnız bu öğretmenin satırları. */
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
                            satirlar: {
                                ayrinti: {
                                    [key: string]: number;
                                };
                                gorunen_ad: string | null;
                                /** Format: uuid */
                                ogrenci_id: string;
                                oran: number | null;
                                pay: number;
                                payda: number;
                            }[];
                            toplam_satir: number;
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
    "/v1/ders/kurumlar/{kurum_id}/rapor/ozet": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Yonetici paneli: devam orani ve ders sonu "anladim" orani; kurum, grup ve ogretmen kirilimi. Ogretmen yalniz atandigi gruplari gorur. Modul kapaliysa gosterge `null`. */
        get: {
            parameters: {
                query?: {
                    /** @description Son N gün (kurum saat dilimiyle, bugün dahil). */
                    donem?: "7" | "30";
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
                            /**
                             * Format: date
                             * @description Kurum yerel günü, dahil.
                             */
                            baslangic: string;
                            /**
                             * Format: date
                             * @description Kurum yerel günü, dahil (bugün).
                             */
                            bitis: string;
                            donem_gun: number;
                            gruplar: {
                                /** @description Modül kurumda kapalıysa `null`. */
                                anladim: {
                                    oran: number | null;
                                    pay: number;
                                    payda: number;
                                } | null;
                                /** @description Modül kurumda kapalıysa `null`. */
                                devam: {
                                    oran: number | null;
                                    pay: number;
                                    payda: number;
                                } | null;
                                /** Format: uuid */
                                grup_id: string;
                            }[];
                            /**
                             * @description Yanıtı daraltan izin kapsamı (öğretmen: `grup`).
                             * @enum {string}
                             */
                            kapsam: "kendi" | "grup" | "sube" | "kurum";
                            kurum: {
                                /** @description Modül kurumda kapalıysa `null`. */
                                anladim: {
                                    oran: number | null;
                                    pay: number;
                                    payda: number;
                                } | null;
                                /** @description Modül kurumda kapalıysa `null`. */
                                devam: {
                                    oran: number | null;
                                    pay: number;
                                    payda: number;
                                } | null;
                            };
                            ogretmenler: {
                                /** @description Modül kurumda kapalıysa `null`. */
                                anladim: {
                                    oran: number | null;
                                    pay: number;
                                    payda: number;
                                } | null;
                                /** @description Modül kurumda kapalıysa `null`. */
                                devam: {
                                    oran: number | null;
                                    pay: number;
                                    payda: number;
                                } | null;
                                /** Format: uuid */
                                ogretmen_id: string;
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
                            ogrenci_ad: string | null;
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
        /** Görünen adı / dili güncelle (hesap.kullanici.degisti.v1 yayımlar; olayda ad taşınmaz) */
        patch: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        /** @enum {string} */
                        dil?: "tr";
                        gorunen_ad?: string;
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
                            degisen_alanlar: ("gorunen_ad" | "dil")[];
                            dil: string;
                            gorunen_ad: string | null;
                        };
                    };
                };
            };
        };
        trace?: never;
    };
    "/v1/hesap/ben/silme-talebi": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Hesap silme talebi durumu, olası engeller ve kullanılabilir doğrulama yöntemleri */
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
                            dogrulama_yontemleri: ("otp" | "parola")[];
                            engeller: {
                                diger_uye_sayisi: number;
                                kurum_ad: string;
                                /** Format: uuid */
                                kurum_id: string;
                            }[];
                            soguma_gun: number;
                            talep: {
                                /** @enum {string} */
                                durum: "beklemede" | "geri_alindi" | "tamamlandi" | "engellendi";
                                /** Format: date-time */
                                geri_alindi_at: string | null;
                                /** Format: uuid */
                                id: string;
                                /** Format: date-time */
                                planlanan_at: string;
                                /** Format: date-time */
                                talep_at: string;
                                /** Format: date-time */
                                tamamlandi_at: string | null;
                            } | null;
                        };
                    };
                };
            };
        };
        put?: never;
        /** Hesap silme talebi (yeniden doğrulama: OTP ya da parola). 30 gün içinde geri alınabilir, sonra kalıcı anonimleştirme. */
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
                        dogrulama: {
                            kod: string;
                            /** @enum {string} */
                            yontem: "otp";
                        } | {
                            parola: string;
                            /** @enum {string} */
                            yontem: "parola";
                        };
                        /**
                         * @default web
                         * @enum {string}
                         */
                        kaynak?: "web" | "ios" | "android";
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
                            talep: {
                                /** @enum {string} */
                                durum: "beklemede" | "geri_alindi" | "tamamlandi" | "engellendi";
                                /** Format: date-time */
                                geri_alindi_at: string | null;
                                /** Format: uuid */
                                id: string;
                                /** Format: date-time */
                                planlanan_at: string;
                                /** Format: date-time */
                                talep_at: string;
                                /** Format: date-time */
                                tamamlandi_at: string | null;
                            };
                        };
                    };
                };
            };
        };
        /** Bekleyen hesap silme talebini geri al (soğuma süresi içinde) */
        delete: {
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
                            talep: {
                                /** @enum {string} */
                                durum: "beklemede" | "geri_alindi" | "tamamlandi" | "engellendi";
                                /** Format: date-time */
                                geri_alindi_at: string | null;
                                /** Format: uuid */
                                id: string;
                                /** Format: date-time */
                                planlanan_at: string;
                                /** Format: date-time */
                                talep_at: string;
                                /** Format: date-time */
                                tamamlandi_at: string | null;
                            };
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
    "/v1/hesap/ben/silme-talebi/kod-gonder": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Hesap silme için kendi telefonuna doğrulama kodu (OTP) gönder */
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
    "/v1/hesap/ben/verilerim": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Kişisel verilerimi indir (KVKK m.11): hesap, üyelik, kendi içeriklerim ve diğer servislerin verisi (JSON) */
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
                            bolumler: {
                                [key: string]: {
                                    [key: string]: unknown;
                                }[];
                            };
                            eksik_servisler: string[];
                            hesap: {
                                [key: string]: unknown;
                            };
                            /** Format: uuid */
                            kullanici_id: string;
                            /** Format: date-time */
                            olusturuldu_at: string;
                            servisler: {
                                [key: string]: {
                                    [key: string]: {
                                        [key: string]: unknown;
                                    }[];
                                };
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
    "/v1/hesap/bransler": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Aktif branslar (global referans listesi, `sira` ve `ad` sirasiyla). Kisisel veri icermez. */
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
                            bransler: {
                                ad: string;
                                kod: string;
                                sira: number;
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
                                    ogrenci_deneme_girisi?: boolean;
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
                                ogrenci_deneme_girisi?: boolean;
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
                                ogrenci_deneme_girisi?: boolean;
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
                                /** @description Yalniz birebir grupta etkin ogrencinin gorunen adi; baska turlerde `null`. */
                                ogrenci_ad: string | null;
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
    "/v1/hesap/kurumlar/{kurum_id}/kademeler": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Kurumun kademeleri (arsivlenmemis; sira, ad). Kademe hedefli odev/duyuru secimi icin; kisisel veri icermez. */
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
                            kademeler: {
                                ad: string;
                                /** Format: uuid */
                                id: string;
                                seviye: number | null;
                                sira: number;
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
    "/v1/hesap/kurumlar/{kurum_id}/rapor/ogrenciler": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Aktif ogrenci listesi (panelde sayiya tiklaninca): grup ve/veya ogretmen suzgeci; en cok 200 satir, `toplam_satir` gercek sayi. */
        get: {
            parameters: {
                query?: {
                    /** @description Son N gün (kurum saat dilimiyle, bugün dahil). */
                    donem?: "7" | "30";
                    /** @description Yalnız bu grubun satırları. */
                    grup_id?: string;
                    /** @description Yalnız bu öğretmenin satırları. */
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
                            satirlar: {
                                gorunen_ad: string | null;
                                gruplar: string[];
                                /** Format: uuid */
                                ogrenci_id: string;
                            }[];
                            toplam_satir: number;
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
    "/v1/hesap/kurumlar/{kurum_id}/rapor/ozet": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Yonetici paneli: aktif ogrenci sayisi ile grup ve ogretmen dizini. Ogretmen yalniz atandigi gruplari gorur. */
        get: {
            parameters: {
                query?: {
                    /** @description Son N gün (kurum saat dilimiyle, bugün dahil). */
                    donem?: "7" | "30";
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
                            /**
                             * Format: date
                             * @description Kurum yerel günü, dahil.
                             */
                            baslangic: string;
                            /**
                             * Format: date
                             * @description Kurum yerel günü, dahil (bugün).
                             */
                            bitis: string;
                            donem_gun: number;
                            gruplar: {
                                ad: string;
                                aktif_ogrenci: number;
                                /** Format: uuid */
                                grup_id: string;
                                tur: string;
                            }[];
                            /**
                             * @description Yanıtı daraltan izin kapsamı (öğretmen: `grup`).
                             * @enum {string}
                             */
                            kapsam: "kendi" | "grup" | "sube" | "kurum";
                            kurum: {
                                aktif_ogrenci: number;
                                grup_sayisi: number;
                                ogretmen_sayisi: number;
                            };
                            ogretmenler: {
                                aktif_ogrenci: number;
                                gorunen_ad: string | null;
                                grup_sayisi: number;
                                /** Format: uuid */
                                ogretmen_id: string;
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
    "/v1/ogrenme/kurumlar/{kurum_id}/cevapladigim-sorular": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Cevapladigim sorularin arsivi (bir cevap mesaji yazdigim sorular), en yeni hareket once; brans/ogrenci suzgeci ve Turkce harf duyarsiz arama. */
        get: {
            parameters: {
                query?: {
                    brans_kodu?: string;
                    imlec?: string;
                    limit?: number;
                    ogrenci_id?: string;
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
                            sonraki_imlec: string | null;
                            sorular: {
                                /** Format: uuid */
                                atanan_ogretmen_id: string | null;
                                baslik: string | null;
                                brans_kodu: string;
                                /** Format: date-time */
                                cozuldu_at: string | null;
                                /** Format: date-time */
                                created_at: string;
                                /** @enum {string} */
                                durum: "acik" | "cevaplandi" | "takip_bekliyor" | "cozuldu" | "kapandi";
                                /** Format: uuid */
                                id: string;
                                /** Format: date-time */
                                ilk_cevap_at: string | null;
                                /** Format: uuid */
                                konu_id: string | null;
                                /** Format: uuid */
                                masa_id: string | null;
                                mesaj_sayisi: number;
                                metin_onizleme: string | null;
                                ogrenci_adi: string | null;
                                /** Format: uuid */
                                ogrenci_id: string;
                                /** Format: date-time */
                                son_hareket_at: string;
                                /** Format: uuid */
                                ustlenen_id: string | null;
                                /** @enum {string} */
                                yonlendirme: "atanan_ogretmen" | "masa" | "yonetici";
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
    "/v1/ogrenme/kurumlar/{kurum_id}/degerlendirme-hatirlatma": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Bugun karti: bu hafta (Pazartesi-Pazar, Europe/Istanbul) KENDI yazdigi degerlendirmesi olmayan ogrencilerim (kapsamdaki etkin ogrenciler; sahip/yonetici icin herhangi birinin yazdigi). En eski/hic olmayan once, en cok 100; `eksik_sayisi` toplam. Bildirim uretmez. */
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
                            eksik_sayisi: number;
                            /** Format: date */
                            hafta_baslangic: string;
                            ogrenci_sayisi: number;
                            ogrenciler: {
                                ogrenci_ad: string | null;
                                /** Format: uuid */
                                ogrenci_id: string;
                                /** Format: date */
                                son_degerlendirme_gun: string | null;
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
    "/v1/ogrenme/kurumlar/{kurum_id}/degerlendirmeler/{id}": {
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
        /** Degerlendirmeyi duzenle: yalniz yazar (baskasi 403; kapsam disi ogrenci 404) ve olusturmadan sonraki 7 gun icinde (sonra 409 `degerlendirme_duzenlenemez`, yeni kayit yazilir); geri cekilmis kayit 409 `degerlendirme_geri_cekildi`. Verilen alanlar degisir, `null` alani temizler; `surum` iyimser kilit (409 `surum_cakismasi`). Gorunurluk kapaliyken acilirsa ogrenciye (bir kez) bildirim olayi yayimlanir. */
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
                        anlama_duzeyi?: number | null;
                        brans_kodu?: string | null;
                        calisma_duzeni?: number | null;
                        derse_katilim?: number | null;
                        /** Format: date */
                        donem_baslangic?: string;
                        /** Format: date */
                        donem_bitis?: string;
                        odev_disiplini?: number | null;
                        ogrenci_gorur?: boolean;
                        surum?: number;
                        yorum?: string | null;
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
                            anlama_duzeyi: number | null;
                            benim: boolean;
                            brans_kodu: string | null;
                            calisma_duzeni: number | null;
                            /** Format: date-time */
                            created_at: string;
                            derse_katilim: number | null;
                            /** Format: date */
                            donem_baslangic: string;
                            /** Format: date */
                            donem_bitis: string;
                            /** Format: date-time */
                            duzenleme_son_at: string;
                            duzenlenebilir: boolean;
                            /** Format: date-time */
                            geri_cekildi_at: string | null;
                            /** Format: uuid */
                            id: string;
                            odev_disiplini: number | null;
                            ogrenci_gorur: boolean;
                            /** Format: uuid */
                            ogrenci_id: string;
                            surum: number;
                            yazar_ad: string | null;
                            /** Format: uuid */
                            yazar_id: string;
                            yorum: string | null;
                        };
                    };
                };
            };
        };
        trace?: never;
    };
    "/v1/ogrenme/kurumlar/{kurum_id}/degerlendirmeler/{id}/geri-cek": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Degerlendirmeyi geri cek (silme degil): yazar ya da sahip/yonetici; baskasi 403, kapsam disi 404. Geri cekilen ogrenciye hicbir kosulda gorunmez ve kocluk gorunumunde yer almaz. Tekrar cagri 200 ve ayni kayit. */
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
                            anlama_duzeyi: number | null;
                            benim: boolean;
                            brans_kodu: string | null;
                            calisma_duzeni: number | null;
                            /** Format: date-time */
                            created_at: string;
                            derse_katilim: number | null;
                            /** Format: date */
                            donem_baslangic: string;
                            /** Format: date */
                            donem_bitis: string;
                            /** Format: date-time */
                            duzenleme_son_at: string;
                            duzenlenebilir: boolean;
                            /** Format: date-time */
                            geri_cekildi_at: string | null;
                            /** Format: uuid */
                            id: string;
                            odev_disiplini: number | null;
                            ogrenci_gorur: boolean;
                            /** Format: uuid */
                            ogrenci_id: string;
                            surum: number;
                            yazar_ad: string | null;
                            /** Format: uuid */
                            yazar_id: string;
                            yorum: string | null;
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
    "/v1/ogrenme/kurumlar/{kurum_id}/degerlendirmelerim": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Ogrenci: kendisine GORUNUR isaretlenmis ve geri cekilmemis degerlendirmeler (en yeni once). Yanitta gorunurluk bayragi, yazar kimligi ve surum yoktur. Gorunur olmayan hicbir degerlendirme bu uctan (ya da baska bir uctan) alinamaz; veritabaninda ayrica RESTRICTIVE RLS vardir. */
        get: {
            parameters: {
                query?: {
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
                            degerlendirmeler: {
                                anlama_duzeyi: number | null;
                                brans_kodu: string | null;
                                calisma_duzeni: number | null;
                                /** Format: date-time */
                                created_at: string;
                                derse_katilim: number | null;
                                /** Format: date */
                                donem_baslangic: string;
                                /** Format: date */
                                donem_bitis: string;
                                /** Format: uuid */
                                id: string;
                                odev_disiplini: number | null;
                                yazar_ad: string | null;
                                yorum: string | null;
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
    "/v1/ogrenme/kurumlar/{kurum_id}/deneme-ayarlari": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Kurumun deneme ayari: `ogrenci_deneme_girisi` (varsayilan true). Istemci, kapaliysa ogrenciye "Deneme ekle" gostermez. */
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
                            /** @description Öğrenci kendi deneme sonucunu girebilsin mi (varsayılan true; girişler öğretmen onayına düşer). */
                            ogrenci_deneme_girisi: boolean;
                        };
                    };
                };
            };
        };
        /** Ogrenci deneme girisini ac/kapat (kurum ayari `ogrenci_deneme_girisi`). Kapaliyken ogrenci girisi, duzeltmesi ve silmesi 403. */
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
                        /** @description Öğrenci kendi deneme sonucunu girebilsin mi (varsayılan true; girişler öğretmen onayına düşer). */
                        ogrenci_deneme_girisi: boolean;
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
                            /** @description Öğrenci kendi deneme sonucunu girebilsin mi (varsayılan true; girişler öğretmen onayına düşer). */
                            ogrenci_deneme_girisi: boolean;
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
    "/v1/ogrenme/kurumlar/{kurum_id}/deneme-kurallari": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Deneme kurallari: global (LGS, TYT, AYT, YDT; `global: true`, yalniz okunur) ve kurumun ozel kurallari. Net kurali katsayi ve bolumlerdir. */
        get: {
            parameters: {
                query?: {
                    aktif?: "true" | "false";
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
                            kurallar: {
                                ad: string;
                                aktif: boolean;
                                bolumler: {
                                    ad: string;
                                    /** @description Kuralda tekil bölüm kimliği (AYT Tarih-1 ve Tarih-2 ayrı bölümdür). */
                                    bolum_kodu: string;
                                    brans_kodu: string;
                                    soru_sayisi: number;
                                }[];
                                gecerli_yil: number | null;
                                global: boolean;
                                /** Format: uuid */
                                id: string;
                                kod: string;
                                /**
                                 * Format: uuid
                                 * @description null = global kural (yalnız okunur).
                                 */
                                kurum_id: string | null;
                                surum: number;
                                toplam_soru_sayisi: number;
                                toplam_sure_dk: number | null;
                                yanlis_katsayisi: number;
                            }[];
                        };
                    };
                };
            };
        };
        put?: never;
        /** Kuruma ozel deneme kurali (`ozel_` oneki zorunlu). Ayni kod ve yil ikinci kez 409; global kuralla cakisma olmaz (onek farkli). */
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
                        /** @default true */
                        aktif?: boolean;
                        bolumler: {
                            ad: string;
                            /** @description Kuralda tekil bölüm kimliği (AYT Tarih-1 ve Tarih-2 ayrı bölümdür). */
                            bolum_kodu: string;
                            brans_kodu: string;
                            soru_sayisi: number;
                        }[];
                        gecerli_yil?: number | null;
                        kod: string;
                        toplam_sure_dk?: number | null;
                        /** @description Yanlışın doğruyu götürme oranı (LGS 0.3333, TYT/AYT/YDT 0.25). En çok 4 ondalık. */
                        yanlis_katsayisi: number;
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
                            bolumler: {
                                ad: string;
                                /** @description Kuralda tekil bölüm kimliği (AYT Tarih-1 ve Tarih-2 ayrı bölümdür). */
                                bolum_kodu: string;
                                brans_kodu: string;
                                soru_sayisi: number;
                            }[];
                            gecerli_yil: number | null;
                            global: boolean;
                            /** Format: uuid */
                            id: string;
                            kod: string;
                            /**
                             * Format: uuid
                             * @description null = global kural (yalnız okunur).
                             */
                            kurum_id: string | null;
                            surum: number;
                            toplam_soru_sayisi: number;
                            toplam_sure_dk: number | null;
                            yanlis_katsayisi: number;
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
    "/v1/ogrenme/kurumlar/{kurum_id}/deneme-kurallari/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** Kurum ozel kurali sil. Kuralla girilmis deneme varsa 409 `kural_kullanimda` (kurali `aktif: false` yapin); global kural 403. */
        delete: {
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
                    content?: never;
                };
            };
        };
        options?: never;
        head?: never;
        /** Kurum ozel kurali guncelle (iyimser kilit: `surum`; global kural 403). Girilmis denemeler kural anindaki katsayi ve soru sayisini korur: eski net degismez. */
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
                        aktif?: boolean;
                        bolumler?: {
                            ad: string;
                            /** @description Kuralda tekil bölüm kimliği (AYT Tarih-1 ve Tarih-2 ayrı bölümdür). */
                            bolum_kodu: string;
                            brans_kodu: string;
                            soru_sayisi: number;
                        }[];
                        gecerli_yil?: number | null;
                        surum: number;
                        toplam_sure_dk?: number | null;
                        /** @description Yanlışın doğruyu götürme oranı (LGS 0.3333, TYT/AYT/YDT 0.25). En çok 4 ondalık. */
                        yanlis_katsayisi?: number;
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
                            bolumler: {
                                ad: string;
                                /** @description Kuralda tekil bölüm kimliği (AYT Tarih-1 ve Tarih-2 ayrı bölümdür). */
                                bolum_kodu: string;
                                brans_kodu: string;
                                soru_sayisi: number;
                            }[];
                            gecerli_yil: number | null;
                            global: boolean;
                            /** Format: uuid */
                            id: string;
                            kod: string;
                            /**
                             * Format: uuid
                             * @description null = global kural (yalnız okunur).
                             */
                            kurum_id: string | null;
                            surum: number;
                            toplam_soru_sayisi: number;
                            toplam_sure_dk: number | null;
                            yanlis_katsayisi: number;
                        };
                    };
                };
            };
        };
        trace?: never;
    };
    "/v1/ogrenme/kurumlar/{kurum_id}/denemeler": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Deneme listesi (kapsamdaki ogrenciler, yeniden eskiye, sayfali). `onay=bekliyor` ogretmenin onay kuyrugudur. */
        get: {
            parameters: {
                query?: {
                    /** @description Önceki sayfanın `sonraki_imlec` değeri. */
                    imlec?: string;
                    /** @description Kural kodu. */
                    kural?: string;
                    limit?: number;
                    ogrenci_id?: string;
                    onay?: "bekliyor" | "onaylandi" | "reddedildi";
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
                            denemeler: {
                                ad: string;
                                bolumler: {
                                    bolum_kodu: string;
                                    bos: number;
                                    brans_kodu: string;
                                    dogru: number;
                                    /** @description Veritabanı üretilmiş değeri, 2 ondalık. */
                                    net: number;
                                    soru_sayisi: number;
                                    yanlis: number;
                                }[];
                                /** Format: date-time */
                                created_at: string;
                                /** Format: uuid */
                                giren_id: string;
                                /** @description Yalnız öğretmen/yönetici yanıtlarında. */
                                gorunen_ad: string | null;
                                /** Format: uuid */
                                id: string;
                                /** @enum {string} */
                                kaynak: "ogrenci" | "ogretmen";
                                /** Format: uuid */
                                kural_id: string;
                                kural_kodu: string;
                                not: string | null;
                                /** Format: uuid */
                                ogrenci_id: string;
                                /** Format: date-time */
                                onay_at: string | null;
                                /** @enum {string} */
                                onay_durumu: "bekliyor" | "onaylandi" | "reddedildi";
                                /** Format: uuid */
                                onaylayan_id: string | null;
                                red_nedeni: string | null;
                                /** Format: date */
                                sinav_tarihi: string;
                                sure_dk: number | null;
                                surum: number;
                                toplam_net: number;
                                yanlis_katsayisi: number;
                                yayinevi: string | null;
                            }[];
                            sonraki_imlec: string | null;
                        };
                    };
                };
            };
        };
        put?: never;
        /** Deneme sonucu ekle. Ogretmen/yonetici: `ogrenci_id` zorunlu, kapsamdaki ogrenciye, dogrudan `onaylandi` (olay uretir). Ogrenci: yalniz kendi sonucu, `bekliyor` (ogretmen onayi gerekir, olay uretmez); kurum ayari `ogrenci_deneme_girisi` kapaliysa 403. Net veritabanince hesaplanir: yanit `net` sayisi (2 ondalik). Ayni ogrenci/kural/tarih/ad 409. */
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
                        bolumler: {
                            bolum_kodu: string;
                            /** @description Verilmezse `soru_sayisi - dogru - yanlis` hesaplanır; verilirse toplamı tutmalı. */
                            bos?: number;
                            dogru: number;
                            yanlis: number;
                        }[];
                        /**
                         * Format: uuid
                         * @description Belirli kural sürümü. Yoksa `kural_kodu`nun en yeni aktif sürümü.
                         */
                        kural_id?: string;
                        kural_kodu?: string;
                        not?: string;
                        /**
                         * Format: uuid
                         * @description Öğretmen/yönetici için zorunlu; öğrencide yok sayılır (kendisi).
                         */
                        ogrenci_id?: string;
                        /** Format: date */
                        sinav_tarihi: string;
                        sure_dk?: number;
                        yayinevi?: string;
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
                            bolumler: {
                                bolum_kodu: string;
                                bos: number;
                                brans_kodu: string;
                                dogru: number;
                                /** @description Veritabanı üretilmiş değeri, 2 ondalık. */
                                net: number;
                                soru_sayisi: number;
                                yanlis: number;
                            }[];
                            /** Format: date-time */
                            created_at: string;
                            /** Format: uuid */
                            giren_id: string;
                            /** @description Yalnız öğretmen/yönetici yanıtlarında. */
                            gorunen_ad: string | null;
                            /** Format: uuid */
                            id: string;
                            /** @enum {string} */
                            kaynak: "ogrenci" | "ogretmen";
                            /** Format: uuid */
                            kural_id: string;
                            kural_kodu: string;
                            not: string | null;
                            /** Format: uuid */
                            ogrenci_id: string;
                            /** Format: date-time */
                            onay_at: string | null;
                            /** @enum {string} */
                            onay_durumu: "bekliyor" | "onaylandi" | "reddedildi";
                            /** Format: uuid */
                            onaylayan_id: string | null;
                            red_nedeni: string | null;
                            /** Format: date */
                            sinav_tarihi: string;
                            sure_dk: number | null;
                            surum: number;
                            toplam_net: number;
                            yanlis_katsayisi: number;
                            yayinevi: string | null;
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
    "/v1/ogrenme/kurumlar/{kurum_id}/denemeler/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Deneme detayi (bolumleriyle). Kapsam disi 404; ogrenci yalniz kendi sonucunu gorur. */
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
                            bolumler: {
                                bolum_kodu: string;
                                bos: number;
                                brans_kodu: string;
                                dogru: number;
                                /** @description Veritabanı üretilmiş değeri, 2 ondalık. */
                                net: number;
                                soru_sayisi: number;
                                yanlis: number;
                            }[];
                            /** Format: date-time */
                            created_at: string;
                            /** Format: uuid */
                            giren_id: string;
                            /** @description Yalnız öğretmen/yönetici yanıtlarında. */
                            gorunen_ad: string | null;
                            /** Format: uuid */
                            id: string;
                            /** @enum {string} */
                            kaynak: "ogrenci" | "ogretmen";
                            /** Format: uuid */
                            kural_id: string;
                            kural_kodu: string;
                            not: string | null;
                            /** Format: uuid */
                            ogrenci_id: string;
                            /** Format: date-time */
                            onay_at: string | null;
                            /** @enum {string} */
                            onay_durumu: "bekliyor" | "onaylandi" | "reddedildi";
                            /** Format: uuid */
                            onaylayan_id: string | null;
                            red_nedeni: string | null;
                            /** Format: date */
                            sinav_tarihi: string;
                            sure_dk: number | null;
                            surum: number;
                            toplam_net: number;
                            yanlis_katsayisi: number;
                            yayinevi: string | null;
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        /** Deneme sil (bolumleri ile). `surum` verilirse uyusmazlik 409. Ogrenci yalniz kendi onaylanmamis sonucunu siler. Gelisim ve ortalamalar bu sonucu icermez. */
        delete: {
            parameters: {
                query?: {
                    surum?: number;
                };
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
                    content?: never;
                };
            };
        };
        options?: never;
        head?: never;
        /** Deneme duzelt (iyimser kilit: `surum` zorunlu; uyusmazlik 409). `bolumler` verilirse tum bolumler tek islemde degisir ve `toplam_net` SUM(net) ile yenilenir. Ogrenci yalniz kendi onaylanmamis sonucunu duzeltir (red edilmis olan yeniden `bekliyor` olur). Duzeltme olay uretmez. */
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
                        /** @description Verilirse tüm bölümler bu liste ile değişir (tek işlemde). */
                        bolumler?: {
                            bolum_kodu: string;
                            /** @description Verilmezse `soru_sayisi - dogru - yanlis` hesaplanır; verilirse toplamı tutmalı. */
                            bos?: number;
                            dogru: number;
                            yanlis: number;
                        }[];
                        not?: string | null;
                        /** Format: date */
                        sinav_tarihi?: string;
                        sure_dk?: number | null;
                        surum: number;
                        yayinevi?: string | null;
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
                            bolumler: {
                                bolum_kodu: string;
                                bos: number;
                                brans_kodu: string;
                                dogru: number;
                                /** @description Veritabanı üretilmiş değeri, 2 ondalık. */
                                net: number;
                                soru_sayisi: number;
                                yanlis: number;
                            }[];
                            /** Format: date-time */
                            created_at: string;
                            /** Format: uuid */
                            giren_id: string;
                            /** @description Yalnız öğretmen/yönetici yanıtlarında. */
                            gorunen_ad: string | null;
                            /** Format: uuid */
                            id: string;
                            /** @enum {string} */
                            kaynak: "ogrenci" | "ogretmen";
                            /** Format: uuid */
                            kural_id: string;
                            kural_kodu: string;
                            not: string | null;
                            /** Format: uuid */
                            ogrenci_id: string;
                            /** Format: date-time */
                            onay_at: string | null;
                            /** @enum {string} */
                            onay_durumu: "bekliyor" | "onaylandi" | "reddedildi";
                            /** Format: uuid */
                            onaylayan_id: string | null;
                            red_nedeni: string | null;
                            /** Format: date */
                            sinav_tarihi: string;
                            sure_dk: number | null;
                            surum: number;
                            toplam_net: number;
                            yanlis_katsayisi: number;
                            yayinevi: string | null;
                        };
                    };
                };
            };
        };
        trace?: never;
    };
    "/v1/ogrenme/kurumlar/{kurum_id}/denemeler/{id}/onay": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Ogrencinin girdigi sonucu onayla: bu anda `ogrenme.deneme.girildi.v1` ayni islemde outbox a yazilir. Zaten onayliysa etkisiz (200, olay yok); reddedilmisse 409. */
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
                            bolumler: {
                                bolum_kodu: string;
                                bos: number;
                                brans_kodu: string;
                                dogru: number;
                                /** @description Veritabanı üretilmiş değeri, 2 ondalık. */
                                net: number;
                                soru_sayisi: number;
                                yanlis: number;
                            }[];
                            /** Format: date-time */
                            created_at: string;
                            /** Format: uuid */
                            giren_id: string;
                            /** @description Yalnız öğretmen/yönetici yanıtlarında. */
                            gorunen_ad: string | null;
                            /** Format: uuid */
                            id: string;
                            /** @enum {string} */
                            kaynak: "ogrenci" | "ogretmen";
                            /** Format: uuid */
                            kural_id: string;
                            kural_kodu: string;
                            not: string | null;
                            /** Format: uuid */
                            ogrenci_id: string;
                            /** Format: date-time */
                            onay_at: string | null;
                            /** @enum {string} */
                            onay_durumu: "bekliyor" | "onaylandi" | "reddedildi";
                            /** Format: uuid */
                            onaylayan_id: string | null;
                            red_nedeni: string | null;
                            /** Format: date */
                            sinav_tarihi: string;
                            sure_dk: number | null;
                            surum: number;
                            toplam_net: number;
                            yanlis_katsayisi: number;
                            yayinevi: string | null;
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
    "/v1/ogrenme/kurumlar/{kurum_id}/denemeler/{id}/red": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Ogrencinin girdigi sonucu reddet (`red_nedeni` zorunlu). Olay uretilmez; sonuc gelisim ve ortalamalara girmez. Ogrenci duzeltince yeniden `bekliyor` olur. Zaten reddedilmisse etkisiz; onayliysa 409. */
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
                        red_nedeni: string;
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
                            bolumler: {
                                bolum_kodu: string;
                                bos: number;
                                brans_kodu: string;
                                dogru: number;
                                /** @description Veritabanı üretilmiş değeri, 2 ondalık. */
                                net: number;
                                soru_sayisi: number;
                                yanlis: number;
                            }[];
                            /** Format: date-time */
                            created_at: string;
                            /** Format: uuid */
                            giren_id: string;
                            /** @description Yalnız öğretmen/yönetici yanıtlarında. */
                            gorunen_ad: string | null;
                            /** Format: uuid */
                            id: string;
                            /** @enum {string} */
                            kaynak: "ogrenci" | "ogretmen";
                            /** Format: uuid */
                            kural_id: string;
                            kural_kodu: string;
                            not: string | null;
                            /** Format: uuid */
                            ogrenci_id: string;
                            /** Format: date-time */
                            onay_at: string | null;
                            /** @enum {string} */
                            onay_durumu: "bekliyor" | "onaylandi" | "reddedildi";
                            /** Format: uuid */
                            onaylayan_id: string | null;
                            red_nedeni: string | null;
                            /** Format: date */
                            sinav_tarihi: string;
                            sure_dk: number | null;
                            surum: number;
                            toplam_net: number;
                            yanlis_katsayisi: number;
                            yayinevi: string | null;
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
    "/v1/ogrenme/kurumlar/{kurum_id}/denemeler/excel": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Excel yukleme: govde HAM .xlsx (Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet), en fazla 2 MB ve 500 satir; deneme adi/tarihi/kural sorgu parametresidir. Ogrenci `ogrenci_id`, yoksa `ogrenci_no` ile eslesir (ad yalniz bilgi). Formul hucresi ve sayi olmayan puan satir hatasidir; HEPSI YA DA HIC: hata varsa 422 `toplu_giris_hatali` ve `details.hatalar` (satir = sayfadaki satir numarasi). Puansiz satirlar atlanir. Bozuk/buyuk dosya 422 `excel_gecersiz` / 413. */
        post: {
            parameters: {
                query: {
                    ad: string;
                    /** @description Verilirse satırdaki öğrenciler bu grubun üyesi olmalı. */
                    grup_id?: string;
                    kural: string;
                    sinav_tarihi: string;
                    sure_dk?: number;
                    yayinevi?: string;
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
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @description Excel yüklemede öğrenci kimliği olup hiç puan girilmemiş (atlanan) satırlar; toplu girişte 0. */
                            atlanan_satir_sayisi: number;
                            denemeler: {
                                /** Format: uuid */
                                deneme_id: string;
                                /** Format: uuid */
                                ogrenci_id: string;
                                toplam_net: number;
                            }[];
                            olusturulan_sayisi: number;
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
    "/v1/ogrenme/kurumlar/{kurum_id}/denemeler/sablon.xlsx": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Excel sablonu (.xlsx): `Veri` sayfasi (ogrenci_id, ogrenci_no, ad + her bolum icin `<bolum_kodu>_dogru/_yanlis`) ve `Bilgi` sayfasi. `grup_id` verilirse grubun etkin ogrencileriyle on dolu gelir. Deneme adi ve tarihi yukleme isteginde verilir. */
        get: {
            parameters: {
                query: {
                    /** @description Verilirse şablon bu grubun öğrencileriyle ön doldurulur. */
                    grup_id?: string;
                    /** @description Kural kodu (en yeni aktif sürüm). */
                    kural: string;
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
    "/v1/ogrenme/kurumlar/{kurum_id}/denemeler/toplu": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Tablo gorunumunden toplu giris: bir deneme + N ogrenci (en fazla 500), HEPSI YA DA HIC. Hata varsa 422 `toplu_giris_hatali` ve `details.hatalar` (satir bazli: satir, ogrenci_id, kod, mesaj). Basarida her ogrenci icin onayli deneme ve olay. */
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
                        /**
                         * Format: uuid
                         * @description Belirli kural sürümü. Yoksa `kural_kodu`nun en yeni aktif sürümü.
                         */
                        kural_id?: string;
                        kural_kodu?: string;
                        satirlar: {
                            bolumler: {
                                bolum_kodu: string;
                                /** @description Verilmezse `soru_sayisi - dogru - yanlis` hesaplanır; verilirse toplamı tutmalı. */
                                bos?: number;
                                dogru: number;
                                yanlis: number;
                            }[];
                            not?: string;
                            /** Format: uuid */
                            ogrenci_id: string;
                        }[];
                        /** Format: date */
                        sinav_tarihi: string;
                        sure_dk?: number;
                        yayinevi?: string;
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
                            /** @description Excel yüklemede öğrenci kimliği olup hiç puan girilmemiş (atlanan) satırlar; toplu girişte 0. */
                            atlanan_satir_sayisi: number;
                            denemeler: {
                                /** Format: uuid */
                                deneme_id: string;
                                /** Format: uuid */
                                ogrenci_id: string;
                                toplam_net: number;
                            }[];
                            olusturulan_sayisi: number;
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
    "/v1/ogrenme/kurumlar/{kurum_id}/denemelerim": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Ogrencinin kendi denemeleri (onay durumu ve red nedeniyle, tum durumlar). Yalniz ogrenci rolu; baskasinin sonucu donmez. */
        get: {
            parameters: {
                query?: {
                    imlec?: string;
                    kural?: string;
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
                            denemeler: {
                                ad: string;
                                bolumler: {
                                    bolum_kodu: string;
                                    bos: number;
                                    brans_kodu: string;
                                    dogru: number;
                                    /** @description Veritabanı üretilmiş değeri, 2 ondalık. */
                                    net: number;
                                    soru_sayisi: number;
                                    yanlis: number;
                                }[];
                                /** Format: date-time */
                                created_at: string;
                                /** Format: uuid */
                                giren_id: string;
                                /** @description Yalnız öğretmen/yönetici yanıtlarında. */
                                gorunen_ad: string | null;
                                /** Format: uuid */
                                id: string;
                                /** @enum {string} */
                                kaynak: "ogrenci" | "ogretmen";
                                /** Format: uuid */
                                kural_id: string;
                                kural_kodu: string;
                                not: string | null;
                                /** Format: uuid */
                                ogrenci_id: string;
                                /** Format: date-time */
                                onay_at: string | null;
                                /** @enum {string} */
                                onay_durumu: "bekliyor" | "onaylandi" | "reddedildi";
                                /** Format: uuid */
                                onaylayan_id: string | null;
                                red_nedeni: string | null;
                                /** Format: date */
                                sinav_tarihi: string;
                                sure_dk: number | null;
                                surum: number;
                                toplam_net: number;
                                yanlis_katsayisi: number;
                                yayinevi: string | null;
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
    "/v1/ogrenme/kurumlar/{kurum_id}/gelen-sorular": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Cevap bekleyen sorular (varsayilan `acik` + `takip_bekliyor`): kendisine atananlar, uyesi oldugu masalardakiler (masada baskasi ustlendiyse hayir); sahip/yonetici icin yonetici kuyrugu da. En eski once; brans ve ogrenci suzgeci; imleçli. */
        get: {
            parameters: {
                query?: {
                    brans_kodu?: string;
                    /** @description Verilmezse cevap bekleyenler (`acik` ve `takip_bekliyor`). */
                    durum?: "acik" | "cevaplandi" | "takip_bekliyor" | "cozuldu" | "kapandi";
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
                            sonraki_imlec: string | null;
                            sorular: {
                                /** Format: uuid */
                                atanan_ogretmen_id: string | null;
                                baslik: string | null;
                                brans_kodu: string;
                                /** Format: date-time */
                                cozuldu_at: string | null;
                                /** Format: date-time */
                                created_at: string;
                                /** @enum {string} */
                                durum: "acik" | "cevaplandi" | "takip_bekliyor" | "cozuldu" | "kapandi";
                                /** Format: uuid */
                                id: string;
                                /** Format: date-time */
                                ilk_cevap_at: string | null;
                                /** Format: uuid */
                                konu_id: string | null;
                                /** Format: uuid */
                                masa_id: string | null;
                                mesaj_sayisi: number;
                                metin_onizleme: string | null;
                                ogrenci_adi: string | null;
                                /** Format: uuid */
                                ogrenci_id: string;
                                /** Format: date-time */
                                son_hareket_at: string;
                                /** Format: uuid */
                                ustlenen_id: string | null;
                                /** @enum {string} */
                                yonlendirme: "atanan_ogretmen" | "masa" | "yonetici";
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
    "/v1/ogrenme/kurumlar/{kurum_id}/gelen-sorular/sayi": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Cevap bekleyen soru sayisi (toplam ve brans kirilimi) ve en eski bekleyenin zamani. */
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
                            bekleyen: number;
                            branslar: {
                                bekleyen: number;
                                brans_kodu: string;
                            }[];
                            /** Format: date-time */
                            en_eski_at: string | null;
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
    "/v1/ogrenme/kurumlar/{kurum_id}/gorevler/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** Gorevi sil. Yalniz yayin oncesi (taslak plan) ya da gerceklesen girilmemisse; baska gune devredilmis gorev de silinemez (409 `gorev_silinemez`). */
        delete: {
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
                    content?: never;
                };
            };
        };
        options?: never;
        head?: never;
        /** Gorevin hedef alanlarini duzenle (gun, ders, konu, baslik, hedef, sira). Gerceklesen miktar bu uctan yazilmaz. Hedef degisince gerceklesen girilmisse durum yeniden hesaplanir. Devredilmis gorev 409. Iyimser kilit: `surum`. */
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
                        brans_kodu?: string;
                        /** Format: date */
                        gun?: string;
                        hedef_miktar?: number;
                        /** @enum {string} */
                        hedef_turu?: "soru" | "dakika";
                        /** Format: uuid */
                        konu_id?: string | null;
                        sira?: number;
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
                            baslik: string | null;
                            brans_kodu: string;
                            /** Format: uuid */
                            devreden_gorev_id: string | null;
                            /** @enum {string} */
                            durum: "bekliyor" | "tamam" | "kismen" | "yapilmadi" | "devredildi";
                            gerceklesen_miktar: number | null;
                            /** Format: date */
                            gun: string;
                            /** Format: date */
                            hafta_baslangic: string;
                            hedef_miktar: number;
                            /** @enum {string} */
                            hedef_turu: "soru" | "dakika";
                            /** Format: uuid */
                            id: string;
                            /** Format: uuid */
                            konu_id: string | null;
                            /** Format: uuid */
                            ogrenci_id: string;
                            /** Format: uuid */
                            plan_id: string;
                            sira: number;
                            surum: number;
                            /** Format: date-time */
                            tamamlandi_at: string | null;
                        };
                    };
                };
            };
        };
        trace?: never;
    };
    "/v1/ogrenme/kurumlar/{kurum_id}/gorevler/{id}/devret": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Tamamlanmayan gorevi sonraki gune tasi (ogrenci onerir, ogretmen plandan gorur). `hedef_gun` verilmezse gorevin gunuden bir sonraki gun, en cok 7 gun sonrasi (degilse 422); Pazar ise sonraki haftanin plani (yoksa yayinda acilir). Yeni gorev: hedef = kalan (en az 1), `devreden_gorev_id` dolu; eski gorev `devredildi`. Ayni gorev tekrar devredilemez (409 `gorev_zaten_devredildi`). */
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
                         * Format: date
                         * @description Verilmezse gorevin gununden bir sonraki gun.
                         */
                        hedef_gun?: string;
                        surum?: number;
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
                            eski: {
                                baslik: string | null;
                                brans_kodu: string;
                                /** Format: uuid */
                                devreden_gorev_id: string | null;
                                /** @enum {string} */
                                durum: "bekliyor" | "tamam" | "kismen" | "yapilmadi" | "devredildi";
                                gerceklesen_miktar: number | null;
                                /** Format: date */
                                gun: string;
                                /** Format: date */
                                hafta_baslangic: string;
                                hedef_miktar: number;
                                /** @enum {string} */
                                hedef_turu: "soru" | "dakika";
                                /** Format: uuid */
                                id: string;
                                /** Format: uuid */
                                konu_id: string | null;
                                /** Format: uuid */
                                ogrenci_id: string;
                                /** Format: uuid */
                                plan_id: string;
                                sira: number;
                                surum: number;
                                /** Format: date-time */
                                tamamlandi_at: string | null;
                            };
                            yeni: {
                                baslik: string | null;
                                brans_kodu: string;
                                /** Format: uuid */
                                devreden_gorev_id: string | null;
                                /** @enum {string} */
                                durum: "bekliyor" | "tamam" | "kismen" | "yapilmadi" | "devredildi";
                                gerceklesen_miktar: number | null;
                                /** Format: date */
                                gun: string;
                                /** Format: date */
                                hafta_baslangic: string;
                                hedef_miktar: number;
                                /** @enum {string} */
                                hedef_turu: "soru" | "dakika";
                                /** Format: uuid */
                                id: string;
                                /** Format: uuid */
                                konu_id: string | null;
                                /** Format: uuid */
                                ogrenci_id: string;
                                /** Format: uuid */
                                plan_id: string;
                                sira: number;
                                surum: number;
                                /** Format: date-time */
                                tamamlandi_at: string | null;
                            };
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
    "/v1/ogrenme/kurumlar/{kurum_id}/gorevler/{id}/gerceklesen": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /** Ogrenci gerceklesen miktari girer (hedefi degistiremez). Durum sunucuda hesaplanir: >= hedef `tamam`, 0 < x < hedef `kismen`, 0 `yapilmadi`. Ayni deger tekrar yazilirsa hicbir sey degismez (surum artmaz, olay yok; cevrimdisi tekrar guvenli). Yalniz yayindaki kendi plani; kilitli hafta 409 `plan_kilitli`; devredilmis gorev 409. Iyimser kilit: `surum` (ayni deger tekrarinda aranmaz). */
        put: {
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
                        gerceklesen_miktar: number;
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
                            baslik: string | null;
                            brans_kodu: string;
                            /** Format: uuid */
                            devreden_gorev_id: string | null;
                            /** @enum {string} */
                            durum: "bekliyor" | "tamam" | "kismen" | "yapilmadi" | "devredildi";
                            gerceklesen_miktar: number | null;
                            /** Format: date */
                            gun: string;
                            /** Format: date */
                            hafta_baslangic: string;
                            hedef_miktar: number;
                            /** @enum {string} */
                            hedef_turu: "soru" | "dakika";
                            /** Format: uuid */
                            id: string;
                            /** Format: uuid */
                            konu_id: string | null;
                            /** Format: uuid */
                            ogrenci_id: string;
                            /** Format: uuid */
                            plan_id: string;
                            sira: number;
                            surum: number;
                            /** Format: date-time */
                            tamamlandi_at: string | null;
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
    "/v1/ogrenme/kurumlar/{kurum_id}/gorevlerim": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Bugun ekrani: ogrencinin o gunku gorevleri (yalniz yayindaki planlar; devredilenler haric). `gun` verilmezse bugun (Europe/Istanbul, sunucu saati). */
        get: {
            parameters: {
                query?: {
                    /** @description Verilmezse bugun (Europe/Istanbul, sunucu saati). */
                    gun?: string;
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
                            gorevler: {
                                baslik: string | null;
                                brans_kodu: string;
                                /** Format: uuid */
                                devreden_gorev_id: string | null;
                                /** @enum {string} */
                                durum: "bekliyor" | "tamam" | "kismen" | "yapilmadi" | "devredildi";
                                gerceklesen_miktar: number | null;
                                /** Format: date */
                                gun: string;
                                /** Format: date */
                                hafta_baslangic: string;
                                hedef_miktar: number;
                                /** @enum {string} */
                                hedef_turu: "soru" | "dakika";
                                /** Format: uuid */
                                id: string;
                                /** Format: uuid */
                                konu_id: string | null;
                                /** Format: uuid */
                                ogrenci_id: string;
                                /** Format: uuid */
                                plan_id: string;
                                sira: number;
                                surum: number;
                                /** Format: date-time */
                                tamamlandi_at: string | null;
                            }[];
                            /** Format: date */
                            gun: string;
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
    "/v1/ogrenme/kurumlar/{kurum_id}/gruplar/{id}/deneme-ozet": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Grup deneme ozeti (yalniz ogretmen/yonetici; ogrenciye kapali 403): ogrenci basina deneme sayisi, son net ve son 5 ortalamasi; sinif ortalamasi (ogrencilerin son 5 ortalamalarinin ortalamasi) ve bolum ortalamalari. Yalniz onayli sonuclar; hesaplama SQL de. */
        get: {
            parameters: {
                query: {
                    kural: string;
                };
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
                            bolum_ortalamalari: {
                                bolum_kodu: string;
                                brans_kodu: string;
                                ortalama: number;
                            }[];
                            denemesi_olan_sayisi: number;
                            /** Format: uuid */
                            grup_id: string;
                            kural_kodu: string;
                            ogrenci_sayisi: number;
                            ogrenciler: {
                                deneme_sayisi: number;
                                gorunen_ad: string | null;
                                /** Format: uuid */
                                ogrenci_id: string;
                                son_net: number | null;
                                son5_ortalama: number | null;
                            }[];
                            /** @description Öğrencilerin son 5 onaylı deneme ortalamalarının ortalaması. */
                            sinif_ortalamasi: number | null;
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
    "/v1/ogrenme/kurumlar/{kurum_id}/gunluk-soru/analiz": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Ogrencinin kendi konu x zorluk analizi (ders + `donem` 7/30/donem ya da `bas`/`bit`). Kaynaklar: gunluk kayitlar ve konulu odev teslimleri (zorluk "belirtilmemis"). Ogrenci yanitinda ONERI YOKTUR. */
        get: {
            parameters: {
                query: {
                    bas?: string;
                    bit?: string;
                    brans_kodu: string;
                    donem?: "7" | "30" | "donem";
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
                            /** Format: date */
                            bas: string;
                            /** Format: date */
                            bit: string;
                            brans_kodu: string;
                            konular: {
                                bant: {
                                    /** @enum {string|null} */
                                    bant: "kolay" | "orta" | "zor" | null;
                                    bant_basarilari: {
                                        kolay: number | null;
                                        orta: number | null;
                                        zor: number | null;
                                    };
                                    /** @enum {string} */
                                    durum: "veri_az" | "tespit_yok" | "zorlaniyor";
                                };
                                hucreler: {
                                    belirtilmemis: {
                                        basari: number | null;
                                        bos: number;
                                        cozulen: number;
                                        dogru: number;
                                        yanlis: number;
                                    };
                                    kolay: {
                                        basari: number | null;
                                        bos: number;
                                        cozulen: number;
                                        dogru: number;
                                        yanlis: number;
                                    };
                                    orta: {
                                        basari: number | null;
                                        bos: number;
                                        cozulen: number;
                                        dogru: number;
                                        yanlis: number;
                                    };
                                    zor: {
                                        basari: number | null;
                                        bos: number;
                                        cozulen: number;
                                        dogru: number;
                                        yanlis: number;
                                    };
                                };
                                konu_ad: string | null;
                                /** Format: uuid */
                                konu_id: string;
                                toplam: {
                                    basari: number | null;
                                    bos: number;
                                    cozulen: number;
                                    dogru: number;
                                    yanlis: number;
                                };
                                ust_konu_ad: string | null;
                            }[];
                            /** Format: uuid */
                            ogrenci_id: string;
                            oneriler?: ({
                                basari: number | null;
                                brans_kodu: string;
                                konu_ad: string | null;
                                /** Format: uuid */
                                konu_id: string;
                                soru_sayisi: number;
                                /** @enum {string} */
                                tur: "gorev_oner";
                                /** @enum {string} */
                                zorluk: "kolay" | "orta" | "zor";
                            } | {
                                brans_kodu: string;
                                konu_ad: string | null;
                                /** Format: uuid */
                                konu_id: string;
                                onceki_hafta_basari: number | null;
                                son_hafta_basari: number | null;
                                /** @enum {string} */
                                tur: "birebir_ders";
                                zor_basari: number;
                            })[];
                            toplam: {
                                basari: number | null;
                                bos: number;
                                cozulen: number;
                                dogru: number;
                                yanlis: number;
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
    "/v1/ogrenme/kurumlar/{kurum_id}/gunluk-soru/analiz/hucre": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Ogrencinin kendi hucre ayrintisi: konu (ve zorluk) icin kayitlar ve fotograflar. */
        get: {
            parameters: {
                query: {
                    bas?: string;
                    bit?: string;
                    brans_kodu: string;
                    donem?: "7" | "30" | "donem";
                    konu_id: string;
                    zorluk?: "kolay" | "orta" | "zor" | "belirtilmemis";
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
                            fotograf_adresleri_alinamadi: boolean;
                            kayitlar: {
                                bos: number;
                                dogru: number;
                                dosyalar: {
                                    adres: {
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
                                    } | null;
                                    /** Format: uuid */
                                    medya_dosya_id: string;
                                }[];
                                /** Format: date */
                                gun: string;
                                /** Format: uuid */
                                id: string;
                                /** @enum {string} */
                                kaynak: "gunluk" | "odev";
                                kaynak_adi: string | null;
                                toplam: number;
                                yanlis: number;
                                /** @enum {string} */
                                zorluk: "kolay" | "orta" | "zor" | "belirtilmemis";
                            }[];
                            /** Format: uuid */
                            konu_id: string;
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
    "/v1/ogrenme/kurumlar/{kurum_id}/gunluk-soru/kayitlar": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Ogrencinin kendi kayitlari, en yeni once. `gun` (tek gun) ya da `bas`/`bit` (varsayilan son 30 gun), `brans_kodu`; imlec sayfalama (`sonraki_imlec`). */
        get: {
            parameters: {
                query?: {
                    bas?: string;
                    bit?: string;
                    brans_kodu?: string;
                    gun?: string;
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
                            kayitlar: {
                                bos: number;
                                brans_kodu: string;
                                /** Format: date-time */
                                created_at: string;
                                dogru: number;
                                dosyalar: {
                                    /** Format: uuid */
                                    medya_dosya_id: string;
                                    sira: number;
                                }[];
                                duzenlenebilir: boolean;
                                /** Format: date */
                                gun: string;
                                /** Format: uuid */
                                id: string;
                                /** Format: uuid */
                                kaynak_kitap_id: string | null;
                                kaynak_metin: string | null;
                                /** Format: uuid */
                                kaynak_test_id: string | null;
                                konu_ad: string | null;
                                /** Format: uuid */
                                konu_id: string;
                                /** Format: uuid */
                                ogrenci_id: string;
                                /** Format: uuid */
                                plan_gorev_id: string | null;
                                surum: number;
                                toplam: number;
                                yanlis: number;
                                /** @enum {string} */
                                zorluk: "kolay" | "orta" | "zor";
                            }[];
                            sonraki_imlec: string | null;
                        };
                    };
                };
            };
        };
        put?: never;
        /** Gunluk soru kaydi olustur (ogrenci). `istek_id` ayni ogrenci icin tekrar gelirse yeni kayit acilmaz, mevcut kayit 200 ile doner (cevrimdisi tekrar guvenli). `gun` verilmezse bugun (Europe/Istanbul); en cok 6 gun geriye, gelecek 422 `gun_gecersiz`. Konu dersin konusu olmali (422 `konu_gecersiz`); kaynak testi ya da serbest metin (ikisi birden olmaz); `plan_gorev_id` verilirse gorevin gerceklesen miktari kaydin toplami kadar artar. Fotograflar `gunluk_soru_fotografi` turunde, hazir ve ogrencinin kendi dosyalaridir (409 `dosya_hazir_degil`, `dosya_zaten_bagli`). Ayni islemde `ogrenme.gunluk_soru.kaydedildi.v1` (XP). */
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
                        bos: number;
                        brans_kodu: string;
                        dogru: number;
                        /** @default [] */
                        dosya_idleri?: string[];
                        /** Format: date */
                        gun?: string;
                        /** Format: uuid */
                        istek_id?: string;
                        kaynak_metin?: string | null;
                        /** Format: uuid */
                        kaynak_test_id?: string | null;
                        /** Format: uuid */
                        konu_id: string;
                        /** Format: uuid */
                        plan_gorev_id?: string | null;
                        yanlis: number;
                        /** @enum {string} */
                        zorluk: "kolay" | "orta" | "zor";
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
                            bos: number;
                            brans_kodu: string;
                            /** Format: date-time */
                            created_at: string;
                            dogru: number;
                            dosyalar: {
                                /** Format: uuid */
                                medya_dosya_id: string;
                                sira: number;
                            }[];
                            duzenlenebilir: boolean;
                            /** Format: date */
                            gun: string;
                            /** Format: uuid */
                            id: string;
                            /** Format: uuid */
                            kaynak_kitap_id: string | null;
                            kaynak_metin: string | null;
                            /** Format: uuid */
                            kaynak_test_id: string | null;
                            konu_ad: string | null;
                            /** Format: uuid */
                            konu_id: string;
                            /** Format: uuid */
                            ogrenci_id: string;
                            /** Format: uuid */
                            plan_gorev_id: string | null;
                            surum: number;
                            toplam: number;
                            yanlis: number;
                            /** @enum {string} */
                            zorluk: "kolay" | "orta" | "zor";
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
                            bos: number;
                            brans_kodu: string;
                            /** Format: date-time */
                            created_at: string;
                            dogru: number;
                            dosyalar: {
                                /** Format: uuid */
                                medya_dosya_id: string;
                                sira: number;
                            }[];
                            duzenlenebilir: boolean;
                            /** Format: date */
                            gun: string;
                            /** Format: uuid */
                            id: string;
                            /** Format: uuid */
                            kaynak_kitap_id: string | null;
                            kaynak_metin: string | null;
                            /** Format: uuid */
                            kaynak_test_id: string | null;
                            konu_ad: string | null;
                            /** Format: uuid */
                            konu_id: string;
                            /** Format: uuid */
                            ogrenci_id: string;
                            /** Format: uuid */
                            plan_gorev_id: string | null;
                            surum: number;
                            toplam: number;
                            yanlis: number;
                            /** @enum {string} */
                            zorluk: "kolay" | "orta" | "zor";
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
    "/v1/ogrenme/kurumlar/{kurum_id}/gunluk-soru/kayitlar/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** Kaydi sil (yalniz ogrencinin kendi kaydi ve yalniz girildigi gun icinde; sonra 409 `kayit_duzenlenemez`). Fotograflar birakilir (medyada silinir), bagli plan gorevinin gerceklesen miktari azalir, XP ters kayit olarak geri alinir (`silindi=true` olayi). */
        delete: {
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
        /** Kaydi duzelt (yalniz ogrencinin kendi kaydi ve yalniz girildigi gun icinde; sonra 409 `kayit_duzenlenemez`). Verilen alanlar degisir; `dosya_idleri` verilirse fotograf kumesi o liste olur. Iyimser kilit: `surum`. XP olayi ayni islemde yayimlanir (eski XP ters cevrilir, yeni deger yeniden hesaplanir). */
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
                        bos?: number;
                        brans_kodu?: string;
                        dogru?: number;
                        dosya_idleri?: string[];
                        kaynak_metin?: string | null;
                        /** Format: uuid */
                        kaynak_test_id?: string | null;
                        /** Format: uuid */
                        konu_id?: string;
                        /** Format: uuid */
                        plan_gorev_id?: string | null;
                        surum?: number;
                        yanlis?: number;
                        /** @enum {string} */
                        zorluk?: "kolay" | "orta" | "zor";
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
                            bos: number;
                            brans_kodu: string;
                            /** Format: date-time */
                            created_at: string;
                            dogru: number;
                            dosyalar: {
                                /** Format: uuid */
                                medya_dosya_id: string;
                                sira: number;
                            }[];
                            duzenlenebilir: boolean;
                            /** Format: date */
                            gun: string;
                            /** Format: uuid */
                            id: string;
                            /** Format: uuid */
                            kaynak_kitap_id: string | null;
                            kaynak_metin: string | null;
                            /** Format: uuid */
                            kaynak_test_id: string | null;
                            konu_ad: string | null;
                            /** Format: uuid */
                            konu_id: string;
                            /** Format: uuid */
                            ogrenci_id: string;
                            /** Format: uuid */
                            plan_gorev_id: string | null;
                            surum: number;
                            toplam: number;
                            yanlis: number;
                            /** @enum {string} */
                            zorluk: "kolay" | "orta" | "zor";
                        };
                    };
                };
            };
        };
        trace?: never;
    };
    "/v1/ogrenme/kurumlar/{kurum_id}/gunluk-soru/sinif-analizi": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Grup/sinif gorunumu: konu bazinda toplam ve zorluk dagilimi, konuda kayit giren ve zorlanan ogrenci sayisi, en cok zorlanilan konular (en az 10 soru, basari < %70). Ogretmen yalniz atandigi grubu (disi 404). */
        get: {
            parameters: {
                query: {
                    bas?: string;
                    bit?: string;
                    brans_kodu: string;
                    donem?: "7" | "30" | "donem";
                    grup_id: string;
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
                            /** Format: date */
                            bas: string;
                            /** Format: date */
                            bit: string;
                            brans_kodu: string;
                            en_cok_zorlanilan: {
                                hucreler: {
                                    belirtilmemis: {
                                        basari: number | null;
                                        bos: number;
                                        cozulen: number;
                                        dogru: number;
                                        yanlis: number;
                                    };
                                    kolay: {
                                        basari: number | null;
                                        bos: number;
                                        cozulen: number;
                                        dogru: number;
                                        yanlis: number;
                                    };
                                    orta: {
                                        basari: number | null;
                                        bos: number;
                                        cozulen: number;
                                        dogru: number;
                                        yanlis: number;
                                    };
                                    zor: {
                                        basari: number | null;
                                        bos: number;
                                        cozulen: number;
                                        dogru: number;
                                        yanlis: number;
                                    };
                                };
                                konu_ad: string | null;
                                /** Format: uuid */
                                konu_id: string;
                                ogrenci_sayisi: number;
                                toplam: {
                                    basari: number | null;
                                    bos: number;
                                    cozulen: number;
                                    dogru: number;
                                    yanlis: number;
                                };
                                zorlanan_ogrenci_sayisi: number;
                            }[];
                            /** Format: uuid */
                            grup_id: string;
                            konular: {
                                hucreler: {
                                    belirtilmemis: {
                                        basari: number | null;
                                        bos: number;
                                        cozulen: number;
                                        dogru: number;
                                        yanlis: number;
                                    };
                                    kolay: {
                                        basari: number | null;
                                        bos: number;
                                        cozulen: number;
                                        dogru: number;
                                        yanlis: number;
                                    };
                                    orta: {
                                        basari: number | null;
                                        bos: number;
                                        cozulen: number;
                                        dogru: number;
                                        yanlis: number;
                                    };
                                    zor: {
                                        basari: number | null;
                                        bos: number;
                                        cozulen: number;
                                        dogru: number;
                                        yanlis: number;
                                    };
                                };
                                konu_ad: string | null;
                                /** Format: uuid */
                                konu_id: string;
                                ogrenci_sayisi: number;
                                toplam: {
                                    basari: number | null;
                                    bos: number;
                                    cozulen: number;
                                    dogru: number;
                                    yanlis: number;
                                };
                                zorlanan_ogrenci_sayisi: number;
                            }[];
                            ogrenci_sayisi: number;
                            toplam: {
                                basari: number | null;
                                bos: number;
                                cozulen: number;
                                dogru: number;
                                yanlis: number;
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
    "/v1/ogrenme/kurumlar/{kurum_id}/gunluk-soru/son-kullanilanlar": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Ogrencinin son kullandigi ders, konu ve kaynaklar (15 sn kalite citasi: kayit formu once bunlari sunar). Son 60 gun; en yeni kullanilan ders once; her ders icin en cok 5 konu ve 5 kaynak. */
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
                            dersler: {
                                brans_kodu: string;
                                kaynaklar: {
                                    /** Format: uuid */
                                    kaynak_kitap_id: string | null;
                                    kaynak_metin: string | null;
                                    /** Format: uuid */
                                    kaynak_test_id: string | null;
                                    kitap_ad: string | null;
                                    test_ad: string | null;
                                }[];
                                konular: {
                                    konu_ad: string | null;
                                    /** Format: uuid */
                                    konu_id: string;
                                    /** @enum {string} */
                                    son_zorluk: "kolay" | "orta" | "zor";
                                }[];
                                /** Format: date-time */
                                son_kullanildi_at: string;
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
    "/v1/ogrenme/kurumlar/{kurum_id}/kaynak-kitaplar": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Kaynak kitap listesi (ders adina gore). Ogrenci yalniz aktifleri gorur ve `ilerleme` (cozulen test / toplam test) kendi kayitlarindan hesaplanir; personel `pasifler=true` ile pasifleri de gorur, `ogrenci_id` (kapsamdaki ogrenci) verirse ilerleme o ogrenci icindir. */
        get: {
            parameters: {
                query?: {
                    brans_kodu?: string;
                    ogrenci_id?: string;
                    pasifler?: boolean;
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
                            kitaplar: {
                                ad: string;
                                aktif: boolean;
                                brans_kodu: string;
                                /** Format: date-time */
                                created_at: string;
                                /** Format: uuid */
                                id: string;
                                ilerleme: {
                                    cozulen_test: number;
                                    toplam_test: number;
                                } | null;
                                /** Format: uuid */
                                kademe_id: string | null;
                                /** Format: uuid */
                                sahip_uyelik_id: string | null;
                                surum: number;
                                test_sayisi: number;
                                toplam_soru: number;
                                yayinevi: string | null;
                            }[];
                        };
                    };
                };
            };
        };
        put?: never;
        /** Kaynak kitap tanimla (ad, yayinevi, ders, test/bolum listesi ve soru sayilari). Ogretmen kendi adina (`sahip_uyelik_id`), sahip/yonetici kurum tanimi olarak (`null`) ekler. Kitabin icerigi/PDF yuklenmez (telif). */
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
                        /** Format: uuid */
                        kademe_id?: string | null;
                        /** @default [] */
                        testler?: {
                            ad: string;
                            /** Format: uuid */
                            konu_id?: string | null;
                            soru_sayisi: number;
                        }[];
                        yayinevi?: string | null;
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
                            brans_kodu: string;
                            /** Format: date-time */
                            created_at: string;
                            /** Format: uuid */
                            id: string;
                            ilerleme: {
                                cozulen_test: number;
                                toplam_test: number;
                            } | null;
                            /** Format: uuid */
                            kademe_id: string | null;
                            /** Format: uuid */
                            sahip_uyelik_id: string | null;
                            surum: number;
                            test_sayisi: number;
                            testler: {
                                ad: string;
                                /** Format: date */
                                cozuldu_gun?: string | null;
                                /** Format: uuid */
                                id: string;
                                /** Format: uuid */
                                kitap_id: string;
                                /** Format: uuid */
                                konu_id: string | null;
                                sira: number;
                                soru_sayisi: number;
                            }[];
                            toplam_soru: number;
                            yayinevi: string | null;
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
    "/v1/ogrenme/kurumlar/{kurum_id}/kaynak-kitaplar/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Kitap ve testleri. Ogrenci rolunde (ya da personelde `ogrenci_id` ile) her testin `cozuldu_gun` (ilk cozum gunu) ve kitap `ilerleme`si dolar. */
        get: {
            parameters: {
                query?: {
                    ogrenci_id?: string;
                };
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
                            aktif: boolean;
                            brans_kodu: string;
                            /** Format: date-time */
                            created_at: string;
                            /** Format: uuid */
                            id: string;
                            ilerleme: {
                                cozulen_test: number;
                                toplam_test: number;
                            } | null;
                            /** Format: uuid */
                            kademe_id: string | null;
                            /** Format: uuid */
                            sahip_uyelik_id: string | null;
                            surum: number;
                            test_sayisi: number;
                            testler: {
                                ad: string;
                                /** Format: date */
                                cozuldu_gun?: string | null;
                                /** Format: uuid */
                                id: string;
                                /** Format: uuid */
                                kitap_id: string;
                                /** Format: uuid */
                                konu_id: string | null;
                                sira: number;
                                soru_sayisi: number;
                            }[];
                            toplam_soru: number;
                            yayinevi: string | null;
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
        /** Kitap adi, yayinevi, kademe ya da aktiflik (silme yerine `aktif=false`; eski kayitlar baglı kalir). Ogretmen yalniz kendi kitabini (baskasininki 403). Iyimser kilit: `surum`. */
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
                        aktif?: boolean;
                        /** Format: uuid */
                        kademe_id?: string | null;
                        surum?: number;
                        yayinevi?: string | null;
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
                            brans_kodu: string;
                            /** Format: date-time */
                            created_at: string;
                            /** Format: uuid */
                            id: string;
                            ilerleme: {
                                cozulen_test: number;
                                toplam_test: number;
                            } | null;
                            /** Format: uuid */
                            kademe_id: string | null;
                            /** Format: uuid */
                            sahip_uyelik_id: string | null;
                            surum: number;
                            test_sayisi: number;
                            toplam_soru: number;
                            yayinevi: string | null;
                        };
                    };
                };
            };
        };
        trace?: never;
    };
    "/v1/ogrenme/kurumlar/{kurum_id}/kaynak-kitaplar/{id}/testler": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Kitaba test/bolum ekle (toplu). Sira son siradan devam eder; kitap basina en cok 300 test. */
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
                        testler: {
                            ad: string;
                            /** Format: uuid */
                            konu_id?: string | null;
                            soru_sayisi: number;
                        }[];
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
                            brans_kodu: string;
                            /** Format: date-time */
                            created_at: string;
                            /** Format: uuid */
                            id: string;
                            ilerleme: {
                                cozulen_test: number;
                                toplam_test: number;
                            } | null;
                            /** Format: uuid */
                            kademe_id: string | null;
                            /** Format: uuid */
                            sahip_uyelik_id: string | null;
                            surum: number;
                            test_sayisi: number;
                            testler: {
                                ad: string;
                                /** Format: date */
                                cozuldu_gun?: string | null;
                                /** Format: uuid */
                                id: string;
                                /** Format: uuid */
                                kitap_id: string;
                                /** Format: uuid */
                                konu_id: string | null;
                                sira: number;
                                soru_sayisi: number;
                            }[];
                            toplam_soru: number;
                            yayinevi: string | null;
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
    "/v1/ogrenme/kurumlar/{kurum_id}/kaynak-kitaplar/{id}/testler/{test_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** Testi sil. Bir gunluk kayitta kullanilmissa 409 `kaynak_testi_kullanimda` (kitabi pasiflestirin). */
        delete: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                    kurum_id: string;
                    test_id: string;
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
        /** Test adini, soru sayisini ya da konusunu guncelle. */
        patch: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                    kurum_id: string;
                    test_id: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        ad?: string;
                        /** Format: uuid */
                        konu_id?: string | null;
                        soru_sayisi?: number;
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
                            cozuldu_gun?: string | null;
                            /** Format: uuid */
                            id: string;
                            /** Format: uuid */
                            kitap_id: string;
                            /** Format: uuid */
                            konu_id: string | null;
                            sira: number;
                            soru_sayisi: number;
                        };
                    };
                };
            };
        };
        trace?: never;
    };
    "/v1/ogrenme/kurumlar/{kurum_id}/kaynak-onerileri/{id}/geri-cek": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Kaynak onerisini geri cek (silme degil): oneren ya da sahip/yonetici; baskasi 403, kapsam disi 404. Tekrar cagri 200. */
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
                            baglanti_url: string | null;
                            basladi: boolean | null;
                            baslik: string | null;
                            benim: boolean;
                            brans_kodu: string | null;
                            /** Format: date-time */
                            created_at: string;
                            /** Format: date-time */
                            geri_cekildi_at: string | null;
                            /** Format: uuid */
                            id: string;
                            /** Format: date */
                            ilk_kullanim_gun: string | null;
                            kayit_sayisi: number;
                            kaynak_kitap_ad: string | null;
                            /** Format: uuid */
                            kaynak_kitap_id: string | null;
                            kaynak_test_ad: string | null;
                            /** Format: uuid */
                            kaynak_test_id: string | null;
                            konu_ad: string | null;
                            /** Format: uuid */
                            konu_id: string | null;
                            not: string | null;
                            /** Format: uuid */
                            ogrenci_id: string;
                            oneren_ad: string | null;
                            /** Format: uuid */
                            oneren_id: string;
                            /** Format: date */
                            son_kullanim_gun: string | null;
                            /** @enum {string} */
                            tur: "kaynak_kitap" | "kaynak_kitap_testi" | "link" | "serbest";
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
    "/v1/ogrenme/kurumlar/{kurum_id}/kaynak-onerilerim": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Ogrenci: kendisine onerilen (geri cekilmeyen) kaynaklar, en yeni once ("Ogretmenimin onerdikleri"). Tek dokunusla gunluk kayitta kaynak olarak secilir; `basladi` kendi kayitlarindan hesaplanir. */
        get: {
            parameters: {
                query?: {
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
                            oneriler: {
                                baglanti_url: string | null;
                                basladi: boolean | null;
                                baslik: string | null;
                                benim: boolean;
                                brans_kodu: string | null;
                                /** Format: date-time */
                                created_at: string;
                                /** Format: date-time */
                                geri_cekildi_at: string | null;
                                /** Format: uuid */
                                id: string;
                                /** Format: date */
                                ilk_kullanim_gun: string | null;
                                kayit_sayisi: number;
                                kaynak_kitap_ad: string | null;
                                /** Format: uuid */
                                kaynak_kitap_id: string | null;
                                kaynak_test_ad: string | null;
                                /** Format: uuid */
                                kaynak_test_id: string | null;
                                konu_ad: string | null;
                                /** Format: uuid */
                                konu_id: string | null;
                                not: string | null;
                                /** Format: uuid */
                                ogrenci_id: string;
                                oneren_ad: string | null;
                                /** Format: uuid */
                                oneren_id: string;
                                /** Format: date */
                                son_kullanim_gun: string | null;
                                /** @enum {string} */
                                tur: "kaynak_kitap" | "kaynak_kitap_testi" | "link" | "serbest";
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
    "/v1/ogrenme/kurumlar/{kurum_id}/odev-sablonlari": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Kendi odev sablonlarim (yeniden eskiye). */
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
                            sablonlar: {
                                aciklama: string | null;
                                baslik: string;
                                brans_kodu: string;
                                /** Format: date-time */
                                created_at: string;
                                hedef_soru_sayisi: number | null;
                                /** Format: uuid */
                                id: string;
                                kaynak: string | null;
                                /** Format: uuid */
                                konu_id: string | null;
                                /** Format: uuid */
                                ogretmen_id: string;
                                /** @enum {string} */
                                tur: "soru" | "sayfa" | "serbest";
                            }[];
                        };
                    };
                };
            };
        };
        put?: never;
        /** Odev sablonu olustur (hedef ve tarih icermez). */
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
                        aciklama?: string;
                        baslik: string;
                        brans_kodu: string;
                        hedef_soru_sayisi?: number;
                        kaynak?: string;
                        /** Format: uuid */
                        konu_id?: string;
                        /**
                         * @default soru
                         * @enum {string}
                         */
                        tur?: "soru" | "sayfa" | "serbest";
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
                            aciklama: string | null;
                            baslik: string;
                            brans_kodu: string;
                            /** Format: date-time */
                            created_at: string;
                            hedef_soru_sayisi: number | null;
                            /** Format: uuid */
                            id: string;
                            kaynak: string | null;
                            /** Format: uuid */
                            konu_id: string | null;
                            /** Format: uuid */
                            ogretmen_id: string;
                            /** @enum {string} */
                            tur: "soru" | "sayfa" | "serbest";
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
    "/v1/ogrenme/kurumlar/{kurum_id}/odev-sablonlari/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Tek sablon (baskasinin sablonu 404). */
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
                            aciklama: string | null;
                            baslik: string;
                            brans_kodu: string;
                            /** Format: date-time */
                            created_at: string;
                            hedef_soru_sayisi: number | null;
                            /** Format: uuid */
                            id: string;
                            kaynak: string | null;
                            /** Format: uuid */
                            konu_id: string | null;
                            /** Format: uuid */
                            ogretmen_id: string;
                            /** @enum {string} */
                            tur: "soru" | "sayfa" | "serbest";
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        /** Sablonu sil (olusturulmus odevler etkilenmez). */
        delete: {
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
                    content?: never;
                };
            };
        };
        options?: never;
        head?: never;
        /** Sablonu guncelle. */
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
                        aciklama?: string | null;
                        baslik?: string;
                        brans_kodu?: string;
                        hedef_soru_sayisi?: number | null;
                        kaynak?: string | null;
                        /** Format: uuid */
                        konu_id?: string | null;
                        /** @enum {string} */
                        tur?: "soru" | "sayfa" | "serbest";
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
                            baslik: string;
                            brans_kodu: string;
                            /** Format: date-time */
                            created_at: string;
                            hedef_soru_sayisi: number | null;
                            /** Format: uuid */
                            id: string;
                            kaynak: string | null;
                            /** Format: uuid */
                            konu_id: string | null;
                            /** Format: uuid */
                            ogretmen_id: string;
                            /** @enum {string} */
                            tur: "soru" | "sayfa" | "serbest";
                        };
                    };
                };
            };
        };
        trace?: never;
    };
    "/v1/ogrenme/kurumlar/{kurum_id}/odevler": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Odev listesi (sayfali, yeniden eskiye). Ogretmen yalniz kendi odevlerini, yonetici kapsamindaki hepsini gorur. */
        get: {
            parameters: {
                query?: {
                    brans_kodu?: string;
                    durum?: "taslak" | "yayinda" | "kapali";
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
                            odevler: {
                                aciklama: string | null;
                                atanan_sayisi: number;
                                baslik: string;
                                brans_kodu: string;
                                /** Format: date-time */
                                created_at: string;
                                /** @enum {string} */
                                durum: "taslak" | "yayinda" | "kapali";
                                /** @enum {string} */
                                fan_out_durum: "bekliyor" | "calisiyor" | "tamamlandi";
                                fotograf_gerekli: boolean;
                                /** Format: uuid */
                                hedef_id: string;
                                hedef_soru_sayisi: number | null;
                                /** @enum {string} */
                                hedef_turu: "ogrenci" | "grup" | "kademe" | "kurum";
                                /** Format: uuid */
                                id: string;
                                kaynak: string | null;
                                /** Format: uuid */
                                konu_id: string | null;
                                /** Format: date-time */
                                son_teslim_at: string | null;
                                surum: number;
                                /** @enum {string} */
                                tur: "soru" | "sayfa" | "serbest";
                                /** Format: uuid */
                                veren_id: string;
                                /** Format: date-time */
                                yayin_at: string | null;
                            }[];
                            sonraki_imlec: string | null;
                        };
                    };
                };
            };
        };
        put?: never;
        /** Odev olustur (taslak). Ogretmen yalniz atandigi grup/ogrenciye verir; kademe ve kurum hedefi sahip/yonetici. `ek_dosya_idleri` (ops., hazir `odev_eki`) ayni islemde baglanir; sonradan `PUT /odevler/:id/ekler`. */
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
                        aciklama?: string;
                        baslik: string;
                        brans_kodu: string;
                        /** @description Hazır `odev_eki` dosyaları (PDF/fotoğraf); sonradan `PUT /odevler/:id/ekler` ile değişir. */
                        ek_dosya_idleri?: string[];
                        /** @default false */
                        fotograf_gerekli?: boolean;
                        /**
                         * Format: uuid
                         * @description `kurum` hedefinde verilmez; sunucu kurum kimliğini yazar.
                         */
                        hedef_id?: string;
                        hedef_soru_sayisi?: number;
                        /** @enum {string} */
                        hedef_turu: "ogrenci" | "grup" | "kademe" | "kurum";
                        kaynak?: string;
                        /** Format: uuid */
                        konu_id?: string;
                        /** Format: date-time */
                        son_teslim_at?: string;
                        /**
                         * @default soru
                         * @enum {string}
                         */
                        tur?: "soru" | "sayfa" | "serbest";
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
                            aciklama: string | null;
                            atanan_sayisi: number;
                            baslik: string;
                            brans_kodu: string;
                            /** Format: date-time */
                            created_at: string;
                            /** @enum {string} */
                            durum: "taslak" | "yayinda" | "kapali";
                            /** @enum {string} */
                            fan_out_durum: "bekliyor" | "calisiyor" | "tamamlandi";
                            fotograf_gerekli: boolean;
                            /** Format: uuid */
                            hedef_id: string;
                            hedef_soru_sayisi: number | null;
                            /** @enum {string} */
                            hedef_turu: "ogrenci" | "grup" | "kademe" | "kurum";
                            /** Format: uuid */
                            id: string;
                            kaynak: string | null;
                            /** Format: uuid */
                            konu_id: string | null;
                            /** Format: date-time */
                            son_teslim_at: string | null;
                            surum: number;
                            /** @enum {string} */
                            tur: "soru" | "sayfa" | "serbest";
                            /** Format: uuid */
                            veren_id: string;
                            /** Format: date-time */
                            yayin_at: string | null;
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
    "/v1/ogrenme/kurumlar/{kurum_id}/odevler/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Odev detayi (kapsam disi 404). */
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
                            aciklama: string | null;
                            atanan_sayisi: number;
                            baslik: string;
                            brans_kodu: string;
                            /** Format: date-time */
                            created_at: string;
                            /** @enum {string} */
                            durum: "taslak" | "yayinda" | "kapali";
                            /** @enum {string} */
                            fan_out_durum: "bekliyor" | "calisiyor" | "tamamlandi";
                            fotograf_gerekli: boolean;
                            /** Format: uuid */
                            hedef_id: string;
                            hedef_soru_sayisi: number | null;
                            /** @enum {string} */
                            hedef_turu: "ogrenci" | "grup" | "kademe" | "kurum";
                            /** Format: uuid */
                            id: string;
                            kaynak: string | null;
                            /** Format: uuid */
                            konu_id: string | null;
                            /** Format: date-time */
                            son_teslim_at: string | null;
                            surum: number;
                            /** @enum {string} */
                            tur: "soru" | "sayfa" | "serbest";
                            /** Format: uuid */
                            veren_id: string;
                            /** Format: date-time */
                            yayin_at: string | null;
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
        /** Taslak odevi guncelle (yayindaki odev degistirilemez: 409). Iyimser kilit: `surum`. */
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
                        aciklama?: string | null;
                        baslik?: string;
                        brans_kodu?: string;
                        fotograf_gerekli?: boolean;
                        /** Format: uuid */
                        hedef_id?: string;
                        hedef_soru_sayisi?: number | null;
                        /** @enum {string} */
                        hedef_turu?: "ogrenci" | "grup" | "kademe" | "kurum";
                        kaynak?: string | null;
                        /** Format: uuid */
                        konu_id?: string | null;
                        /** Format: date-time */
                        son_teslim_at?: string | null;
                        /** @description İyimser kilit. */
                        surum?: number;
                        /** @enum {string} */
                        tur?: "soru" | "sayfa" | "serbest";
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
                            atanan_sayisi: number;
                            baslik: string;
                            brans_kodu: string;
                            /** Format: date-time */
                            created_at: string;
                            /** @enum {string} */
                            durum: "taslak" | "yayinda" | "kapali";
                            /** @enum {string} */
                            fan_out_durum: "bekliyor" | "calisiyor" | "tamamlandi";
                            fotograf_gerekli: boolean;
                            /** Format: uuid */
                            hedef_id: string;
                            hedef_soru_sayisi: number | null;
                            /** @enum {string} */
                            hedef_turu: "ogrenci" | "grup" | "kademe" | "kurum";
                            /** Format: uuid */
                            id: string;
                            kaynak: string | null;
                            /** Format: uuid */
                            konu_id: string | null;
                            /** Format: date-time */
                            son_teslim_at: string | null;
                            surum: number;
                            /** @enum {string} */
                            tur: "soru" | "sayfa" | "serbest";
                            /** Format: uuid */
                            veren_id: string;
                            /** Format: date-time */
                            yayin_at: string | null;
                        };
                    };
                };
            };
        };
        trace?: never;
    };
    "/v1/ogrenme/kurumlar/{kurum_id}/odevler/{id}/atama-esitle": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Yayindaki odevin hedefini yeniden cozer: sonradan katilan ogrenciye satir acar, ayrilip donen ogrencinin iptal satirini yeniden acar. Idempotent: ikinci cagri yeni satir yaratmaz. */
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
                            atanan_sayisi: number;
                            eklenen: number;
                            yeniden_acilan: number;
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
    "/v1/ogrenme/kurumlar/{kurum_id}/odevler/{id}/ekler": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Odev ekleri (sirali) ve kisa omurlu okuma adresleri (10 dk). Kapsam disi odev 404. Medya yanit vermezse `adresler_alinamadi`. */
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
                            adresler_alinamadi: boolean;
                            ekler: {
                                adres: {
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
                                } | null;
                                boyut_bayt: number;
                                /** Format: uuid */
                                medya_dosya_id: string;
                                mime_tipi: string;
                                sira: number;
                            }[];
                        };
                    };
                };
            };
        };
        /** Odev ek kumesini verilen listeye esitler (en cok 10, sirali). Dosyalar hazir `odev_eki`, cagiranin kendi yuklemesi ve baska kayda bagli degildir (409 `dosya_hazir_degil`, `dosya_zaten_bagli`; 422 `dosya_gecersiz`). Cikarilan dosya medyada hemen silinir. Taslak ve yayindaki odevde yazilir; kapali odevde 409. Ogretmen yalniz kendi odevini degistirir (baskasi 403). */
        put: {
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
                        /** @description Hazır `odev_eki` / `plan_eki` dosyaları (çağıranın kendi yüklemeleri), sıralı. */
                        medya_dosya_idleri: string[];
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
                            adresler_alinamadi: boolean;
                            ekler: {
                                adres: {
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
                                } | null;
                                boyut_bayt: number;
                                /** Format: uuid */
                                medya_dosya_id: string;
                                mime_tipi: string;
                                sira: number;
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
    "/v1/ogrenme/kurumlar/{kurum_id}/odevler/{id}/kapat": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Yayindaki odevi kapat (yeni teslim alinmaz; mevcut teslim/inceleme korunur). Kapali odevde tekrar cagri etkisizdir; taslakta 409. */
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
                            aciklama: string | null;
                            atanan_sayisi: number;
                            baslik: string;
                            brans_kodu: string;
                            /** Format: date-time */
                            created_at: string;
                            /** @enum {string} */
                            durum: "taslak" | "yayinda" | "kapali";
                            /** @enum {string} */
                            fan_out_durum: "bekliyor" | "calisiyor" | "tamamlandi";
                            fotograf_gerekli: boolean;
                            /** Format: uuid */
                            hedef_id: string;
                            hedef_soru_sayisi: number | null;
                            /** @enum {string} */
                            hedef_turu: "ogrenci" | "grup" | "kademe" | "kurum";
                            /** Format: uuid */
                            id: string;
                            kaynak: string | null;
                            /** Format: uuid */
                            konu_id: string | null;
                            /** Format: date-time */
                            son_teslim_at: string | null;
                            surum: number;
                            /** @enum {string} */
                            tur: "soru" | "sayfa" | "serbest";
                            /** Format: uuid */
                            veren_id: string;
                            /** Format: date-time */
                            yayin_at: string | null;
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
    "/v1/ogrenme/kurumlar/{kurum_id}/odevler/{id}/ozet": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Odev ozeti: tek sorguyla butun ogrenci satirlari (ad, durum, dogru orani, gec teslim) ve sayilar. 30 kisilik sinif tek ekran. */
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
                            odev: {
                                aciklama: string | null;
                                atanan_sayisi: number;
                                baslik: string;
                                brans_kodu: string;
                                /** Format: date-time */
                                created_at: string;
                                /** @enum {string} */
                                durum: "taslak" | "yayinda" | "kapali";
                                /** @enum {string} */
                                fan_out_durum: "bekliyor" | "calisiyor" | "tamamlandi";
                                fotograf_gerekli: boolean;
                                /** Format: uuid */
                                hedef_id: string;
                                hedef_soru_sayisi: number | null;
                                /** @enum {string} */
                                hedef_turu: "ogrenci" | "grup" | "kademe" | "kurum";
                                /** Format: uuid */
                                id: string;
                                kaynak: string | null;
                                /** Format: uuid */
                                konu_id: string | null;
                                /** Format: date-time */
                                son_teslim_at: string | null;
                                surum: number;
                                /** @enum {string} */
                                tur: "soru" | "sayfa" | "serbest";
                                /** Format: uuid */
                                veren_id: string;
                                /** Format: date-time */
                                yayin_at: string | null;
                            };
                            ogrenciler: {
                                bos_sayisi: number | null;
                                dogru_orani: number | null;
                                dogru_sayisi: number | null;
                                /** @enum {string} */
                                durum: "atandi" | "teslim_edildi" | "incelendi" | "tekrar_istendi" | "iptal";
                                gec_teslim: boolean;
                                gorunen_ad: string | null;
                                inceleme_notu: string | null;
                                /** @enum {string|null} */
                                inceleme_sonucu: "tamam" | "eksik" | "tekrar" | null;
                                /** Format: uuid */
                                ogrenci_id: string;
                                ogrenci_notu: string | null;
                                /** Format: uuid */
                                ogrenci_odev_id: string;
                                /** Format: date-time */
                                son_teslim_at: string | null;
                                /** Format: date-time */
                                teslim_at: string | null;
                                /** @description Bir kez de olsa teslim edilmiş mi. */
                                teslim_edildi: boolean;
                                yanlis_sayisi: number | null;
                                yapilan_soru_sayisi: number | null;
                            }[];
                            sayilar: {
                                atanan: number;
                                atandi: number;
                                gec_teslim: number;
                                incelendi: number;
                                iptal: number;
                                /** @description Doğru sayısı girilen teslimlerin ortalaması (0-1). */
                                ortalama_dogru_orani: number | null;
                                tekrar_istendi: number;
                                teslim_edildi: number;
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
    "/v1/ogrenme/kurumlar/{kurum_id}/odevler/{id}/yayinla": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Taslagi yayinla: hedefteki etkin ogrencilere ayni islemde 500 luk parcalarla satir acilir, `ogrenme.odev.yayinlandi.v1` 200 luk parcalarla yayimlanir. Yayindaki odevde tekrar cagri etkisizdir (200); kapali odevde 409. */
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
                            aciklama: string | null;
                            atanan_sayisi: number;
                            baslik: string;
                            brans_kodu: string;
                            /** Format: date-time */
                            created_at: string;
                            /** @enum {string} */
                            durum: "taslak" | "yayinda" | "kapali";
                            /** @enum {string} */
                            fan_out_durum: "bekliyor" | "calisiyor" | "tamamlandi";
                            fotograf_gerekli: boolean;
                            /** Format: uuid */
                            hedef_id: string;
                            hedef_soru_sayisi: number | null;
                            /** @enum {string} */
                            hedef_turu: "ogrenci" | "grup" | "kademe" | "kurum";
                            /** Format: uuid */
                            id: string;
                            kaynak: string | null;
                            /** Format: uuid */
                            konu_id: string | null;
                            /** Format: date-time */
                            son_teslim_at: string | null;
                            surum: number;
                            /** @enum {string} */
                            tur: "soru" | "sayfa" | "serbest";
                            /** Format: uuid */
                            veren_id: string;
                            /** Format: date-time */
                            yayin_at: string | null;
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
    "/v1/ogrenme/kurumlar/{kurum_id}/odevlerim": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Ogrencinin kendi odevleri (yalniz kendi satirlari; yayindaki/kapali odevler, iptal satirlar haric). Sayfali. */
        get: {
            parameters: {
                query?: {
                    durum?: "atandi" | "teslim_edildi" | "incelendi" | "tekrar_istendi" | "iptal";
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
                            odevler: {
                                aciklama: string | null;
                                baslik: string;
                                bos_sayisi: number | null;
                                brans_kodu: string;
                                dogru_sayisi: number | null;
                                /** @enum {string} */
                                durum: "atandi" | "teslim_edildi" | "incelendi" | "tekrar_istendi" | "iptal";
                                /** @description Ödevin ek dosya sayısı (`GET /ogrenci-odevleri/:id/ekler`). */
                                ek_sayisi: number;
                                fotograf_gerekli: boolean;
                                gec_teslim: boolean;
                                hedef_soru_sayisi: number | null;
                                /**
                                 * Format: uuid
                                 * @description `ogrenci_odevleri.id`; teslim bu kimlikle yapılır.
                                 */
                                id: string;
                                inceleme_notu: string | null;
                                /** @enum {string|null} */
                                inceleme_sonucu: "tamam" | "eksik" | "tekrar" | null;
                                /** Format: date-time */
                                incelendi_at: string | null;
                                kaynak: string | null;
                                /** Format: uuid */
                                konu_id: string | null;
                                /** @enum {string} */
                                odev_durum: "taslak" | "yayinda" | "kapali";
                                /** Format: uuid */
                                odev_id: string;
                                ogrenci_notu: string | null;
                                /** Format: date-time */
                                son_teslim_at: string | null;
                                /** Format: date-time */
                                teslim_at: string | null;
                                /** @enum {string} */
                                tur: "soru" | "sayfa" | "serbest";
                                yanlis_sayisi: number | null;
                                yapilan_soru_sayisi: number | null;
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
    "/v1/ogrenme/kurumlar/{kurum_id}/ogrenci-odevleri/{id}/ekler": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Ogrencinin kendi odev satirinin ekleri ve okuma adresleri (taslak odev ve iptal satir 404; baskasinin satiri 404). */
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
                            adresler_alinamadi: boolean;
                            ekler: {
                                adres: {
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
                                } | null;
                                boyut_bayt: number;
                                /** Format: uuid */
                                medya_dosya_id: string;
                                mime_tipi: string;
                                sira: number;
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
    "/v1/ogrenme/kurumlar/{kurum_id}/ogrenci-odevleri/{id}/inceleme": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Teslimi incele: `tamam`/`eksik` -> `incelendi`, `tekrar` -> `tekrar_istendi`. Yalniz `teslim_edildi` satiri; ogretmen yalniz kendi odevini inceler. */
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
                        not?: string;
                        /** @enum {string} */
                        sonuc: "tamam" | "eksik" | "tekrar";
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
                            baslik: string;
                            bos_sayisi: number | null;
                            brans_kodu: string;
                            dogru_sayisi: number | null;
                            /** @enum {string} */
                            durum: "atandi" | "teslim_edildi" | "incelendi" | "tekrar_istendi" | "iptal";
                            /** @description Ödevin ek dosya sayısı (`GET /ogrenci-odevleri/:id/ekler`). */
                            ek_sayisi: number;
                            fotograf_gerekli: boolean;
                            gec_teslim: boolean;
                            hedef_soru_sayisi: number | null;
                            /**
                             * Format: uuid
                             * @description `ogrenci_odevleri.id`; teslim bu kimlikle yapılır.
                             */
                            id: string;
                            inceleme_notu: string | null;
                            /** @enum {string|null} */
                            inceleme_sonucu: "tamam" | "eksik" | "tekrar" | null;
                            /** Format: date-time */
                            incelendi_at: string | null;
                            kaynak: string | null;
                            /** Format: uuid */
                            konu_id: string | null;
                            /** @enum {string} */
                            odev_durum: "taslak" | "yayinda" | "kapali";
                            /** Format: uuid */
                            odev_id: string;
                            ogrenci_notu: string | null;
                            /** Format: date-time */
                            son_teslim_at: string | null;
                            /** Format: date-time */
                            teslim_at: string | null;
                            /** @enum {string} */
                            tur: "soru" | "sayfa" | "serbest";
                            yanlis_sayisi: number | null;
                            yapilan_soru_sayisi: number | null;
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
    "/v1/ogrenme/kurumlar/{kurum_id}/ogrenci-odevleri/{id}/teslim": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Odevi teslim et (yalniz `atandi`/`tekrar_istendi`; yeniden teslimde onceki inceleme temizlenir). `gec_teslim` sunucuda hesaplanir. Fotograf baglama medya blogundadir. */
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
                        bos_sayisi?: number;
                        dogru_sayisi?: number;
                        ogrenci_notu?: string;
                        yanlis_sayisi?: number;
                        yapilan_soru_sayisi: number;
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
                            baslik: string;
                            bos_sayisi: number | null;
                            brans_kodu: string;
                            dogru_sayisi: number | null;
                            /** @enum {string} */
                            durum: "atandi" | "teslim_edildi" | "incelendi" | "tekrar_istendi" | "iptal";
                            /** @description Ödevin ek dosya sayısı (`GET /ogrenci-odevleri/:id/ekler`). */
                            ek_sayisi: number;
                            fotograf_gerekli: boolean;
                            gec_teslim: boolean;
                            hedef_soru_sayisi: number | null;
                            /**
                             * Format: uuid
                             * @description `ogrenci_odevleri.id`; teslim bu kimlikle yapılır.
                             */
                            id: string;
                            inceleme_notu: string | null;
                            /** @enum {string|null} */
                            inceleme_sonucu: "tamam" | "eksik" | "tekrar" | null;
                            /** Format: date-time */
                            incelendi_at: string | null;
                            kaynak: string | null;
                            /** Format: uuid */
                            konu_id: string | null;
                            /** @enum {string} */
                            odev_durum: "taslak" | "yayinda" | "kapali";
                            /** Format: uuid */
                            odev_id: string;
                            ogrenci_notu: string | null;
                            /** Format: date-time */
                            son_teslim_at: string | null;
                            /** Format: date-time */
                            teslim_at: string | null;
                            /** @enum {string} */
                            tur: "soru" | "sayfa" | "serbest";
                            yanlis_sayisi: number | null;
                            yapilan_soru_sayisi: number | null;
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
    "/v1/ogrenme/kurumlar/{kurum_id}/ogrenciler/{id}/deneme-gelisim": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Ogrencinin deneme gelisimi (yalniz ONAYLI sonuclar): toplam ve bolum bazinda trend (eskiden yeniye, son `limit`), son 5 ortalamasi, onceki 5 ile degisim. Ogretmen yalniz atandigi grubun ogrencisini, ogrenci yalniz kendini gorur; kapsam disi 404. */
        get: {
            parameters: {
                query: {
                    /** @description Kural kodu (ör. tyt). */
                    kural: string;
                    limit?: number;
                };
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
                            bolum_gelisimi: {
                                bolum_kodu: string;
                                brans_kodu: string;
                                degisim: number | null;
                                onceki5_ortalama: number | null;
                                son5_ortalama: number | null;
                            }[];
                            /** @description son5_ortalama - onceki5_ortalama; önceki yoksa null. */
                            degisim: number | null;
                            /** @description Onaylı deneme sayısı (limit uygulanmadan). */
                            deneme_sayisi: number;
                            kural_kodu: string;
                            /** @description Eskiden yeniye; son `limit` onaylı deneme. */
                            noktalar: {
                                ad: string;
                                bolumler: {
                                    bolum_kodu: string;
                                    brans_kodu: string;
                                    net: number;
                                }[];
                                /** Format: uuid */
                                deneme_id: string;
                                /** Format: date */
                                sinav_tarihi: string;
                                toplam_net: number;
                            }[];
                            /** Format: uuid */
                            ogrenci_id: string;
                            onceki5_ortalama: number | null;
                            onceki5_sayisi: number;
                            son5_ortalama: number | null;
                            son5_sayisi: number;
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
    "/v1/ogrenme/kurumlar/{kurum_id}/ogrenciler/{ogrenci_id}/degerlendirmeler": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Personel: ogrencinin TUM ogretmenlerinin degerlendirmeleri (en yeni once, imlec sayfali; `geri_cekilenler=true` ile geri cekilenler de). Ogretmen yalniz kendi ogrencilerini gorur (kapsam disi 404). */
        get: {
            parameters: {
                query?: {
                    geri_cekilenler?: "true" | "false";
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
                            degerlendirmeler: {
                                anlama_duzeyi: number | null;
                                benim: boolean;
                                brans_kodu: string | null;
                                calisma_duzeni: number | null;
                                /** Format: date-time */
                                created_at: string;
                                derse_katilim: number | null;
                                /** Format: date */
                                donem_baslangic: string;
                                /** Format: date */
                                donem_bitis: string;
                                /** Format: date-time */
                                duzenleme_son_at: string;
                                duzenlenebilir: boolean;
                                /** Format: date-time */
                                geri_cekildi_at: string | null;
                                /** Format: uuid */
                                id: string;
                                odev_disiplini: number | null;
                                ogrenci_gorur: boolean;
                                /** Format: uuid */
                                ogrenci_id: string;
                                surum: number;
                                yazar_ad: string | null;
                                /** Format: uuid */
                                yazar_id: string;
                                yorum: string | null;
                            }[];
                            sonraki_imlec: string | null;
                        };
                    };
                };
            };
        };
        put?: never;
        /** Ogrenci icin degerlendirme yaz (ogretmen: kendi ogrencileri, kapsam disi 404; sahip/yonetici: kurum). Donem: baslangic (bugunden sonra olamaz) ve istege bagli bitis (tek gun = bitis yok; en cok 31 gun; 422 `donem_gecersiz`); olcekler 1-5 ve hepsi istege bagli, yorum ya da en az bir olcek dolu olmali. `ogrenci_gorur` varsayilan false; true ise ogrenciye `ogrenme.degerlendirme.yayimlandi.v1` (uygulama ici bildirim, yorum olayda yok). */
        post: {
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
                        anlama_duzeyi?: number | null;
                        brans_kodu?: string | null;
                        calisma_duzeni?: number | null;
                        derse_katilim?: number | null;
                        /** Format: date */
                        donem_baslangic: string;
                        /** Format: date */
                        donem_bitis?: string;
                        odev_disiplini?: number | null;
                        /** @default false */
                        ogrenci_gorur?: boolean;
                        yorum?: string | null;
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
                            anlama_duzeyi: number | null;
                            benim: boolean;
                            brans_kodu: string | null;
                            calisma_duzeni: number | null;
                            /** Format: date-time */
                            created_at: string;
                            derse_katilim: number | null;
                            /** Format: date */
                            donem_baslangic: string;
                            /** Format: date */
                            donem_bitis: string;
                            /** Format: date-time */
                            duzenleme_son_at: string;
                            duzenlenebilir: boolean;
                            /** Format: date-time */
                            geri_cekildi_at: string | null;
                            /** Format: uuid */
                            id: string;
                            odev_disiplini: number | null;
                            ogrenci_gorur: boolean;
                            /** Format: uuid */
                            ogrenci_id: string;
                            surum: number;
                            yazar_ad: string | null;
                            /** Format: uuid */
                            yazar_id: string;
                            yorum: string | null;
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
    "/v1/ogrenme/kurumlar/{kurum_id}/ogrenciler/{ogrenci_id}/gunluk-soru/analiz": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Ogrenci konu analizi (ogretmen: kendi ogrencileri; yonetici/sahip: kurum; kapsam disi 404): konu x zorluk tablosu (cozulen, dogru, yanlis, bos, basari), konu basina zorluk bandi tespiti (`veri_az` / `tespit_yok` / `zorlaniyor`) ve `oneriler` (gorev oner, birebir ders gerekebilir). Oneriler kural tabanlidir, ogretmen onaylidir ve yalniz bu yanitta bulunur. */
        get: {
            parameters: {
                query: {
                    bas?: string;
                    bit?: string;
                    brans_kodu: string;
                    donem?: "7" | "30" | "donem";
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
                            /** Format: date */
                            bas: string;
                            /** Format: date */
                            bit: string;
                            brans_kodu: string;
                            konular: {
                                bant: {
                                    /** @enum {string|null} */
                                    bant: "kolay" | "orta" | "zor" | null;
                                    bant_basarilari: {
                                        kolay: number | null;
                                        orta: number | null;
                                        zor: number | null;
                                    };
                                    /** @enum {string} */
                                    durum: "veri_az" | "tespit_yok" | "zorlaniyor";
                                };
                                hucreler: {
                                    belirtilmemis: {
                                        basari: number | null;
                                        bos: number;
                                        cozulen: number;
                                        dogru: number;
                                        yanlis: number;
                                    };
                                    kolay: {
                                        basari: number | null;
                                        bos: number;
                                        cozulen: number;
                                        dogru: number;
                                        yanlis: number;
                                    };
                                    orta: {
                                        basari: number | null;
                                        bos: number;
                                        cozulen: number;
                                        dogru: number;
                                        yanlis: number;
                                    };
                                    zor: {
                                        basari: number | null;
                                        bos: number;
                                        cozulen: number;
                                        dogru: number;
                                        yanlis: number;
                                    };
                                };
                                konu_ad: string | null;
                                /** Format: uuid */
                                konu_id: string;
                                toplam: {
                                    basari: number | null;
                                    bos: number;
                                    cozulen: number;
                                    dogru: number;
                                    yanlis: number;
                                };
                                ust_konu_ad: string | null;
                            }[];
                            /** Format: uuid */
                            ogrenci_id: string;
                            oneriler?: ({
                                basari: number | null;
                                brans_kodu: string;
                                konu_ad: string | null;
                                /** Format: uuid */
                                konu_id: string;
                                soru_sayisi: number;
                                /** @enum {string} */
                                tur: "gorev_oner";
                                /** @enum {string} */
                                zorluk: "kolay" | "orta" | "zor";
                            } | {
                                brans_kodu: string;
                                konu_ad: string | null;
                                /** Format: uuid */
                                konu_id: string;
                                onceki_hafta_basari: number | null;
                                son_hafta_basari: number | null;
                                /** @enum {string} */
                                tur: "birebir_ders";
                                zor_basari: number;
                            })[];
                            toplam: {
                                basari: number | null;
                                bos: number;
                                cozulen: number;
                                dogru: number;
                                yanlis: number;
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
    "/v1/ogrenme/kurumlar/{kurum_id}/ogrenciler/{ogrenci_id}/gunluk-soru/analiz/hucre": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Hucre ayrintisi: secilen konu (ve zorluk) icin gunluk kayitlar, odev teslimleri ve fotograflarin okuma adresleri (medya ic ucu, 10 dk). Medya yanit vermezse `fotograf_adresleri_alinamadi=true`. */
        get: {
            parameters: {
                query: {
                    bas?: string;
                    bit?: string;
                    brans_kodu: string;
                    donem?: "7" | "30" | "donem";
                    konu_id: string;
                    zorluk?: "kolay" | "orta" | "zor" | "belirtilmemis";
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
                            fotograf_adresleri_alinamadi: boolean;
                            kayitlar: {
                                bos: number;
                                dogru: number;
                                dosyalar: {
                                    adres: {
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
                                    } | null;
                                    /** Format: uuid */
                                    medya_dosya_id: string;
                                }[];
                                /** Format: date */
                                gun: string;
                                /** Format: uuid */
                                id: string;
                                /** @enum {string} */
                                kaynak: "gunluk" | "odev";
                                kaynak_adi: string | null;
                                toplam: number;
                                yanlis: number;
                                /** @enum {string} */
                                zorluk: "kolay" | "orta" | "zor" | "belirtilmemis";
                            }[];
                            /** Format: uuid */
                            konu_id: string;
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
    "/v1/ogrenme/kurumlar/{kurum_id}/ogrenciler/{ogrenci_id}/gunluk-soru/gorev-ver": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Oneriden tek tikla gorev: `plan_gorevi` (ogrencinin `gun`ku (varsayilan yarin) haftalik planina "konu: zorluk seviyeden N soru" gorevi; plan yoksa yayinda acilir, taslak plan varsa gorev taslaga eklenir ve `plan_durum=taslak` doner) ya da `odev` (tek ogrencilik yayinda odev, son teslim varsayilan 3 gun). Mevcut plan ve odev servis fonksiyonlari kullanilir; yetki: `plan.gorev.yaz` / `odev.ver`, kapsam disi ogrenci 404, kilitli hafta 409 `plan_kilitli`. */
        post: {
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
                        brans_kodu: string;
                        /** Format: date */
                        gun?: string;
                        /** Format: uuid */
                        konu_id: string;
                        /** Format: date-time */
                        son_teslim_at?: string;
                        soru_sayisi: number;
                        /** @enum {string} */
                        tur: "plan_gorevi" | "odev";
                        /** @enum {string} */
                        zorluk: "kolay" | "orta" | "zor";
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
                            /** Format: uuid */
                            gorev_id: string;
                            /** Format: date */
                            gun: string;
                            /** Format: date */
                            hafta_baslangic: string;
                            /** @enum {string} */
                            plan_durum: "taslak" | "yayinda";
                            /** Format: uuid */
                            plan_id: string;
                            /** @enum {string} */
                            tur: "plan_gorevi";
                        } | {
                            /** Format: uuid */
                            odev_id: string;
                            /** Format: date-time */
                            son_teslim_at: string;
                            /** @enum {string} */
                            tur: "odev";
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
    "/v1/ogrenme/kurumlar/{kurum_id}/ogrenciler/{ogrenci_id}/gunluk-soru/haftalik-ozet": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Ogrenci karti haftalik ozeti (Pazartesi baslar, Europe/Istanbul): cozulen soru, en zayif 3 konu (en az 5 soru) ve tum konular birlikte zorluk bandi degisimi (onceki hafta ile). Tum dersler birlikte. */
        get: {
            parameters: {
                query?: {
                    hafta?: string;
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
                            bant: {
                                /** @enum {string} */
                                degisim: "iyilesti" | "ayni" | "kotulesti" | "belirsiz";
                                onceki: {
                                    /** @enum {string|null} */
                                    bant: "kolay" | "orta" | "zor" | null;
                                    bant_basarilari: {
                                        kolay: number | null;
                                        orta: number | null;
                                        zor: number | null;
                                    };
                                    /** @enum {string} */
                                    durum: "veri_az" | "tespit_yok" | "zorlaniyor";
                                };
                                simdiki: {
                                    /** @enum {string|null} */
                                    bant: "kolay" | "orta" | "zor" | null;
                                    bant_basarilari: {
                                        kolay: number | null;
                                        orta: number | null;
                                        zor: number | null;
                                    };
                                    /** @enum {string} */
                                    durum: "veri_az" | "tespit_yok" | "zorlaniyor";
                                };
                            };
                            basari: number | null;
                            bos: number;
                            cozulen: number;
                            dogru: number;
                            en_zayif_konular: {
                                basari: number | null;
                                brans_kodu: string;
                                cozulen: number;
                                konu_ad: string | null;
                                /** Format: uuid */
                                konu_id: string;
                            }[];
                            /** Format: date */
                            hafta_baslangic: string;
                            /** Format: uuid */
                            ogrenci_id: string;
                            yanlis: number;
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
    "/v1/ogrenme/kurumlar/{kurum_id}/ogrenciler/{ogrenci_id}/kaynak-onerileri": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Personel: ogrenciye onerilen kaynaklar (en yeni once) ve `basladi` durumu (oneriden sonra gunluk soru kaydinda o kitap/test/metin kullanildiysa true; `link` icin null). `geri_cekilenler=true` ile geri cekilenler de. */
        get: {
            parameters: {
                query?: {
                    geri_cekilenler?: "true" | "false";
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
                            oneriler: {
                                baglanti_url: string | null;
                                basladi: boolean | null;
                                baslik: string | null;
                                benim: boolean;
                                brans_kodu: string | null;
                                /** Format: date-time */
                                created_at: string;
                                /** Format: date-time */
                                geri_cekildi_at: string | null;
                                /** Format: uuid */
                                id: string;
                                /** Format: date */
                                ilk_kullanim_gun: string | null;
                                kayit_sayisi: number;
                                kaynak_kitap_ad: string | null;
                                /** Format: uuid */
                                kaynak_kitap_id: string | null;
                                kaynak_test_ad: string | null;
                                /** Format: uuid */
                                kaynak_test_id: string | null;
                                konu_ad: string | null;
                                /** Format: uuid */
                                konu_id: string | null;
                                not: string | null;
                                /** Format: uuid */
                                ogrenci_id: string;
                                oneren_ad: string | null;
                                /** Format: uuid */
                                oneren_id: string;
                                /** Format: date */
                                son_kullanim_gun: string | null;
                                /** @enum {string} */
                                tur: "kaynak_kitap" | "kaynak_kitap_testi" | "link" | "serbest";
                            }[];
                        };
                    };
                };
            };
        };
        put?: never;
        /** Ogrenciye kaynak oner: `kaynak_kitap` / `kaynak_kitap_testi` (kurumun aktif kaynak kitaplarindan), `link` (yalniz http/https, baslik zorunlu) ya da `serbest` (baslik). Istege bagli konu (kitap/testte kitabin dersi, link/serbestte `brans_kodu` ile) ve not. Gecersiz kaynak 422 `kaynak_gecersiz`, kapsam disi ogrenci 404. Ogrenciye `ogrenme.kaynak_onerisi.eklendi.v1` (uygulama ici bildirim). */
        post: {
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
                        /** Format: uuid */
                        kaynak_kitap_id: string;
                        /** Format: uuid */
                        konu_id?: string | null;
                        not?: string | null;
                        /** @enum {string} */
                        tur: "kaynak_kitap";
                    } | {
                        /** Format: uuid */
                        kaynak_test_id: string;
                        /** Format: uuid */
                        konu_id?: string | null;
                        not?: string | null;
                        /** @enum {string} */
                        tur: "kaynak_kitap_testi";
                    } | {
                        baglanti_url: string;
                        baslik: string;
                        brans_kodu?: string | null;
                        /** Format: uuid */
                        konu_id?: string | null;
                        not?: string | null;
                        /** @enum {string} */
                        tur: "link";
                    } | {
                        baslik: string;
                        brans_kodu?: string | null;
                        /** Format: uuid */
                        konu_id?: string | null;
                        not?: string | null;
                        /** @enum {string} */
                        tur: "serbest";
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
                            baglanti_url: string | null;
                            basladi: boolean | null;
                            baslik: string | null;
                            benim: boolean;
                            brans_kodu: string | null;
                            /** Format: date-time */
                            created_at: string;
                            /** Format: date-time */
                            geri_cekildi_at: string | null;
                            /** Format: uuid */
                            id: string;
                            /** Format: date */
                            ilk_kullanim_gun: string | null;
                            kayit_sayisi: number;
                            kaynak_kitap_ad: string | null;
                            /** Format: uuid */
                            kaynak_kitap_id: string | null;
                            kaynak_test_ad: string | null;
                            /** Format: uuid */
                            kaynak_test_id: string | null;
                            konu_ad: string | null;
                            /** Format: uuid */
                            konu_id: string | null;
                            not: string | null;
                            /** Format: uuid */
                            ogrenci_id: string;
                            oneren_ad: string | null;
                            /** Format: uuid */
                            oneren_id: string;
                            /** Format: date */
                            son_kullanim_gun: string | null;
                            /** @enum {string} */
                            tur: "kaynak_kitap" | "kaynak_kitap_testi" | "link" | "serbest";
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
    "/v1/ogrenme/kurumlar/{kurum_id}/ogrenciler/{ogrenci_id}/kocluk": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Ogrenci kocluk gorunumu (personel; ogretmen yalniz kendi ogrencileri, kapsam disi 404; ogrenci rolu 403): (1) tum ogretmenlerin degerlendirme zaman cizelgesi (ilk sayfa, gorunurluk isaretli; devami `degerlendirmeler` liste ucundan), (2) son 4 haftanin olcek ortalamalari, (3) kullanilan kaynaklar (gunluk kayit ve odevlerden, son 90 gun; kitap ilerlemesi), (4) onerilen kaynaklar ve baslama durumu, (5) son 30 gun konu analizi ozeti, zayif konular ve sistem onerileri (G1 fonksiyonlari), (6) bu haftanin plani ve odev durumu. Geri cekilen degerlendirme ve oneriler yoktur. Hedef: 2 sn. */
        get: {
            parameters: {
                query?: {
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
                            degerlendirmeler: {
                                degerlendirmeler: {
                                    anlama_duzeyi: number | null;
                                    benim: boolean;
                                    brans_kodu: string | null;
                                    calisma_duzeni: number | null;
                                    /** Format: date-time */
                                    created_at: string;
                                    derse_katilim: number | null;
                                    /** Format: date */
                                    donem_baslangic: string;
                                    /** Format: date */
                                    donem_bitis: string;
                                    /** Format: date-time */
                                    duzenleme_son_at: string;
                                    duzenlenebilir: boolean;
                                    /** Format: date-time */
                                    geri_cekildi_at: string | null;
                                    /** Format: uuid */
                                    id: string;
                                    odev_disiplini: number | null;
                                    ogrenci_gorur: boolean;
                                    /** Format: uuid */
                                    ogrenci_id: string;
                                    surum: number;
                                    yazar_ad: string | null;
                                    /** Format: uuid */
                                    yazar_id: string;
                                    yorum: string | null;
                                }[];
                                sonraki_imlec: string | null;
                            };
                            konu_analizi: {
                                /** Format: date */
                                bas: string;
                                /** Format: date */
                                bit: string;
                                bransler: {
                                    brans_kodu: string;
                                    oneriler: ({
                                        basari: number | null;
                                        brans_kodu: string;
                                        konu_ad: string | null;
                                        /** Format: uuid */
                                        konu_id: string;
                                        soru_sayisi: number;
                                        /** @enum {string} */
                                        tur: "gorev_oner";
                                        /** @enum {string} */
                                        zorluk: "kolay" | "orta" | "zor";
                                    } | {
                                        brans_kodu: string;
                                        konu_ad: string | null;
                                        /** Format: uuid */
                                        konu_id: string;
                                        onceki_hafta_basari: number | null;
                                        son_hafta_basari: number | null;
                                        /** @enum {string} */
                                        tur: "birebir_ders";
                                        zor_basari: number;
                                    })[];
                                    toplam: {
                                        basari: number | null;
                                        bos: number;
                                        cozulen: number;
                                        dogru: number;
                                        yanlis: number;
                                    };
                                    zayif_konular: {
                                        bant: {
                                            /** @enum {string|null} */
                                            bant: "kolay" | "orta" | "zor" | null;
                                            bant_basarilari: {
                                                kolay: number | null;
                                                orta: number | null;
                                                zor: number | null;
                                            };
                                            /** @enum {string} */
                                            durum: "veri_az" | "tespit_yok" | "zorlaniyor";
                                        };
                                        hucreler: {
                                            belirtilmemis: {
                                                basari: number | null;
                                                bos: number;
                                                cozulen: number;
                                                dogru: number;
                                                yanlis: number;
                                            };
                                            kolay: {
                                                basari: number | null;
                                                bos: number;
                                                cozulen: number;
                                                dogru: number;
                                                yanlis: number;
                                            };
                                            orta: {
                                                basari: number | null;
                                                bos: number;
                                                cozulen: number;
                                                dogru: number;
                                                yanlis: number;
                                            };
                                            zor: {
                                                basari: number | null;
                                                bos: number;
                                                cozulen: number;
                                                dogru: number;
                                                yanlis: number;
                                            };
                                        };
                                        konu_ad: string | null;
                                        /** Format: uuid */
                                        konu_id: string;
                                        toplam: {
                                            basari: number | null;
                                            bos: number;
                                            cozulen: number;
                                            dogru: number;
                                            yanlis: number;
                                        };
                                        ust_konu_ad: string | null;
                                    }[];
                                }[];
                                haftalik_ozet: {
                                    bant: {
                                        /** @enum {string} */
                                        degisim: "iyilesti" | "ayni" | "kotulesti" | "belirsiz";
                                        onceki: {
                                            /** @enum {string|null} */
                                            bant: "kolay" | "orta" | "zor" | null;
                                            bant_basarilari: {
                                                kolay: number | null;
                                                orta: number | null;
                                                zor: number | null;
                                            };
                                            /** @enum {string} */
                                            durum: "veri_az" | "tespit_yok" | "zorlaniyor";
                                        };
                                        simdiki: {
                                            /** @enum {string|null} */
                                            bant: "kolay" | "orta" | "zor" | null;
                                            bant_basarilari: {
                                                kolay: number | null;
                                                orta: number | null;
                                                zor: number | null;
                                            };
                                            /** @enum {string} */
                                            durum: "veri_az" | "tespit_yok" | "zorlaniyor";
                                        };
                                    };
                                    basari: number | null;
                                    bos: number;
                                    cozulen: number;
                                    dogru: number;
                                    en_zayif_konular: {
                                        basari: number | null;
                                        brans_kodu: string;
                                        cozulen: number;
                                        konu_ad: string | null;
                                        /** Format: uuid */
                                        konu_id: string;
                                    }[];
                                    /** Format: date */
                                    hafta_baslangic: string;
                                    /** Format: uuid */
                                    ogrenci_id: string;
                                    yanlis: number;
                                };
                                toplam: {
                                    basari: number | null;
                                    bos: number;
                                    cozulen: number;
                                    dogru: number;
                                    yanlis: number;
                                };
                            };
                            kullanilan_kaynaklar: {
                                kitaplar: {
                                    ad: string;
                                    brans_kodu: string;
                                    cozulen_soru: number;
                                    cozulen_test: number;
                                    kayit_sayisi: number;
                                    /** Format: uuid */
                                    kaynak_kitap_id: string;
                                    /** Format: date */
                                    son_kullanim_gun: string;
                                    toplam_test: number;
                                }[];
                                odevler: {
                                    ad: string;
                                    odev_sayisi: number;
                                    /** Format: date */
                                    son_kullanim_gun: string;
                                }[];
                                serbest: {
                                    ad: string;
                                    kayit_sayisi: number;
                                    /** Format: date */
                                    son_kullanim_gun: string;
                                }[];
                            };
                            ogrenci_ad: string | null;
                            /** Format: uuid */
                            ogrenci_id: string;
                            olcek_ortalamalari: {
                                haftalar: {
                                    anlama_duzeyi: number | null;
                                    calisma_duzeni: number | null;
                                    derse_katilim: number | null;
                                    /** Format: date */
                                    hafta_baslangic: string;
                                    odev_disiplini: number | null;
                                    sayi: number;
                                }[];
                                toplam: {
                                    anlama_duzeyi: number | null;
                                    calisma_duzeni: number | null;
                                    derse_katilim: number | null;
                                    odev_disiplini: number | null;
                                    sayi: number;
                                };
                            };
                            oneriler: {
                                baglanti_url: string | null;
                                basladi: boolean | null;
                                baslik: string | null;
                                benim: boolean;
                                brans_kodu: string | null;
                                /** Format: date-time */
                                created_at: string;
                                /** Format: date-time */
                                geri_cekildi_at: string | null;
                                /** Format: uuid */
                                id: string;
                                /** Format: date */
                                ilk_kullanim_gun: string | null;
                                kayit_sayisi: number;
                                kaynak_kitap_ad: string | null;
                                /** Format: uuid */
                                kaynak_kitap_id: string | null;
                                kaynak_test_ad: string | null;
                                /** Format: uuid */
                                kaynak_test_id: string | null;
                                konu_ad: string | null;
                                /** Format: uuid */
                                konu_id: string | null;
                                not: string | null;
                                /** Format: uuid */
                                ogrenci_id: string;
                                oneren_ad: string | null;
                                /** Format: uuid */
                                oneren_id: string;
                                /** Format: date */
                                son_kullanim_gun: string | null;
                                /** @enum {string} */
                                tur: "kaynak_kitap" | "kaynak_kitap_testi" | "link" | "serbest";
                            }[];
                            plan_odev: {
                                odev: {
                                    acik: number;
                                    geciken: number;
                                    inceleme_bekleyen: number;
                                    teslim_edildi: number;
                                };
                                plan: {
                                    dakika: {
                                        gerceklesen: number;
                                        planlanan: number;
                                    };
                                    /** @enum {string} */
                                    durum: "taslak" | "yayinda";
                                    gorev_sayisi: number;
                                    /** Format: date */
                                    hafta_baslangic: string;
                                    /** Format: uuid */
                                    plan_id: string;
                                    soru: {
                                        gerceklesen: number;
                                        planlanan: number;
                                    };
                                    tamam_sayisi: number;
                                } | null;
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
    "/v1/ogrenme/kurumlar/{kurum_id}/ogrenciler/{ogrenci_id}/plan": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Ogrencinin haftalik plani (ogretmen: taslak dahil). `hafta` haftanin herhangi bir gunu olabilir (verilmezse bu hafta, Europe/Istanbul). Plan yoksa `plan: null` ve bos gorev listesiyle bos iskelet doner. Kapsam disi ogrenci 404. */
        get: {
            parameters: {
                query?: {
                    /** @description Haftanin herhangi bir gunu (`YYYY-MM-DD`); verilmezse bu hafta (Europe/Istanbul). */
                    hafta?: string;
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
                            gorevler: {
                                baslik: string | null;
                                brans_kodu: string;
                                /** Format: uuid */
                                devreden_gorev_id: string | null;
                                /** @enum {string} */
                                durum: "bekliyor" | "tamam" | "kismen" | "yapilmadi" | "devredildi";
                                gerceklesen_miktar: number | null;
                                /** Format: date */
                                gun: string;
                                /** Format: date */
                                hafta_baslangic: string;
                                hedef_miktar: number;
                                /** @enum {string} */
                                hedef_turu: "soru" | "dakika";
                                /** Format: uuid */
                                id: string;
                                /** Format: uuid */
                                konu_id: string | null;
                                /** Format: uuid */
                                ogrenci_id: string;
                                /** Format: uuid */
                                plan_id: string;
                                sira: number;
                                surum: number;
                                /** Format: date-time */
                                tamamlandi_at: string | null;
                            }[];
                            /** Format: date */
                            hafta_baslangic: string;
                            /** @description Hafta sonu + 14 gun gectiyse true: yazma 409 `plan_kilitli`. */
                            kilitli: boolean;
                            /** Format: uuid */
                            ogrenci_id: string;
                            plan: {
                                /** Format: date-time */
                                created_at: string;
                                /** @enum {string} */
                                durum: "taslak" | "yayinda";
                                /** Format: date */
                                hafta_baslangic: string;
                                /** Format: uuid */
                                hazirlayan_id: string;
                                /** Format: uuid */
                                id: string;
                                not: string | null;
                                /** Format: uuid */
                                ogrenci_id: string;
                                surum: number;
                                /** Format: date-time */
                                yayin_at: string | null;
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
    "/v1/ogrenme/kurumlar/{kurum_id}/plan-sablonlari": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Kendi plan sablonlarim (yeniden eskiye). */
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
                            sablonlar: {
                                aciklama: string | null;
                                ad: string;
                                /** Format: date-time */
                                created_at: string;
                                gorevler: {
                                    baslik: string | null;
                                    brans_kodu: string;
                                    gun_sirasi: number;
                                    hedef_miktar: number;
                                    /** @enum {string} */
                                    hedef_turu: "soru" | "dakika";
                                    /** Format: uuid */
                                    id: string;
                                    /** Format: uuid */
                                    konu_id: string | null;
                                    sira: number;
                                }[];
                                /** Format: uuid */
                                id: string;
                                /** Format: uuid */
                                ogretmen_id: string;
                            }[];
                        };
                    };
                };
            };
        };
        put?: never;
        /** Plan sablonu olustur (haftanin gun sirasina [0 = Pazartesi] gore gorevlerle). */
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
                        aciklama?: string;
                        ad: string;
                        /** @default [] */
                        gorevler?: {
                            baslik?: string;
                            brans_kodu: string;
                            gun_sirasi: number;
                            hedef_miktar: number;
                            /** @enum {string} */
                            hedef_turu: "soru" | "dakika";
                            /** Format: uuid */
                            konu_id?: string;
                            /** @default 0 */
                            sira?: number;
                        }[];
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
                            aciklama: string | null;
                            ad: string;
                            /** Format: date-time */
                            created_at: string;
                            gorevler: {
                                baslik: string | null;
                                brans_kodu: string;
                                gun_sirasi: number;
                                hedef_miktar: number;
                                /** @enum {string} */
                                hedef_turu: "soru" | "dakika";
                                /** Format: uuid */
                                id: string;
                                /** Format: uuid */
                                konu_id: string | null;
                                sira: number;
                            }[];
                            /** Format: uuid */
                            id: string;
                            /** Format: uuid */
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
    "/v1/ogrenme/kurumlar/{kurum_id}/plan-sablonlari/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Plan sablonu (baskasinin sablonu 404). */
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
                            aciklama: string | null;
                            ad: string;
                            /** Format: date-time */
                            created_at: string;
                            gorevler: {
                                baslik: string | null;
                                brans_kodu: string;
                                gun_sirasi: number;
                                hedef_miktar: number;
                                /** @enum {string} */
                                hedef_turu: "soru" | "dakika";
                                /** Format: uuid */
                                id: string;
                                /** Format: uuid */
                                konu_id: string | null;
                                sira: number;
                            }[];
                            /** Format: uuid */
                            id: string;
                            /** Format: uuid */
                            ogretmen_id: string;
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        /** Sablonu sil (kurulmus planlar etkilenmez). */
        delete: {
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
                    content?: never;
                };
            };
        };
        options?: never;
        head?: never;
        /** Sablonu guncelle. `gorevler` verilirse gorev listesinin tamami bununla degistirilir. */
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
                        aciklama?: string | null;
                        ad?: string;
                        /** @description Verilirse sablonun gorev listesinin TAMAMI bununla degistirilir. */
                        gorevler?: {
                            baslik?: string;
                            brans_kodu: string;
                            gun_sirasi: number;
                            hedef_miktar: number;
                            /** @enum {string} */
                            hedef_turu: "soru" | "dakika";
                            /** Format: uuid */
                            konu_id?: string;
                            /** @default 0 */
                            sira?: number;
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
                            aciklama: string | null;
                            ad: string;
                            /** Format: date-time */
                            created_at: string;
                            gorevler: {
                                baslik: string | null;
                                brans_kodu: string;
                                gun_sirasi: number;
                                hedef_miktar: number;
                                /** @enum {string} */
                                hedef_turu: "soru" | "dakika";
                                /** Format: uuid */
                                id: string;
                                /** Format: uuid */
                                konu_id: string | null;
                                sira: number;
                            }[];
                            /** Format: uuid */
                            id: string;
                            /** Format: uuid */
                            ogretmen_id: string;
                        };
                    };
                };
            };
        };
        trace?: never;
    };
    "/v1/ogrenme/kurumlar/{kurum_id}/plan-sablonlari/{id}/uygula": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Sablondan kur: ogrenci ve haftaya taslak plan acar (varsa bos plani kullanir) ve sablon gorevlerini gun sirasina gore haftaya oturtur. Hedef haftada gorevli plan varsa 409 `plan_dolu`. */
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
                         * Format: date
                         * @description Haftanin Pazartesi gunu.
                         */
                        hafta_baslangic: string;
                        /** Format: uuid */
                        ogrenci_id: string;
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
                            gorevler: {
                                baslik: string | null;
                                brans_kodu: string;
                                /** Format: uuid */
                                devreden_gorev_id: string | null;
                                /** @enum {string} */
                                durum: "bekliyor" | "tamam" | "kismen" | "yapilmadi" | "devredildi";
                                gerceklesen_miktar: number | null;
                                /** Format: date */
                                gun: string;
                                /** Format: date */
                                hafta_baslangic: string;
                                hedef_miktar: number;
                                /** @enum {string} */
                                hedef_turu: "soru" | "dakika";
                                /** Format: uuid */
                                id: string;
                                /** Format: uuid */
                                konu_id: string | null;
                                /** Format: uuid */
                                ogrenci_id: string;
                                /** Format: uuid */
                                plan_id: string;
                                sira: number;
                                surum: number;
                                /** Format: date-time */
                                tamamlandi_at: string | null;
                            }[];
                            /** Format: date */
                            hafta_baslangic: string;
                            /** @description Hafta sonu + 14 gun gectiyse true: yazma 409 `plan_kilitli`. */
                            kilitli: boolean;
                            /** Format: uuid */
                            ogrenci_id: string;
                            plan: {
                                /** Format: date-time */
                                created_at: string;
                                /** @enum {string} */
                                durum: "taslak" | "yayinda";
                                /** Format: date */
                                hafta_baslangic: string;
                                /** Format: uuid */
                                hazirlayan_id: string;
                                /** Format: uuid */
                                id: string;
                                not: string | null;
                                /** Format: uuid */
                                ogrenci_id: string;
                                surum: number;
                                /** Format: date-time */
                                yayin_at: string | null;
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
    "/v1/ogrenme/kurumlar/{kurum_id}/planim": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Ogrencinin kendi haftalik plani: yalniz yayindaki plan gorunur (taslak ya da plan yoksa `plan: null` bos iskelet). `hafta` haftanin herhangi bir gunu olabilir (verilmezse bu hafta, Europe/Istanbul). */
        get: {
            parameters: {
                query?: {
                    /** @description Haftanin herhangi bir gunu (`YYYY-MM-DD`); verilmezse bu hafta (Europe/Istanbul). */
                    hafta?: string;
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
                            gorevler: {
                                baslik: string | null;
                                brans_kodu: string;
                                /** Format: uuid */
                                devreden_gorev_id: string | null;
                                /** @enum {string} */
                                durum: "bekliyor" | "tamam" | "kismen" | "yapilmadi" | "devredildi";
                                gerceklesen_miktar: number | null;
                                /** Format: date */
                                gun: string;
                                /** Format: date */
                                hafta_baslangic: string;
                                hedef_miktar: number;
                                /** @enum {string} */
                                hedef_turu: "soru" | "dakika";
                                /** Format: uuid */
                                id: string;
                                /** Format: uuid */
                                konu_id: string | null;
                                /** Format: uuid */
                                ogrenci_id: string;
                                /** Format: uuid */
                                plan_id: string;
                                sira: number;
                                surum: number;
                                /** Format: date-time */
                                tamamlandi_at: string | null;
                            }[];
                            /** Format: date */
                            hafta_baslangic: string;
                            /** @description Hafta sonu + 14 gun gectiyse true: yazma 409 `plan_kilitli`. */
                            kilitli: boolean;
                            /** Format: uuid */
                            ogrenci_id: string;
                            plan: {
                                /** Format: date-time */
                                created_at: string;
                                /** @enum {string} */
                                durum: "taslak" | "yayinda";
                                /** Format: date */
                                hafta_baslangic: string;
                                /** Format: uuid */
                                hazirlayan_id: string;
                                /** Format: uuid */
                                id: string;
                                not: string | null;
                                /** Format: uuid */
                                ogrenci_id: string;
                                surum: number;
                                /** Format: date-time */
                                yayin_at: string | null;
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
    "/v1/ogrenme/kurumlar/{kurum_id}/planim/{id}/ekler": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Ogrencinin kendi (yayindaki) planinin ekleri ve okuma adresleri. Taslak plan ya da baskasinin plani 404. */
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
                            adresler_alinamadi: boolean;
                            ekler: {
                                adres: {
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
                                } | null;
                                boyut_bayt: number;
                                /** Format: uuid */
                                medya_dosya_id: string;
                                mime_tipi: string;
                                sira: number;
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
    "/v1/ogrenme/kurumlar/{kurum_id}/planlar": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Ogrenci ve hafta icin bos plan (taslak) olustur. Hafta Pazartesi olmali (422); ayni hafta plani varsa 409 `plan_zaten_var`; kilitli hafta 409 `plan_kilitli`. */
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
                         * @description Haftanin Pazartesi gunu.
                         */
                        hafta_baslangic: string;
                        not?: string;
                        /** Format: uuid */
                        ogrenci_id: string;
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
                            gorevler: {
                                baslik: string | null;
                                brans_kodu: string;
                                /** Format: uuid */
                                devreden_gorev_id: string | null;
                                /** @enum {string} */
                                durum: "bekliyor" | "tamam" | "kismen" | "yapilmadi" | "devredildi";
                                gerceklesen_miktar: number | null;
                                /** Format: date */
                                gun: string;
                                /** Format: date */
                                hafta_baslangic: string;
                                hedef_miktar: number;
                                /** @enum {string} */
                                hedef_turu: "soru" | "dakika";
                                /** Format: uuid */
                                id: string;
                                /** Format: uuid */
                                konu_id: string | null;
                                /** Format: uuid */
                                ogrenci_id: string;
                                /** Format: uuid */
                                plan_id: string;
                                sira: number;
                                surum: number;
                                /** Format: date-time */
                                tamamlandi_at: string | null;
                            }[];
                            /** Format: date */
                            hafta_baslangic: string;
                            /** @description Hafta sonu + 14 gun gectiyse true: yazma 409 `plan_kilitli`. */
                            kilitli: boolean;
                            /** Format: uuid */
                            ogrenci_id: string;
                            plan: {
                                /** Format: date-time */
                                created_at: string;
                                /** @enum {string} */
                                durum: "taslak" | "yayinda";
                                /** Format: date */
                                hafta_baslangic: string;
                                /** Format: uuid */
                                hazirlayan_id: string;
                                /** Format: uuid */
                                id: string;
                                not: string | null;
                                /** Format: uuid */
                                ogrenci_id: string;
                                surum: number;
                                /** Format: date-time */
                                yayin_at: string | null;
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
    "/v1/ogrenme/kurumlar/{kurum_id}/planlar/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Plan ve gorevleri (kapsam disi 404). */
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
                            gorevler: {
                                baslik: string | null;
                                brans_kodu: string;
                                /** Format: uuid */
                                devreden_gorev_id: string | null;
                                /** @enum {string} */
                                durum: "bekliyor" | "tamam" | "kismen" | "yapilmadi" | "devredildi";
                                gerceklesen_miktar: number | null;
                                /** Format: date */
                                gun: string;
                                /** Format: date */
                                hafta_baslangic: string;
                                hedef_miktar: number;
                                /** @enum {string} */
                                hedef_turu: "soru" | "dakika";
                                /** Format: uuid */
                                id: string;
                                /** Format: uuid */
                                konu_id: string | null;
                                /** Format: uuid */
                                ogrenci_id: string;
                                /** Format: uuid */
                                plan_id: string;
                                sira: number;
                                surum: number;
                                /** Format: date-time */
                                tamamlandi_at: string | null;
                            }[];
                            /** Format: date */
                            hafta_baslangic: string;
                            /** @description Hafta sonu + 14 gun gectiyse true: yazma 409 `plan_kilitli`. */
                            kilitli: boolean;
                            /** Format: uuid */
                            ogrenci_id: string;
                            plan: {
                                /** Format: date-time */
                                created_at: string;
                                /** @enum {string} */
                                durum: "taslak" | "yayinda";
                                /** Format: date */
                                hafta_baslangic: string;
                                /** Format: uuid */
                                hazirlayan_id: string;
                                /** Format: uuid */
                                id: string;
                                not: string | null;
                                /** Format: uuid */
                                ogrenci_id: string;
                                surum: number;
                                /** Format: date-time */
                                yayin_at: string | null;
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
    "/v1/ogrenme/kurumlar/{kurum_id}/planlar/{id}/ekler": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Plan ekleri (hazir plan PDF/resim) ve okuma adresleri (kapsam disi plan 404). */
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
                            adresler_alinamadi: boolean;
                            ekler: {
                                adres: {
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
                                } | null;
                                boyut_bayt: number;
                                /** Format: uuid */
                                medya_dosya_id: string;
                                mime_tipi: string;
                                sira: number;
                            }[];
                        };
                    };
                };
            };
        };
        /** Plan ek kumesini verilen listeye esitler (en cok 10, sirali): hazir plani PDF/resim olarak yukleme. Dosyalar hazir `plan_eki`, cagiranin kendi yuklemesi ve baska kayda bagli degildir. Yayindaki planda da yazilir; kilitli hafta 409 `plan_kilitli`. */
        put: {
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
                        /** @description Hazır `odev_eki` / `plan_eki` dosyaları (çağıranın kendi yüklemeleri), sıralı. */
                        medya_dosya_idleri: string[];
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
                            adresler_alinamadi: boolean;
                            ekler: {
                                adres: {
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
                                } | null;
                                boyut_bayt: number;
                                /** Format: uuid */
                                medya_dosya_id: string;
                                mime_tipi: string;
                                sira: number;
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
    "/v1/ogrenme/kurumlar/{kurum_id}/planlar/{id}/gorevler": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Plana gorev ekle (ders, konu, hedef soru sayisi ya da dakika). `gun` planin haftasi icinde olmali (422). Hedefi yalniz ogretmen/yonetim yazar; ogrenci gorev ekleyemez (403). */
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
                        baslik?: string;
                        brans_kodu: string;
                        /** Format: date */
                        gun: string;
                        hedef_miktar: number;
                        /** @enum {string} */
                        hedef_turu: "soru" | "dakika";
                        /** Format: uuid */
                        konu_id?: string;
                        /** @default 0 */
                        sira?: number;
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
                            baslik: string | null;
                            brans_kodu: string;
                            /** Format: uuid */
                            devreden_gorev_id: string | null;
                            /** @enum {string} */
                            durum: "bekliyor" | "tamam" | "kismen" | "yapilmadi" | "devredildi";
                            gerceklesen_miktar: number | null;
                            /** Format: date */
                            gun: string;
                            /** Format: date */
                            hafta_baslangic: string;
                            hedef_miktar: number;
                            /** @enum {string} */
                            hedef_turu: "soru" | "dakika";
                            /** Format: uuid */
                            id: string;
                            /** Format: uuid */
                            konu_id: string | null;
                            /** Format: uuid */
                            ogrenci_id: string;
                            /** Format: uuid */
                            plan_id: string;
                            sira: number;
                            surum: number;
                            /** Format: date-time */
                            tamamlandi_at: string | null;
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
    "/v1/ogrenme/kurumlar/{kurum_id}/planlar/{id}/kopyala": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Haftayi cogalt (gecen haftayi bu haftaya): gorevler hedef haftaya ayni gun siralarinda kopyalanir; gerceklesen ve durum sifirlanir, devredilmis gorevler kopyalanmaz, hedef plan taslaktir. Hedef haftada gorevli plan varsa 409 `plan_dolu`. */
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
                         * Format: date
                         * @description Hedef haftanin Pazartesi gunu; verilmezse kaynak haftadan bir sonraki hafta.
                         */
                        hedef_hafta_baslangic?: string;
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
                            gorevler: {
                                baslik: string | null;
                                brans_kodu: string;
                                /** Format: uuid */
                                devreden_gorev_id: string | null;
                                /** @enum {string} */
                                durum: "bekliyor" | "tamam" | "kismen" | "yapilmadi" | "devredildi";
                                gerceklesen_miktar: number | null;
                                /** Format: date */
                                gun: string;
                                /** Format: date */
                                hafta_baslangic: string;
                                hedef_miktar: number;
                                /** @enum {string} */
                                hedef_turu: "soru" | "dakika";
                                /** Format: uuid */
                                id: string;
                                /** Format: uuid */
                                konu_id: string | null;
                                /** Format: uuid */
                                ogrenci_id: string;
                                /** Format: uuid */
                                plan_id: string;
                                sira: number;
                                surum: number;
                                /** Format: date-time */
                                tamamlandi_at: string | null;
                            }[];
                            /** Format: date */
                            hafta_baslangic: string;
                            /** @description Hafta sonu + 14 gun gectiyse true: yazma 409 `plan_kilitli`. */
                            kilitli: boolean;
                            /** Format: uuid */
                            ogrenci_id: string;
                            plan: {
                                /** Format: date-time */
                                created_at: string;
                                /** @enum {string} */
                                durum: "taslak" | "yayinda";
                                /** Format: date */
                                hafta_baslangic: string;
                                /** Format: uuid */
                                hazirlayan_id: string;
                                /** Format: uuid */
                                id: string;
                                not: string | null;
                                /** Format: uuid */
                                ogrenci_id: string;
                                surum: number;
                                /** Format: date-time */
                                yayin_at: string | null;
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
    "/v1/ogrenme/kurumlar/{kurum_id}/planlar/{id}/not": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /** Ogretmen notu (plan basina tek not; `null` notu siler). Yayindaki planda da yazilir. Iyimser kilit: `surum`. */
        put: {
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
                        not: string | null;
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
                            gorevler: {
                                baslik: string | null;
                                brans_kodu: string;
                                /** Format: uuid */
                                devreden_gorev_id: string | null;
                                /** @enum {string} */
                                durum: "bekliyor" | "tamam" | "kismen" | "yapilmadi" | "devredildi";
                                gerceklesen_miktar: number | null;
                                /** Format: date */
                                gun: string;
                                /** Format: date */
                                hafta_baslangic: string;
                                hedef_miktar: number;
                                /** @enum {string} */
                                hedef_turu: "soru" | "dakika";
                                /** Format: uuid */
                                id: string;
                                /** Format: uuid */
                                konu_id: string | null;
                                /** Format: uuid */
                                ogrenci_id: string;
                                /** Format: uuid */
                                plan_id: string;
                                sira: number;
                                surum: number;
                                /** Format: date-time */
                                tamamlandi_at: string | null;
                            }[];
                            /** Format: date */
                            hafta_baslangic: string;
                            /** @description Hafta sonu + 14 gun gectiyse true: yazma 409 `plan_kilitli`. */
                            kilitli: boolean;
                            /** Format: uuid */
                            ogrenci_id: string;
                            plan: {
                                /** Format: date-time */
                                created_at: string;
                                /** @enum {string} */
                                durum: "taslak" | "yayinda";
                                /** Format: date */
                                hafta_baslangic: string;
                                /** Format: uuid */
                                hazirlayan_id: string;
                                /** Format: uuid */
                                id: string;
                                not: string | null;
                                /** Format: uuid */
                                ogrenci_id: string;
                                surum: number;
                                /** Format: date-time */
                                yayin_at: string | null;
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
    "/v1/ogrenme/kurumlar/{kurum_id}/planlar/{id}/ozet": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Haftalik ozet: ders (brans) bazinda planlanan ve gerceklesen; soru ve dakika ayri toplanir. Devredilen gorevde planlanan yalniz yapilan kisimdir. Ogrenci yalniz kendi yayindaki planini gorur. */
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
                            dersler: {
                                brans_kodu: string;
                                dakika: {
                                    gerceklesen: number;
                                    planlanan: number;
                                };
                                gorev_sayisi: number;
                                soru: {
                                    gerceklesen: number;
                                    planlanan: number;
                                };
                                tamam_sayisi: number;
                            }[];
                            /** Format: date */
                            hafta_baslangic: string;
                            /** Format: uuid */
                            ogrenci_id: string;
                            /** Format: uuid */
                            plan_id: string;
                            toplam: {
                                dakika: {
                                    gerceklesen: number;
                                    planlanan: number;
                                };
                                gorev_sayisi: number;
                                soru: {
                                    gerceklesen: number;
                                    planlanan: number;
                                };
                                tamam_sayisi: number;
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
    "/v1/ogrenme/kurumlar/{kurum_id}/planlar/{id}/yayinla": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Taslagi yayinla (ogrenci artik gorur). Yayindaki planda tekrar cagri etkisizdir (200). */
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
                            gorevler: {
                                baslik: string | null;
                                brans_kodu: string;
                                /** Format: uuid */
                                devreden_gorev_id: string | null;
                                /** @enum {string} */
                                durum: "bekliyor" | "tamam" | "kismen" | "yapilmadi" | "devredildi";
                                gerceklesen_miktar: number | null;
                                /** Format: date */
                                gun: string;
                                /** Format: date */
                                hafta_baslangic: string;
                                hedef_miktar: number;
                                /** @enum {string} */
                                hedef_turu: "soru" | "dakika";
                                /** Format: uuid */
                                id: string;
                                /** Format: uuid */
                                konu_id: string | null;
                                /** Format: uuid */
                                ogrenci_id: string;
                                /** Format: uuid */
                                plan_id: string;
                                sira: number;
                                surum: number;
                                /** Format: date-time */
                                tamamlandi_at: string | null;
                            }[];
                            /** Format: date */
                            hafta_baslangic: string;
                            /** @description Hafta sonu + 14 gun gectiyse true: yazma 409 `plan_kilitli`. */
                            kilitli: boolean;
                            /** Format: uuid */
                            ogrenci_id: string;
                            plan: {
                                /** Format: date-time */
                                created_at: string;
                                /** @enum {string} */
                                durum: "taslak" | "yayinda";
                                /** Format: date */
                                hafta_baslangic: string;
                                /** Format: uuid */
                                hazirlayan_id: string;
                                /** Format: uuid */
                                id: string;
                                not: string | null;
                                /** Format: uuid */
                                ogrenci_id: string;
                                surum: number;
                                /** Format: date-time */
                                yayin_at: string | null;
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
    "/v1/ogrenme/kurumlar/{kurum_id}/planlar/toplu": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Gruba toplu plan: grubun etkin ogrencilerinden o haftada plani olmayanlara ayni gorevlerle (`sablon_id` ya da `gorevler`) plan acilir. Idempotent: plani olan ogrenci degistirilmez (`zaten_var`), tekrar cagri yeni plan ya da gorev uretmez. `yayinla` true ise planlar yayinda acilir. */
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
                        gorevler?: {
                            baslik?: string;
                            brans_kodu: string;
                            gun_sirasi: number;
                            hedef_miktar: number;
                            /** @enum {string} */
                            hedef_turu: "soru" | "dakika";
                            /** Format: uuid */
                            konu_id?: string;
                            /** @default 0 */
                            sira?: number;
                        }[];
                        /** Format: uuid */
                        grup_id: string;
                        /**
                         * Format: date
                         * @description Haftanin Pazartesi gunu.
                         */
                        hafta_baslangic: string;
                        /** Format: uuid */
                        sablon_id?: string;
                        /** @default false */
                        yayinla?: boolean;
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
                            /** @description Plani zaten olan ogrenci sayisi (degistirilmez). */
                            atlanan: number;
                            /** Format: uuid */
                            grup_id: string;
                            /** Format: date */
                            hafta_baslangic: string;
                            olusturulan: number;
                            planlar: {
                                /** Format: uuid */
                                ogrenci_id: string;
                                /** Format: uuid */
                                plan_id: string;
                                /** @enum {string} */
                                sonuc: "olusturuldu" | "zaten_var";
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
    "/v1/ogrenme/kurumlar/{kurum_id}/rapor/disa-aktar": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Panel gostergelerini gercek .xlsx olarak indir: kurum ozeti, grup ve ogretmen kirilim sayfalari. Sayilar panelle ayni fonksiyonlardan gelir; kapsam rolun izin kapsamina gore daralir. */
        get: {
            parameters: {
                query?: {
                    /** @description Son N gün (kurum saat dilimiyle, bugün dahil). */
                    donem?: "7" | "30";
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
    "/v1/ogrenme/kurumlar/{kurum_id}/rapor/odev": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Teslim edilmeyen odev satirlari (teslim tarihi donemde gelmis, hala `atandi`); en eski teslim tarihi once; en cok 200 satir. */
        get: {
            parameters: {
                query?: {
                    /** @description Son N gün (kurum saat dilimiyle, bugün dahil). */
                    donem?: "7" | "30";
                    /** @description Yalnız bu grubun satırları. */
                    grup_id?: string;
                    /** @description Yalnız bu öğretmenin satırları. */
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
                            satirlar: {
                                baslik: string;
                                durum: string;
                                gorunen_ad: string | null;
                                /** Format: uuid */
                                odev_id: string;
                                /** Format: uuid */
                                ogrenci_id: string;
                                /** Format: uuid */
                                ogrenci_odev_id: string;
                                /** Format: date-time */
                                son_teslim_at: string;
                            }[];
                            toplam_satir: number;
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
    "/v1/ogrenme/kurumlar/{kurum_id}/rapor/ozet": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Yonetici paneli: odev teslim orani, plan tamamlama orani, soru ilk cevap suresi (ortalama/medyan) ve etkin ogrenci; kurum, grup ve ogretmen kirilimi. Ogretmen yalniz atandigi gruplari gorur. Modul kapaliysa gosterge `null`. */
        get: {
            parameters: {
                query?: {
                    /** @description Son N gün (kurum saat dilimiyle, bugün dahil). */
                    donem?: "7" | "30";
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
                            /**
                             * Format: date
                             * @description Kurum yerel günü, dahil.
                             */
                            baslangic: string;
                            /**
                             * Format: date
                             * @description Kurum yerel günü, dahil (bugün).
                             */
                            bitis: string;
                            donem_gun: number;
                            gruplar: {
                                etkin_ogrenci: number;
                                /** Format: uuid */
                                grup_id: string;
                                /** @description Modül kurumda kapalıysa `null`. */
                                odev: {
                                    oran: number | null;
                                    pay: number;
                                    payda: number;
                                } | null;
                                /** @description Modül kurumda kapalıysa `null`. */
                                plan: {
                                    oran: number | null;
                                    pay: number;
                                    payda: number;
                                } | null;
                                /** @description Modül kurumda kapalıysa `null`. */
                                soru: {
                                    cevaplanan: number;
                                    medyan_ilk_cevap_sn: number | null;
                                    ortalama_ilk_cevap_sn: number | null;
                                    soru_sayisi: number;
                                } | null;
                            }[];
                            /**
                             * @description Yanıtı daraltan izin kapsamı (öğretmen: `grup`).
                             * @enum {string}
                             */
                            kapsam: "kendi" | "grup" | "sube" | "kurum";
                            kurum: {
                                /** @description Son 7 günde yoklaması alınan, ödev teslim eden, plan görevi tamamlayan veya soru soran öğrenci. */
                                etkin_ogrenci: number;
                                /** @description Modül kurumda kapalıysa `null`. */
                                odev: {
                                    oran: number | null;
                                    pay: number;
                                    payda: number;
                                } | null;
                                /** @description Modül kurumda kapalıysa `null`. */
                                plan: {
                                    oran: number | null;
                                    pay: number;
                                    payda: number;
                                } | null;
                                /** @description Modül kurumda kapalıysa `null`. */
                                soru: {
                                    cevaplanan: number;
                                    medyan_ilk_cevap_sn: number | null;
                                    ortalama_ilk_cevap_sn: number | null;
                                    soru_sayisi: number;
                                } | null;
                            };
                            ogretmenler: {
                                /** @description Modül kurumda kapalıysa `null`. */
                                odev: {
                                    oran: number | null;
                                    pay: number;
                                    payda: number;
                                } | null;
                                /** Format: uuid */
                                ogretmen_id: string;
                                /** @description Modül kurumda kapalıysa `null`. */
                                plan: {
                                    oran: number | null;
                                    pay: number;
                                    payda: number;
                                } | null;
                                /** @description Modül kurumda kapalıysa `null`. */
                                soru: {
                                    cevaplanan: number;
                                    medyan_ilk_cevap_sn: number | null;
                                    ortalama_ilk_cevap_sn: number | null;
                                    soru_sayisi: number;
                                } | null;
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
    "/v1/ogrenme/kurumlar/{kurum_id}/rapor/plan": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Plan tamamlama alt listesi: ogrenci bazinda tamam/kismen/yapilmadi/bekliyor, en dusuk oran once; en cok 200 satir. */
        get: {
            parameters: {
                query?: {
                    /** @description Son N gün (kurum saat dilimiyle, bugün dahil). */
                    donem?: "7" | "30";
                    /** @description Yalnız bu grubun satırları. */
                    grup_id?: string;
                    /** @description Yalnız bu öğretmenin satırları. */
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
                            satirlar: {
                                ayrinti: {
                                    [key: string]: number;
                                };
                                gorunen_ad: string | null;
                                /** Format: uuid */
                                ogrenci_id: string;
                                oran: number | null;
                                pay: number;
                                payda: number;
                            }[];
                            toplam_satir: number;
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
    "/v1/ogrenme/kurumlar/{kurum_id}/rapor/soru": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Donemde sorulan sorular: cevap bekleyenler ve en uzun ilk cevap suresi once; en cok 200 satir. */
        get: {
            parameters: {
                query?: {
                    /** @description Son N gün (kurum saat dilimiyle, bugün dahil). */
                    donem?: "7" | "30";
                    /** @description Yalnız bu grubun satırları. */
                    grup_id?: string;
                    /** @description Yalnız bu öğretmenin satırları. */
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
                            satirlar: {
                                brans_kodu: string;
                                durum: string;
                                gorunen_ad: string | null;
                                /** @description Cevap beklemede ise `null`. */
                                ilk_cevap_sn: number | null;
                                /** Format: uuid */
                                ogrenci_id: string;
                                /** Format: uuid */
                                soru_id: string;
                                /** Format: date-time */
                                sorulma_at: string;
                            }[];
                            toplam_satir: number;
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
    "/v1/ogrenme/kurumlar/{kurum_id}/soru-ayarlari": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Kurum soru ayarlari (kayit yoksa varsayilanlar: gunde 3 soru, aylik sinirsiz, 3 takip, ses 180 sn, fotograf 30 gun). */
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
                            /** @description `null`: sınırsız (varsayılan). Abonelik plan üst sınırıyla `LEAST` alınır (henüz yok). */
                            aylik_soru_limiti: number | null;
                            foto_saklama_gun: number;
                            /** @description `null`: sınırsız. Varsayılan 3. */
                            gunluk_soru_limiti: number | null;
                            ses_azami_sn: number;
                            soru_basina_takip_limiti: number;
                            surum: number | null;
                            /** @description `true`: kurum henüz ayar kaydetmedi, varsayılanlar geçerli. */
                            varsayilan: boolean;
                        };
                    };
                };
            };
        };
        /** Kurum soru ayarlarini guncelle (gonderilen alanlar degisir; limit `null` = sinirsiz). Plan ust siniri abonelik blogu gelince `LEAST` ile uygulanir. */
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
                        aylik_soru_limiti?: number | null;
                        foto_saklama_gun?: number;
                        gunluk_soru_limiti?: number | null;
                        ses_azami_sn?: number;
                        soru_basina_takip_limiti?: number;
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
                            /** @description `null`: sınırsız (varsayılan). Abonelik plan üst sınırıyla `LEAST` alınır (henüz yok). */
                            aylik_soru_limiti: number | null;
                            foto_saklama_gun: number;
                            /** @description `null`: sınırsız. Varsayılan 3. */
                            gunluk_soru_limiti: number | null;
                            ses_azami_sn: number;
                            soru_basina_takip_limiti: number;
                            surum: number | null;
                            /** @description `true`: kurum henüz ayar kaydetmedi, varsayılanlar geçerli. */
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
    "/v1/ogrenme/kurumlar/{kurum_id}/soru-bildirimleri": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Uygunsuz icerik bildirimleri (varsayilan acik olanlar), en yeni once, imleçli. */
        get: {
            parameters: {
                query?: {
                    durum?: "acik" | "kapandi";
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
                            bildirimler: {
                                aciklama: string | null;
                                bildiren_adi: string | null;
                                /** Format: uuid */
                                bildiren_id: string;
                                brans_kodu: string;
                                /** Format: date-time */
                                created_at: string;
                                /** @enum {string} */
                                durum: "acik" | "kapandi";
                                /** Format: uuid */
                                id: string;
                                /** Format: date-time */
                                kapandi_at: string | null;
                                kapatma_notu: string | null;
                                /** Format: uuid */
                                mesaj_id: string | null;
                                /** @enum {string} */
                                neden: "uygunsuz" | "kisisel_bilgi" | "diger";
                                /** Format: uuid */
                                soru_id: string;
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
    "/v1/ogrenme/kurumlar/{kurum_id}/soru-bildirimleri/{id}/kapat": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Bildirimi kapat (not isteğe bagli). Zaten kapaliysa etkisiz. */
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
                        not?: string;
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
                            bildiren_adi: string | null;
                            /** Format: uuid */
                            bildiren_id: string;
                            brans_kodu: string;
                            /** Format: date-time */
                            created_at: string;
                            /** @enum {string} */
                            durum: "acik" | "kapandi";
                            /** Format: uuid */
                            id: string;
                            /** Format: date-time */
                            kapandi_at: string | null;
                            kapatma_notu: string | null;
                            /** Format: uuid */
                            mesaj_id: string | null;
                            /** @enum {string} */
                            neden: "uygunsuz" | "kisisel_bilgi" | "diger";
                            /** Format: uuid */
                            soru_id: string;
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
    "/v1/ogrenme/kurumlar/{kurum_id}/soru-kotam": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Kalan soru hakki (gunluk/aylik) ve sifirlanma zamanlari. */
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
                            aylik_kalan: number | null;
                            aylik_kullanilan: number;
                            aylik_limit: number | null;
                            /** Format: date-time */
                            aylik_sifirlanma_at: string;
                            /** @description `null`: sınırsız. */
                            gunluk_kalan: number | null;
                            gunluk_kullanilan: number;
                            gunluk_limit: number | null;
                            /**
                             * Format: date-time
                             * @description Kurumun yerel gününün bitişi (UTC).
                             */
                            gunluk_sifirlanma_at: string;
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
    "/v1/ogrenme/kurumlar/{kurum_id}/soru-masalari": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Soru masalari ve uyeleri (arsivlenmemis). */
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
                            masalar: {
                                ad: string;
                                aktif: boolean;
                                /** Format: date-time */
                                arsivlendi_at: string | null;
                                brans_kodu: string;
                                /** Format: date-time */
                                created_at: string;
                                /** Format: uuid */
                                id: string;
                                surum: number;
                                uyeler: {
                                    gorunen_ad: string | null;
                                    /** Format: uuid */
                                    ogretmen_id: string;
                                }[];
                            }[];
                        };
                    };
                };
            };
        };
        put?: never;
        /** Soru masasi olustur (brans basina tek arsivlenmemis masa; varsa 409 `masa_var`). Uyeler etkin personel olmali. */
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
                        /** @default true */
                        aktif?: boolean;
                        brans_kodu: string;
                        ogretmen_idleri?: string[];
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
                            brans_kodu: string;
                            /** Format: date-time */
                            created_at: string;
                            /** Format: uuid */
                            id: string;
                            surum: number;
                            uyeler: {
                                gorunen_ad: string | null;
                                /** Format: uuid */
                                ogretmen_id: string;
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
    "/v1/ogrenme/kurumlar/{kurum_id}/soru-masalari/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** Masayi arsivle (acik sorular masayla kalir; yeni soru artik bu masaya yonlenmez). */
        delete: {
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
        /** Masa adi/aktiflik guncelle (`surum` zorunlu; eskiyse 409 `surum_cakismasi`). */
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
                        aktif?: boolean;
                        surum: number;
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
                            brans_kodu: string;
                            /** Format: date-time */
                            created_at: string;
                            /** Format: uuid */
                            id: string;
                            surum: number;
                            uyeler: {
                                gorunen_ad: string | null;
                                /** Format: uuid */
                                ogretmen_id: string;
                            }[];
                        };
                    };
                };
            };
        };
        trace?: never;
    };
    "/v1/ogrenme/kurumlar/{kurum_id}/soru-masalari/{id}/uyeler": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Masaya ogretmen ekle (zaten uyeyse etkisiz). */
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
                        ogretmen_id: string;
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
                            brans_kodu: string;
                            /** Format: date-time */
                            created_at: string;
                            /** Format: uuid */
                            id: string;
                            surum: number;
                            uyeler: {
                                gorunen_ad: string | null;
                                /** Format: uuid */
                                ogretmen_id: string;
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
    "/v1/ogrenme/kurumlar/{kurum_id}/soru-masalari/{id}/uyeler/{ogretmen_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** Masadan ogretmen cikar. */
        delete: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                    kurum_id: string;
                    ogretmen_id: string;
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
        patch?: never;
        trace?: never;
    };
    "/v1/ogrenme/kurumlar/{kurum_id}/soru-musaitligim": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Ogretmenin "musait / bugun cevap veremiyorum" durumu (kurum yerel gunu icin gecerli). */
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
                            musait: boolean;
                            /** @description Kurum yerel günü (YYYY-AA-GG); o gün geçince kendiliğinden geçersiz. */
                            musait_degil_tarihi: string | null;
                        };
                    };
                };
            };
        };
        /** `musait: false`: bugun (kurum yerel gunu) cevap veremiyorum; ogrencinin tahmini cevap yanitinda `hedef_musait: false` gorunur. Gun gecince kendiliginden gecersiz olur. */
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
                        musait: boolean;
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
                            musait: boolean;
                            /** @description Kurum yerel günü (YYYY-AA-GG); o gün geçince kendiliğinden geçersiz. */
                            musait_degil_tarihi: string | null;
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
    "/v1/ogrenme/kurumlar/{kurum_id}/soru-olcum": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Olcum ozeti (kurum yerel gunu, tarih araligi; varsayilan son 30 gun): soru sayisi, cevaplanan, ortalama ilk cevap suresi, "anladim" orani (anladim / cevaplanan); ogretmen (ilk cevaplayan) ve brans kirilimi. */
        get: {
            parameters: {
                query?: {
                    /** @description Varsayılan: 30 gün önce (kurum yerel günü). */
                    baslangic?: string;
                    /** @description Dahil. Varsayılan: bugün. */
                    bitis?: string;
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
                            /** @description Öğrencinin "anladım" dediği. */
                            anladim: number;
                            /** @description anladım / cevaplanan; cevaplanan 0 ise `null`. */
                            anladim_orani: number | null;
                            baslangic: string;
                            bitis: string;
                            branslar: {
                                /** @description Öğrencinin "anladım" dediği. */
                                anladim: number;
                                /** @description anladım / cevaplanan; cevaplanan 0 ise `null`. */
                                anladim_orani: number | null;
                                brans_kodu: string;
                                cevaplanan: number;
                                ortalama_ilk_cevap_sn: number | null;
                                soru_sayisi: number;
                            }[];
                            cevaplanan: number;
                            ogretmenler: {
                                /** @description Öğrencinin "anladım" dediği. */
                                anladim: number;
                                /** @description anladım / cevaplanan; cevaplanan 0 ise `null`. */
                                anladim_orani: number | null;
                                cevaplanan: number;
                                gorunen_ad: string | null;
                                /** Format: uuid */
                                ogretmen_id: string;
                                ortalama_ilk_cevap_sn: number | null;
                                soru_sayisi: number;
                            }[];
                            ortalama_ilk_cevap_sn: number | null;
                            soru_sayisi: number;
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
    "/v1/ogrenme/kurumlar/{kurum_id}/sorular": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Soru sor (yalniz ogrenci). Once medya servisine yukleyin; dosyalar `hazir` olunca cagirin (kopya yoksa/hazir degilse 409 `dosya_hazir_degil`, istemci yeniden dener). Brans/konu dogrulanir, yonlendirme (atanan ogretmen > masa > yonetici) ve gunluk/aylik kota (429 `kota_asildi`) ayni islemde. `istek_id` ayni ise onceki sonuc doner (200, `tekrar: true`, kota harcanmaz). */
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
                        baslik?: string;
                        brans_kodu: string;
                        /** @description Medya dosya kimlikleri (`soru_fotografi`, hazır). */
                        fotograflar: string[];
                        isaretler?: {
                            cizim_verisi?: {
                                [key: string]: unknown;
                            } | unknown[];
                            /**
                             * Format: uuid
                             * @description `fotograflar` içindeki fotoğraflardan biri.
                             */
                            kaynak_dosya_id: string;
                            /**
                             * Format: uuid
                             * @description Düzleştirilmiş görsel (`soru_cizim`).
                             */
                            medya_dosya_id: string;
                        }[];
                        /**
                         * Format: uuid
                         * @description İstemci yeniden denemesine karşı tekil anahtar (UUID). Aynı kurumda aynı `istek_id` ikinci kez gelirse yeni kayıt açılmaz, önceki sonuç döner.
                         */
                        istek_id?: string;
                        /** Format: uuid */
                        konu_id?: string;
                        /** @description "Burada takıldım" notu. */
                        metin?: string;
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
                            /** @description `true`: medya servisinden adres alınamadı; ek `adres` alanları `null`, soru yine döner. */
                            adres_alinamadi: boolean;
                            /** Format: uuid */
                            atanan_ogretmen_id: string | null;
                            baslik: string | null;
                            brans_kodu: string;
                            /** Format: date-time */
                            cozuldu_at: string | null;
                            /** Format: date-time */
                            created_at: string;
                            /** @enum {string} */
                            durum: "acik" | "cevaplandi" | "takip_bekliyor" | "cozuldu" | "kapandi";
                            /** Format: date-time */
                            foto_silinme_at: string | null;
                            fotograflar: {
                                adres: {
                                    asil_url: string;
                                    /** Format: date-time */
                                    gecerlilik_bitis_at: string;
                                    genislik: number | null;
                                    kucuk_url: string | null;
                                    mime_tipi: string;
                                    orta_url: string | null;
                                    sure_sn: number | null;
                                    yukseklik: number | null;
                                } | null;
                                /** Format: uuid */
                                medya_dosya_id: string;
                                sira: number;
                            }[];
                            /** Format: uuid */
                            id: string;
                            /** Format: date-time */
                            ilk_cevap_at: string | null;
                            kalan_takip_hakki: number;
                            /** Format: uuid */
                            konu_id: string | null;
                            kota: {
                                aylik_kalan: number | null;
                                aylik_kullanilan: number;
                                aylik_limit: number | null;
                                /** Format: date-time */
                                aylik_sifirlanma_at: string;
                                /** @description `null`: sınırsız. */
                                gunluk_kalan: number | null;
                                gunluk_kullanilan: number;
                                gunluk_limit: number | null;
                                /**
                                 * Format: date-time
                                 * @description Kurumun yerel gününün bitişi (UTC).
                                 */
                                gunluk_sifirlanma_at: string;
                            };
                            /** Format: uuid */
                            masa_id: string | null;
                            mesaj_sayisi: number;
                            mesajlar: {
                                /** Format: date-time */
                                created_at: string;
                                derste_konusalim: boolean;
                                ekler: {
                                    /** @description Okuma adresi (10 dk geçerli). Medya yanıt vermediyse ya da dosya yoksa `null`. */
                                    adres: {
                                        asil_url: string;
                                        /** Format: date-time */
                                        gecerlilik_bitis_at: string;
                                        genislik: number | null;
                                        kucuk_url: string | null;
                                        mime_tipi: string;
                                        orta_url: string | null;
                                        sure_sn: number | null;
                                        yukseklik: number | null;
                                    } | null;
                                    cizim_verisi: ({
                                        [key: string]: unknown;
                                    } | unknown[]) | null;
                                    /** Format: uuid */
                                    id: string;
                                    /** Format: uuid */
                                    kaynak_dosya_id: string | null;
                                    /** Format: uuid */
                                    medya_dosya_id: string;
                                    sira: number;
                                    sure_sn: number | null;
                                    /** @enum {string} */
                                    tur: "fotograf" | "cizimli_fotograf" | "ses";
                                }[];
                                /** Format: uuid */
                                id: string;
                                metin: string | null;
                                sira: number;
                                /** @enum {string} */
                                tur: "soru" | "cevap" | "takip";
                                yazar_adi: string | null;
                                /** Format: uuid */
                                yazar_id: string;
                                /** @enum {string} */
                                yazar_rolu: "ogrenci" | "ogretmen" | "yonetici";
                            }[];
                            metin_onizleme: string | null;
                            ogrenci_adi: string | null;
                            /** Format: uuid */
                            ogrenci_id: string;
                            /** Format: date-time */
                            son_hareket_at: string;
                            tahmini_cevap: {
                                /** @description `false`: hedef öğretmen(ler) bugün cevap veremiyorum dedi. Yönetici kuyruğunda `null`. */
                                hedef_musait: boolean | null;
                                ornek_sayisi: number;
                                /** @description Hedefin son 30 gündeki ilk cevap sürelerinin medyanı; 3'ten az örnek varsa `null`. */
                                sure_sn: number | null;
                            };
                            /** @description `true`: aynı `istek_id` önceki istekle işlendi, kota tüketilmedi. */
                            tekrar: boolean;
                            /** Format: uuid */
                            ustlenen_id: string | null;
                            yeniden_acilma_sayisi: number;
                            /** @enum {string} */
                            yonlendirme: "atanan_ogretmen" | "masa" | "yonetici";
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
                            /** @description `true`: medya servisinden adres alınamadı; ek `adres` alanları `null`, soru yine döner. */
                            adres_alinamadi: boolean;
                            /** Format: uuid */
                            atanan_ogretmen_id: string | null;
                            baslik: string | null;
                            brans_kodu: string;
                            /** Format: date-time */
                            cozuldu_at: string | null;
                            /** Format: date-time */
                            created_at: string;
                            /** @enum {string} */
                            durum: "acik" | "cevaplandi" | "takip_bekliyor" | "cozuldu" | "kapandi";
                            /** Format: date-time */
                            foto_silinme_at: string | null;
                            fotograflar: {
                                adres: {
                                    asil_url: string;
                                    /** Format: date-time */
                                    gecerlilik_bitis_at: string;
                                    genislik: number | null;
                                    kucuk_url: string | null;
                                    mime_tipi: string;
                                    orta_url: string | null;
                                    sure_sn: number | null;
                                    yukseklik: number | null;
                                } | null;
                                /** Format: uuid */
                                medya_dosya_id: string;
                                sira: number;
                            }[];
                            /** Format: uuid */
                            id: string;
                            /** Format: date-time */
                            ilk_cevap_at: string | null;
                            kalan_takip_hakki: number;
                            /** Format: uuid */
                            konu_id: string | null;
                            kota: {
                                aylik_kalan: number | null;
                                aylik_kullanilan: number;
                                aylik_limit: number | null;
                                /** Format: date-time */
                                aylik_sifirlanma_at: string;
                                /** @description `null`: sınırsız. */
                                gunluk_kalan: number | null;
                                gunluk_kullanilan: number;
                                gunluk_limit: number | null;
                                /**
                                 * Format: date-time
                                 * @description Kurumun yerel gününün bitişi (UTC).
                                 */
                                gunluk_sifirlanma_at: string;
                            };
                            /** Format: uuid */
                            masa_id: string | null;
                            mesaj_sayisi: number;
                            mesajlar: {
                                /** Format: date-time */
                                created_at: string;
                                derste_konusalim: boolean;
                                ekler: {
                                    /** @description Okuma adresi (10 dk geçerli). Medya yanıt vermediyse ya da dosya yoksa `null`. */
                                    adres: {
                                        asil_url: string;
                                        /** Format: date-time */
                                        gecerlilik_bitis_at: string;
                                        genislik: number | null;
                                        kucuk_url: string | null;
                                        mime_tipi: string;
                                        orta_url: string | null;
                                        sure_sn: number | null;
                                        yukseklik: number | null;
                                    } | null;
                                    cizim_verisi: ({
                                        [key: string]: unknown;
                                    } | unknown[]) | null;
                                    /** Format: uuid */
                                    id: string;
                                    /** Format: uuid */
                                    kaynak_dosya_id: string | null;
                                    /** Format: uuid */
                                    medya_dosya_id: string;
                                    sira: number;
                                    sure_sn: number | null;
                                    /** @enum {string} */
                                    tur: "fotograf" | "cizimli_fotograf" | "ses";
                                }[];
                                /** Format: uuid */
                                id: string;
                                metin: string | null;
                                sira: number;
                                /** @enum {string} */
                                tur: "soru" | "cevap" | "takip";
                                yazar_adi: string | null;
                                /** Format: uuid */
                                yazar_id: string;
                                /** @enum {string} */
                                yazar_rolu: "ogrenci" | "ogretmen" | "yonetici";
                            }[];
                            metin_onizleme: string | null;
                            ogrenci_adi: string | null;
                            /** Format: uuid */
                            ogrenci_id: string;
                            /** Format: date-time */
                            son_hareket_at: string;
                            tahmini_cevap: {
                                /** @description `false`: hedef öğretmen(ler) bugün cevap veremiyorum dedi. Yönetici kuyruğunda `null`. */
                                hedef_musait: boolean | null;
                                ornek_sayisi: number;
                                /** @description Hedefin son 30 gündeki ilk cevap sürelerinin medyanı; 3'ten az örnek varsa `null`. */
                                sure_sn: number | null;
                            };
                            /** @description `true`: aynı `istek_id` önceki istekle işlendi, kota tüketilmedi. */
                            tekrar: boolean;
                            /** Format: uuid */
                            ustlenen_id: string | null;
                            yeniden_acilma_sayisi: number;
                            /** @enum {string} */
                            yonlendirme: "atanan_ogretmen" | "masa" | "yonetici";
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
    "/v1/ogrenme/kurumlar/{kurum_id}/sorular/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Soru detayi (ileti dizisi, ekler, okuma adresleri 10 dk gecerli). Ogrenci yalniz kendi sorusunu; ogretmen kendisine yonlenen/ustlendigi/masasindaki sorulari; `soru.yonet` kurumdaki hepsini gorur, digerleri 404. Medya yanit vermezse soru yine doner (`adres_alinamadi: true`). */
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
                            /** @description `true`: medya servisinden adres alınamadı; ek `adres` alanları `null`, soru yine döner. */
                            adres_alinamadi: boolean;
                            /** Format: uuid */
                            atanan_ogretmen_id: string | null;
                            baslik: string | null;
                            brans_kodu: string;
                            /** Format: date-time */
                            cozuldu_at: string | null;
                            /** Format: date-time */
                            created_at: string;
                            /** @enum {string} */
                            durum: "acik" | "cevaplandi" | "takip_bekliyor" | "cozuldu" | "kapandi";
                            /** Format: date-time */
                            foto_silinme_at: string | null;
                            fotograflar: {
                                adres: {
                                    asil_url: string;
                                    /** Format: date-time */
                                    gecerlilik_bitis_at: string;
                                    genislik: number | null;
                                    kucuk_url: string | null;
                                    mime_tipi: string;
                                    orta_url: string | null;
                                    sure_sn: number | null;
                                    yukseklik: number | null;
                                } | null;
                                /** Format: uuid */
                                medya_dosya_id: string;
                                sira: number;
                            }[];
                            /** Format: uuid */
                            id: string;
                            /** Format: date-time */
                            ilk_cevap_at: string | null;
                            kalan_takip_hakki: number;
                            /** Format: uuid */
                            konu_id: string | null;
                            /** Format: uuid */
                            masa_id: string | null;
                            mesaj_sayisi: number;
                            mesajlar: {
                                /** Format: date-time */
                                created_at: string;
                                derste_konusalim: boolean;
                                ekler: {
                                    /** @description Okuma adresi (10 dk geçerli). Medya yanıt vermediyse ya da dosya yoksa `null`. */
                                    adres: {
                                        asil_url: string;
                                        /** Format: date-time */
                                        gecerlilik_bitis_at: string;
                                        genislik: number | null;
                                        kucuk_url: string | null;
                                        mime_tipi: string;
                                        orta_url: string | null;
                                        sure_sn: number | null;
                                        yukseklik: number | null;
                                    } | null;
                                    cizim_verisi: ({
                                        [key: string]: unknown;
                                    } | unknown[]) | null;
                                    /** Format: uuid */
                                    id: string;
                                    /** Format: uuid */
                                    kaynak_dosya_id: string | null;
                                    /** Format: uuid */
                                    medya_dosya_id: string;
                                    sira: number;
                                    sure_sn: number | null;
                                    /** @enum {string} */
                                    tur: "fotograf" | "cizimli_fotograf" | "ses";
                                }[];
                                /** Format: uuid */
                                id: string;
                                metin: string | null;
                                sira: number;
                                /** @enum {string} */
                                tur: "soru" | "cevap" | "takip";
                                yazar_adi: string | null;
                                /** Format: uuid */
                                yazar_id: string;
                                /** @enum {string} */
                                yazar_rolu: "ogrenci" | "ogretmen" | "yonetici";
                            }[];
                            metin_onizleme: string | null;
                            ogrenci_adi: string | null;
                            /** Format: uuid */
                            ogrenci_id: string;
                            /** Format: date-time */
                            son_hareket_at: string;
                            /** Format: uuid */
                            ustlenen_id: string | null;
                            yeniden_acilma_sayisi: number;
                            /** @enum {string} */
                            yonlendirme: "atanan_ogretmen" | "masa" | "yonetici";
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
    "/v1/ogrenme/kurumlar/{kurum_id}/sorular/{id}/anladim": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** "Anladim": cevaplanmis soru `cozuldu` olur; `ogrenme.soru.cozuldu.v1` (dosya_idleri, silinecek_at = simdi + foto_saklama_gun). Zaten cozulduyse etkisiz (olay yok). Hic cevaplanmamissa 409 `soru_durumu_gecersiz`. */
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
                            /** @description `true`: medya servisinden adres alınamadı; ek `adres` alanları `null`, soru yine döner. */
                            adres_alinamadi: boolean;
                            /** Format: uuid */
                            atanan_ogretmen_id: string | null;
                            baslik: string | null;
                            brans_kodu: string;
                            /** Format: date-time */
                            cozuldu_at: string | null;
                            /** Format: date-time */
                            created_at: string;
                            /** @enum {string} */
                            durum: "acik" | "cevaplandi" | "takip_bekliyor" | "cozuldu" | "kapandi";
                            /** Format: date-time */
                            foto_silinme_at: string | null;
                            fotograflar: {
                                adres: {
                                    asil_url: string;
                                    /** Format: date-time */
                                    gecerlilik_bitis_at: string;
                                    genislik: number | null;
                                    kucuk_url: string | null;
                                    mime_tipi: string;
                                    orta_url: string | null;
                                    sure_sn: number | null;
                                    yukseklik: number | null;
                                } | null;
                                /** Format: uuid */
                                medya_dosya_id: string;
                                sira: number;
                            }[];
                            /** Format: uuid */
                            id: string;
                            /** Format: date-time */
                            ilk_cevap_at: string | null;
                            kalan_takip_hakki: number;
                            /** Format: uuid */
                            konu_id: string | null;
                            /** Format: uuid */
                            masa_id: string | null;
                            mesaj_sayisi: number;
                            mesajlar: {
                                /** Format: date-time */
                                created_at: string;
                                derste_konusalim: boolean;
                                ekler: {
                                    /** @description Okuma adresi (10 dk geçerli). Medya yanıt vermediyse ya da dosya yoksa `null`. */
                                    adres: {
                                        asil_url: string;
                                        /** Format: date-time */
                                        gecerlilik_bitis_at: string;
                                        genislik: number | null;
                                        kucuk_url: string | null;
                                        mime_tipi: string;
                                        orta_url: string | null;
                                        sure_sn: number | null;
                                        yukseklik: number | null;
                                    } | null;
                                    cizim_verisi: ({
                                        [key: string]: unknown;
                                    } | unknown[]) | null;
                                    /** Format: uuid */
                                    id: string;
                                    /** Format: uuid */
                                    kaynak_dosya_id: string | null;
                                    /** Format: uuid */
                                    medya_dosya_id: string;
                                    sira: number;
                                    sure_sn: number | null;
                                    /** @enum {string} */
                                    tur: "fotograf" | "cizimli_fotograf" | "ses";
                                }[];
                                /** Format: uuid */
                                id: string;
                                metin: string | null;
                                sira: number;
                                /** @enum {string} */
                                tur: "soru" | "cevap" | "takip";
                                yazar_adi: string | null;
                                /** Format: uuid */
                                yazar_id: string;
                                /** @enum {string} */
                                yazar_rolu: "ogrenci" | "ogretmen" | "yonetici";
                            }[];
                            metin_onizleme: string | null;
                            ogrenci_adi: string | null;
                            /** Format: uuid */
                            ogrenci_id: string;
                            /** Format: date-time */
                            son_hareket_at: string;
                            /** Format: uuid */
                            ustlenen_id: string | null;
                            yeniden_acilma_sayisi: number;
                            /** @enum {string} */
                            yonlendirme: "atanan_ogretmen" | "masa" | "yonetici";
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
    "/v1/ogrenme/kurumlar/{kurum_id}/sorular/{id}/bildir": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Soruyu (ya da bir mesajini) uygunsuz icerik olarak bildir (ogrenci ve ogretmen). Ayni kisi ayni soru icin tek acik bildirim acar; tekrar cagri mevcut bildirimi dondurur. Gorunmeyen soru 404. */
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
                        aciklama?: string;
                        /** Format: uuid */
                        mesaj_id?: string;
                        /** @enum {string} */
                        neden: "uygunsuz" | "kisisel_bilgi" | "diger";
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
                            bildiren_adi: string | null;
                            /** Format: uuid */
                            bildiren_id: string;
                            brans_kodu: string;
                            /** Format: date-time */
                            created_at: string;
                            /** @enum {string} */
                            durum: "acik" | "kapandi";
                            /** Format: uuid */
                            id: string;
                            /** Format: date-time */
                            kapandi_at: string | null;
                            kapatma_notu: string | null;
                            /** Format: uuid */
                            mesaj_id: string | null;
                            /** @enum {string} */
                            neden: "uygunsuz" | "kisisel_bilgi" | "diger";
                            /** Format: uuid */
                            soru_id: string;
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
    "/v1/ogrenme/kurumlar/{kurum_id}/sorular/{id}/cevap": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Soruyu cevapla: metin ve/veya ekler (fotograf, cizimli fotograf, ses <= 180 sn; en cok 4) ya da "derste konusalim". `acik`/`takip_bekliyor` -> `cevaplandi`. Masada ilk cevaplayan `ustlenen_id` olur; sonra cevaplayan masa uyesi 409 `masa_ustlenildi` (sahip/yonetici haric). Hedefi olmayan ogretmene soru 404. */
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
                        derste_konusalim?: boolean;
                        ekler?: ({
                            /** Format: uuid */
                            medya_dosya_id: string;
                            /** @enum {string} */
                            tur: "fotograf";
                        } | {
                            /** @description Vektör çizgi verisi (JSON, en çok 256 KB). */
                            cizim_verisi?: {
                                [key: string]: unknown;
                            } | unknown[];
                            /**
                             * Format: uuid
                             * @description Üzerine çizilen, aynı sorunun fotoğrafı.
                             */
                            kaynak_dosya_id: string;
                            /**
                             * Format: uuid
                             * @description Düzleştirilmiş görsel (`soru_cizim` türünde dosya).
                             */
                            medya_dosya_id: string;
                            /** @enum {string} */
                            tur: "cizimli_fotograf";
                        } | {
                            /** Format: uuid */
                            medya_dosya_id: string;
                            sure_sn?: number;
                            /** @enum {string} */
                            tur: "ses";
                        })[];
                        /**
                         * Format: uuid
                         * @description İstemci yeniden denemesine karşı tekil anahtar (UUID). Aynı kurumda aynı `istek_id` ikinci kez gelirse yeni kayıt açılmaz, önceki sonuç döner.
                         */
                        istek_id?: string;
                        metin?: string;
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
                            /** @description `true`: medya servisinden adres alınamadı; ek `adres` alanları `null`, soru yine döner. */
                            adres_alinamadi: boolean;
                            /** Format: uuid */
                            atanan_ogretmen_id: string | null;
                            baslik: string | null;
                            brans_kodu: string;
                            /** Format: date-time */
                            cozuldu_at: string | null;
                            /** Format: date-time */
                            created_at: string;
                            /** @enum {string} */
                            durum: "acik" | "cevaplandi" | "takip_bekliyor" | "cozuldu" | "kapandi";
                            /** Format: date-time */
                            foto_silinme_at: string | null;
                            fotograflar: {
                                adres: {
                                    asil_url: string;
                                    /** Format: date-time */
                                    gecerlilik_bitis_at: string;
                                    genislik: number | null;
                                    kucuk_url: string | null;
                                    mime_tipi: string;
                                    orta_url: string | null;
                                    sure_sn: number | null;
                                    yukseklik: number | null;
                                } | null;
                                /** Format: uuid */
                                medya_dosya_id: string;
                                sira: number;
                            }[];
                            /** Format: uuid */
                            id: string;
                            /** Format: date-time */
                            ilk_cevap_at: string | null;
                            kalan_takip_hakki: number;
                            /** Format: uuid */
                            konu_id: string | null;
                            /** Format: uuid */
                            masa_id: string | null;
                            mesaj_sayisi: number;
                            mesajlar: {
                                /** Format: date-time */
                                created_at: string;
                                derste_konusalim: boolean;
                                ekler: {
                                    /** @description Okuma adresi (10 dk geçerli). Medya yanıt vermediyse ya da dosya yoksa `null`. */
                                    adres: {
                                        asil_url: string;
                                        /** Format: date-time */
                                        gecerlilik_bitis_at: string;
                                        genislik: number | null;
                                        kucuk_url: string | null;
                                        mime_tipi: string;
                                        orta_url: string | null;
                                        sure_sn: number | null;
                                        yukseklik: number | null;
                                    } | null;
                                    cizim_verisi: ({
                                        [key: string]: unknown;
                                    } | unknown[]) | null;
                                    /** Format: uuid */
                                    id: string;
                                    /** Format: uuid */
                                    kaynak_dosya_id: string | null;
                                    /** Format: uuid */
                                    medya_dosya_id: string;
                                    sira: number;
                                    sure_sn: number | null;
                                    /** @enum {string} */
                                    tur: "fotograf" | "cizimli_fotograf" | "ses";
                                }[];
                                /** Format: uuid */
                                id: string;
                                metin: string | null;
                                sira: number;
                                /** @enum {string} */
                                tur: "soru" | "cevap" | "takip";
                                yazar_adi: string | null;
                                /** Format: uuid */
                                yazar_id: string;
                                /** @enum {string} */
                                yazar_rolu: "ogrenci" | "ogretmen" | "yonetici";
                            }[];
                            metin_onizleme: string | null;
                            ogrenci_adi: string | null;
                            /** Format: uuid */
                            ogrenci_id: string;
                            /** Format: date-time */
                            son_hareket_at: string;
                            /** Format: uuid */
                            ustlenen_id: string | null;
                            yeniden_acilma_sayisi: number;
                            /** @enum {string} */
                            yonlendirme: "atanan_ogretmen" | "masa" | "yonetici";
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
    "/v1/ogrenme/kurumlar/{kurum_id}/sorular/{id}/takip": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** "Hala anlamadim" + takip sorusu: `cevaplandi` -> `takip_bekliyor`. `cozuldu` soru yeniden acilir (`ogrenme.soru.yeniden_acildi.v1`, fotograf silinme zamani temizlenir). Takip kotaya girmez; `soru_basina_takip_limiti` asilirsa 422 `takip_limiti_asildi`. `istek_id` ile tekrarlanabilir. */
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
                        ekler?: ({
                            /** Format: uuid */
                            medya_dosya_id: string;
                            /** @enum {string} */
                            tur: "fotograf";
                        } | {
                            cizim_verisi?: {
                                [key: string]: unknown;
                            } | unknown[];
                            /** Format: uuid */
                            kaynak_dosya_id: string;
                            /** Format: uuid */
                            medya_dosya_id: string;
                            /** @enum {string} */
                            tur: "cizimli_fotograf";
                        })[];
                        /**
                         * Format: uuid
                         * @description İstemci yeniden denemesine karşı tekil anahtar (UUID). Aynı kurumda aynı `istek_id` ikinci kez gelirse yeni kayıt açılmaz, önceki sonuç döner.
                         */
                        istek_id?: string;
                        metin: string;
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
                            /** @description `true`: medya servisinden adres alınamadı; ek `adres` alanları `null`, soru yine döner. */
                            adres_alinamadi: boolean;
                            /** Format: uuid */
                            atanan_ogretmen_id: string | null;
                            baslik: string | null;
                            brans_kodu: string;
                            /** Format: date-time */
                            cozuldu_at: string | null;
                            /** Format: date-time */
                            created_at: string;
                            /** @enum {string} */
                            durum: "acik" | "cevaplandi" | "takip_bekliyor" | "cozuldu" | "kapandi";
                            /** Format: date-time */
                            foto_silinme_at: string | null;
                            fotograflar: {
                                adres: {
                                    asil_url: string;
                                    /** Format: date-time */
                                    gecerlilik_bitis_at: string;
                                    genislik: number | null;
                                    kucuk_url: string | null;
                                    mime_tipi: string;
                                    orta_url: string | null;
                                    sure_sn: number | null;
                                    yukseklik: number | null;
                                } | null;
                                /** Format: uuid */
                                medya_dosya_id: string;
                                sira: number;
                            }[];
                            /** Format: uuid */
                            id: string;
                            /** Format: date-time */
                            ilk_cevap_at: string | null;
                            kalan_takip_hakki: number;
                            /** Format: uuid */
                            konu_id: string | null;
                            /** Format: uuid */
                            masa_id: string | null;
                            mesaj_sayisi: number;
                            mesajlar: {
                                /** Format: date-time */
                                created_at: string;
                                derste_konusalim: boolean;
                                ekler: {
                                    /** @description Okuma adresi (10 dk geçerli). Medya yanıt vermediyse ya da dosya yoksa `null`. */
                                    adres: {
                                        asil_url: string;
                                        /** Format: date-time */
                                        gecerlilik_bitis_at: string;
                                        genislik: number | null;
                                        kucuk_url: string | null;
                                        mime_tipi: string;
                                        orta_url: string | null;
                                        sure_sn: number | null;
                                        yukseklik: number | null;
                                    } | null;
                                    cizim_verisi: ({
                                        [key: string]: unknown;
                                    } | unknown[]) | null;
                                    /** Format: uuid */
                                    id: string;
                                    /** Format: uuid */
                                    kaynak_dosya_id: string | null;
                                    /** Format: uuid */
                                    medya_dosya_id: string;
                                    sira: number;
                                    sure_sn: number | null;
                                    /** @enum {string} */
                                    tur: "fotograf" | "cizimli_fotograf" | "ses";
                                }[];
                                /** Format: uuid */
                                id: string;
                                metin: string | null;
                                sira: number;
                                /** @enum {string} */
                                tur: "soru" | "cevap" | "takip";
                                yazar_adi: string | null;
                                /** Format: uuid */
                                yazar_id: string;
                                /** @enum {string} */
                                yazar_rolu: "ogrenci" | "ogretmen" | "yonetici";
                            }[];
                            metin_onizleme: string | null;
                            ogrenci_adi: string | null;
                            /** Format: uuid */
                            ogrenci_id: string;
                            /** Format: date-time */
                            son_hareket_at: string;
                            /** Format: uuid */
                            ustlenen_id: string | null;
                            yeniden_acilma_sayisi: number;
                            /** @enum {string} */
                            yonlendirme: "atanan_ogretmen" | "masa" | "yonetici";
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
    "/v1/ogrenme/kurumlar/{kurum_id}/sorularim": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Ogrencinin kendi soru arsivi: brans, konu, durum suzgeci ve Turkce harf duyarsiz metin aramasi (baslik ve mesajlar); en yeni hareket once, imecli. */
        get: {
            parameters: {
                query?: {
                    brans_kodu?: string;
                    durum?: "acik" | "cevaplandi" | "takip_bekliyor" | "cozuldu" | "kapandi";
                    /** @description Önceki sayfanın `sonraki_imlec` değeri. */
                    imlec?: string;
                    konu_id?: string;
                    limit?: number;
                    /** @description Türkçe harf duyarsız metin araması. */
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
                            sonraki_imlec: string | null;
                            sorular: {
                                /** Format: uuid */
                                atanan_ogretmen_id: string | null;
                                baslik: string | null;
                                brans_kodu: string;
                                /** Format: date-time */
                                cozuldu_at: string | null;
                                /** Format: date-time */
                                created_at: string;
                                /** @enum {string} */
                                durum: "acik" | "cevaplandi" | "takip_bekliyor" | "cozuldu" | "kapandi";
                                /** Format: uuid */
                                id: string;
                                /** Format: date-time */
                                ilk_cevap_at: string | null;
                                /** Format: uuid */
                                konu_id: string | null;
                                /** Format: uuid */
                                masa_id: string | null;
                                mesaj_sayisi: number;
                                metin_onizleme: string | null;
                                ogrenci_adi: string | null;
                                /** Format: uuid */
                                ogrenci_id: string;
                                /** Format: date-time */
                                son_hareket_at: string;
                                /** Format: uuid */
                                ustlenen_id: string | null;
                                /** @enum {string} */
                                yonlendirme: "atanan_ogretmen" | "masa" | "yonetici";
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
    "/v1/ogrenme/kurumlar/{kurum_id}/teslimler": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Teslim satirlari (varsayilan `teslim_edildi`: inceleme bekleyenler), teslim zamanina gore eskiden yeniye, anahtar tabanli sayfali. Ogretmen yalniz kendi verdigi odevlerin satirlarini, sahip/yonetici kapsamindakileri gorur. Ogrenci 403; `odev` modulu kapaliysa 403. */
        get: {
            parameters: {
                query?: {
                    durum?: "atandi" | "teslim_edildi" | "incelendi" | "tekrar_istendi" | "iptal";
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
                            sonraki_imlec: string | null;
                            teslimler: {
                                bos_sayisi: number | null;
                                brans_kodu: string;
                                dogru_orani: number | null;
                                dogru_sayisi: number | null;
                                /** @enum {string} */
                                durum: "atandi" | "teslim_edildi" | "incelendi" | "tekrar_istendi" | "iptal";
                                gec_teslim: boolean;
                                gorunen_ad: string | null;
                                odev_baslik: string;
                                /** Format: uuid */
                                odev_id: string;
                                /** Format: uuid */
                                ogrenci_id: string;
                                /** Format: uuid */
                                ogrenci_odev_id: string;
                                /** Format: date-time */
                                son_teslim_at: string | null;
                                /** Format: date-time */
                                teslim_at: string | null;
                                yanlis_sayisi: number | null;
                                yapilan_soru_sayisi: number | null;
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
    "/v1/ogrenme/kurumlar/{kurum_id}/yonetim/sorular": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Kurumdaki tum soru yazismalari (en yeni hareket once): brans, durum, ogrenci, ogretmen suzgeci ve Turkce harf duyarsiz arama. Detay `GET /sorular/:id`. */
        get: {
            parameters: {
                query?: {
                    brans_kodu?: string;
                    durum?: "acik" | "cevaplandi" | "takip_bekliyor" | "cozuldu" | "kapandi";
                    imlec?: string;
                    limit?: number;
                    ogrenci_id?: string;
                    /** @description Yönlendirilen, üstlenen ya da ilk cevaplayan öğretmen. */
                    ogretmen_id?: string;
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
                            sonraki_imlec: string | null;
                            sorular: {
                                /** Format: uuid */
                                atanan_ogretmen_id: string | null;
                                baslik: string | null;
                                brans_kodu: string;
                                /** Format: date-time */
                                cozuldu_at: string | null;
                                /** Format: date-time */
                                created_at: string;
                                /** @enum {string} */
                                durum: "acik" | "cevaplandi" | "takip_bekliyor" | "cozuldu" | "kapandi";
                                /** Format: uuid */
                                id: string;
                                /** Format: date-time */
                                ilk_cevap_at: string | null;
                                /** Format: uuid */
                                konu_id: string | null;
                                /** Format: uuid */
                                masa_id: string | null;
                                mesaj_sayisi: number;
                                metin_onizleme: string | null;
                                ogrenci_adi: string | null;
                                /** Format: uuid */
                                ogrenci_id: string;
                                /** Format: date-time */
                                son_hareket_at: string;
                                /** Format: uuid */
                                ustlenen_id: string | null;
                                /** @enum {string} */
                                yonlendirme: "atanan_ogretmen" | "masa" | "yonetici";
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
    "/v1/platform-mesaji": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Etkin bakım/duyuru mesajı (kimliksiz) */
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
                            mesaj: {
                                /** Format: date-time */
                                baslangic_at: string;
                                baslik: string;
                                /** Format: date-time */
                                bitis_at: string;
                                /** Format: uuid */
                                id: string;
                                metin: string;
                                /** @enum {string} */
                                onem: "bilgi" | "uyari" | "kritik";
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
