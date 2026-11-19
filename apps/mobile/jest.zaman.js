// Mock veriler ve testler gercek saate gore uretiliyor; gunun saati ve haftanin gunu sonucu degistirmesin
// diye "simdi" sabit bir ana kaydirilir: kosu gununun Istanbul tarihiyle 12:00 (TEST_SIMDI_ISO ile
// degistirilebilir). Yalniz `Date` kaydirilir (sabit kayma, saat gercek hizda akar); jest sahte
// zamanlayicilari kullanilmaz, boylece act/waitFor davranisi degismez.
const GercekDate = Date;
const gun = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(
  new GercekDate(),
);
const referans = GercekDate.parse(process.env.TEST_SIMDI_ISO ?? `${gun}T12:00:00+03:00`);
const kayma = referans - GercekDate.now();

class KaymisDate extends GercekDate {
  constructor(...args) {
    if (args.length === 0) super(GercekDate.now() + kayma);
    else super(...args);
  }
  static now() {
    return GercekDate.now() + kayma;
  }
}

globalThis.Date = KaymisDate;
