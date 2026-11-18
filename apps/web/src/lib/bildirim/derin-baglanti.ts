import type { Rol } from '@/lib/navigasyon';

/**
 * Bildirimdeki uygulama ici derin baglantiyi (`kopru://<hedef>/...`) web rotasina cevirir. Mobil uygulamayla
 * ayni baglantilari paylasir (`services/bildirim/src/sablonlar.ts`); web'de karsiligi olmayan hedefler ve
 * rolun goremeyecegi ekranlar guvenli sekilde `/[kurumId]/bildirimler` sayfasinda kalir.
 *
 * Saf fonksiyon: yalniz goreli yol dondurur (acik yonlendirme olusmaz); kimlik parcalari yalniz
 * `[A-Za-z0-9_-]` icerebilir. Sorgu ve parca (`?`, `#`) yok sayilir.
 *
 * Desteklenen kaliplar (kimlik `:id`):
 * - `soru/:id`, `soru`, `sorular`            -> ogrenci `soru-sor[/:id]`, personel `sorular[/:id]`
 * - `bugun`, `ana`                           -> `bugun`
 * - `odev/:id`, `odev`, `odevler`            -> ogrenci `odevlerim`, personel `odevler`
 * - `ders/:id`, `ders`, `dersler`, `takvim`  -> `takvim`
 * - `yoklama[/:id]`                          -> personel `yoklama`, ogrenci `takvim`
 * - `kayit/:id`, `kayit`, `kayitlar`         -> ogrenci `kayitlarim`, personel `kayitlar`
 * - `plan`, `planlar`, `deneme`, `denemeler` -> `planlar`, `denemeler`
 * - `karakter`, `karakterim`, `seri`, `rozet`, `rozetler`, `seviye`, `oyunlastirma`, `xp`
 *                                            -> ogrenci `karakterim` (personelde bildirimler)
 * - `odak`                                   -> ogrenci `odak`
 * - `finans[/...]`, `kredi`, `tahsilat`      -> personel `finans` (ogrencide bildirimler)
 * - `ogrenci/:id`, `ogrenciler`              -> personel `ogrenciler[/:id]`
 * - `grup/:id`, `gruplar`                    -> personel `gruplar[/:id]`
 * - `geri-bildirim`                          -> yonetim `geri-bildirim`, ogrenci `bugun`
 * - `abonelik`                               -> sahip `abonelik`
 * - `davet/:belirtec`                        -> `/davet/:belirtec` (kurum disi sayfa)
 * - `oturumlar`, `hesap`                     -> `oturumlar`
 * - `duyuru[/:id]`, `duyurular[/:id]`         -> `duyurular[/:id]` (tum roller)
 * - `bildirimler`                           -> `bildirimler`
 * - bilinmeyen / bos / gecersiz              -> `bildirimler`
 */
const KIMLIK = /^[A-Za-z0-9_-]{1,80}$/;
const PERSONEL: readonly Rol[] = ['sahip', 'yonetici', 'ogretmen'];

export function bildirimlerYolu(kurumId: string): string {
  return `/${kurumId}/bildirimler`;
}

interface Baglam {
  kurumId: string;
  rol: Rol;
}

export function derinBaglantiyiCoz(baglanti: string | null | undefined, baglam: Baglam): string {
  const varsayilan = bildirimlerYolu(baglam.kurumId);
  if (!baglanti) return varsayilan;
  const eslesme = /^kopru:\/\/([^?#]*)/i.exec(baglanti.trim());
  if (!eslesme) return varsayilan;
  const parcalar = (eslesme[1] ?? '').split('/').filter((p) => p !== '');
  const [hedef, kimlik, ...artik] = parcalar;
  if (!hedef) return varsayilan;
  // Finans ekraninin alt yollari (`finans/ogrenci/:id`) tek sayfaya iner; digerleri en cok bir kimlik alir.
  const finansAlti = hedef.toLowerCase() === 'finans';
  if (!finansAlti && artik.length > 0) return varsayilan;
  if (!finansAlti && kimlik !== undefined && !KIMLIK.test(kimlik)) return varsayilan;

  const k = `/${baglam.kurumId}`;
  const ogrenci = baglam.rol === 'ogrenci';
  const personel = PERSONEL.includes(baglam.rol);
  const yonetim = baglam.rol === 'sahip' || baglam.rol === 'yonetici';
  const kimlikli = (taban: string) => (kimlik ? `${k}/${taban}/${kimlik}` : `${k}/${taban}`);

  switch (hedef.toLowerCase()) {
    case 'soru':
    case 'sorular':
      return ogrenci ? kimlikli('soru-sor') : personel ? kimlikli('sorular') : varsayilan;
    case 'bugun':
    case 'ana':
      return `${k}/bugun`;
    case 'odev':
    case 'odevler':
    case 'odevlerim':
      return ogrenci ? `${k}/odevlerim` : personel ? `${k}/odevler` : varsayilan;
    case 'ders':
    case 'dersler':
    case 'takvim':
      return `${k}/takvim`;
    case 'yoklama':
      return personel ? `${k}/yoklama` : ogrenci ? `${k}/takvim` : varsayilan;
    case 'kayit':
    case 'kayitlar':
    case 'kayitlarim':
      return ogrenci ? `${k}/kayitlarim` : personel ? `${k}/kayitlar` : varsayilan;
    case 'plan':
    case 'planlar':
      return `${k}/planlar`;
    case 'deneme':
    case 'denemeler':
      return `${k}/denemeler`;
    case 'karakter':
    case 'karakterim':
    case 'seri':
    case 'rozet':
    case 'rozetler':
    case 'seviye':
    case 'oyunlastirma':
    case 'xp':
      return ogrenci ? `${k}/karakterim` : varsayilan;
    case 'odak':
      return ogrenci ? `${k}/odak` : varsayilan;
    case 'finans':
    case 'kredi':
    case 'tahsilat':
      return personel ? `${k}/finans` : varsayilan;
    case 'ogrenci':
    case 'ogrenciler':
      return personel ? kimlikli('ogrenciler') : varsayilan;
    case 'grup':
    case 'gruplar':
      return personel ? kimlikli('gruplar') : varsayilan;
    case 'geri-bildirim':
      return yonetim ? `${k}/geri-bildirim` : ogrenci ? `${k}/bugun` : varsayilan;
    case 'abonelik':
      return baglam.rol === 'sahip' ? `${k}/abonelik` : varsayilan;
    case 'davet':
      return kimlik ? `/davet/${kimlik}` : varsayilan;
    case 'duyuru':
    case 'duyurular':
      return kimlikli('duyurular');
    case 'oturumlar':
    case 'hesap':
      return `${k}/oturumlar`;
    default:
      return varsayilan;
  }
}
