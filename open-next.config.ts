import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Minimal config — this app is entirely client-side against GitHub's API,
// so no ISR, R2, or KV cache binding is required.
export default defineCloudflareConfig();
