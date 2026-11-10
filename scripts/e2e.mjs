/**
 * End-to-end check against the real agent-desktop binary. Needs Accessibility
 * permission for the host process; run outside a sandbox that blocks `ps`.
 */

import { CuBackend } from '../lib/backend.js'

const backend = new CuBackend({ timeoutMs: 30_000 })
console.log('bin:', backend.bin)

const check = async (label, fn) => {
  try {
    const value = await fn()
    console.log(`OK   ${label}:`, typeof value === 'string' ? value : JSON.stringify(value).slice(0, 160))
    return value
  } catch (error) {
    console.log(`FAIL ${label}:`, error.message.slice(0, 240))
    return undefined
  }
}

const status = await check('status', async () => {
  const envelope = await backend.runOk(['status'])
  return { platform: envelope.data.platform, version: envelope.data.version, permissions: envelope.data.permissions }
})

const apps = await check('list-apps', async () => {
  const envelope = await backend.runOk(['list-apps'])
  return { count: envelope.data.apps.length, first: envelope.data.apps.slice(0, 3).map(app => app.name) }
})

await check('list-windows', async () => {
  const envelope = await backend.runOk(['list-windows'])
  return { count: envelope.data.length, accessible: envelope.data.filter(w => w.accessible).length }
})

await check('snapshot ChatGPT', async () => {
  const envelope = await backend.runOk(['snapshot', '--app', 'ChatGPT', '--interactive-only', '--compact'])
  return { refs: envelope.data.ref_count, complete: envelope.data.complete, snapshot: envelope.data.snapshot_id }
})

if (status && apps) console.log('E2E OK')
else console.log('E2E PARTIAL')
