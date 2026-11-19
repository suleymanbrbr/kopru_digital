import type { NextRequest } from 'next/server';

import { girisVekili } from '@/sunucu/giris';

export function POST(request: NextRequest) {
  return girisVekili(request, 'otp/gonder');
}
