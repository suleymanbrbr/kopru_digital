/* eslint-disable @typescript-eslint/no-deprecated -- react-test-renderer: bkz. ekranlar.test.tsx */
import { act } from 'react';
import { Text } from 'react-native';
import { create } from 'react-test-renderer';

import { Ekran } from './Ekran';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }),
}));

describe('Ekran ust yuvasi', () => {
  it('ust yuva guvenli alanin (Dynamic Island) altinda, icerigin ustunde; icerik cift bosluk almaz', () => {
    let r!: ReturnType<typeof create>;
    act(() => {
      r = create(
        <Ekran kenarlar={['top', 'left', 'right']} ust={<Text>serit</Text>} kaydir={false}>
          <Text>icerik</Text>
        </Ekran>,
      );
    });
    const json = r.toJSON() as unknown as {
      props: { style: { paddingTop: number } };
      children: { type: string; children: unknown[] }[];
    };
    // Dis kap ust guvenli alan kadar bosluk birakir; serit onun icinde, ilk cocuk.
    expect(json.props.style.paddingTop).toBe(47);
    expect(json.children[0]?.children).toEqual(['serit']);
    expect(JSON.stringify(json.children[1])).toContain('icerik');
    // Serit icerik alaninin (p-4 vb.) icinde degil, disinda: kardes konumunda.
    expect(json.children).toHaveLength(2);
    act(() => {
      r.unmount();
    });
  });

  it('ust yuva verilmezse yalniz icerik render edilir', () => {
    let r!: ReturnType<typeof create>;
    act(() => {
      r = create(
        <Ekran kaydir={false}>
          <Text>icerik</Text>
        </Ekran>,
      );
    });
    const json = r.toJSON() as unknown as { children: unknown[] };
    expect(json.children).toHaveLength(1);
    act(() => {
      r.unmount();
    });
  });
});
