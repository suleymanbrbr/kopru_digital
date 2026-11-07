import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';

import { useTema } from '../tema/TemaSaglayici';

type Ad = ComponentProps<typeof Ionicons>['name'];

interface Props {
  ad: Ad;
  boyut?: number;
  renk?: string;
}

/** Dekoratif ikon: ekran okuyuculardan gizlenir; anlam yanindaki metinle verilir. */
export function Ikon({ ad, boyut = 22, renk }: Props) {
  const { renkler } = useTema();
  return (
    <Ionicons
      name={ad}
      size={boyut}
      color={renk ?? renkler.metin}
      accessibilityElementsHidden
      importantForAccessibility="no"
    />
  );
}
