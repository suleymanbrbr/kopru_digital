import { forwardRef, useState, type ComponentRef } from 'react';
import { TextInput, View, type TextInputProps } from 'react-native';

import { useTema } from '../tema/TemaSaglayici';
import { Metin } from './Metin';

// Web'de tarayici odak halkasi yerine kutu kenari vurgulanir.
const WEB_ODAK_YOK = { outlineStyle: 'none' } as object;

interface Props extends TextInputProps {
  etiket: string;
  hata?: string | null;
  onek?: string;
}

export const MetinGirdisi = forwardRef<ComponentRef<typeof TextInput>, Props>(function MetinGirdisi(
  { etiket, hata, onek, ...rest },
  ref,
) {
  const { renkler } = useTema();
  const [odakta, setOdakta] = useState(false);
  return (
    <View className="gap-2">
      <Metin varyant="etiket">{etiket}</Metin>
      <View
        className={`min-h-12 flex-row items-center rounded-orta border bg-yuzey px-4 ${
          hata ? 'border-hata' : odakta ? 'border-birincil' : 'border-kenar'
        }`}
      >
        {onek ? <Metin className="mr-2 text-metinIkincil">{onek}</Metin> : null}
        <TextInput
          {...rest}
          ref={ref}
          accessibilityLabel={etiket}
          accessibilityHint={hata ?? undefined}
          placeholderTextColor={renkler.metinIkincil}
          maxFontSizeMultiplier={1.5}
          className="min-h-12 flex-1 font-govde text-md text-metin"
          style={[{ color: renkler.metin }, WEB_ODAK_YOK]}
          onFocus={(e) => {
            setOdakta(true);
            rest.onFocus?.(e);
          }}
          onBlur={(e) => {
            setOdakta(false);
            rest.onBlur?.(e);
          }}
        />
      </View>
      {hata ? (
        <Metin varyant="ikincil" className="text-hata" accessibilityLiveRegion="polite">
          {hata}
        </Metin>
      ) : null}
    </View>
  );
});
