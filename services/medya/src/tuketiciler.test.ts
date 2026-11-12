import {
  hesapKurumDegistiV1,
  ogrenmeSoruCozulduV1,
  ogrenmeSoruYenidenAcildiV1,
  ortakDosyaBaglandiV1,
  ortakDosyaBirakildiV1,
  type MedyaDosyaTuru,
} from '@kopru/contracts';
import { createDb, ensureEventStream, type Database } from '@kopru/service-kit';
import { AckPolicy, DeliverPolicy, connect, headers, type NatsConnection } from 'nats';
import postgres from 'postgres';
import { uuidv7 } from 'uuidv7';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { natsYok, testDb, testNats } from './test/yardimcilar.js';
import { tuketicileriBaslat } from './tuketiciler.js';

const sessiz = { info: () => undefined, warn: () => undefined, error: () => undefined };

async function bekle<T>(oku: () => Promise<T | undefined | false>, ms = 15_000): Promise<T> {
  const bitis = Date.now() + ms;
  for (;;) {
    const v = await oku();
    if (v) return v;
    if (Date.now() > bitis) throw new Error('beklenen durum olusmadi');
    await new Promise((r) => setTimeout(r, 100));
  }
}

describe.skipIf(natsYok())('olay tuketicileri (gercek PostgreSQL + NATS)', () => {
  const urls = testDb();
  const sonek = `_t${Math.random().toString(36).slice(2, 8)}`;
  const actor = { tur: 'sistem', id: 'api' } as const;
  let nats: NatsConnection;
  let sistem: postgres.Sql;
  let app: Database;
  let durdur: (() => Promise<void>)[] = [];

  async function yayinla(olay: { id: string; type: string; version: number }) {
    // JetStream tekrar-onleme (msgID) yerine ayni olay kimligi iki kez gonderilebilsin diye rastgele msgID.
    const h = headers();
    h.set('Nats-Msg-Id', uuidv7());
    await nats
      .jetstream()
      .publish(`evt.${olay.type}.v${String(olay.version)}`, JSON.stringify(olay), {
        headers: h,
      });
  }

  async function hazirDosya(kurumId: string, tur: MedyaDosyaTuru, durum = 'hazir') {
    const id = uuidv7();
    await sistem`
      insert into medya.dosyalar
        (id, kurum_id, sahip_kullanici_id, sahip_uyelik_id, tur, mime_tipi, bildirilen_boyut_bayt,
         bildirilen_sha256, depolama_anahtari, istemci_anahtari, yukleme_son_at, durum,
         boyut_bayt, sha256, hazir_at, silinecek_at, silme_nedeni)
      values (${id}, ${kurumId}, ${uuidv7()}, ${uuidv7()}, ${tur}, 'image/jpeg', 10,
              decode(${'ab'.repeat(32)}, 'hex'), ${`${kurumId}/${tur}/2026/11/${id}`}, ${uuidv7()}, now(), ${durum},
              ${durum === 'hazir' ? 10 : null}, ${durum === 'hazir' ? sistem`decode(${'ab'.repeat(32)}, 'hex')` : null},
              ${durum === 'hazir' ? sistem`now()` : null},
              ${durum === 'hazir' ? sistem`now() + interval '48 hours'` : null},
              ${durum === 'hazir' ? 'yetim' : null})`;
    return id;
  }

  const satir = async (id: string) =>
    (
      await sistem<
        {
          baglandi: boolean;
          bagli_tur: string | null;
          gun: number | null;
          neden: string | null;
          silinecek_at: Date | null;
        }[]
      >`select baglandi, bagli_tur, silme_nedeni as neden, silinecek_at,
               extract(epoch from (silinecek_at - baglandi_at)) / 86400 as gun
          from medya.dosyalar where id = ${id}`
    )[0];

  const islenenSayisi = async (olayId: string) =>
    (
      await sistem<{ n: number }[]>`
        select count(*)::int n from ortak.processed_events where olay_id = ${olayId}`
    )[0]?.n ?? 0;

  beforeAll(async () => {
    const url = testNats();
    if (!urls || !url) return;
    sistem = postgres(urls.sistemUrl, { max: 2, onnotice: () => undefined });
    app = createDb({ url: urls.appUrl, max: 4 });
    nats = await connect({ servers: url, name: 'medya-test' });
    await ensureEventStream(nats);
    // Paylasilan EVENTS gecmisini tekrar oynatmamak icin tuketicileri `new` ile onceden olusturur;
    // startConsumer varolan tuketiciyi gunceller (deliver_policy korunur).
    const jsm = await nats.jetstreamManager();
    for (const ad of [`medya_baglama${sonek}`, `medya_saklama${sonek}`, `medya_kopya${sonek}`]) {
      await jsm.consumers.add('EVENTS', {
        durable_name: ad,
        ack_policy: AckPolicy.Explicit,
        deliver_policy: DeliverPolicy.New,
      });
    }
    const tuketiciler = await tuketicileriBaslat({ nats, db: app, log: sessiz, sonek });
    durdur = [
      async () => {
        await Promise.all(tuketiciler.map((t) => t.stop()));
      },
    ];
  });

  afterAll(async () => {
    for (const d of durdur) await d();
    const jsm = await nats.jetstreamManager();
    for (const ad of [`medya_baglama${sonek}`, `medya_saklama${sonek}`, `medya_kopya${sonek}`]) {
      await jsm.consumers.delete('EVENTS', ad).catch(() => undefined);
    }
    // bu testin urettigi (varsa) DLQ kayitlari
    await jsm.streams.purge('DLQ', { filter: `dlq.medya.*${sonek}.>` }).catch(() => undefined);
    await nats.drain();
    await app.close();
    await sistem.end();
  });

  it('baglandi: saklama suresi politikaya gore; suresiz turde silinecek_at NULL; tekrar teslim idempotent', async () => {
    const kurum = uuidv7();
    const odev = await hazirDosya(kurum, 'odev_teslim_fotografi');
    const soru = await hazirDosya(kurum, 'soru_fotografi');
    const e1 = ortakDosyaBaglandiV1.create({
      kurumId: kurum,
      actor,
      correlationId: 'c',
      data: { dosya_id: odev, bagli_tur: 'odev_teslimi', bagli_id: uuidv7() },
    });
    const e2 = ortakDosyaBaglandiV1.create({
      kurumId: kurum,
      actor,
      correlationId: 'c',
      data: { dosya_id: soru, bagli_tur: 'soru', bagli_id: uuidv7() },
    });
    await yayinla(e1);
    await yayinla(e1); // tekrar teslim
    await yayinla(e2);
    await bekle(async () => (await islenenSayisi(e2.id)) === 1);
    await bekle(async () => (await islenenSayisi(e1.id)) === 1);

    const a = await satir(odev);
    expect(a?.baglandi).toBe(true);
    expect(a?.bagli_tur).toBe('odev_teslimi');
    expect(a?.neden).toBe('saklama_suresi');
    expect(Number(a?.gun)).toBeCloseTo(365, 3);
    const b = await satir(soru);
    expect(b?.baglandi).toBe(true);
    expect(b?.silinecek_at).toBeNull(); // soru_*: soru cozuldu olayi gelene kadar suresiz
    expect(await islenenSayisi(e1.id)).toBe(1);
  });

  it('baglandi, dosya henuz hazir degilken gelirse baglama yazilir, silme plani degismez', async () => {
    const kurum = uuidv7();
    const id = await hazirDosya(kurum, 'soru_fotografi', 'isleniyor');
    const e = ortakDosyaBaglandiV1.create({
      kurumId: kurum,
      actor,
      correlationId: 'c',
      data: { dosya_id: id, bagli_tur: 'soru', bagli_id: uuidv7() },
    });
    await yayinla(e);
    await bekle(async () => (await islenenSayisi(e.id)) === 1);
    expect((await satir(id))?.baglandi).toBe(true);
    expect((await satir(id))?.silinecek_at).toBeNull();
  });

  it('birakildi: hemen_sil ise silinecek_at simdi (birakildi), degilse yetim kurali', async () => {
    const kurum = uuidv7();
    const hemen = await hazirDosya(kurum, 'avatar');
    const gec = await hazirDosya(kurum, 'avatar');
    const baglantilar = new Map<string, string>();
    for (const id of [hemen, gec]) {
      const bagli = uuidv7();
      baglantilar.set(id, bagli);
      const e = ortakDosyaBaglandiV1.create({
        kurumId: kurum,
        actor,
        correlationId: 'c',
        data: { dosya_id: id, bagli_tur: 'kullanici', bagli_id: bagli },
      });
      await yayinla(e);
      await bekle(async () => (await islenenSayisi(e.id)) === 1);
    }
    const eh = ortakDosyaBirakildiV1.create({
      kurumId: kurum,
      actor,
      correlationId: 'c',
      data: {
        dosya_id: hemen,
        bagli_tur: 'kullanici',
        bagli_id: baglantilar.get(hemen) ?? '',
        hemen_sil: true,
      },
    });
    const eg = ortakDosyaBirakildiV1.create({
      kurumId: kurum,
      actor,
      correlationId: 'c',
      data: {
        dosya_id: gec,
        bagli_tur: 'kullanici',
        bagli_id: baglantilar.get(gec) ?? '',
        hemen_sil: false,
      },
    });
    await yayinla(eh);
    await yayinla(eg);
    await bekle(
      async () => (await islenenSayisi(eh.id)) === 1 && (await islenenSayisi(eg.id)) === 1,
    );
    const h = await satir(hemen);
    expect(h?.baglandi).toBe(false);
    expect(h?.neden).toBe('birakildi');
    expect(h?.silinecek_at && h.silinecek_at.getTime() <= Date.now() + 1000).toBe(true);
    const g = await satir(gec);
    expect(g?.neden).toBe('yetim');
    expect(g?.silinecek_at && g.silinecek_at.getTime() > Date.now() + 40 * 3600_000).toBe(true);
  });

  it('baska kurumun dosyasina baglama kurum baglami (RLS) yuzunden etkisiz kalir', async () => {
    const kurumA = uuidv7();
    const kurumB = uuidv7();
    const dosyaB = await hazirDosya(kurumB, 'soru_fotografi');
    const e = ortakDosyaBaglandiV1.create({
      kurumId: kurumA,
      actor,
      correlationId: 'c',
      data: { dosya_id: dosyaB, bagli_tur: 'soru', bagli_id: uuidv7() },
    });
    await yayinla(e);
    // kalici hata: islem geri alinir (processed_events satiri da yazilmaz), mesaj DLQ'ya gider
    await new Promise((r) => setTimeout(r, 1500));
    expect((await satir(dosyaB))?.baglandi).toBe(false);
    expect(await islenenSayisi(e.id)).toBe(0);
  });

  it('kurum degisti: kopya upsert, eski olay yok sayilir, kapali ise dosyalar 90 gun sonra silinir, yeniden acilinca geri alinir', async () => {
    const kurum = uuidv7();
    const dosya = await hazirDosya(kurum, 'soru_fotografi');
    // baglanmis, suresiz saklanan dosya (yetim plani yok): kurum kapaninca 90 gun planlanir
    await sistem`update medya.dosyalar set silinecek_at = null, silme_nedeni = null where id = ${dosya}`;
    const t0 = Date.now();
    const olay = (durum: 'aktif' | 'askida' | 'kapali', gecmis: number) =>
      hesapKurumDegistiV1.create({
        kurumId: kurum,
        actor,
        correlationId: 'c',
        occurredAt: new Date(t0 + gecmis),
        data: {
          kurum_id: kurum,
          ad: 'X Kurumu',
          tur: 'kurum',
          saat_dilimi: 'Europe/Istanbul',
          durum,
        },
      });
    const kopyaDurum = async () =>
      (
        await sistem<
          { durum: string }[]
        >`select durum from medya.kurum_kopyalari where kurum_id = ${kurum}`
      )[0]?.durum;

    const a = olay('aktif', 0);
    await yayinla(a);
    await bekle(async () => (await kopyaDurum()) === 'aktif');

    const k = olay('kapali', 1000);
    await yayinla(k);
    await bekle(async () => (await kopyaDurum()) === 'kapali');
    const kapali = await satir(dosya);
    expect(kapali?.neden).toBe('kurum_kapandi');
    const fark = (kapali?.silinecek_at?.getTime() ?? 0) - (t0 + 1000);
    expect(fark / 86_400_000).toBeCloseTo(90, 2);

    // gecikmeli gelen eski "askida" olayi kopyayi geri almaz
    const eski = olay('askida', 500);
    await yayinla(eski);
    await bekle(async () => (await islenenSayisi(eski.id)) === 1);
    expect(await kopyaDurum()).toBe('kapali');

    const yeniden = olay('aktif', 2000);
    await yayinla(yeniden);
    await bekle(async () => (await kopyaDurum()) === 'aktif');
    const acik = await satir(dosya);
    expect(acik?.silinecek_at).toBeNull();
    expect(acik?.neden).toBeNull();
  });

  describe('medya.saklama (soru cozuldu / yeniden acildi)', () => {
    const saklamaSatiri = async (id: string) =>
      (
        await sistem<{ silinecek_at: Date | null; neden: string | null; durum: string }[]>`
          select silinecek_at, silme_nedeni as neden, durum from medya.dosyalar where id = ${id}`
      )[0];

    /** Soruya bagli, suresiz saklanan (silme plani olmayan) hazir dosya. */
    async function soruDosyasi(kurum: string, tur: MedyaDosyaTuru = 'soru_fotografi') {
      const id = await hazirDosya(kurum, tur);
      await sistem`update medya.dosyalar set silinecek_at = null, silme_nedeni = null, baglandi = true,
                          bagli_tur = 'soru', bagli_id = ${uuidv7()} where id = ${id}`;
      return id;
    }

    const cozuldu = (kurum: string, dosyalar: string[], t: number, silinecek: Date) =>
      ogrenmeSoruCozulduV1.create({
        kurumId: kurum,
        actor,
        correlationId: 'c',
        occurredAt: new Date(t),
        data: {
          soru_id: uuidv7(),
          ogrenci_id: uuidv7(),
          brans_kodu: 'matematik',
          cozuldu_at: new Date(t).toISOString(),
          dosya_idleri: dosyalar,
          silinecek_at: silinecek.toISOString(),
        },
      });
    const acildi = (kurum: string, dosyalar: string[], t: number) =>
      ogrenmeSoruYenidenAcildiV1.create({
        kurumId: kurum,
        actor,
        correlationId: 'c',
        occurredAt: new Date(t),
        data: { soru_id: uuidv7(), ogrenci_id: uuidv7(), dosya_idleri: dosyalar },
      });

    it('cozuldu: silinecek_at dolar (soru_cozuldu), silinmis dosyaya dokunulmaz; ayni olay iki kez tek etki; yeniden acildi NULL yapar', async () => {
      const kurum = uuidv7();
      const a = await soruDosyasi(kurum);
      const b = await soruDosyasi(kurum, 'soru_cizim');
      const silinmis = await soruDosyasi(kurum);
      await sistem`update medya.dosyalar set durum = 'silindi', silindi_at = now(), depolama_anahtari = null
                    where id = ${silinmis}`;
      const t0 = Date.now();
      const plan = new Date(t0 + 30 * 86_400_000);
      const c = cozuldu(kurum, [a, b, silinmis], t0, plan);
      await yayinla(c);
      await yayinla(c); // ayni olay iki kez
      await bekle(async () => (await islenenSayisi(c.id)) === 1);
      await new Promise((r) => setTimeout(r, 300));
      for (const id of [a, b]) {
        const d = await saklamaSatiri(id);
        expect(d?.silinecek_at?.toISOString()).toBe(plan.toISOString());
        expect(d?.neden).toBe('soru_cozuldu');
      }
      expect((await saklamaSatiri(silinmis))?.silinecek_at).toBeNull();
      expect(await islenenSayisi(c.id)).toBe(1);

      const r = acildi(kurum, [a, b, silinmis], t0 + 1000);
      await yayinla(r);
      await bekle(async () => (await islenenSayisi(r.id)) === 1);
      for (const id of [a, b]) {
        const d = await saklamaSatiri(id);
        expect(d?.silinecek_at).toBeNull();
        expect(d?.neden).toBeNull();
      }
      expect((await saklamaSatiri(silinmis))?.durum).toBe('silindi');
    });

    it('sira bagimsizligi: yeniden acildi, cozuldu olayindan once islenirse eski cozuldu olayi ezmez; sonra gelen yeni cozuldu uygular', async () => {
      const kurum = uuidv7();
      const id = await soruDosyasi(kurum);
      const t0 = Date.now();
      const eskiCozuldu = cozuldu(kurum, [id], t0, new Date(t0 + 30 * 86_400_000));
      const acilma = acildi(kurum, [id], t0 + 5000);
      await yayinla(acilma); // once yeni olay
      await bekle(async () => (await islenenSayisi(acilma.id)) === 1);
      await yayinla(eskiCozuldu); // sonra eski olay (yeniden teslim / ters sira)
      await bekle(async () => (await islenenSayisi(eskiCozuldu.id)) === 1);
      expect((await saklamaSatiri(id))?.silinecek_at).toBeNull();

      const yeniPlan = new Date(t0 + 40 * 86_400_000);
      const yeniCozuldu = cozuldu(kurum, [id], t0 + 9000, yeniPlan);
      await yayinla(yeniCozuldu);
      await bekle(async () => (await islenenSayisi(yeniCozuldu.id)) === 1);
      expect((await saklamaSatiri(id))?.silinecek_at?.toISOString()).toBe(yeniPlan.toISOString());

      // gecikmeli eski yeniden-acildi yeni cozulmeyi geri almaz
      const eskiAcilma = acildi(kurum, [id], t0 + 2000);
      await yayinla(eskiAcilma);
      await bekle(async () => (await islenenSayisi(eskiAcilma.id)) === 1);
      expect((await saklamaSatiri(id))?.silinecek_at?.toISOString()).toBe(yeniPlan.toISOString());
    });

    it('baska kurumun olayi baska kurumun dosyasini etkilemez (RLS)', async () => {
      const kurumA = uuidv7();
      const kurumB = uuidv7();
      const dosyaB = await soruDosyasi(kurumB);
      const t0 = Date.now();
      const e = cozuldu(kurumA, [dosyaB], t0, new Date(t0 + 30 * 86_400_000));
      await yayinla(e);
      await new Promise((r) => setTimeout(r, 1500));
      expect((await saklamaSatiri(dosyaB))?.silinecek_at).toBeNull();
      // Kurum A'nin kendi (bos kapsamli) guncellemesi islenir; B dosyasi bulunamadigi icin 0 satir etkilenir.
    });

    it('daha guclu plan (kurum kapandi) cozuldu olayiyla ezilmez', async () => {
      const kurum = uuidv7();
      const id = await soruDosyasi(kurum);
      const kapanis = new Date(Date.now() + 90 * 86_400_000);
      await sistem`update medya.dosyalar set silinecek_at = ${kapanis}, silme_nedeni = 'kurum_kapandi' where id = ${id}`;
      const t0 = Date.now();
      const e = cozuldu(kurum, [id], t0, new Date(t0 + 30 * 86_400_000));
      await yayinla(e);
      await bekle(async () => (await islenenSayisi(e.id)) === 1);
      const d = await saklamaSatiri(id);
      expect(d?.neden).toBe('kurum_kapandi');
      expect(d?.silinecek_at?.toISOString()).toBe(kapanis.toISOString());
    });
  });
});
