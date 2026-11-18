'use client';

import {
  MODUL_KODLARI,
  ModulAyarlariYanitSema,
  ModulAyariYazYanitSema,
  type ModulKodu,
} from '@kopru/contracts';
import { t } from '@kopru/i18n';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Puzzle } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { BosDurum } from '@/components/bos-durum';
import { HataDurumu } from '@/components/hata-durumu';
import {
  BildirimKutusu,
  basari,
  basarisiz,
  ListeIskeleti,
  type Bildirim,
} from '@/components/hesap/ortak';
import { BolumKapisi } from '@/components/kabuk/bolum-yer-tutucu';
import { SayfaBasligi } from '@/components/kabuk/sayfa-basligi';
import { Alan } from '@/components/operasyon/ortak';
import { dugmeStili } from '@/components/ui/button';
import { Kart } from '@/components/ui/kart';
import { Secim } from '@/components/ui/secim';
import { useKurum } from '@/kurum/baglam';
import { hataMesaji } from '@/lib/api';
import { cn } from '@/lib/cn';
import { hesapIstek } from '@/lib/hesap-istek';
import { useGruplar } from '@/lib/operasyon-verisi';
import { yenidenDene } from '@/lib/sayfali-sorgu';
import { izinli } from '@/lib/yetki';

/** Sahip/yonetici: modulleri kurum ve grup duzeyinde ac/kapa (alt duzey yalniz daraltir). */
export function ModullerEkrani() {
  return (
    <BolumKapisi bolum="moduller">
      <ModullerIcerigi />
    </BolumKapisi>
  );
}

const anahtar = (kurumId: string) => ['hesap', kurumId, 'modul-ayarlari'] as const;

type Deger = 'miras' | 'acik' | 'kapali';

function ModullerIcerigi() {
  const { uyelik, rol } = useKurum();
  const kurumId = uyelik.kurumId;
  const yazabilir = izinli(rol, 'modul.ayar.yaz');
  const istemci = useQueryClient();
  const [bildirim, setBildirim] = useState<Bildirim>(null);
  const [grupId, setGrupId] = useState('');
  const gruplar = useGruplar(kurumId);

  const q = useQuery({
    queryKey: anahtar(kurumId),
    retry: yenidenDene,
    queryFn: () =>
      hesapIstek(`kurumlar/${kurumId}/modul-ayarlari`, { sema: ModulAyarlariYanitSema }),
  });

  const yaz = useMutation({
    mutationFn: (g: {
      modul: ModulKodu;
      kapsam: 'kurum' | 'grup';
      kapsamId?: string;
      acik: boolean | null;
    }) =>
      hesapIstek(`kurumlar/${kurumId}/modul-ayarlari`, {
        yontem: 'PUT',
        govde: {
          modul_kodu: g.modul,
          kapsam: g.kapsam,
          ...(g.kapsamId ? { kapsam_id: g.kapsamId } : {}),
          acik: g.acik,
        },
        sema: ModulAyariYazYanitSema,
      }),
    onSuccess: async () => {
      setBildirim(basari(t('moduller.kaydedildi')));
      await Promise.all([
        istemci.invalidateQueries({ queryKey: anahtar(kurumId) }),
        // Yan menu ve rota kapilari cozulmus modul listesinden okunur.
        istemci.invalidateQueries({ queryKey: ['kurum-baglami', kurumId] }),
      ]);
    },
    onError: (hata) => {
      setBildirim(basarisiz(hata));
    },
  });

  const kurumKapali = (m: ModulKodu) => q.data?.kurum_etkin[m] === false;
  const grupDegeri = (m: ModulKodu): Deger => {
    const a = q.data?.ayarlar.find(
      (x) => x.kapsam === 'grup' && x.kapsam_id === grupId && x.modul_kodu === m,
    );
    return a ? (a.acik ? 'acik' : 'kapali') : 'miras';
  };

  return (
    <>
      <SayfaBasligi baslik={t('moduller.baslik')} aciklama={t('moduller.aciklama')} />
      <div className="mb-4">
        <BildirimKutusu bildirim={bildirim} />
      </div>
      {!yazabilir ? (
        <Kart>
          <BosDurum
            className="py-14"
            ikon={Puzzle}
            baslik={t('moduller.baslik')}
            aciklama={t('moduller.yetkiYok')}
          />
        </Kart>
      ) : q.isPending ? (
        <Kart>
          <ListeIskeleti satir={6} />
        </Kart>
      ) : q.isError ? (
        <Kart>
          <HataDurumu
            baslik={t('moduller.yuklenemedi')}
            aciklama={hataMesaji(q.error)}
            tekrarDene={() => void q.refetch()}
          />
        </Kart>
      ) : (
        <div className="flex flex-col gap-6">
          <Kart aria-labelledby="modul-kurum" className="overflow-hidden">
            <div className="border-b border-kenar px-4 py-3">
              <h2 id="modul-kurum" className="text-base font-semibold">
                {t('moduller.kurumBolumu')}
              </h2>
              <p className="text-sm text-metin-ikincil">{t('moduller.kurumAciklama')}</p>
            </div>
            <ul>
              {MODUL_KODLARI.map((m) => {
                const acik = !kurumKapali(m);
                return (
                  <li
                    key={m}
                    className="flex items-center justify-between gap-3 border-b border-kenar px-4 py-3 last:border-0"
                  >
                    <span className="font-medium">{t(`modul.${m}`)}</span>
                    <Anahtar
                      etiket={t('moduller.durumEtiketi', {
                        modul: t(`modul.${m}`),
                        durum: t(acik ? 'moduller.acik' : 'moduller.kapali'),
                      })}
                      acik={acik}
                      devre={yaz.isPending}
                      degisti={(yeni) => {
                        yaz.mutate({ modul: m, kapsam: 'kurum', acik: yeni ? null : false });
                      }}
                    />
                  </li>
                );
              })}
            </ul>
          </Kart>

          <Kart aria-labelledby="modul-grup" className="overflow-hidden">
            <div className="border-b border-kenar px-4 py-3">
              <h2 id="modul-grup" className="text-base font-semibold">
                {t('moduller.grupBolumu')}
              </h2>
              <p className="text-sm text-metin-ikincil">{t('moduller.grupAciklama')}</p>
            </div>
            {gruplar.secenekler.length === 0 && !gruplar.yukleniyor ? (
              <p className="px-4 py-5 text-sm text-metin-ikincil">{t('moduller.grupYok')}</p>
            ) : (
              <div className="flex flex-col gap-4 p-4">
                <Alan etiket={t('moduller.grupSec')} className="max-w-sm">
                  {(o) => (
                    <Secim
                      {...o}
                      value={grupId}
                      onChange={(e) => {
                        setGrupId(e.target.value);
                      }}
                    >
                      <option value="">{t('moduller.grupSecmedin')}</option>
                      {gruplar.secenekler.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.etiket}
                        </option>
                      ))}
                    </Secim>
                  )}
                </Alan>
                {grupId ? (
                  <ul className="divide-y divide-kenar rounded-orta border border-kenar">
                    {MODUL_KODLARI.map((m) => {
                      const ustKapali = kurumKapali(m);
                      return (
                        <li
                          key={m}
                          className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5"
                        >
                          <span className="font-medium">{t(`modul.${m}`)}</span>
                          <span className="flex items-center gap-3">
                            {ustKapali ? (
                              <span className="text-sm text-metin-ikincil">
                                {t('moduller.kurumdaKapali')}
                              </span>
                            ) : null}
                            <Secim
                              aria-label={t('moduller.durumEtiketi', {
                                modul: t(`modul.${m}`),
                                durum: t(
                                  `moduller.${grupDegeri(m) === 'miras' ? 'mirasAl' : grupDegeri(m) === 'acik' ? 'acik' : 'kapali'}`,
                                ),
                              })}
                              className="w-44"
                              disabled={ustKapali || yaz.isPending}
                              value={ustKapali ? 'kapali' : grupDegeri(m)}
                              onChange={(e) => {
                                const d = e.target.value as Deger;
                                yaz.mutate({
                                  modul: m,
                                  kapsam: 'grup',
                                  kapsamId: grupId,
                                  acik: d === 'miras' ? null : d === 'acik',
                                });
                              }}
                            >
                              <option value="miras">{t('moduller.mirasAl')}</option>
                              <option value="acik">{t('moduller.acik')}</option>
                              <option value="kapali">{t('moduller.kapali')}</option>
                            </Secim>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </div>
            )}
          </Kart>

          <Link href={`/${kurumId}/panel`} className={dugmeStili({ gorunum: 'ikincil' })}>
            {t('moduller.panelGit')}
          </Link>
        </div>
      )}
    </>
  );
}

/** Acik/kapali anahtari (`role="switch"`): klavye (bosluk/enter) ve ekran okuyucu uyumlu. */
function Anahtar({
  etiket,
  acik,
  devre,
  degisti,
}: {
  etiket: string;
  acik: boolean;
  devre: boolean;
  degisti: (acik: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={acik}
      aria-label={etiket}
      disabled={devre}
      onClick={() => {
        degisti(!acik);
      }}
      className={cn(
        'relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border border-kenar transition-colors disabled:opacity-50',
        acik ? 'bg-birincil' : 'bg-yuzey-ikincil',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'inline-block size-5 rounded-full bg-yuzey shadow transition-transform',
          acik ? 'translate-x-6' : 'translate-x-1',
        )}
      />
    </button>
  );
}
