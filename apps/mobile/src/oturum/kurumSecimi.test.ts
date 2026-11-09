import type { Uyelik } from '../api/tipler';
import { kurumSecenekleri } from './kurumSecimi';

const u = (
  id: string,
  kurumId: string,
  rol: Uyelik['rol'],
  kurumTur: Uyelik['kurumTur'],
): Uyelik => ({ uyelikId: id, kurumId, kurumAd: kurumId, rol, kurumTur });

describe('kurumSecenekleri', () => {
  it('bireysel kurumda sahip + ogretmen tek satira iner ve sahip secilir', () => {
    const s = kurumSecenekleri([
      u('o', 'k1', 'ogretmen', 'bireysel'),
      u('s', 'k1', 'sahip', 'bireysel'),
    ]);
    expect(s.map((x) => x.uyelikId)).toEqual(['s']);
  });

  it('kurum turunde roller ayri satir kalir (rol farki anlamli)', () => {
    const s = kurumSecenekleri([u('s', 'k1', 'sahip', 'kurum'), u('o', 'k1', 'ogretmen', 'kurum')]);
    expect(s).toHaveLength(2);
  });

  it('tur bilinmiyorsa (null/yok) dokunulmaz; farkli kurumlar korunur ve sira bozulmaz', () => {
    const s = kurumSecenekleri([
      u('a', 'k1', 'ogretmen', null),
      u('b', 'k2', 'ogretmen', 'bireysel'),
      u('c', 'k2', 'sahip', 'bireysel'),
      u('d', 'k3', 'ogrenci', 'ekip'),
    ]);
    expect(s.map((x) => x.uyelikId)).toEqual(['a', 'c', 'd']);
  });
});
