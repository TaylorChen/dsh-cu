/**
 * Live operation state for the runtime control bar (浮条), shared by the host
 * row (writes on every mutating cu_* execution) and the routes row (reads from
 * the GUI). Module-level singleton: both rows live in the same host process.
 *
 * v1 语义：
 *   - `begin/end` 环绕每次写操作执行，`current` 即「正在操作什么」。
 *   - 每次执行配一个 AbortController；宿主行把它链接到 exec.signal，
 *     浮条「停止」触发 abort，正在跑的 agent-desktop 调用即时中断。
 *   - 「暂停」= 60s 内拒绝一切新的写操作（pre-execute 检查），已在跑的不受影响。
 *
 * @module @cu/dsh-cu/state
 */

const MAX_OPS = 20

/**
 * @typedef {Object} CuOpRecord
 * @property {string} ts            ISO 时间
 * @property {string} tool          工具名
 * @property {string | undefined} app
 * @property {string | undefined} ref
 * @property {'done' | 'failed' | 'aborted'} status
 * @property {boolean} ok
 * @property {string | undefined} code
 * @property {number} ms
 */

export function createCuState() {
  /** @type {CuOpRecord[]} */
  const ops = []
  /** @type {{ tool: string, app?: string, ref?: string, startedAt: number, ac: AbortController } | null} */
  let current = null
  let pausedUntil = 0
  const listeners = new Set()

  function publish() {
    for (const listener of listeners) {
      try {
        listener()
      } catch {
        // 观察者异常不影响宿主执行
      }
    }
  }

  return {
    /**
     * 标记一次写操作开始；返回本次执行的 AbortController。
     * @param {string} tool
     * @param {{ app?: string, ref?: string } | undefined} args
     */
    begin(tool, args = {}) {
      const ac = new AbortController()
      current = {
        tool,
        app: typeof args.app === 'string' ? args.app : undefined,
        ref: typeof args.ref === 'string' ? args.ref : undefined,
        startedAt: Date.now(),
        ac,
      }
      publish()
      return current
    },

    /**
     * 标记当前写操作结束。
     * @param {{ ok: boolean, code?: string, ms: number }} outcome
     */
    end(outcome) {
      const record = current
      current = null
      if (record) {
        const aborted = record.ac.signal.aborted
        ops.push({
          ts: new Date().toISOString(),
          tool: record.tool,
          app: record.app,
          ref: record.ref,
          status: aborted ? 'aborted' : outcome.ok ? 'done' : 'failed',
          ok: outcome.ok && !aborted,
          code: outcome.code,
          ms: outcome.ms,
        })
        if (ops.length > MAX_OPS) ops.shift()
      }
      publish()
    },

    /**
     * 把外部信号（exec.signal）链接进本次执行的 controller：
     * 调用方取消时，浮条链路同步取消。
     * @param {AbortSignal | undefined} signal
     */
    linkSignal(signal) {
      if (!signal || !current) return
      signal.addEventListener('abort', () => current?.ac.abort(signal.reason), { once: true })
    },

    /** 浮条「停止」：中断当前执行。 */
    abort() {
      current?.ac.abort(new Error('用户停止了 computer use 操作'))
    },

    /** 浮条「暂停」：seconds 秒内拒绝新的写操作。 */
    pause(seconds = 60) {
      pausedUntil = Date.now() + seconds * 1000
      publish()
    },

    /** 浮条「恢复」。 */
    resume() {
      pausedUntil = 0
      publish()
    },

    isPaused() {
      return Date.now() < pausedUntil
    },

    pausedForMs() {
      return Math.max(0, pausedUntil - Date.now())
    },

    /** @returns {{ current: Omit<NonNullable<Parameters<typeof Array.prototype.push>[0]>, never> | null, currentElapsedMs: number, pausedForMs: number, ops: CuOpRecord[] }} */
    snapshot() {
      return {
        current: current
          ? { tool: current.tool, app: current.app, ref: current.ref, startedAt: current.startedAt }
          : null,
        currentElapsedMs: current ? Date.now() - current.startedAt : 0,
        pausedForMs: this.isPaused() ? this.pausedForMs() : 0,
        ops: [...ops],
      }
    },

    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

/** 进程级单例。 */
export const cuState = createCuState()
