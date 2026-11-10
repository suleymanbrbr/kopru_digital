import { bellekBelirtecDeposu } from '../depo/belirtecDeposu';
import { bugunTarihi } from '../lib/saat';
import { haftaKaydir } from '../ogrenme/hafta';
import { mockAdaptorler } from './mock';
import { MOCK_SAAT_DILIMI } from './mockOperasyon';
import { apiHatasiMi, type ApiHata } from './tipler';

async function kur(uyelikId: string, telefon = '+905551110001') {
  const depo = bellekBelirtecDeposu();
  const a = mockAdaptorler(depo, 0);
  await a.auth.otpDogrula(telefon, '123456');
  await a.auth.uyelikSec(uyelikId);
  return a.ogrenme;
}

async function hata(p: Promise<unknown>): Promise<ApiHata> {
  try {
    await p;
  } catch (e) {
    if (apiHatasiMi(e)) return e;
    throw e;
  }
  throw new Error('hata bekleniyordu');
}

const OGRENCI = 'uyelik-ogrenci-a';

function gerekli<T>(v: T | undefined): T {
  if (v === undefined) throw new Error('beklenen veri yok');
  return v;
}
const bugun = () => bugunTarihi(MOCK_SAAT_DILIMI);

describe('mock ogrenme adaptoru: ogrenci yalniz kendi verisini gorur', () => {
  it('denemelerim yalniz kendi denemeleri; baskasinin gelisimi 404', async () => {
    const o = await kur(OGRENCI, '+905551110002');
    const d = await o.denemelerim();
    expect(d.length).toBeGreaterThan(0);
    expect(d.every((x) => x.ogrenciId === OGRENCI)).toBe(true);
    expect(d.every((x) => x.ogrenciAd === null)).toBe(true);
    expect(d.map((x) => x.onayDurumu)).toEqual(
      expect.arrayContaining(['onaylandi', 'bekliyor', 'reddedildi']),
    );
    const e = await hata(o.denemeGelisim('ogr-elif', 'tyt'));
    expect(e.kod).toBe('bulunamadi');
    await expect(o.denemeGelisim(OGRENCI, 'tyt')).resolves.toMatchObject({ kuralKodu: 'tyt' });
    // personel uclari ogrenciye kapali
    expect((await hata(o.denemeler({ onay: 'bekliyor' }))).kod).toBe('izin_yok');
    expect((await hata(o.odevler())).kod).toBe('izin_yok');
  });

  it('odevlerim yalniz kendi satirlari; baskasinin odevini teslim edemez', async () => {
    const o = await kur(OGRENCI, '+905551110002');
    const l = await o.odevlerim();
    expect(l.length).toBeGreaterThan(0);
    expect(l.every((x) => x.id.endsWith(OGRENCI))).toBe(true);
    const e = await hata(o.odevTeslim('oo-odev-1-ogr-elif', { yapilanSoru: 5 }));
    expect(e.kod).toBe('bulunamadi');
  });

  it('planim yalniz yayinlanmis kendi plani; baskasinin gorevini yazamaz', async () => {
    const o = await kur(OGRENCI, '+905551110002');
    const p = await o.planim(bugun());
    expect(p.ogrenciId).toBe(OGRENCI);
    expect(p.plan?.durum).toBe('yayinda');
    expect(p.gorevler.every((g) => g.ogrenciId === OGRENCI)).toBe(true);
    const ogretmen = await kur('uyelik-ogretmen-a');
    const elif = await ogretmen.ogrenciPlani('ogr-elif', bugun());
    expect(elif.plan?.durum).toBe('taslak');
    const gorevId = gerekli(elif.gorevler[0]).id;
    expect((await hata(o.gorevGerceklesen(gorevId, 5))).kod).toBe('bulunamadi');
  });
});

describe('mock ogrenme adaptoru: hata kodlari ve kurallar', () => {
  it('gorev_zaten_devredildi, hedef_gun_gecersiz, plan_kilitli, devretme_durumu_gecersiz', async () => {
    const o = await kur(OGRENCI, '+905551110002');
    const p = await o.planim(bugun());
    const g = gerekli(p.gorevler.find((x) => x.gun === bugun() && x.hedefTuru === 'dakika'));
    const e1 = await hata(o.gorevDevret(g.id, g.gun));
    expect(e1.ayrinti).toBe('hedef_gun_gecersiz');
    const e1b = await hata(o.gorevDevret(g.id, '2999-01-01'));
    expect(e1b.ayrinti).toBe('hedef_gun_gecersiz');
    await o.gorevDevret(g.id);
    const e2 = await hata(o.gorevDevret(g.id));
    expect(e2.ayrinti).toBe('gorev_zaten_devredildi');
    expect((await hata(o.gorevGerceklesen(g.id, 3))).ayrinti).toBe('gorev_zaten_devredildi');
    // tamamlanan gorev tasinamaz
    const h = gerekli(p.gorevler.find((x) => x.gun === bugun() && x.hedefTuru === 'soru'));
    await o.gorevGerceklesen(h.id, 20);
    expect((await hata(o.gorevDevret(h.id))).ayrinti).toBe('devretme_durumu_gecersiz');
    // kilitli (cok eski) hafta
    const eski = await o.planim(haftaKaydir(bugun(), -8));
    expect(eski.kilitli).toBe(true);
  });

  it('gerceklesen ayni deger tekrari surumu artirmaz; durum sunucu kuralina gore', async () => {
    const o = await kur(OGRENCI, '+905551110002');
    const g = gerekli(
      (await o.planim(bugun())).gorevler.find((x) => x.gun === bugun() && x.hedefTuru === 'soru'),
    );
    const a = await o.gorevGerceklesen(g.id, 12);
    const b = await o.gorevGerceklesen(g.id, 12);
    expect(b.surum).toBe(a.surum);
    expect(a.durum).toBe('kismen');
    expect((await o.gorevGerceklesen(g.id, 0)).durum).toBe('yapilmadi');
    expect((await o.gorevGerceklesen(g.id, 25)).durum).toBe('tamam');
  });

  it('teslim_durumu_gecersiz, inceleme_durumu_gecersiz', async () => {
    const o = await kur(OGRENCI, '+905551110002');
    const id = 'oo-odev-1-uyelik-ogrenci-a';
    await o.odevTeslim(id, { yapilanSoru: 20 });
    expect((await hata(o.odevTeslim(id, { yapilanSoru: 20 }))).ayrinti).toBe(
      'teslim_durumu_gecersiz',
    );
    // teslim edilmemis bir satir incelenemez; teslim edilen bir kez incelenir
    const t = await kur('uyelik-ogretmen-a');
    expect((await hata(t.odevIncele('oo-odev-2-ogr-zeynep', 'tamam'))).ayrinti).toBe(
      'inceleme_durumu_gecersiz',
    );
    await t.odevIncele('oo-odev-1-ogr-elif', 'tamam');
    expect((await hata(t.odevIncele('oo-odev-1-ogr-elif', 'tamam'))).ayrinti).toBe(
      'inceleme_durumu_gecersiz',
    );
  });

  it('ogrenci_deneme_girisi_kapali (kurum b) ve deneme_zaten_var', async () => {
    const ogrenciB = await kur('uyelik-ogrenci-b', '+905551110005');
    const girdi = {
      kuralKodu: 'tyt',
      ad: 'X',
      sinavTarihi: bugun(),
      bolumler: [{ bolumKodu: 'matematik', dogru: 10, yanlis: 2 }],
    };
    expect(await ogrenciB.ogrenciDenemeGirisi()).toBe(false);
    expect((await hata(ogrenciB.denemeOlustur(girdi))).ayrinti).toBe(
      'ogrenci_deneme_girisi_kapali',
    );
    const o = await kur(OGRENCI, '+905551110002');
    expect(await o.ogrenciDenemeGirisi()).toBe(true);
    const d = await o.denemeOlustur(girdi);
    expect(d).toMatchObject({ onayDurumu: 'bekliyor', kaynak: 'ogrenci', toplamNet: 9.5 });
    expect((await hata(o.denemeOlustur(girdi))).ayrinti).toBe('deneme_zaten_var');
  });

  it('gelisim: son 5 ortalama, onceki 5 ve degisim yalniz onayli denemelerden', async () => {
    const o = await kur(OGRENCI, '+905551110002');
    const g = await o.denemeGelisim(OGRENCI, 'tyt');
    expect(g.denemeSayisi).toBe(5); // bekleyen ve reddedilen sayilmaz
    expect(g.noktalar).toHaveLength(5);
    const tarihler = g.noktalar.map((n) => n.sinavTarihi);
    expect([...tarihler].sort()).toEqual(tarihler); // eskiden yeniye
    expect(g.son5Ortalama).not.toBeNull();
    expect(g.onceki5Ortalama).toBeNull();
    expect(g.degisim).toBeNull();
  });
});
