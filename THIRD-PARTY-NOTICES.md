# Third-party notices

## agent-desktop (vendored binary)

- Upstream: https://github.com/vercel-labs/agent-desktop
- Version vendored: **1.2.0** (macOS arm64: `vendor/agent-desktop`, `vendor/agent-desktop-macos-helper`)
- License: Apache-2.0 — https://github.com/vercel-labs/agent-desktop/blob/main/LICENSE
- Provenance: downloaded from the upstream GitHub Releases
  (`agent-desktop-v1.2.0-aarch64-apple-darwin.tar.gz`) and verified against the
  published `checksums.txt` (SHA-256 `219813428bb1ad8decae172faed05c5964a2415170df402e2786ccfa6452ba82`).

This repository does not modify the vendored binaries. To replace them
(another platform, a newer version, or a self-built binary), drop the
`agent-desktop` executable (plus its platform helper, if any) into `vendor/`,
or point the `CU_BIN` environment variable at your own copy — see README → 配置.

agent-desktop is a Vercel Labs project; this plugin is not affiliated with
Vercel. All trademarks belong to their respective owners.
