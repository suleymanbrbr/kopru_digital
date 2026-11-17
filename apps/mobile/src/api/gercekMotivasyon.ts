import type { ServisIstemcileri } from '@kopru/api-client';

import type {
  GrupOgrencisi,
  KarakterDetay,
  MotivasyonAdapter,
  OdakBitirSonucu,
} from './motivasyonTipleri';

type MotIstemci = ServisIstemcileri['motivasyon'];
type ApiIstemci = ServisIstemcileri['api'];

export interface MotivasyonBagimliligi {
  motivasyon: MotIstemci;
  /** Grup uyelerini okumak icin (hesap modulu). */
  yetkili: ApiIstemci;
  etkinKurum: () => string;
  veriAl: <T>(sonuc: { data?: T; error?: unknown; response: Response }) => T;
}

/**
 * `motivasyon` servisinin uclarini adaptor modeline baglayan gercek uygulama.
 *  - Govdesiz POST'larda `{}` yollanir (service-kit bos JSON govdeyi reddeder); govdesiz DELETE'te
 *    govde ve `content-type` hic yollanmaz.
 *  - Hata esleme `veriAl` ile (`apiHatasiOlustur`): 403 `modul_kapali` -> `modul_kapali`,
 *    409 -> `cakisma` (`ayrinti`: `acik_oturum_var`, `haftanin_yildizi_verilmis` ...; `detay`),
 *    422 -> `dogrulama` (`ayrinti`: `karakter_adi_uygunsuz` ...), 404 -> `bulunamadi`.
 */
export function motivasyonAdaptoru(b: MotivasyonBagimliligi): MotivasyonAdapter {
  const { motivasyon, yetkili, veriAl, etkinKurum } = b;

  return {
    async benim() {
      return veriAl(
        await motivasyon.GET('/v1/motivasyon/kurumlar/{kurum_id}/benim', {
          params: { path: { kurum_id: etkinKurum() } },
        }),
      );
    },
    async ogrenciOzeti(ogrenciId) {
      return veriAl(
        await motivasyon.GET('/v1/motivasyon/kurumlar/{kurum_id}/ogrenciler/{ogrenci_id}/ozet', {
          params: { path: { kurum_id: etkinKurum(), ogrenci_id: ogrenciId } },
        }),
      );
    },
    async seri() {
      return veriAl(
        await motivasyon.GET('/v1/motivasyon/kurumlar/{kurum_id}/benim/seri', {
          params: { path: { kurum_id: etkinKurum() } },
        }),
      );
    },

    async karakterTurleri() {
      const d = veriAl(
        await motivasyon.GET('/v1/motivasyon/kurumlar/{kurum_id}/karakter/turler', {
          params: { path: { kurum_id: etkinKurum() } },
        }),
      );
      return d.turler;
    },
    async karakter() {
      const d = veriAl(
        await motivasyon.GET('/v1/motivasyon/kurumlar/{kurum_id}/karakter', {
          params: { path: { kurum_id: etkinKurum() } },
        }),
      );
      return d.karakter;
    },
    async karakterSec(turKodu, ad) {
      const d = veriAl(
        await motivasyon.POST('/v1/motivasyon/kurumlar/{kurum_id}/karakter', {
          params: { path: { kurum_id: etkinKurum() } },
          body: { tur_kodu: turKodu, ad },
        }),
      );
      return (d as { karakter: KarakterDetay }).karakter;
    },
    async turDegistir(turKodu) {
      const d = veriAl(
        await motivasyon.PATCH('/v1/motivasyon/kurumlar/{kurum_id}/karakter/tur', {
          params: { path: { kurum_id: etkinKurum() } },
          body: { tur_kodu: turKodu },
        }),
      );
      return (d as { karakter: KarakterDetay }).karakter;
    },
    async adDegistir(ad) {
      const d = veriAl(
        await motivasyon.PATCH('/v1/motivasyon/kurumlar/{kurum_id}/karakter/ad', {
          params: { path: { kurum_id: etkinKurum() } },
          body: { ad },
        }),
      );
      return (d as { karakter: KarakterDetay }).karakter;
    },
    async kozmetikler() {
      const d = veriAl(
        await motivasyon.GET('/v1/motivasyon/kurumlar/{kurum_id}/karakter/kozmetikler', {
          params: { path: { kurum_id: etkinKurum() } },
        }),
      );
      return d.kozmetikler;
    },
    async kusan(slot, kozmetikKodu) {
      veriAl(
        await motivasyon.PUT('/v1/motivasyon/kurumlar/{kurum_id}/karakter/kusanimlar/{slot}', {
          params: { path: { kurum_id: etkinKurum(), slot } },
          body: { kozmetik_kodu: kozmetikKodu },
        }),
      );
    },
    async cikar(slot) {
      veriAl(
        await motivasyon.DELETE('/v1/motivasyon/kurumlar/{kurum_id}/karakter/kusanimlar/{slot}', {
          params: { path: { kurum_id: etkinKurum(), slot } },
        }),
      );
    },

    async odakAcik() {
      const d = veriAl(
        await motivasyon.GET('/v1/motivasyon/kurumlar/{kurum_id}/odak-oturumlari/acik', {
          params: { path: { kurum_id: etkinKurum() } },
        }),
      );
      return d.oturum;
    },
    async odakBaslat(g) {
      return veriAl(
        await motivasyon.POST('/v1/motivasyon/kurumlar/{kurum_id}/odak-oturumlari', {
          params: { path: { kurum_id: etkinKurum() } },
          body: {
            istemci_id: g.istemciId,
            mod: g.mod,
            ...(g.planlananDk !== undefined ? { planlanan_dk: g.planlananDk } : {}),
            ...(g.baslangicAt ? { baslangic_at: g.baslangicAt } : {}),
            ...(g.bransKodu ? { brans_kodu: g.bransKodu } : {}),
            ...(g.planGorevId ? { plan_gorev_id: g.planGorevId } : {}),
            ...(g.cihaz ? { cihaz: g.cihaz } : {}),
          },
        }),
      );
    },
    async odakBitir(istemciId, durum, bitisAt): Promise<OdakBitirSonucu> {
      const d = veriAl(
        await motivasyon.POST(
          '/v1/motivasyon/kurumlar/{kurum_id}/odak-oturumlari/{istemci_id}/bitir',
          {
            params: { path: { kurum_id: etkinKurum(), istemci_id: istemciId } },
            body: { durum, ...(bitisAt ? { bitis_at: bitisAt } : {}) },
          },
        ),
      );
      return {
        oturum: d.oturum,
        kazanim: {
          xp: d.kazanim.xp,
          seviyeAtladi: d.kazanim.seviye_atladi,
          yeniRozetler: d.kazanim.yeni_rozetler,
          dogrulanmamisSayilanSn: d.kazanim.dogrulanmamis_sayilan_sn,
          dogrulanmamisSayilmayanSn: d.kazanim.dogrulanmamis_sayilmayan_sn,
        },
      };
    },

    async yildizVer(g) {
      const d = veriAl(
        await motivasyon.POST('/v1/motivasyon/kurumlar/{kurum_id}/haftanin-yildizlari', {
          params: { path: { kurum_id: etkinKurum() } },
          body: {
            ogrenci_id: g.ogrenciId,
            grup_id: g.grupId,
            ...(g.gerekce ? { gerekce: g.gerekce } : {}),
          },
        }),
      );
      return { yildiz: d.yildiz, xp: d.xp, yeniRozetler: d.yeni_rozetler };
    },
    async yildizVerdiklerim() {
      const d = veriAl(
        await motivasyon.GET('/v1/motivasyon/kurumlar/{kurum_id}/haftanin-yildizlari/verdiklerim', {
          params: { path: { kurum_id: etkinKurum() } },
        }),
      );
      return {
        haftaBaslangic: d.hafta_baslangic,
        limit: d.limit,
        verilen: d.verilen,
        kalan: d.kalan,
        yildizlar: d.yildizlar,
      };
    },
    async yildizAldiklari(ogrenciId) {
      const d = veriAl(
        await motivasyon.GET(
          '/v1/motivasyon/kurumlar/{kurum_id}/ogrenciler/{ogrenci_id}/haftanin-yildizlari',
          { params: { path: { kurum_id: etkinKurum(), ogrenci_id: ogrenciId } } },
        ),
      );
      return d.yildizlar;
    },
    async duraklatmalar(grupId) {
      const d = veriAl(
        await motivasyon.GET(
          '/v1/motivasyon/kurumlar/{kurum_id}/gruplar/{grup_id}/seri-duraklatmalari',
          { params: { path: { kurum_id: etkinKurum(), grup_id: grupId } } },
        ),
      );
      return d.duraklatmalar;
    },
    async duraklatmaOlustur(grupId, g) {
      return veriAl(
        await motivasyon.POST(
          '/v1/motivasyon/kurumlar/{kurum_id}/gruplar/{grup_id}/seri-duraklatmalari',
          {
            params: { path: { kurum_id: etkinKurum(), grup_id: grupId } },
            body: {
              baslangic_gun: g.baslangic_gun,
              bitis_gun: g.bitis_gun,
              ...(g.neden ? { neden: g.neden } : {}),
            },
          },
        ),
      );
    },
    async duraklatmaIptal(grupId, duraklatmaId) {
      veriAl(
        await motivasyon.DELETE(
          '/v1/motivasyon/kurumlar/{kurum_id}/gruplar/{grup_id}/seri-duraklatmalari/{duraklatma_id}',
          {
            params: {
              path: { kurum_id: etkinKurum(), grup_id: grupId, duraklatma_id: duraklatmaId },
            },
          },
        ),
      );
    },
    async grupOgrencileri(grupId): Promise<GrupOgrencisi[]> {
      const d = veriAl(
        await yetkili.GET('/v1/hesap/kurumlar/{kurum_id}/gruplar/{grup_id}/uyeler', {
          params: { path: { kurum_id: etkinKurum(), grup_id: grupId } },
        }),
      );
      return d.uyeler
        .filter((u) => u.bitis_tarihi === null)
        .map((u) => ({ ogrenciId: u.ogrenci_id, ad: u.gorunen_ad ?? '' }));
    },
  };
}
