/**
 * Host-row smoke test: mounts `lib/index.js` against a fake cordis context
 * (module stubs via mock-hooks.mjs) and walks the approval gate through its
 * decisions: ask → deny (dangerous) → deny (allowlist) → session grant.
 */

import assert from 'node:assert/strict'
import '../scripts/mock-hooks.mjs'
// 动态导入：resolve hook 注册于 mock-hooks 的求值期，静态 import 会被提前解析。
const { apply } = await import('../lib/index.js')

/**
 * 挂载一次插件（0.2.x 模型：配置走 apply 第二参），
 * 返回捕获的监听器与 provide 结果。
 */
async function mount(config = {}) {
  const provided = {}
  const listeners = {}
  const ctx = {
    provide(key, value) {
      provided[key] = value
    },
    on(event, fn) {
      (listeners[event] ??= []).push(fn)
      return () => {}
    },
    effect(fn) {
      const dispose = fn()
      return typeof dispose === 'function' ? dispose : () => {}
    },
  }
  await apply(ctx, config)
  assert.ok(provided.cu, 'ctx.cu provided')
  assert.ok(provided.cuConfig, 'ctx.cuConfig provided')
  return {
    provided,
    pre: listeners['tools/pre-execute']?.at(-1),
    exec: listeners['tools/execute']?.at(-1),
  }
}

const nextAllow = async () => ({ kind: 'allow' })

// 1. 默认策略：写操作 → ask
{
  const { pre } = await mount()
  const decision = await pre({ name: 'cu_click', args: { ref: '@s1:e1' }, agent: { id: 'a1' } }, nextAllow)
  assert.equal(decision.kind, 'ask', 'default policy asks')
  assert.match(decision.displayReason.zh, /点击桌面元素/)
}

// 2. 危险应用拦截
{
  const { pre } = await mount()
  const decision = await pre({ name: 'cu_launch', args: { app: 'System Settings' }, agent: { id: 'a1' } }, nextAllow)
  assert.equal(decision.kind, 'deny')
  assert.equal(decision.info?.code, 'CU_DANGEROUS_APP')
}

// 3. 白名单：非名单内应用拒绝，名单内正常 ask
{
  const { pre } = await mount({ allowedApps: '微信,钉钉' })
  const denied = await pre({ name: 'cu_launch', args: { app: 'Safari' }, agent: { id: 'a1' } }, nextAllow)
  assert.equal(denied.kind, 'deny')
  assert.equal(denied.info?.code, 'CU_APP_NOT_ALLOWED')
  const allowed = await pre({ name: 'cu_launch', args: { app: '微信' }, agent: { id: 'a1' } }, nextAllow)
  assert.equal(allowed.kind, 'ask', 'allowlisted app still asks under ask policy')
}

// 4. 会话策略：首次 ask → 执行成功 → 再次直接 allow（且按工具隔离）
{
  const { pre, exec } = await mount({ approvalPolicy: 'session' })
  const first = await pre({ name: 'cu_click', args: { ref: '@s1:e1' }, agent: { id: 'a1' } }, nextAllow)
  assert.equal(first.kind, 'ask', 'session policy asks the first time')
  const result = await exec({ name: 'cu_click', args: { ref: '@s1:e1' }, agent: { id: 'a1' } },
    async () => ({ isError: false, content: [] }))
  assert.equal(result.isError, false)
  const second = await pre({ name: 'cu_click', args: { ref: '@s1:e1' }, agent: { id: 'a1' } }, nextAllow)
  assert.equal(second.kind, 'allow', 'session policy grants after first approved run')
  const other = await pre({ name: 'cu_type', args: { ref: '@s1:e2', text: 'hi' }, agent: { id: 'a1' } }, nextAllow)
  assert.equal(other.kind, 'ask', 'grant is per tool, not global')
}

// 5. 只读工具不受门禁影响；审批关闭时写操作也直接放行
{
  const { pre } = await mount()
  const decision = await pre({ name: 'cu_snapshot', args: { app: 'Safari' }, agent: { id: 'a1' } }, nextAllow)
  assert.equal(decision.kind, 'allow', 'read-only tools pass untouched')
}

console.log('host smoke OK (ask / deny-dangerous / deny-allowlist / session-grant / read-only)')
