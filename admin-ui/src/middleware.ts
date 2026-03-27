import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Middleware — API proxy
 *
 * Runs on every request at runtime (not build time).
 * Reads INTERNAL_API_URL from the live container environment,
 * which is injected by the K8s ConfigMap (portfolio-config).
 *
 * This means the API service name (e.g. portfolio-api, api-service)
 * is fully controlled by the ConfigMap — no image rebuild needed
 * when the service name changes.
 *
 * Local dev fallback: http://localhost:4000
 */
export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // Only proxy /api/* routes
  if (!pathname.startsWith('/api/')) {
    return NextResponse.next();
  }

  // Read from runtime environment — comes from ConfigMap INTERNAL_API_URL
  const apiBase =
    process.env.INTERNAL_API_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    'http://localhost:4000';

  const target = `${apiBase}${pathname}${search}`;

  // Forward the request to the API service
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
    // Remove hop-by-hop headers that must not be forwarded
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
  // Only run middleware on /api/* paths — skip Next.js internals
  matcher: '/api/:path*',
};
