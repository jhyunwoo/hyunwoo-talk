import { nextJsConfig } from "@repo/eslint-config/next-js";

/** @type {import("eslint").Linter.Config[]} */
export default [
  // Ignore build output (Next, static export, and OpenNext/Cloudflare bundles).
  {
    ignores: [".next/**", "out/**", ".open-next/**", ".wrangler/**"],
  },
  ...nextJsConfig,
];
