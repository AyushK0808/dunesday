import "server-only";
import path from "node:path";
import { loadEnvConfig } from "@next/env";

// Local development: also read the repo-root .env shared with the Python tracker.
// In production the variables come from Vercel, so this does nothing.
if (process.env.NODE_ENV !== "production" && !process.env.MONGODB_URI) {
  loadEnvConfig(path.resolve(process.cwd(), ".."), true, { info() {}, error: console.error });
}
