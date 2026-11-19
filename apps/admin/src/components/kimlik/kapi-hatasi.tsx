'use client';

import { t } from '@kopru/i18n';
import { ShieldAlert } from 'lucide-react';
import { useRouter } from 'next/navigation';

import { Dugme } from '../ui/dugme';

import { bff, YonetimHatasi } from '@/lib/api';
import { hataMetni, KAPI_KODLARI } from '@/lib/hata';

/** Platform kapisinda (rol / IP) reddedilen kullanicinin gordugu acik hata ekrani. */
export function KapiHatasi({ hata, onYenile }: { hata: unknown; onYenile?: () => void }) {
  const router = useRouter();
  const kod = hata instanceof YonetimHatasi ? hata.kod : '';
  const baslik =
    kod === KAPI_KODLARI.ipYasak
      ? t('yonetim.giris.ipYasakBaslik')
      : kod === KAPI_KODLARI.platformYetkisiYok
        ? t('yonetim.giris.yetkiYokBaslik')
        : t('yonetim.ortak.yuklenemedi');
  const aciklama =
    kod === KAPI_KODLARI.ipYasak
      ? t('yonetim.giris.ipYasakAciklama')
      : kod === KAPI_KODLARI.platformYetkisiYok
        ? t('yonetim.giris.yetkiYokAciklama')
        : hataMetni(hata);

  const cikis = async () => {
    await bff.yolla('oturum/cikis').catch(() => undefined);
    router.replace('/giris');
  };

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-4 px-6 py-10">
      <ShieldAlert className="size-10 text-hata" aria-hidden />
      <h1 className="text-2xl font-semibold tracking-tight">{baslik}</h1>
      <p className="text-metin-ikincil">{aciklama}</p>
      <div className="flex flex-wrap gap-2">
        {onYenile ? (
          <Dugme gorunum="ikincil" onClick={onYenile}>
            {t('yonetim.ortak.tekrarDene')}
          </Dugme>
        ) : null}
        <Dugme onClick={cikis}>{t('yonetim.giris.baskaHesap')}</Dugme>
      </div>
    </main>
  );
}
