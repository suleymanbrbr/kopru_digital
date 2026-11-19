'use client';

import { t } from '@kopru/i18n';
import { useId, useState, type ReactNode } from 'react';

import { MetinAlani } from './alan';
import { Dugme } from './dugme';
import { Pencere } from './pencere';
import { Uyari } from './uyari';

import { hataAyrintilari, hataMetni } from '@/lib/hata';

export interface OnayPenceresiProps {
  acik: boolean;
  onKapat: () => void;
  baslik: string;
  aciklama?: ReactNode;
  /** Verilirse zorunlu `neden` alani gosterilir (en az `min` karakter). */
  neden?: { min: number; etiket?: string; yardim?: string } | undefined;
  onayEtiketi: string;
  tehlike?: boolean;
  bekliyor?: boolean;
  /** Son istegin hatasi (kod -> Turkce mesaj, alan hatalari liste olarak). */
  hata?: unknown;
  /** Zorunlu isaret kutusu (ornegin "anliyorum"). */
  onayKutusu?: string | undefined;
  /** Ek form alanlari gecerli mi? */
  gecerli?: boolean;
  genis?: boolean;
  onOnayla: (neden: string) => void;
  /** Ek form alanlari. */
  children?: ReactNode;
}

function Icerik({
  onKapat,
  neden,
  onayEtiketi,
  tehlike,
  bekliyor,
  hata,
  onayKutusu,
  gecerli = true,
  onOnayla,
  children,
}: Omit<OnayPenceresiProps, 'acik' | 'baslik' | 'aciklama' | 'genis'>) {
  const [nedenMetni, setNedenMetni] = useState('');
  const [onayli, setOnayli] = useState(false);
  const onayId = useId();
  const nedenGecerli = neden ? nedenMetni.trim().length >= neden.min : true;
  const gonderilebilir = nedenGecerli && gecerli && (onayKutusu ? onayli : true) && !bekliyor;
  const ayrintilar = hata ? hataAyrintilari(hata) : [];

  const gonder = (e: { preventDefault: () => void }) => {
    e.preventDefault();
    if (gonderilebilir) onOnayla(nedenMetni.trim());
  };

  return (
    <form onSubmit={gonder} className="flex flex-col gap-4">
      {children}
      {neden ? (
        <MetinAlani
          etiket={neden.etiket ?? t('yonetim.ortak.nedenEtiketi', { n: neden.min })}
          yardim={neden.yardim ?? t('yonetim.ortak.nedenNotu')}
          value={nedenMetni}
          onChange={(e) => {
            setNedenMetni(e.target.value);
          }}
          rows={3}
          required
        />
      ) : (
        <p className="text-sm text-metin-ikincil">{t('yonetim.ortak.denetimNotu')}</p>
      )}
      {onayKutusu ? (
        <div className="flex items-start gap-2">
          <input
            id={onayId}
            type="checkbox"
            checked={onayli}
            onChange={(e) => {
              setOnayli(e.target.checked);
            }}
            className="mt-1 size-4"
          />
          <label htmlFor={onayId} className="text-sm">
            {onayKutusu}
          </label>
        </div>
      ) : null}
      {hata ? (
        <Uyari ton="hata" baslik={hataMetni(hata)}>
          {ayrintilar.length > 0 ? (
            <ul className="list-disc pl-4">
              {ayrintilar.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          ) : null}
        </Uyari>
      ) : null}
      <div className="flex flex-wrap justify-end gap-2">
        <Dugme gorunum="ikincil" onClick={onKapat} disabled={bekliyor}>
          {t('yonetim.ortak.vazgec')}
        </Dugme>
        <Dugme type="submit" gorunum={tehlike ? 'tehlike' : 'birincil'} disabled={!gonderilebilir}>
          {bekliyor ? t('yonetim.ortak.yukleniyor') : onayEtiketi}
        </Dugme>
      </div>
    </form>
  );
}

/**
 * Her yazma isleminin onay penceresi: ne olacagi, (gerekiyorsa) zorunlu neden ve hata gosterimi.
 * Neden metni onaylama aninda `onOnayla(neden)` ile verilir.
 */
export function OnayPenceresi({
  acik,
  onKapat,
  baslik,
  aciklama,
  genis,
  ...geri
}: OnayPenceresiProps) {
  return (
    <Pencere
      acik={acik}
      onKapat={geri.bekliyor ? () => undefined : onKapat}
      baslik={baslik}
      aciklama={aciklama}
      genis={genis ?? false}
    >
      <Icerik onKapat={onKapat} {...geri} />
    </Pencere>
  );
}
