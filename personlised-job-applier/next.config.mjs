import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Standalone demo: pin the Turbopack root to THIS folder so Next 16 doesn't
  // walk up and infer a workspace root from a stray lockfile in ~/.
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
