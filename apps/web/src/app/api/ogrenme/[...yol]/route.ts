import type { NextRequest } from 'next/server';

import { ogrenmeVekili } from '@/sunucu/ogrenme-vekil';

interface Baglam {
  params: Promise<{ yol: string[] }>;
}

async function isle(request: NextRequest, { params }: Baglam) {
  return ogrenmeVekili(request, (await params).yol);
}

export const GET = isle;
export const POST = isle;
export const PATCH = isle;
export const PUT = isle;
export const DELETE = isle;
