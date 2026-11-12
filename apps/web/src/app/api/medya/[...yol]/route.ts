import type { NextRequest } from 'next/server';

import { medyaVekili } from '@/sunucu/medya-vekil';

interface Baglam {
  params: Promise<{ yol: string[] }>;
}

async function isle(request: NextRequest, { params }: Baglam) {
  return medyaVekili(request, (await params).yol);
}

export const GET = isle;
export const POST = isle;
