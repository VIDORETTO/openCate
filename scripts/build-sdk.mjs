import { build } from 'esbuild'
import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const tscScript = path.join(repoRoot, 'node_modules', 'typescript', 'bin', 'tsc')

await build({
  entryPoints: [path.join(repoRoot, 'src', 'sdk', 'index.ts')],
  outfile: path.join(repoRoot, 'dist', 'sdk', 'index.js'),
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
  sourcemap: true,
  logLevel: 'info',
})

if (!existsSync(tscScript)) throw new Error(`TypeScript compiler not found at ${tscScript}`)
await new Promise((resolve, reject) => {
  // Run the JavaScript entrypoint through Node instead of a platform shim.
  // On Windows, spawning .cmd/.exe shims directly can fail with EINVAL.
  const child = spawn(process.execPath, [tscScript, '--project', path.join(repoRoot, 'tsconfig.sdk.json')], {
    cwd: repoRoot,
    stdio: 'inherit',
    windowsHide: true,
  })
  child.on('error', reject)
  child.on('exit', (code, signal) => {
    if (code === 0) resolve()
    else reject(new Error(signal ? `tsc exited from signal ${signal}` : `tsc exited with code ${code}`))
  })
})
