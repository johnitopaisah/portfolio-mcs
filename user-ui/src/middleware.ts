import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Middleware — API proxy + request logger + visitor tracking
 *
 * Three responsibilities:
 * 1. REQUEST LOGGING — stdout morgan-style log for every request
 * 2. API PROXY      — forwards /api/* to INTERNAL_API_URL
 * 3. VISITOR PING   — fire-and-forget POST to /api/visitors on homepage hits
 *    Uses a session cookie (portfolio-sid) so each browser session is
 *    tracked once, not once per page navigation.
 */

const SKIP_LOG = /^\/((_next|__nextjs|favicon\.ico|robots\.txt|sitemap\.xml))/;

// 30-minute session window (milliseconds)
const SESSION_TTL_SECONDS = 30 * 60;

// ── Session ID ────────────────────────────────────────────────
function generateSessionId(): string {
  // crypto.randomUUID() is available in Next.js edge/Node runtime
  return crypto.randomUUID();
}

// ── Visitor ping ──────────────────────────────────────────────
// Called fire-and-forget — never awaited so it never delays the response.
function pingVisitor(request: NextRequest, sessionId: string): void {
  const apiBase = process.env.INTERNAL_API_URL;
  if (!apiBase) return;

  // Forward the headers the API needs for analytics
  const headers: Record<string, string> = {
    'Content-Type':       'application/json',
    'x-portfolio-sid':    sessionId,
    'x-referer':          request.headers.get('referer')         || '',
    'x-accept-language':  request.headers.get('accept-language') || '',
    'user-agent':         request.headers.get('user-agent')      || '',
  };

  // Pass Cloudflare headers through so the API gets country + real IP
  const cfIp      = request.headers.get('cf-connecting-ip');
  const cfCountry = request.headers.get('cf-ipcountry');
  const xForward  = request.headers.get('x-forwarded-for');
  if (cfIp)      headers['cf-connecting-ip'] = cfIp;
  if (cfCountry) headers['cf-ipcountry']     = cfCountry;
  if (xForward)  headers['x-forwarded-for']  = xForward;

  // Fire and forget — intentionally no await
  fetch(`${apiBase}/api/visitors`, { method: 'POST', headers })
    .catch(() => {}); // silently ignore failures — analytics is non-critical
}

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const start = Date.now();

  // ── API proxy ──────────────────────────────────────────────
  if (pathname.startsWith('/api/')) {
    const apiBase = process.env.INTERNAL_API_URL;

    if (!apiBase) {
      console.error('[user-ui] INTERNAL_API_URL is not set');
      return new NextResponse(
        JSON.stringify({ error: 'API proxy misconfigured: INTERNAL_API_URL is not set' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const target = `${apiBase}${pathname}${search}`;
    const headers = new Headers(request.headers);
    headers.set('x-forwarded-host',  request.headers.get('host') || '');
    headers.set('x-forwarded-proto', 'https');

    try {
      const response = await fetch(target, {
        method:  request.method,
        headers,
        body:    ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
        // @ts-ignore — needed for streaming request bodies
        duplex:  'half',
        // Without this, a fully unreachable API (e.g. scaled to 0 — see
        // the outage that also crash-looped this pod's SSR fetches) can
        // hang a real user's request indefinitely instead of returning
        // the 502 below in a reasonable time.
        signal:  AbortSignal.timeout(10_000),
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
      console.error(`[user-ui] proxy error → ${target} (${ms}ms)`, err);
      return new NextResponse(
        JSON.stringify({ error: 'API proxy error' }),
        { status: 502, headers: { 'Content-Type': 'application/json' } }
      );
    }
  }

  // ── Skip Next.js internals ─────────────────────────────────
  if (SKIP_LOG.test(pathname)) {
    return NextResponse.next();
  }

  // ── Page request ───────────────────────────────────────────
  const response = NextResponse.next();
  const ms = Date.now() - start;
  log(request, 200, ms);

  // ── Visitor tracking — homepage hits only ──────────────────
  // Only track GET / (the portfolio landing page).
  // All section navigation is client-side and doesn't re-hit the middleware.
  if (request.method === 'GET' && pathname === '/') {
    let sessionId = request.cookies.get('portfolio-sid')?.value || '';
    const isNewSession = !sessionId;

    if (isNewSession) {
      sessionId = generateSessionId();
    }

    // Always ping — the API deduplicates by session_id in stats queries.
    // This means multiple tab opens in the same session are recorded
    // but counted as one unique session in analytics.
    pingVisitor(request, sessionId);

    // Set/refresh session cookie on response
    response.cookies.set('portfolio-sid', sessionId, {
      maxAge:   SESSION_TTL_SECONDS,
      httpOnly: true,
      sameSite: 'lax',
      secure:   process.env.NODE_ENV === 'production',
      path:     '/',
    });
  }

  return response;
}

// ── Logger ────────────────────────────────────────────────────
function log(request: NextRequest, status: number, ms: number) {
  const ip =
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-real-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    '-';
  const ua     = request.headers.get('user-agent') || '-';
  const ref    = request.headers.get('referer')    || '-';
  const path   = request.nextUrl.pathname + (request.nextUrl.search || '');

  const statusStr = status >= 500 ? `\x1b[31m${status}\x1b[0m`
    : status >= 400 ? `\x1b[33m${status}\x1b[0m`
    : status >= 300 ? `\x1b[36m${status}\x1b[0m`
    : `\x1b[32m${status}\x1b[0m`;

  console.log(
    `[user-ui] ${request.method} ${path} ${statusStr} ${ms}ms :: ${ip} :: ${ua} :: ref:${ref}`
  );
}

// ── Matcher ───────────────────────────────────────────────────
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
