import { defineConfig } from "drizzle-kit";

/**
 * Used by `drizzle-kit generate` to produce SQL migrations under ./drizzle,
 * which `wrangler d1 migrations apply` then runs against D1.
 *
 * The `d1-http` credentials are only needed for `drizzle-kit push/pull/studio`
 * against a remote D1; plain `generate` does not require them.
 */
export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  driver: "d1-http",
  dbCredentials: {
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID ?? "",
    databaseId: process.env.CLOUDFLARE_DATABASE_ID ?? "",
    token: process.env.CLOUDFLARE_D1_TOKEN ?? "",
  },
});
