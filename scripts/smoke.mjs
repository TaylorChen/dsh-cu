/**
 * Local smoke test: compiles every tool definition and checks the argv each
 * tool builds, without touching the desktop. Run with `node scripts/smoke.mjs`.
 */

import { apply } from '../lib/tool.js'

const calls = []
const definitions = []

const ctx = {
  effect(fn) {
    const dispose = fn()
    return () => dispose?.()
  },
  tools: {
    register(definition) {
      definitions.push(definition)
      return () => {}
    },
  },
  cu: {
    bin: '/fake/agent-desktop',
    async runOk(argv, options) {
      calls.push({ argv, stdin: options?.stdin })
      return { ok: true, data: { fake: true } }
    },
  },
}

apply(ctx)

const names = definitions.map(definition => definition.name).sort()
console.log(`tools (${names.length}): ${names.join(', ')}`)

const byName = Object.fromEntries(definitions.map(definition => [definition.name, definition]))
const expect = (condition, message) => {
  if (!condition) {
    console.error(`FAIL: ${message}`)
    process.exitCode = 1
  }
}

expect(names.length === 14, 'expected 14 tools')

// Snapshot: defaults on, flags order-independent.
await byName.cu_snapshot.execute({ app: 'Finder' }, { signal: undefined })
expect(calls.at(-1).argv.join(' ') === 'snapshot --app Finder --interactive-only --compact',
  `snapshot argv: ${calls.at(-1).argv.join(' ')}`)

await byName.cu_snapshot.execute({ app: 'Slack', skeleton: true, max_depth: 5, surface: 'window' }, {})
expect(calls.at(-1).argv.join(' ')
  === 'snapshot --app Slack --surface window --max-depth 5 --interactive-only --compact --skeleton',
`snapshot flags: ${calls.at(-1).argv.join(' ')}`)

// Text goes on stdin, never argv.
await byName.cu_type.execute({ ref: '@s1:e2', text: 'hello 你好' }, {})
expect(!calls.at(-1).argv.includes('hello 你好'), 'type text must not appear in argv')
expect(calls.at(-1).stdin === 'hello 你好', 'type text goes to stdin')

// Approval-gated tools still build the expected command.
await byName.cu_click.execute({ ref: '@s1:e3' }, {})
expect(calls.at(-1).argv.join(' ') === 'click @s1:e3', `click argv: ${calls.at(-1).argv.join(' ')}`)

await byName.cu_press.execute({ combo: 'cmd+s', app: 'TextEdit' }, {})
expect(calls.at(-1).argv.join(' ') === 'press cmd+s --app TextEdit', `press argv: ${calls.at(-1).argv.join(' ')}`)

// Screenshot defaults to a temp path and reports it.
const shot = await byName.cu_screenshot.execute({ app: 'Finder' }, {})
expect(typeof shot.path === 'string' && shot.path.endsWith('.png'), 'screenshot returns a path')

console.log(`argv checks: ${calls.length} calls`)
if (!process.exitCode) console.log('OK')
