import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const releaseDir = path.resolve(process.argv[2] || path.join(repoRoot, 'release'))
const packageJson = JSON.parse(await fs.readFile(path.join(repoRoot, 'package.json'), 'utf8'))
const entries = await fs.readdir(releaseDir, { withFileTypes: true })
const metadataFiles = entries
  .filter((entry) => entry.isFile() && /^latest.*\.ya?ml$/i.test(entry.name))
  .map((entry) => entry.name)
  .sort()

if (metadataFiles.length === 0) throw new Error(`No latest*.yml metadata found in ${releaseDir}`)

const releasePrefix = `${releaseDir}${path.sep}`
let artifactCount = 0

for (const metadataName of metadataFiles) {
  const metadataPath = path.join(releaseDir, metadataName)
  const metadata = parse(await fs.readFile(metadataPath, 'utf8'))
  if (!metadata || typeof metadata !== 'object') throw new Error(`${metadataName}: metadata is not an object`)
  if (metadata.version !== packageJson.version) {
    throw new Error(`${metadataName}: version ${metadata.version || '<missing>'} does not match package.json ${packageJson.version}`)
  }
  if (!Array.isArray(metadata.files) || metadata.files.length === 0) {
    throw new Error(`${metadataName}: files[] is empty`)
  }

  for (const artifact of metadata.files) {
    if (!artifact || typeof artifact !== 'object' || typeof artifact.url !== 'string' || !artifact.url) {
      throw new Error(`${metadataName}: every files[] entry needs a relative url`)
    }
    const relativeUrl = artifact.url.replaceAll('\\', '/')
    if (relativeUrl.startsWith('/') || relativeUrl.includes('..') || relativeUrl.includes('?') || relativeUrl.includes('#')) {
      throw new Error(`${metadataName}: unsafe artifact url ${artifact.url}`)
    }
    const artifactPath = path.resolve(releaseDir, relativeUrl)
    if (!artifactPath.startsWith(releasePrefix)) throw new Error(`${metadataName}: artifact escapes release/: ${artifact.url}`)

    const bytes = await fs.readFile(artifactPath)
    const actualSize = bytes.byteLength
    const actualSha512 = createHash('sha512').update(bytes).digest('base64')
    if (Number(artifact.size) !== actualSize) {
      throw new Error(`${metadataName}: ${artifact.url} size ${artifact.size} != ${actualSize}`)
    }
    if (artifact.sha512 !== actualSha512) {
      throw new Error(`${metadataName}: ${artifact.url} sha512 does not match`)
    }
    artifactCount += 1
  }
}

console.log(`release metadata: passed (${metadataFiles.length} metadata file(s), ${artifactCount} artifact entries)`)
