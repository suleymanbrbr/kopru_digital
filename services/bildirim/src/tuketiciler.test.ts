import {
  hesapKurumDegistiV1,
  hesapUyelikDegistiV1,
  motivasyonSeriRiskV1,
  ogrenmeSoruMesajiEklendiV1,
} from '@kopru/contracts';
import { createDb, ensureEventStream, type Database } from '@kopru/service-kit';
import { connect, headers, type NatsConnection } from 'nats';
import { uuidv7 } from 'uuidv7';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ESLEMELER } from './eslemeler/index.js';
import { T0, cihazEkle, ortamKur, type Ortam } from './test/ortam.js';
import { natsYok, testDb, testNats } from './test/yardimcilar.js';
import { tuketicileriBaslat } from './tuketiciler.js';

const sessiz = { info: () => undefined, warn: () => undefined, error: () => undefined };

async function bekle<T>(oku: () => Promise<T | undefined | false>, ms = 20_000): Promise<T> {
  const bitis = Date.now() + ms;
  for (;;) {
    const v = await oku();
    if (v) return v;
    if (Date.now() > bitis) throw new Error('beklenen durum olusmadi');
    await new Promise((r) => setTimeout(r, 100));
  }
}

describe('eslemeler kayit listesi', () => {
  it('iki ornek esleme kayitli ve olay turleri benzersiz', () => {
    const turler = ESLEMELER.map((e) => e.olay.subject);
    expect(turler).toEqual(['evt.ogrenme.soru_mesaji.eklendi.v1', 'evt.motivasyon.seri.risk.v1']);
    expect(new Set(turler).size).toBe(turler.length);
  });
});

describe.skipIf(natsYok())('olay tuketicileri (gercek PostgreSQL + NATS)', () => {
  const urls = testDb();
  const sonek = `_t${Math.random().toString(36).slice(2, 8)}`;
  let nats: NatsConnection;
  let o: Ortam;
  let app: Database;
  let durdur: () => Promise<void>;

  async function yayinla(olay: { id: string; type: string; version: number }) {
    // Ayni olay kimligi iki kez gonderilebilsin diye rastgele msgID (JetStream tekrar onleme devre disi).
    const h = headers();
    h.set('Nats-Msg-Id', uuidv7());
    await nats
      .jetstream()
      .publish(`evt.${olay.type}.v${String(olay.version)}`, JSON.stringify(olay), { headers: h });
  }

  beforeAll(async () => {
    const url = testNats();
    if (!urls || !url) return;
    o = ortamKur();
    app = createDb({ url: urls.appUrl, max: 4 });
    nats = await connect({ servers: url, name: 'bildirim-test' });
    await ensureEventStream(nats);
    const tuketiciler = await tuketicileriBaslat({
      nats,
      db: app,
      log: sessiz,
      sonek,
      baslangic: 'yeni',
    });
    durdur = async () => {
      await Promise.all(tuketiciler.map((t) => t.stop()));
    };
  });

  afterAll(async () => {
    await durdur();
    const jsm = await nats.jetstreamManager();
    for (const ad of [`bildirim_kopya${sonek}`, `bildirim_uretim${sonek}`]) {
      await jsm.consumers.delete('EVENTS', ad).catch(() => undefined);
    }
    await nats.drain();
    await app.close();
    await o.kapat();
  });

  const zarf = (kurumId: string) => ({
    kurumId,
    actor: { tur: 'sistem', id: 'api' } as const,
    correlationId: 'c',
  });
  const bildirimler = (kurumId: string) =>
    o.sistem<
      {
        baslik: string;
        derin_baglanti: string;
        kategori: string;
        alici_id: string;
        gecerlilik_bitis_at: Date | null;
      }[]
    >`select baslik, derin_baglanti, kategori, alici_id, gecerlilik_bitis_at from bildirim.bildirimler where kurum_id = ${kurumId}`;
  const gonderimler = (kurumId: string) =>
    o.sistem<{ durum: string; atlama_nedeni: string | null; baslik: string | null }[]>`
      select durum, atlama_nedeni, baslik from bildirim.gonderimler where kurum_id = ${kurumId}`;
  const islenen = async (olayId: string, tuketici: string) =>
    (
      await o.sistem<{ n: number }[]>`
        select count(*)::int n from ortak.processed_events
         where olay_id = ${olayId} and tuketici = ${`${tuketici}${sonek}`}`
    )[0]?.n ?? 0;

  it('hesap olaylari kopyalari doldurur; kopya olaylari tekrar gelse de tek satir', async () => {
    const kurumId = uuidv7();
    const uyelikId = uuidv7();
    const kopya = hesapKurumDegistiV1.create({
      ...zarf(kurumId),
      data: {
        kurum_id: kurumId,
        ad: 'Atlas',
        tur: 'kurum',
        saat_dilimi: 'Europe/Istanbul',
        durum: 'aktif',
      },
    });
    await yayinla(kopya);
    await yayinla(kopya);
    await yayinla(
      hesapUyelikDegistiV1.create({
        ...zarf(kurumId),
        data: {
          uyelik_id: uyelikId,
          kullanici_id: uuidv7(),
          rol: 'ogrenci',
          durum: 'aktif',
          sube_id: null,
          kademe_id: null,
        },
      }),
    );
    await bekle(async () => (await islenen(kopya.id, 'bildirim.kopya')) === 1);
    await bekle(
      async () =>
        (
          await o.sistem<
            { n: number }[]
          >`select count(*)::int n from bildirim.uyelik_kopyalari where uyelik_id = ${uyelikId}`
        )[0]?.n === 1,
    );
    const k = await o.sistem<
      { ad: string }[]
    >`select ad from bildirim.kurum_kopyalari where kurum_id = ${kurumId}`;
    expect(k).toEqual([{ ad: 'Atlas' }]);
  });

  it('soru cevabi olayi (uyelik kopyasindan SONRA gelse bile) kutu bildirimi ve push gonderimi uretir; tekrar teslim tek bildirim', async () => {
    const kurumId = uuidv7();
    const ogrenciUyelik = uuidv7();
    const ogrenciKullanici = uuidv7();
    const soruId = uuidv7();
    const mesajId = uuidv7();
    // Cihaz, kopya olayi islenmeden once kayitli
    await cihazEkle(o, ogrenciKullanici);
    const cevap = ogrenmeSoruMesajiEklendiV1.create({
      ...zarf(kurumId),
      data: {
        soru_id: soruId,
        mesaj_id: mesajId,
        tur: 'cevap',
        yazar_id: uuidv7(),
        ogrenci_id: ogrenciUyelik,
        alici_idleri: [ogrenciUyelik],
      },
    });
    // Sira bozuk: once cevap olayi (kopya yok -> YenidenDene, gecikmeli nak), sonra uyelik olayi
    await yayinla(cevap);
    await yayinla(
      hesapUyelikDegistiV1.create({
        ...zarf(kurumId),
        data: {
          uyelik_id: ogrenciUyelik,
          kullanici_id: ogrenciKullanici,
          rol: 'ogrenci',
          durum: 'aktif',
          sube_id: null,
          kademe_id: null,
        },
      }),
    );
    const liste = await bekle(async () => {
      const l = await bildirimler(kurumId);
      return l.length > 0 && l;
    }, 30_000);
    expect(liste).toHaveLength(1);
    expect(liste[0]).toMatchObject({
      baslik: 'Sorun cevaplandı',
      derin_baglanti: `kopru://soru/${soruId}`,
      kategori: 'soru',
      alici_id: ogrenciUyelik,
    });
    const g = await gonderimler(kurumId);
    expect(g).toHaveLength(1);
    expect(g[0]).toMatchObject({ baslik: 'Sorun cevaplandı' });
    expect(['beklemede', 'ertelendi']).toContain(g[0]?.durum);

    // Ayni olay yeniden teslim + ayni mesaj icin farkli olay kimligi: yeni bildirim yok
    await yayinla(cevap);
    await yayinla(ogrenmeSoruMesajiEklendiV1.create({ ...zarf(kurumId), data: cevap.data }));
    await bekle(async () => (await islenen(cevap.id, 'bildirim.uretim')) === 1);
    await new Promise((r) => setTimeout(r, 1500));
    expect(await bildirimler(kurumId)).toHaveLength(1);
    expect(await gonderimler(kurumId)).toHaveLength(1);
  });

  it('takip mesaji ve ogrencinin kendi mesaji bildirim uretmez', async () => {
    const kurumId = uuidv7();
    const ogrenciUyelik = uuidv7();
    const ogrenciKullanici = uuidv7();
    await o.sistem`insert into bildirim.uyelik_kopyalari (uyelik_id, kurum_id, kullanici_id, rol, durum, son_olay_at, son_olay_id)
                   values (${ogrenciUyelik}, ${kurumId}, ${ogrenciKullanici}, 'ogrenci', 'aktif', now(), ${uuidv7()})`;
    const takip = ogrenmeSoruMesajiEklendiV1.create({
      ...zarf(kurumId),
      data: {
        soru_id: uuidv7(),
        mesaj_id: uuidv7(),
        tur: 'takip',
        yazar_id: ogrenciUyelik,
        ogrenci_id: ogrenciUyelik,
        alici_idleri: [uuidv7()],
      },
    });
    const kendi = ogrenmeSoruMesajiEklendiV1.create({
      ...zarf(kurumId),
      data: {
        soru_id: uuidv7(),
        mesaj_id: uuidv7(),
        tur: 'cevap',
        yazar_id: ogrenciUyelik,
        ogrenci_id: ogrenciUyelik,
        alici_idleri: [],
      },
    });
    await yayinla(takip);
    await yayinla(kendi);
    await bekle(async () => (await islenen(takip.id, 'bildirim.uretim')) === 1);
    await bekle(async () => (await islenen(kendi.id, 'bildirim.uretim')) === 1);
    expect(await bildirimler(kurumId)).toHaveLength(0);
  });

  it('seri riski olayi seri hatirlatmasi uretir (gecerlilik = gun sonu); sessiz saatte push ertelenir ya da gider', async () => {
    const kurumId = uuidv7();
    const ogrenciUyelik = uuidv7();
    const ogrenciKullanici = uuidv7();
    await o.sistem`insert into bildirim.uyelik_kopyalari (uyelik_id, kurum_id, kullanici_id, rol, durum, son_olay_at, son_olay_id)
                   values (${ogrenciUyelik}, ${kurumId}, ${ogrenciKullanici}, 'ogrenci', 'aktif', now(), ${uuidv7()})`;
    await cihazEkle(o, ogrenciKullanici);
    const gunBitis = new Date(Date.now() + 6 * 3_600_000);
    const risk = motivasyonSeriRiskV1.create({
      ...zarf(kurumId),
      data: {
        ogrenci_id: ogrenciUyelik,
        mevcut_seri: 7,
        gun_bitis_at: gunBitis.toISOString(),
        dondurma_stogu: 1,
      },
    });
    await yayinla(risk);
    const liste = await bekle(async () => {
      const l = await bildirimler(kurumId);
      return l.length > 0 && l;
    });
    expect(liste[0]).toMatchObject({
      baslik: 'Serini koru!',
      derin_baglanti: 'kopru://bugun',
      kategori: 'oyunlastirma',
    });
    expect(liste[0]?.gecerlilik_bitis_at?.toISOString()).toBe(gunBitis.toISOString());
    const [govde] = await o.sistem<
      { govde: string }[]
    >`select govde from bildirim.bildirimler where kurum_id = ${kurumId}`;
    expect(govde?.govde).toContain('7 günlük');
    expect(await gonderimler(kurumId)).toHaveLength(1);
    // Ayni gun icin tekrar risk olayi (farkli olay kimligi): tek bildirim
    await yayinla(
      motivasyonSeriRiskV1.create({ ...zarf(kurumId), occurredAt: T0, data: risk.data }),
    );
    await new Promise((r) => setTimeout(r, 1500));
    expect(await bildirimler(kurumId)).toHaveLength(1);
  });
});
