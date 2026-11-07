// OTOMATIK URETILDI: scripts/karakter-uret.mjs. Elle duzenlemeyin.
import type { FunctionComponent } from 'react';
import type { SvgProps } from 'react-native-svg';

import dinamo_1 from '../../../../assets/karakter/placeholder/dinamo-1.svg';
import dinamo_2 from '../../../../assets/karakter/placeholder/dinamo-2.svg';
import dinamo_3 from '../../../../assets/karakter/placeholder/dinamo-3.svg';
import dinamo_4 from '../../../../assets/karakter/placeholder/dinamo-4.svg';
import dinamo_5 from '../../../../assets/karakter/placeholder/dinamo-5.svg';
import kivilcim_1 from '../../../../assets/karakter/placeholder/kivilcim-1.svg';
import kivilcim_2 from '../../../../assets/karakter/placeholder/kivilcim-2.svg';
import kivilcim_3 from '../../../../assets/karakter/placeholder/kivilcim-3.svg';
import kivilcim_4 from '../../../../assets/karakter/placeholder/kivilcim-4.svg';
import kivilcim_5 from '../../../../assets/karakter/placeholder/kivilcim-5.svg';
import sedir_1 from '../../../../assets/karakter/placeholder/sedir-1.svg';
import sedir_2 from '../../../../assets/karakter/placeholder/sedir-2.svg';
import sedir_3 from '../../../../assets/karakter/placeholder/sedir-3.svg';
import sedir_4 from '../../../../assets/karakter/placeholder/sedir-4.svg';
import sedir_5 from '../../../../assets/karakter/placeholder/sedir-5.svg';

export type GorselBileseni = FunctionComponent<SvgProps>;

/** Anahtar: `<tur>-<asama>` ya da `<tur>-<asama>-v<varyant>`. */
export const KARAKTER_GORSELLERI: Readonly<Record<string, GorselBileseni>> = {
  'dinamo-1': dinamo_1,
  'dinamo-2': dinamo_2,
  'dinamo-3': dinamo_3,
  'dinamo-4': dinamo_4,
  'dinamo-5': dinamo_5,
  'kivilcim-1': kivilcim_1,
  'kivilcim-2': kivilcim_2,
  'kivilcim-3': kivilcim_3,
  'kivilcim-4': kivilcim_4,
  'kivilcim-5': kivilcim_5,
  'sedir-1': sedir_1,
  'sedir-2': sedir_2,
  'sedir-3': sedir_3,
  'sedir-4': sedir_4,
  'sedir-5': sedir_5,
};
