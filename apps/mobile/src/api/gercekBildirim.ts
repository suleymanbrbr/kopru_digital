import type { ServisIstemcileri } from '@kopru/api-client';

import type { BildirimAdapter } from './bildirimTipleri';

type BilIstemci = ServisIstemcileri['bildirim'];

export interface BildirimBagimliligi {
  bildirim: BilIstemci;
  etkinKurum: () => string;
  veriAl: <T>(sonuc: { data?: T; error?: unknown; response: Response }) => T;
}

/**
 * `bildirim` servisinin uclarini adaptor modeline baglayan gercek uygulama. Govdesiz POST'larda
 * `{}` yollanir (service-kit bos JSON govdeyi reddeder); govdesiz DELETE'te govde yollanmaz.
 */
export function bildirimAdaptoru(b: BildirimBagimliligi): BildirimAdapter {
  const { bildirim, veriAl, etkinKurum } = b;
  const kurumYolu = () => ({ kurum_id: etkinKurum() });

  return {
    async cihazKaydet(k) {
      veriAl(await bildirim.PUT('/v1/bildirim/cihazlar', { body: k }));
    },
    async cihazSil(cihazKimligi) {
      veriAl(
        await bildirim.DELETE('/v1/bildirim/cihazlar/{cihaz_kimligi}', {
          params: { path: { cihaz_kimligi: cihazKimligi } },
        }),
      );
    },

    async kutu(s) {
      const d = veriAl(
        await bildirim.GET('/v1/bildirim/kurumlar/{kurum_id}/kutu', {
          params: {
            path: kurumYolu(),
            query: {
              ...(s?.imlec ? { imlec: s.imlec } : {}),
              ...(s?.limit ? { limit: s.limit } : {}),
              ...(s?.okunmamis ? { okunmamis: 'true' as const } : {}),
            },
          },
        }),
      );
      return { ogeler: d.ogeler, sonrakiImlec: d.sonraki_imlec };
    },
    async okunmamisSayisi() {
      const d = veriAl(
        await bildirim.GET('/v1/bildirim/kurumlar/{kurum_id}/kutu/okunmamis-sayisi', {
          params: { path: kurumYolu() },
        }),
      );
      return d.okunmamis;
    },
    async okundu(id) {
      veriAl(
        await bildirim.POST('/v1/bildirim/kurumlar/{kurum_id}/kutu/{bildirim_id}/okundu', {
          params: { path: { ...kurumYolu(), bildirim_id: id } },
          body: {} as never,
        }),
      );
    },
    async tumunuOku() {
      const d = veriAl(
        await bildirim.POST('/v1/bildirim/kurumlar/{kurum_id}/kutu/tumunu-oku', {
          params: { path: kurumYolu() },
          body: {} as never,
        }),
      );
      return d.guncellenen;
    },
    async arsivle(id) {
      veriAl(
        await bildirim.POST('/v1/bildirim/kurumlar/{kurum_id}/kutu/{bildirim_id}/arsivle', {
          params: { path: { ...kurumYolu(), bildirim_id: id } },
          body: {} as never,
        }),
      );
    },

    async tercihler() {
      const d = veriAl(
        await bildirim.GET('/v1/bildirim/kurumlar/{kurum_id}/tercihler', {
          params: { path: kurumYolu() },
        }),
      );
      return d.tercihler;
    },
    async tercihGuncelle(g) {
      const d = veriAl(
        await bildirim.PUT('/v1/bildirim/kurumlar/{kurum_id}/tercihler', {
          params: { path: kurumYolu() },
          body: { tercihler: g },
        }),
      );
      return d.tercihler;
    },
    async ayarlar() {
      return veriAl(
        await bildirim.GET('/v1/bildirim/kurumlar/{kurum_id}/ayarlar', {
          params: { path: kurumYolu() },
        }),
      );
    },
    async ayarGuncelle(g) {
      return veriAl(
        await bildirim.PUT('/v1/bildirim/kurumlar/{kurum_id}/ayarlar', {
          params: { path: kurumYolu() },
          body: g,
        }),
      );
    },
  };
}
