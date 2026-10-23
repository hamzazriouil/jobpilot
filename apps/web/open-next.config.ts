import { defineCloudflareConfig } from '@opennextjs/cloudflare';

// Defaults are fine for v0 (no ISR / incremental cache yet).
// Add an R2 or KV incremental cache here if we start using revalidation.
export default defineCloudflareConfig({});
