/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // API proxy is handled by src/middleware.ts at request time,
  // reading INTERNAL_API_URL from the runtime environment (ConfigMap).
  // This replaces the previous rewrites() approach which baked the URL
  // into the compiled bundle at build time — making it impossible to
  // change without rebuilding the image.
};

module.exports = nextConfig;
