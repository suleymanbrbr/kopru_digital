import type { ReactNode } from 'react';

import { PanelKoruma } from '@/components/kabuk/panel-koruma';

export default function PanelDuzeni({ children }: { children: ReactNode }) {
  return <PanelKoruma>{children}</PanelKoruma>;
}
