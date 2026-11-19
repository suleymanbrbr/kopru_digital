import type { NextRequest } from 'next/server';

import { abonelikVekili } from '@/sunucu/abonelik-vekil';

interface Baglam {
  params: Promise<{ yol: string[] }>;
}

async function isle(request: NextRequest, { params }: Baglam) {
  return abonelikVekili(request, (await params).yol);
}

export const GET = isle;
export const POST = isle;
export const PUT = isle;
export const PATCH = isle;
export const DELETE = isle;
