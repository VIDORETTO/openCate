import { access, copyFile, mkdtemp, readFile, rm } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const packageJson = JSON.parse(await readFile(path.join(repoRoot, 'package.json'), 'utf8'))
const version = String(packageJson.version)
const tarballName = `opencate-runtime-${version}-linux-x64.tgz`
const tarballPath = path.join(repoRoot, 'dist-runtime', tarballName)
const dockerfilePath = path.join(repoRoot, 'docker', 'cate-runtime', 'Dockerfile')
const vitestPath = path.join(repoRoot, 'node_modules', 'vitest', 'vitest.mjs')
const imageTag = `opencate-runtime-smoke:${version.replace(/[^a-zA-Z0-9_.-]/g, '-')}-${process.pid}`
const engine = process.env.CATE_CONTAINER_ENGINE === 'podman' ? 'podman' : 'docker'

if (process.env.CATE_CONTAINER_ENGINE && !['docker', 'podman'].includes(process.env.CATE_CONTAINER_ENGINE)) {
  throw new Error(`Unsupported CATE_CONTAINER_ENGINE: ${process.env.CATE_CONTAINER_ENGINE}`)
}
if (engine === 'podman' && process.platform !== 'linux') {
  throw new Error('The Podman container smoke must run on a Linux host with a native runtime build')
}

let contextPath
let engineAvailable = false
try {
  await runProcess(engine, ['version'], repoRoot)
  engineAvailable = true
  await assertMissingImageFails()

  const runtimeBuildArgs = [
    path.join(repoRoot, 'scripts', 'build-runtime-tarball.mjs'),
    '--target',
    'linux-x64',
  ]
  // Docker is also used for cross-building on non-Linux hosts. Podman runs
  // this smoke on Linux, where npm has already built the native node-pty.
  if (engine === 'docker') runtimeBuildArgs.push('--docker')
  await runProcess(process.execPath, runtimeBuildArgs, repoRoot)
  await access(tarballPath)

  contextPath = await mkdtemp(path.join(os.tmpdir(), 'cate-container-context-'))
  await copyFile(tarballPath, path.join(contextPath, tarballName))
  await copyFile(dockerfilePath, path.join(contextPath, 'Dockerfile'))

  await runProcess(engine, [
    'build',
    '--build-arg',
    `RUNTIME_TARBALL=${tarballName}`,
    '--tag',
    imageTag,
    '--file',
    path.join(contextPath, 'Dockerfile'),
    contextPath,
  ], repoRoot)

  await runProcess(process.execPath, [
    vitestPath,
    'run',
    '--config',
    'vitest.live.config.ts',
    'containerRuntime',
  ], repoRoot, {
    CATE_CONTAINER_E2E: '1',
    CATE_CONTAINER_IMAGE: imageTag,
    CATE_CONTAINER_ENGINE: engine,
  })
  console.log(`container runtime ${engine} smoke: passed (${imageTag})`)
} catch (error) {
  if (!engineAvailable && error instanceof Error) {
    throw new Error(`Container engine "${engine}" is required for this smoke: ${error.message}`)
  }
  throw error
} finally {
  if (engineAvailable) {
    try {
      await runProcess(engine, ['image', 'rm', '--force', imageTag], repoRoot)
    } catch (error) {
      console.warn(`Could not remove temporary ${engine} image ${imageTag}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  if (contextPath) await rm(contextPath, { recursive: true, force: true })
}

async function assertMissingImageFails() {
  const missingImage = `opencate-runtime-smoke-missing:${process.pid}-${Date.now()}`
  try {
    await runProcess(engine, ['run', '--rm', '--pull', 'never', missingImage, 'true'], repoRoot)
  } catch (error) {
    if (error instanceof Error && /code 125\b/.test(error.message)) return
    throw error
  }
  throw new Error(`Container engine "${engine}" unexpectedly ran missing image "${missingImage}"`)
}

function runProcess(command, args, cwd, extraEnv = {}) {
  return new Promise((resolveProcess, rejectProcess) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, ...extraEnv },
      stdio: 'inherit',
      windowsHide: true,
    })
    child.on('error', (error) => rejectProcess(new Error(`${command} unavailable: ${error.message}`)))
    child.on('exit', (code, signal) => {
      if (code === 0) resolveProcess()
      else rejectProcess(new Error(`${command} ${args.join(' ')} exited with ${signal ? `signal ${signal}` : `code ${code}`}`))
    })
  })
}
