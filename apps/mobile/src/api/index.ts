import { Platform } from 'react-native';

import type { BelirtecDeposu } from '../depo/belirtecDeposu';
import { ortam } from '../ortam';
import type { Adaptorler } from './adaptorler';
import { gercekAdaptorler } from './gercek';
import { mockAdaptorler } from './mock';
import { ApiHata } from './tipler';

/** Api adresi tanimli degilken (mock da kapaliysa): her cagri `yapilandirma` hatasi verir. */
function baglanmamisAdaptorler(): Adaptorler {
  const hata = () => Promise.reject(new ApiHata('yapilandirma'));
  return {
    auth: {
      otpIste: hata,
      otpDogrula: hata,
      oturumBilgisi: hata,
      kvkkMetinleri: hata,
      kvkkKabulEt: hata,
      uyelikSec: hata,
      cikis: () => Promise.resolve(),
    },
    veri: { ogretmenBugun: hata, ogrenciBugun: hata },
    ders: {
      saatDilimi: hata,
      dersler: hata,
      gruplar: hata,
      dersOlustur: hata,
      dersTasi: hata,
      dersIptal: hata,
      yoklamaBekleyen: hata,
      yoklamaKatilimcilari: hata,
      yoklamaKaydet: hata,
    },
    finans: {
      paketler: hata,
      ogrenciler: hata,
      ogrenciKarti: hata,
      paketSat: hata,
      tahsilatAl: hata,
    },
    ogrenme: {
      konular: hata,
      odevlerim: hata,
      odevTeslim: hata,
      odevler: hata,
      odevVer: hata,
      odevOzeti: hata,
      odevIncele: hata,
      odevSablonlari: hata,
      incelemeBekleyenler: hata,
      planim: hata,
      gorevlerim: hata,
      gorevGerceklesen: hata,
      gorevDevret: hata,
      ogrenciPlani: hata,
      planOlustur: hata,
      gorevEkle: hata,
      gorevGuncelle: hata,
      gorevSil: hata,
      planYayinla: hata,
      denemeKurallari: hata,
      ogrenciDenemeGirisi: hata,
      denemelerim: hata,
      denemeOlustur: hata,
      denemeler: hata,
      denemeOnayla: hata,
      denemeReddet: hata,
      denemeGelisim: hata,
    },
    kayit: {
      kayitlarim: hata,
      kayit: hata,
      izledim: hata,
      sorunBildir: hata,
      kaynaklar: hata,
      kaynakIzlemeleri: hata,
      kaynakEkle: hata,
      geriBildirimBekleyen: hata,
      geriBildirimVer: hata,
      dersGeriBildirimleri: hata,
    },
    soru: {
      sorularim: hata,
      kota: hata,
      soru: hata,
      soruSor: hata,
      anladim: hata,
      takip: hata,
      bildir: hata,
      gelenSorular: hata,
      gelenSoruSayisi: hata,
      cevapla: hata,
      cevapladiklarim: hata,
      musaitlik: hata,
      musaitlikAyarla: hata,
    },
    medya: { izinAl: hata, yukle: hata, tamam: hata, durum: hata, yerelBilgi: hata },
    hesap: {
      sinifKoduKatil: hata,
      sinifKoduIsteklerim: hata,
      sinifKoduIstegiIptal: hata,
      sinifBekleyenleri: hata,
      katilimIstegiOnayla: hata,
      katilimIstegiReddet: hata,
      katilimKodu: hata,
      katilimKoduYenile: hata,
      davetKabul: hata,
      oturumlar: hata,
      oturumSonlandir: hata,
      oturumlariKapat: hata,
    },
  };
}

/**
 * Adaptor secimi: `EXPO_PUBLIC_API_MOCK=1` -> sahte; `EXPO_PUBLIC_API_URL` doluysa -> gercek api
 * (`@kopru/api-client`); ikisi de yoksa `yapilandirma` hatasi.
 */
export function adaptorleriOlustur(depo: BelirtecDeposu): Adaptorler {
  if (ortam.apiMock) return mockAdaptorler(depo);
  if (ortam.apiUrl) {
    return gercekAdaptorler({
      apiUrl: ortam.apiUrl,
      ...(ortam.medyaUrl ? { medyaUrl: ortam.medyaUrl } : {}),
      depo,
      kaynak: Platform.OS === 'android' ? 'android' : Platform.OS === 'ios' ? 'ios' : 'web',
    });
  }
  return baglanmamisAdaptorler();
}
