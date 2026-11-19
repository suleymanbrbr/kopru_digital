import type { MockAyar, MockAyarSurumu } from './durum';
import { ADMIN_ID, TOHUM_AYAR, durum, simdi } from './durum';
import type { MockYanit } from './yanit';
import { hata, nesne } from './yanit';

/**
 * `services/motivasyon` platform ayar uclarinin mock'u: dogrulama ve uyari kurallari gercek servisin
 * (`platform-ayar.ts`) sadelestirilmis hali; makine kodlari ve yanit sekilleri ayni.
 */

interface Yapi {
  tavanGrubu: string | null;
  genelTavanaTabi: boolean;
  birim: string | null;
}
const YAPI: Record<string, Yapi> = {
  yoklama_geldi: { tavanGrubu: null, genelTavanaTabi: true, birim: null },
  odev_teslim: { tavanGrubu: null, genelTavanaTabi: true, birim: null },
  odev_onay: { tavanGrubu: null, genelTavanaTabi: true, birim: null },
  plan_gorevi_tamam: { tavanGrubu: 'plan', genelTavanaTabi: true, birim: null },
  odak_oturumu: { tavanGrubu: 'odak', genelTavanaTabi: true, birim: 'dakika' },
  deneme_girisi: { tavanGrubu: null, genelTavanaTabi: true, birim: null },
  deneme_net_artisi: { tavanGrubu: null, genelTavanaTabi: true, birim: 'net' },
  soru_sorma: { tavanGrubu: 'soru', genelTavanaTabi: true, birim: null },
  soru_anladim: { tavanGrubu: 'soru', genelTavanaTabi: true, birim: null },
  geri_bildirim: { tavanGrubu: null, genelTavanaTabi: true, birim: null },
  kayit_izledi: { tavanGrubu: 'kayit', genelTavanaTabi: true, birim: null },
  haftanin_yildizi: { tavanGrubu: null, genelTavanaTabi: false, birim: null },
};

const tamSayi = (d: unknown, enAz: number, enCok: number): d is number =>
  typeof d === 'number' && Number.isInteger(d) && d >= enAz && d <= enCok;

function dogrula(d: MockAyar): { alan: string; mesaj: string }[] {
  const h: { alan: string; mesaj: string }[] = [];
  for (const [kod, t] of Object.entries(d.tavanlar)) {
    if (!tamSayi(t, 1, 2000)) {
      h.push({
        alan: `tavanlar.${kod}`,
        mesaj: 'Günlük tavan 1 ile 2000 arasında tam sayı olmalı.',
      });
    }
  }
  const genel = d.tavanlar.genel;
  if (typeof genel === 'number') {
    for (const [kod, t] of Object.entries(d.tavanlar)) {
      if (kod !== 'genel' && t > genel) {
        h.push({
          alan: `tavanlar.${kod}`,
          mesaj: `Alt tavan (${String(t)}) genel günlük tavanı (${String(genel)}) aşamaz.`,
        });
      }
    }
  }
  for (const [kod, k] of Object.entries(d.kurallar)) {
    if (!tamSayi(k.xp, 0, 500)) {
      h.push({ alan: `kurallar.${kod}.xp`, mesaj: 'XP 0 ile 500 arasında tam sayı olmalı.' });
    }
    if (k.olay_basi_ust_sinir !== null && !tamSayi(k.olay_basi_ust_sinir, 1, 500)) {
      h.push({
        alan: `kurallar.${kod}.olay_basi_ust_sinir`,
        mesaj: 'Olay başı üst sınır 1 ile 500 arasında tam sayı olmalı ya da boş olmalı.',
      });
    }
    const c = k.gec_carpani;
    if (
      typeof c !== 'number' ||
      !(c >= 0 && c <= 1) ||
      Math.abs(Math.round(c * 100) - c * 100) > 1e-9
    ) {
      h.push({
        alan: `kurallar.${kod}.gec_carpani`,
        mesaj: 'Geç teslim çarpanı 0 ile 1 arasında, en çok iki ondalıklı olmalı.',
      });
    }
    const y = YAPI[kod];
    if (!y) continue;
    const sinirlar: number[] = [];
    const grup = y.tavanGrubu === null ? undefined : d.tavanlar[y.tavanGrubu];
    if (typeof grup === 'number') sinirlar.push(grup);
    if (y.genelTavanaTabi && typeof genel === 'number') sinirlar.push(genel);
    const tavan = sinirlar.length > 0 ? Math.min(...sinirlar) : null;
    if (tavan !== null && y.birim === null && k.xp > tavan) {
      h.push({
        alan: `kurallar.${kod}.xp`,
        mesaj: `Kuralın XP'si (${String(k.xp)}) bağlı olduğu günlük tavanı (${String(tavan)}) aşamaz.`,
      });
    }
  }
  return h;
}

/** Duzenli ogrencinin tipik haftasi: kural basina haftalik tekrar (sadelestirilmis model). */
const HAFTALIK_TEKRAR: Record<string, number> = {
  yoklama_geldi: 4,
  odev_teslim: 3,
  odev_onay: 3,
  plan_gorevi_tamam: 10,
  odak_oturumu: 120,
  soru_sorma: 2,
  soru_anladim: 2,
  geri_bildirim: 3,
  kayit_izledi: 2,
};
function haftalikXp(d: MockAyar): number {
  let t = 0;
  for (const [kod, tekrar] of Object.entries(HAFTALIK_TEKRAR)) {
    const k = d.kurallar[kod];
    if (k?.aktif) t += k.xp * tekrar;
  }
  return t;
}

function uyarilar(once: MockAyar, sonra: MockAyar): { kod: string; mesaj: string }[] {
  const u: { kod: string; mesaj: string }[] = [];
  const referans = haftalikXp(TOHUM_AYAR);
  const haftalik = haftalikXp(sonra);
  const sapma = referans === 0 ? 0 : (haftalik - referans) / referans;
  const ozet = (n: number) => String(Math.round(n * 10) / 10);
  if (Math.abs(sapma) > 0.1) {
    u.push({
      kod: 'haftalik_xp_degisti',
      mesaj: `Düzenli çalışan öğrencinin haftalık XP'si varsayımdaki ${ozet(referans)} yerine ${ozet(haftalik)} olur (%${ozet(Math.abs(sapma) * 100)} ${sapma < 0 ? 'azalır' : 'artar'}).`,
    });
  }
  if ((sonra.tavanlar.genel ?? 0) < 120) {
    u.push({
      kod: 'genel_tavan_dar',
      mesaj: `Genel günlük tavan (${String(sonra.tavanlar.genel)}) düzenli öğrencinin tipik ders gününü kırpar.`,
    });
  }
  for (const [kod, k] of Object.entries(sonra.kurallar)) {
    const eski = once.kurallar[kod];
    if (eski?.aktif && (!k.aktif || (k.xp === 0 && eski.xp > 0))) {
      u.push({ kod: 'kural_kapatildi', mesaj: `"${kod}" kuralı artık XP vermiyor.` });
    }
  }
  return u;
}

function guncel(): MockAyarSurumu {
  const s = durum().ayarlar;
  const son = s[s.length - 1];
  if (!son) throw new Error('ayar surumu yok');
  return son;
}

function surumYaz(yeni: MockAyar, neden: string, geriAlinan: number | null): MockAyarSurumu {
  const onceki = guncel();
  const kayit: MockAyarSurumu = {
    surum: onceki.surum + 1,
    degerler: yeni,
    onceki_surum: onceki.surum,
    geri_alinan_surum: geriAlinan,
    degistiren_kullanici_id: ADMIN_ID,
    neden,
    uyarilar: uyarilar(onceki.degerler, yeni),
    created_at: simdi(),
  };
  durum().ayarlar.push(kayit);
  return kayit;
}

function esit(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function sayiVeyaNull(v: unknown): v is number | null {
  return v === null || typeof v === 'number';
}

export function motivasyonMock(
  yontem: string,
  yol: string,
  sorgu: URLSearchParams,
  govde: unknown,
): MockYanit {
  if (yol === 'motivasyon/ayarlar' && yontem === 'GET') {
    const limit = Math.min(100, Math.max(1, Number(sorgu.get('limit') ?? 20)));
    const hepsi = durum().ayarlar;
    const son = guncel();
    return {
      durum: 200,
      govde: {
        gecerli: { surum: son.surum, degerler: son.degerler },
        gecmis: [...hepsi].reverse().slice(0, limit),
      },
    };
  }

  if (yol === 'motivasyon/ayarlar' && yontem === 'PUT') {
    if (!nesne(govde)) return hata(400, 'dogrulama_hatasi', 'İstek doğrulanamadı.');
    const neden = typeof govde.neden === 'string' ? govde.neden.trim() : '';
    if (neden.length < 3 || neden.length > 500) {
      return hata(400, 'dogrulama_hatasi', 'İstek doğrulanamadı.', [
        { path: 'neden', message: 'Neden 3 ile 500 karakter arasında olmalı.' },
      ]);
    }
    const son = guncel();
    if (typeof govde.beklenen_surum === 'number' && govde.beklenen_surum !== son.surum) {
      return hata(409, 'surum_catismasi', 'Ayarlar siz bakarken değişti; sayfayı yenileyin.', {
        guncel_surum: son.surum,
      });
    }
    const yeni = structuredClone(son.degerler);
    const hatalar: { alan: string; mesaj: string }[] = [];
    const kurallar = nesne(govde.kurallar) ? govde.kurallar : {};
    for (const [kod, kismi] of Object.entries(kurallar)) {
      const hedef = yeni.kurallar[kod];
      if (!hedef || !nesne(kismi)) {
        hatalar.push({ alan: `kurallar.${kod}`, mesaj: 'Bilinmeyen XP kuralı.' });
        continue;
      }
      if (typeof kismi.xp === 'number') hedef.xp = kismi.xp;
      if ('olay_basi_ust_sinir' in kismi && sayiVeyaNull(kismi.olay_basi_ust_sinir)) {
        hedef.olay_basi_ust_sinir = kismi.olay_basi_ust_sinir;
      }
      if (typeof kismi.gec_carpani === 'number') hedef.gec_carpani = kismi.gec_carpani;
      if (typeof kismi.aktif === 'boolean') hedef.aktif = kismi.aktif;
    }
    const tavanlar = nesne(govde.tavanlar) ? govde.tavanlar : {};
    for (const [kod, deger] of Object.entries(tavanlar)) {
      if (!(kod in yeni.tavanlar) || typeof deger !== 'number') {
        hatalar.push({ alan: `tavanlar.${kod}`, mesaj: 'Bilinmeyen tavan grubu.' });
        continue;
      }
      yeni.tavanlar[kod] = deger;
    }
    hatalar.push(...dogrula(yeni));
    if (hatalar.length > 0)
      return hata(422, 'ayar_gecersiz', 'Motivasyon ayarları geçersiz.', { hatalar });
    if (esit(yeni, son.degerler)) return hata(422, 'degisiklik_yok', 'Değer gerçekte değişmiyor.');
    return { durum: 200, govde: surumYaz(yeni, neden, null) };
  }

  if (yol === 'motivasyon/ayarlar/geri-al' && yontem === 'POST') {
    if (!nesne(govde) || typeof govde.surum !== 'number') {
      return hata(400, 'dogrulama_hatasi', 'İstek doğrulanamadı.');
    }
    const neden = typeof govde.neden === 'string' ? govde.neden.trim() : '';
    if (neden.length < 3 || neden.length > 500) {
      return hata(400, 'dogrulama_hatasi', 'İstek doğrulanamadı.', [
        { path: 'neden', message: 'Neden 3 ile 500 karakter arasında olmalı.' },
      ]);
    }
    const son = guncel();
    if (typeof govde.beklenen_surum === 'number' && govde.beklenen_surum !== son.surum) {
      return hata(409, 'surum_catismasi', 'Ayarlar siz bakarken değişti; sayfayı yenileyin.', {
        guncel_surum: son.surum,
      });
    }
    const hedef = durum().ayarlar.find((s) => s.surum === govde.surum);
    if (!hedef) return hata(404, 'bulunamadi', 'Sürüm bulunamadı.');
    if (esit(hedef.degerler, son.degerler)) {
      return hata(422, 'degisiklik_yok', 'Değer gerçekte değişmiyor.');
    }
    return { durum: 201, govde: surumYaz(structuredClone(hedef.degerler), neden, hedef.surum) };
  }

  return hata(404, 'bulunamadi', 'Kaynak bulunamadı.');
}
