/**
 * Browser half of `dsh-cu`: one `settings.plugins.tab` tab in the GUI's
 * Plugins settings section (0.2.x slot contract), rendering the Computer Use
 * form bound to the `dsh-cu` settings namespace through `ctx.configForms`.
 *
 * 关键约束（v1 踩过的坑）：**不要用 `inject: ['configForms']`**。客户端行
 * 若有任何服务等不到，整个 web boot 会以 "entry did not activate" 失败，
 * 应用直接起不来。这里改为 `ctx.get('configForms')` 自取：服务缺失时页签
 * 退化为说明卡，绝不阻塞启动。
 *
 * 本文件不导入任何其他插件的有值模块，运行时 require 仅 react。
 * @module @cu/dsh-cu/client
 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only：把 ctx.locale / ctx.slots / ctx.configForms 的类型拉进本程序。
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import { useSyncExternalStore, useState, useEffect, useRef } from 'react'
import { jsx } from 'react/jsx-runtime'
import { en, NS, zh, type CuKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'cu.settings': CuKey
  }
}

/** 只依赖 slots / locale（shell 必备）；配置表单服务按需自取。 */
export const inject = ['slots', 'locale']

/**
 * 配置表单的最小鸭子类型接口：只用到读、写、清空。
 * 不直接引用 ConfigForm 类型，避免跨版本契约漂移导致编译或运行失败。
 */
interface FormController {
  getSnapshot(): { status: string, value?: Record<string, unknown>, writable?: boolean }
  subscribe(listener: () => void): () => void
  set(field: string, value: unknown): Promise<unknown>
  unset(field: string): Promise<unknown>
}

/** 卡片可控字段。 */
const FIELDS = ['approvalPolicy', 'allowedApps', 'inputMode', 'auditEnabled', 'guardDangerous'] as const
type Field = typeof FIELDS[number]

/** 单个字段的展示状态：空串表示「回默认」。 */
interface FieldState {
  value: string | boolean | null
}

interface CardSnapshot {
  shell: {
    available: boolean
    writable: boolean
    dirty: boolean
    saving: boolean
    failed: boolean
  }
  fields: Record<Field, FieldState>
}

type Staged = { value: string | boolean | null }

/** 基于 configForms 控制器的扁平表单（写穿 + 读回）。 */
class CuFormController {
  private staged = new Map<Field, Staged>()
  private saving = false
  private failed = false
  private listeners = new Set<() => void>()
  private cached: CardSnapshot | null = null

  constructor(private readonly scope: FormController) {
    scope.subscribe(() => this.publish())
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  getSnapshot = (): CardSnapshot => {
    if (this.cached === null) this.cached = this.build()
    return this.cached
  }

  isReady(): boolean {
    return this.scope.getSnapshot().status === 'ready'
  }

  private publish(): void {
    this.cached = null
    for (const listener of this.listeners) listener()
  }

  private build(): CardSnapshot {
    const snapshot = this.scope.getSnapshot()
    const value = snapshot.value ?? {}
    const fields = {} as Record<Field, FieldState>
    for (const field of FIELDS) {
      const staged = this.staged.get(field)
      if (staged === undefined) {
        const current = value[field] as string | boolean | undefined
        fields[field] = { value: current === undefined ? '' : current }
        continue
      }
      fields[field] = { value: staged.value }
    }
    return {
      shell: {
        available: snapshot.status === 'ready',
        writable: snapshot.writable !== false,
        dirty: this.staged.size > 0,
        saving: this.saving,
        failed: this.failed,
      },
      fields,
    }
  }

  editText(field: Field, text: string): void {
    this.staged.set(field, { value: text })
    this.publish()
  }

  stageValue(field: Field, value: string | boolean | null): void {
    this.staged.set(field, { value })
    this.publish()
  }

  discard(): void {
    if (this.staged.size === 0 && !this.failed) return
    this.staged.clear()
    this.failed = false
    this.publish()
  }

  async save(): Promise<void> {
    const current = this.scope.getSnapshot().value ?? {}
    const writes: Array<() => Promise<unknown>> = []
    for (const [field, staged] of this.staged) {
      if (typeof staged.value === 'boolean') {
        if (current[field] !== staged.value) writes.push(() => this.scope.set(field, staged.value as boolean))
        continue
      }
      const text = typeof staged.value === 'string' ? staged.value.trim() : ''
      if (text === '') {
        if (current[field] !== undefined && current[field] !== '') writes.push(() => this.scope.unset(field))
        continue
      }
      if (text === String(current[field] ?? '')) continue
      writes.push(() => this.scope.set(field, text))
    }
    if (writes.length === 0 || this.saving) return
    this.saving = true
    this.failed = false
    this.publish()
    let landed = true
    for (const write of writes) {
      try {
        await write()
      } catch {
        landed = false
      }
    }
    if (landed) this.staged.clear()
    this.saving = false
    this.failed = !landed
    this.publish()
  }
}

const css = `
.cu-tab{box-sizing:border-box;max-width:760px;padding:4px 0 24px;color:var(--dsw-alias-label-primary);font-size:13px;line-height:1.55}
.cu-tab h3{margin:0 0 4px;font-size:15px;font-weight:600;letter-spacing:-0.01em}
.cu-tab-desc{margin:0 0 18px;color:var(--dsw-alias-label-tertiary);font-size:13px}
.cu-tab-sec{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:12px;padding:14px 16px;margin-bottom:14px}
.cu-tab-legend{margin:0 0 10px;color:var(--dsw-alias-label-secondary);font-size:12px;font-weight:600}
.cu-tab-row{display:flex;align-items:flex-start;gap:10px;padding:5px 0}
.cu-tab-label{flex:none;width:96px;padding-top:2px;color:var(--dsw-alias-label-primary);font-size:13px}
.cu-tab-options{flex:1;min-width:0;display:flex;flex-direction:column;gap:8px}
.cu-tab-option{display:flex;align-items:flex-start;gap:8px;font-size:12px;color:var(--dsw-alias-label-secondary);cursor:pointer}
.cu-tab-option input{accent-color:var(--dsw-alias-brand-primary);margin:2px 0 0}
.cu-tab-option b{font-weight:500;color:var(--dsw-alias-label-primary)}
.cu-tab-hint{display:block;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:1.5}
.cu-tab-input{flex:1;min-width:0;box-sizing:border-box;font:inherit;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:6px 10px;font-size:13px;line-height:20px}
.cu-tab-input:focus{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-1px}
.cu-tab-footer{display:flex;justify-content:flex-end;align-items:center;gap:8px;padding-top:4px}
.cu-tab-failed{flex:1;margin:0;color:var(--dsw-alias-label-error);font-size:12px}
.cu-tab-btn{appearance:none;font:inherit;cursor:pointer;border:1px solid transparent;border-radius:8px;padding:5px 14px;font-size:13px;line-height:1.5}
.cu-tab-btn:disabled{opacity:.4;cursor:default}
.cu-tab-discard{border-color:var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);background:0 0}
.cu-tab-save{background:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-layer-3)}
.cu-tab-fallback{border:1px dashed var(--dsw-alias-border-l2);border-radius:12px;padding:16px;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:1.7}
.cu-tab-pending{margin-left:8px;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary);border-radius:999px;padding:1px 8px;font-size:11px;font-weight:500}
`
const tagId = 'dsh-cu/CuTab.css'
if (typeof document !== 'undefined' && document.querySelector(`style[data-plugin-css="${tagId}"]`) === null) {
  const tag = document.createElement('style')
  tag.dataset.plugin = 'dsh-cu'
  tag.dataset.pluginCss = tagId
  tag.textContent = css
  document.head.appendChild(tag)
}

function RadioOption(props: {
  name: string
  value: string
  checked: boolean
  disabled: boolean
  title: string
  hint: string
  onPick: () => void
}): JSX.Element {
  const { name, value, checked, disabled, title, hint, onPick } = props
  return jsx('label', {
    className: 'cu-tab-option',
    children: [
      jsx('input', { type: 'radio', name, value, checked, disabled, onChange: onPick }),
      jsx('span', {
        children: [
          jsx('b', { children: title }),
          hint ? jsx('span', { className: 'cu-tab-hint', children: hint }) : null,
        ],
      }),
    ],
  })
}

function CheckRow(props: {
  field: Field
  checked: boolean
  disabled: boolean
  title: string
  hint: string
  onToggle: (next: boolean) => void
}): JSX.Element {
  const { field, checked, disabled, title, hint, onToggle } = props
  return jsx('label', {
    className: 'cu-tab-option',
    htmlFor: `cu-field-${field}`,
    children: [
      jsx('input', {
        id: `cu-field-${field}`,
        type: 'checkbox',
        checked,
        disabled,
        onChange: (event: { target: { checked: boolean } }) => onToggle(event.target.checked),
      }),
      jsx('span', {
        children: [
          jsx('b', { children: title }),
          jsx('span', { className: 'cu-tab-hint', children: hint }),
        ],
      }),
    ],
  })
}

function CuTab(props: {
  controller: CuFormController | undefined
  t: (key: CuKey) => string
}): JSX.Element {
  const { controller, t } = props
  if (controller === undefined) {
    return jsx('div', {
      className: 'cu-tab',
      children: jsx('div', {
        className: 'cu-tab-fallback',
        children: [
          jsx('h3', { children: 'Computer Use' }),
          jsx('p', { children: t('desc') }),
          jsx('p', {
            children: '当前客户端未提供配置表单服务（configForms），因此这里不能编辑配置。'
              + '插件本体不受影响：在会话里运行 cu_doctor 可查看引擎与权限状态，'
              + '配置可通过环境变量 CU_APPROVAL / CU_BIN 调整。',
          }),
        ],
      }),
    })
  }

  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot)
  const { available, writable, dirty, saving, failed } = snapshot.shell
  if (!available) {
    return jsx('div', {
      className: 'cu-tab',
      children: jsx('div', {
        className: 'cu-tab-fallback',
        children: [
          jsx('h3', { children: 'Computer Use' }),
          jsx('p', { children: t('desc') }),
          jsx('p', { children: '设置命名空间尚未就绪（Host 未暴露 dsh-cu 条目）。插件工具在会话中仍然可用。' }),
        ],
      }),
    })
  }
  const disabled = !writable || saving
  const policy = snapshot.fields.approvalPolicy
  const mode = snapshot.fields.inputMode

  return jsx('div', {
    className: 'cu-tab',
    children: [
      jsx('h3', {
        children: [
          'Computer Use',
          dirty ? jsx('span', { className: 'cu-tab-pending', children: t('unsaved') }) : null,
        ],
      }),
      jsx('p', { className: 'cu-tab-desc', children: t('desc') }),

      jsx('div', {
        className: 'cu-tab-sec',
        children: [
          jsx('p', { className: 'cu-tab-legend', children: t('groupApproval') }),
          jsx('div', {
            className: 'cu-tab-row',
            children: [
              jsx('span', { className: 'cu-tab-label', children: t('policy') }),
              jsx('div', {
                className: 'cu-tab-options',
                children: [
                  jsx(RadioOption, {
                    key: 'ask',
                    name: 'cu-policy',
                    value: 'ask',
                    checked: policy.value !== 'session',
                    disabled,
                    title: t('policyAsk'),
                    hint: '',
                    onPick: () => controller.stageValue('approvalPolicy', 'ask'),
                  }),
                  jsx(RadioOption, {
                    key: 'session',
                    name: 'cu-policy',
                    value: 'session',
                    checked: policy.value === 'session',
                    disabled,
                    title: t('policySession'),
                    hint: '',
                    onPick: () => controller.stageValue('approvalPolicy', 'session'),
                  }),
                ],
              }),
            ],
          }),
        ],
      }),

      jsx('div', {
        className: 'cu-tab-sec',
        children: [
          jsx('p', { className: 'cu-tab-legend', children: t('groupApps') }),
          jsx('div', {
            className: 'cu-tab-row',
            children: [
              jsx('label', { className: 'cu-tab-label', htmlFor: 'cu-field-allowedApps', children: t('apps') }),
              jsx('input', {
                id: 'cu-field-allowedApps',
                className: 'cu-tab-input',
                type: 'text',
                value: String(snapshot.fields.allowedApps.value ?? ''),
                placeholder: t('appsHint'),
                disabled,
                onChange: (event: { target: { value: string } }) => controller.editText('allowedApps', event.target.value),
              }),
            ],
          }),
          jsx('div', {
            className: 'cu-tab-row',
            children: [
              jsx('span', { className: 'cu-tab-label', children: t('inputMode') }),
              jsx('div', {
                className: 'cu-tab-options',
                children: [
                  jsx(RadioOption, {
                    key: 'semantic',
                    name: 'cu-mode',
                    value: 'semantic',
                    checked: mode.value !== 'headed',
                    disabled,
                    title: t('inputModeSemantic'),
                    hint: t('inputModeSemanticHint'),
                    onPick: () => controller.stageValue('inputMode', 'semantic'),
                  }),
                  jsx(RadioOption, {
                    key: 'headed',
                    name: 'cu-mode',
                    value: 'headed',
                    checked: mode.value === 'headed',
                    disabled,
                    title: t('inputModeHeaded'),
                    hint: t('inputModeHeadedHint'),
                    onPick: () => controller.stageValue('inputMode', 'headed'),
                  }),
                ],
              }),
            ],
          }),
        ],
      }),

      jsx('div', {
        className: 'cu-tab-sec',
        children: [
          jsx('p', { className: 'cu-tab-legend', children: t('groupAudit') }),
          jsx(CheckRow, {
            field: 'auditEnabled',
            checked: snapshot.fields.auditEnabled.value === true,
            disabled,
            title: t('audit'),
            hint: t('auditHint'),
            onToggle: (next: boolean) => controller.stageValue('auditEnabled', next),
          }),
          jsx(CheckRow, {
            field: 'guardDangerous',
            checked: snapshot.fields.guardDangerous.value === true,
            disabled,
            title: t('guard'),
            hint: t('guardHint'),
            onToggle: (next: boolean) => controller.stageValue('guardDangerous', next),
          }),
        ],
      }),

      jsx('div', {
        className: 'cu-tab-footer',
        children: [
          failed ? jsx('p', { className: 'cu-tab-failed', children: t('failed') }) : null,
          jsx('button', {
            type: 'button',
            className: 'cu-tab-btn cu-tab-discard',
            disabled: !dirty || saving,
            onClick: () => controller.discard(),
            children: t('discard'),
          }),
          jsx('button', {
            type: 'button',
            className: 'cu-tab-btn cu-tab-save',
            disabled: !dirty || saving,
            onClick: () => {
              void controller.save()
            },
            children: t('save'),
          }),
        ],
      }),
    ],
  })
}

/** `/api/cu/status` 的响应形状（与 lib/state.js 的 snapshot 对齐）。 */
interface CuStatusSnapshot {
  current: { tool: string, app?: string, ref?: string, startedAt: number } | null
  currentElapsedMs: number
  pausedForMs: number
  ops: Array<{ ts: string, tool: string, app?: string, ref?: string, status: string, ok: boolean, ms: number }>
}

const BAR_CSS = `
.cu-bar{display:flex;align-items:center;gap:12px;background:var(--dsw-alias-label-primary,#1b1a17);color:var(--dsw-alias-bg-layer-3,#f6f4ef);border-radius:12px;padding:9px 12px;font-size:12px;line-height:1.4;box-shadow:0 6px 20px rgba(0,0,0,.18);margin:0 0 8px}
.cu-bar-dot{width:7px;height:7px;border-radius:50%;background:#e5484d;flex:none;animation:cublink 1.2s ease-in-out infinite}
@keyframes cublink{0%,100%{opacity:1}50%{opacity:.35}}
.cu-bar-dot.paused{background:#f2a33c;animation:none}
.cu-bar-title{font-weight:600;white-space:nowrap}
.cu-bar-meta{font-family:'JetBrains Mono',ui-monospace,monospace;font-size:10.5px;opacity:.72;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.cu-bar-btns{margin-left:auto;display:flex;gap:6px;flex:none}
.cu-bar-btn{appearance:none;font:inherit;font-size:11px;padding:4px 10px;border-radius:7px;border:1px solid rgba(255,255,255,.28);background:rgba(255,255,255,.08);color:inherit;cursor:pointer;white-space:nowrap}
.cu-bar-btn:hover{background:rgba(255,255,255,.16)}
.cu-bar-btn.stop{border-color:rgba(255,255,255,.6);background:rgba(255,255,255,.14);font-weight:600}
.cu-bar-recent{opacity:.72;font-size:10.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
`
if (typeof document !== 'undefined' && document.querySelector('style[data-plugin-css="dsh-cu/CuBar.css"]') === null) {
  const tag = document.createElement('style')
  tag.dataset.plugin = 'dsh-cu'
  tag.dataset.pluginCss = 'dsh-cu/CuBar.css'
  tag.textContent = BAR_CSS
  document.head.appendChild(tag)
}

function formatMs(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000))
  return total >= 60 ? `${Math.floor(total / 60)}m${String(total % 60).padStart(2, '0')}s` : `${total}s`
}

/** 轮询 /api/cu/status；路由行缺席时 online=false。 */
function useCuStatus(): { snap: CuStatusSnapshot | undefined, online: boolean } {
  const [state, setState] = useState<{ snap: CuStatusSnapshot | undefined, online: boolean }>({ snap: undefined, online: false })
  useEffect(() => {
    let stopped = false
    const tick = async (): Promise<void> => {
      try {
        const res = await fetch('/api/cu/status', { cache: 'no-store' })
        if (!res.ok) throw new Error(String(res.status))
        const snap = (await res.json()) as CuStatusSnapshot
        if (!stopped) setState({ snap, online: true })
      } catch {
        if (!stopped) setState((prev) => (prev.online ? { snap: prev.snap, online: false } : prev))
      }
    }
    void tick()
    const timer = setInterval(() => {
      void tick()
    }, 1000)
    return () => {
      stopped = true
      clearInterval(timer)
    }
  }, [])
  return state
}

async function postCu(path: string): Promise<void> {
  try {
    await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    })
  } catch {
    // 浮条按钮失败不打断聊天；状态会在下个轮询周期反映
  }
}

/** 运行控制浮条：agent 操作桌面时的实时状态与紧急控制。 */
function CuStatusBarDock(): JSX.Element | null {
  const { snap, online } = useCuStatus()
  if (!online || snap === undefined) return null
  const current = snap.current
  const paused = snap.pausedForMs > 0
  const last = snap.ops[snap.ops.length - 1]
  const lastAge = last ? Date.now() - Date.parse(last.ts) : Number.POSITIVE_INFINITY
  if (!current && !paused && lastAge > 20_000) return null

  const recent = snap.ops.slice(-3).reverse()
    .map((op) => `${op.tool.replace(/^cu_/, '')}${op.status === 'aborted' ? '·停' : op.ok ? '' : '·败'} ${formatMs(op.ms)}`)
    .join('  ')

  return jsx('div', {
    className: 'cu-bar',
    children: [
      jsx('span', { className: `cu-bar-dot${paused ? ' paused' : ''}`, 'aria-hidden': 'true' }),
      jsx('span', { className: 'cu-bar-title', children: paused ? '已暂停' : '正在操作桌面' }),
      jsx('span', {
        className: 'cu-bar-meta',
        children: current
          ? `${current.app ?? '当前桌面'} · ${current.tool.replace(/^cu_/, '')}${current.ref ? ` · ${current.ref}` : ''} · ${formatMs(snap.currentElapsedMs)}`
          : recent || '等待操作',
      }),
      jsx('span', {
        className: 'cu-bar-recent',
        children: current && recent ? `上次：${recent}` : '',
      }),
      jsx('span', {
        className: 'cu-bar-btns',
        children: paused
          ? jsx('button', {
              type: 'button',
              className: 'cu-bar-btn',
              onClick: () => {
                void postCu('/api/cu/resume')
              },
              children: '恢复',
            })
          : [
              jsx('button', {
                key: 'pause',
                type: 'button',
                className: 'cu-bar-btn',
                title: '暂停 60 秒：期间拒绝新的写操作',
                onClick: () => {
                  void postCu('/api/cu/stop')
                },
                children: '暂停',
              }),
              jsx('button', {
                key: 'stop',
                type: 'button',
                className: 'cu-bar-btn stop',
                title: '中断当前操作，并暂停 60 秒',
                onClick: () => {
                  void postCu('/api/cu/stop')
                },
                children: '停止',
              }),
            ],
      }),
    ],
  })
}

/**
 * 客户端插件入口：注册文案 + 挂设置页签 + 挂运行控制浮条。
 * @param ctx - 客户端根上下文。
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'cu-settings: dictionaries')
  const t = ctx.locale.bind(NS)

  // 运行控制条：composer 下方的常驻条目（conversation.input.dock 列表插槽）。
  // 轮询 /api/cu/status；路由行缺席（headless / 未挂载）时 fetch 404 → 静默不渲染。
  ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
    name: 'conversation.input.dock',
    id: 'dsh-cu-bar',
    order: 10,
  }, CuStatusBarDock))

  // 自取服务：任何情况下都不让客户端行停在 pending（pending 会拖垮 web boot）。
  const configForms = (ctx as unknown as { get?: (name: string) => unknown }).get?.('configForms') as
    { get: (entryId: string) => FormController } | undefined
  let controller: CuFormController | undefined
  try {
    if (configForms && typeof configForms.get === 'function') {
      controller = new CuFormController(configForms.get('dsh-cu'))
    }
  } catch {
    controller = undefined
  }

  ctx.slots.inject('settings.plugins.tab', () => ctx.slots.register({
    name: 'settings.plugins.tab',
    id: 'dsh-cu',
    order: 50,
    label: () => 'Computer Use',
    inject: () => ({ controller, t }),
  }, CuTab))
}
