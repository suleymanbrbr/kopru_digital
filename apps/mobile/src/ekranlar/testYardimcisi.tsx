/* eslint-disable @typescript-eslint/no-deprecated, @typescript-eslint/no-non-null-assertion, @typescript-eslint/require-await --
   react-test-renderer React 19'da kullanimdan kaldirildi ama React Native icin ek bagimlilik
   gerektirmeyen tek renderer; `props` tipsizdir (any). */
/**
 * Ekran testleri icin ortak yardimcilar (mock adaptorler + gercek oturum yoneticisi + bellek ici
 * kuyruk). `jest.mock(...)` cagrilari (expo-router, safe-area, tema, netinfo, ikonlar) her test
 * dosyasinin kendisindedir; burada yalniz render ve sorgu yardimcilari vardir.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import type { ReactElement } from 'react';
import { create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';

import { cevrimiciKorumaliOgrenme } from '../api/cevrimiciOgrenme';
import { mockAdaptorler } from '../api/mock';
import { bellekBelirtecDeposu } from '../depo/belirtecDeposu';
import { bellekKv } from '../depo/kv';
import { OfflineKuyruk } from '../offline/kuyruk';
import { planIsleyicisiKaydet } from '../offline/plan';
import { yoklamaIsleyicisiKaydet } from '../offline/yoklama';
import { oturumYoneticisiOlustur } from '../oturum/yonetici';
import { ServisBaglami } from '../uygulama/baglam';
import type { Servisler } from '../uygulama/servisler';

const render: ReactTestRenderer[] = [];
const istemciler: QueryClient[] = [];

/** `afterEach` icinde cagrilir: acik renderer ve sorgu istemcilerini temizler. */
export function temizle() {
  for (const r of render.splice(0))
    act(() => {
      r.unmount();
    });
  for (const q of istemciler.splice(0)) q.clear();
}

export interface Ortam {
  servisler: Servisler;
  cevrimici: { deger: boolean };
  giris: (telefon: string, uyelikId: string) => Promise<void>;
  adaptorler: Servisler['adaptorler'];
  kuyruk: OfflineKuyruk;
  queryClient: QueryClient;
}

export const OGRETMEN = ['+905551110001', 'uyelik-ogretmen-a'] as const;
export const OGRENCI = ['+905551110002', 'uyelik-ogrenci-a'] as const;

export function ortamKur(): Ortam {
  const depo = bellekBelirtecDeposu();
  const adaptorler = mockAdaptorler(depo, 0);
  const oturum = oturumYoneticisiOlustur({ adaptorler });
  const cevrimici = { deger: true };
  // Uretimdeki gibi: cevrimdisiyken ogrenme istekleri gonderilmez (gerceklesen kuyrugu haric).
  adaptorler.ogrenme = cevrimiciKorumaliOgrenme(adaptorler.ogrenme, () => cevrimici.deger);
  const kuyruk = new OfflineKuyruk({
    depo: bellekKv(),
    yeniId: (() => {
      let n = 0;
      return () => `00000000-0000-7000-8000-${String(++n).padStart(12, '0')}`;
    })(),
    kapsam: () => {
      const d = oturum.depo.al();
      return d.asama === 'giris' ? (d.aktif?.uyelik.uyelikId ?? null) : null;
    },
    cevrimiciMi: () => cevrimici.deger,
    gecikme: () => 0,
  });
  yoklamaIsleyicisiKaydet(kuyruk, () => adaptorler.ders);
  planIsleyicisiKaydet(kuyruk, () => adaptorler.ogrenme);
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity, staleTime: 0 },
      mutations: { gcTime: 0 },
    },
  });
  istemciler.push(queryClient);
  const servisler = {
    adaptorler,
    oturum,
    queryClient,
    kuyruk,
    yerelDepo: bellekKv(),
    agGozlemcisi: {
      cevrimiciMi: () => cevrimici.deger,
      abone: () => () => undefined,
    },
  } as unknown as Servisler;
  return {
    servisler,
    cevrimici,
    adaptorler,
    kuyruk,
    queryClient,
    giris: async (telefon, uyelikId) => {
      await adaptorler.auth.otpDogrula(telefon, '123456');
      await oturum.girisTamamlandi();
      await oturum.kvkkKabulEt();
      await oturum.uyelikSec(uyelikId);
    },
  };
}

/** Etkin kurumun modul durumunu degistirir (modul kapaliysa ekran/kart gorunmez testleri). */
export function modulAyarla(o: Ortam, moduller: Record<string, boolean>) {
  const d = o.servisler.oturum.depo.al();
  if (d.asama !== 'giris' || !d.aktif) throw new Error('giris bekleniyordu');
  o.servisler.oturum.depo.ayarla({
    aktif: { ...d.aktif, moduller: { ...d.aktif.moduller, ...moduller } },
  });
}

export async function bekle(ms = 30) {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
}

export async function ac(o: Ortam, ekran: ReactElement): Promise<ReactTestRenderer> {
  let r!: ReactTestRenderer;
  await act(async () => {
    r = create(
      <ServisBaglami.Provider value={o.servisler}>
        <QueryClientProvider client={o.servisler.queryClient}>{ekran}</QueryClientProvider>
      </ServisBaglami.Provider>,
    );
  });
  render.push(r);
  await bekle();
  await bekle();
  return r;
}

function duzMetin(d: unknown): string {
  if (d === null || d === undefined) return '';
  if (typeof d === 'string') return d;
  if (Array.isArray(d)) return d.map(duzMetin).join('');
  const n = d as { children?: unknown };
  return duzMetin(n.children);
}

/** Render agacindaki tum `Text` kuyruklarinin metni (` | ` ile ayrilmis). */
export function metinler(r: ReactTestRenderer): string {
  const parcalar: string[] = [];
  const gez = (d: unknown) => {
    if (d === null || d === undefined || typeof d === 'string') return;
    if (Array.isArray(d)) {
      d.forEach(gez);
      return;
    }
    const n = d as { type: string; children?: unknown };
    if (n.type === 'Text') parcalar.push(duzMetin(n.children));
    else gez(n.children);
  };
  gez(r.toJSON());
  return parcalar.join(' | ');
}

export function var_(r: ReactTestRenderer, testID: string): boolean {
  return r.root.findAll((n) => n.props.testID === testID && typeof n.type === 'string').length > 0;
}

export function bul(r: ReactTestRenderer, testID: string): ReactTestInstance {
  const n = r.root.findAll((x) => x.props.testID === testID && typeof x.type === 'string')[0];
  if (!n) throw new Error(`testID bulunamadi: ${testID}\n${metinler(r)}`);
  return n;
}

export function etiketle(r: ReactTestRenderer, etiket: string): ReactTestInstance {
  const bulunan = r.root.findAll(
    (n) => n.props.accessibilityLabel === etiket && typeof n.props.onPress === 'function',
  );
  if (bulunan.length === 0) throw new Error(`Etiket bulunamadi: ${etiket}\n${metinler(r)}`);
  return bulunan[0]!;
}

export function etiketVarMi(r: ReactTestRenderer, etiket: string): boolean {
  return (
    r.root.findAll(
      (n) => n.props.accessibilityLabel === etiket && typeof n.props.onPress === 'function',
    ).length > 0
  );
}

export async function dokun(r: ReactTestRenderer, etiket: string) {
  const dugme = etiketle(r, etiket);
  await act(async () => {
    (dugme.props.onPress as () => void)();
  });
  await bekle();
}

export async function testIDDokun(r: ReactTestRenderer, testID: string) {
  const dugme = r.root.findAll(
    (n) => n.props.testID === testID && typeof n.props.onPress === 'function',
  )[0];
  if (!dugme) throw new Error(`Dokunulabilir testID bulunamadi: ${testID}\n${metinler(r)}`);
  await act(async () => {
    (dugme.props.onPress as () => void)();
  });
  await bekle();
}

export async function yaz(r: ReactTestRenderer, etiket: string, deger: string) {
  const girdi = r.root.findAll(
    (n) => n.props.accessibilityLabel === etiket && typeof n.props.onChangeText === 'function',
  )[0];
  if (!girdi) throw new Error(`Girdi bulunamadi: ${etiket}`);
  await act(async () => {
    (girdi.props.onChangeText as (v: string) => void)(deger);
  });
}
