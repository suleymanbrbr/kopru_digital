import { DuyuruOlusturSema, type Duyuru } from '@kopru/contracts';
import { describe, expect, it } from 'vitest';

import {
  BOS_FORM,
  duyurudenForm,
  formHatalari,
  formdanGovde,
  yerelZamanDegeri,
  yerelZamandanIso,
} from './form';

const GRUP = '0198e7a0-0000-7000-8000-000000000001';
const KURUM = '0198e7a0-0000-7000-8000-000000000002';
const gecerli = { ...BOS_FORM, baslik: 'Başlık', govde: 'Metin', grupId: GRUP };

describe('formHatalari', () => {
  it('bos form baslik, govde ve grup hatasi verir', () => {
    expect(formHatalari(BOS_FORM)).toEqual({
      baslik: 'duyurular.form.baslikBos',
      govde: 'duyurular.form.govdeBos',
      grup: 'duyurular.form.grupGerekli',
    });
  });

  it('sinirlar: baslik 200, govde 4000 gecerli; bir fazlasi hatali; bosluklar sayilmaz', () => {
    expect(formHatalari({ ...gecerli, baslik: 'a'.repeat(200), govde: 'b'.repeat(4000) })).toEqual(
      {},
    );
    expect(formHatalari({ ...gecerli, baslik: 'a'.repeat(201) }).baslik).toBeDefined();
    expect(formHatalari({ ...gecerli, govde: 'b'.repeat(4001) }).govde).toBeDefined();
    expect(formHatalari({ ...gecerli, baslik: '   ' }).baslik).toBeDefined();
    expect(formHatalari({ ...gecerli, baslik: ` ${'a'.repeat(200)} ` })).toEqual({});
  });

  it('kurum hedefinde grup gerekmez; rol zorunlu; bitis gecmiste olamaz', () => {
    expect(formHatalari({ ...gecerli, hedefTuru: 'kurum', grupId: '' })).toEqual({});
    expect(formHatalari({ ...gecerli, roller: [] }).roller).toBeDefined();
    const simdi = Date.parse('2026-11-18T10:00:00Z');
    expect(formHatalari({ ...gecerli, bitis: '2020-01-01T10:00' }, { simdi }).bitis).toBeDefined();
    expect(
      formHatalari({ ...gecerli, bitis: '2999-01-01T10:00' }, { simdi }).bitis,
    ).toBeUndefined();
    expect(formHatalari({ ...gecerli, bitis: 'gecersiz' }, { simdi }).bitis).toBeDefined();
  });
});

describe('formdanGovde', () => {
  it('sozlesme semasina uyar: grup hedefi grup kimligi, kurum hedefi kurum kimligi tasir', () => {
    const grup = DuyuruOlusturSema.parse(formdanGovde({ ...gecerli, sabit: true }, KURUM));
    expect(grup).toMatchObject({
      hedef_turu: 'grup',
      hedef_id: GRUP,
      sabit: true,
      push_gonderildi: true,
    });
    const kurum = DuyuruOlusturSema.parse(
      formdanGovde(
        { ...gecerli, hedefTuru: 'kurum', roller: ['ogrenci', 'ogretmen'], push: false },
        KURUM,
      ),
    );
    expect(kurum).toMatchObject({
      hedef_turu: 'kurum',
      hedef_id: KURUM,
      hedef_roller: ['ogrenci', 'ogretmen'],
      push_gonderildi: false,
      bitis_at: null,
    });
  });

  it('baslik ve govdeyi kirpar', () => {
    const g = formdanGovde({ ...gecerli, baslik: '  A  ', govde: ' B\n' }, KURUM);
    expect(g.baslik).toBe('A');
    expect(g.govde).toBe('B');
  });
});

describe('yerel zaman donusumu', () => {
  it('gidis donus aynidir; bos ve gecersiz guvenli', () => {
    const iso = yerelZamandanIso('2026-12-01T18:30');
    expect(iso).not.toBeNull();
    expect(yerelZamanDegeri(iso)).toBe('2026-12-01T18:30');
    expect(yerelZamandanIso('')).toBeNull();
    expect(yerelZamandanIso('x')).toBeNull();
    expect(yerelZamanDegeri(null)).toBe('');
    expect(yerelZamanDegeri('bozuk')).toBe('');
  });
});

describe('duyurudenForm', () => {
  const taslak: Duyuru = {
    id: '0198e7a0-0000-7000-8000-000000000003',
    baslik: 'T',
    govde: 'G',
    hedef_turu: 'kademe',
    hedef_id: KURUM,
    hedef_roller: ['ogretmen'],
    yazar_id: KURUM,
    durum: 'taslak',
    yayin_at: null,
    bitis_at: null,
    sabit: true,
    push_gonderildi: false,
    alici_sayisi: 0,
    okunan_sayisi: 0,
    dagitim_tamam: true,
    created_at: '2026-11-18T10:00:00.000Z',
    updated_at: '2026-11-18T10:00:00.000Z',
  };

  it('kademe hedefli taslakta grup bos birakilir; alanlar korunur', () => {
    expect(duyurudenForm(taslak)).toMatchObject({
      hedefTuru: 'grup',
      grupId: '',
      roller: ['ogretmen'],
      sabit: true,
      push: false,
    });
    expect(duyurudenForm({ ...taslak, hedef_turu: 'grup', hedef_id: GRUP }).grupId).toBe(GRUP);
    expect(duyurudenForm({ ...taslak, hedef_turu: 'kurum' }).hedefTuru).toBe('kurum');
  });
});
