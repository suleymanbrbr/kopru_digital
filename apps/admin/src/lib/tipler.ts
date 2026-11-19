import type { ApiPaths, MotivasyonPaths } from '@kopru/api-client';

/**
 * Arayuzun kullandigi tipler `@kopru/api-client`in OpenAPI'den uretilmis yollarindan turetilir
 * (elle tip yazilmaz): sozlesme degisirse derleme kirilir.
 */
type Icerik<R> = R extends { content: { 'application/json': infer J } } ? J : never;
type Yanit<O, K extends number> = O extends { responses: Record<K, infer R> } ? Icerik<R> : never;
type Govde<O> = O extends { requestBody: { content: { 'application/json': infer J } } } ? J : never;

type A = ApiPaths;
type M = MotivasyonPaths;

export type Ben = Yanit<A['/platform/ben']['get'], 200>;
export type PlatformRolu = Ben['platform_rolu'];

export type KurumListesi = Yanit<A['/platform/kurumlar']['get'], 200>;
export type KurumOzeti = KurumListesi['kurumlar'][number];
export type KurumDetayi = Yanit<A['/platform/kurumlar/{kurum_id}']['get'], 200>;
export type KurumDurumu = KurumOzeti['durum'];
export type ModulDurumu = KurumDetayi['moduller'][number];

export type IkinciAdimKurulum = Yanit<A['/platform/ikinci-adim/kur']['post'], 200>;
export type IkinciAdimSonuc = Yanit<A['/platform/ikinci-adim/dogrula']['post'], 200>;

export type TaklitSonuc = Yanit<A['/platform/taklit']['post'], 200>;
export type TaklitGovde = Govde<A['/platform/taklit']['post']>;

export type DenetimListesi = Yanit<A['/platform/denetim']['get'], 200>;
export type DenetimKaydi = DenetimListesi['kayitlar'][number];

export type SistemSagligi = Yanit<A['/platform/sistem-sagligi']['get'], 200>;

export type MesajListesi = Yanit<A['/platform/mesajlar']['get'], 200>;
export type Mesaj = MesajListesi['mesajlar'][number];
export type MesajGovde = Govde<A['/platform/mesajlar']['post']>;

type MufredatYolu = '/platform/mufredat/kataloglar';
export type KatalogListesi = Yanit<A[MufredatYolu]['get'], 200>;
export type Katalog = KatalogListesi['kataloglar'][number];
export type KatalogKodu = Katalog['katalog_kodu'];
export type SurumOzeti = Katalog['surumler'][number];

type AgacYolu = '/platform/mufredat/kataloglar/{katalog_kodu}/surumler/{surum_no}/agac';
type FarkYolu = '/platform/mufredat/kataloglar/{katalog_kodu}/surumler/{surum_no}/fark';
export type Agac = Yanit<A[AgacYolu]['get'], 200>;
export type Konu = Agac['konular'][number];
export type Fark = Yanit<A[FarkYolu]['get'], 200>;
export type Degisiklik = Fark['eklenen'][number];
export type YayinSonucu = Yanit<
  A['/platform/mufredat/kataloglar/{katalog_kodu}/taslak/yayinla']['post'],
  200
>;

export type AyarlarYaniti = Yanit<M['/platform/motivasyon/ayarlar']['get'], 200>;
export type AyarSurumu = AyarlarYaniti['gecmis'][number];
export type AyarDegerleri = AyarSurumu['degerler'];
export type KuralDegeri = AyarDegerleri['kurallar'][string];

/** `GET /api/taklit/durum` */
export interface TaklitOzeti {
  taklit_id: string;
  kurum_id: string;
  hedef_kullanici_id: string;
  rol: string;
  bitis_at: string;
}
