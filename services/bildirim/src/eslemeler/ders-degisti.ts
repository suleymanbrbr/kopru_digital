import { dersDersDegistiV1 } from '@kopru/contracts';

import {
  dersPlaniYaz,
  dersiIptalEt,
  eskiHatirlatmayiGizle,
  ogrencileriZamanla,
  sabahiYenile,
} from '../ders-zamanlama.js';
import { bildirimUret } from '../uretim.js';
import { esleme } from './esleme.js';
import { kurumSaatDilimi, tarihSaatMetni } from './yardimci.js';

/**
 * `ders.ders.degisti.v1` (parcali: ayni `ders_id`, `parca_no`/`parca_sayisi`; her parca kendi ogrencilerini isler,
 * ogretmen bildirimi `tekil_anahtar` ile tekillenir).
 *
 * Bildirimler (kategori `ders`):
 * - `iptal_edildi`: katilimci ogrencilere `ders_iptal`; iptal eden ogretmen degilse (yonetici/ogrenci) ogretmene
 *   `ders_iptal_ogretmen`.
 * - `ertelendi`: ogrencilere `ders_ertelendi` (yeni zaman). Ogretmene bildirim yok (erteleyen odur).
 * - `planlandi` + `telafi`: ogrencilere `telafi_planlandi`.
 * - Diger planlama (hatirlatma, geri bildirim, ogretmen sabah ozeti) `ders-zamanlama.ts`'tedir; her turde yapilir.
 *
 * Eski (siradan sapmis) olay `ders_planlari`ndaki daha yeni durumu ezmez ve bildirim/zamanlama uretmez.
 */
export const dersDegistiEsleme = esleme(dersDersDegistiV1, async (tx, olay) => {
  const d = olay.data;
  const simdi = new Date();
  const plan = await dersPlaniYaz(tx, olay);
  if (!plan.uygulandi) return;

  const baslangic = new Date(d.baslangic_at);
  const bildir = async (
    sablonKodu: string,
    alicilar: readonly string[],
    tekilAnahtar: string,
    tarihSaat: string,
  ) => {
    if (alicilar.length === 0) return;
    await bildirimUret(tx, {
      kurumId: olay.kurumId,
      aliciUyelikIdleri: alicilar,
      sablonKodu,
      degiskenler: { ders_id: d.ders_id, tarih_saat: tarihSaat },
      veri: { ders_id: d.ders_id },
      kaynakOlayId: olay.id,
      tekilAnahtar,
    });
  };

  const saatDilimi = await kurumSaatDilimi(tx, olay.kurumId);
  switch (d.degisim_turu) {
    case 'iptal_edildi': {
      await dersiIptalEt(tx, olay.kurumId, d.ders_id, simdi);
      const zaman = tarihSaatMetni(baslangic, saatDilimi);
      await bildir('ders_iptal', d.ogrenci_idleri, `ders_iptal:${d.ders_id}`, zaman);
      if (d.iptal_kaynagi !== 'ogretmen') {
        await bildir('ders_iptal_ogretmen', [d.ogretmen_id], `ders_iptal:${d.ders_id}`, zaman);
      }
      break;
    }
    case 'ertelendi': {
      await eskiHatirlatmayiGizle(tx, olay.kurumId, d.ders_id, simdi, d.ogrenci_idleri);
      await bildir(
        'ders_ertelendi',
        d.ogrenci_idleri,
        `ders_ertelendi:${d.ders_id}:${String(baslangic.getTime())}`,
        tarihSaatMetni(baslangic, saatDilimi),
      );
      break;
    }
    case 'planlandi': {
      if (d.telafi) {
        await bildir(
          'telafi_planlandi',
          d.ogrenci_idleri,
          `telafi_planlandi:${d.ders_id}`,
          tarihSaatMetni(baslangic, saatDilimi),
        );
      }
      break;
    }
    default:
      break;
  }

  if (d.degisim_turu !== 'iptal_edildi') await ogrencileriZamanla(tx, olay, simdi);

  // Ogretmen sabah ozeti: ogretmenin etkilenen gunleri (yeni, onceki, ders planindaki eski zaman) bir kez
  // (ilk parcada) yeniden hesaplanir.
  if (d.parca_no === 1) {
    const anlar = [baslangic];
    if (d.onceki_baslangic_at) anlar.push(new Date(d.onceki_baslangic_at));
    if (plan.onceki) anlar.push(plan.onceki.baslangicAt);
    await sabahiYenile(tx, olay.kurumId, d.ogretmen_id, anlar, simdi);
    if (plan.onceki && plan.onceki.ogretmenId !== d.ogretmen_id) {
      await sabahiYenile(tx, olay.kurumId, plan.onceki.ogretmenId, anlar, simdi);
    }
  }
});
