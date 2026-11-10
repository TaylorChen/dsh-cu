# Third-party notices

## agent-desktop (npm dependency)

- Package: [`agent-desktop`](https://www.npmjs.com/package/agent-desktop) — declared in
  `package.json` → `dependencies` (pinned `^1.2.0`; the lockfile records the exact
  tarball integrity hash).
- Upstream: https://github.com/vercel-labs/agent-desktop
- License: Apache-2.0 — https://github.com/vercel-labs/agent-desktop/blob/main/LICENSE
- What it provides: the per-platform native binaries under the package's `bin/`
  directory (macOS / Linux / Windows, x64 + arm64), which this plugin resolves and
  spawns through `lib/backend.js` (`CU_BIN` overrides the resolution).

This repository does not modify the upstream package. agent-desktop is a Vercel
Labs project; this plugin is not affiliated with Vercel. All trademarks belong to
their respective owners.

## Runtime host packages (peer dependencies)

`@deepseek-ai/dsh-tools`, `@deepseek-ai/schemastery`, `@deepseek-ai/cordis` are
provided by the DeepSeek Harness runtime (declared as `peerDependencies`; ranges
follow the harness plugin convention). They are host-provided, not bundled.
