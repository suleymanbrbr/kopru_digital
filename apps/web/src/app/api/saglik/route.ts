/**
 * Canlilik ucu (Docker HEALTHCHECK, kamal-proxy): oturum ve bagimlilik gerektirmez, `/api` altinda
 * oldugu icin `proxy.ts` yonlendirmesine girmez.
 */
export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json({ status: 'ok' });
}
