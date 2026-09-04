import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'

// Keep the local gate identical whether it is invoked through Bun or npm. The
// package script itself is launched by Node in both environments. When npm
// provides its JavaScript entrypoint, run that entrypoint through Node so the
// Windows gate does not depend on a .cmd shim or a shell-held pipe. Bun and
// other runners retain the platform fallback. CI remains explicit in
// .github/workflows/ci.yml so each check is visible in Actions.
const envNpmCli = process.env.npm_execpath
const npmCli =
  envNpmCli && /\.(?:c|m)?js$/i.test(envNpmCli)
    ? envNpmCli
    : path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js')
const useNodeNpmCli = existsSync(npmCli)
const runner = useNodeNpmCli ? process.execPath : process.platform === 'win32' ? 'npm.cmd' : 'npm'
const scripts = [
  { name: 'typecheck', args: [] },
  { name: 'lint', args: [] },
  // The real daemon teardown fixtures share Windows process/file handles.
  // Keep this release-oriented gate deterministic instead of allowing Vitest's
  // default file parallelism to turn a clean teardown into EBUSY.
  { name: 'test', args: ['--', '--no-file-parallelism'] },
  { name: 'build', args: [] },
  { name: 'build:companion', args: [] },
]

for (const script of scripts) {
  console.log(`\n[verify:hygiene] npm run ${script.name}`)
  const runnerArgs = useNodeNpmCli
    ? [npmCli, 'run', script.name, ...script.args]
    : ['run', script.name, ...script.args]
  const result = spawnSync(runner, runnerArgs, {
    stdio: 'inherit',
    env: process.env,
    shell: !useNodeNpmCli && process.platform === 'win32',
  })
  if (result.error) {
    console.error(`[verify:hygiene] failed to start ${script.name}: ${result.error.message}`)
    process.exit(1)
  }
  if (result.status !== 0) process.exit(result.status ?? 1)
}

console.log('\n[verify:hygiene] static, unit, and production-build gates passed')
