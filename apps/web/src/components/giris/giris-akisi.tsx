'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { t } from '@kopru/i18n';
import { OTPInput, REGEXP_ONLY_DIGITS, type SlotProps } from 'input-otp';
import { ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { Dugme } from '@/components/ui/button';
import { Etiket, Girdi } from '@/components/ui/input';
import { Uyari } from '@/components/ui/uyari';
import { hataMesaji } from '@/lib/api';
import { cn } from '@/lib/cn';
import { telefonBicimle } from '@/lib/telefon';
import { useOturum } from '@/oturum/saglayici';
import { telefonSema } from '@/oturum/tipler';

const formSema = z.object({
  telefon: z.string().refine((v) => telefonSema.safeParse(v).success, {
    message: t('oturum.telefonHata'),
  }),
});
type FormDegerleri = z.infer<typeof formSema>;

function KodHucresi({
  char: karakter,
  isActive: aktif,
  hataVar,
}: SlotProps & { hataVar: boolean }) {
  return (
    <div
      className={cn(
        'flex h-14 w-11 items-center justify-center rounded-orta border bg-yuzey text-2xl font-semibold tabular-nums sm:w-12',
        hataVar ? 'border-hata' : 'border-kenar',
        aktif && 'border-birincil outline-2 outline-offset-0 outline-birincil',
      )}
    >
      {karakter}
    </div>
  );
}

function useGeriSayim(baslangic: number) {
  const [kalan, setKalan] = useState(baslangic);
  useEffect(() => {
    if (kalan <= 0) return;
    const z = setTimeout(() => {
      setKalan((k) => k - 1);
    }, 1000);
    return () => {
      clearTimeout(z);
    };
  }, [kalan]);
  return [kalan, setKalan] as const;
}

function TelefonAdimi({
  onGonderildi,
}: {
  onGonderildi: (telefon: string, bekle: number) => void;
}) {
  const { kodIste } = useOturum();
  const [sunucuHatasi, setSunucuHatasi] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormDegerleri>({ resolver: zodResolver(formSema), defaultValues: { telefon: '' } });

  const hata = errors.telefon?.message;

  return (
    <form
      noValidate
      onSubmit={handleSubmit(async ({ telefon }) => {
        setSunucuHatasi(null);
        try {
          const { yenidenSn } = await kodIste(telefon);
          onGonderildi(telefon, yenidenSn);
        } catch (e) {
          setSunucuHatasi(hataMesaji(e));
        }
      })}
      className="flex flex-col gap-5"
    >
      <div className="flex flex-col gap-2">
        <Etiket htmlFor="telefon">{t('giris.telefon')}</Etiket>
        <div className="flex gap-2">
          <span className="flex h-11 items-center rounded-orta border border-kenar bg-yuzey-ikincil px-3 text-base tabular-nums text-metin-ikincil">
            {t('oturum.telefonUlke')}
          </span>
          <Girdi
            id="telefon"
            type="tel"
            inputMode="tel"
            autoComplete="tel-national"
            placeholder={t('oturum.telefonYer')}
            aria-invalid={hata ? true : undefined}
            aria-describedby={hata ? 'telefon-hata' : undefined}
            className="tabular-nums"
            {...register('telefon', {
              onChange: (e: { target: { value: string } }) => {
                setValue('telefon', telefonBicimle(e.target.value), { shouldValidate: false });
              },
            })}
          />
        </div>
        {hata ? (
          <p id="telefon-hata" role="alert" className="text-sm text-hata">
            {hata}
          </p>
        ) : null}
      </div>
      {sunucuHatasi ? <Uyari>{sunucuHatasi}</Uyari> : null}
      <Dugme type="submit" boyut="lg" disabled={isSubmitting}>
        {isSubmitting ? t('oturum.kodGonderiliyor') : t('giris.kodGonder')}
      </Dugme>
    </form>
  );
}

function KodAdimi({
  telefon,
  baslangicBekleme,
  geri,
  onBitti,
}: {
  telefon: string;
  baslangicBekleme: number;
  geri: () => void;
  onBitti: (rizaGerekli: boolean) => void;
}) {
  const { kodDogrula, kodIste } = useOturum();
  const [kod, setKod] = useState('');
  const [hata, setHata] = useState<string | null>(null);
  const [gonderiliyor, setGonderiliyor] = useState(false);
  const [kalan, setKalan] = useGeriSayim(baslangicBekleme);

  async function dogrula(deger: string) {
    if (!/^\d{6}$/.test(deger)) {
      setHata(t('oturum.kodEksik'));
      return;
    }
    setGonderiliyor(true);
    setHata(null);
    try {
      const oturum = await kodDogrula(telefon, deger);
      onBitti(oturum.rizaGerekli);
    } catch (e) {
      setHata(hataMesaji(e));
      setKod('');
      setGonderiliyor(false);
    }
  }

  async function tekrarGonder() {
    setHata(null);
    try {
      const { yenidenSn } = await kodIste(telefon);
      setKalan(yenidenSn);
      setKod('');
    } catch (e) {
      setHata(hataMesaji(e));
    }
  }

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void dogrula(kod);
      }}
      className="flex flex-col gap-5"
    >
      <div className="flex flex-col gap-2">
        <Etiket htmlFor="kod">{t('giris.kodGir')}</Etiket>
        <p className="text-sm text-metin-ikincil">
          {t('oturum.kodGonderildi', { telefon: `+90 ${telefon}` })}
        </p>
        <OTPInput
          id="kod"
          maxLength={6}
          value={kod}
          onChange={setKod}
          onComplete={(v: string) => {
            void dogrula(v);
          }}
          pattern={REGEXP_ONLY_DIGITS}
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          disabled={gonderiliyor}
          aria-invalid={hata ? true : undefined}
          aria-describedby={hata ? 'kod-hata' : undefined}
          containerClassName="mt-1 gap-2 has-[:disabled]:opacity-60"
          render={({ slots }) => (
            <div className="flex gap-2">
              {slots.map((slot, i) => (
                <KodHucresi key={i} {...slot} hataVar={hata !== null} />
              ))}
            </div>
          )}
        />
      </div>
      {hata ? <Uyari>{hata}</Uyari> : null}
      <span id="kod-hata" className="sr-only" />
      <Dugme type="submit" boyut="lg" disabled={gonderiliyor}>
        {gonderiliyor ? t('oturum.kodDogrulaniyor') : t('oturum.kodDogrula')}
      </Dugme>
      <div className="flex items-center justify-between text-sm">
        <button
          type="button"
          onClick={geri}
          className="inline-flex h-11 items-center gap-1.5 rounded-orta pr-2 text-metin-ikincil hover:text-metin"
        >
          <ArrowLeft className="size-4" aria-hidden />
          {t('oturum.numaraDegistir')}
        </button>
        <button
          type="button"
          disabled={kalan > 0}
          onClick={() => void tekrarGonder()}
          className="h-11 rounded-orta px-2 font-medium text-birincil disabled:text-metin-ikincil disabled:opacity-80"
        >
          {kalan > 0 ? t('oturum.kodTekrarBekle', { sn: kalan }) : t('oturum.kodTekrarGonder')}
        </button>
      </div>
    </form>
  );
}

export function GirisAkisi({ denemeIpucu }: { denemeIpucu: boolean }) {
  const router = useRouter();
  const [adim, setAdim] = useState<
    { tur: 'telefon' } | { tur: 'kod'; telefon: string; bekle: number }
  >({ tur: 'telefon' });

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-8">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">{t('giris.baslik')}</h1>
        <p className="mt-2 text-base text-metin-ikincil">{t('oturum.girisAciklama')}</p>
      </header>

      {adim.tur === 'telefon' ? (
        <TelefonAdimi
          onGonderildi={(telefon, bekle) => {
            setAdim({ tur: 'kod', telefon, bekle });
          }}
        />
      ) : (
        <KodAdimi
          telefon={adim.telefon}
          baslangicBekleme={adim.bekle}
          geri={() => {
            setAdim({ tur: 'telefon' });
          }}
          onBitti={(rizaGerekli) => {
            router.replace(rizaGerekli ? '/kvkk' : '/kurum-sec');
          }}
        />
      )}

      {denemeIpucu ? (
        <p className="rounded-orta bg-yuzey-ikincil px-3 py-2.5 text-sm text-metin">
          {t('oturum.denemeIpucu')}
        </p>
      ) : (
        <p className="text-sm text-metin-ikincil">{t('oturum.kullanimKosullari')}</p>
      )}
    </div>
  );
}
