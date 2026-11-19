import type { NextRequest } from 'next/server';

import { platformVekili } from '@/sunucu/vekil';

interface Baglam {
  params: Promise<{ yol: string[] }>;
}

async function ilet(request: NextRequest, baglam: Baglam) {
  const { yol } = await baglam.params;
  return platformVekili(request, yol);
}

export const GET = ilet;
export const POST = ilet;
export const PUT = ilet;
