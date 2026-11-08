'use client';

import { t } from '@kopru/i18n';
import { useMutation, useQuery } from '@tanstack/react-query';
import { CircleCheck, MailQuestion } from 'lucide-react';
import Link from 'next/link';
import { useId, useState } from 'react';
import { z } from 'zod';

import { BosDurum } from '@/components/bos-durum';
import { dugmeStili, Dugme } from '@/components/ui/button';
import { Etiket, Girdi } from '@/components/ui/input';
import { Kart } from '@/components/ui/kart';
import { Uyari } from '@/components/ui/uyari';
import { bffIstek, hataMesaji, UygulamaHatasi } from '@/lib/api';

const dogrulaSema = z.object({ dogrulandi: z.literal(true) });

/**
 * E-postadaki baglantinin hedefi (`/eposta-dogrula?belirtec=...`). Belirteci BFF uzerinden
 * `api`ya iletir; gecersiz/suresi dolmus baglantida yeniden gonderme sunar. Kimlik gerekmez.
 * Belirtec yalniz adreste bulunur; sayfa bunu baska yere yazmaz.
 */
export function EpostaDogrula({ belirtec }: { belirtec: string | null }) {
  const eksik = !belirtec || belirtec.length < 10;
  const sorgu = useQuery({
    queryKey: ['eposta-dogrula', belirtec],
    enabled: !eksik,
    retry: false,
    // Belirtec tek kullanimliktir: yeniden istek (odak, tekrar baglanti) basarili dogrulamayi bozmasin.
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnMount: false,
    queryFn: () =>
      bffIstek(`/api/eposta/dogrula?belirtec=${encodeURIComponent(belirtec ?? '')}`, {
        sema: dogrulaSema,
      }),
  });

  if (!eksik && sorgu.isPending) {
    return (
      <p role="status" className="text-center text-base text-metin-ikincil">
        {t('hesap.epostaDogrula.dogrulaniyor')}
      </p>
    );
  }

  if (!eksik && sorgu.isSuccess) {
    return (
      <Kart>
        <BosDurum
          ikon={CircleCheck}
          baslik={t('hesap.epostaDogrula.basarili')}
          aciklama={t('hesap.epostaDogrula.basariliAciklama')}
        >
          <Link href="/giris" className={dugmeStili()}>
            {t('hesap.epostaDogrula.girisYap')}
          </Link>
        </BosDurum>
      </Kart>
    );
  }

  // Gecersiz ya da suresi dolmus (api ikisini ayirmaz) ya da baglanti eksik: yeni baglanti iste.
  const sunucuHatasi =
    !eksik && sorgu.error instanceof UygulamaHatasi && sorgu.error.durum >= 500
      ? hataMesaji(sorgu.error)
      : null;
  return (
    <Kart>
      <BosDurum
        ikon={MailQuestion}
        baslik={eksik ? t('hesap.epostaDogrula.eksik') : t('hesap.epostaDogrula.gecersiz')}
        aciklama={
          eksik ? t('hesap.epostaDogrula.eksikAciklama') : t('hesap.epostaDogrula.gecersizAciklama')
        }
      />
      <div className="border-t border-kenar p-5">
        {sunucuHatasi ? <Uyari className="mb-4">{sunucuHatasi}</Uyari> : null}
        <YenidenGonder />
      </div>
    </Kart>
  );
}

function YenidenGonder() {
  const kimlik = useId();
  const [eposta, setEposta] = useState('');
  const [hata, setHata] = useState<string | null>(null);
  const gonder = useMutation({
    mutationFn: (adres: string) =>
      bffIstek('/api/eposta/yeniden-gonder', { govde: { eposta: adres } }),
    onError: (e) => {
      setHata(hataMesaji(e));
    },
  });

  function onSubmit(olay: React.SyntheticEvent) {
    olay.preventDefault();
    setHata(null);
    const adres = eposta.trim();
    if (!z.email().safeParse(adres).success) {
      setHata(t('hesap.epostaDogrula.epostaHata'));
      return;
    }
    gonder.mutate(adres);
  }

  if (gonder.isSuccess) {
    return (
      <p role="status" className="rounded-orta bg-basari-yumusak px-3 py-2.5 text-sm text-basari">
        {t('hesap.epostaDogrula.gonderildi')}
      </p>
    );
  }
  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3">
      {hata ? <Uyari>{hata}</Uyari> : null}
      <div className="flex flex-col gap-1.5">
        <Etiket htmlFor={`${kimlik}-eposta`}>{t('hesap.epostaDogrula.eposta')}</Etiket>
        <Girdi
          id={`${kimlik}-eposta`}
          type="email"
          autoComplete="email"
          value={eposta}
          onChange={(e) => {
            setEposta(e.target.value);
          }}
        />
      </div>
      <Dugme type="submit" disabled={gonder.isPending}>
        {gonder.isPending
          ? t('hesap.epostaDogrula.gonderiliyor')
          : t('hesap.epostaDogrula.yenidenGonder')}
      </Dugme>
    </form>
  );
}
