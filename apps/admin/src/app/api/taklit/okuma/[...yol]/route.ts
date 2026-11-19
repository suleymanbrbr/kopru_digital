import type { NextRequest } from 'next/server';

import { taklitOkumaVekili } from '@/sunucu/vekil';

interface Baglam {
  params: Promise<{ yol: string[] }>;
}

export async function GET(request: NextRequest, baglam: Baglam) {
  const { yol } = await baglam.params;
  return taklitOkumaVekili(request, yol);
}
