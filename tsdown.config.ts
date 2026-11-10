/**
 * Client half build: one CJS closure-factory entry calling
 * `window.__ModuleLoader__.load({ id, factory })`, with platform modules
 * resolved through the injected require (the loader's frozen module table).
 *
 * Same pattern as tiku: a purity gate rejects any `@deepseek-ai` value import;
 * the card requires only `react` at runtime.
 */
import { defineConfig } from 'tsdown'
import type { UserConfig } from 'tsdown'

const PLUGIN_ID = 'dsh-cu'

/** Browser platform modules the shell seeds into the frozen module table. */
const PLATFORM_MODULES = [
  'react', 'react/jsx-runtime',
] as const

const clientHalf: UserConfig = {
  name: `${PLUGIN_ID}/client`,
  entry: { client: 'src/client/index.ts' },
  outDir: 'lib',
  format: 'cjs',
  platform: 'browser',
  dts: false,
  sourcemap: true,
  clean: false,
  external: [...PLATFORM_MODULES],
  noExternal: (id: string) =>
    PLATFORM_MODULES.includes(id as (typeof PLATFORM_MODULES)[number]) ? undefined : true,
  plugins: [{
    name: 'dsh-client-bundle-purity',
    resolveId(source: string) {
      if (!source.startsWith('@deepseek-ai/')) return null
      if (PLATFORM_MODULES.includes(source as (typeof PLATFORM_MODULES)[number])) return null
      throw new Error(
        `client bundle purity: "${source}" is not a platform module — cross-plugin value `
        + 'imports are forbidden; collaborate through cordis services',
      )
    },
  }],
  outputOptions: {
    entryFileNames: 'client.js',
    banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(PLUGIN_ID)}, factory: (require) => {`,
    footer: 'return module.exports; } });',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
  },
}

export default defineConfig([clientHalf])
