/**
 * Backend seam for `dsh-cu`.
 *
 * Engine dependency: [`agent-desktop`](https://github.com/vercel-labs/agent-desktop)
 * — declared as a regular npm dependency (`dependencies.agent-desktop`, the
 * package ships every platform binary plus per-file SHA-256 checksums). This
 * module resolves the executable for the running platform and runs one command
 * at a time, returning its JSON envelope (`{ version, ok, command, data | error }`).
 * Nothing in this module is model-facing: the tool row owns the schemas.
 *
 * Binary resolution order:
 *   1. `CU_BIN` environment variable (absolute path — self-built / custom binary)
 *   2. the `agent-desktop` npm package (platform binary from `bin/`, with the
 *      macOS helper wired through `AGENT_DESKTOP_MACOS_HELPER_PATH`, mirroring
 *      the package's own launcher)
 *   3. `~/.dsh/cu/agent-desktop`
 *   4. `agent-desktop` on PATH
 *
 * @module dsh-cu/backend
 */

import { spawn } from 'node:child_process'
import { chmodSync, copyFileSync, existsSync, renameSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { delimiter, dirname, join } from 'node:path'
import { arch, platform } from 'node:os'
import { createRequire } from 'node:module'


/** Spawn failure or an unparseable reply — never a CLI-reported `ok: false`. */
export class CuBackendError extends Error {
  /**
   * @param {string} message - human-readable failure
   * @param {{ code?: string, stderr?: string, cause?: unknown }} [detail]
   */
  constructor(message, detail = {}) {
    super(message, detail.cause ? { cause: detail.cause } : undefined)
    this.name = 'CuBackendError'
    this.code = detail.code ?? 'CU_SPAWN_FAILED'
    this.stderr = detail.stderr ?? ''
  }
}

const OS = platform()
const ARCH = arch()

/** npm 包内的平台二进制名（与 agent-desktop 包 bin/ 目录的命名一致）。 */
function npmBinaryName() {
  return `agent-desktop-${OS}-${ARCH}${OS === 'win32' ? '.exe' : ''}`
}

/**
 * 从 npm 依赖解析平台二进制，并复刻其 postinstall 的必要设置：
 * 把带平台后缀的 helper 硬链接为二进制期望的无后缀名（二者同目录），
 * chmod 可执行。二进制随后按「同目录 + 固定名」自行找到 helper。
 * @returns {{ path: string, env: Record<string, string> } | undefined}
 */
function resolveFromNpmPackage() {
  try {
    const require = createRequire(import.meta.url)
    const pkgRoot = dirname(require.resolve('agent-desktop/package.json'))
    const binDir = join(pkgRoot, 'bin')
    const binary = join(binDir, npmBinaryName())
    if (!existsSync(binary)) return undefined
    try {
      chmodSync(binary, 0o755)
    } catch {
      // 只读卷等场景：失败交由 spawn 报错
    }
    // postinstall 被包管理器拦截时，helper 仍是带平台后缀的名字；
    // 二进制按无后缀固定名查找（同目录），且要求 helper 是「owner 匹配、
    // 可执行、单链接（nlink=1）、无组/世界写」的常规文件——所以用
    // 「拷贝到临时名 + 原子 rename」落地（幂等，能自愈此前的硬链接残留）。
    const helperSuffixes = OS === 'darwin'
      ? [`agent-desktop-macos-helper-darwin-${ARCH}`]
      : OS === 'linux'
        ? [`agent-desktop-linux-clipboard-owner-linux-${ARCH}`]
        : []
    for (const suffixed of helperSuffixes) {
      const source = join(binDir, suffixed)
      const target = join(binDir, suffixed.replace(`-${OS}-${ARCH}`, ''))
      if (!existsSync(source)) continue
      const sourceMode = statSync(source).mode & 0o777
      const needsRefresh = !existsSync(target)
        || statSync(target).nlink !== 1
        || (statSync(target).mode & 0o777) !== (sourceMode & 0o755)
      if (!needsRefresh) continue
      const tmp = `${target}.tmp-${process.pid}`
      copyFileSync(source, tmp)
      chmodSync(tmp, sourceMode & 0o755)
      renameSync(tmp, target)
    }
    // 不设 AGENT_DESKTOP_MACOS_HELPER_PATH：交给二进制的同目录查找，
    // 与 vendor 时代的布局一致（该路径当时已实测可用）。
    return { path: binary, env: {} }
  } catch {
    return undefined
  }
}

/**
 * 解析可执行文件与附加环境变量。
 * @returns {{ path: string, env: Record<string, string> }}
 */
export function resolveAgentDesktop() {
  const explicit = process.env.CU_BIN
  if (explicit) {
    if (!existsSync(explicit)) throw new CuBackendError(`CU_BIN does not exist: ${explicit}`)
    return { path: explicit, env: {} }
  }
  const npm = resolveFromNpmPackage()
  if (npm) return npm
  const fallback = join(homedir(), '.dsh', 'cu', 'agent-desktop')
  if (existsSync(fallback)) return { path: fallback, env: {} }
  const path = process.env.PATH ?? ''
  for (const dir of path.split(delimiter)) {
    if (!dir) continue
    const candidate = join(dir, 'agent-desktop')
    if (existsSync(candidate)) return { path: candidate, env: {} }
  }
  throw new CuBackendError(
    'agent-desktop not found. It ships as the npm dependency `agent-desktop` — '
    + 'reinstall the plugin (or run pnpm install in its directory); '
    + 'or set CU_BIN / put the binary on PATH. '
    + 'Upstream: https://github.com/vercel-labs/agent-desktop',
    { code: 'CU_BINARY_MISSING' },
  )
}

/** 兼容旧导出名：返回可执行文件路径（无解析结果时抛错）。 */
export function resolveBinary() {
  return resolveAgentDesktop().path
}

/**
 * One executable wrapper. Commands are serialized by the caller (the tools are
 * exclusive by default), so no internal queue is needed.
 */
export class CuBackend {
  /** @param {{ bin?: string, timeoutMs?: number }} [options] */
  constructor(options = {}) {
    if (options.bin) {
      this.bin = options.bin
      this.extraEnv = {}
    } else {
      const resolved = resolveAgentDesktop()
      this.bin = resolved.path
      this.extraEnv = resolved.env
    }
    this.defaultTimeoutMs = options.timeoutMs ?? 60_000
  }

  /**
   * Run one CLI command and return its parsed envelope.
   * @param {string[]} args - argv after the executable
   * @param {{ stdin?: string, timeoutMs?: number, signal?: AbortSignal }} [options]
   * @returns {Promise<{ version?: string, ok: boolean, command?: string, data?: any, error?: any }>}
   */
  async run(args, options = {}) {
    const timeoutMs = options.timeoutMs ?? this.defaultTimeoutMs
    return await new Promise((resolve, reject) => {
      let settled = false
      const child = spawn(this.bin, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, NO_COLOR: '1', ...this.extraEnv },
      })

      const stdout = []
      const stderr = []
      const timer = setTimeout(() => {
        if (settled) return
        settled = true
        child.kill('SIGKILL')
        reject(new CuBackendError(
          `agent-desktop ${args[0] ?? ''} timed out after ${timeoutMs}ms`,
          { code: 'CU_TIMEOUT' },
        ))
      }, timeoutMs)

      const onAbort = () => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        child.kill('SIGKILL')
        reject(new CuBackendError('agent-desktop call aborted', { code: 'CU_ABORTED' }))
      }
      options.signal?.addEventListener('abort', onAbort, { once: true })

      child.stdout.on('data', (chunk) => stdout.push(chunk))
      child.stderr.on('data', (chunk) => stderr.push(chunk))

      child.on('error', (error) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        reject(new CuBackendError(`failed to spawn ${this.bin}: ${error.message}`, {
          code: 'CU_SPAWN_FAILED',
          cause: error,
        }))
      })

      child.on('close', () => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        options.signal?.removeEventListener('abort', onAbort)
        const out = Buffer.concat(stdout).toString('utf8').trim()
        const err = Buffer.concat(stderr).toString('utf8').trim()
        if (!out) {
          reject(new CuBackendError(
            `agent-desktop produced no output${err ? `: ${err}` : ''}`,
            { code: 'CU_EMPTY_OUTPUT', stderr: err },
          ))
          return
        }
        try {
          resolve(JSON.parse(out))
        } catch (cause) {
          reject(new CuBackendError(
            `agent-desktop output was not JSON${err ? `: ${err}` : ''}`,
            { code: 'CU_BAD_JSON', stderr: err, cause },
          ))
        }
      })

      if (options.stdin !== undefined) child.stdin.end(options.stdin, 'utf8')
      else child.stdin.end()
    })
  }

  /**
   * Run a command and turn a CLI-reported failure into a thrown error with the
   * envelope's own recommendation attached.
   * @param {string[]} args
   * @param {{ stdin?: string, timeoutMs?: number, signal?: AbortSignal }} [options]
   */
  async runOk(args, options = {}) {
    const envelope = await this.run(args, options)
    if (!envelope.ok) {
      const code = envelope.error?.code ?? 'CU_COMMAND_FAILED'
      const message = envelope.error?.message ?? 'agent-desktop command failed'
      const suggestion = envelope.error?.suggestion ? ` (${envelope.error.suggestion})` : ''
      const retry = envelope.error?.disposition?.retry
      const retryHint = retry ? ` [retry: ${retry}]` : ''
      const error = new CuBackendError(`${code}: ${message}${suggestion}${retryHint}`, { code })
      error.envelope = envelope
      throw error
    }
    return envelope
  }
}
