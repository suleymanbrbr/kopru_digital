import type { DenemeGelisimi } from '../api/ogrenmeTipleri';

/** Testler icin ornek deneme gelisimi: 3 onayli deneme, toplam 60-70-80, matematik 20-25-30. */
export function bolumGelisimiOrnegi(): DenemeGelisimi {
  const nokta = (n: number, toplam: number, mat: number) => ({
    denemeId: `d${String(n)}`,
    ad: `Deneme ${String(n)}`,
    sinavTarihi: `2026-10-0${String(n)}`,
    toplamNet: toplam,
    bolumler: [
      { bolumKodu: 'matematik', bransKodu: 'matematik', net: mat },
      { bolumKodu: 'turkce', bransKodu: 'turkce', net: toplam - mat },
    ],
  });
  return {
    ogrenciId: 'o',
    kuralKodu: 'tyt',
    denemeSayisi: 3,
    noktalar: [nokta(1, 60, 20), nokta(2, 70, 25), nokta(3, 80, 30)],
    son5Ortalama: 70,
    onceki5Ortalama: 65,
    degisim: 5,
    bolumGelisimi: [
      { bolumKodu: 'matematik', bransKodu: 'matematik', son5Ortalama: 25, degisim: 2.5 },
      { bolumKodu: 'turkce', bransKodu: 'turkce', son5Ortalama: 45, degisim: -1 },
    ],
  };
}
