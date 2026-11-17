import type { NextRequest } from 'next/server';

import { bildirimVekili } from '@/sunucu/bildirim-vekil';

interface Baglam {
  params: Promise<{ yol: string[] }>;
}

async function isle(request: NextRequest, { params }: Baglam) {
  return bildirimVekili(request, (await params).yol);
}

export const GET = isle;
export const POST = isle;
export const PUT = isle;
export const PATCH = isle;
export const DELETE = isle;
