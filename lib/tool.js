/**
 * Model-facing half of `@cu/dsh-cu`: the `cu_*` tool surface.
 *
 * Every tool is a thin, schema-checked wrapper over one `agent-desktop` command.
 * The observe → act → verify loop lives in the agent: snapshot returns a tree
 * with `@<snapshot_id>:eN` refs, actions consume those refs, and the next
 * snapshot verifies the result. Mutating tools are gated by the host row's
 * approval listener; they are exclusive by default because desktop state is
 * shared.
 *
 * @module @cu/dsh-cu/tool
 */

import { defineTool } from '@deepseek-ai/dsh-tools'

/** Cordis plugin name. */
export const name = 'dsh-cu-tool'

/** The backend seam, the resolved settings (input-mode default), and the tool registry. */
export const inject = ['tools', 'cu', 'cuConfig']

/** Compact text rendering for every `cu_*` result. */
function render(value) {
  return [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value) }]
}

/** Canonical output declaration shared by every tool in this module. */
const output = {
  schema: { type: 'json' },
  render: (_args, value) => render(value),
}

/** Flags shared by commands that accept a target surface. */
const target = {
  app: {
    type: 'string',
    description: 'Application display name (from cu_apps), bundle ID, or executable name.',
  },
  window_id: {
    type: 'string',
    description: 'Window id from cu_windows (e.g. w-4521). Use it when several windows of one app are open.',
  },
}

/** Loop guidance embedded in the tool descriptions (mirrors agent-desktop's own skill). */
const LOOP = 'Loop: cu_snapshot → act on a ref → cu_snapshot again to verify. '
  + 'Refs belong to their snapshot (@<snapshot_id>:eN); a stale or cross-window ref is refused, '
  + 'so take a fresh snapshot instead of retrying blindly. For dense apps use skeleton=True first, '
  + 'then drill with root=<ref>. Retry a failed call only when its error says retry is safe.'

/**
 * Register the tool surface.
 * @param {import('@deepseek-ai/cordis').Context} ctx
 */
export function apply(ctx) {
  /** Register one tool and tie its lifetime to this row. */
  const tool = (definition) => ctx.effect(() => ctx.tools.register(definition))

  /** Run one CLI command, returning its `data` field. */
  const run = (args, options) => ctx.cu.runOk(args, options).then(envelope => envelope.data)

  /** Global input mode from settings (`semantic` | `headed`); per-call flag wins. */
  const headed = (flag) => flag ?? (ctx.cuConfig?.inputMode === 'headed')

  tool(defineTool({
    name: 'cu_doctor',
    description:
      'Check whether desktop computer use is ready on this machine: platform, accessibility / '
      + 'screen-recording permissions, supported surfaces, and backend version. '
      + 'Call this first when any cu_* tool fails with a permission error.',
    parameters: {},
    output,
    timeoutMs: 30_000,
    async execute(_args, exec) {
      const status = await ctx.cu.runOk(['status'], { signal: exec.signal })
      let permissions = status.data?.permissions
      try {
        permissions = (await ctx.cu.runOk(['permissions'], { signal: exec.signal })).data
      } catch {
        // status already carries a usable permission snapshot
      }
      return {
        ok: true,
        platform: status.data?.platform,
        version: status.data?.version,
        permissions,
        supported_surfaces: status.data?.supported_surfaces,
        bin: ctx.cu.bin,
        approval_gate: (process.env.CU_APPROVAL ?? 'on').toLowerCase() !== 'off',
      }
    },
  }))

  tool(defineTool({
    name: 'cu_apps',
    description:
      'List running desktop applications with name, bundle_id, pid, and presentation '
      + '(foreground/background). Use the exact name for cu_snapshot / cu_windows.',
    parameters: {
      query: { type: 'string', description: 'Optional case-insensitive substring filter on name or bundle_id.' },
    },
    output,
    timeoutMs: 30_000,
    async execute(args, exec) {
      const data = await run(['list-apps'], { signal: exec.signal })
      const apps = Array.isArray(data?.apps) ? data.apps : []
      if (!args.query) return apps
      const q = args.query.toLowerCase()
      return apps.filter(app =>
        String(app.name ?? '').toLowerCase().includes(q)
        || String(app.bundle_id ?? '').toLowerCase().includes(q))
    },
  }))

  tool(defineTool({
    name: 'cu_windows',
    description:
      'List desktop windows with id, title, app_name, bounds, focus and accessibility status. '
      + 'Use the returned window id when an app has several windows, or accessible=false to know '
      + 'an app exposes no accessibility tree (fall back to cu_screenshot).',
    parameters: {
      app: target.app,
    },
    output,
    timeoutMs: 30_000,
    async execute(args, exec) {
      const argv = ['list-windows']
      if (args.app) argv.push('--app', args.app)
      return await run(argv, { signal: exec.signal })
    },
  }))

  tool(defineTool({
    name: 'cu_snapshot',
    description:
      'Capture the accessibility tree of an app window as structured JSON with a ref for every '
      + 'actionable element. This is the primary way to see a desktop app — prefer it over screenshots. '
      + `interactive_only keeps only actionable nodes; skeleton gives a shallow map with children_count; `
      + `root drills into one subtree with the same snapshot id. ${LOOP}`,
    parameters: {
      ...target,
      surface: {
        type: 'string',
        description: 'Surface to snapshot (default window). Use menubar for File/Edit menus, dock, '
          + 'menu-bar-extras, sheet, popover, alert, or focused.',
      },
      interactive_only: { type: 'boolean', description: 'Keep only interactive elements (default true).' },
      compact: { type: 'boolean', description: 'Collapse single-child unnamed nodes (default true).' },
      skeleton: { type: 'boolean', description: 'Shallow overview with children_count on cut branches.' },
      root: { type: 'string', description: 'Ref to start traversal from (drill into one region).' },
      max_depth: { type: 'integer', description: 'Maximum tree depth (default 10).' },
      timeout_ms: { type: 'integer', description: 'Observation deadline in ms (default 3000; raise for slow Chromium).' },
    },
    output,
    timeoutMs: 90_000,
    async execute(args, exec) {
      const argv = ['snapshot']
      if (args.app) argv.push('--app', args.app)
      if (args.window_id) argv.push('--window-id', args.window_id)
      if (args.surface) argv.push('--surface', args.surface)
      if (args.root) argv.push('--root', args.root)
      if (args.max_depth !== undefined) argv.push('--max-depth', String(args.max_depth))
      if (args.timeout_ms !== undefined) argv.push('--timeout-ms', String(args.timeout_ms))
      if (args.interactive_only !== false) argv.push('--interactive-only')
      if (args.compact !== false) argv.push('--compact')
      if (args.skeleton) argv.push('--skeleton')
      return await run(argv, { signal: exec.signal })
    },
  }))

  tool(defineTool({
    name: 'cu_find',
    description:
      'Search one app for elements by role and/or accessible name, returning matching refs. '
      + 'Cheaper than a full snapshot when you already know what you are looking for.',
    parameters: {
      ...target,
      role: { type: 'string', description: 'Accessibility role, e.g. button, textfield, checkbox, menuitem.' },
      name: { type: 'string', description: 'Accessible name or label to match.' },
      timeout_ms: { type: 'integer', description: 'Observation deadline in ms (default 3000; raise to 10000+ for huge trees like Notes).' },
    },
    output,
    timeoutMs: 120_000,
    async execute(args, exec) {
      const argv = ['find']
      if (args.app) argv.push('--app', args.app)
      if (args.window_id) argv.push('--window-id', args.window_id)
      if (args.role) argv.push('--role', args.role)
      if (args.name) argv.push('--name', args.name)
      if (args.timeout_ms !== undefined) argv.push('--timeout-ms', String(args.timeout_ms))
      return await run(argv, { signal: exec.signal })
    },
  }))

  tool(defineTool({
    name: 'cu_click',
    description:
      'Click an element by ref from the latest cu_snapshot of the same window. Uses the '
      + 'accessibility press action by default (no pointer movement); headed=true switches to '
      + 'physical input. Requires user approval. Verify with a new snapshot afterwards.',
    parameters: {
      ref: { type: 'string', description: 'Qualified ref, e.g. @ssaqt4lkwetch:e12.', required: true },
      headed: { type: 'boolean', description: 'Use physical input and pointer/focus side effects.' },
    },
    output,
    timeoutMs: 60_000,
    async execute(args, exec) {
      const argv = ['click', args.ref]
      if (headed(args.headed)) argv.push('--headed')
      return await run(argv, { signal: exec.signal })
    },
  }))

  tool(defineTool({
    name: 'cu_type',
    description:
      'Type text into a text field identified by ref. Text is piped on stdin, so it never appears '
      + 'in process arguments. submit=true presses Return afterwards. Requires user approval. '
      + 'Verify by reading the field value or taking a new snapshot.',
    parameters: {
      ref: { type: 'string', description: 'Qualified ref of the text field.', required: true },
      text: { type: 'string', description: 'Text to insert. Use the clipboard tools for very long text.', required: true },
      submit: { type: 'boolean', description: 'Press Return after typing.' },
      headed: { type: 'boolean', description: 'Use physical input instead of semantic delivery.' },
    },
    output,
    timeoutMs: 120_000,
    async execute(args, exec) {
      const argv = ['type', args.ref, '--stdin']
      if (headed(args.headed)) argv.push('--headed')
      await run(argv, { stdin: args.text, signal: exec.signal })
      if (!args.submit) return { ok: true, typed: args.text.length }
      await run(['press', 'return'], { signal: exec.signal })
      return { ok: true, typed: args.text.length, submitted: true }
    },
  }))

  tool(defineTool({
    name: 'cu_press',
    description:
      'Send a keyboard combo, e.g. return, escape, cmd+c, shift+tab. With app set, keys go to that '
      + "app's process without focusing it. Quit shortcuts (cmd+q) are policy-denied unless forced. "
      + 'Requires user approval.',
    parameters: {
      combo: { type: 'string', description: 'Key combo such as return, escape, cmd+s, cmd+shift+t.', required: true },
      ...target,
      force: { type: 'boolean', description: 'Permit policy-denied shortcuts such as cmd+q. Use with care.' },
    },
    output,
    timeoutMs: 60_000,
    async execute(args, exec) {
      const argv = ['press', args.combo]
      if (args.app) argv.push('--app', args.app)
      if (args.window_id) argv.push('--window-id', args.window_id)
      if (args.force) argv.push('--force')
      return await run(argv, { signal: exec.signal })
    },
  }))

  tool(defineTool({
    name: 'cu_set_value',
    description:
      'Set an editable control value directly through the accessibility attribute, with the CLI '
      + 'reading it back for verification. Prefer it over typing when the element exposes AXValue. '
      + 'Requires user approval.',
    parameters: {
      ref: { type: 'string', description: 'Qualified ref of the editable element.', required: true },
      value: { type: 'string', description: 'New value; piped on stdin.', required: true },
    },
    output,
    timeoutMs: 60_000,
    async execute(args, exec) {
      return await run(['set-value', args.ref, '--stdin'], {
        stdin: args.value,
        signal: exec.signal,
      })
    },
  }))

  tool(defineTool({
    name: 'cu_scroll',
    description: 'Scroll an element by ref. Requires user approval; verify with a new snapshot.',
    parameters: {
      ref: { type: 'string', description: 'Qualified ref of the scrollable element.', required: true },
      direction: {
        type: 'string',
        description: 'Scroll direction.',
        enum: ['up', 'down', 'left', 'right'],
      },
      amount: { type: 'integer', description: 'Number of scroll units (default 3).' },
    },
    output,
    timeoutMs: 60_000,
    async execute(args, exec) {
      const argv = ['scroll', args.ref]
      if (args.direction) argv.push('--direction', args.direction)
      if (args.amount !== undefined) argv.push('--amount', String(args.amount))
      return await run(argv, { signal: exec.signal })
    },
  }))

  tool(defineTool({
    name: 'cu_launch',
    description:
      'Launch an application (name or bundle ID). activate=true waits for a window to appear and '
      + 'focuses it. Requires user approval.',
    parameters: {
      app: { type: 'string', description: 'Application name or bundle ID, e.g. com.apple.TextEdit.', required: true },
      activate: { type: 'boolean', description: 'Wait for a window and activate the app.' },
      timeout: { type: 'integer', description: 'Upper bound in ms for the launch (default 30000).' },
    },
    output,
    timeoutMs: 90_000,
    async execute(args, exec) {
      const argv = ['launch', args.app]
      if (args.activate) argv.push('--activate')
      if (args.timeout !== undefined) argv.push('--timeout', String(args.timeout))
      try {
        return await run(argv, { signal: exec.signal })
      } catch (error) {
        // 已运行的应用可能无法被 NSWorkspace 再次 launch（edge case）：
        // 退化为把它的首个可见窗口带到前台（等价于激活）。
        const code = error?.code ?? ''
        if (code !== 'APP_NOT_FOUND' && code !== 'CU_COMMAND_FAILED') throw error
        const windows = await run(['list-windows', '--app', args.app], { signal: exec.signal })
        const first = Array.isArray(windows) ? windows.find(w => w.visible !== false) ?? windows[0] : undefined
        if (!first) throw error
        const focused = await run(['focus-window', '--window-id', String(first.id)], { signal: exec.signal })
        return { ...focused, app: args.app, activated: 'focused-running-window', window: first }
      }
    },
  }))

  tool(defineTool({
    name: 'cu_screenshot',
    description:
      'Save a PNG screenshot of an app window and return its local path. Use only when an app has '
      + 'no usable accessibility tree (accessible=false in cu_windows) or for visual verification. '
      + 'Prefer cu_snapshot: screenshots cost far more tokens and are less precise.',
    parameters: {
      ...target,
      path: { type: 'string', description: 'Destination PNG path; defaults to a temp file.' },
    },
    output,
    timeoutMs: 60_000,
    async execute(args, exec) {
      const dest = args.path ?? `/tmp/cu-shot-${Date.now()}.png`
      const argv = ['screenshot', dest]
      if (args.app) argv.push('--app', args.app)
      if (args.window_id) argv.push('--window-id', args.window_id)
      const data = await run(argv, { signal: exec.signal })
      return { ...data, path: dest }
    },
  }))

  tool(defineTool({
    name: 'cu_clipboard_get',
    description: 'Read the current system clipboard text. Useful to capture what an app copied.',
    parameters: {},
    output,
    timeoutMs: 30_000,
    async execute(_args, exec) {
      return await run(['clipboard-get'], { signal: exec.signal })
    },
  }))

  tool(defineTool({
    name: 'cu_clipboard_set',
    description:
      'Write text to the system clipboard (piped on stdin). This is the reliable path for long text '
      + 'or non-ASCII input: set the clipboard, then cu_press cmd+v. Requires user approval.',
    parameters: {
      text: { type: 'string', description: 'Text to place on the clipboard.', required: true },
    },
    output,
    timeoutMs: 30_000,
    async execute(args, exec) {
      return await run(['clipboard-set', '--stdin'], {
        stdin: args.text,
        signal: exec.signal,
      })
    },
  }))
}
