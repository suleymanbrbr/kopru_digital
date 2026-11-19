import { MODUL_KODLARI } from '@kopru/contracts';

import { abonelikCikti, abonelikMock, askiCikti, kilitliMi } from './abonelik';
import type { MockDenetim, MockKurum, MockMesaj, MockRol } from './durum';
import { ADMIN_ID, durum, durumuSifirla, simdi, yeniId } from './durum';
import { motivasyonMock } from './motivasyon';
import { mufredatMock } from './mufredat';
import type { MockYanit } from './yanit';
import { dogrulamaHatasi, hata, nesne, uuidMi } from './yanit';

export { durumuSifirla };
export type { MockYanit };

/**
 * Yonetim panelinin mock arka ucu (`NEXT_PUBLIC_API_MOCK=1`): giris, ikinci adim, kurumlar, taklit, denetim,
 * saglik, mesajlar, mufredat ve motivasyon. Sabitler: telefon kodu `123456`, e-posta parolasi `parola1234`;
 * `500...` telefon / `yok@` e-posta platform rolsuz, `502...` / `ip@` IP izin listesi disinda, `501...` / `destek@` destek, digerleri yonetici.
 */

export const MOCK_KOD = '123456';
export const MOCK_PAROLA = 'parola1234';
const TAKLIT_OMRU_MS = 15 * 60 * 1000;

// --- Giris --------------------------------------------------------------------------------------

function rolBelirle(anahtar: string, tur: 'telefon' | 'eposta'): MockRol {
  if (tur === 'telefon') {
    const s = anahtar.replace(/\D/g, '').replace(/^90/, '').replace(/^0/, '');
    if (s.startsWith('500')) return 'yok';
    if (s.startsWith('502')) return 'ip';
    if (s.startsWith('501')) return 'destek';
    return 'yonetici';
  }
  if (anahtar.startsWith('yok@')) return 'yok';
  if (anahtar.startsWith('ip@')) return 'ip';
  if (anahtar.startsWith('destek@')) return 'destek';
  return 'yonetici';
}

export function mockKodIste(telefon: string): MockYanit {
  if (telefon.replace(/\D/g, '').length < 7) {
    return hata(400, 'gecersiz_telefon', 'Geçerli bir telefon numarası girin.');
  }
  return { durum: 200, govde: { gonderildi: true, gecerlilik_sn: 300 } };
}

function oturumAc(rol: MockRol): MockYanit {
  const id = yeniId();
  durum().oturumlar.set(id, { ikinciAdimDogrulandi: false, rol });
  return {
    durum: 200,
    govde: {
      oturum_belirteci: `mock-oturum.${id}`,
      yeni_kullanici: false,
      kullanici: { id: ADMIN_ID },
    },
  };
}

export function mockKodDogrula(telefon: string, kod: string): MockYanit {
  if (kod !== MOCK_KOD) return hata(400, 'kod_gecersiz', 'Kod geçersiz veya süresi dolmuş.');
  return oturumAc(rolBelirle(telefon, 'telefon'));
}

export function mockEpostaGiris(eposta: string, parola: string): MockYanit {
  if (parola !== MOCK_PAROLA) return hata(401, 'unauthorized', 'Oturum açılamadı.');
  return oturumAc(rolBelirle(eposta.toLowerCase(), 'eposta'));
}

/** `mock-oturum.<id>` -> erisim belirteci (`mock-erisim.<id>`); gecersizse `null`. */
export function mockErisimAl(oturumBelirteci: string): { belirtec: string; omurSn: number } | null {
  const id = /^mock-oturum\.(.+)$/.exec(oturumBelirteci)?.[1];
  if (!id || !durum().oturumlar.has(id)) return null;
  return { belirtec: `mock-erisim.${id}`, omurSn: 900 };
}

export function mockCikis(oturumBelirteci: string): void {
  const id = /^mock-oturum\.(.+)$/.exec(oturumBelirteci)?.[1];
  if (id) durum().oturumlar.delete(id);
}

// --- Denetim ------------------------------------------------------------------------------------

function denetle(
  eylem: string,
  alanlar: Partial<
    Pick<MockDenetim, 'kurum_id' | 'hedef_turu' | 'hedef_id' | 'neden' | 'taklit_kayit_id'>
  > & {
    ayrinti?: Record<string, unknown>;
    aktor?: string;
  } = {},
): void {
  const { aktor, ayrinti, ...geri } = alanlar;
  durum().denetim.push({
    id: yeniId(),
    eylem,
    created_at: simdi(),
    aktor_kullanici_id: aktor ?? ADMIN_ID,
    neden: geri.neden ?? `Platform yönetimi: ${eylem}`,
    ip: '127.0.0.1',
    ayrinti: { durum: 200, ...ayrinti },
    ...(geri.kurum_id ? { kurum_id: geri.kurum_id } : {}),
    ...(geri.hedef_turu ? { hedef_turu: geri.hedef_turu } : {}),
    ...(geri.hedef_id ? { hedef_id: geri.hedef_id } : {}),
    ...(geri.taklit_kayit_id ? { taklit_kayit_id: geri.taklit_kayit_id } : {}),
  });
}

// --- Yardimcilar --------------------------------------------------------------------------------

const katla = (s: string) =>
  s.toLocaleLowerCase('tr').replace(/ı/g, 'i').normalize('NFD').replace(/[̀-ͯ]/g, '');

function telefonMaske(t: string): string {
  const s = t.replace(/\D/g, '');
  return `+${s.slice(0, 2)} ${s.slice(2, 5)} *** ** ${s.slice(-2)}`;
}
function epostaMaske(e: string): string {
  const [a = '', b = ''] = e.split('@');
  return `${a.slice(0, 1)}***@${b}`;
}
const sahiplerCikti = (k: MockKurum) => [
  {
    kullanici_id: k.sahip.kullanici_id,
    telefon_maskeli: telefonMaske(k.sahip.telefon),
    eposta_maskeli: epostaMaske(k.sahip.eposta),
  },
];

function nedenDogrula(g: Record<string, unknown>): string | MockYanit {
  const n = typeof g.neden === 'string' ? g.neden.trim() : '';
  if (n.length < 10 || n.length > 500) {
    return dogrulamaHatasi({
      path: 'neden',
      message: 'Neden 10 ile 500 karakter arasında olmalı.',
    });
  }
  return n;
}

function kurumDetay(k: MockKurum) {
  return {
    id: k.id,
    ad: k.ad,
    tur: k.tur,
    durum: k.durum,
    created_at: k.created_at,
    saat_dilimi: 'Europe/Istanbul',
    sahipler: sahiplerCikti(k),
    uye_sayilari: {
      aktif_toplam: Object.values(k.roller).reduce((a, b) => a + b, 0),
      diger_durumlar: k.diger,
      rollere_gore: k.roller,
    },
    moduller: MODUL_KODLARI.map((kod) => {
      const m = k.moduller[kod] ?? { acik: true, ayarVar: false, altKapali: 0 };
      return {
        modul_kodu: kod,
        kurum_acik: m.acik,
        kurum_ayari_var: m.ayarVar,
        alt_duzey_kapali_sayisi: m.altKapali,
      };
    }),
    beta_ozellikleri: k.beta,
    abonelik: { abonelik: abonelikCikti(k.abonelik), yazma_kilitli: kilitliMi(k.abonelik) },
    platform_aski: askiCikti(k),
  };
}

function mesajDurumu(m: MockMesaj): MockMesaj {
  return m;
}

// --- /platform/* --------------------------------------------------------------------------------

export interface MockPlatformIstek {
  /** `mock-erisim.<oturum id>` */
  erisim: string;
  yontem: string;
  /** `/platform/` sonrasi yol (motivasyon icin `motivasyon/ayarlar`). */
  yol: string;
  sorgu: URLSearchParams;
  govde: unknown;
}

export function mockPlatform(istek: MockPlatformIstek): MockYanit {
  const { yontem, yol, sorgu } = istek;
  const g = nesne(istek.govde) ? istek.govde : {};
  const oturumId = /^mock-erisim\.(.+)$/.exec(istek.erisim)?.[1];
  const oturum = oturumId ? durum().oturumlar.get(oturumId) : undefined;
  if (!oturum) return hata(401, 'unauthorized', 'Oturum açmanız gerekiyor.');
  if (oturum.rol === 'ip')
    return hata(403, 'platform_ip_yasak', 'Bu adresten platform erişimine izin verilmiyor.');
  if (oturum.rol === 'yok') return hata(403, 'platform_yetkisi_yok', 'Platform yetkiniz yok.');
  const yonetici = oturum.rol === 'yonetici';
  const p = yol.split('/');

  // Ikinci adim (kapidan muaf)
  if (yol === 'ben' && yontem === 'GET') {
    return {
      durum: 200,
      govde: {
        kullanici_id: ADMIN_ID,
        platform_rolu: oturum.rol,
        ikinci_adim: {
          kurulu: durum().ikinciAdim.kurulu,
          oturumda_dogrulandi: oturum.ikinciAdimDogrulandi,
          yedek_kod_kalan: durum().ikinciAdim.yedek.length,
        },
      },
    };
  }
  if (p[0] === 'ikinci-adim' && yontem === 'POST') {
    const ia = durum().ikinciAdim;
    if (p[1] === 'kur') {
      if (ia.kurulu) return hata(409, 'ikinci_adim_kurulu', 'İki adımlı doğrulama zaten kurulu.');
      ia.yedek = Array.from({ length: 10 }, () =>
        yeniId().replace(/-/g, '').slice(0, 10).toUpperCase(),
      );
      denetle('platform.ikinci_adim_kur');
      return {
        durum: 200,
        govde: {
          otpauth_uri: `otpauth://totp/Kopru:${oturum.rol}-0190a000?secret=JBSWY3DPEHPK3PXP&issuer=Kopru&digits=6&period=30`,
          sir: 'JBSWY3DPEHPK3PXP',
          yedek_kodlar: ia.yedek,
        },
      };
    }
    if (p[1] === 'onayla' || p[1] === 'dogrula') {
      const kod = typeof g.kod === 'string' ? g.kod : undefined;
      const yedek = typeof g.yedek_kod === 'string' ? g.yedek_kod.toUpperCase() : undefined;
      if (p[1] === 'dogrula' && !ia.kurulu) {
        return hata(
          409,
          'conflict',
          'İki adımlı doğrulama kurulu değil; önce kurulumu tamamlayın.',
        );
      }
      if (kod === undefined && yedek === undefined)
        return dogrulamaHatasi({ path: 'kod', message: 'Kod gerekli.' });
      const yedekIdx = yedek ? ia.yedek.indexOf(yedek) : -1;
      const gecerli = kod === MOCK_KOD || yedekIdx >= 0;
      if (!gecerli) {
        denetle('platform.ikinci_adim_basarisiz', { ayrinti: { durum: 400, kod: 'kod_gecersiz' } });
        return hata(400, 'kod_gecersiz', 'Kod geçersiz.');
      }
      if (yedekIdx >= 0) ia.yedek.splice(yedekIdx, 1);
      ia.kurulu = true;
      oturum.ikinciAdimDogrulandi = true;
      denetle(p[1] === 'onayla' ? 'platform.ikinci_adim_onayla' : 'platform.ikinci_adim_dogrula');
      return { durum: 200, govde: { dogrulandi: true, yedek_kod_kalan: ia.yedek.length } };
    }
  }

  // Kapi: ikinci adim
  if (!oturum.ikinciAdimDogrulandi) {
    return hata(
      403,
      'ikinci_adim_gerekli',
      'Platform işlemleri için iki adımlı doğrulamayı tamamlayın.',
    );
  }
  const yoneticiGerekli = (): MockYanit =>
    hata(403, 'platform_izin_yok', 'Bu işlem için platform yöneticisi rolü gerekir.');

  // Kurumlar
  if (p[0] === 'kurumlar') {
    if (p.length === 1 && yontem === 'GET') {
      const q = sorgu.get('q') ?? '';
      if (q.length > 0 && q.trim().length < 2) {
        return dogrulamaHatasi({ path: 'q', message: 'Arama en az 2 karakter olmalı.' });
      }
      const durumF = sorgu.get('durum');
      const limit = Math.min(200, Math.max(1, Number(sorgu.get('limit') ?? 25)));
      const bas = Number(sorgu.get('imlec') ?? 0) || 0;
      const nk = katla(q.trim());
      const sonuc = durum().kurumlar.filter((k) => {
        if (durumF && k.durum !== durumF) return false;
        if (!nk) return true;
        const tel = k.sahip.telefon.replace(/\D/g, '');
        return (
          katla(k.ad).includes(nk) ||
          k.id === q.trim() ||
          (tel.endsWith(q.replace(/\D/g, '')) && q.replace(/\D/g, '').length >= 7) ||
          k.sahip.eposta === q.trim().toLowerCase()
        );
      });
      const sayfa = sonuc.slice(bas, bas + limit);
      denetle('platform.kurum_ara', { ayrinti: { arama_turu: q ? 'metin' : 'yok' } });
      return {
        durum: 200,
        govde: {
          kurumlar: sayfa.map((k) => ({
            id: k.id,
            ad: k.ad,
            tur: k.tur,
            durum: k.durum,
            created_at: k.created_at,
            sahipler: sahiplerCikti(k),
          })),
          sonraki_imlec: bas + limit < sonuc.length ? String(bas + limit) : null,
        },
      };
    }
    const kurum = durum().kurumlar.find((k) => k.id === p[1]);
    if (!kurum) return hata(404, 'bulunamadi', 'Kurum bulunamadı.');
    if (p.length === 2 && yontem === 'GET') {
      denetle('platform.kurum_detay', {
        kurum_id: kurum.id,
        hedef_turu: 'kurum',
        hedef_id: kurum.id,
      });
      return { durum: 200, govde: kurumDetay(kurum) };
    }
    if (p.length === 4 && yontem === 'PUT' && (p[2] === 'moduller' || p[2] === 'beta')) {
      if (!yonetici) return yoneticiGerekli();
      const n = nedenDogrula(g);
      if (typeof n !== 'string') return n;
      if (g.acik !== null && typeof g.acik !== 'boolean') {
        return dogrulamaHatasi({ path: 'acik', message: 'acik true, false ya da null olmalı.' });
      }
      const kod = p[3] ?? '';
      if (p[2] === 'moduller') {
        if (!(MODUL_KODLARI as readonly string[]).includes(kod)) {
          return dogrulamaHatasi({ path: 'modul_kodu', message: 'Modül kodu geçersiz.' });
        }
        const m = (kurum.moduller[kod] ??= { acik: true, ayarVar: false, altKapali: 0 });
        m.acik = g.acik ?? true;
        m.ayarVar = g.acik !== null;
        denetle('platform.modul_ayarla', {
          kurum_id: kurum.id,
          hedef_turu: 'modul_ayari',
          neden: n,
          ayrinti: { modul_kodu: kod, acik: g.acik },
        });
        return {
          durum: 200,
          govde: { modul_kodu: kod, kurum_acik: m.acik, kurum_ayari_var: m.ayarVar },
        };
      }
      if (!/^[a-z][a-z0-9_]{1,39}$/.test(kod)) {
        return dogrulamaHatasi({ path: 'ozellik_kodu', message: 'Özellik kodu geçersiz.' });
      }
      const var_ = kurum.beta.find((b) => b.ozellik_kodu === kod);
      if (g.acik === null) kurum.beta = kurum.beta.filter((b) => b.ozellik_kodu !== kod);
      else if (var_) {
        var_.acik = g.acik;
        var_.updated_at = simdi();
      } else kurum.beta.push({ ozellik_kodu: kod, acik: g.acik, updated_at: simdi() });
      denetle('platform.beta_ayarla', {
        kurum_id: kurum.id,
        hedef_turu: 'beta_ozelligi',
        neden: n,
        ayrinti: { ozellik_kodu: kod, acik: g.acik },
      });
      return { durum: 200, govde: { ozellik_kodu: kod, acik: g.acik ?? false } };
    }
    const ek = p.slice(2);
    if (ek[0] === 'abonelik' || ek[0] === 'askiya-al' || ek[0] === 'ac') {
      if (yontem !== 'GET' && !yonetici) return yoneticiGerekli();
      const yanit = abonelikMock(kurum, yontem, ek, g, (eylem, neden, ayrinti) => {
        denetle(eylem, {
          kurum_id: kurum.id,
          hedef_turu: 'kurum',
          hedef_id: kurum.id,
          neden,
          ...(ayrinti ? { ayrinti } : {}),
        });
      });
      if (yanit) {
        if (yontem === 'GET') denetle('platform.abonelik_oku', { kurum_id: kurum.id });
        return yanit;
      }
    }
    return hata(404, 'bulunamadi', 'Kaynak bulunamadı.');
  }

  // Taklit
  if (p[0] === 'taklit') {
    if (p.length === 1 && yontem === 'POST') {
      const n = nedenDogrula(g);
      if (typeof n !== 'string') return n;
      if (!uuidMi(g.kurum_id) || !uuidMi(g.hedef_kullanici_id)) {
        return dogrulamaHatasi({
          path: 'hedef_kullanici_id',
          message: 'Kimlikler geçerli UUID olmalı.',
        });
      }
      const kurum = durum().kurumlar.find((k) => k.id === g.kurum_id);
      if (!kurum) return hata(404, 'bulunamadi', 'Kurum bulunamadı.');
      if (kurum.sahip.kullanici_id !== g.hedef_kullanici_id) {
        return hata(404, 'bulunamadi', 'Hedef kullanıcı bu kurumda aktif üye değil.');
      }
      const id = yeniId();
      const bitis = Date.now() + TAKLIT_OMRU_MS;
      durum().taklitler.push({
        taklit_id: id,
        kurum_id: kurum.id,
        hedef_kullanici_id: kurum.sahip.kullanici_id,
        bitis,
        sonlandi: false,
      });
      denetle('platform.taklit_baslat', {
        kurum_id: kurum.id,
        hedef_turu: 'kullanici',
        hedef_id: kurum.sahip.kullanici_id,
        neden: n,
        taklit_kayit_id: id,
      });
      return {
        durum: 200,
        govde: {
          access_token: `mock-taklit.${id}`,
          token_type: 'Bearer',
          expires_in: TAKLIT_OMRU_MS / 1000,
          bitis_at: new Date(bitis).toISOString(),
          taklit_id: id,
          kurum_id: kurum.id,
          hedef_kullanici_id: kurum.sahip.kullanici_id,
          rol: 'sahip',
        },
      };
    }
    if (p.length === 3 && p[2] === 'sonlandir' && yontem === 'POST') {
      const t = durum().taklitler.find((x) => x.taklit_id === p[1]);
      if (!t) return hata(404, 'bulunamadi', 'Taklit kaydı bulunamadı.');
      t.sonlandi = true;
      denetle('platform.taklit_sonlandir', { kurum_id: t.kurum_id, taklit_kayit_id: t.taklit_id });
      return { durum: 200, govde: { sonlandirildi: true, taklit_id: t.taklit_id } };
    }
    return hata(404, 'bulunamadi', 'Kaynak bulunamadı.');
  }

  // Sistem sagligi
  if (yol === 'sistem-sagligi' && yontem === 'GET') {
    denetle('platform.sistem_sagligi');
    return {
      durum: 200,
      govde: {
        uretildi_at: simdi(),
        outbox: { bekleyen: 3, en_eski_yas_sn: 12, hatali: 0 },
        kuyruklar: {
          pgboss_kurulu: true,
          basarisiz: 1,
          derinlikler: [
            { kuyruk: 'bildirim-gonder', durum: 'created', sayi: 2 },
            { kuyruk: 'rapor-uret', durum: 'active', sayi: 1 },
            { kuyruk: 'rapor-uret', durum: 'failed', sayi: 1 },
          ],
        },
        http: { kaynak: 'surec_ici', pencere_dk: 60, istek: 1284, hata_5xx: 2, oran_5xx: 0.0016 },
      },
    };
  }

  // Mesajlar
  if (p[0] === 'mesajlar') {
    if (p.length === 1 && yontem === 'GET') {
      denetle('platform.mesaj_listele');
      return { durum: 200, govde: { mesajlar: [...durum().mesajlar].reverse().map(mesajDurumu) } };
    }
    if (!yonetici) return yoneticiGerekli();
    if (p.length === 1 && yontem === 'POST') {
      const baslik = typeof g.baslik === 'string' ? g.baslik.trim() : '';
      const metin = typeof g.metin === 'string' ? g.metin.trim() : '';
      const alanlar: { path: string; message: string }[] = [];
      if (baslik.length < 1 || baslik.length > 120)
        alanlar.push({ path: 'baslik', message: 'Başlık 1 ile 120 karakter arasında olmalı.' });
      if (metin.length < 1 || metin.length > 2000)
        alanlar.push({ path: 'metin', message: 'Metin 1 ile 2000 karakter arasında olmalı.' });
      const bitis = typeof g.bitis_at === 'string' ? Date.parse(g.bitis_at) : NaN;
      if (Number.isNaN(bitis))
        alanlar.push({ path: 'bitis_at', message: 'Bitiş zamanı geçerli bir tarih olmalı.' });
      if (alanlar.length > 0) return dogrulamaHatasi(...alanlar);
      const onem = g.onem === 'uyari' || g.onem === 'kritik' ? g.onem : 'bilgi';
      const baslangic =
        typeof g.baslangic_at === 'string' && !Number.isNaN(Date.parse(g.baslangic_at))
          ? g.baslangic_at
          : simdi();
      if (bitis <= Date.parse(baslangic)) {
        return hata(400, 'dogrulama_hatasi', 'Bitiş zamanı başlangıçtan sonra olmalı.');
      }
      const m: MockMesaj = {
        id: yeniId(),
        baslik,
        metin,
        onem,
        baslangic_at: baslangic,
        bitis_at: new Date(bitis).toISOString(),
        created_at: simdi(),
      };
      durum().mesajlar.push(m);
      denetle('platform.mesaj_yayinla', { hedef_turu: 'mesaj', hedef_id: m.id, ayrinti: { onem } });
      return { durum: 200, govde: m };
    }
    if (p.length === 3 && p[2] === 'iptal' && yontem === 'POST') {
      const m = durum().mesajlar.find((x) => x.id === p[1]);
      if (!m || m.iptal_at) return hata(404, 'bulunamadi', 'Mesaj bulunamadı.');
      m.iptal_at = simdi();
      denetle('platform.mesaj_iptal', { hedef_turu: 'mesaj', hedef_id: m.id });
      return { durum: 200, govde: { iptal_edildi: true, mesaj_id: m.id } };
    }
    return hata(404, 'bulunamadi', 'Kaynak bulunamadı.');
  }

  // Denetim
  if (yol === 'denetim' && yontem === 'GET') {
    if (!yonetici) return yoneticiGerekli();
    const kurumId = sorgu.get('kurum_id');
    const aktor = sorgu.get('aktor_id');
    const eylem = sorgu.get('eylem');
    const bas = sorgu.get('baslangic');
    const bit = sorgu.get('bitis');
    const limit = Math.min(200, Math.max(1, Number(sorgu.get('limit') ?? 50)));
    const imlec = Number(sorgu.get('imlec') ?? 0) || 0;
    const hepsi = [...durum().denetim].reverse().filter((d) => {
      if (kurumId && d.kurum_id !== kurumId) return false;
      if (aktor && d.aktor_kullanici_id !== aktor) return false;
      if (eylem) {
        if (eylem.endsWith('.*') ? !d.eylem.startsWith(eylem.slice(0, -1)) : d.eylem !== eylem)
          return false;
      }
      if (bas && d.created_at < new Date(bas).toISOString()) return false;
      if (bit && d.created_at > new Date(bit).toISOString()) return false;
      return true;
    });
    const sayfa = hepsi.slice(imlec, imlec + limit);
    denetle('platform.denetim_listele', {
      ayrinti: { suzgecler: [kurumId && 'kurum_id', eylem && 'eylem'].filter(Boolean) },
    });
    return {
      durum: 200,
      govde: {
        kayitlar: sayfa,
        sonraki_imlec: imlec + limit < hepsi.length ? String(imlec + limit) : null,
      },
    };
  }

  // Mufredat / motivasyon: yalniz yonetici
  if (p[0] === 'mufredat' || p[0] === 'motivasyon') {
    if (!yonetici) return yoneticiGerekli();
    const yanit =
      p[0] === 'mufredat'
        ? mufredatMock(yontem, yol, istek.govde)
        : motivasyonMock(yontem, yol, sorgu, istek.govde);
    if (yontem !== 'GET' && yanit.durum < 300) {
      const eylem =
        p[0] === 'mufredat'
          ? `platform.mufredat.${mufredatEylemi(yol)}`
          : yol.endsWith('geri-al')
            ? 'platform.motivasyon.geri_al'
            : 'platform.motivasyon.ayar_degistir';
      const neden =
        typeof g.neden === 'string' ? g.neden : typeof g.not === 'string' ? g.not : undefined;
      denetle(eylem, { ...(neden ? { neden } : {}) });
    }
    return yanit;
  }

  return hata(404, 'bulunamadi', 'Kaynak bulunamadı.');
}

function mufredatEylemi(yol: string): string {
  const son = yol.split('/').pop() ?? '';
  if (son === 'taslak') return 'taslak_ac';
  if (son === 'konular') return 'ekle';
  return son;
}

// --- Taklit okumalari (taklit belirteciyle, salt okunur) -----------------------------------------

export function mockTaklitOkuma(taklitBelirteci: string, yol: string): MockYanit {
  const id = /^mock-taklit\.(.+)$/.exec(taklitBelirteci)?.[1];
  const t = durum().taklitler.find((x) => x.taklit_id === id);
  if (!t || t.sonlandi || t.bitis < Date.now()) {
    return hata(401, 'unauthorized', 'Taklit oturumu sona ermiş.');
  }
  const kurum = durum().kurumlar.find((k) => k.id === t.kurum_id);
  denetle('taklit.istek', {
    kurum_id: t.kurum_id,
    taklit_kayit_id: t.taklit_id,
    ayrinti: { yontem: 'GET', yol: `/v1/${yol}`, durum: 200 },
  });
  if (yol === 'hesap/ben') {
    return {
      durum: 200,
      govde: {
        kullanici: {
          id: t.hedef_kullanici_id,
          gorunen_ad: 'Mock Sahip',
          telefon_e164: kurum?.sahip.telefon ?? '',
        },
        onay_gerekli: false,
      },
    };
  }
  if (yol === 'hesap/modul-ayarlari/etkin-tumu') {
    return {
      durum: 200,
      govde: {
        moduller: Object.fromEntries(
          MODUL_KODLARI.map((kod) => [kod, kurum?.moduller[kod]?.acik ?? true]),
        ),
      },
    };
  }
  if (/^hesap\/kurumlar\/[0-9a-f-]{36}$/.test(yol)) {
    return {
      durum: 200,
      govde: {
        id: t.kurum_id,
        ad: kurum?.ad ?? '',
        tur: kurum?.tur ?? 'kurum',
        durum: kurum?.durum ?? 'aktif',
      },
    };
  }
  return hata(404, 'bulunamadi', 'Kaynak bulunamadı.');
}
