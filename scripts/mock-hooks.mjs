/**
 * Module-resolution mock for host-row smoke tests: swaps `@deepseek-ai/dsh-settings`
 * (and optionally `@deepseek-ai/dsh-tools`) for in-file stubs so `lib/index.js`
 * can be exercised without a running cordis host.
 */
import { register } from 'node:module'

register(new URL('./mock-loader.mjs', import.meta.url))
