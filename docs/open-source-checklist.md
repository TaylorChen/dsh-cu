# 开源前工作清单

状态标记：✅ 已完成 · 🔲 待办 · 🤔 需要决策

## 合规与许可

- ✅ `LICENSE`（Apache-2.0，含 2026 版权声明）
- ✅ `THIRD-PARTY-NOTICES.md`（vendored agent-desktop 二进制的出处 / 版本 / 校验和 / 许可）
- ✅ 敏感信息扫描：代码、注释、README 无个人路径 / 公司名 / 业务名（唯一一处 README 安装示例路径已改为占位符）
- ✅ 运行时数据不进仓库：`audit.jsonl`（桌面操作流水）在 `~/.dsh/cu/`，`.gitignore` 已排除 `*.jsonl`
- 🔲 决定版权主体署名（个人名 / 团队名 / GitHub id）

## 仓库与发布

- 🔲 `git init` + 首次提交（`.gitignore` 已就位：node_modules / sourcemap / jsonl / .DS_Store）
- 🔲 建 GitHub 仓库并推送（建议 repo 名 `dsh-cu`）
- 🔲 发布公告渠道：社区已有 [Awesome DSH Plugin 精选列表](https://github.com/)，可提交 PR 收录
- 🤔 是否发布 npm 包（当前 `dsh plugin add dsh-cu@link:...` 本地 link 安装即可用；发 npm 对远端用户更友好）
- 🤔 README 是否加英文版（当前中文为主，代码注释中英混合）

## CI 与质量

- ✅ 离线测试：`scripts/smoke.mjs`（工具 argv）+ `scripts/host-smoke.mjs`（审批门禁，mock 宿主）——均可跨平台跑
- ✅ 真机测试：`scripts/e2e.mjs`（macOS 专用，需要辅助功能权限）
- 🔲 GitHub Actions：ubuntu 跑两个 smoke（快）；e2e 需要 `macos-latest` runner + TCC 权限，建议标记为 manual 触发

## 平台覆盖（诚实声明）

- ✅ macOS arm64 二进制已随包（vendor/，校验和已验）
- 🔲 Windows（UIA）/ Linux（AT-SPI）二进制未 vendor——README 已写「其他平台自行放入 vendor/」；上游 Releases 有对应产物
- 🤔 或改为运行时从 npm 包 `agent-desktop` 解析（PATH 兜底已实现，见 `lib/backend.js` 的查找顺序）

## 已知边界（README「已知边界」一节保持同步）

- 白名单只对参数显式带 app 的调用生效
- 巨型树应用（如 800+ 篇的备忘录）：快照会诚实截断（`truncated: true` + 溢出文件），`cu_find` 已有 `timeout_ms` 但节点预算是上游限制
- `cu_launch` 对已运行应用的激活有 `focus-window` 兜底（v0.1.0 已加）
- 审计日志只记目标（app/ref/文本长度），不记内容——隐私卖点，保持

## 上线后

- 🔲 用 3 个真实任务跑评测（完成率 / 步数 / 人工介入次数），把数字写进 README
- 🔲 收集 issue：不同 app 的 a11y 覆盖差异表（社区共建）
