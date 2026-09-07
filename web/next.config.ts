import type { NextConfig } from "next";

/**
 * The FastAPI engine (eligibility, routing, corpus) runs separately on :8000.
 * Rewriting /api/* onto it means the browser only ever talks to one origin, so
 * there is no CORS layer to configure and no preflight on every call.
 */
const API_ORIGIN = process.env.AVSARATHI_API_ORIGIN ?? "http://127.0.0.1:8000";

const nextConfig: NextConfig = {
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_ORIGIN}/api/:path*` }];
  },

  // Chrome on this machine cannot reach the loopback interface (Windows
  // AppContainer network isolation), so the dev server is browsed over the
  // LAN address instead. Next treats that as a cross-origin dev request unless
  // it is named here.
  allowedDevOrigins: ["127.0.0.1", "localhost", "10.37.31.96", "172.25.128.1"],
};

export default nextConfig;
