/**
 * Runtime control bar API (`dsh-cu/routes`): serves the GUI's floating status
 * bar with live operation state and the stop/pause/resume controls.
 *
 * web-only：webServer 缺席的组合（headless）经 `ctx.inject` 跳过整行。
 * POST 一律要求 application/json（与 tiku 同一防跨站约定）。
 *
 * @module @cu/dsh-cu/routes
 */

import { cuState } from './state.js'

/** Cordis 插件名。 */
export const name = 'dsh-cu-routes'

/** 无必选服务；webServer 走可选注入。 */
export const inject = []

/** 路由前缀。 */
const BASE = '/api/cu'

function json(res, status, value) {
  const body = JSON.stringify(value)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
  })
  res.end(body)
}

function guard(res, run) {
  return Promise.resolve(run()).catch((error) => {
    json(res, 500, { error: error instanceof Error ? error.message : String(error) })
  })
}

/**
 * 挂载浮条路由（web-only）。
 * @param {import('@deepseek-ai/cordis').Context} ctx
 */
export function apply(ctx) {
  ctx.inject(['webServer'], (scoped) => {
    const { webServer } = scoped
    const route = (path, kind, handler) => {
      ctx.effect(() => webServer.register({ kind, path, handler }), `dsh-cu.routes${path}`)
    }

    // 实时状态：浮条 1s 轮询。
    route(`${BASE}/status`, 'exact', async (_req, res) => {
      await guard(res, () => {
        json(res, 200, cuState.snapshot())
      })
    })

    // 停止：中断当前执行 + 暂停 60s 内的新写操作。
    route(`${BASE}/stop`, 'exact', async (req, res) => {
      await guard(res, () => {
        if (String(req.headers['content-type'] ?? '').includes('application/json') === false) {
          json(res, 415, { error: 'content-type must be application/json' })
          return
        }
        req.resume()
        req.on('end', () => {
          cuState.abort()
          cuState.pause(60)
          json(res, 200, { ok: true, pausedForMs: cuState.pausedForMs(), aborted: true })
        })
      })
    })

    // 恢复。
    route(`${BASE}/resume`, 'exact', async (req, res) => {
      await guard(res, () => {
        if (String(req.headers['content-type'] ?? '').includes('application/json') === false) {
          json(res, 415, { error: 'content-type must be application/json' })
          return
        }
        req.resume()
        req.on('end', () => {
          cuState.resume()
          json(res, 200, { ok: true, pausedForMs: 0 })
        })
      })
    })
  })
}
