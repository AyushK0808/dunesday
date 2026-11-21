import path from "node:path";
import { loadEnvConfig } from "@next/env";
import type { NextConfig } from "next";

// Also read the repo-root .env shared with the Python tracker.
// Values already set (web/.env*, Vercel env vars) take precedence.
loadEnvConfig(path.resolve(process.cwd(), ".."), process.env.NODE_ENV !== "production");

const nextConfig: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["mongodb", "nodemailer", "@next/env"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
