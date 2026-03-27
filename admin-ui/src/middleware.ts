import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Middleware — API proxy
 *
 * Runs on every request at runtime (not build time).
 * Reads INTERNAL_API_URL from the live container environment,
 * injected by the K8s ConfigMap (portfolio-config).
 *
 * The API service name is fully controlled by the ConfigMap —
 * no image rebuild needed when the service name changes.
 *
 * For local dev, set INTERNAL_API_URL in .env.local:
 *   INTERNAL_API_URL=http://localhost:4000
 */
export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (!pathname.startsWith('/api/')) {
    return NextResponse.next();
  }

  const apiBase = process.env.INTERNAL_API_URL;

  if (!apiBase) {
    console.error('[middleware] INTERNAL_API_URL is not set');
    return new NextResponse(
      JSON.stringify({ error: 'API proxy misconfigured: INTERNAL_API_URL is not set' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const target = `${apiBase}${pathname}${search}`;

  const headers = new Headers(request.headers);
  headers.set('x-forwarded-host', request.headers.get('host') || '');
  headers.set('x-forwarded-proto', 'http');

  try {
    const response = await fetch(target, {
      method:  request.method,
      headers,
      body:    ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
      // @ts-ignore — needed for streaming request bodies
      duplex:  'half',
    });

    const responseHeaders = new Headers(response.headers);
    responseHeaders.delete('transfer-encoding');

    return new NextResponse(response.body, {
      status:  response.status,
      headers: responseHeaders,
    });
  } catch (err) {
    console.error(`[middleware] Failed to proxy ${target}`, err);
    return new NextResponse(
      JSON.stringify({ error: 'API proxy error' }),
      { status: 502, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

export const config = {
  matcher: '/api/:path*',
};
