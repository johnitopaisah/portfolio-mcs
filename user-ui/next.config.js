/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  async rewrites() {
    // All /api/* requests from the browser are proxied to the API service.
    // Server-side: INTERNAL_API_URL resolves to http://api:4000 (Docker network).
    // Client-side: this rewrite runs on the Next.js server, so it also uses
    // the internal hostname — the browser never makes cross-origin requests.
    const apiBase =
      process.env.INTERNAL_API_URL ||
      process.env.NEXT_PUBLIC_API_URL ||
      'http://localhost:4000';
    return [
      {
        source: '/api/:path*',
        destination: `${apiBase}/api/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
