import type { MockIstek, MockYanit } from './vekil';

/**
 * `NEXT_PUBLIC_API_MOCK=1` iken `/api/bildirim/*` ucunun en kucuk bellek ici karsiligi: bos gelen kutusu,
 * varsayilan tercih matrisi ve ayarlar. Yanit sekilleri `@kopru/contracts` bildirim semalariyla aynidir.
 * Web arayuzu sonraki pakette gelir; bu mock yalniz BFF yolunun mock modunda 404 vermemesi icindir.
 */

const KATEGORILER = [
  'ders',
  'yoklama',
  'odev',
  'soru',
  'kayit',
  'duyuru',
  'finans',
  'oyunlastirma',
  'abonelik',
  'sistem',
] as const;
const KANALLAR = ['kutu', 'push', 'eposta', 'sms'] as const;

const varsayilanMatris = () =>
  KATEGORILER.flatMap((kategori) =>
    KANALLAR.map((kanal) => ({
      kategori,
      kanal,
      acik:
        kategori === 'sistem' ||
        kanal === 'kutu' ||
        kanal === 'push' ||
        (kanal === 'eposta' && kategori === 'abonelik'),
      kilitli: kategori === 'sistem' || kanal === 'kutu',
    })),
  );

const VARSAYILAN_AYARLAR = {
  sessiz_baslangic: '22:00',
  sessiz_bitis: '08:00',
  sessiz_gunler: [1, 2, 3, 4, 5, 6, 7],
  saat_dilimi: 'Europe/Istanbul',
  ders_hatirlatma_dk: 60,
};

export function bildirimMock(istek: MockIstek): MockYanit {
  const parcalar = istek.yol.split('/');
  const son = parcalar.at(-1);
  if (parcalar[0] === 'cihazlar') {
    return istek.yontem === 'PUT'
      ? { durum: 200, govde: { cihaz_kimligi: 'mock', aktif: true } }
      : { durum: 200, govde: { cihaz_kimligi: son ?? 'mock', aktif: false } };
  }
  switch (son) {
    case 'kutu':
      return { durum: 200, govde: { ogeler: [], sonraki_imlec: null } };
    case 'okunmamis-sayisi':
      return { durum: 200, govde: { okunmamis: 0 } };
    case 'tumunu-oku':
      return { durum: 200, govde: { guncellenen: 0 } };
    case 'tercihler':
      return { durum: 200, govde: { tercihler: varsayilanMatris() } };
    case 'ayarlar':
      return { durum: 200, govde: VARSAYILAN_AYARLAR };
    default:
      return {
        durum: 404,
        govde: { error: { code: 'bulunamadi', message: 'Bildirim bulunamadı.' } },
      };
  }
}
