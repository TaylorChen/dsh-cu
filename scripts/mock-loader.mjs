/**
 * Resolve/load hooks backing `mock-hooks.mjs`.
 */
const STUBS = {
  '@deepseek-ai/dsh-settings': `
    export const settingsNamespace = (name) => ({ __ns: name, toString: () => name })
  `,
  '@deepseek-ai/dsh-tools': `
    export const defineTool = (options) => options
  `,
  '@deepseek-ai/schemastery': `
    const anyZ = new Proxy(() => anyZ, {
      get: (_target, prop) => (prop === Symbol.toPrimitive ? () => 'z' : () => anyZ),
      apply: () => anyZ,
    })
    export default anyZ
  `,
}

/** @type {import('node:module').ResolveHook} */
export async function resolve(specifier, context, nextResolve) {
  if (specifier in STUBS) {
    return { shortCircuit: true, url: `stub:${specifier}` }
  }
  return nextResolve(specifier, context)
}

/** @type {import('node:module').LoadHook} */
export async function load(url, context, nextLoad) {
  if (url.startsWith('stub:')) {
    const name = url.slice('stub:'.length)
    return { format: 'module', shortCircuit: true, source: STUBS[name] }
  }
  return nextLoad(url, context)
}
