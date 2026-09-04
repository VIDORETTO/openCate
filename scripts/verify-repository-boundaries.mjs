import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const tracked = execFileSync('git', ['ls-files', '-z'], {
  cwd: repoRoot,
  encoding: 'utf8',
}).split('\0').filter(Boolean)

const machineStateNames = new Set([
  'analytics-state.json',
  'pending-events.jsonl',
  'remote-workspaces.json',
  'trusted-projects.json',
  'agent-audit.json',
])
const forbiddenName = (relativePath) => {
  const normalized = relativePath.replaceAll('\\', '/')
  const basename = path.posix.basename(normalized)
  if (normalized.startsWith('.cate/') || normalized.includes('/.cate/')) return true
  if (machineStateNames.has(basename)) return true
  if (/\.(?:pem|key|p12|pfx)$/i.test(basename)) return true
  if (/^\.env(?:\..+)?$/i.test(basename) && !/^\.env\.(?:example|sample)$/i.test(basename)) return true
  return false
}

const secretSignatures = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----\r?\n(?:[A-Za-z0-9+/=]{32,}\r?\n)+/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bgh[pousr]_[A-Za-z0-9]{36,}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{40,}\b/,
  /\bsk_live_[A-Za-z0-9]{20,}\b/,
]

const violations = []
for (const relativePath of tracked) {
  if (forbiddenName(relativePath)) {
    violations.push(`${relativePath}: forbidden tracked secret/local-state filename`)
    continue
  }
  let bytes
  try {
    bytes = await fs.readFile(path.join(repoRoot, relativePath))
  } catch (error) {
    if (error?.code === 'ENOENT') continue
    throw error
  }
  if (bytes.includes(0)) continue
  const text = bytes.toString('utf8')
  if (secretSignatures.some((pattern) => pattern.test(text))) {
    violations.push(`${relativePath}: high-confidence secret signature`)
  }
}

if (violations.length > 0) {
  throw new Error(`Repository boundary violations:\n${violations.join('\n')}`)
}

console.log(`repository boundaries: passed (${tracked.length} tracked files, no secret/local-state violations)`)
