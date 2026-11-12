'use client';

import { t } from '@kopru/i18n';

import { KonuSecici } from '@/components/ogrenme/konu-secici';
import { Alan } from '@/components/operasyon/ortak';
import { Dugme } from '@/components/ui/button';
import { Girdi } from '@/components/ui/input';
import { Secim } from '@/components/ui/secim';
import { siraliBransler } from '@/lib/bransler';
import type { KaynakSuzgeci } from '@/lib/kayit/veri';
import type { GrupSecenegi } from '@/lib/operasyon-verisi';

export const BOS_SUZGEC: KaynakSuzgeci = {};

/** Etkin (bos olmayan) suzgec sayisi. */
export function suzgecSayisi(s: KaynakSuzgeci): number {
  return Object.values(s).filter((v) => v !== undefined && v !== '').length;
}

/** Baslangic bitisten sonra mi? (sunucu 400 verir; istek hic atilmaz) */
export function aralikGecersiz(s: KaynakSuzgeci): boolean {
  return Boolean(s.baslangic && s.bitis && s.baslangic > s.bitis);
}

/**
 * Kayit listesi suzgecleri: tur, brans, grup, konu, tarih araligi (ve personel icin durum). Her degisiklik
 * anında sunucu sorgusunu yeniler; ayri "Uygula" dugmesi yoktur.
 */
export function KayitSuzgecleri({
  kurumId,
  deger,
  degisti,
  gruplar,
  durumlar = false,
}: {
  kurumId: string;
  deger: KaynakSuzgeci;
  degisti: (s: KaynakSuzgeci) => void;
  /** Verilirse grup suzgeci gosterilir. */
  gruplar?: readonly GrupSecenegi[] | undefined;
  durumlar?: boolean;
}) {
  const ayarla = (parca: Partial<KaynakSuzgeci>) => {
    degisti({ ...deger, ...parca });
  };
  const gecersiz = aralikGecersiz(deger);
  return (
    <form
      role="search"
      aria-label={t('kayitGeriBildirim.suzgec.baslik')}
      onSubmit={(e) => {
        e.preventDefault();
      }}
      className="grid gap-3 border-b border-kenar p-4 sm:grid-cols-2 lg:grid-cols-4"
    >
      <Alan etiket={t('kayitGeriBildirim.suzgec.tur')}>
        {(o) => (
          <Secim
            {...o}
            value={deger.tur ?? ''}
            onChange={(e) => {
              ayarla({ tur: e.target.value });
            }}
          >
            <option value="">{t('kayitGeriBildirim.suzgec.tumu')}</option>
            <option value="kayit">{t('kayitGeriBildirim.tur.kayit')}</option>
            <option value="materyal">{t('kayitGeriBildirim.tur.materyal')}</option>
          </Secim>
        )}
      </Alan>
      <Alan etiket={t('kayitGeriBildirim.suzgec.brans')}>
        {(o) => (
          <Secim
            {...o}
            value={deger.brans_kodu ?? ''}
            onChange={(e) => {
              ayarla({ brans_kodu: e.target.value });
            }}
          >
            <option value="">{t('kayitGeriBildirim.suzgec.tumu')}</option>
            {siraliBransler().map((b) => (
              <option key={b.kod} value={b.kod}>
                {b.ad}
              </option>
            ))}
          </Secim>
        )}
      </Alan>
      {gruplar ? (
        <Alan etiket={t('kayitGeriBildirim.suzgec.grup')}>
          {(o) => (
            <Secim
              {...o}
              value={deger.grup_id ?? ''}
              onChange={(e) => {
                ayarla({ grup_id: e.target.value });
              }}
            >
              <option value="">{t('kayitGeriBildirim.suzgec.tumu')}</option>
              {gruplar.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.etiket}
                </option>
              ))}
            </Secim>
          )}
        </Alan>
      ) : null}
      {durumlar ? (
        <Alan etiket={t('kayitGeriBildirim.suzgec.durum')}>
          {(o) => (
            <Secim
              {...o}
              value={deger.durum ?? ''}
              onChange={(e) => {
                ayarla({ durum: e.target.value });
              }}
            >
              <option value="">{t('kayitGeriBildirim.suzgec.tumu')}</option>
              <option value="aktif">{t('kayitGeriBildirim.durum.aktif')}</option>
              <option value="bozuk">{t('kayitGeriBildirim.durum.bozuk')}</option>
              <option value="suresi_doldu">{t('kayitGeriBildirim.durum.suresi_doldu')}</option>
              <option value="gizli">{t('kayitGeriBildirim.durum.gizli')}</option>
            </Secim>
          )}
        </Alan>
      ) : null}
      <Alan etiket={t('kayitGeriBildirim.suzgec.baslangic')}>
        {(o) => (
          <Girdi
            {...o}
            type="date"
            value={deger.baslangic ?? ''}
            onChange={(e) => {
              ayarla({ baslangic: e.target.value });
            }}
          />
        )}
      </Alan>
      <Alan
        etiket={t('kayitGeriBildirim.suzgec.bitis')}
        hata={gecersiz ? t('kayitGeriBildirim.suzgec.aralikHata') : undefined}
      >
        {(o) => (
          <Girdi
            {...o}
            type="date"
            value={deger.bitis ?? ''}
            onChange={(e) => {
              ayarla({ bitis: e.target.value });
            }}
          />
        )}
      </Alan>
      <div className="sm:col-span-2">
        <KonuSecici
          kurumId={kurumId}
          deger={deger.konu_id ?? null}
          {...(deger.brans_kodu ? { brans: deger.brans_kodu } : {})}
          etiket={t('kayitGeriBildirim.suzgec.konu')}
          degisti={(k) => {
            ayarla({ konu_id: k?.id ?? '' });
          }}
        />
      </div>
      {deger.ders_id ? (
        <div className="flex items-end sm:col-span-2">
          <Dugme
            type="button"
            gorunum="ikincil"
            onClick={() => {
              ayarla({ ders_id: '' });
            }}
          >
            {t('kayitGeriBildirim.suzgec.dersKaldir')}
          </Dugme>
        </div>
      ) : null}
      {suzgecSayisi(deger) > 0 ? (
        <div className="flex items-end">
          <Dugme
            type="button"
            gorunum="hayalet"
            onClick={() => {
              degisti(BOS_SUZGEC);
            }}
          >
            {t('kayitGeriBildirim.suzgec.temizle')}
          </Dugme>
        </div>
      ) : null}
    </form>
  );
}
