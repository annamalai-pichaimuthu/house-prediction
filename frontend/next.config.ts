import type { NextConfig } from "next";

/**
 * Runtime environment variables are declared in .env.local (local dev) or
 * set directly in the deployment environment (production).
 *
 * Browser-exposed vars must be prefixed NEXT_PUBLIC_ — see .env.local:
 *   NEXT_PUBLIC_PYTHON_API_URL  — Python backend (predictions, history)
 *   NEXT_PUBLIC_JAVA_API_URL    — Java backend (market analysis, export)
 */
const nextConfig: NextConfig = {
  /* config options here */
};

export default nextConfig;
