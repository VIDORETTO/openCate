import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, readFile } from 'node:fs/promises'
import { promisify } from 'node:util'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const execFileAsync = promisify(execFile)
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const packageJson = JSON.parse(await readFile(path.join(repoRoot, 'package.json'), 'utf8'))
const sourceDir = path.join(repoRoot, 'dist', 'companion-web')
const releaseDir = path.join(repoRoot, 'release')
const version = typeof packageJson.version === 'string' ? packageJson.version : 'dev'
const output = path.join(releaseDir, `cate-companion-web-${version}.tgz`)
const requiredFiles = ['index.html', 'manifest.webmanifest', 'sw.js', 'cate-logo.svg']

const missingFiles = requiredFiles.filter((file) => !existsSync(path.join(sourceDir, file)))
if (missingFiles.length > 0) {
  throw new Error(`companion web build is missing required files: ${missingFiles.join(', ')}; run \`npm run build:companion\` first`)
}

const manifest = JSON.parse(await readFile(path.join(sourceDir, 'manifest.webmanifest'), 'utf8'))
const hasCateIcon = Array.isArray(manifest.icons)
  && manifest.icons.some((icon) => icon?.src === './cate-logo.svg')
if (manifest.start_url !== './' || manifest.scope !== './' || !hasCateIcon) {
  throw new Error('companion web manifest must use the relative app scope and reference ./cate-logo.svg')
}

const serviceWorker = await readFile(path.join(sourceDir, 'sw.js'), 'utf8')
if (!serviceWorker.includes("'./manifest.webmanifest'") || !serviceWorker.includes("'./cate-logo.svg'")) {
  throw new Error('companion web service worker must cache the manifest and Cate icon')
}

await mkdir(releaseDir, { recursive: true })
await execFileAsync('tar', ['-czf', output, '-C', sourceDir, '.'])

const archive = await execFileAsync('tar', ['-tzf', output])
const archiveFiles = new Set(
  archive.stdout
    .split(/\r?\n/)
    .map((entry) => entry.replace(/^\.\//, '').replace(/\/$/, '')),
)
const missingArchiveFiles = requiredFiles.filter((file) => !archiveFiles.has(file))
if (missingArchiveFiles.length > 0) {
  throw new Error(`companion web package is missing required files: ${missingArchiveFiles.join(', ')}`)
}

console.log(`[package:companion] wrote ${path.relative(repoRoot, output)}`)
