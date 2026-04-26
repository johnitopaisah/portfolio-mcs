import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Middleware — API proxy + request logger
 *
 * Runs on every non-static request at runtime.
 * Two responsibilities:
 *
 * 1. REQUEST LOGGING — logs every page navigation and API call to stdout
 *    so kubectl logs shows admin interactions (IP, method, path, status,
 *    response time, user-agent). Same format as the API's morgan output.
 *
 * 2. API PROXY — forwards /api/* requests to the internal API service
 *    using INTERNAL_API_URL from the K8s ConfigMap. No image rebuild
 *    needed when the service name changes.
 */

// Paths that are Next.js internals — skip logging
const SKIP_LOG = /^\/((_next|__nextjs|favicon\.ico|robots\.txt))/;

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const start = Date.now();

  // ── API proxy ───────────────────────────────────────────────
  if (pathname.startsWith('/api/')) {
    const apiBase = process.env.INTERNAL_API_URL;

    if (!apiBase) {
      console.error('[admin-ui] INTERNAL_API_URL is not set');
      return new NextResponse(
        JSON.stringify({ error: 'API proxy misconfigured: INTERNAL_API_URL is not set' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const target = `${apiBase}${pathname}${search}`;
    const headers = new Headers(request.headers);
    headers.set('x-forwarded-host', request.headers.get('host') || '');
    headers.set('x-forwarded-proto', 'https');

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

      const ms = Date.now() - start;
      log(request, response.status, ms);

      return new NextResponse(response.body, {
        status:  response.status,
        headers: responseHeaders,
      });
    } catch (err) {
      const ms = Date.now() - start;
      console.error(`[admin-ui] proxy error → ${target} (${ms}ms)`, err);
      return new NextResponse(
        JSON.stringify({ error: 'API proxy error' }),
        { status: 502, headers: { 'Content-Type': 'application/json' } }
      );
    }
  }

  // ── Page requests ────────────────────────────────────────────
  if (SKIP_LOG.test(pathname)) {
    return NextResponse.next();
  }

  const response = NextResponse.next();
  const ms = Date.now() - start;
  log(request, 200, ms);
  return response;
}

// ── Logger ────────────────────────────────────────────────────
// Output format:
//   [admin-ui] GET /dashboard/projects 200 8ms :: 1.2.3.4 :: Mozilla/5.0 ...
function log(request: NextRequest, status: number, ms: number) {
  const ip =
    request.headers.get('x-real-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    '-';
  const ua  = request.headers.get('user-agent') || '-';
  const ref = request.headers.get('referer')    || '-';
  const { pathname, search } = request.nextUrl;
  const path = pathname + (search || '');

  const statusStr = status >= 500 ? `\x1b[31m${status}\x1b[0m`
    : status >= 400 ? `\x1b[33m${status}\x1b[0m`
    : status >= 300 ? `\x1b[36m${status}\x1b[0m`
    : `\x1b[32m${status}\x1b[0m`;

  console.log(
    `[admin-ui] ${request.method} ${path} ${statusStr} ${ms}ms :: ${ip} :: ${ua} :: ref:${ref}`
  );
}

// ── Matcher ───────────────────────────────────────────────────
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
