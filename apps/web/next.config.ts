import type { NextConfig } from 'next';

// Where the back end runs. The browser never calls it directly: every request
// goes to /api on this site and is forwarded, so the login cookie stays
// first-party (iPhone Safari blocks cookies between two different sites).
const apiOrigin = (process.env.API_ORIGIN ?? 'http://localhost:4000').replace(/\/+$/, '');

const config: NextConfig = {
  transpilePackages: ['@pa/ui'],
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${apiOrigin}/api/:path*` }];
  },
};

export default config;
