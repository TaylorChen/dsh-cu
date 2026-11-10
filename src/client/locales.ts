/**
 * Client-side locales for the `cu` settings card (zh/en).
 * @module @cu/dsh-cu/client/locales
 */

/** Locale namespace. */
export const NS = 'cu.settings'

export const zh = {
  desc: 'Computer Use：通过辅助功能树操作桌面应用，写操作先经你确认',
  unsaved: '未保存',
  save: '保存',
  discard: '放弃修改',
  failed: '保存失败，请检查后重试',
  overridden: '已覆盖',
  reset: '重置',
  invalid: '无效',
  groupApproval: '审批',
  groupApps: '应用与输入',
  groupAudit: '记录',
  policy: '审批策略',
  policyAsk: '每次写操作前确认（推荐）',
  policySession: '会话内免重复确认',
  apps: '允许的应用',
  appsHint: '逗号分隔，如 微信,钉钉；留空不限制',
  inputMode: '输入模式',
  inputModeSemantic: '语义操作（推荐）',
  inputModeSemanticHint: '直接调用辅助功能动作，不动鼠标不抢焦点',
  inputModeHeaded: '物理输入',
  inputModeHeadedHint: '移动真实鼠标键盘，仅在应用拒绝语义操作时需要',
  audit: '审计日志',
  auditHint: '写操作记入 ~/.dsh/cu/audit.jsonl（只记目标，不记内容）',
  guard: '危险应用拦截',
  guardHint: '拒绝操作系统设置、钥匙串、终端等',
} 

export const en = {
  desc: 'Computer Use: operate desktop apps via the accessibility tree; writes ask first',
  unsaved: 'Unsaved',
  save: 'Save',
  discard: 'Discard',
  failed: 'Save failed, please review and retry',
  overridden: 'Overridden',
  reset: 'Reset',
  invalid: 'Invalid',
  groupApproval: 'Approval',
  groupApps: 'Apps & input',
  groupAudit: 'Records',
  policy: 'Approval policy',
  policyAsk: 'Confirm every write (recommended)',
  policySession: 'Allow once per session',
  apps: 'Allowed apps',
  appsHint: 'Comma separated, e.g. Safari,Notes; empty = no limit',
  inputMode: 'Input mode',
  inputModeSemantic: 'Semantic actions (recommended)',
  inputModeSemanticHint: 'Accessibility actions only; no pointer movement or focus stealing',
  inputModeHeaded: 'Physical input',
  inputModeHeadedHint: 'Move the real pointer/keyboard; needed only when an app refuses semantic actions',
  audit: 'Audit log',
  auditHint: 'Writes go to ~/.dsh/cu/audit.jsonl (targets only, never content)',
  guard: 'Dangerous-app guard',
  guardHint: 'Refuse System Settings, Keychain, Terminal, …',
}

export type CuKey = keyof typeof zh
