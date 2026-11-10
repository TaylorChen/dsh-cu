/**
 * `cu` settings namespace schema + resolution.
 *
 * 扁平 schema（字段都在 namespace 顶层）：dsh 浏览器设置卡片的 settingsScope
 * 控制器只支持顶层字段 set/unset。与 tiku 同一约定：**schema 的 default 保持
 * 中性，真正的默认值只在 resolver 里给**，否则 schema 默认值会遮蔽环境变量
 * 兜底。审批策略留环境变量 CU_APPROVAL 作为首启兜底；其余字段不带 env 兜底。
 *
 * @module @cu/dsh-cu/config
 */

import z from '@deepseek-ai/schemastery'

/**
 * @typedef {Object} CuFlatConfig
 * @property {string} approvalPolicy
 * @property {string} allowedApps
 * @property {string} inputMode
 * @property {boolean} auditEnabled
 * @property {boolean} guardDangerous
 */

/**
 * @typedef {Object} CuConfig
 * @property {'ask' | 'session'} approvalPolicy  每次写操作确认 / 会话内免重复确认
 * @property {string[]} allowedApps              允许操作的应用；空 = 不限制
 * @property {'semantic' | 'headed'} inputMode   语义操作 / 物理输入
 * @property {boolean} auditEnabled              写操作审计日志
 * @property {boolean} guardDangerous            拦截危险应用
 */

/** 注册到 `ctx.settings` 的 namespace schema（Web 设置页表单据此渲染）。 */
export const cuConfigSchema = z.object({
  approvalPolicy: z.string().volatile()
    .description('审批策略：ask=每次写操作确认，session=会话内免重复确认')
    .default(''),
  allowedApps: z.string().volatile()
    .description('允许操作的应用，逗号分隔（应用名或 bundle id，留空不限制）')
    .default(''),
  inputMode: z.string().volatile()
    .description('输入模式：semantic=语义操作（不动鼠标），headed=物理输入')
    .default(''),
  auditEnabled: z.boolean().volatile()
    .description('把每次写操作记入审计日志（~/.dsh/cu/audit.jsonl）')
    .default(true),
  guardDangerous: z.boolean().volatile()
    .description('拦截系统设置、钥匙串访问等危险应用')
    .default(true),
})

/** 危险应用名单（guardDangerous 开启时拒绝操作；小写匹配）。 */
export const DANGEROUS_APPS = [
  'system settings', 'system preferences', '钥匙串访问', 'keychain access',
  'activity monitor', '活动监视器', 'disk utility', '磁盘工具',
  'terminal', 'iterm2', 'console', '控制台',
]

/** 解析逗号分隔的应用名单：小写、去空、去重。 */
export function parseAllowedApps(text) {
  return String(text ?? '')
    .split(/[,，]/)
    .map(item => item.trim().toLowerCase())
    .filter(item => item.length > 0)
}

/**
 * user settings → `CU_APPROVAL` 环境变量 → 默认值。
 * @param {Partial<CuFlatConfig>} flat - settings namespace 的当前值。
 * @returns {CuConfig}
 */
export function resolveCuConfig(flat = {}) {
  const policyEnv = String(process.env.CU_APPROVAL ?? '').trim().toLowerCase()
  const policyRaw = String(flat.approvalPolicy ?? '').trim().toLowerCase()
  return {
    approvalPolicy: policyRaw === 'session' || policyRaw === 'ask'
      ? policyRaw
      : (policyEnv === 'session' ? 'session' : 'ask'),
    allowedApps: parseAllowedApps(flat.allowedApps),
    inputMode: String(flat.inputMode ?? '').trim().toLowerCase() === 'headed' ? 'headed' : 'semantic',
    auditEnabled: flat.auditEnabled !== false,
    guardDangerous: flat.guardDangerous !== false,
  }
}

/** 应用名是否被允许操作（名单为空 = 全部允许；大小写不敏感）。 */
export function isAppAllowed(config, app) {
  if (!app) return true
  if (config.allowedApps.length === 0) return true
  const name = String(app).trim().toLowerCase()
  return config.allowedApps.includes(name)
}

/** 应用名是否命中危险名单（guardDangerous 开启时用）。 */
export function isDangerousApp(config, app) {
  if (!config.guardDangerous || !app) return false
  const name = String(app).trim().toLowerCase()
  return DANGEROUS_APPS.some(entry => name === entry || name.includes(entry))
}
