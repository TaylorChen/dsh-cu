/**
 * Backend seam for `@cu/dsh-cu`.
 *
 * Resolves the `agent-desktop` executable and runs one command at a time,
 * returning its JSON envelope (`{ version, ok, command, data | error }`).
 * Nothing in this module is model-facing: the tool row owns the schemas.
 *
 * Binary resolution order:
 *   1. `CU_BIN` environment variable (absolute path)
 *   2. `vendor/agent-desktop` shipped in this package
 *   3. `~/.dsh/cu/agent-desktop`
 *   4. `agent-desktop` on PATH
 *
 * @module @cu/dsh-cu/backend
 */

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { delimiter, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))

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

/**
 * Pick the first existing candidate, falling back to a PATH scan.
 * @returns {string} absolute path or bare command name
 */
export function resolveBinary() {
  const explicit = process.env.CU_BIN
  if (explicit) {
    if (!existsSync(explicit)) throw new CuBackendError(`CU_BIN does not exist: ${explicit}`)
    return explicit
  }
  const candidates = [
    join(HERE, '..', 'vendor', 'agent-desktop'),
    join(homedir(), '.dsh', 'cu', 'agent-desktop'),
  ]
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }
  const path = process.env.PATH ?? ''
  for (const dir of path.split(delimiter)) {
    if (!dir) continue
    const candidate = join(dir, 'agent-desktop')
    if (existsSync(candidate)) return candidate
  }
  throw new CuBackendError(
    'agent-desktop not found. Set CU_BIN, drop the binary at ~/.dsh/cu/agent-desktop, '
    + 'or install it from https://github.com/vercel-labs/agent-desktop/releases',
    { code: 'CU_BINARY_MISSING' },
  )
}

/**
 * One executable wrapper. Commands are serialized by the caller (the tools are
 * exclusive by default), so no internal queue is needed.
 */
export class CuBackend {
  /** @param {{ bin?: string, timeoutMs?: number }} [options] */
  constructor(options = {}) {
    this.bin = options.bin ?? resolveBinary()
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
        env: { ...process.env, NO_COLOR: '1' },
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
