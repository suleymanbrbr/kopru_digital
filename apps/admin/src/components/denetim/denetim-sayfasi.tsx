'use client';

import { t } from '@kopru/i18n';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { Alan } from '../ui/alan';
import { Dugme } from '../ui/dugme';
import { BosDurum, SorguHatasi, Yukleniyor } from '../ui/durum-gosterimi';
import { SayfaBasligi } from '../ui/kart';
import { Tablo, Td, Th } from '../ui/tablo';
import { Uyari } from '../ui/uyari';

import { platform } from '@/lib/api';
import { tarihSaat, uuidMi, yerelIso } from '@/lib/bicim';
import { useYonetici } from '@/lib/oturum';
import type { DenetimListesi } from '@/lib/tipler';

interface Suzgec {
  kurum_id: string;
  aktor_id: string;
  eylem: string;
  baslangic: string;
  bitis: string;
}
const BOS: Suzgec = { kurum_id: '', aktor_id: '', eylem: '', baslangic: '', bitis: '' };

const kisalt = (id: string) => `${id.slice(0, 8)}…`;

export function DenetimSayfasi() {
  const yonetici = useYonetici();
  const [form, setForm] = useState<Suzgec>(BOS);
  const [uygulanan, setUygulanan] = useState<Suzgec>(BOS);

  const kurumHata = form.kurum_id && !uuidMi(form.kurum_id);
  const aktorHata = form.aktor_id && !uuidMi(form.aktor_id);

  const liste = useInfiniteQuery({
    queryKey: ['denetim', uygulanan],
    enabled: yonetici,
    queryFn: ({ pageParam }) =>
      platform.al<DenetimListesi>('denetim', {
        kurum_id: uygulanan.kurum_id.trim() || undefined,
        aktor_id: uygulanan.aktor_id.trim() || undefined,
        eylem: uygulanan.eylem.trim() || undefined,
        baslangic: yerelIso(uygulanan.baslangic),
        bitis: yerelIso(uygulanan.bitis),
        limit: 50,
        imlec: pageParam,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (son) => son.sonraki_imlec ?? undefined,
  });

  const uygula = (e: { preventDefault: () => void }) => {
    e.preventDefault();
    if (kurumHata || aktorHata) return;
    setUygulanan(form);
  };
  const guncelle = (alan: keyof Suzgec) => (e: { target: { value: string } }) => {
    setForm((f) => ({ ...f, [alan]: e.target.value }));
  };

  if (!yonetici) {
    return (
      <>
        <SayfaBasligi baslik={t('yonetim.denetim.baslik')} />
        <Uyari ton="uyari">{t('yonetim.ortak.yalnizYonetici')}</Uyari>
      </>
    );
  }

  const kayitlar = liste.data?.pages.flatMap((s) => s.kayitlar) ?? [];

  return (
    <>
      <SayfaBasligi baslik={t('yonetim.denetim.baslik')} aciklama={t('yonetim.denetim.aciklama')} />

      <form onSubmit={uygula} className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Alan
          etiket={t('yonetim.denetim.eylem')}
          yardim={t('yonetim.denetim.eylemYardim')}
          value={form.eylem}
          onChange={guncelle('eylem')}
          spellCheck={false}
        />
        <Alan
          etiket={t('yonetim.denetim.kurumId')}
          value={form.kurum_id}
          onChange={guncelle('kurum_id')}
          hata={
            kurumHata
              ? t('yonetim.denetim.gecersizKimlik', { ad: t('yonetim.denetim.kurumId') })
              : undefined
          }
          spellCheck={false}
        />
        <Alan
          etiket={t('yonetim.denetim.aktorId')}
          value={form.aktor_id}
          onChange={guncelle('aktor_id')}
          hata={
            aktorHata
              ? t('yonetim.denetim.gecersizKimlik', { ad: t('yonetim.denetim.aktorId') })
              : undefined
          }
          spellCheck={false}
        />
        <Alan
          etiket={t('yonetim.denetim.baslangic')}
          type="datetime-local"
          value={form.baslangic}
          onChange={guncelle('baslangic')}
        />
        <Alan
          etiket={t('yonetim.denetim.bitis')}
          type="datetime-local"
          value={form.bitis}
          onChange={guncelle('bitis')}
        />
        <div className="flex items-end gap-2">
          <Dugme type="submit" disabled={Boolean(kurumHata || aktorHata)}>
            {t('yonetim.denetim.suz')}
          </Dugme>
          <Dugme
            gorunum="ikincil"
            onClick={() => {
              setForm(BOS);
              setUygulanan(BOS);
            }}
          >
            {t('yonetim.ortak.temizle')}
          </Dugme>
        </div>
      </form>

      {liste.isPending ? (
        <Yukleniyor />
      ) : liste.error ? (
        <SorguHatasi
          hata={liste.error}
          onTekrar={() => {
            void liste.refetch();
          }}
        />
      ) : kayitlar.length === 0 ? (
        <BosDurum>{t('yonetim.denetim.bos')}</BosDurum>
      ) : (
        <>
          <Tablo etiket={t('yonetim.denetim.tablo')}>
            <thead>
              <tr>
                <Th>{t('yonetim.denetim.sutunZaman')}</Th>
                <Th>{t('yonetim.denetim.sutunEylem')}</Th>
                <Th>{t('yonetim.denetim.sutunAktor')}</Th>
                <Th>{t('yonetim.denetim.sutunKurum')}</Th>
                <Th>{t('yonetim.denetim.sutunNeden')}</Th>
                <Th>{t('yonetim.denetim.sutunIp')}</Th>
                <Th>{t('yonetim.denetim.ayrinti')}</Th>
              </tr>
            </thead>
            <tbody>
              {kayitlar.map((k) => (
                <tr key={k.id}>
                  <Td className="whitespace-nowrap">{tarihSaat(k.created_at)}</Td>
                  <Td>
                    <code className="text-xs">{k.eylem}</code>
                  </Td>
                  <Td className="font-mono text-xs" title={k.aktor_kullanici_id ?? undefined}>
                    {k.aktor_kullanici_id ? kisalt(k.aktor_kullanici_id) : ''}
                  </Td>
                  <Td className="font-mono text-xs" title={k.kurum_id ?? undefined}>
                    {k.kurum_id ? kisalt(k.kurum_id) : ''}
                  </Td>
                  <Td className="min-w-48 max-w-xs break-words">{k.neden}</Td>
                  <Td className="whitespace-nowrap text-xs">{k.ip}</Td>
                  <Td>
                    <details>
                      <summary className="cursor-pointer text-xs text-birincil">
                        {t('yonetim.denetim.ayrinti')}
                      </summary>
                      <pre className="mt-1 max-w-xs overflow-x-auto text-xs">
                        {JSON.stringify(k.ayrinti, null, 2)}
                      </pre>
                      {k.taklit_kayit_id ? (
                        <p className="mt-1 text-xs text-metin-ikincil">
                          {t('yonetim.denetim.taklitKaydi', { id: kisalt(k.taklit_kayit_id) })}
                        </p>
                      ) : null}
                    </details>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Tablo>
          {liste.hasNextPage ? (
            <Dugme
              gorunum="ikincil"
              className="mt-4"
              disabled={liste.isFetchingNextPage}
              onClick={() => {
                void liste.fetchNextPage();
              }}
            >
              {t('yonetim.ortak.dahaFazla')}
            </Dugme>
          ) : null}
        </>
      )}
    </>
  );
}
