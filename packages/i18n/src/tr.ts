/** Varsayilan Turkce metinler. Anahtar yapisi: <alan>.<ekran>.<oge>. */
export const tr = {
  ortak: {
    kaydet: 'Kaydet',
    iptal: 'İptal',
    devam: 'Devam',
    geri: 'Geri',
    yukleniyor: 'Yükleniyor…',
    tekrarDene: 'Tekrar dene',
    hataGenel: 'Bir şeyler ters gitti. Lütfen tekrar dene.',
    baglantiYok: 'İnternet bağlantısı yok. Değişikliklerin bağlantı gelince gönderilecek.',
  },
  giris: {
    baslik: 'Hoş geldin',
    telefon: 'Telefon numaran',
    kodGonder: 'Kod gönder',
    kodGir: 'SMS ile gelen 6 haneli kodu gir',
    appleIle: 'Apple ile devam et',
    googleIle: 'Google ile devam et',
  },
  kvkk: {
    baslik: 'Kişisel verilerin',
    aciklama: 'Devam etmeden önce aydınlatma metnini okuyup onaylaman gerekiyor.',
    onay: 'Aydınlatma metnini okudum ve kabul ediyorum',
    metniAc: 'Aydınlatma metnini oku',
  },
  roller: {
    sahip: 'Kurum sahibi',
    yonetici: 'Yönetici',
    ogretmen: 'Öğretmen',
    ogrenci: 'Öğrenci',
    veli: 'Veli',
  },
} as const;

type Widen<T> = { [K in keyof T]: T[K] extends string ? string : Widen<T[K]> };
export type Messages = Widen<typeof tr>;
