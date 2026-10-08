// The browser talks to /api/... on this site, and Next forwards it to the API server.
// That keeps cookies on one origin, so no CORS setup is needed.
const API_URL = process.env.API_URL || 'http://localhost:3000';

/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${API_URL}/:path*` }];
  },
};

export default nextConfig;
