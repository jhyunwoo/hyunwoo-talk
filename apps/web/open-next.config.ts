import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Minimal config: the app has no ISR/on-demand revalidation, so the default
// (in-memory) incremental cache is sufficient — no R2 bucket required.
export default defineCloudflareConfig({});
