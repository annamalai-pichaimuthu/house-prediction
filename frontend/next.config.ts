import type { NextConfig } from "next";

/**
 * Runtime environment variables are declared in .env.local (local dev) or
 * set directly in the deployment environment (production).
 *
 * Browser-exposed vars must be prefixed NEXT_PUBLIC_ — see .env.local:
 *   NEXT_PUBLIC_PYTHON_API_URL  — Python backend (predictions, history)
 *   NEXT_PUBLIC_JAVA_API_URL    — Java backend (market analysis, export)
 *
 * API rewrites proxy /api/python/* and /api/java/* through the Next.js server
 * so the raw backend ports (8001, 9090) are never exposed to the browser.
 * The destination is read from the env vars; in production set them to the
 * internal service hostnames.
 */
const PYTHON_URL = process.env.NEXT_PUBLIC_PYTHON_API_URL ?? "http://localhost:8001";
const JAVA_URL   = process.env.NEXT_PUBLIC_JAVA_API_URL   ?? "http://localhost:9090";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      // Python FastAPI — predictions, history, model info
      {
        source:      "/api/python/:path*",
        destination: `${PYTHON_URL}/:path*`,
      },
      // Java Spring Boot — market analysis, export
      {
        source:      "/api/java/:path*",
        destination: `${JAVA_URL}/:path*`,
      },
    ];
  },

  async headers() {
    return [
      {
        // Apply security headers to all routes
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options",    value: "nosniff" },
          { key: "X-Frame-Options",           value: "DENY" },
          { key: "X-XSS-Protection",          value: "1; mode=block" },
          { key: "Referrer-Policy",           value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
