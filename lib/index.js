/**
 * Host row of `@cu/dsh-cu`.
 *
 * Provides:
 *   - `ctx.cu`        — the agent-desktop executable wrapper (see ./backend.js)
 *   - `ctx.cuConfig`  — resolved settings (approval policy, allowlist, input mode)
 *
 * Owns two policy listeners over the tool pipeline:
 *   - `tools/pre-execute` — the approval gate: read-only tools pass; mutating
 *     `cu_*` tools are upgraded to an `ask` (the approval seam turns it into a
 *     user prompt; missing answerers fail closed). The listener runs after
 *     stricter upstream policies and only ever upgrades `allow`, so listener
 *     ordering can never re-permit a denial. It also enforces the app
 *     allowlist and the dangerous-app guard with a model-readable denial.
 *   - `tools/execute` — the audit log: one JSONL line per mutating call with
 *     the target (app / ref / text length only, never full text) and outcome.
 *
 * Config: the `cu` settings namespace (Web 设置页卡片可编辑), env fallback for
 * `CU_APPROVAL` / `CU_BIN` / `CU_TIMEOUT_MS`.
 *
 * @module @cu/dsh-cu
 */

import { appendFile, mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { CuBackend, CuBackendError, resolveBinary } from './backend.js'
import {
  cuConfigSchema, isAppAllowed, isDangerousApp, resolveCuConfig,
} from './config.js'
import { cuState } from './state.js'

export { CuBackend, CuBackendError, resolveBinary } from './backend.js'
export { DANGEROUS_APPS, cuConfigSchema, isAppAllowed, isDangerousApp, resolveCuConfig } from './config.js'
export { cuState } from './state.js'

/** Cordis plugin name. */
export const name = 'dsh-cu'

/** No host services are required. */
export const inject = []

/**
 * 插件配置 schema（0.2.x：由 cordis loader 收集，设置页据此自动生成表单，
 * 配置变更会重启本插件条目并携带新值重新 apply）。
 */
export const Config = cuConfigSchema

/** Tools whose execution changes desktop state and must be approved. */
const MUTATING_TOOLS = new Set([
  'cu_click', 'cu_type', 'cu_press', 'cu_set_value',
  'cu_scroll', 'cu_launch', 'cu_clipboard_set',
])

/** Human-readable action labels used in the approval prompt. */
const ACTION_LABELS = {
  cu_click: { en: 'click a desktop element', zh: '点击桌面元素' },
  cu_type: { en: 'type into a desktop field', zh: '在桌面输入框中输入文字' },
  cu_press: { en: 'send keyboard input to an app', zh: '向应用发送键盘输入' },
  cu_set_value: { en: 'set a desktop control value', zh: '直接设置桌面控件值' },
  cu_scroll: { en: 'scroll a desktop element', zh: '滚动桌面元素' },
  cu_launch: { en: 'launch a desktop application', zh: '启动桌面应用' },
  cu_clipboard_set: { en: 'write to the system clipboard', zh: '写入系统剪贴板' },
}

/** Audit log path (lazy-created directory). */
export const AUDIT_PATH = join(homedir(), '.dsh', 'cu', 'audit.jsonl')

/**
 * Mount the backend seam and the policy listeners.
 *
 * 0.2.x：配置由 `export const Config` 声明（设置页自动生成表单），配置变更
 * 时 loader 会重启本条目并以新值重新调用 apply，因此这里不订阅、直接快照。
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {Partial<import('./config.js').CuFlatConfig>} config - 解析后的用户配置。
 */
export async function apply(ctx, config = {}) {
  const backend = new CuBackend({
    timeoutMs: Number(process.env.CU_TIMEOUT_MS ?? 60_000),
  })
  ctx.provide('cu', backend)

  const settings = resolveCuConfig(config)
  ctx.provide('cuConfig', settings)

  /** Same-process session grants for the `session` approval policy. */
  const sessionGrants = new Set()

  /** The app a mutating call names, when its arguments carry one. */
  const appOf = (args) => {
    if (!args || typeof args !== 'object') return undefined
    return typeof args.app === 'string' && args.app.trim() !== '' ? args.app.trim() : undefined
  }

  ctx.effect(() => ctx.on('tools/pre-execute', async (exec, next) => {
    const decision = await next()
    if (decision.kind !== 'allow' || !MUTATING_TOOLS.has(exec.name)) return decision

    const app = appOf(exec.args)
    if (isDangerousApp(settings, app)) {
      return {
        kind: 'deny',
        reason: `cu: "${app}" 在危险应用名单中，插件拒绝操作（可在设置中了解范围）`,
        info: { name: 'cu', code: 'CU_DANGEROUS_APP' },
      }
    }
    if (!isAppAllowed(settings, app)) {
      return {
        kind: 'deny',
        reason: `cu: 应用 "${app}" 不在允许名单中。让用户在设置页把它加入允许的应用，或明确说明为何需要操作它`,
        info: { name: 'cu', code: 'CU_APP_NOT_ALLOWED' },
      }
    }
    if (cuState.isPaused()) {
      return {
        kind: 'deny',
        reason: `cu: 用户从浮条暂停了 computer use（剩余 ${Math.ceil(cuState.pausedForMs() / 1000)}s）。告知用户操作已暂停，等恢复后再继续，不要重试`,
        info: { name: 'cu', code: 'CU_PAUSED_BY_USER' },
      }
    }

    const agentKey = String(exec.agent?.id ?? exec.agent?.sessionId ?? 'default')
    if (settings.approvalPolicy === 'session' && sessionGrants.has(`${agentKey}:${exec.name}`)) {
      return { kind: 'allow' }
    }

    const label = ACTION_LABELS[exec.name] ?? { en: 'operate the desktop', zh: '操作桌面' }
    const target = app ? `（目标：${app}）` : ''
    return {
      kind: 'ask',
      reason: `Computer use: ${exec.name}${app ? ` → ${app}` : ''}`,
      displayReason: {
        en: `Allow the agent to ${label.en}${app ? ` in “${app}”` : ''}?`,
        zh: `允许 agent ${label.zh}${target}？`,
      },
    }
  }), 'cu-approval-gate')

  ctx.effect(() => ctx.on('tools/execute', async (exec, next) => {
    if (!MUTATING_TOOLS.has(exec.name)) return next()
    const started = Date.now()
    // 注意字段名：dispatch 视图上解析参数在 `arguments`（不是 `args`）。
    const args = exec.arguments && typeof exec.arguments === 'object' ? exec.arguments : {}
    let result
    // 浮条状态：标记「正在操作」，并把本次执行换成可中断信号
    //（tools/execute 瀑布允许 wrapper 只替换 exec.signal——契约内做法）。
    const running = cuState.begin(exec.name, args)
    try {
      const parent = exec.signal
      if (parent) {
        if (parent.aborted) running.ac.abort(parent.reason)
        else parent.addEventListener('abort', () => running.ac.abort(parent.reason), { once: true })
      }
      try {
        exec.signal = running.ac.signal
      } catch {
        // exec 冻结时退化为仅状态展示：停止按钮只影响后续调用
      }
      result = await next()
    } finally {
      cuState.end({
        ok: result ? result.isError === false : false,
        code: result?.error?.info?.code,
        ms: Date.now() - started,
      })
      // 会话级授权：只有真正执行过（ask 已被允许、未被取消/拒绝）才记 grant，
      // 同会话内同工具的后续调用在 pre-execute 里直接放行。
      if (settings.approvalPolicy === 'session' && result?.isError === false) {
        const agentKey = String(exec.agent?.id ?? exec.agent?.sessionId ?? 'default')
        sessionGrants.add(`${agentKey}:${exec.name}`)
      }
      const entry = {
        ts: new Date().toISOString(),
        tool: exec.name,
        app: appOf(args),
        ref: typeof args.ref === 'string' ? args.ref : undefined,
        text_len: typeof args.text === 'string' ? args.text.length
          : typeof args.value === 'string' ? args.value.length : undefined,
        combo: typeof args.combo === 'string' ? args.combo : undefined,
        policy: settings.approvalPolicy,
        ok: result ? result.isError === false : false,
        code: result?.error?.info?.code,
        ms: Date.now() - started,
        agent: exec.agent?.id ?? undefined,
      }
      void mkdir(join(homedir(), '.dsh', 'cu'), { recursive: true })
        .then(() => appendFile(AUDIT_PATH, `${JSON.stringify(entry)}\n`, 'utf8'))
        .catch(() => {})
    }
    return result
  }), 'cu-audit')
}
