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
    "/v1/motivasyon/kurumlar/{kurum_id}/haftanin-yildizlari": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Haftanin yildizi ver (ogretmen: atandigi gruptaki ogrenci; yonetici/sahip: kurumdaki grup uyesi). 50 XP (tavandan muaf) + rozet sayaci. Ogrenci haftada bir (409 haftanin_yildizi_verilmis); ogretmen haftada en cok ayar siniri (409 haftalik_limit_asildi). Kapsam disi ogrenci 404. */
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
                        gerekce?: string;
                        /** Format: uuid */
                        grup_id: string;
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
                            xp: number;
                            yeni_rozetler: string[];
                            yildiz: {
                                /** Format: date-time */
                                created_at: string;
                                gerekce: string | null;
                                /** Format: uuid */
                                grup_id: string;
                                /** Format: date */
                                hafta_baslangic: string;
                                /** Format: uuid */
                                id: string;
                                /** Format: uuid */
                                ogrenci_id: string;
                                /** Format: uuid */
                                veren_ogretmen_id: string;
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
    "/v1/motivasyon/kurumlar/{kurum_id}/haftanin-yildizlari/verdiklerim": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Bu haftaki verdigim yildizlar ve kalan hak (ogretmen: limit/kalan; yonetici/sahip: sinirsiz, limit ve kalan null). */
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
                            hafta_baslangic: string;
                            kalan: number | null;
                            limit: number | null;
                            verilen: number;
                            yildizlar: {
                                /** Format: date-time */
                                created_at: string;
                                gerekce: string | null;
                                /** Format: uuid */
                                grup_id: string;
                                /** Format: date */
                                hafta_baslangic: string;
                                /** Format: uuid */
                                id: string;
                                /** Format: uuid */
                                ogrenci_id: string;
                                /** Format: uuid */
                                veren_ogretmen_id: string;
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
    "/v1/motivasyon/kurumlar/{kurum_id}/karakter": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Benim karakterim (secilmediyse `karakter: null`): asama, tur degistirme hakki, kusanilanlar. */
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
                            karakter: {
                                ad: string;
                                asama: number;
                                asama_adi: string;
                                kusanilanlar: {
                                    kozmetik_kodu: string;
                                    /** @enum {string} */
                                    slot: "sapka" | "gozluk" | "aksesuar" | "arka_plan" | "cerceve";
                                }[];
                                /** Format: date-time */
                                secildi_at: string;
                                sonraki_asama_seviyesi: number | null;
                                tur_adi: string;
                                tur_degistirme_hakki: number;
                                tur_kodu: string;
                            } | null;
                        };
                    };
                };
            };
        };
        put?: never;
        /** Karakter sec (tur + ad, ilk kez). Uygunsuz ad 422 karakter_adi_uygunsuz; zaten secilmisse 409 karakter_zaten_secildi. Asama mevcut seviyeden hesaplanir. */
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
                        tur_kodu: string;
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
                            karakter: {
                                ad: string;
                                asama: number;
                                asama_adi: string;
                                kusanilanlar: {
                                    kozmetik_kodu: string;
                                    /** @enum {string} */
                                    slot: "sapka" | "gozluk" | "aksesuar" | "arka_plan" | "cerceve";
                                }[];
                                /** Format: date-time */
                                secildi_at: string;
                                sonraki_asama_seviyesi: number | null;
                                tur_adi: string;
                                tur_degistirme_hakki: number;
                                tur_kodu: string;
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
    "/v1/motivasyon/kurumlar/{kurum_id}/karakter/ad": {
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
        /** Karakter adini degistir (sinirsiz; ayni ad suzgeci: 422 karakter_adi_uygunsuz). */
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
                        ad: string;
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
                            karakter: {
                                ad: string;
                                asama: number;
                                asama_adi: string;
                                kusanilanlar: {
                                    kozmetik_kodu: string;
                                    /** @enum {string} */
                                    slot: "sapka" | "gozluk" | "aksesuar" | "arka_plan" | "cerceve";
                                }[];
                                /** Format: date-time */
                                secildi_at: string;
                                sonraki_asama_seviyesi: number | null;
                                tur_adi: string;
                                tur_degistirme_hakki: number;
                                tur_kodu: string;
                            } | null;
                        };
                    };
                };
            };
        };
        trace?: never;
    };
    "/v1/motivasyon/kurumlar/{kurum_id}/karakter/kozmetikler": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Tum kozmetikler: sahip olunan/olunmayan, kusanilan, acilma kosulu (rozet / seviye / seri). */
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
                            kozmetikler: {
                                /** Format: date-time */
                                acildi_at: string | null;
                                acilma_kosulu: {
                                    rozet?: string;
                                    rozet_adi?: string;
                                    seri?: number;
                                    seviye?: number;
                                };
                                ad: string;
                                kod: string;
                                kusanildi: boolean;
                                /** @enum {string} */
                                nadirlik: "yaygin" | "nadir" | "efsanevi";
                                sahip: boolean;
                                /** @enum {string} */
                                slot: "sapka" | "gozluk" | "aksesuar" | "arka_plan" | "cerceve";
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
    "/v1/motivasyon/kurumlar/{kurum_id}/karakter/kusanimlar/{slot}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /** Slota kozmetik kusan. Sahip olunmayan 422 kozmetik_sahip_degil; slot uyusmazligi 422 kozmetik_slot_uyusmuyor; karakter yoksa 422 karakter_secilmemis. */
        put: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    kurum_id: string;
                    slot: "sapka" | "gozluk" | "aksesuar" | "arka_plan" | "cerceve";
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        kozmetik_kodu: string;
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
                            karakter: {
                                ad: string;
                                asama: number;
                                asama_adi: string;
                                kusanilanlar: {
                                    kozmetik_kodu: string;
                                    /** @enum {string} */
                                    slot: "sapka" | "gozluk" | "aksesuar" | "arka_plan" | "cerceve";
                                }[];
                                /** Format: date-time */
                                secildi_at: string;
                                sonraki_asama_seviyesi: number | null;
                                tur_adi: string;
                                tur_degistirme_hakki: number;
                                tur_kodu: string;
                            } | null;
                        };
                    };
                };
            };
        };
        post?: never;
        /** Slottaki kozmetigi cikar (bos slot icin de basarili). */
        delete: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    kurum_id: string;
                    slot: "sapka" | "gozluk" | "aksesuar" | "arka_plan" | "cerceve";
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
                            karakter: {
                                ad: string;
                                asama: number;
                                asama_adi: string;
                                kusanilanlar: {
                                    kozmetik_kodu: string;
                                    /** @enum {string} */
                                    slot: "sapka" | "gozluk" | "aksesuar" | "arka_plan" | "cerceve";
                                }[];
                                /** Format: date-time */
                                secildi_at: string;
                                sonraki_asama_seviyesi: number | null;
                                tur_adi: string;
                                tur_degistirme_hakki: number;
                                tur_kodu: string;
                            } | null;
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
    "/v1/motivasyon/kurumlar/{kurum_id}/karakter/tur": {
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
        /** Karakter turunu degistir: tek sefer (409 tur_degistirme_hakki_yok); asama ve kusanimlar korunur. */
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
                        tur_kodu: string;
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
                            karakter: {
                                ad: string;
                                asama: number;
                                asama_adi: string;
                                kusanilanlar: {
                                    kozmetik_kodu: string;
                                    /** @enum {string} */
                                    slot: "sapka" | "gozluk" | "aksesuar" | "arka_plan" | "cerceve";
                                }[];
                                /** Format: date-time */
                                secildi_at: string;
                                sonraki_asama_seviyesi: number | null;
                                tur_adi: string;
                                tur_degistirme_hakki: number;
                                tur_kodu: string;
                            } | null;
                        };
                    };
                };
            };
        };
        trace?: never;
    };
    "/v1/motivasyon/kurumlar/{kurum_id}/karakter/turler": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Karakter turleri ve asamalari (tanim tablosundan; asama esikleri seviye). */
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
                            turler: {
                                ad: string;
                                asamalar: {
                                    ad: string;
                                    asama: number;
                                    gereken_seviye: number;
                                }[];
                                kod: string;
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
    "/v1/motivasyon/kurumlar/{kurum_id}/odak-oturumlari": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Son odak oturumlari (yeniden eskiye). */
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
                            oturumlar: {
                                /** Format: date-time */
                                baslangic_at: string;
                                /** Format: date-time */
                                bitis_at: string | null;
                                brans_kodu: string | null;
                                cihaz: string | null;
                                /** @enum {string} */
                                durum: "devam" | "tamam" | "yarida";
                                gerceklesen_sn: number;
                                /** Format: uuid */
                                id: string;
                                /** Format: uuid */
                                istemci_id: string;
                                /** Format: uuid */
                                plan_gorev_id: string | null;
                                planlanan_dk: number;
                            }[];
                        };
                    };
                };
            };
        };
        put?: never;
        /** Odak oturumu baslat (ogrenci). `istemci_id` (UUIDv7) ile idempotent: ayni kimlik ayni oturumu 200 ile doner. Zaten devam eden baska oturum varsa 409 acik_oturum_var (details.oturum). `mod`: 25_5, 50_10, serbest (planlanan_dk 5-180). */
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
                        /** Format: date-time */
                        baslangic_at?: string;
                        brans_kodu?: string;
                        cihaz?: string;
                        /** Format: uuid */
                        istemci_id: string;
                        /** @enum {string} */
                        mod: "25_5" | "50_10" | "serbest";
                        /** Format: uuid */
                        plan_gorev_id?: string;
                        planlanan_dk?: number;
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
                            /** Format: date-time */
                            bitis_at: string | null;
                            brans_kodu: string | null;
                            cihaz: string | null;
                            /** @enum {string} */
                            durum: "devam" | "tamam" | "yarida";
                            gerceklesen_sn: number;
                            /** Format: uuid */
                            id: string;
                            /** Format: uuid */
                            istemci_id: string;
                            /** Format: uuid */
                            plan_gorev_id: string | null;
                            planlanan_dk: number;
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
                            baslangic_at: string;
                            /** Format: date-time */
                            bitis_at: string | null;
                            brans_kodu: string | null;
                            cihaz: string | null;
                            /** @enum {string} */
                            durum: "devam" | "tamam" | "yarida";
                            gerceklesen_sn: number;
                            /** Format: uuid */
                            id: string;
                            /** Format: uuid */
                            istemci_id: string;
                            /** Format: uuid */
                            plan_gorev_id: string | null;
                            planlanan_dk: number;
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
    "/v1/motivasyon/kurumlar/{kurum_id}/odak-oturumlari/{istemci_id}/bitir": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Odak oturumunu bitir (tamam/yarida). Sure sunucuda LEAST(bitis - baslangic, planlanan*60+60, 3 saat); istemcinin `bitis_at` degeri [baslangic, simdi] araligina sikistirilir. XP: dakika basina 1 (odak tavani 120). Ayni oturumu tekrar bitirmek durumu degistirmez, ikinci XP vermez. */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    istemci_id: string;
                    kurum_id: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        /** Format: date-time */
                        bitis_at?: string;
                        /** @enum {string} */
                        durum: "tamam" | "yarida";
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
                            kazanim: {
                                dogrulanmamis_sayilan_sn: number;
                                dogrulanmamis_sayilmayan_sn: number;
                                seviye_atladi: boolean;
                                xp: number;
                                yeni_rozetler: string[];
                            };
                            oturum: {
                                /** Format: date-time */
                                baslangic_at: string;
                                /** Format: date-time */
                                bitis_at: string | null;
                                brans_kodu: string | null;
                                cihaz: string | null;
                                /** @enum {string} */
                                durum: "devam" | "tamam" | "yarida";
                                gerceklesen_sn: number;
                                /** Format: uuid */
                                id: string;
                                /** Format: uuid */
                                istemci_id: string;
                                /** Format: uuid */
                                plan_gorev_id: string | null;
                                planlanan_dk: number;
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
    "/v1/motivasyon/kurumlar/{kurum_id}/odak-oturumlari/acik": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Devam eden odak oturumu (yoksa `oturum: null`). 6 saati gecen oturum acik sayilmaz. */
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
                            oturum: {
                                /** Format: date-time */
                                baslangic_at: string;
                                /** Format: date-time */
                                bitis_at: string | null;
                                brans_kodu: string | null;
                                cihaz: string | null;
                                /** @enum {string} */
                                durum: "devam" | "tamam" | "yarida";
                                gerceklesen_sn: number;
                                /** Format: uuid */
                                id: string;
                                /** Format: uuid */
                                istemci_id: string;
                                /** Format: uuid */
                                plan_gorev_id: string | null;
                                planlanan_dk: number;
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
    "/v1/motivasyon/kurumlar/{kurum_id}/ogrenciler/{ogrenci_id}/haftanin-yildizlari": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Ogrencinin aldigi haftanin yildizlari (ogrenci kendi, ogretmen atandigi gruptaki, yonetici/sahip kurumdaki). Kapsam disi 404. */
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
                            yildizlar: {
                                /** Format: date-time */
                                created_at: string;
                                gerekce: string | null;
                                /** Format: uuid */
                                grup_id: string;
                                /** Format: date */
                                hafta_baslangic: string;
                                /** Format: uuid */
                                id: string;
                                /** Format: uuid */
                                ogrenci_id: string;
                                /** Format: uuid */
                                veren_ogretmen_id: string;
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
