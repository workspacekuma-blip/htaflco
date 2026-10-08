// The browser talks to /api/... on this site, and Next forwards it to the API server.
// That keeps cookies on one origin, so no CORS setup is needed.
const API_URL = process.env.API_URL || 'http://localhost:3000';

// A hosted build must never proxy community traffic to a local development server.
if (process.env.NETLIFY === 'true') {
  const api = new URL(API_URL);
  if (!process.env.API_URL || api.protocol !== 'https:' || api.username || api.password ||
      ['localhost', '127.0.0.1', '[::1]'].includes(api.hostname) || api.pathname !== '/' || api.search || api.hash) {
    throw new Error('Set API_URL to the hosted API HTTPS origin before deploying to Netlify.');
  }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${API_URL}/:path*` }];
  },
};

export default nextConfig;
